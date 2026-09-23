// @vitest-environment jsdom
/**
 * The console from the app's side: the old moderation addresses redirect
 * into it, Settings and the web header offer the door to the admin and to
 * nobody else, and a plain user who types the address is shown the closed
 * door through the real routing.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import en from '../../src/i18n/locales/en.json'
import { TERMS_KEY, TERMS_VERSION } from '../../src/terms'

const member = {
  uid: 'me',
  name: 'Uma',
  avatar: 'UM',
  email: 'uma@example.com',
  // Old enough, and answered — otherwise every one of these renders the
  // age gate instead of the screen under test (App.jsx puts it above
  // onboarding on purpose).
  dateOfBirth: '1996-05-04',
  onboarded: true,
  banned: false,
  role: 'user',
  suspended: false,
  isAdmin: false,
}
let user = member
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    status: 'ready',
    user,
    profileReady: true,
    profileError: null,
    retryProfile: vi.fn(),
    signOut: vi.fn(),
  }),
}))
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    notifications: [],
    celebration: null,
    dataError: null,
    offline: false,
    browserOffline: false,
    serverSilent: false,
    loading: false,
    syncing: false,
    pushInvite: null,
    dismissPushInvite: () => {},
    pushCelebration: () => {},
    directory: new Map([['me', member]]),
    activities: [],
    allActivities: [],
    removedActivities: [],
  }),
}))
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: {}, usingEmulators: true }))
vi.mock('firebase/firestore', async (importActual) => ({
  ...(await importActual()),
  collection: () => ({}),
}))
const noop = () => () => {}
vi.mock('../../src/firebase/moderation', () => ({
  REPORT_PAGE: 100,
  RESOLVED_PAGE: 200,
  LOG_PAGE: 300,
  WARNING_PAGE: 200,
  CLAIM_TTL_MS: 300_000,
  REPORT_REASONS: [],
  watchOpenReports: noop,
  watchResolvedReports: noop,
  watchRoles: noop,
  watchWarnings: noop,
  // Settings watches your own record too.
  watchMyWarnings: noop,
  watchModerationLog: noop,
  watchModerationBlocks: noop,
  BLOCKS_PAGE: 100,
  fetchCounts: async () => ({}),
}))
vi.mock('../../src/firebase/users', () => ({
  PEER_LIMIT: 500,
  SEARCH_LIMIT: 20,
  searchUsers: async () => [],
  fetchPublicProfiles: async () => new Map(),
}))
vi.mock('../../src/components/CelebrationToast', () => ({ default: () => null }))
vi.mock('../../src/components/JoinBurst', () => ({ default: () => null }))
vi.mock('../../src/components/PushInvite', () => ({ default: () => null }))

globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

let App
beforeAll(async () => {
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  App = (await import('../../src/App')).default
})
beforeEach(() => {
  localStorage.setItem(TERMS_KEY, TERMS_VERSION)
  user = member
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

const mount = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('the console from the app', () => {
  test('a plain user typing the address is shown the closed door, by the real routing', async () => {
    mount('/admin/reports')
    expect(await screen.findByText(en.console.denied.adminsTitle)).toBeTruthy()
  })

  test('the retired moderation console address is nothing', async () => {
    user = { ...member, role: 'admin', isAdmin: true }
    mount('/mod')
    expect(await screen.findByText(en.errors.pageNotFound)).toBeTruthy()
  })

  test('the old moderation addresses go where the screens went', async () => {
    user = { ...member, role: 'admin', isAdmin: true }
    mount('/moderation')
    expect((await screen.findAllByRole('heading', { level: 1 }))[0].textContent).toBe(
      en.console.nav.overview,
    )
    cleanup()
    mount('/moderation/people')
    expect((await screen.findAllByRole('heading', { level: 1 }))[0].textContent).toBe(
      en.console.nav.accounts,
    )
    cleanup()
    mount('/moderation/moderators')
    expect((await screen.findAllByRole('heading', { level: 1 }))[0].textContent).toBe(
      en.console.nav.overview,
    )
    cleanup()
    mount('/moderation/removed')
    expect((await screen.findAllByRole('heading', { level: 1 }))[0].textContent).toBe(
      en.console.nav.activities,
    )
  })

  test('Settings offers the admin one door; a plain user, and a legacy moderator row, none', () => {
    mount('/settings')
    expect(screen.queryByText(en.settings.adminConsole)).toBeNull()
    cleanup()
    user = { ...member, role: 'moderator' }
    mount('/settings')
    expect(screen.queryByText(en.settings.adminConsole)).toBeNull()
    cleanup()
    user = { ...member, role: 'admin', isAdmin: true }
    mount('/settings')
    expect(screen.getByText(en.settings.adminConsole)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/moderat/i)
  })

  test('the web header carries the door only for the admin', () => {
    mount('/settings')
    expect(screen.queryByRole('button', { name: en.shell.console })).toBeNull()
    cleanup()
    user = { ...member, role: 'admin', isAdmin: true }
    mount('/settings')
    expect(screen.getByRole('button', { name: en.shell.console })).toBeTruthy()
  })
})
