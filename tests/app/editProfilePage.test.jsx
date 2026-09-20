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
// The page reads whether the app is offline, and has a toast for a save
// that lands late; both are the app context's.
let offline = false
const pushCelebration = vi.fn()
const keepUnsent = vi.fn(() => 'k1')
const settleUnsent = vi.fn()
const failUnsent = vi.fn()
const discardUnsent = vi.fn()
let unsent = []
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    offline,
    pushCelebration,
    unsent,
    keepUnsent,
    settleUnsent,
    failUnsent,
    discardUnsent,
  }),
}))
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

const selectedPicture = { version: 'selected-v1', dataUrl: 'data:image/png;base64,aGVsbG8=' }
vi.mock('../../src/utils/pictures', async () => ({
  ...(await vi.importActual('../../src/utils/pictures')),
  preparePicture: vi.fn(async () => selectedPicture),
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
  offline = false
  updateDisplayName.mockReset()
  updateDisplayName.mockImplementation(() => Promise.resolve())
  pushCelebration.mockClear()
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

test('saved offline, the edit is kept with what the form was seeded with', async () => {
  offline = true
  updateDisplayName.mockReturnValue(new Promise(() => {}))
  render(page())
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Runs on coffee' } })
  fireEvent.click(screen.getByText('Save profile'))
  await waitFor(() => expect(screen.getByText('profile')).toBeTruthy())
  expect(keepUnsent).toHaveBeenCalledWith({
    kind: 'profile',
    key: 'me',
    payload: {
      name: 'Alice Anderson',
      username: '@alice',
      bio: 'Runs on coffee',
      preferredTime: 'Evening',
      interests: ['Football', 'Coffee', 'Study'],
    },
    // The judged fields as they were, so a reload can tell a refusal from
    // an edit made on another device meanwhile.
    before: {
      username: '@alice',
      bio: 'hi',
      preferredTime: 'Evening',
      interests: ['Football', 'Coffee', 'Study'],
    },
  })
  expect(pushCelebration).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Profile saved — will sync' }),
  )
})

test('a selected profile picture is saved with the form; a failure preserves its preview for retry', async () => {
  updateDisplayName.mockRejectedValueOnce({ code: 'permission-denied' })
  render(page())
  fireEvent.change(screen.getByLabelText('Profile picture'), {
    target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] },
  })
  await screen.findByAltText('Selected picture preview')
  fireEvent.click(screen.getByText('Save profile'))
  expect((await screen.findByRole('alert')).textContent).toMatch(/Could not save the picture/)
  expect(screen.getByAltText('Selected picture preview')).toBeTruthy()
  expect(updateDisplayName.mock.calls[0][3].picture).toEqual(selectedPicture)
  fireEvent.click(screen.getByText('Save profile'))
  await screen.findByText('profile')
})
