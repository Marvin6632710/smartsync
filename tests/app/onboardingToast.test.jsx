// @vitest-environment jsdom
/**
 * The toast reaches the onboarding pages.
 *
 * It lived inside the shell, which these two pages sit outside — so a
 * refused interests save was a button that simply did not advance, and a
 * failed sign-out changed nothing on screen.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

let celebration = null
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ celebration, pushCelebration: vi.fn(), offline: false }),
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    signOut: vi.fn(),
    user: {
      uid: 'me',
      interests: [],
      onboarded: false,
      privacy: { locationPermission: false, approximateLocation: true, notifications: true },
    },
  }),
}))
vi.mock('../../src/firebase/users', () => ({
  updatePublicProfile: vi.fn(),
  updatePrivateProfile: vi.fn(),
  setNotificationsEnabled: vi.fn(),
}))
vi.mock('../../src/hooks/useDeviceLocation', () => ({
  useDeviceLocation: () => ({ request: vi.fn(), clear: vi.fn(), busy: false, error: '' }),
}))

const { default: InterestSelectionPage } = await import('../../src/pages/InterestSelectionPage')
const { default: PermissionPage } = await import('../../src/pages/PermissionPage')

afterEach(cleanup)

test.each([
  ['interests', InterestSelectionPage],
  ['permissions', PermissionPage],
])('%s shows the toast when there is one, and nothing when there is not', (_name, Page) => {
  celebration = null
  // A fresh element each time: React skips a subtree handed the very same
  // element object again, which would mask the change being tested.
  const view = () => (
    <MemoryRouter>
      <Page />
    </MemoryRouter>
  )
  const { rerender } = render(view())
  expect(screen.queryByRole('status')).toBeNull()
  celebration = {
    id: 1,
    icon: 'alert',
    tone: 'warning',
    title: "Couldn't save your interests",
    body: 'Check your connection.',
  }
  rerender(view())
  expect(screen.getByRole('status').textContent).toMatch(/Couldn't save your interests/)
})
