// @vitest-environment jsdom
/**
 * Saving the profile: one write, and the checks that stop a refused one.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const updateDisplayName = vi.fn(() => Promise.resolve())
vi.mock('../../src/firebase/users', () => ({ updateDisplayName }))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'me',
      realName: 'Alice Anderson',
      username: '@alice',
      bio: 'hi',
      preferredTime: 'Evening',
      interests: ['Football', 'Coffee', 'Study'],
      anonymous: false,
    },
  }),
}))
const { default: EditProfilePage } = await import('../../src/pages/EditProfilePage')

const page = () => (
  <MemoryRouter initialEntries={['/profile/edit']}>
    <Routes>
      <Route path="/profile/edit" element={<EditProfilePage />} />
      <Route path="/profile" element={<p>profile</p>} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => {
  updateDisplayName.mockClear()
})
afterEach(cleanup)

test('everything is saved in one call, name included', async () => {
  render(page())
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Runs on coffee' } })
  fireEvent.click(screen.getByText('Save profile'))
  await waitFor(() => expect(screen.getByText('profile')).toBeTruthy())
  expect(updateDisplayName).toHaveBeenCalledTimes(1)
  expect(updateDisplayName).toHaveBeenCalledWith('me', 'Alice Anderson', false, {
    username: '@alice',
    bio: 'Runs on coffee',
    preferredTime: 'Evening',
    interests: ['Football', 'Coffee', 'Study'],
  })
})

test('an empty username is refused before the round trip', async () => {
  render(page())
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: '  ' } })
  fireEvent.click(screen.getByText('Save profile'))
  expect((await screen.findByRole('alert')).textContent).toBe('Please enter a username.')
  expect(updateDisplayName).not.toHaveBeenCalled()
})

test('a refused save stays on the page and says so', async () => {
  updateDisplayName.mockRejectedValue({ code: 'permission-denied' })
  render(page())
  fireEvent.click(screen.getByText('Save profile'))
  expect((await screen.findByRole('alert')).textContent).toMatch(/Could not save/)
  expect(screen.queryByText('profile')).toBeNull()
})
