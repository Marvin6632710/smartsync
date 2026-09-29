// @vitest-environment jsdom
/**
 * The console's other pages: the overview counted on the server, the
 * activities with a restore that needs a reason, and the history of what
 * was done.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import en from '../../../src/i18n/locales/en.json'
import { admin, feedRegistry, person, report, settle } from './fixtures'

const registry = feedRegistry()
let currentUser = admin
vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: currentUser }) }))
const pushCelebration = vi.fn()
const directory = new Map([
  person('me', 'Admin'),
  person('bob', 'Bob'),
  person('mia', 'Mia'),
  person('ned', 'Ned'),
])
const activities = [
  {
    id: 'a1',
    title: 'Taken down thing',
    category: 'Football',
    hostId: 'bob',
    hostName: 'Bob',
    locationName: 'Somewhere',
    date: '2030-01-01',
    time: '19:00',
    capacity: 8,
    participantUids: ['bob'],
    status: 'removed',
    startsAt: Date.now() + 86_400_000,
    updatedAt: Date.now(),
    moderation: { by: 'me', reason: 'Broke the rules' },
  },
  {
    id: 'a2',
    title: 'Live thing',
    category: 'Coffee',
    hostId: 'bob',
    hostName: 'Bob',
    locationName: 'Café',
    date: '2030-01-02',
    time: '10:00',
    capacity: 4,
    participantUids: ['bob'],
    status: 'active',
    startsAt: Date.now() + 2 * 86_400_000,
  },
]
let app
vi.mock('../../../src/context/AppContext', () => ({ useApp: () => app }))
let mod
vi.mock('../../../src/firebase/moderation', async () => {
  const { moderationMock } = await import('./fixtures')
  mod = moderationMock(registry)
  return mod
})
const searchUsers = vi.fn(async () => [])
vi.mock('../../../src/firebase/users', () => ({
  PEER_LIMIT: 500,
  SEARCH_LIMIT: 20,
  searchUsers,
  fetchPublicProfiles: vi.fn(async () => new Map()),
}))
vi.mock('../../../src/firebase/config', () => ({ db: {}, auth: {}, usingEmulators: true }))
vi.mock('../../../src/firebase/activities', () => ({ DISCOVERY_LIMIT: 400, MINE_LIMIT: 200 }))
vi.mock('../../../src/firebase/messages', () => ({ CHAT_RETENTION_DAYS: 30 }))

const AdminPanel = (await import('../../../src/console/AdminPanel')).default

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminPanel />} />
        <Route path="/activity/:id" element={<p>the activity page</p>} />
      </Routes>
    </MemoryRouter>,
  )
const panel = () => within(document.querySelector('.con-detail'))
const lastToast = () => pushCelebration.mock.calls.at(-1)[0]

beforeEach(() => {
  registry.reset()
  currentUser = admin
  pushCelebration.mockClear()
  app = {
    pushCelebration,
    offline: false,
    browserOffline: false,
    serverSilent: false,
    dataError: null,
    loading: false,
    syncing: false,
    celebration: null,
    directory,
    activities: activities.filter((a) => a.status === 'active'),
    allActivities: activities,
    removedActivities: activities.filter((a) => a.status === 'removed'),
  }
  for (const fn of Object.values(mod)) if (typeof fn?.mockClear === 'function') fn.mockClear()
  mod.restoreActivity.mockResolvedValue(undefined)
  mod.fetchActivityHistory.mockResolvedValue({ log: [], reports: [] })
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

describe('the overview', () => {
  test('shows the server’s counts, labelled as counted, and the live queue', async () => {
    at('/admin')
    act(() =>
      settle(registry.feeds, {
        open: [report('r1'), report('r2', { claimedBy: 'mia', claimedAt: Date.now() })],
        roles: [
          { uid: 'mia', role: 'admin', suspended: false },
          { uid: 'ned', role: 'user', suspended: true },
        ],
      }),
    )
    expect(mod.fetchCounts).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('1,234')).toBeTruthy() // accounts, counted
    expect(screen.getByText('40')).toBeTruthy() // upcoming
    expect(screen.getByText(en.console.overview.counted)).toBeTruthy()
    // Live figures from the listeners.
    // Labels that are also nav items: pick the stat tile's own.
    const stat = (label) =>
      screen
        .getAllByText(label)
        .find((el) => el.classList.contains('con-stat-label'))
        .closest('.con-stat')
    expect(stat(en.console.overview.open).textContent).toContain('2')
    expect(stat(en.console.overview.inReview).textContent).toContain('1')
    expect(stat(en.console.overview.admins).textContent).toContain('1')
    expect(stat(en.console.overview.suspended).textContent).toContain('1')
    // No "active users": nothing in the data supports one, and no median
    // or moderator tally: fewer figures, each one plain.
    expect(screen.queryByText(/active users|median|moderator/i)).toBeNull()
    expect(document.querySelectorAll('.con-stat')).toHaveLength(12)
  })

  test('a figure that could not be counted shows as unknown, not zero', async () => {
    mod.fetchCounts.mockResolvedValueOnce({ accounts: null, countedAt: Date.now() })
    at('/admin')
    act(() => settle(registry.feeds))
    await waitFor(() =>
      expect(
        screen
          .getAllByText(en.console.overview.accounts)
          .find((el) => el.classList.contains('con-stat-label'))
          .closest('.con-stat').textContent,
      ).toContain('—'),
    )
  })
})

describe('the overview’s charts', () => {
  const DAY = 86_400_000
  const logRow = (id, at) => ({ id, at, kind: 'suspend', by: 'me', subjectId: 'bob' })
  /** The legend entry for a segment, as the reader sees it. */
  const key = (label) =>
    screen
      .getAllByText(label)
      .map((el) => el.closest('.con-split-keys li'))
      .find(Boolean)

  test('the split bars carry the server’s counts, with a value beside every name', async () => {
    at('/admin')
    act(() => settle(registry.feeds))
    // Three segments each, from reportsOpen/Actioned/Dismissed and the
    // activity statuses — the same numbers as the tiles, as proportions.
    await waitFor(() => expect(document.querySelectorAll('.con-split-bar')).toHaveLength(2))
    expect(key(en.console.status.actioned).textContent).toContain('10')
    expect(key(en.console.status.dismissed).textContent).toContain('5')
    expect(key(en.console.activityStatus.cancelled).textContent).toContain('17')
    // Colour ranks the segments; it never has to identify them.
    expect(document.querySelectorAll('.con-split-keys li').length).toBeGreaterThanOrEqual(6)
  })

  test('a part that could not be counted makes the whole bar unknown, not partial', async () => {
    // A bar drawn from two of three numbers is a bar that lies about the third.
    mod.fetchCounts.mockResolvedValueOnce({
      accounts: 5,
      reportsOpen: 2,
      reportsActioned: null,
      reportsDismissed: 1,
      activitiesActive: 1,
      activitiesCancelled: 0,
      activitiesRemoved: 0,
      countedAt: Date.now(),
    })
    at('/admin')
    act(() => settle(registry.feeds))
    // The activities bar still draws; the reports one refuses to.
    await waitFor(() => expect(document.querySelectorAll('.con-split-bar')).toHaveLength(1))
    expect(screen.getByText(en.console.charts.notCounted)).toBeTruthy()
  })

  test('reasons are ranked, and a reason nobody chose still gets its row', async () => {
    at('/admin')
    act(() =>
      settle(registry.feeds, {
        open: [report('r1', { reason: 'spam' }), report('r2', { reason: 'spam' })],
        resolved: [report('r3', { reason: 'harassment', status: 'actioned' })],
      }),
    )
    await waitFor(() => expect(document.querySelectorAll('.con-bar-row').length).toBe(3))
    const rows = [...document.querySelectorAll('.con-bar-row')].map(
      (r) => r.querySelector('.con-bar-name').textContent,
    )
    // Spam has two, harassment one, safety none — biggest first, and the
    // reason nobody gave is the finding, not a row to leave out.
    expect(rows[0]).toBe(en.reportReasons.spam)
    expect(rows[1]).toBe(en.reportReasons.harassment)
    expect(rows[2]).toBe(en.reportReasons.safety)
  })

  test('a full log window makes the days before it unknown rather than nought', async () => {
    // The feed came back at its limit, so it has an edge: everything it holds
    // is from the last two days, and the twelve before that are days nothing
    // is known about — which a zero-height bar would deny.
    const now = Date.now()
    const full = Array.from({ length: 300 }, (_, i) => logRow(`l${i}`, now - (i % 2) * DAY))
    at('/admin')
    act(() => settle(registry.feeds, { log: full }))
    await waitFor(() => expect(document.querySelectorAll('.con-column').length).toBe(14))
    const unknown = document.querySelectorAll('.con-column[data-known="no"]')
    expect(unknown.length).toBe(12)
    // And it says so in words, not only in the drawing.
    expect(screen.getByText(new RegExp(en.console.charts.windowed.split('{{')[0]))).toBeTruthy()
  })

  test('a window holding the whole record counts every day in range', async () => {
    at('/admin')
    act(() => settle(registry.feeds, { log: [logRow('l1', Date.now())] }))
    await waitFor(() => expect(document.querySelectorAll('.con-column').length).toBe(14))
    expect(document.querySelectorAll('.con-column[data-known="no"]').length).toBe(0)
    expect(screen.getByText(en.console.charts.wholeRecord)).toBeTruthy()
  })

  test('every chart carries a table of the same numbers', async () => {
    at('/admin')
    // With something in every chart: a chart with nothing in it shows a
    // sentence instead, and an empty table would say less than the sentence.
    act(() =>
      settle(registry.feeds, {
        open: [report('r1', { reason: 'spam' })],
        log: [logRow('l1', Date.now())],
      }),
    )
    // A value a reader can only get by hovering is a value some readers
    // cannot get at all.
    await waitFor(() => expect(document.querySelectorAll('.con-chart table').length).toBe(4))
    for (const table of document.querySelectorAll('.con-chart table')) {
      expect(table.querySelector('caption')?.textContent).toBeTruthy()
      expect(table.classList.contains('sr-only')).toBe(true)
    }
  })
})

