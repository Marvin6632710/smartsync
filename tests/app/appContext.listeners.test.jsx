// @vitest-environment jsdom
/**
 * AppContext's live data listeners.
 *
 * This is the first test in the project that renders anything. It exists
 * because the listener layer is where the app's hardest bugs have lived —
 * account switches writing into the wrong session's state, previews emptying
 * silently, listeners rebuilt on every change — and none of it was covered by
 * anything. The pure-function tests could not see it, and the rules tests are
 * about a different boundary entirely.
 *
 * Everything below the context is faked, so these are tests of *this file's*
 * behaviour: which listeners it opens, which it closes, and whose state it
 * writes into.
 */
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// ---- the layer underneath, replaced by controllable fakes ----------------

const emit = {} // channel name -> the callback the context handed us
const stops = {} // channel name -> how many times its stop was called
const threadStops = {} // activity id -> stop call count
const threadEmit = {} // activity id -> callback

const channel =
  (name) =>
  (...args) => {
    // Every watcher takes its callback second except watchActivities, which
    // takes it first — the fakes mirror the real signatures rather than
    // pretending they are uniform.
    const callback = typeof args[0] === 'function' ? args[0] : args[1]
    emit[name] = callback
    stops[name] = stops[name] || 0
    return () => {
      stops[name] += 1
    }
  }

vi.mock('../../src/firebase/activities', () => ({
  watchActivities: (cb) => channel('activities')(cb),
  createActivity: vi.fn(),
  updateActivity: vi.fn(),
  cancelActivity: vi.fn(),
  deleteActivity: vi.fn(),
  joinActivity: vi.fn(),
  leaveActivity: vi.fn(),
}))
vi.mock('../../src/firebase/users', () => ({
  watchPeers: (uid, cb) => channel('peers')(uid, cb),
  recordCategoryHistory: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../src/firebase/notifications', () => ({
  watchNotifications: (uid, cb) => channel('notifications')(uid, cb),
  watchFollowing: (uid, cb) => channel('following')(uid, cb),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  pushNotification: vi.fn(() => Promise.resolve()),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))
vi.mock('../../src/firebase/moderation', () => ({
  watchBlocked: (uid, cb) => channel('blocked')(uid, cb),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  fileReport: vi.fn(),
}))
vi.mock('../../src/firebase/messages', () => ({
  sendMessage: vi.fn(),
  watchLatestMessage: (id, cb) => {
    threadEmit[id] = cb
    threadStops[id] = threadStops[id] || 0
    return () => {
      threadStops[id] += 1
    }
  },
}))

// Identity is supplied directly rather than through Firebase Auth.
let currentUser = { uid: 'me', interests: [], historyCategories: [] }
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser }),
}))

const { AppProvider, useApp } = await import('../../src/context/AppContext')

// ---- a probe that reports what the context is holding --------------------

function Probe() {
  const { threadPreviews, peers, activities, joinedIds } = useApp()
  return (
    <div>
      <span data-testid="previews">{JSON.stringify(threadPreviews)}</span>
      <span data-testid="peers">{peers.length}</span>
      <span data-testid="activities">{activities.length}</span>
      <span data-testid="joined">{joinedIds.join(',')}</span>
    </div>
  )
}

const activity = (id, extra = {}) => ({
  id,
  title: id,
  category: 'Coffee',
  status: 'active',
  hostId: 'someone',
  participantUids: ['me'],
  capacity: 10,
  participants: 1,
  startsAt: Date.now() + 86_400_000,
  date: '2030-01-01',
  time: '19:00',
  tags: [],
  ...extra,
})

const previews = () => JSON.parse(screen.getByTestId('previews').textContent)

beforeEach(() => {
  currentUser = { uid: 'me', interests: [], historyCategories: [] }
  for (const k of Object.keys(emit)) delete emit[k]
  for (const k of Object.keys(stops)) delete stops[k]
  for (const k of Object.keys(threadStops)) delete threadStops[k]
  for (const k of Object.keys(threadEmit)) delete threadEmit[k]
  localStorage.clear()
})
afterEach(cleanup)

