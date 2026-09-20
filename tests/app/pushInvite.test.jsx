// @vitest-environment jsdom
/**
 * The one-time offer to turn notifications on, made after a join.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let pushInvite = { title: 'Bangkok Night Gamers' }
const dismissPushInvite = vi.fn(() => {
  pushInvite = null
})
const pushCelebration = vi.fn()
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ pushInvite, dismissPushInvite, pushCelebration }),
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}))
const requestPermission = vi.fn(async () => 'granted')
const registerPushDevice = vi.fn(async () => ({ hash: 'h', refreshed: true }))
const rememberDeclined = vi.fn()
vi.mock('../../src/firebase/push', () => ({
  requestPermission,
  registerPushDevice,
  rememberDeclined,
}))

const { default: PushInvite } = await import('../../src/components/PushInvite')

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  })

beforeEach(() => {
  vi.clearAllMocks()
  pushInvite = { title: 'Bangkok Night Gamers' }
})
afterEach(cleanup)

describe('PushInvite', () => {
  test('names the activity just joined', () => {
    render(<PushInvite />)
    expect(screen.getByText('Want to know when Bangkok Night Gamers changes?')).toBeTruthy()
  })

  test('"Not now" is remembered and the offer goes away', () => {
    render(<PushInvite />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(rememberDeclined).toHaveBeenCalled()
    expect(dismissPushInvite).toHaveBeenCalled()
  })

  test('"Turn on" asks the browser, then registers this device', async () => {
    render(<PushInvite />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    await flush()
    expect(requestPermission).toHaveBeenCalled()
    expect(registerPushDevice).toHaveBeenCalledWith('me', { language: 'en' })
    expect(dismissPushInvite).toHaveBeenCalled()
    expect(pushCelebration).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Notifications on' }),
    )
  })

  test('a refusal registers nothing and says so', async () => {
    requestPermission.mockResolvedValueOnce('denied')
    render(<PushInvite />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    await flush()
    expect(registerPushDevice).not.toHaveBeenCalled()
    expect(pushCelebration).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Notifications blocked' }),
    )
  })

  test('renders nothing when there is no offer', () => {
    pushInvite = null
    const { container } = render(<PushInvite />)
    expect(container.innerHTML).toBe('')
  })
})
