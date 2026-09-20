// @vitest-environment jsdom
/**
 * Who gets into the console, and what it offers.
 *
 * The address is guessable, so the guard is the part worth pinning: a
 * plain user is shown the door, an admin on hold is told so, and nothing
 * behind the door is loaded for either. The rules refuse every read behind
 * it anyway; this is the courtesy, not the control.
 */
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import en from '../../../src/i18n/locales/en.json'
import { admin, directoryOf, feedRegistry, plain, settle, suspendedAdmin } from './fixtures'

const registry = feedRegistry()
let currentUser = admin
vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: currentUser }) }))
vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    pushCelebration: vi.fn(),
    offline: false,
    browserOffline: false,
    serverSilent: false,
    dataError: null,
    loading: false,
    syncing: false,
    celebration: null,
    directory: directoryOf(),
    activities: [],
    allActivities: [],
    removedActivities: [],
  }),
}))
vi.mock('../../../src/firebase/moderation', async () => {
  const { moderationMock } = await import('./fixtures')
  return moderationMock(registry)
})
const searchUsers = vi.fn(async () => [])
vi.mock('../../../src/firebase/users', () => ({
  PEER_LIMIT: 500,
  SEARCH_LIMIT: 20,
  searchUsers,
  fetchPublicProfiles: vi.fn(async () => new Map()),
}))
vi.mock('../../../src/firebase/config', () => ({ db: {}, auth: {}, usingEmulators: true }))
// The activities module names its collection at import time, against a
// database these tests do not have; the console only reads its limits.
vi.mock('../../../src/firebase/activities', () => ({ DISCOVERY_LIMIT: 400, MINE_LIMIT: 200 }))
vi.mock('../../../src/firebase/messages', () => ({ CHAT_RETENTION_DAYS: 30 }))

const AdminPanel = (await import('../../../src/console/AdminPanel')).default

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminPanel />} />
        <Route path="/home" element={<p>the app</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  registry.reset()
  currentUser = admin
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})
afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

const navLabels = () =>
  [...document.querySelectorAll('.console-nav .console-nav-item span:first-of-type')].map(
    (el) => el.textContent,
  )

describe('the door', () => {
  test('a plain user is shown the door, and nothing behind it', () => {
    currentUser = plain
    at('/admin')
    expect(screen.getByRole('alert').textContent).toContain(en.console.denied.adminsTitle)
    expect(document.querySelector('.console-nav')).toBeNull()
    expect(registry.feeds.open).toBeUndefined() // no listener was even opened
    expect(screen.getByRole('link', { name: en.console.backToApp }).getAttribute('href')).toBe(
      '/home',
    )
    cleanup()
    at('/admin/accounts')
    expect(screen.getByRole('alert').textContent).toContain(en.console.denied.adminsTitle)
    expect(screen.queryByText(en.console.accounts.title)).toBeNull()
  })

  test('a suspended admin is told their rank is on hold', () => {
    currentUser = suspendedAdmin
    at('/admin')
    expect(screen.getByRole('alert').textContent).toContain(en.console.denied.suspendedTitle)
    expect(registry.feeds.open).toBeUndefined()
  })
})

describe('what the console offers', () => {
  test('five sections, and its own identity', () => {
    at('/admin')
    act(() => settle(registry.feeds))
    expect(navLabels()).toEqual([
      en.console.nav.overview,
      en.console.nav.reports,
      en.console.nav.accounts,
      en.console.nav.activities,
      en.console.nav.history,
    ])
    expect(document.querySelector('.console').getAttribute('data-console')).toBe('admin')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.console.nav.overview)
    expect(screen.getByText(en.console.backToApp)).toBeTruthy()
    // Nothing of the rank that no longer exists.
    expect(document.body.textContent).not.toMatch(/moderator/i)
  })

  test('every listener opens once the admin is in, and the queue count sits in the sidebar', () => {
    at('/admin/reports')
    for (const name of ['open', 'resolved', 'roles', 'warnings', 'log']) {
      expect(registry.feeds[name], `${name} feed`).toBeTruthy()
    }
    act(() =>
      settle(registry.feeds, {
        open: [
          {
            id: 'r1',
            reporterId: 'carol',
            targetType: 'user',
            targetId: 'bob',
            subjectId: 'bob',
            reason: 'spam',
            status: 'open',
            createdAt: Date.now(),
          },
          {
            id: 'r2',
            reporterId: 'carol',
            targetType: 'user',
            targetId: 'bob',
            subjectId: 'bob',
            reason: 'spam',
            status: 'open',
            createdAt: Date.now(),
          },
        ],
      }),
    )
    expect(document.querySelector('.console-nav-count').textContent).toBe('2')
  })

  test('an unknown section goes to the overview', () => {
    at('/admin/nonsense')
    act(() => settle(registry.feeds))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.console.nav.overview)
  })

  test('the user strip names the rank in the app’s own words', () => {
    at('/admin')
    act(() => settle(registry.feeds))
    expect(document.querySelector('.console-user-copy small').textContent).toBe(
      en.moderation.role.admin,
    )
  })
})