describe('the sections that no longer exist', () => {
  test('moderators and system go to the overview, and nothing appoints anybody', () => {
    at('/admin/moderators')
    act(() => settle(registry.feeds))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.console.nav.overview)
    cleanup()
    at('/admin/system')
    act(() => settle(registry.feeds))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.console.nav.overview)
    expect(document.body.textContent).not.toMatch(/appoint|moderator/i)
    expect(mod.setUserRole).toBeUndefined()
  })
})

describe('activities', () => {
  test('lists removed ones first with their reason, and puts one back only with a reason', async () => {
    at('/admin/activities')
    act(() => settle(registry.feeds))
    const rows = [...document.querySelectorAll('.con-table tbody tr[data-row]')]
    expect(rows.map((tr) => tr.getAttribute('data-row'))).toEqual(['a1', 'a2'])
    expect(rows[0].textContent).toContain('Removed')
    fireEvent.click(rows[0])
    expect(panel().getByText(/Broke the rules/)).toBeTruthy()
    expect(mod.fetchActivityHistory).toHaveBeenCalledWith('a1')

    const button = panel().getByText(en.moderation.removedPage.putItBack).closest('button')
    expect(button.disabled).toBe(true)
    fireEvent.change(panel().getByPlaceholderText(en.moderation.removedPage.placeholder), {
      target: { value: 'The report was mistaken' },
    })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    await waitFor(() =>
      expect(mod.restoreActivity).toHaveBeenCalledWith('a1', {
        adminId: 'me',
        reason: 'The report was mistaken',
      }),
    )
    await waitFor(() => expect(lastToast().title).toBe('Put back'))
  })

  test('a live activity can be taken down from its row, with a reason', async () => {
    at('/admin/activities/a2')
    act(() => settle(registry.feeds))
    fireEvent.click(panel().getByText('Remove activity'))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByText('Remove').closest('button')
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'A safety concern' } })
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(mod.removeActivity).toHaveBeenCalledWith('a2', {
        adminId: 'me',
        reason: 'A safety concern',
      }),
    )
  })

  test('the status filter reaches the removed ones from the overview tile', () => {
    at('/admin/activities?status=removed')
    act(() => settle(registry.feeds))
    expect(document.querySelectorAll('.con-table tbody tr[data-row]')).toHaveLength(1)
  })
})

