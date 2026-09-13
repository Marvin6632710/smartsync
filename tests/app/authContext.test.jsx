// @vitest-environment jsdom
/**
 * Identity: how a session becomes a user, and how it recovers when the first
 * read after signing in is refused.
 *
 * The refusal is real and timing-dependent: the first request after a
 * sign-up, or after signing out and straight back in on the same page, can
 * leave on a stream still carrying the credential that was just revoked. The
 * listeners recover from that with a fresh token; the one-shot profile read
 * did not, and "Try again" re-ran only that read, leaving dead listeners and
 * a spinner that never ended. Everything under the provider is faked.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let authCallback = null
let signedIn = null
const refreshCredential = vi.fn(() => Promise.resolve())
vi.mock('../../src/firebase/auth', () => ({
  observeAuth: (cb) => {
    authCallback = cb
    return () => {}
  },
  currentUid: () => signedIn,
  refreshCredential,
  signIn: vi.fn(),
  signOutUser: vi.fn(),
  signUp: vi.fn(),
}))

const ensureUserProfile = vi.fn(() => Promise.resolve())
const watchers = { pub: [], priv: [], role: [] }
const watch = (kind) => (uid, cb, onError) => {
  watchers[kind].push({ uid, cb, onError })
  return () => {}
}
vi.mock('../../src/firebase/users', () => ({
  defaultPrivacy: { anonymousMode: false, locationPermission: false, approximateLocation: true },
  ensureUserProfile,
  watchUserProfile: (uid, cb, onError) => watch('pub')(uid, cb, onError),
  watchPrivateProfile: (uid, cb, onError) => watch('priv')(uid, cb, onError),
}))
vi.mock('../../src/firebase/moderation', () => ({
  watchRole: (uid, cb, onError) => watch('role')(uid, cb, onError),
}))

const { AuthProvider, useAuth } = await import('../../src/context/AuthContext')

function Probe() {
  const { status, profileReady, profileError, retryProfile, user } = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="ready">{String(profileReady)}</span>
      <span data-testid="error">{profileError?.code || ''}</span>
      <span data-testid="name">{user?.name || ''}</span>
      <button onClick={retryProfile}>retry</button>
    </div>
  )
}

const denied = { code: 'permission-denied' }
const flush = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
const arrive = () => {
  const last = (kind) => watchers[kind][watchers[kind].length - 1]
  act(() => {
    last('pub').cb({ uid: 'u1', name: 'Uma', notificationsEnabled: true })
    last('priv').cb({ realName: 'Uma', onboarded: true })
    last('role').cb({ role: 'user', suspended: false, banned: false })
  })
}

beforeEach(() => {
  authCallback = null
  signedIn = null
  refreshCredential.mockClear()
  ensureUserProfile.mockReset()
  ensureUserProfile.mockResolvedValue(undefined)
  for (const k of Object.keys(watchers)) watchers[k].length = 0
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
})
afterEach(cleanup)

describe('becoming a user', () => {
  test('loading, then signed out, then ready once all three documents have reported', async () => {
    expect(screen.getByTestId('status').textContent).toBe('loading')
    await act(async () => authCallback(null))
    expect(screen.getByTestId('status').textContent).toBe('signed-out')

    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: 'Uma', email: 'u@x' }))
    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(screen.getByTestId('ready').textContent).toBe('false')
    expect(ensureUserProfile).toHaveBeenCalledWith('u1', { name: 'Uma', email: 'u@x' })
    arrive()
    expect(screen.getByTestId('ready').textContent).toBe('true')
    expect(screen.getByTestId('name').textContent).toBe('Uma')
  })
})

describe('the first read after signing in is refused', () => {
  test('one refusal buys a fresh token and one more try, and nothing is shown', async () => {
    ensureUserProfile.mockRejectedValueOnce(denied).mockResolvedValueOnce(undefined)
    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: 'Uma', email: 'u@x' }))
    await flush()
    expect(refreshCredential).toHaveBeenCalledTimes(1)
    expect(ensureUserProfile).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  test('a second refusal is real and is surfaced', async () => {
    ensureUserProfile.mockRejectedValue(denied)
    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: 'Uma', email: 'u@x' }))
    await flush()
    expect(ensureUserProfile).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('error').textContent).toBe('permission-denied')
  })

  test('a failure that is not a refusal is surfaced at once', async () => {
    ensureUserProfile.mockRejectedValue({ code: 'unavailable' })
    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: 'Uma', email: 'u@x' }))
    await flush()
    expect(ensureUserProfile).toHaveBeenCalledTimes(1)
    expect(refreshCredential).not.toHaveBeenCalled()
    expect(screen.getByTestId('error').textContent).toBe('unavailable')
  })
})

describe('Try again', () => {
  test('remakes the listeners with a fresh token, not only the profile write', async () => {
    ensureUserProfile.mockRejectedValue(denied)
    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: 'Uma', email: 'u@x' }))
    await flush()
    expect(screen.getByTestId('error').textContent).toBe('permission-denied')
    const before = watchers.pub.length

    ensureUserProfile.mockResolvedValue(undefined)
    refreshCredential.mockClear()
    fireEvent.click(screen.getByText('retry'))
    await flush()

    expect(refreshCredential).toHaveBeenCalled()
    expect(watchers.pub.length).toBe(before + 1)
    expect(watchers.priv.length).toBe(before + 1)
    expect(watchers.role.length).toBe(before + 1)
    expect(screen.getByTestId('error').textContent).toBe('')
    // And the fresh listeners are the ones that make the profile ready.
    arrive()
    expect(screen.getByTestId('ready').textContent).toBe('true')
  })
})

describe('switching accounts', () => {
  test('the previous account’s error and listeners do not follow the next one', async () => {
    ensureUserProfile.mockRejectedValue(denied)
    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: 'Uma', email: 'u@x' }))
    await flush()
    expect(screen.getByTestId('error').textContent).toBe('permission-denied')

    ensureUserProfile.mockResolvedValue(undefined)
    await act(async () => authCallback(null))
    expect(screen.getByTestId('error').textContent).toBe('')
    signedIn = 'u2'
    await act(async () => authCallback({ uid: 'u2', displayName: 'Vic', email: 'v@x' }))
    await flush()
    expect(screen.getByTestId('error').textContent).toBe('')
    expect(watchers.pub[watchers.pub.length - 1].uid).toBe('u2')
    // A late refusal from u1's listener is ignored: it belongs to a session
    // that has ended.
    act(() => watchers.pub[0].onError(denied))
    expect(screen.getByTestId('error').textContent).toBe('')
  })
})
