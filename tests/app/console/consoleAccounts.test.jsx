// @vitest-environment jsdom
/**
 * Accounts: everyone on SmartSync with what they have done attached, the
 * search that reaches past the loaded window, and the panel where the
 * admin acts on somebody — the whole ladder, warn to close, and nothing
 * else. Nobody sees a button aimed at an admin or at themselves.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import en from '../../../src/i18n/locales/en.json'
import { admin, feedRegistry, person, settle } from './fixtures'

const registry = feedRegistry()
let currentUser = admin
vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: currentUser }) }))
const pushCelebration = vi.fn()
let directory = new Map([person('me', 'Admin')])
let allActivities = []
vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    pushCelebration,
    offline: false,
    browserOffline: false,
    serverSilent: false,
    dataError: null,
    loading: false,
    syncing: false,
    celebration: null,
    directory,
    activities: allActivities,
    allActivities,
    removedActivities: [],
  }),
}))
let mod
vi.mock('../../../src/firebase/moderation', async () => {
  const { moderationMock } = await import('./fixtures')
  mod = moderationMock(registry)
  return mod
})
const searchUsers = vi.fn(async () => [])
vi.mock('../../../src/firebase/users', () => ({
  PEER_LIMIT: 3,
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
      </Routes>
    </MemoryRouter>,
  )
const panel = () => within(document.querySelector('.con-detail'))
const lastToast = () => pushCelebration.mock.calls.at(-1)[0]

beforeEach(() => {
  registry.reset()
  currentUser = admin
  directory = new Map([person('me', 'Admin')])
  allActivities = []
  pushCelebration.mockClear()
  searchUsers.mockReset()
  searchUsers.mockResolvedValue([])
  for (const fn of Object.values(mod)) if (typeof fn?.mockClear === 'function') fn.mockClear()
  mod.fetchAccountHistory.mockResolvedValue({
    log: [],
    warnings: [],
    reportsAbout: [],
    reportsFiled: [],
  })
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

describe('everyone on SmartSync, past the window', () => {
  // The directory in memory is the first PEER_LIMIT accounts. Somebody
  // beyond it used to be unfindable from here, and the heading counted the
  // window as if it were the whole server.
  test('says when the list is only the loaded window', () => {
    directory = new Map([person('me', 'Admin'), person('a', 'Ann'), person('b', 'Ben')])
    at('/admin/accounts')
    act(() => settle(registry.feeds))
    expect(screen.getByText(/The first 3 accounts are loaded/)).toBeTruthy()
    expect(screen.getByText(/3 accounts loaded/)).toBeTruthy()
  })

  test('and does not say so while it is complete', () => {
    at('/admin/accounts')
    act(() => settle(registry.feeds))
    expect(screen.queryByText(/accounts are loaded/)).toBeNull()
  })

  test('a search also asks the server, and lists who it finds', async () => {
    vi.useFakeTimers()
    searchUsers.mockResolvedValue([
      { uid: 'zed', name: 'Zed Outside', avatar: 'ZO', username: '@zed' },
    ])
    at('/admin/accounts')
    act(() => settle(registry.feeds))
    fireEvent.change(screen.getByLabelText('Search everyone'), { target: { value: 'Zed' } })
    expect(screen.getByText('Searching everyone…')).toBeTruthy()
    expect(searchUsers).not.toHaveBeenCalled() // not until typing pauses
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    vi.useRealTimers()
    expect(searchUsers).toHaveBeenCalledWith('Zed')
    expect(await screen.findByText('Zed Outside')).toBeTruthy()
    // Nothing about their activity is loaded, and the row says so rather
    // than printing "hosts 0, joined 0".
    expect(screen.getByText(/found by search — activity counts not loaded/)).toBeTruthy()
    expect(screen.queryByText('Searching everyone…')).toBeNull()
  })

  test('someone in the window is listed once, with their counts', async () => {
    vi.useFakeTimers()
    directory = new Map([person('me', 'Admin'), person('a', 'Ann Able')])
    searchUsers.mockResolvedValue([{ uid: 'a', name: 'Ann Able', avatar: 'AA', username: '@a' }])
    at('/admin/accounts')
    act(() => settle(registry.feeds))
    fireEvent.change(screen.getByLabelText('Search everyone'), { target: { value: 'Ann' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    vi.useRealTimers()
    expect(await screen.findAllByText('Ann Able')).toHaveLength(1)
    expect(screen.getByText(/hosts 0, joined 0/)).toBeTruthy()
  })

  test('a search the server could not answer is said, not shown as nobody', async () => {
    searchUsers.mockRejectedValue({ code: 'unavailable' })
    at('/admin/accounts')
    act(() => settle(registry.feeds))
    fireEvent.change(screen.getByPlaceholderText('Name or @username'), {
      target: { value: 'zed' },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/could not be searched/),
    )
  })

  test('the search is not run for the queue, only for the directory', () => {
    at('/admin/reports')
    act(() => settle(registry.feeds))
    expect(searchUsers).not.toHaveBeenCalled()
  })
})

describe('the list', () => {
  beforeEach(() => {
    directory = new Map([
      person('me', 'Admin'),
      person('bob', 'Bob'),
      person('carol', 'Carol'),
      person('dan', 'Dan'),
    ])
    allActivities = [
      {
        id: 'a1',
        hostId: 'bob',
        participantUids: ['bob', 'dan'],
        status: 'removed',
        title: 'Gone',
      },
      { id: 'a2', hostId: 'bob', participantUids: ['bob'], status: 'active', title: 'Live' },
    ]
  })

  test('floats trouble to the top and shows each person’s states and counts', () => {
    at('/admin/accounts')
    act(() =>
      settle(registry.feeds, {
        roles: [
          { uid: 'carol', role: 'user', suspended: true },
          { uid: 'dan', role: 'user', suspended: false, banned: true },
        ],
        warnings: [{ id: 'w1', subjectId: 'bob', by: 'me', reason: 'x' }],
      }),
    )
    const names = [...document.querySelectorAll('.con-table tbody tr .con-cell-main strong')].map(
      (el) => el.textContent,
    )
    expect(names).toEqual(['Dan', 'Carol', 'Bob', 'Admin (you)'])
    const bobRow = screen.getByText('Bob').closest('tr')
    expect(bobRow.textContent).toContain('hosts 2, joined 0')
    expect(bobRow.textContent).toContain('1 warning')
    expect(bobRow.textContent).toContain('1 taken down')
    expect(screen.getByText('Dan').closest('tr').textContent).toContain('Closed')
    expect(screen.getByText('Carol').closest('tr').textContent).toContain('Suspended')

    fireEvent.change(screen.getByLabelText(en.console.accounts.columns.state), {
      target: { value: 'suspended' },
    })
    expect(document.querySelectorAll('.con-table tbody tr[data-row]')).toHaveLength(1)
  })
})

describe('the account panel', () => {
  beforeEach(() => {
    directory = new Map([
      person('me', 'Admin'),
      person('bob', 'Bob', { interests: ['Football'], bio: 'Plays a lot.' }),
      person('mia', 'Mia'),
      person('ada', 'Ada'),
    ])
  })
  const roles = () => [
    // A row left over from the retired rank: an ordinary account now.
    { uid: 'mia', role: 'moderator', suspended: false },
    { uid: 'ada', role: 'admin', suspended: false },
  ]

  test('the whole ladder against an ordinary user, and nothing against an admin or yourself', () => {
    at('/admin/accounts/bob')
    act(() => settle(registry.feeds, { roles: roles() }))
    expect(panel().getByText('Plays a lot.')).toBeTruthy()
    expect(panel().getByText('Warn')).toBeTruthy()
    expect(panel().getByText('Suspend account')).toBeTruthy()
    expect(panel().getByText('Close account')).toBeTruthy()
    expect(panel().queryByText(/Appoint|Dismiss as/)).toBeNull()
    expect(mod.fetchAccountHistory).toHaveBeenCalledWith('bob')
    cleanup()

    // The legacy row reads, and is acted on, as an ordinary user.
    at('/admin/accounts/mia')
    act(() => settle(registry.feeds, { roles: roles() }))
    expect(panel().getByText('Suspend account')).toBeTruthy()
    expect(panel().getByText('Close account')).toBeTruthy()
    expect(document.querySelector('.con-detail').textContent).not.toMatch(/moderator/i)
    cleanup()

    at('/admin/accounts/ada')
    act(() => settle(registry.feeds, { roles: roles() }))
    expect(panel().getByText(en.moderation.people.isAdmin)).toBeTruthy()
    expect(panel().queryByText('Close account')).toBeNull()
    expect(panel().queryByText('Suspend account')).toBeNull()
    expect(panel().queryByText('Warn')).toBeNull()
    cleanup()

    at('/admin/accounts/me')
    act(() => settle(registry.feeds, { roles: roles() }))
    expect(panel().getByText(en.console.accounts.yourself)).toBeTruthy()
    expect(panel().queryByText('Warn')).toBeNull()
  })

  test('a suspension from here needs a reason, and is recorded with it', async () => {
    at('/admin/accounts/bob')
    act(() => settle(registry.feeds))
    fireEvent.click(panel().getByText('Suspend account'))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByText('Suspend').closest('button')
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Threats in chat' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(mod.suspendAccount).toHaveBeenCalledWith('bob', {
        adminId: 'me',
        reason: 'Threats in chat',
        durationHours: 168,
      }),
    )
    await waitFor(() => expect(lastToast().title).toBe('Account suspended'))
  })

  test('lifting takes an optional note and passes it on', async () => {
    at('/admin/accounts/bob')
    act(() => settle(registry.feeds, { roles: [{ uid: 'bob', role: 'user', suspended: true }] }))
    fireEvent.click(panel().getByText('Lift suspension'))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByText('Lift suspension').closest('button')
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(mod.liftSuspension).toHaveBeenCalledWith('bob', { adminId: 'me', reason: '' }),
    )
    await waitFor(() => expect(lastToast().title).toBe('Suspension lifted'))
  })

  test('closing an account needs a reason; the record is fetched whole', async () => {
    mod.fetchAccountHistory.mockResolvedValue({
      log: [
        {
          id: 'l1',
          kind: 'suspend',
          by: 'me',
          subjectId: 'bob',
          reason: 'Threats',
          at: Date.now() - 5000,
        },
      ],
      warnings: [
        { id: 'w1', subjectId: 'bob', by: 'me', reason: 'Be kind', createdAt: Date.now() - 9000 },
      ],
      reportsAbout: [],
      reportsFiled: [
        {
          id: 'f1',
          reporterId: 'bob',
          subjectId: 'me',
          targetType: 'user',
          targetId: 'me',
          reason: 'spam',
          status: 'open',
          createdAt: Date.now(),
        },
      ],
    })
    at('/admin/accounts/bob')
    act(() => settle(registry.feeds))
    expect(await panel().findByText('“Threats”')).toBeTruthy()
    expect(panel().getByText('“Be kind”')).toBeTruthy()
    // What they filed, with its state.
    expect(panel().getByText(/Spam or a scam/)).toBeTruthy()

    fireEvent.click(panel().getByText('Close account'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Repeated threats' } })
    fireEvent.click(within(dialog).getByText('Close account'))
    await waitFor(() =>
      expect(mod.closeAccount).toHaveBeenCalledWith('bob', {
        adminId: 'me',
        reason: 'Repeated threats',
      }),
    )
  })

  test('a record that could not be loaded says so', async () => {
    mod.fetchAccountHistory.mockRejectedValue({ code: 'unavailable' })
    at('/admin/accounts/bob')
    act(() => settle(registry.feeds))
    expect(await panel().findByText(en.console.accounts.recordFailed)).toBeTruthy()
  })
})
