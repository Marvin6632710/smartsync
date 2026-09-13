// @vitest-environment jsdom
/**
 * The moderation screens.
 *
 * Characterisation tests, written before splitting the 1,179-line component
 * that renders all four of them. They describe what each route shows and, more
 * importantly, what it refuses to show — the two admin-only sections are
 * reachable by typing a URL, so the guard is the part worth pinning before
 * anything moves.
 *
 * These assert behaviour, not structure, so they stay true after the split.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const noop = () => () => {}
vi.mock('../../src/firebase/moderation', () => ({
  REPORT_PAGE: 100,
  REPORT_REASONS: [{ key: 'harassment', label: 'Harassment or abuse' }],
  watchOpenReports: (cb) => {
    cb([])
    return noop()
  },
  watchRoles: (cb) => {
    cb([])
    return noop()
  },
  watchWarnings: (cb) => {
    cb([])
    return noop()
  },
  closeAccount: vi.fn(),
  issueWarning: vi.fn(),
  liftSuspension: vi.fn(),
  removeActivity: vi.fn(),
  resolveReport: vi.fn(),
  restoreActivity: vi.fn(),
  setUserRole: vi.fn(),
  reopenAccount: vi.fn(),
  suspendAccount: vi.fn(),
}))

let currentUser = { uid: 'me', isModerator: true, isAdmin: true, name: 'Admin' }
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: currentUser }) }))

// The peer window, and the server search that reaches past it.
const searchUsers = vi.fn(async () => [])
vi.mock('../../src/firebase/users', () => ({ PEER_LIMIT: 3, searchUsers }))

const removed = [
  {
    id: 'r1',
    title: 'Taken down thing',
    hostId: 'h1',
    hostName: 'Host One',
    locationName: 'Somewhere',
    status: 'removed',
    updatedAt: Date.now(),
    moderation: { by: 'me', reason: 'Broke the rules' },
  },
]
let directory = new Map([['me', { uid: 'me', name: 'Admin', avatar: 'AD' }]])
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    pushCelebration: vi.fn(),
    directory,
    activities: [],
    allActivities: [],
    removedActivities: removed,
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

beforeEach(() => {
  currentUser = { uid: 'me', isModerator: true, isAdmin: true, name: 'Admin' }
  directory = new Map([['me', { uid: 'me', name: 'Admin', avatar: 'AD' }]])
  searchUsers.mockReset()
  searchUsers.mockResolvedValue([])
})
afterEach(cleanup)

describe('the hub', () => {
  test('shows the report queue and a way into each section', () => {
    at('/moderation')
    expect(screen.getByText('Open reports')).toBeTruthy()
    for (const label of ['Removed activities', 'Everyone on SmartSync', 'Moderators']) {
      expect(screen.getByText(label), `${label} row missing`).toBeTruthy()
    }
  })

  test('a plain moderator is offered only the section they may use', () => {
    currentUser = { uid: 'me', isModerator: true, isAdmin: false, name: 'Mod' }
    at('/moderation')
    expect(screen.getByText('Everyone on SmartSync')).toBeTruthy()
    expect(screen.queryByText('Removed activities')).toBeNull()
    expect(screen.queryByText('Moderators')).toBeNull()
  })
})

describe('the sections', () => {
  test('each shows its own content and not the others', () => {
    at('/moderation/removed')
    expect(screen.getByText('Removed activities')).toBeTruthy()
    expect(screen.queryByText('Open reports')).toBeNull()
    cleanup()

    at('/moderation/people')
    expect(screen.getByText('Everyone on SmartSync')).toBeTruthy()
    expect(screen.queryByText('Open reports')).toBeNull()
    cleanup()

    at('/moderation/moderators')
    expect(screen.getByText('Moderators')).toBeTruthy()
    expect(screen.queryByText('Open reports')).toBeNull()
  })

  test('removed activities lists what was taken down, with its reason', () => {
    at('/moderation/removed')
    expect(screen.getByText('Taken down thing')).toBeTruthy()
    expect(screen.getByText(/Broke the rules/)).toBeTruthy()
  })
})

describe('the guards — these routes are guessable', () => {
  test('a moderator typing an admin URL is told, not shown', () => {
    currentUser = { uid: 'me', isModerator: true, isAdmin: false, name: 'Mod' }
    at('/moderation/removed')
    expect(screen.getByText('Admins only')).toBeTruthy()
    expect(screen.queryByText('Taken down thing')).toBeNull()
    cleanup()

    at('/moderation/moderators')
    expect(screen.getByText('Admins only')).toBeTruthy()
  })

  test('someone who is not a moderator at all sees nothing', () => {
    currentUser = { uid: 'me', isModerator: false, isAdmin: false, name: 'User' }
    at('/moderation')
    expect(screen.getByText('Not available')).toBeTruthy()
    expect(screen.queryByText('Open reports')).toBeNull()
  })

  test('an unknown section says so rather than rendering an empty page', () => {
    at('/moderation/nonsense')
    expect(screen.getByText('No such section')).toBeTruthy()
  })
})

describe('everyone on SmartSync, past the window', () => {
  // The directory in memory is the first PEER_LIMIT accounts. Somebody
  // beyond it used to be unfindable from here, and the heading counted the
  // window as if it were the whole server.
  const person = (uid, name) => [uid, { uid, name, avatar: name.slice(0, 2), username: `@${uid}` }]

  test('says when the list is only the loaded window', () => {
    directory = new Map([person('me', 'Admin'), person('a', 'Ann'), person('b', 'Ben')])
    at('/moderation/people')
    expect(screen.getByText(/The first 3 accounts are loaded/)).toBeTruthy()
    expect(screen.getByText(/3 accounts loaded/)).toBeTruthy()
  })

  test('and does not say so while it is complete', () => {
    at('/moderation/people')
    expect(screen.queryByText(/accounts are loaded/)).toBeNull()
  })

  test('a search also asks the server, and lists who it finds', async () => {
    vi.useFakeTimers()
    searchUsers.mockResolvedValue([
      { uid: 'zed', name: 'Zed Outside', avatar: 'ZO', username: '@zed' },
    ])
    at('/moderation/people')
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
    at('/moderation/people')
    fireEvent.change(screen.getByLabelText('Search everyone'), { target: { value: 'Ann' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    vi.useRealTimers()
    expect(await screen.findAllByText('Ann Able')).toHaveLength(1)
    expect(screen.getByText(/hosts 0, joined 0/)).toBeTruthy()
  })

  test('the search is not run for the queue, only for the directory', () => {
    at('/moderation')
    expect(searchUsers).not.toHaveBeenCalled()
  })
})
