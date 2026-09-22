// @vitest-environment jsdom
/**
 * The console in each of the four languages, and in each appearance.
 *
 * Every word on the desk comes from the same locale files as the app, so
 * an admin who reads Thai works a Thai queue — the sidebar, the filters,
 * the badges and the dialogs included. The theme is the app's own: the
 * switch in the console's top strip stamps the document the same way the
 * Settings page does.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import i18n from '../../../src/i18n'
import my from '../../../src/i18n/locales/my.json'
import th from '../../../src/i18n/locales/th.json'
import zh from '../../../src/i18n/locales/zh.json'
import { admin, directoryOf, feedRegistry, report, settle } from './fixtures'

const registry = feedRegistry()
vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: admin }) }))
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
vi.mock('../../../src/firebase/users', () => ({
  PEER_LIMIT: 500,
  SEARCH_LIMIT: 20,
  searchUsers: vi.fn(async () => []),
  fetchPublicProfiles: vi.fn(async () => new Map()),
}))
vi.mock('../../../src/firebase/config', () => ({ db: {}, auth: {}, usingEmulators: true }))
vi.mock('../../../src/firebase/activities', () => ({ DISCOVERY_LIMIT: 400, MINE_LIMIT: 200 }))
vi.mock('../../../src/firebase/messages', () => ({ CHAT_RETENTION_DAYS: 30 }))

let AdminPanel
let theme
beforeAll(async () => {
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  theme = await import('../../../src/theme')
  AdminPanel = (await import('../../../src/console/AdminPanel')).default
})

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminPanel />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  registry.reset()
  localStorage.clear()
  theme.setThemePreference('system')
})
afterEach(async () => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  await i18n.changeLanguage('en')
})

describe.each([
  ['th', th],
  ['my', my],
  ['zh', zh],
])('in %s', (code, locale) => {
  test('the console reads in the language, down to the badges', async () => {
    await i18n.changeLanguage(code)
    at('/admin/reports/r1')
    act(() =>
      settle(registry.feeds, {
        open: [report('r1', { claimedBy: 'carol', claimedAt: Date.now() })],
      }),
    )
    expect(document.documentElement.lang).toBe(code)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(locale.console.nav.reports)
    const nav = [
      ...document.querySelectorAll('.console-nav .console-nav-item span:first-of-type'),
    ].map((el) => el.textContent)
    expect(nav).toEqual([
      locale.console.nav.overview,
      locale.console.nav.reports,
      locale.console.nav.blocks,
      locale.console.nav.accounts,
      locale.console.nav.activities,
      locale.console.nav.history,
    ])
    // Filters, a badge, and the panel's sections.
    expect(screen.getByLabelText(locale.console.reports.columns.status)).toBeTruthy()
    expect(
      screen.getAllByText(locale.console.status.heldBy.replace('{{name}}', 'Carol')).length,
    ).toBeGreaterThan(0)
    const panel = within(document.querySelector('.con-detail'))
    expect(panel.getByText(locale.console.reports.evidence)).toBeTruthy()
    expect(panel.getByText(locale.moderation.suspendAccount)).toBeTruthy()
    expect(panel.getByText(locale.moderation.dismiss)).toBeTruthy()
  })

  test('the overview and the account panel too', async () => {
    await i18n.changeLanguage(code)
    at('/admin')
    act(() => settle(registry.feeds))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(locale.console.nav.overview)
    expect(screen.getByText(locale.console.overview.platform)).toBeTruthy()
    expect(screen.getByText(locale.console.overview.queue)).toBeTruthy()
    cleanup()
    at('/admin/accounts/bob')
    act(() => settle(registry.feeds))
    const panel = within(document.querySelector('.con-detail'))
    expect(panel.getByText(locale.moderation.people.warn)).toBeTruthy()
    expect(panel.getByText(locale.moderation.people.closeAccount)).toBeTruthy()
  })
})

describe('the appearance', () => {
  test('is chosen from the console’s own strip and stamped at once', () => {
    at('/admin')
    act(() => settle(registry.feeds))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(theme.THEME_KEY)).toBe('dark')
    fireEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(theme.THEME_KEY)).toBe('system')
  })

  test('the language is changed from the same strip', () => {
    at('/admin')
    act(() => settle(registry.feeds))
    fireEvent.change(document.querySelector('.language-menu select'), {
      target: { value: 'zh' },
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(zh.console.nav.overview)
  })
})
