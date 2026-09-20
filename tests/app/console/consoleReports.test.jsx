// @vitest-environment jsdom
/**
 * The report queue and the report being worked.
 *
 * Half of this is ported from the moderation page the console replaces,
 * and pins what a year of finding out what goes wrong taught it: the claim
 * is taken before the action and the decision travels with it; a colleague
 * closing first is said to have, not "no permission"; buttons wait while
 * an action is in flight; a stand-down that half worked is announced as
 * such; a lost claim releases nothing; offline, nothing starts. The other
 * half is the desk itself: the claim taken on purpose and let go, the
 * queue filtered and searched, and a linked report fetched when it is in
 * neither loaded page.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import en from '../../../src/i18n/locales/en.json'
import {
  CLAIM_TTL_MS,
  admin,
  directoryOf,
  feedRegistry,
  moderationError,
  report,
  settle,
} from './fixtures'

const registry = feedRegistry()
let currentUser = admin
vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: currentUser }) }))
const pushCelebration = vi.fn()
let offline = false
const activities = [
  {
    id: 'act1',
    title: 'Football Night',
    category: 'Football',
    hostId: 'bob',
    hostName: 'Bob',
    locationName: 'The park',
    date: '2030-01-01',
    time: '19:00',
    capacity: 8,
    participantUids: ['bob'],
    status: 'active',
    startsAt: Date.now() + 86_400_000,
  },
]
vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    pushCelebration,
    offline,
    browserOffline: false,
    serverSilent: false,
    dataError: null,
    loading: false,
    syncing: false,
    celebration: null,
    directory: directoryOf(),
    activities,
    allActivities: activities,
    removedActivities: [],
  }),
}))
let mod
vi.mock('../../../src/firebase/moderation', async () => {
  const { moderationMock } = await import('./fixtures')
  mod = moderationMock(registry)
  return mod
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

const lastToast = () => pushCelebration.mock.calls.at(-1)[0]
const panel = () => within(document.querySelector('.con-detail'))
const rowsShown = () => [...document.querySelectorAll('.con-table tbody tr[data-row]')]

/** The queue with these reports, and the first one open in the panel. */
const setup = (rows, over = {}) => {
  at(`/admin/reports/${rows[0]?.id ?? ''}`)
  act(() => settle(registry.feeds, { open: rows, ...over }))
}
const confirmSuspend = () => {
  fireEvent.click(panel().getByText('Suspend account'))
  fireEvent.click(screen.getByRole('dialog').querySelector('.primary-button, .danger-button'))
}
const dismiss = () => {
  fireEvent.click(panel().getByText('Dismiss'))
  fireEvent.click(screen.getAllByText('Dismiss').at(-1))
}

