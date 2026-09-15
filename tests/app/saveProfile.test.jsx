// @vitest-environment jsdom
/**
 * The settings screens' save wrapper, and two switches that use it.
 *
 * Offline, a profile write is applied locally and queued — the switch is
 * already showing the new state — so waiting on "Saving…" for a server that
 * is not there helped nobody. And the approximate-location switch promised
 * "never your exact position" while the exact one it already held stayed
 * stored until the next request.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let offline = false
const pushCelebration = vi.fn()
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ offline, pushCelebration, celebration: null }),
}))
let user = {
  uid: 'me',
  anonymous: false,
  realName: 'Alice',
  location: { lat: 13.7563, lng: 100.5018 },
  privacy: { approximateLocation: false, locationPermission: true, notifications: true },
}
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user, signOut: vi.fn() }),
}))
const updatePrivateProfile = vi.fn(() => Promise.resolve())
const setAnonymousMode = vi.fn(() => Promise.resolve())
vi.mock('../../src/firebase/users', () => ({
  updatePrivateProfile,
  setAnonymousMode,
  setNotificationsEnabled: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../src/hooks/useDeviceLocation', () => ({
  useDeviceLocation: () => ({ request: vi.fn(), clear: vi.fn(), busy: false, error: '' }),
}))

const { useSaveProfile } = await import('../../src/hooks/useSaveProfile')
const { default: PrivacyPage } = await import('../../src/pages/PrivacyPage')

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  })

beforeEach(() => {
  offline = false
  pushCelebration.mockClear()
  updatePrivateProfile.mockReset()
  updatePrivateProfile.mockImplementation(() => Promise.resolve())
  user = {
    ...user,
    location: { lat: 13.7563, lng: 100.5018 },
    privacy: { approximateLocation: false, locationPermission: true, notifications: true },
  }
})
afterEach(cleanup)

describe('useSaveProfile', () => {
  function Probe({ action }) {
    const { save, saving } = useSaveProfile()
    const [result, setResult] = React.useState('')
    return (
      <div>
        <button onClick={async () => setResult(String(await save(action)))}>save</button>
        <span data-testid="saving">{String(saving)}</span>
        <span data-testid="result">{result}</span>
      </div>
    )
  }

  test('a write that lands resolves true with nothing to say', async () => {
    render(<Probe action={() => Promise.resolve()} />)
    fireEvent.click(screen.getByText('save'))
    await flush()
    expect(screen.getByTestId('result').textContent).toBe('true')
    expect(screen.getByTestId('saving').textContent).toBe('false')
    expect(pushCelebration).not.toHaveBeenCalled()
  })

  test('a refused write resolves false and says so', async () => {
    render(<Probe action={() => Promise.reject({ code: 'permission-denied' })} />)
    fireEvent.click(screen.getByText('save'))
    await flush()
    expect(screen.getByTestId('result').textContent).toBe('false')
    expect(pushCelebration.mock.calls[0][0]).toMatchObject({
      title: "Couldn't save that",
      body: 'You do not have permission.',
    })
  })

  test('offline, a write that cannot be acknowledged resolves true at once and says it will sync', async () => {
    offline = true
    let reject
    render(<Probe action={() => new Promise((_, r) => (reject = r))} />)
    fireEvent.click(screen.getByText('save'))
    await flush()
    expect(screen.getByTestId('result').textContent).toBe('true')
    expect(screen.getByTestId('saving').textContent).toBe('false')
    expect(pushCelebration.mock.calls.at(-1)[0].title).toBe('Saved — will sync')
    // A refusal that arrives later is still said.
    await act(async () => {
      reject({ code: 'permission-denied' })
      await flush()
    })
    expect(pushCelebration.mock.calls.at(-1)[0].title).toBe("Couldn't save that")
  })
})

describe('the approximate-location switch', () => {
  const page = () => (
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>
  )

  test('turning it on rounds the position already on file, in the same write', async () => {
    render(page())
    fireEvent.click(screen.getByText('Approximate location').closest('button'))
    await flush()
    expect(updatePrivateProfile).toHaveBeenCalledWith('me', {
      privacy: { approximateLocation: true },
      location: { lat: 13.76, lng: 100.5 },
    })
  })

  test('turning it off changes only the setting — a rounded value cannot be sharpened', async () => {
    user = { ...user, privacy: { ...user.privacy, approximateLocation: true } }
    render(page())
    fireEvent.click(screen.getByText('Approximate location').closest('button'))
    await flush()
    expect(updatePrivateProfile).toHaveBeenCalledWith('me', {
      privacy: { approximateLocation: false },
    })
  })

  test('with no position on file, turning it on changes only the setting', async () => {
    user = { ...user, location: null }
    render(page())
    fireEvent.click(screen.getByText('Approximate location').closest('button'))
    await flush()
    expect(updatePrivateProfile).toHaveBeenCalledWith('me', {
      privacy: { approximateLocation: true },
    })
  })
})