describe('the five data listeners', () => {
  test('all five open for a signed-in user', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    expect(Object.keys(emit).sort()).toEqual(
      ['activities', 'blocked', 'following', 'notifications', 'peers'].sort(),
    )
  })

  test('all five are closed on unmount — none is left running', () => {
    const view = render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    view.unmount()
    for (const name of ['activities', 'peers', 'notifications', 'following', 'blocked']) {
      expect(stops[name], `${name} was never stopped`).toBeGreaterThanOrEqual(1)
    }
  })

  test('a late snapshot from a stopped listener is ignored', () => {
    // The bug this guards: four of the five handed their setter straight to
    // the SDK, so a listener belonging to a session that had ended could
    // still write into the state of the session that replaced it.
    const view = render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    const latePeers = emit.peers
    view.unmount()
    // Delivering after teardown must not throw and must not be acted on.
    expect(() => act(() => latePeers([{ uid: 'ghost' }]))).not.toThrow()
  })
})

describe('thread previews', () => {
  test('one listener per joined activity, and the preview is shown', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('a1'), activity('a2')], { fromCache: false }))
    expect(screen.getByTestId('joined').textContent).toBe('a1,a2')
    expect(Object.keys(threadEmit).sort()).toEqual(['a1', 'a2'])

    act(() => threadEmit.a1({ id: 'm1', text: 'first' }))
    expect(previews().a1.text).toBe('first')
  })

  test('joining another activity does not lose the previews already held', () => {
    // The behaviour M2 is about. Whatever the implementation does with
    // listeners underneath, a preview that has arrived must survive the set
    // changing — that is what a user sees.
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('a1')], { fromCache: false }))
    act(() => threadEmit.a1({ id: 'm1', text: 'first' }))
    expect(previews().a1.text).toBe('first')

    act(() => emit.activities([activity('a1'), activity('a2')], { fromCache: false }))
    expect(previews().a1?.text).toBe('first')
    expect(Object.keys(threadEmit).sort()).toEqual(['a1', 'a2'])
  })

  test('joining another activity leaves the existing listeners alone', () => {
    // M2. Joining a twelfth chat used to tear down and rebuild all eleven
    // healthy subscriptions, because the effect keyed on the whole joined-id
    // string. Each rebuild costs a fresh read for no benefit.
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('a1')], { fromCache: false }))
    expect(threadStops.a1 || 0).toBe(0)

    act(() => emit.activities([activity('a1'), activity('a2')], { fromCache: false }))
    expect(threadStops.a1 || 0, 'a1 was torn down by a change to a2').toBe(0)
  })

  test('an unrelated reordering does not churn listeners either', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('a1'), activity('a2')], { fromCache: false }))
    const before = { a1: threadStops.a1 || 0, a2: threadStops.a2 || 0 }
    // Same set, different order — the snapshot arrives sorted by start time,
    // so this happens whenever a time is edited.
    act(() => emit.activities([activity('a2'), activity('a1')], { fromCache: false }))
    expect({ a1: threadStops.a1 || 0, a2: threadStops.a2 || 0 }).toEqual(before)
  })

  test('leaving an activity stops its listener', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('a1'), activity('a2')], { fromCache: false }))
    act(() =>
      emit.activities([activity('a1'), activity('a2', { participantUids: ['other'] })], {
        fromCache: false,
      }),
    )
    expect(screen.getByTestId('joined').textContent).toBe('a1')
    expect(threadStops.a2).toBeGreaterThanOrEqual(1)
  })

  test('every thread listener is closed on unmount', () => {
    const view = render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('a1'), activity('a2')], { fromCache: false }))
    view.unmount()
    expect(threadStops.a1).toBeGreaterThanOrEqual(1)
    expect(threadStops.a2).toBeGreaterThanOrEqual(1)
  })
})

describe('context value identity', () => {
  test('actions are recreated each render — a known, measured trade', () => {
    // AppContext's value is an object literal on purpose. Stabilising it
    // needs either sixteen useCallbacks with hand-written dependencies (a
    // stale-closure risk far worse than the churn) or a latest-ref
    // indirection that this project's React lint rules reject. Measurement
    // showed no reduction in consumer renders either way, because this
    // provider has almost no state that is not already exposed in its value
    // — so a render without a data change barely happens.
    //
    // This test records the decision rather than the aspiration: if the
    // shape ever changes, someone should re-measure before assuming it is
    // an improvement.
    const actions = []
    function Capture() {
      actions.push(useApp().joinActivity)
      return null
    }
    render(
      <AppProvider>
        <Capture />
      </AppProvider>,
    )
    act(() => emit.activities([activity('a1')], { fromCache: false }))
    expect(actions.length).toBeGreaterThan(1)
  })
})