beforeEach(() => {
  registry.reset()
  currentUser = admin
  offline = false
  pushCelebration.mockClear()
  for (const fn of Object.values(mod)) if (typeof fn?.mockClear === 'function') fn.mockClear()
  mod.claimReport.mockResolvedValue(undefined)
  mod.releaseReport.mockResolvedValue(undefined)
  mod.issueWarning.mockResolvedValue(undefined)
  mod.suspendAccount.mockResolvedValue({ stoodDown: 0, failed: 0 })
  mod.resolveReport.mockResolvedValue(undefined)
  mod.removeActivity.mockResolvedValue(undefined)
  mod.fetchReport.mockResolvedValue(null)
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

describe('roles and warnings that could not be loaded', () => {
  test('keep what was last known, and say it may be out of date', () => {
    at('/admin/accounts')
    act(() => settle(registry.feeds, { roles: [{ uid: 'bob', role: 'user', suspended: true }] }))
    const bobsRow = () => rowsShown().find((tr) => tr.getAttribute('data-row') === 'bob')
    expect(bobsRow().textContent).toContain('Suspended')
    act(() => registry.feeds.roles.onError({ code: 'unavailable' }))
    // The suspension is still shown, not silently dropped…
    expect(bobsRow().textContent).toContain('Suspended')
    // …and the screen says why it might be stale.
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load ranks and warnings/)
    // A later delivery clears the notice.
    act(() => registry.feeds.roles.onRows([{ uid: 'bob', role: 'user', suspended: true }]))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('acting on a report', () => {
  test('a stand-down that only partly worked is announced as such', async () => {
    mod.suspendAccount.mockResolvedValue({ stoodDown: 2, failed: 1 })
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(mod.suspendAccount).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(lastToast().title).toBe('Suspended, but not everything came down'))
    expect(lastToast().body).toMatch(/2 activities stood down, but 1 could not be/)
  })

  test('a stand-down that fully worked is announced as before', async () => {
    mod.suspendAccount.mockResolvedValue({ stoodDown: 2, failed: 0 })
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(lastToast().title).toBe('Action taken'))
    expect(lastToast().body).toMatch(/2 activities they were hosting stood down/)
  })

  test('the buttons wait while the action is in flight', async () => {
    let release
    mod.suspendAccount.mockReturnValue(new Promise((resolve) => (release = resolve)))
    setup([report('r1')])
    confirmSuspend()
    expect(panel().getByText('Working…').closest('button').disabled).toBe(true)
    expect(panel().getByText('Dismiss').closest('button').disabled).toBe(true)
    expect(panel().getByText('Warn').closest('button').disabled).toBe(true)
    await act(async () => {
      release({ stoodDown: 0, failed: 0 })
    })
    await waitFor(() => expect(lastToast().title).toBe('Action taken'))
    // The report is still open in this fake feed, so the buttons come back.
    expect(panel().getByText('Suspend account').closest('button').disabled).toBe(false)
  })

  test('a report a colleague closed first is said to have been, not "no permission"', async () => {
    mod.claimReport.mockRejectedValue(moderationError('already-handled'))
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(lastToast().title).toBe('Already handled'))
    expect(mod.suspendAccount).not.toHaveBeenCalled()
    expect(mod.resolveReport).not.toHaveBeenCalled()
  })

  test('the claim is taken first, and the action records its own decision under it, with its reason', async () => {
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(lastToast().title).toBe('Action taken'))
    expect(mod.claimReport).toHaveBeenCalledWith('r1', 'me')
    expect(mod.claimReport.mock.invocationCallOrder[0]).toBeLessThan(
      mod.suspendAccount.mock.invocationCallOrder[0],
    )
    // The decision travels with the action, which commits both in one
    // transaction; nothing is recorded in a second write. The reason the
    // log will carry is the report's own.
    expect(mod.suspendAccount).toHaveBeenCalledWith('bob', {
      adminId: 'me',
      reportId: 'r1',
      decision: { status: 'actioned', outcome: 'Account suspended' },
      reason: 'Harassment or abuse — reported by a user',
    })
    expect(mod.resolveReport).not.toHaveBeenCalled()
    expect(mod.releaseReport).not.toHaveBeenCalled()
  })

  test('a takedown from the queue carries its decision the same way', async () => {
    setup([report('r1', { targetType: 'activity', targetId: 'act1' })])
    fireEvent.click(panel().getByText('Remove activity'))
    fireEvent.click(screen.getByRole('dialog').querySelector('.danger-button'))
    await waitFor(() => expect(lastToast().title).toBe('Action taken'))
    expect(mod.removeActivity).toHaveBeenCalledWith('act1', {
      adminId: 'me',
      reason: 'Harassment or abuse — reported by a user',
      reportId: 'r1',
      decision: { status: 'actioned', outcome: 'Activity removed' },
    })
    expect(mod.resolveReport).not.toHaveBeenCalled()
  })

  test('a dismissal is the decision alone, recorded under the claim', async () => {
    setup([report('r1')])
    dismiss()
    await waitFor(() => expect(lastToast().title).toBe('Report dismissed'))
    expect(mod.claimReport).toHaveBeenCalledWith('r1', 'me')
    expect(mod.resolveReport).toHaveBeenCalledWith('r1', {
      status: 'dismissed',
      outcome: 'No action needed',
      adminId: 'me',
    })
    expect(mod.suspendAccount).not.toHaveBeenCalled()
  })

  test('a decision that landed without its acknowledgement is "already done", not a colleague’s', async () => {
    mod.claimReport.mockRejectedValue(moderationError('already-handled', { reviewedBy: 'me' }))
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(lastToast().title).toBe('Already done'))
    expect(lastToast().body).toMatch(/Your decision was recorded the first time/)
  })

  test('a colleague’s fresh claim: "being handled", and nothing runs', async () => {
    mod.claimReport.mockRejectedValue(moderationError('claim-held'))
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(lastToast().title).toBe('Being handled'))
    expect(mod.suspendAccount).not.toHaveBeenCalled()
  })

  test('a claim lost mid-action: "already handled", nothing recorded, nothing released', async () => {
    mod.suspendAccount.mockRejectedValue(moderationError('claim-lost'))
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(lastToast().title).toBe('Already handled'))
    expect(mod.resolveReport).not.toHaveBeenCalled()
    expect(mod.releaseReport).not.toHaveBeenCalled()
  })

  test('an action that fails releases the claim so a colleague can finish', async () => {
    mod.suspendAccount.mockRejectedValue({ code: 'unavailable' })
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(lastToast().title).toBe("Couldn't complete that"))
    expect(mod.releaseReport).toHaveBeenCalledWith('r1')
  })

  test('a dismissal that could not be recorded releases the claim too', async () => {
    mod.resolveReport.mockRejectedValue({ code: 'unavailable' })
    setup([report('r1')])
    dismiss()
    await waitFor(() => expect(lastToast().title).toBe("Couldn't complete that"))
    expect(mod.releaseReport).toHaveBeenCalledWith('r1')
  })

  test('a report somebody else holds shows who, counts down, and its buttons wait', () => {
    setup([report('r1', { claimedBy: 'carol', claimedAt: Date.now() - 1000 })])
    expect(panel().getAllByText(/In review by Carol/).length).toBeGreaterThan(0)
    expect(panel().getByText('Suspend account').closest('button').disabled).toBe(true)
    expect(panel().getByText('Dismiss').closest('button').disabled).toBe(true)
    // In the list, the status badge names the colleague.
    expect(rowsShown()[0].textContent).toContain('In review · Carol')
    // A stale claim is nobody's, and may be taken over. (Well past the
    // lease: the panel's clock ticks once a second, not per render.)
    act(() =>
      registry.feeds.open.onRows([
        report('r1', { claimedBy: 'carol', claimedAt: Date.now() - CLAIM_TTL_MS - 60_000 }),
      ]),
    )
    expect(panel().queryAllByText(/In review by/)).toHaveLength(0)
    expect(panel().getByText(/Carol’s claim has expired/)).toBeTruthy()
    expect(panel().getByText('Suspend account').closest('button').disabled).toBe(false)
  })

  test('a warning from the queue is written under the claim, which it lets go of itself', async () => {
    setup([report('r1')])
    fireEvent.click(panel().getByText('Warn'))
    // Seeded with what was reported.
    expect(screen.getByRole('dialog').querySelector('input').value).toMatch(/Harassment or abuse/)
    fireEvent.click(screen.getByText('Send warning'))
    await waitFor(() => expect(mod.issueWarning).toHaveBeenCalledTimes(1))
    expect(mod.claimReport).toHaveBeenCalledWith('r1', 'me')
    expect(mod.issueWarning.mock.calls[0][1]).toMatchObject({ reportId: 'r1', adminId: 'me' })
    await waitFor(() => expect(lastToast().title).toBe('Warning issued'))
    expect(mod.releaseReport).not.toHaveBeenCalled()
  })

  test('a warning that failed for another reason releases the claim; a lost claim is left alone', async () => {
    mod.issueWarning.mockRejectedValueOnce({ code: 'unavailable' })
    setup([report('r1')])
    fireEvent.click(panel().getByText('Warn'))
    fireEvent.click(screen.getByText('Send warning'))
    await waitFor(() => expect(lastToast().title).toBe("Couldn't complete that"))
    expect(mod.releaseReport).toHaveBeenCalledWith('r1')

    mod.releaseReport.mockClear()
    mod.issueWarning.mockRejectedValueOnce(moderationError('claim-lost'))
    fireEvent.click(panel().getByText('Warn'))
    fireEvent.click(screen.getByText('Send warning'))
    await waitFor(() => expect(lastToast().title).toBe('Already handled'))
    expect(mod.releaseReport).not.toHaveBeenCalled()
  })

  test('offline, nothing is started and the person is told', async () => {
    offline = true
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(lastToast().title).toBe("You're offline"))
    expect(mod.claimReport).not.toHaveBeenCalled()
  })

  test('an action that outlives the budget unblocks the screen and reports the real outcome later', async () => {
    vi.useFakeTimers()
    try {
      let finish
      mod.suspendAccount.mockReturnValue(new Promise((resolve) => (finish = resolve)))
      setup([report('r1')])
      confirmSuspend()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000)
      })
      expect(lastToast().title).toBe('Still trying')
      expect(panel().getByText('Suspend account').closest('button').disabled).toBe(false)
      await act(async () => {
        finish({ stoodDown: 1, failed: 0 })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(lastToast().title).toBe('Action taken')
    } finally {
      vi.useRealTimers()
    }
  })

  test('a refusal on a report that is still open is what it says', async () => {
    mod.suspendAccount.mockRejectedValue({ code: 'permission-denied' })
    setup([report('r1')])
    confirmSuspend()
    await waitFor(() => expect(lastToast().title).toBe("Couldn't complete that"))
    expect(lastToast().body).toBe('You do not have permission.')
    expect(mod.releaseReport).toHaveBeenCalledWith('r1')
  })

  test('a report about you, or filed by you, is listed but not yours to judge', () => {
    setup([report('r1', { targetId: 'me', subjectId: 'me' })])
    expect(rowsShown()).toHaveLength(1)
    expect(panel().getByText(en.console.reports.involvesYou)).toBeTruthy()
    expect(panel().getByText('Suspend account').closest('button').disabled).toBe(true)
    expect(panel().getByText(en.console.claim.take).closest('button').disabled).toBe(true)
  })
})

