// @vitest-environment jsdom
/**
 * `/n/{id}` — where a tap on a browser notification, or on the in-app
 * toast, lands: the record is marked read the way the inbox marks one
 * read, and the person is sent on to what it was about.
 */
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let notifications = []
const markNotificationRead = vi.fn(() => Promise.resolve())
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ notifications, markNotificationRead }),
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}))
let stored = null
vi.mock('firebase/firestore', () => ({
  doc: (db, ...segments) => ({ path: segments.join('/') }),
  getDoc: vi.fn(async () => ({ exists: () => Boolean(stored), id: 'n9', data: () => stored })),
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))

const { default: NotificationOpenPage } = await import('../../src/pages/NotificationOpenPage')

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  })

const mount = (id) =>
  render(
    <MemoryRouter initialEntries={[`/n/${id}`]}>
      <Routes>
        <Route path="/n/:id" element={<NotificationOpenPage />} />
        <Route path="/activity/:id/chat" element={<p>chat page</p>} />
        <Route path="/activity/:id" element={<p>activity page</p>} />
        <Route path="/notifications" element={<p>inbox page</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  notifications = []
  stored = null
})
afterEach(cleanup)

describe('opening a notification', () => {
  test('a message goes to the thread, and is marked read', async () => {
    notifications = [{ id: 'n1', type: 'chat', activityId: 'act1', read: false }]
    mount('n1')
    await flush()
    expect(markNotificationRead).toHaveBeenCalledWith('n1')
    expect(screen.getByText('chat page')).toBeTruthy()
  })

  test('anything about an activity goes to the activity', async () => {
    notifications = [{ id: 'n2', type: 'activity', activityId: 'act2', read: true }]
    mount('n2')
    await flush()
    // Already read: not written again.
    expect(markNotificationRead).not.toHaveBeenCalled()
    expect(screen.getByText('activity page')).toBeTruthy()
  })

  test('a record the inbox no longer holds is fetched', async () => {
    stored = { type: 'moderation', activityId: null, read: false }
    mount('n9')
    await flush()
    expect(markNotificationRead).toHaveBeenCalledWith('n9')
    expect(screen.getByText('inbox page')).toBeTruthy()
  })

  test('an unknown id lands in the inbox rather than nowhere', async () => {
    mount('gone')
    await flush()
    expect(markNotificationRead).not.toHaveBeenCalled()
    expect(screen.getByText('inbox page')).toBeTruthy()
  })
})