describe('the history', () => {
  test('merges actions, warnings and decisions, newest first, and filters', () => {
    const now = Date.now()
    at('/admin/history')
    act(() =>
      settle(registry.feeds, {
        log: [
          {
            id: 'l1',
            kind: 'suspend',
            by: 'mia',
            subjectId: 'bob',
            reason: 'Threats',
            at: now - 1000,
          },
        ],
        warnings: [
          { id: 'w1', subjectId: 'bob', by: 'me', reason: 'Be kind', createdAt: now - 2000 },
        ],
        resolved: [
          report('r9', {
            status: 'actioned',
            outcome: 'Account suspended',
            reviewedBy: 'mia',
            reviewedAt: now - 500,
          }),
        ],
        roles: [{ uid: 'mia', role: 'admin', suspended: false }],
      }),
    )
    const events = [...document.querySelectorAll('.con-event')]
    expect(events).toHaveLength(3)
    // Newest first: the decision, the suspension, the warning.
    expect(events[0].textContent).toContain('Report actioned')
    expect(events[1].textContent).toContain('Suspended')
    expect(events[2].textContent).toContain('Warning')
    expect(events[1].textContent).toContain('Mia → Bob')
    // No workload table: the history is a record, not a scoreboard.
    expect(document.querySelector('.con-table')).toBeNull()
    // Two controls: what happened, and a search.
    expect(document.querySelectorAll('.con-filters select')).toHaveLength(1)

    fireEvent.change(screen.getByLabelText(en.console.history.what), { target: { value: 'warn' } })
    expect(document.querySelectorAll('.con-event')).toHaveLength(1)
    fireEvent.click(screen.getByText(en.console.filters.clear))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kind' } })
    expect(document.querySelectorAll('.con-event')).toHaveLength(1)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Mia' } })
    expect(document.querySelectorAll('.con-event')).toHaveLength(2)
  })

  test('says when the connection is gone, on every page', () => {
    app = { ...app, offline: true, browserOffline: true }
    at('/admin/history')
    act(() => settle(registry.feeds))
    expect(screen.getByRole('status').textContent).toMatch(/offline/i)
  })
})