describe('the claim, taken on purpose', () => {
  test('is taken, renewed, and released from the panel', async () => {
    setup([report('r1')])
    expect(panel().getByText(en.console.claim.nobody)).toBeTruthy()
    fireEvent.click(panel().getByText(en.console.claim.take))
    await waitFor(() => expect(mod.claimReport).toHaveBeenCalledWith('r1', 'me'))
    await waitFor(() => expect(lastToast().title).toBe(en.console.toasts.claimed))

    act(() =>
      registry.feeds.open.onRows([report('r1', { claimedBy: 'me', claimedAt: Date.now() })]),
    )
    expect(panel().getByText(/Yours for the next/)).toBeTruthy()
    expect(rowsShown()[0].textContent).toContain('Claimed by me')
    fireEvent.click(panel().getByText(en.console.claim.renew))
    await waitFor(() => expect(mod.claimReport).toHaveBeenCalledTimes(2))

    fireEvent.click(panel().getByText(en.console.claim.release))
    await waitFor(() => expect(mod.releaseReport).toHaveBeenCalledWith('r1'))
    await waitFor(() => expect(lastToast().title).toBe(en.console.toasts.released))
  })

  test('a colleague’s fresh claim is refused as "being handled"', async () => {
    mod.claimReport.mockRejectedValue(moderationError('claim-held'))
    setup([report('r1')])
    fireEvent.click(panel().getByText(en.console.claim.take))
    await waitFor(() => expect(lastToast().title).toBe('Being handled'))
  })
})

