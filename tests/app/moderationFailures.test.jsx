// @vitest-environment jsdom
/**
 * The moderation screen when something underneath it fails.
 *
 * Three things it used to get wrong. A ranks or warnings listener that
 * failed reset its list to nothing — suspended accounts vanished, warning
 * counts read zero — with nothing on screen saying so. A suspension whose
 * stand-down half-failed was announced as complete. And a report could be
 * confirmed twice while the first action was in flight, which now that the
 * rules close a report once would announce a failure for a repeat.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const feeds = {}
const watcher = (name) => (onRows, onError) => {
  feeds[name] = { onRows, onError }
  return () => {}
}
const suspendAccount = vi.fn()
const resolveReport = vi.fn()
const removeActivity = vi.fn()
const claimReport = vi.fn(async () => {})
const releaseReport = vi.fn(async () => {})
const issueWarning = vi.fn(async () => {})
const CLAIM_TTL_MS = 5 * 60_000
const moderationError = (code, details = {}) => Object.assign(new Error(code), { code, details })
vi.mock('../../src/firebase/moderation', () => ({
  REPORT_PAGE: 100,
  REPORT_REASONS: [{ key: 'harassment', label: 'Harassment or abuse' }],
  CLAIM_TTL_MS,
  claimReport,
  releaseReport,
  claimedByOther: (row, me, now = Date.now()) =>
    Boolean(row?.claimedBy) && row.claimedBy !== me && now - (row.claimedAt ?? now) < CLAIM_TTL_MS,
  watchOpenReports: (cb, onError) => watcher('reports')(cb, onError),
  watchRoles: (cb, onError) => watcher('roles')(cb, onError),
  watchWarnings: (cb, onError) => watcher('warnings')(cb, onError),
  closeAccount: vi.fn(),
  issueWarning,
  liftSuspension: vi.fn(),
  removeActivity,
  resolveReport,
  restoreActivity: vi.fn(),
  setUserRole: vi.fn(),
  reopenAccount: vi.fn(),
  suspendAccount,
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', isModerator: true, isAdmin: true, name: 'Admin' } }),
}))
const searchUsers = vi.fn(async () => [])
vi.mock('../../src/firebase/users', () => ({ PEER_LIMIT: 500, searchUsers }))
const pushCelebration = vi.fn()
let offline = false
const directory = new Map([
  ['me', { uid: 'me', name: 'Admin', avatar: 'AD' }],
  ['bob', { uid: 'bob', name: 'Bob', avatar: 'BO' }],
  ['carol', { uid: 'carol', name: 'Carol', avatar: 'CA' }],
])
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    pushCelebration,
    offline,
    directory,
    activities: [],
    allActivities: [],
    removedActivities: [],
  }),
}))

const ModerationPage = (await import('../../src/pages/ModerationPage')).default

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/moderation" element={<ModerationPage />} />
        <Route path="/moderation/:section" element={<ModerationPage />} />
      </Routes>
    </MemoryRouter>,
  )

const report = (id, over = {}) => ({
  id,
  reporterId: 'carol',
  targetType: 'user',
  targetId: 'bob',
  subjectId: 'bob',
  reason: 'harassment',
  detail: 'x',
  createdAt: Date.now(),
  ...over,
})
const lastToast = () => pushCelebration.mock.calls.at(-1)[0]

beforeEach(() => {
  for (const key of Object.keys(feeds)) delete feeds[key]
  offline = false
  pushCelebration.mockClear()
  suspendAccount.mockReset()
  resolveReport.mockReset()
  removeActivity.mockReset()
  claimReport.mockReset()
  claimReport.mockResolvedValue(undefined)
  releaseReport.mockReset()
  releaseReport.mockResolvedValue(undefined)
  issueWarning.mockReset()
  issueWarning.mockResolvedValue(undefined)
  searchUsers.mockReset()
  searchUsers.mockResolvedValue([])
})
afterEach(cleanup)

describe('ranks and warnings that could not be loaded', () => {
  test('keep what was last known, and say it may be out of date', () => {
    at('/moderation')
    act(() => feeds.reports.onRows([]))
    act(() => feeds.roles.onRows([{ uid: 'bob', role: 'user', suspended: true }]))
    act(() => feeds.warnings.onRows([]))
    expect(screen.getByText('Accounts on hold')).toBeTruthy()

    act(() => feeds.roles.onError({ code: 'unavailable' }))
    // The suspended list is still there, not silently emptied…
    expect(screen.getByText('Accounts on hold')).toBeTruthy()
    // …and the screen says why it might be stale.
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load ranks and warnings/)

    // A later delivery clears the notice.
    act(() => feeds.warnings.onRows([]))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('acting on a report', () => {
  const setup = (rows) => {
    at('/moderation')
    act(() => feeds.reports.onRows(rows))
    act(() => feeds.roles.onRows([]))
    act(() => feeds.warnings.onRows([]))
  }
  const confirm = async () => {
    fireEvent.click(screen.getByText('Suspend account'))
    fireEvent.click(screen.getByText('Suspend'))
  }
  // The row's button and the dialog's confirm share a label.
  const dismiss = () => {
    fireEvent.click(screen.getByText('Dismiss'))
    fireEvent.click(screen.getAllByText('Dismiss').at(-1))
  }

  test('a stand-down that only partly worked is announced as such', async () => {
    suspendAccount.mockResolvedValue({ stoodDown: 2, failed: 1 })
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(suspendAccount).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(lastToast().title).toBe('Suspended, but not everything came down'))
    expect(lastToast().body).toMatch(/2 activities stood down, but 1 could not be/)
  })

  test('a stand-down that fully worked is announced as before', async () => {
    suspendAccount.mockResolvedValue({ stoodDown: 2, failed: 0 })
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(lastToast().title).toBe('Action taken'))
    expect(lastToast().body).toMatch(/2 activities they were hosting stood down/)
  })

  test('the buttons wait while the action is in flight', async () => {
    let release
    suspendAccount.mockReturnValue(new Promise((resolve) => (release = resolve)))
    setup([report('r1')])
    await confirm()
    expect(screen.getByText('Working…').closest('button').disabled).toBe(true)
    expect(screen.getByText('Dismiss').closest('button').disabled).toBe(true)
    expect(screen.getByText('Warn').closest('button').disabled).toBe(true)
    await act(async () => {
      release({ stoodDown: 0, failed: 0 })
    })
    await waitFor(() => expect(lastToast().title).toBe('Action taken'))
    // The report is still open in this fake feed, so the buttons come back.
    expect(screen.getByText('Suspend account').closest('button').disabled).toBe(false)
  })

  test('a report a colleague closed first is said to have been, not "no permission"', async () => {
    // The claim is refused because the report is no longer open.
    claimReport.mockRejectedValue(moderationError('already-handled'))
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(lastToast().title).toBe('Already handled'))
    expect(suspendAccount).not.toHaveBeenCalled()
    expect(resolveReport).not.toHaveBeenCalled()
  })

  test('the claim is taken first, and the action records its own decision under it', async () => {
    suspendAccount.mockResolvedValue({ stoodDown: 0, failed: 0 })
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(lastToast().title).toBe('Action taken'))
    expect(claimReport).toHaveBeenCalledWith('r1', 'me')
    expect(claimReport.mock.invocationCallOrder[0]).toBeLessThan(
      suspendAccount.mock.invocationCallOrder[0],
    )
    // The decision travels with the action, which commits both in one
    // transaction; nothing is recorded in a second write.
    expect(suspendAccount).toHaveBeenCalledWith('bob', {
      moderatorId: 'me',
      reportId: 'r1',
      decision: { status: 'actioned', outcome: 'Account suspended' },
    })
    expect(resolveReport).not.toHaveBeenCalled()
    // Recorded: no release needed, and none made.
    expect(releaseReport).not.toHaveBeenCalled()
  })

  test('a takedown from the queue carries its decision the same way', async () => {
    removeActivity.mockResolvedValue(undefined)
    setup([report('r1', { targetType: 'activity', targetId: 'act1' })])
    fireEvent.click(screen.getByText('Remove activity'))
    fireEvent.click(screen.getByText('Remove'))
    await waitFor(() => expect(lastToast().title).toBe('Action taken'))
    expect(removeActivity).toHaveBeenCalledWith('act1', {
      moderatorId: 'me',
      reason: 'Harassment or abuse — reported by a user',
      reportId: 'r1',
      decision: { status: 'actioned', outcome: 'Activity removed' },
    })
    expect(resolveReport).not.toHaveBeenCalled()
  })

  test('a dismissal is the decision alone, recorded under the claim', async () => {
    resolveReport.mockResolvedValue(undefined)
    setup([report('r1')])
    dismiss()
    await waitFor(() => expect(lastToast().title).toBe('Report dismissed'))
    expect(claimReport).toHaveBeenCalledWith('r1', 'me')
    expect(resolveReport).toHaveBeenCalledWith('r1', {
      status: 'dismissed',
      outcome: 'No action needed',
      moderatorId: 'me',
    })
    expect(suspendAccount).not.toHaveBeenCalled()
    expect(removeActivity).not.toHaveBeenCalled()
  })

  test('a decision that landed without its acknowledgement is "already done", not a colleague’s', async () => {
    // The retry finds the report closed — by this moderator.
    claimReport.mockRejectedValue(moderationError('already-handled', { reviewedBy: 'me' }))
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(lastToast().title).toBe('Already done'))
    expect(lastToast().body).toMatch(/Your decision was recorded the first time/)
    expect(suspendAccount).not.toHaveBeenCalled()
  })

  test('a colleague’s fresh claim: "being handled", and nothing runs', async () => {
    claimReport.mockRejectedValue(moderationError('claim-held'))
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(lastToast().title).toBe('Being handled'))
    expect(suspendAccount).not.toHaveBeenCalled()
  })

  test('a claim lost mid-action: "already handled", nothing recorded, nothing released', async () => {
    suspendAccount.mockRejectedValue(moderationError('claim-lost'))
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(lastToast().title).toBe('Already handled'))
    expect(resolveReport).not.toHaveBeenCalled()
    expect(releaseReport).not.toHaveBeenCalled()
  })

  test('an action that fails releases the claim so a colleague can finish', async () => {
    suspendAccount.mockRejectedValue({ code: 'unavailable' })
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(lastToast().title).toBe("Couldn't complete that"))
    expect(releaseReport).toHaveBeenCalledWith('r1')
    expect(resolveReport).not.toHaveBeenCalled()
  })

  test('a dismissal that could not be recorded releases the claim too', async () => {
    resolveReport.mockRejectedValue({ code: 'unavailable' })
    setup([report('r1')])
    dismiss()
    await waitFor(() => expect(lastToast().title).toBe("Couldn't complete that"))
    expect(releaseReport).toHaveBeenCalledWith('r1')
  })

  test('a report somebody else holds shows who, and its buttons wait', () => {
    setup([report('r1', { claimedBy: 'carol', claimedAt: Date.now() - 1000 })])
    expect(screen.getByText('In review by Carol')).toBeTruthy()
    expect(screen.getByText('Suspend account').closest('button').disabled).toBe(true)
    expect(screen.getByText('Dismiss').closest('button').disabled).toBe(true)
    // A stale claim is nobody's.
    act(() =>
      feeds.reports.onRows([
        report('r1', { claimedBy: 'carol', claimedAt: Date.now() - CLAIM_TTL_MS - 1 }),
      ]),
    )
    expect(screen.queryByText(/In review/)).toBeNull()
    expect(screen.getByText('Suspend account').closest('button').disabled).toBe(false)
  })

  test('a warning from the queue is written under the claim, which it lets go of itself', async () => {
    setup([report('r1')])
    fireEvent.click(screen.getByText('Warn'))
    fireEvent.click(screen.getByText('Send warning'))
    await waitFor(() => expect(issueWarning).toHaveBeenCalledTimes(1))
    expect(claimReport).toHaveBeenCalledWith('r1', 'me')
    expect(issueWarning.mock.calls[0][1]).toMatchObject({ reportId: 'r1', moderatorId: 'me' })
    await waitFor(() => expect(lastToast().title).toBe('Warning issued'))
    // The release is part of the warning's own transaction.
    expect(releaseReport).not.toHaveBeenCalled()
  })

  test('a warning that failed for another reason releases the claim; a lost claim is left alone', async () => {
    issueWarning.mockRejectedValueOnce({ code: 'unavailable' })
    setup([report('r1')])
    fireEvent.click(screen.getByText('Warn'))
    fireEvent.click(screen.getByText('Send warning'))
    await waitFor(() => expect(lastToast().title).toBe("Couldn't complete that"))
    expect(releaseReport).toHaveBeenCalledWith('r1')

    releaseReport.mockClear()
    issueWarning.mockRejectedValueOnce(moderationError('claim-lost'))
    fireEvent.click(screen.getByText('Warn'))
    fireEvent.click(screen.getByText('Send warning'))
    await waitFor(() => expect(lastToast().title).toBe('Already handled'))
    expect(releaseReport).not.toHaveBeenCalled()
  })

  test('offline, nothing is started and the person is told', async () => {
    offline = true
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(lastToast().title).toBe("You're offline"))
    expect(claimReport).not.toHaveBeenCalled()
    expect(suspendAccount).not.toHaveBeenCalled()
  })

  test('an action that outlives the budget unblocks the screen and reports the real outcome later', async () => {
    vi.useFakeTimers()
    try {
      let finish
      suspendAccount.mockReturnValue(new Promise((resolve) => (finish = resolve)))
      setup([report('r1')])
      await confirm()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000)
      })
      expect(lastToast().title).toBe('Still trying')
      expect(screen.getByText('Suspend account').closest('button').disabled).toBe(false)
      await act(async () => {
        finish({ stoodDown: 1, failed: 0 })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(lastToast().title).toBe('Action taken')
      expect(suspendAccount).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test('a refusal on a report that is still open is what it says', async () => {
    suspendAccount.mockRejectedValue({ code: 'permission-denied' })
    setup([report('r1')])
    await confirm()
    await waitFor(() => expect(lastToast().title).toBe("Couldn't complete that"))
    expect(lastToast().body).toBe('You do not have permission.')
    // Nothing landed, so the claim is let go for the next person.
    expect(releaseReport).toHaveBeenCalledWith('r1')
  })
})

describe('searching everyone', () => {
  test('a search the server could not answer is said, not shown as nobody', async () => {
    searchUsers.mockRejectedValue({ code: 'unavailable' })
    at('/moderation/people')
    act(() => feeds.roles.onRows([]))
    act(() => feeds.warnings.onRows([]))
    fireEvent.change(screen.getByPlaceholderText('Name or @username'), {
      target: { value: 'zed' },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/could not be searched/),
    )
  })
})
