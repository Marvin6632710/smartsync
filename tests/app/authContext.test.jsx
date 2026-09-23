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
let pendingName = null
const refreshCredential = vi.fn(() => Promise.resolve())
// The real helper's shape, without its delays: a retriable failure buys a
// refresh and another go, twice; anything else is thrown at once. The real
// one, delays included, is pinned in signUp.test.js.
const RETRIABLE = ['permission-denied', 'unauthenticated', 'unavailable', 'aborted']
const retryRefused = async (run, { delays = [0, 0] } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      if (!RETRIABLE.includes(error?.code) || attempt >= delays.length) throw error
      await refreshCredential()
    }
  }
}
vi.mock('../../src/firebase/auth', () => ({
  observeAuth: (cb) => {
    authCallback = cb
    return () => {}
  },
  currentUid: () => signedIn,
  pendingSignUpDetails: (email) =>
    email === 'u@x' ? { name: pendingName, dateOfBirth: '' } : null,
  refreshCredential,
  retryRefused,
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

let renders = 0
function Probe() {
  const { status, profileReady, profileError, retryProfile, user, serverSeen } = useAuth()
  renders += 1
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="ready">{String(profileReady)}</span>
      <span data-testid="error">{profileError?.code || ''}</span>
      <span data-testid="name">{user?.name || ''}</span>
      <span data-testid="seen">{String(serverSeen)}</span>
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
  pendingName = null
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
    expect(ensureUserProfile).toHaveBeenCalledWith('u1', {
      name: 'Uma',
      email: 'u@x',
      dateOfBirth: '',
    })
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

  test('a refusal that outlasts the retries is real and is surfaced', async () => {
    ensureUserProfile.mockRejectedValue(denied)
    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: 'Uma', email: 'u@x' }))
    await flush()
    expect(ensureUserProfile).toHaveBeenCalledTimes(3)
    expect(refreshCredential).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('error').textContent).toBe('permission-denied')
  })

  test('a failure that is not worth another try is surfaced at once', async () => {
    ensureUserProfile.mockRejectedValue({ code: 'invalid-argument' })
    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: 'Uma', email: 'u@x' }))
    await flush()
    expect(ensureUserProfile).toHaveBeenCalledTimes(1)
    expect(refreshCredential).not.toHaveBeenCalled()
    expect(screen.getByTestId('error').textContent).toBe('invalid-argument')
  })
})

describe('the name a new profile is made with', () => {
  test('is the one typed into the sign-up in progress, not the still-empty Auth record', async () => {
    pendingName = 'Typed Name'
    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: null, email: 'u@x' }))
    await flush()
    expect(ensureUserProfile).toHaveBeenCalledWith('u1', {
      name: 'Typed Name',
      email: 'u@x',
      dateOfBirth: '',
    })
  })

  test('is read afresh on every try, so a record named meanwhile is used', async () => {
    const record = { uid: 'u1', displayName: null, email: 'u@x' }
    ensureUserProfile.mockImplementationOnce(async () => {
      // The sign-up sets the display name while the first try is out.
      record.displayName = 'Named Later'
      throw denied
    })
    signedIn = 'u1'
    await act(async () => authCallback(record))
    await flush()
    expect(ensureUserProfile).toHaveBeenCalledTimes(2)
    expect(ensureUserProfile.mock.calls[0][1]).toEqual({
      name: null,
      email: 'u@x',
      dateOfBirth: '',
    })
    expect(ensureUserProfile.mock.calls[1][1]).toEqual({
      name: 'Named Later',
      email: 'u@x',
      dateOfBirth: '',
    })
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

describe('proof of a server', () => {
  // The three profile documents are the first thing asked for, so the first
  // of them answered by the server is the earliest sign there is one — which
  // is what tells a slow feed apart from a dead link (see AppContext).
  const last = (kind) => watchers[kind][watchers[kind].length - 1]
  const signIn = async () => {
    signedIn = 'u1'
    await act(async () => authCallback({ uid: 'u1', displayName: 'Uma', email: 'u@x' }))
  }

  test('cached answers are not proof; the first server answer from any of the three is', async () => {
    await signIn()
    act(() => last('pub').cb({ uid: 'u1', name: 'Uma' }, { fromCache: true }))
    act(() => last('priv').cb({ realName: 'Uma' }, { fromCache: true }))
    expect(screen.getByTestId('seen').textContent).toBe('false')
    act(() =>
      last('role').cb({ role: 'user', suspended: false, banned: false }, { fromCache: false }),
    )
    expect(screen.getByTestId('seen').textContent).toBe('true')
  })

  test('a listener that says nothing about its origin proves nothing', async () => {
    await signIn()
    arrive()
    expect(screen.getByTestId('seen').textContent).toBe('false')
  })

  test('a snapshot that changed only its origin does not re-render the app', async () => {
    await signIn()
    const profile = { uid: 'u1', name: 'Uma', notificationsEnabled: true }
    act(() => last('pub').cb(profile, { fromCache: true }))
    act(() => last('priv').cb({ realName: 'Uma', onboarded: true }, { fromCache: false }))
    act(() =>
      last('role').cb({ role: 'user', suspended: false, banned: false }, { fromCache: false }),
    )
    const before = renders
    // The same document again, now from the server: nothing to re-render.
    act(() => last('pub').cb({ ...profile }, { fromCache: false }))
    expect(renders).toBe(before)
    // A changed document still gets through.
    act(() => last('pub').cb({ ...profile, bio: 'new' }, { fromCache: false }))
    expect(renders).toBeGreaterThan(before)
  })

  test('the proof belongs to the session and is dropped on sign-out', async () => {
    await signIn()
    act(() => last('pub').cb({ uid: 'u1', name: 'Uma' }, { fromCache: false }))
    expect(screen.getByTestId('seen').textContent).toBe('true')
    signedIn = null
    await act(async () => authCallback(null))
    expect(screen.getByTestId('seen').textContent).toBe('false')
  })
})
