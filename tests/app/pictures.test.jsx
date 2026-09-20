// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { validatePictureFile } from '../../src/utils/pictures'

const { preparePicture } = vi.hoisted(() => ({ preparePicture: vi.fn() }))
vi.mock('../../src/utils/pictures', async () => ({
  ...(await vi.importActual('../../src/utils/pictures')),
  preparePicture,
}))
let viewer = 'me'
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: viewer ? { uid: viewer } : null }),
}))
const watchers = []
const watchPicture = vi.fn((kind, id, callback, error) => {
  const stop = vi.fn()
  watchers.push({ kind, id, callback, error, stop })
  return stop
})
vi.mock('../../src/firebase/pictures', () => ({ watchPicture }))
const { default: PicturePicker } = await import('../../src/components/PicturePicker')
const { AvatarContent, ActivityPicture } = await import('../../src/components/SavedPicture')
const dataUrl = 'data:image/png;base64,aGVsbG8='
const selected = { version: 'new', dataUrl }
const changed = vi.fn()

function Picker() {
  const [picture, setPicture] = useState(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <PicturePicker
        kind="profile"
        value={picture}
        onChange={(value) => {
          changed(value)
          setPicture(value)
        }}
        onBusyChange={setBusy}
      >
        <span>Existing avatar</span>
      </PicturePicker>
      <button disabled={busy}>Save</button>
    </>
  )
}

beforeEach(() => {
  viewer = 'me'
  watchers.length = 0
  watchPicture.mockClear()
  changed.mockClear()
  preparePicture.mockReset().mockImplementation(async (file) => {
    validatePictureFile(file)
    return selected
  })
})
afterEach(cleanup)

const choose = (type = 'image/png') =>
  fireEvent.change(screen.getByLabelText('Profile picture'), {
    target: { files: [new File(['bytes'], 'picture.png', { type })] },
  })

test('selection previews locally; undo restores the original and does not write to Firebase', async () => {
  render(<Picker />)
  choose()
  expect((await screen.findByAltText('Selected picture preview')).getAttribute('src')).toBe(dataUrl)
  expect(changed).toHaveBeenCalledWith(selected)
  fireEvent.click(screen.getByText('Undo selection'))
  expect(screen.getByText('Existing avatar')).toBeTruthy()
  expect(changed).toHaveBeenLastCalledWith(null)
  expect(watchPicture).not.toHaveBeenCalled()
})

test('unsupported files show a clear error and preserve the previous selection', async () => {
  render(<Picker />)
  choose()
  await screen.findByAltText('Selected picture preview')
  choose('image/svg+xml')
  expect((await screen.findByRole('alert')).textContent).toMatch(/JPG, PNG or WebP/)
  expect(screen.getByAltText('Selected picture preview')).toBeTruthy()
  expect(changed).toHaveBeenCalledTimes(1)
})

test('saving is unavailable while a picture is being decoded', async () => {
  let resolve
  preparePicture.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  render(<Picker />)
  choose()
  expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true)
  resolve(selected)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false))
})

test('default and anonymous avatars do not fetch a photo', () => {
  const { container } = render(
    <>
      <AvatarContent person={{ uid: 'a', avatar: 'AA' }} />
      <AvatarContent person={{ uid: 'b', avatar: 'AN', pictureVersion: 'v1', anonymous: true }} />
    </>,
  )
  expect(container.textContent).toBe('AAAN')
  expect(watchPicture).not.toHaveBeenCalled()
})

test('shared avatars use one listener, replacements load the new version, and errors restore initials', async () => {
  const person = { uid: 'alice', avatar: 'AA', pictureVersion: 'v1' }
  const { container, rerender } = render(
    <>
      <AvatarContent person={person} />
      <AvatarContent person={person} />
    </>,
  )
  await waitFor(() => expect(watchers).toHaveLength(1))
  act(() => watchers[0].callback({ version: 'v1', dataUrl }))
  await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2))
  rerender(<AvatarContent person={{ ...person, pictureVersion: 'v2' }} />)
  expect(container.querySelector('img')).toBeNull()
  await waitFor(() => expect(watchers).toHaveLength(2))
  expect(watchers[0].stop).toHaveBeenCalled()
  act(() => watchers[1].callback({ version: 'v2', dataUrl }))
  await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
  fireEvent.error(container.querySelector('img'))
  expect(container.textContent).toBe('AA')
})

test('switching accounts never reuses the previous session’s picture', async () => {
  const activity = { id: 'a1', title: 'Coffee', pictureVersion: 'v1' }
  const { rerender } = render(<ActivityPicture activity={activity} />)
  await waitFor(() => expect(watchers).toHaveLength(1))
  act(() => watchers[0].callback({ version: 'v1', dataUrl }))
  await screen.findByAltText('Coffee')
  viewer = 'someone-else'
  rerender(<ActivityPicture activity={activity} />)
  expect(screen.queryByAltText('Coffee')).toBeNull()
  await waitFor(() => expect(watchers).toHaveLength(2))
  act(() => watchers[0].callback({ version: 'v1', dataUrl }))
  expect(screen.queryByAltText('Coffee')).toBeNull()
  act(() => watchers[1].error({ code: 'permission-denied' }))
  expect(screen.queryByAltText('Coffee')).toBeNull()
})