describe('the queue', () => {
  const rows = () => [
    report('r1', { reason: 'spam', createdAt: Date.now() - 1000 }),
    report('r2', {
      reason: 'safety',
      targetType: 'activity',
      targetId: 'act1',
      subjectId: 'bob',
      createdAt: Date.now() - 2 * 24 * 60 * 60_000,
      detail: 'somebody brought a knife',
    }),
    report('r3', {
      reason: 'harassment',
      claimedBy: 'carol',
      claimedAt: Date.now() - 1000,
      reporterId: 'bob',
      targetId: 'carol',
      subjectId: 'carol',
    }),
  ]

  test('is newest first, says how many times a thing was reported, and each filter narrows it', () => {
    at('/admin/reports')
    act(() =>
      settle(registry.feeds, {
        // r0 is a second report about Bob, filed three seconds ago.
        open: [...rows(), report('r0', { reason: 'spam', createdAt: Date.now() - 3000 })],
        warnings: [{ id: 'w1', subjectId: 'bob', by: 'me', reason: 'x' }],
      }),
    )
    // Newest first: one second, three seconds, a minute, two days.
    const shown = rowsShown()
    expect(shown.map((tr) => tr.getAttribute('data-row'))).toEqual(['r1', 'r0', 'r3', 'r2'])
    expect(shown[3].textContent).toContain('A safety concern')
    // Two reports name Bob: the count is about the target, so both rows say 2.
    expect(shown[0].querySelector('td:nth-child(6)').textContent).toBe('2')
    expect(shown[1].querySelector('td:nth-child(6)').textContent).toBe('2')
    expect(shown[2].querySelector('td:nth-child(6)').textContent).toBe('1')
    // No triage score: the queue is a list, not a verdict.
    expect(document.body.textContent).not.toMatch(/Urgent|Priority/)

    const select = (label) => screen.getByLabelText(label)
    fireEvent.change(select(en.console.reports.columns.type), { target: { value: 'activity' } })
    expect(rowsShown()).toHaveLength(1)
    fireEvent.change(select(en.console.reports.columns.type), { target: { value: 'all' } })
    fireEvent.change(select(en.console.reports.columns.status), { target: { value: 'held' } })
    expect(rowsShown().map((tr) => tr.getAttribute('data-row'))).toEqual(['r3'])
    fireEvent.change(select(en.console.reports.columns.status), { target: { value: 'unclaimed' } })
    expect(rowsShown()).toHaveLength(3)
    fireEvent.click(screen.getByText(en.console.filters.clear))
    expect(rowsShown()).toHaveLength(4)
    // Three controls and no more.
    expect(document.querySelectorAll('.con-filters select')).toHaveLength(2)
    expect(document.querySelectorAll('.con-filters input')).toHaveLength(1)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'knife' } })
    expect(rowsShown().map((tr) => tr.getAttribute('data-row'))).toEqual(['r2'])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing-like-this' } })
    expect(rowsShown()).toHaveLength(0)
    expect(screen.getByText(en.console.reports.noMatch)).toBeTruthy()
  })

  test('decided reports are a filter away, with their decision', () => {
    at('/admin/reports')
    act(() =>
      settle(registry.feeds, {
        open: rows(),
        resolved: [
          report('old', {
            status: 'actioned',
            outcome: 'Account suspended',
            reviewedBy: 'carol',
            reviewedAt: Date.now() - 5000,
          }),
        ],
      }),
    )
    expect(rowsShown()).toHaveLength(3)
    fireEvent.change(screen.getByLabelText(en.console.reports.columns.status), {
      target: { value: 'resolved' },
    })
    expect(rowsShown().map((tr) => tr.getAttribute('data-row'))).toEqual(['old'])
    expect(rowsShown()[0].textContent).toContain('Actioned')
    expect(rowsShown()[0].textContent).toContain('Carol')
    fireEvent.click(rowsShown()[0])
    expect(panel().getByText(en.console.reports.decision)).toBeTruthy()
    expect(panel().getByText('Account suspended')).toBeTruthy()
    // Nothing to act on any more.
    expect(panel().queryByText('Suspend account')).toBeNull()
  })

  test('the keyboard walks the rows and opens one', () => {
    at('/admin/reports')
    act(() => settle(registry.feeds, { open: rows() }))
    const [first, second] = rowsShown()
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second, { key: 'k' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'Enter' })
    expect(document.querySelector('.con-detail')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.con-detail')).toBeNull()
  })

  test('one report at a time: there is no bulk close and no row checkbox', () => {
    at('/admin/reports')
    act(() => settle(registry.feeds, { open: rows() }))
    expect(document.querySelectorAll('.con-table input[type="checkbox"]')).toHaveLength(0)
    expect(document.querySelector('.con-bulk')).toBeNull()
  })

  test('a linked report outside both pages is fetched on its own', async () => {
    mod.fetchReport.mockResolvedValue(
      report('far', {
        status: 'dismissed',
        outcome: 'No action needed',
        reviewedBy: 'carol',
        reviewedAt: Date.now(),
      }),
    )
    at('/admin/reports/far')
    act(() => settle(registry.feeds))
    expect(await screen.findByText(en.console.reports.decision)).toBeTruthy()
    expect(mod.fetchReport).toHaveBeenCalledWith('far')
  })

  test('a linked report that cannot be found says so', async () => {
    at('/admin/reports/nowhere')
    act(() => settle(registry.feeds))
    expect(await screen.findByText(en.console.reports.notLoaded)).toBeTruthy()
  })

  test('the evidence shows the activity it names and a way to it', () => {
    setup([report('r2', { targetType: 'activity', targetId: 'act1' })])
    expect(panel().getByText('Football Night')).toBeTruthy()
    fireEvent.click(panel().getByText(en.common.lookAtIt))
    expect(screen.getByText('the activity page')).toBeTruthy()
  })
})
