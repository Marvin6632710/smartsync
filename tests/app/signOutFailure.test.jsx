// @vitest-environment jsdom
/**
 * A sign-out that fails leaves the person signed in; it used to be an
 * unhandled rejection and a screen that did not change.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const pushCelebration = vi.fn()
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ pushCelebration, celebration: null, offline: false }),
}))
const signOut = vi.fn()
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    signOut,
    user: {
      uid: 'me',
      email: 'me@x.y',
            privacy: { notifications: true },
    },
  }),
}))
vi.mock('../../src/firebase/users', () => ({ setNotificationsEnabled: vi.fn() }))

const { default: SettingsPage } = await import('../../src/pages/SettingsPage')
const { default: SignOutLink } = await import('../../src/components/SignOutLink')

const flush = () =>
  act(async () => {
    for (let i = 0; i < 3; i += 1) await Promise.resolve()
  })

beforeEach(() => {
  pushCelebration.mockClear()
  signOut.mockReset()
})
afterEach(cleanup)

test('Settings: a failed sign-out is said', async () => {
  signOut.mockRejectedValue(new Error('network'))
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Sign out'))
  fireEvent.click(screen.getAllByText('Sign out').at(-1))
  await flush()
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(pushCelebration.mock.calls[0][0].title).toBe("Couldn't sign out")
})

test('Settings: a sign-out that works says nothing', async () => {
  signOut.mockResolvedValue(undefined)
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Sign out'))
  fireEvent.click(screen.getAllByText('Sign out').at(-1))
  await flush()
  expect(pushCelebration).not.toHaveBeenCalled()
})

test('the onboarding sign-out link goes through the same door', async () => {
  signOut.mockRejectedValue(new Error('network'))
  render(<SignOutLink />)
  fireEvent.click(screen.getByText('Not you? Sign out'))
  fireEvent.click(screen.getAllByText('Sign out').at(-1))
  await flush()
  expect(pushCelebration.mock.calls[0][0].title).toBe("Couldn't sign out")
})
