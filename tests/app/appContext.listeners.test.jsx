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
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

const createActivityDoc = vi.fn()
vi.mock('../../src/firebase/activities', () => ({
  watchActivities: (cb) => channel('activities')(cb),
  watchMyActivities: (uid, cb) => channel('mine')(uid, cb),
  DISCOVERY_LIMIT: 400,
  MINE_LIMIT: 200,
  createActivity: createActivityDoc,
  updateActivity: vi.fn(),
  cancelActivity: vi.fn(),
  deleteActivity: vi.fn(),
  joinActivity: vi.fn(),
  leaveActivity: vi.fn(),
}))
const completeIdentitySweep = vi.fn(() => Promise.resolve(0))
vi.mock('../../src/firebase/users', () => ({
  watchPeers: (uid, cb) => channel('peers')(uid, cb),
  recordCategoryHistory: vi.fn(() => Promise.resolve()),
  saveReadingLocale: vi.fn(() => Promise.resolve()),
  completeIdentitySweep,
}))
const followUser = vi.fn(() => Promise.resolve())
const unfollowUser = vi.fn(() => Promise.resolve())
const ensureFollowerMirror = vi.fn(() => Promise.resolve(false))
const notifyFollowers = vi.fn(() => Promise.resolve({ told: 0, declined: 0, failed: 0 }))
const reportError = vi.fn()
vi.mock('../../src/utils/reportError', () => ({ reportError }))
// Sending is a callable Cloud Function that moderates first (ADR-033).
const sendChatMessageCall = vi.fn(async () => ({ status: 'sent', id: 'm1' }))
const requestChatReview = vi.fn(async () => ({ status: 'appealed' }))
vi.mock('../../src/firebase/chat', () => ({
  sendChatMessage: (...args) => sendChatMessageCall(...args),
  requestChatReview: (...args) => requestChatReview(...args),
}))
vi.mock('../../src/firebase/notifications', () => ({
  watchNotifications: (uid, cb) => channel('notifications')(uid, cb),
  watchUnreadCount: (uid, cb) => channel('unread')(uid, cb),
  watchFollowing: (uid, cb) => channel('following')(uid, cb),
  followUser,
  unfollowUser,
  ensureFollowerMirror,
  notifyFollowers,
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
const outcomeOf = vi.fn(async () => 'landed')
const drainQueue = vi.fn(async () => {})
vi.mock('../../src/firebase/pending', async (importActual) => ({
  ...(await importActual()),
  outcomeOf,
  drainQueue,
}))
const threadError = {} // activity id -> the error callback
vi.mock('../../src/firebase/messages', async () => ({
  // The real one: the thread gate below is decided by it, and faking it
  // here would only prove the fake agrees with itself.
  isChatClosed: (await vi.importActual('../../src/firebase/messages')).isChatClosed,
  sendMessage: vi.fn(),
  watchLatestMessage: (id, cb, onError) => {
    threadEmit[id] = cb
    threadError[id] = onError
    threadStops[id] = threadStops[id] || 0
    return () => {
      threadStops[id] += 1
    }
  },
}))

// The credential layer under the retry guard. `currentUid` agrees with the
// signed-in user so the guard is live, and the refresh is a spy so a test can
// say whether the retry machinery fired.
const refreshCredential = vi.fn(() => Promise.resolve())
vi.mock('../../src/firebase/auth', () => ({
  currentUid: () => currentUser?.uid || null,
  refreshCredential,
}))

// Identity is supplied directly rather than through Firebase Auth.
let currentUser = { uid: 'me', interests: [], historyCategories: [] }
// Whether AuthContext's profile listeners have heard from the server — the
// proof of life the silence probe consults. Read on each render, so a test
// flips it and then causes a render.
let serverSeen = false
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, serverSeen }),
}))

const { AppProvider, useApp, SERVER_SILENCE_MS } = await import('../../src/context/AppContext')
const { forgetDurable } = await import('../../src/utils/storage')
const { updateActivity: updateActivityDoc } = await import('../../src/firebase/activities')

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
  serverSeen = false
  completeIdentitySweep.mockReset()
  completeIdentitySweep.mockResolvedValue(0)
  for (const k of Object.keys(emit)) delete emit[k]
  for (const k of Object.keys(stops)) delete stops[k]
  for (const k of Object.keys(threadStops)) delete threadStops[k]
  for (const k of Object.keys(threadEmit)) delete threadEmit[k]
  for (const k of Object.keys(threadError)) delete threadError[k]
  refreshCredential.mockClear()
  followUser.mockClear()
  unfollowUser.mockClear()
  ensureFollowerMirror.mockClear()
  notifyFollowers.mockClear()
  reportError.mockClear()
  sendChatMessageCall.mockClear()
  sendChatMessageCall.mockImplementation(async () => ({ status: 'sent', id: 'm1' }))
  createActivityDoc.mockReset()
  outcomeOf.mockReset()
  outcomeOf.mockResolvedValue('landed')
  drainQueue.mockReset()
  drainQueue.mockResolvedValue(undefined)
  localStorage.clear()
  sessionStorage.clear()
  // The durable store keeps a memory copy for the life of the module —
  // which, here, is the whole file.
  forgetDurable()
})
afterEach(cleanup)

describe('the data listeners', () => {
  const names = ['activities', 'blocked', 'following', 'mine', 'notifications', 'peers', 'unread']

  test('all of them open for a signed-in user', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    expect(Object.keys(emit).sort()).toEqual([...names].sort())
  })

  test('all of them are closed on unmount — none is left running', () => {
    const view = render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    view.unmount()
    for (const name of names) {
      expect(stops[name], `${name} was never stopped`).toBeGreaterThanOrEqual(1)
    }
  })

  test('the unread count is the badge listener’s number, and a new account starts at nought', () => {
    let seen
    function Count() {
      seen = useApp().unreadCount
      return null
    }
    const view = render(
      <AppProvider>
        <Count />
      </AppProvider>,
    )
    expect(seen).toBe(0)
    act(() => emit.unread(3))
    expect(seen).toBe(3)
    act(() => emit.unread(100))
    expect(seen).toBe(100)
    // Somebody else signs in: their badge does not inherit the last count.
    currentUser = { uid: 'other', interests: [], historyCategories: [] }
    view.rerender(
      <AppProvider>
        <Count />
      </AppProvider>,
    )
    expect(seen).toBe(0)
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

describe('a closed account', () => {
  test('opens no listeners at all', () => {
    // Every one of them is refused by the rules, and the account sees one
    // screen that needs none of them. Opening them anyway spent the retry
    // budget and two token refreshes on every boot.
    currentUser = { uid: 'me', banned: true, interests: [], historyCategories: [] }
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    expect(Object.keys(emit)).toEqual([])
    expect(refreshCredential).not.toHaveBeenCalled()
  })
})

describe('the discovery cap must not lose your own commitments', () => {
  test('an activity beyond the discovery window still counts as joined', () => {
    // H2. Discovery is capped by start time, so something joined far enough
    // ahead falls outside it. Without the personal feed alongside, a person
    // would join something and then watch it disappear from their own list.
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    // The capped feed knows nothing about it.
    act(() => emit.activities([activity('near')], { fromCache: false }))
    expect(screen.getByTestId('joined').textContent).toBe('near')

    // The personal feed does.
    act(() => emit.mine([activity('far-future', { startsAt: Date.now() + 400 * 86_400_000 })]))
    expect(screen.getByTestId('joined').textContent.split(',').sort()).toEqual([
      'far-future',
      'near',
    ])
  })

  test('an activity in both feeds is not duplicated', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('a1')], { fromCache: false }))
    act(() => emit.mine([activity('a1')]))
    expect(screen.getByTestId('joined').textContent).toBe('a1')
    expect(screen.getByTestId('activities').textContent).toBe('1')
  })

  test('the personal feed alone is enough to open a thread', () => {
    // The preview listeners key off joinedIds, so this proves the merge
    // reaches everything downstream of it rather than only the count.
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: false }))
    act(() => emit.mine([activity('only-mine')]))
    expect(Object.keys(threadEmit)).toContain('only-mine')
  })
})

describe('the discovery filters', () => {
  // What the feed, the search and the map all read.
  let seen
  function FilterProbe() {
    const { filters, filteredActivities, setFilters, resetFilters } = useApp()
    seen = { filters, ids: filteredActivities.map((a) => a.id).sort(), setFilters, resetFilters }
    return null
  }
  const stored = () => JSON.parse(localStorage.getItem('smartsync:filters'))
  const feed = () =>
    act(() =>
      emit.activities(
        [
          activity('foot-am', { category: 'Football', timeBand: 'Morning', hostId: 'h' }),
          activity('foot-pm', { category: 'Football', timeBand: 'Afternoon', hostId: 'h' }),
          activity('ball-ev', { category: 'Basketball', timeBand: 'Evening', hostId: 'h' }),
          activity('run-am', { category: 'Running', timeBand: 'Morning', hostId: 'h' }),
          activity('run-full', {
            category: 'Running',
            timeBand: 'Morning',
            hostId: 'h',
            participants: 10,
          }),
        ],
        { fromCache: false },
      ),
    )

  test('a filter saved by an older version — one choice per group — is read as a set of one, and written back as one', () => {
    localStorage.setItem(
      'smartsync:filters',
      JSON.stringify({
        category: 'Football',
        maxDistance: 5,
        timeBand: 'Morning',
        availableOnly: false,
      }),
    )
    render(
      <AppProvider>
        <FilterProbe />
      </AppProvider>,
    )
    expect(seen.filters).toEqual({
      categories: ['Football'],
      maxDistance: 5,
      timeBands: ['Morning'],
      availableOnly: false,
    })
    expect(stored()).toEqual(seen.filters)
    feed()
    expect(seen.ids).toEqual(['foot-am'])
  })

  test("the older 'All' and 'Any' read as no restriction", () => {
    localStorage.setItem(
      'smartsync:filters',
      JSON.stringify({ category: 'All', maxDistance: 10, timeBand: 'Any', availableOnly: true }),
    )
    render(
      <AppProvider>
        <FilterProbe />
      </AppProvider>,
    )
    expect(seen.filters).toEqual({
      categories: [],
      maxDistance: 10,
      timeBands: [],
      availableOnly: true,
    })
    feed()
    // Everything with a spot left.
    expect(seen.ids).toEqual(['ball-ev', 'foot-am', 'foot-pm', 'run-am'])
  })

  test('any of the chosen categories, at any of the chosen times, with room — and Reset opens it all up again', () => {
    render(
      <AppProvider>
        <FilterProbe />
      </AppProvider>,
    )
    feed()
    act(() =>
      seen.setFilters({
        categories: ['Football', 'Basketball'],
        maxDistance: 10,
        timeBands: ['Morning', 'Evening'],
        availableOnly: true,
      }),
    )
    // Football in the morning and basketball in the evening; not football
    // in the afternoon, and nothing that is running.
    expect(seen.ids).toEqual(['ball-ev', 'foot-am'])
    expect(stored().categories).toEqual(['Football', 'Basketball'])
    act(() => seen.setFilters({ ...seen.filters, categories: ['Running'], timeBands: [] }))
    // The switch still hides the full one.
    expect(seen.ids).toEqual(['run-am'])
    act(() => seen.setFilters({ ...seen.filters, availableOnly: false }))
    expect(seen.ids).toEqual(['run-am', 'run-full'])
    act(() => seen.resetFilters())
    expect(seen.filters).toEqual({
      categories: [],
      maxDistance: 10,
      timeBands: [],
      availableOnly: true,
    })
    expect(seen.ids).toEqual(['ball-ev', 'foot-am', 'foot-pm', 'run-am'])
  })
})

describe('closed threads and the retry budget', () => {
  const DAY = 86_400_000
  const denial = { code: 'permission-denied' }
  const flush = () =>
    act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

  test('a thread the rules have closed is never opened', () => {
    // The personal feed has no time floor, so it carries activities from
    // months ago. Their chat closed thirty days after they happened; asking
    // for a preview is refused, and the refusal used to look like a revoked
    // token.
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: false }))
    act(() => emit.mine([activity('long-ago', { startsAt: Date.now() - 45 * DAY })]))

    expect(screen.getByTestId('joined').textContent).toBe('long-ago')
    expect(threadEmit['long-ago']).toBeUndefined()
    expect(refreshCredential).not.toHaveBeenCalled()
  })

  test('a thread inside retention is still opened', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: false }))
    act(() => emit.mine([activity('last-week', { startsAt: Date.now() - 7 * DAY })]))
    expect(threadEmit['last-week']).toBeDefined()
  })

  test('the last hour before the cut-off is left alone too', () => {
    // The server decides with its clock and the app with the phone's. A
    // phone a few minutes behind would open a listener the server had already
    // closed — which is the same wasted retry. So the app stops an hour early.
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: false }))
    act(() =>
      emit.mine([
        activity('edge', { startsAt: Date.now() - 30 * DAY + 30 * 60_000 }),
        activity('clear', { startsAt: Date.now() - 30 * DAY + 2 * 60 * 60_000 }),
      ]),
    )
    expect(threadEmit.edge).toBeUndefined()
    expect(threadEmit.clear).toBeDefined()
  })

  test('a thread is not opened while the create that put you on it is in flight', () => {
    // Creating updates the local copy before the server has accepted it. The
    // messages rule reads the activity on the server, where it does not exist
    // yet, so a listener opened now is refused — and the refusal spent a
    // retry. A create in flight is a pending write whose server timestamp has
    // not resolved.
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() =>
      emit.activities([activity('fresh', { pendingWrite: true, createdAt: null })], {
        fromCache: false,
      }),
    )
    expect(screen.getByTestId('joined').textContent).toBe('fresh')
    expect(threadEmit.fresh).toBeUndefined()

    // The server accepts it: the snapshot fires again with the timestamp set.
    act(() =>
      emit.activities([activity('fresh', { pendingWrite: false, createdAt: 1 })], {
        fromCache: false,
      }),
    )
    expect(threadEmit.fresh).toBeDefined()
    expect(refreshCredential).not.toHaveBeenCalled()
  })

  test('but a host editing their own activity keeps their thread open', () => {
    // An edit is a pending write too. Gating on that would close and reopen
    // the host's chat for nothing — or, offline, hide the messages they had.
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('mine', { createdAt: 1 })], { fromCache: false }))
    expect(threadEmit.mine).toBeDefined()
    act(() =>
      emit.activities([activity('mine', { createdAt: 1, pendingWrite: true, title: 'Renamed' })], {
        fromCache: false,
      }),
    )
    expect(threadStops.mine).toBe(0)
  })

  test('nor while a join this client sent is still unanswered', async () => {
    let resolveJoin
    const { joinActivity: joinDoc } = await import('../../src/firebase/activities')
    joinDoc.mockImplementationOnce(() => new Promise((resolve) => (resolveJoin = resolve)))
    function Joiner() {
      const { joinActivity } = useApp()
      return <button onClick={() => joinActivity('open')}>join</button>
    }
    render(
      <AppProvider>
        <Probe />
        <Joiner />
      </AppProvider>,
    )
    act(() =>
      emit.activities([activity('open', { participantUids: ['someone'], createdAt: 1 })], {
        fromCache: false,
      }),
    )
    fireEvent.click(screen.getByText('join'))
    // The local snapshot now shows us on the roster, write still pending.
    act(() =>
      emit.activities(
        [
          activity('open', {
            participantUids: ['someone', 'me'],
            createdAt: 1,
            pendingWrite: true,
          }),
        ],
        { fromCache: false },
      ),
    )
    expect(screen.getByTestId('joined').textContent).toBe('open')
    expect(threadEmit.open).toBeUndefined()

    await act(async () => {
      resolveJoin()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(threadEmit.open).toBeDefined()
  })

  test('a genuine denial on an open thread still buys a refresh and a rebuild', async () => {
    // The guard exists for the sign-in race: the watch stream reattaches
    // carrying a token that has just been revoked, and every listener is
    // refused once. That behaviour has to survive the gate above.
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('live')], { fromCache: false }))
    const before = { ...stops }

    await act(async () => {
      threadError.live(denial)
      await flush()
    })
    expect(refreshCredential).toHaveBeenCalledTimes(1)
    expect(stops.activities).toBe(before.activities + 1)
    expect(threadStops.live).toBe(1)
    // Rebuilt, and listening again.
    expect(threadError.live).toBeDefined()
  })

  test('and after the budget, a denial empties the preview rather than looping', async () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    act(() => emit.activities([activity('live')], { fromCache: false }))
    act(() => threadEmit.live({ id: 'm1', text: 'hi', senderName: 'A', createdAt: 1 }))

    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        threadError.live(denial)
        await flush()
      })
    }
    expect(refreshCredential).toHaveBeenCalledTimes(2)
    await act(async () => {
      threadError.live(denial)
      await flush()
    })
    expect(refreshCredential).toHaveBeenCalledTimes(2)
    expect(JSON.parse(screen.getByTestId('previews').textContent)).toEqual({ live: null })
  })
})

describe('following somebody', () => {
  // A screen with the two actions and the toast, the way UserMatchingPage and
  // CreateActivityPage see them.
  function Actions() {
    const { toggleUserNotifications, createActivity, celebration, followedUserIds } = useApp()
    return (
      <div>
        <button onClick={() => toggleUserNotifications({ uid: 'them', name: 'Them' })}>
          toggle
        </button>
        <button
          onClick={() =>
            createActivity({ title: 'Five-a-side', locationName: 'The park', category: 'Football' })
          }
        >
          create
        </button>
        <span data-testid="toast">{celebration?.title || ''}</span>
        <span data-testid="following">{followedUserIds.join(',')}</span>
      </div>
    )
  }
  const flush = () =>
    act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  const mount = () => {
    render(
      <AppProvider>
        <Actions />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: false }))
  }

  test('a follow that lands says so', async () => {
    mount()
    act(() => emit.following([]))
    fireEvent.click(screen.getByText('toggle'))
    await flush()
    expect(followUser).toHaveBeenCalledWith('me', 'them')
    expect(screen.getByTestId('toast').textContent).toBe('Notifications on')
  })

  test('a follow that is refused says that instead — and nothing is left unhandled', async () => {
    // It used to fire the write, forget it, and show "Notifications on"
    // regardless. The rejection went to the console as unhandled.
    followUser.mockImplementationOnce(() => Promise.reject({ code: 'permission-denied' }))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    mount()
    act(() => emit.following([]))
    fireEvent.click(screen.getByText('toggle'))
    await flush()
    process.off('unhandledRejection', unhandled)
    expect(screen.getByTestId('toast').textContent).toBe("Couldn't turn those on")
    expect(unhandled).not.toHaveBeenCalled()
  })

  test('two taps before the first lands write one follow, not two', async () => {
    // The host-side half may not be rewritten once it exists, so a repeat
    // would be refused — and report a failure for something that worked.
    let release
    followUser.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    mount()
    act(() => emit.following([]))
    fireEvent.click(screen.getByText('toggle'))
    fireEvent.click(screen.getByText('toggle'))
    await flush()
    expect(followUser).toHaveBeenCalledTimes(1)
    await act(async () => {
      release()
      await flush()
    })
    expect(screen.getByTestId('toast').textContent).toBe('Notifications on')
    // And once it has landed, the next tap is a real one again.
    act(() => emit.following(['them']))
    fireEvent.click(screen.getByText('toggle'))
    await flush()
    expect(unfollowUser).toHaveBeenCalledTimes(1)
  })

  test('unfollowing goes through the same door', async () => {
    mount()
    act(() => emit.following(['them']))
    fireEvent.click(screen.getByText('toggle'))
    await flush()
    expect(unfollowUser).toHaveBeenCalledWith('me', 'them')
    expect(screen.getByTestId('toast').textContent).toBe('Notifications off')
  })

  test('creating an activity tells the followers, skipping anyone the host blocked', async () => {
    createActivityDoc.mockResolvedValue('new-id')
    mount()
    act(() => emit.blocked([{ uid: 'blocked-one', name: 'B' }]))
    fireEvent.click(screen.getByText('create'))
    await flush()
    expect(notifyFollowers).toHaveBeenCalledTimes(1)
    const [hostId, activityId, options] = notifyFollowers.mock.calls[0]
    expect(hostId).toBe('me')
    expect(activityId).toBe('new-id')
    expect(options.skip.has('blocked-one')).toBe(true)
    expect(options.body).toBe('Five-a-side at The park')
  })

  test('a creation that failed tells nobody', async () => {
    createActivityDoc.mockRejectedValue({ code: 'permission-denied' })
    mount()
    fireEvent.click(screen.getByText('create'))
    await flush()
    expect(notifyFollowers).not.toHaveBeenCalled()
    expect(screen.getByTestId('toast').textContent).toBe("Couldn't create activity")
  })

  test('older follows get their host-side half written, once each', async () => {
    // Follows made before the mirror existed are invisible to the host. Each
    // is checked once per session, and a later snapshot does not check again.
    ensureFollowerMirror.mockResolvedValue(true)
    mount()
    act(() => emit.following(['a', 'b']))
    await flush()
    expect(ensureFollowerMirror.mock.calls.map((c) => c[1]).sort()).toEqual(['a', 'b'])

    act(() => emit.following(['a', 'b', 'c']))
    await flush()
    expect(ensureFollowerMirror).toHaveBeenCalledTimes(3)
    expect(ensureFollowerMirror.mock.calls[2]).toEqual(['me', 'c'])
  })

  test('a mirror that could not be written is tried again next time', async () => {
    ensureFollowerMirror.mockRejectedValueOnce(new Error('offline'))
    mount()
    act(() => emit.following(['a']))
    await flush()
    act(() => emit.following(['a']))
    await flush()
    expect(ensureFollowerMirror).toHaveBeenCalledTimes(2)
  })

  test('a new account starts the mirror bookkeeping afresh', async () => {
    mount()
    act(() => emit.following(['a']))
    await flush()
    expect(ensureFollowerMirror).toHaveBeenCalledTimes(1)

    currentUser = { uid: 'someone-else', interests: [], historyCategories: [] }
    cleanup()
    mount()
    act(() => emit.following(['a']))
    await flush()
    expect(ensureFollowerMirror).toHaveBeenCalledTimes(2)
    expect(ensureFollowerMirror.mock.calls[1]).toEqual(['someone-else', 'a'])
  })
})

describe('a message in a thread', () => {
  // Sending moved to a callable Cloud Function that moderates first
  // (ADR-033), so nothing here writes a message or a chat notification.
  // What the context still owns is the pending row the author sees while
  // that call is in flight, and what becomes of it.
  function Composer() {
    const { sendMessage, chatPending, retryChatMessage, discardChatMessage } = useApp()
    return (
      <div>
        <button onClick={() => sendMessage('t1', 'hello')}>send</button>
        <button onClick={() => retryChatMessage(chatPending[0]?.id)}>retry</button>
        <button onClick={() => discardChatMessage(chatPending[0]?.id)}>discard</button>
        <span data-testid="pending">
          {JSON.stringify(
            chatPending.map(({ text, status, reason }) => ({ text, status, reason })),
          )}
        </span>
      </div>
    )
  }
  const pending = () => JSON.parse(screen.getByTestId('pending').textContent)
  const flush = () =>
    act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  const thread = (extra = {}) =>
    activity('t1', { participantUids: ['me', 'p1', 'p2', 'p3'], participants: 4, ...extra })
  const mount = () => {
    render(
      <AppProvider>
        <Composer />
      </AppProvider>,
    )
    act(() => emit.activities([thread()], { fromCache: false }))
    act(() => emit.peers([]))
  }

  test('the message is handed to moderation, never written here', async () => {
    sendChatMessageCall.mockResolvedValueOnce({ status: 'sent', id: 'm1' })
    mount()
    fireEvent.click(screen.getByText('send'))
    // On screen as "being checked" before anything comes back, and on
    // nobody else's screen at all.
    expect(pending()).toMatchObject([{ text: 'hello', status: 'checking' }])
    await flush()
    const [request] = sendChatMessageCall.mock.calls[0]
    expect(request).toMatchObject({ activityId: 't1', text: 'hello' })
    expect(request.clientMsgId).toMatch(/^[a-f0-9]{24}$/)
    // Approved: the row goes, and the thread's own listener is what shows it.
    expect(pending()).toEqual([])
  })

  test('a refusal keeps the words with their author, with the reason', async () => {
    sendChatMessageCall.mockResolvedValueOnce({ status: 'blocked', reason: 'harassment' })
    mount()
    fireEvent.click(screen.getByText('send'))
    await flush()
    expect(pending()).toMatchObject([{ text: 'hello', status: 'blocked', reason: 'harassment' }])
  })

  test('the kind of failure survives, not just that there was one', async () => {
    // Everything the moderator could not do comes back as `unavailable`
    // with the kind underneath it. Keeping only the status threw the
    // kind away, so an unpaid account and a service outage read the
    // same — and three wordings in the locale files were unreachable.
    sendChatMessageCall.mockResolvedValueOnce({ status: 'unavailable', reason: 'refused' })
    mount()
    fireEvent.click(screen.getByText('send'))
    await flush()
    expect(pending()).toMatchObject([{ status: 'failed', reason: 'refused' }])
  })

  test('a status with no kind under it still reports the status', async () => {
    sendChatMessageCall.mockResolvedValueOnce({ status: 'rate-limited', retryAfterSeconds: 120 })
    mount()
    fireEvent.click(screen.getByText('send'))
    await flush()
    expect(pending()).toMatchObject([{ status: 'failed', reason: 'rate-limited' }])
  })

  test('a retry re-sends the same message id, so a timeout cannot post it twice', async () => {
    sendChatMessageCall.mockRejectedValueOnce(new Error('timeout'))
    mount()
    fireEvent.click(screen.getByText('send'))
    await flush()
    expect(pending()).toMatchObject([{ status: 'failed' }])
    sendChatMessageCall.mockResolvedValueOnce({ status: 'sent', id: 'm1' })
    fireEvent.click(screen.getByText('retry'))
    await flush()
    const first = sendChatMessageCall.mock.calls[0][0].clientMsgId
    const second = sendChatMessageCall.mock.calls[1][0].clientMsgId
    expect(second).toBe(first)
    expect(pending()).toEqual([])
  })

  test('offline: it waits, and goes when the connection is back', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    sendChatMessageCall.mockRejectedValueOnce(new Error('offline'))
    mount()
    fireEvent.click(screen.getByText('send'))
    await flush()
    expect(pending()).toMatchObject([{ status: 'failed', reason: 'offline' }])
    // Nothing was reported as an error: being offline is not a fault.
    expect(reportError).not.toHaveBeenCalled()
    online.mockReturnValue(true)
    sendChatMessageCall.mockResolvedValueOnce({ status: 'sent', id: 'm1' })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
      await Promise.resolve()
    })
    // Checked on the way through, like every other message.
    expect(sendChatMessageCall).toHaveBeenCalledTimes(2)
    expect(pending()).toEqual([])
    online.mockRestore()
  })

  test('discarding it is the author throwing it away, and nothing else', async () => {
    sendChatMessageCall.mockResolvedValueOnce({ status: 'blocked', reason: 'hate' })
    mount()
    fireEvent.click(screen.getByText('send'))
    await flush()
    fireEvent.click(screen.getByText('discard'))
    expect(pending()).toEqual([])
  })
})

describe('joining twice', () => {
  test('two taps before the first lands send one join and one notice', async () => {
    const { joinActivity: joinDoc } = await import('../../src/firebase/activities')
    const { pushNotification } = await import('../../src/firebase/notifications')
    let resolveJoin
    joinDoc.mockImplementationOnce(() => new Promise((resolve) => (resolveJoin = resolve)))
    pushNotification.mockClear()
    function Joiner() {
      const { joinActivity } = useApp()
      return <button onClick={() => joinActivity('open')}>join</button>
    }
    render(
      <AppProvider>
        <Joiner />
      </AppProvider>,
    )
    act(() =>
      emit.activities(
        [activity('open', { participantUids: ['host'], hostId: 'host', createdAt: 1 })],
        { fromCache: false },
      ),
    )
    act(() => emit.peers([{ uid: 'host', name: 'Host', notificationsEnabled: true }]))
    fireEvent.click(screen.getByText('join'))
    fireEvent.click(screen.getByText('join'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(joinDoc).toHaveBeenCalledTimes(1)
    expect(pushNotification).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveJoin()
      await Promise.resolve()
      await Promise.resolve()
    })
  })
})

describe('the order your commitments are kept in', () => {
  function Joined() {
    const { joinedActivities } = useApp()
    return <span data-testid="order">{joinedActivities.map((a) => a.id).join(',')}</span>
  }
  const DAY = 86_400_000

  test('upcoming soonest first, then the past most recent first', () => {
    // One ascending sort put a month-old activity at the top and tonight's
    // at the bottom once the personal feed started carrying history.
    render(
      <AppProvider>
        <Joined />
      </AppProvider>,
    )
    const now = Date.now()
    act(() =>
      emit.activities(
        [
          activity('next-week', { startsAt: now + 7 * DAY }),
          activity('tonight', { startsAt: now + 3 * 60 * 60_000 }),
        ],
        { fromCache: false },
      ),
    )
    act(() =>
      emit.mine([
        activity('last-month', { startsAt: now - 30 * DAY }),
        activity('yesterday', { startsAt: now - DAY }),
        activity('not-mine', { startsAt: now - 2 * DAY, participantUids: ['someone'] }),
      ]),
    )
    expect(screen.getByTestId('order').textContent).toBe('tonight,next-week,yesterday,last-month')
  })

  test('a cancelled activity you joined stays in the list', () => {
    render(
      <AppProvider>
        <Joined />
      </AppProvider>,
    )
    act(() =>
      emit.activities([activity('called-off', { status: 'cancelled' })], { fromCache: false }),
    )
    expect(screen.getByTestId('order').textContent).toBe('called-off')
  })
})

describe('a write while offline', () => {
  // Every awaited write used to sit behind "Saving…" until the server
  // answered — never, offline. These pin the bounded wait: the write is
  // still queued, the screen moves on, the toast says so, and a refusal
  // that arrives later is still shown.
  function Writer() {
    const { createActivity, updateActivity, sendMessage, celebration, offline } = useApp()
    const [result, setResult] = React.useState('')
    return (
      <div>
        <button
          onClick={async () => {
            const id = await createActivity({
              title: 'Late run',
              locationName: 'Park',
              category: 'Running',
            })
            setResult(String(id))
          }}
        >
          create
        </button>
        <button
          onClick={async () => {
            const ok = await updateActivity('a1', { title: 'x' })
            setResult(String(ok))
          }}
        >
          edit
        </button>
        <button
          onClick={async () => {
            const sent = await sendMessage('t1', 'hello')
            setResult(sent === null ? 'null' : 'sent')
          }}
        >
          send
        </button>
        <button onClick={async () => setResult(String(await sendMessage('t1', '   ')))}>
          send-blank
        </button>
        <span data-testid="result">{result}</span>
        <span data-testid="toast">{celebration?.title || ''}</span>
        <span data-testid="toast-body">{celebration?.body || ''}</span>
        <span data-testid="offline">{String(offline)}</span>
      </div>
    )
  }
  // The offline budget is a zero-length timer, so a macrotask has to pass.
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      for (let i = 0; i < 6; i += 1) await Promise.resolve()
    })
  const goOffline = () => act(() => window.dispatchEvent(new Event('offline')))
  const goOnline = () => act(() => window.dispatchEvent(new Event('online')))
  const never = () => new Promise(() => {})

  test('creating offline hands back the locally minted id and says it will sync', async () => {
    const pending = never()
    pending.id = 'minted-1'
    createActivityDoc.mockReturnValue(pending)
    render(
      <AppProvider>
        <Writer />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: true }))
    goOffline()
    fireEvent.click(screen.getByText('create'))
    await flush()
    expect(screen.getByTestId('result').textContent).toBe('minted-1')
    expect(screen.getByTestId('toast').textContent).toBe('Activity created — will sync')
    goOnline()
  })

  test('the followers are told once the connection is back, not from an offline cache', async () => {
    const pending = never()
    pending.id = 'minted-2'
    createActivityDoc.mockReturnValue(pending)
    render(
      <AppProvider>
        <Writer />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: true }))
    goOffline()
    fireEvent.click(screen.getByText('create'))
    await flush()
    expect(notifyFollowers).not.toHaveBeenCalled()
    goOnline()
    await flush()
    expect(notifyFollowers).toHaveBeenCalledTimes(1)
    expect(notifyFollowers.mock.calls[0][1]).toBe('minted-2')
  })

  test('a queued write that is refused later is still said, wherever the person is', async () => {
    let reject
    updateActivityDoc.mockReturnValue(new Promise((_, r) => (reject = r)))
    render(
      <AppProvider>
        <Writer />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: true }))
    goOffline()
    fireEvent.click(screen.getByText('edit'))
    await flush()
    expect(screen.getByTestId('result').textContent).toBe('true')
    expect(screen.getByTestId('toast').textContent).toBe('Saved — will sync')
    await act(async () => {
      reject({ code: 'permission-denied' })
      await flush()
    })
    expect(screen.getByTestId('toast').textContent).toBe("Couldn't save changes")
    expect(screen.getByTestId('toast-body').textContent).toBe('You do not have permission.')
    goOnline()
  })

  test('online, a write that lands says what it always said', async () => {
    updateActivityDoc.mockResolvedValue(undefined)
    render(
      <AppProvider>
        <Writer />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: false }))
    fireEvent.click(screen.getByText('edit'))
    await flush()
    expect(screen.getByTestId('result').textContent).toBe('true')
    expect(screen.getByTestId('toast').textContent).toBe('Saved')
  })

  test('online, a refused write still fails at once', async () => {
    updateActivityDoc.mockRejectedValue({ code: 'permission-denied' })
    render(
      <AppProvider>
        <Writer />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: false }))
    fireEvent.click(screen.getByText('edit'))
    await flush()
    expect(screen.getByTestId('result').textContent).toBe('false')
    expect(screen.getByTestId('toast').textContent).toBe("Couldn't save changes")
  })

  // The message cases that used to live here went with the write path
  // they tested: sending is a callable now, and what happens to a message
  // that is refused, queued or blocked is in "a message in a thread"
  // above (ADR-033).
})

describe('a server that never answers', () => {
  function Banner() {
    const { offline, syncing, serverSilent, browserOffline } = useApp()
    return (
      <>
        <span data-testid="offline">{String(offline)}</span>
        <span data-testid="syncing">{String(syncing)}</span>
        <span data-testid="silent">{String(serverSilent)}</span>
        <span data-testid="browser">{String(browserOffline)}</span>
      </>
    )
  }

  test('syncing holds from the cached snapshot until the server answers, or is given up on', () => {
    vi.useFakeTimers()
    try {
      render(
        <AppProvider>
          <Banner />
        </AppProvider>,
      )
      expect(screen.getByTestId('syncing').textContent).toBe('true')
      act(() => emit.activities([], { fromCache: true }))
      expect(screen.getByTestId('syncing').textContent).toBe('true')
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS))
      expect(screen.getByTestId('syncing').textContent).toBe('false')
      expect(screen.getByTestId('offline').textContent).toBe('true')
    } finally {
      vi.useRealTimers()
    }
  })

  test('a server answer ends syncing; the browser being offline never starts it', () => {
    render(
      <AppProvider>
        <Banner />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: false }))
    expect(screen.getByTestId('syncing').textContent).toBe('false')
    cleanup()

    render(
      <AppProvider>
        <Banner />
      </AppProvider>,
    )
    act(() => window.dispatchEvent(new Event('offline')))
    act(() => emit.activities([], { fromCache: true }))
    expect(screen.getByTestId('syncing').textContent).toBe('false')
    act(() => window.dispatchEvent(new Event('online')))
  })
  test('nothing but cache for long enough is offline, and the first server word clears it', () => {
    vi.useFakeTimers()
    try {
      render(
        <AppProvider>
          <Banner />
        </AppProvider>,
      )
      act(() => emit.activities([], { fromCache: true }))
      expect(screen.getByTestId('offline').textContent).toBe('false')
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS - 1))
      expect(screen.getByTestId('offline').textContent).toBe('false')
      act(() => vi.advanceTimersByTime(1))
      expect(screen.getByTestId('offline').textContent).toBe('true')
      act(() => emit.activities([], { fromCache: false }))
      expect(screen.getByTestId('offline').textContent).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  test('a server that answered in time is never called silent', () => {
    vi.useFakeTimers()
    try {
      render(
        <AppProvider>
          <Banner />
        </AppProvider>,
      )
      act(() => emit.activities([], { fromCache: false }))
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS + 1))
      expect(screen.getByTestId('offline').textContent).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  // The profile listeners answer first on any link that works at all; the
  // feed is four hundred documents and can take a while. A slow feed on a
  // link the profile came down is not a dead server, and the banner used to
  // say it was.
  const mountBanner = () => {
    render(
      <AppProvider>
        <Banner />
      </AppProvider>,
    )
    act(() => emit.activities([], { fromCache: true }))
  }
  // A change to the mocked auth context has to reach a render.
  const profileAnswered = () => {
    serverSeen = true
    act(() => emit.peers([]))
  }
  const state = () => ({
    offline: screen.getByTestId('offline').textContent,
    syncing: screen.getByTestId('syncing').textContent,
  })

  test('a slow first load — profile from the server, feed still coming past the threshold — is not offline', () => {
    vi.useFakeTimers()
    try {
      mountBanner()
      profileAnswered()
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS + 5_000))
      // Not offline: the server has been heard from. Not syncing either:
      // the wait for the feed is over, whatever it still has to say.
      expect(state()).toEqual({ offline: 'false', syncing: 'false' })
      // The feed arriving late changes nothing visible, and is welcome.
      act(() => emit.activities([], { fromCache: false }))
      expect(state()).toEqual({ offline: 'false', syncing: 'false' })
    } finally {
      vi.useRealTimers()
    }
  })

  test('the feed arriving inside the threshold ends the wait early', () => {
    vi.useFakeTimers()
    try {
      mountBanner()
      expect(state()).toEqual({ offline: 'false', syncing: 'true' })
      act(() => vi.advanceTimersByTime(3_000))
      act(() => emit.activities([], { fromCache: false }))
      expect(state()).toEqual({ offline: 'false', syncing: 'false' })
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS))
      expect(state()).toEqual({ offline: 'false', syncing: 'false' })
    } finally {
      vi.useRealTimers()
    }
  })

  test('a server nobody has heard from is offline at the threshold, and the profile answering later undoes it', () => {
    vi.useFakeTimers()
    try {
      mountBanner()
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS))
      expect(state()).toEqual({ offline: 'true', syncing: 'false' })
      // The first proof of a server — from the profile, not the feed —
      // clears a banner the probe raised.
      profileAnswered()
      expect(state().offline).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  test('the profile answering before the feed does not make the feed\u2019s first cached snapshot a disconnection', () => {
    // Warm cache: the feed's first snapshot is from the cache and arrives
    // after the tiny profile documents were already answered by the server.
    // That is the feed starting up, not the link going away.
    vi.useFakeTimers()
    try {
      render(
        <AppProvider>
          <Banner />
        </AppProvider>,
      )
      profileAnswered()
      act(() => emit.activities([], { fromCache: true }))
      expect(state()).toEqual({ offline: 'false', syncing: 'true' })
    } finally {
      vi.useRealTimers()
    }
  })

  test('exactly around the threshold: a snapshot one tick before is in time, one tick after is a brief banner', () => {
    vi.useFakeTimers()
    try {
      mountBanner()
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS - 1))
      act(() => emit.activities([], { fromCache: false }))
      act(() => vi.advanceTimersByTime(2))
      expect(state()).toEqual({ offline: 'false', syncing: 'false' })
      cleanup()

      mountBanner()
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS + 1))
      expect(state().offline).toBe('true')
      act(() => emit.activities([], { fromCache: false }))
      expect(state()).toEqual({ offline: 'false', syncing: 'false' })
    } finally {
      vi.useRealTimers()
    }
  })

  test('connection lost and regained, repeatedly, is reported each time — and only after the feed had synced', () => {
    vi.useFakeTimers()
    try {
      mountBanner()
      act(() => emit.activities([], { fromCache: false }))
      for (let cycle = 0; cycle < 3; cycle += 1) {
        act(() => emit.activities([], { fromCache: true }))
        expect(state().offline).toBe('true')
        act(() => emit.activities([], { fromCache: false }))
        expect(state().offline).toBe('false')
      }
      // A disconnection never raises the banner from the probe path again
      // once the feed has synced: the timer is long gone.
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS * 2))
      expect(state().offline).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  // Measured against a server whose every answer was held for five
  // seconds: the banner came up at the threshold and went down thirteen
  // seconds later when the first answer arrived. That is a slow server,
  // not an absent one, and the screen is told which it is.
  test('silence is named as silence, and a known disconnection as offline', () => {
    vi.useFakeTimers()
    try {
      mountBanner()
      const silent = () => screen.getByTestId('silent').textContent
      const browser = () => screen.getByTestId('browser').textContent
      expect(silent()).toBe('false')
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS))
      expect(state().offline).toBe('true')
      expect(silent()).toBe('true')
      expect(browser()).toBe('false')
      // The first server word ends the silence.
      act(() => emit.activities([], { fromCache: false }))
      expect(state().offline).toBe('false')
      expect(silent()).toBe('false')
      // A disconnection the feed reports is not silence — the connection
      // was there and went.
      act(() => emit.activities([], { fromCache: true }))
      expect(state().offline).toBe('true')
      expect(silent()).toBe('false')
      act(() => emit.activities([], { fromCache: false }))
      // The device losing its connection is the browser's own word.
      act(() => window.dispatchEvent(new Event('offline')))
      expect(state().offline).toBe('true')
      expect(browser()).toBe('true')
      expect(silent()).toBe('false')
      act(() => window.dispatchEvent(new Event('online')))
      expect(state().offline).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  test('a profile answer ends the silence too, and a new account starts without any', () => {
    vi.useFakeTimers()
    try {
      mountBanner()
      act(() => vi.advanceTimersByTime(SERVER_SILENCE_MS))
      expect(screen.getByTestId('silent').textContent).toBe('true')
      profileAnswered()
      expect(screen.getByTestId('silent').textContent).toBe('false')
      expect(state().offline).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  test('a real disconnection is not undone by the profile having been seen earlier', () => {
    vi.useFakeTimers()
    try {
      mountBanner()
      profileAnswered()
      act(() => emit.activities([], { fromCache: false }))
      act(() => emit.activities([], { fromCache: true }))
      expect(state().offline).toBe('true')
      // Nothing about the profile changed; the banner stays until the feed
      // hears from the server again.
      act(() => emit.peers([]))
      expect(state().offline).toBe('true')
      act(() => emit.activities([], { fromCache: false }))
      expect(state().offline).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('what was typed into a queued write', () => {
  // A write queued offline that the server refuses later rolled its local
  // copy back and took the content with it. The context keeps it, per
  // account and on disk, and hands it back to the screen it came from.
  function Writer() {
    const { createActivity, updateActivity, unsent, discardUnsent } = useApp()
    return (
      <div>
        <button
          onClick={() =>
            createActivity({ title: 'hello there', locationName: 'Park', category: 'Running' })
          }
        >
          send
        </button>
        <button
          onClick={() =>
            createActivity({ title: 'second one', locationName: 'Park', category: 'Running' })
          }
        >
          send-2
        </button>
        <button
          onClick={() =>
            createActivity({ title: 'Late run', locationName: 'Park', category: 'Running' })
          }
        >
          create
        </button>
        <button
          onClick={() =>
            updateActivity(
              'a1',
              { title: 'Renamed' },
              { before: { title: 'Old', description: 'd', extra: 'dropped' } },
            )
          }
        >
          edit
        </button>
        <button onClick={() => updateActivity('a1', { title: 'Renamed again' })}>edit-2</button>
        <button onClick={() => updateActivity('a2', { title: 'Other' })}>edit-other</button>
        <button onClick={() => discardUnsent(unsent[0]?.id)}>discard-first</button>
        <span data-testid="unsent">
          {JSON.stringify(
            unsent.map(({ kind, key, status, payload, error, before }) => ({
              kind,
              key,
              status,
              payload,
              error,
              before,
            })),
          )}
        </span>
      </div>
    )
  }
  const rows = () => JSON.parse(screen.getByTestId('unsent').textContent)
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      for (let i = 0; i < 6; i += 1) await Promise.resolve()
    })
  const goOffline = () => act(() => window.dispatchEvent(new Event('offline')))
  const goOnline = () => act(() => window.dispatchEvent(new Event('online')))
  const held = () => {
    let settle
    let reject
    const promise = new Promise((res, rej) => {
      settle = res
      reject = rej
    })
    promise.id = 'm-minted'
    return { promise, settle, reject }
  }
  const mount = () => {
    render(
      <AppProvider>
        <Writer />
      </AppProvider>,
    )
    act(() => emit.activities([activity('t1'), activity('a1')], { fromCache: true }))
  }

  test('offline → queued → success: noted while pending, gone once it lands', async () => {
    const write = held()
    createActivityDoc.mockReturnValue(write.promise)
    mount()
    goOffline()
    fireEvent.click(screen.getByText('send'))
    await flush()
    expect(rows()).toEqual([
      {
        kind: 'activity-create',
        key: 'me',
        status: 'pending',
        payload: {
          title: 'hello there',
          locationName: 'Park',
          category: 'Running',
          id: 'm-minted',
        },
        error: null,
      },
    ])
    await act(async () => {
      write.settle({ id: 'm-minted' })
      await flush()
    })
    expect(rows()).toEqual([])
    goOnline()
  })

  test('offline → queued → refused: kept as failed with the reason, and persisted', async () => {
    const write = held()
    createActivityDoc.mockReturnValue(write.promise)
    mount()
    goOffline()
    fireEvent.click(screen.getByText('send'))
    await flush()
    await act(async () => {
      write.reject({ code: 'permission-denied' })
      await flush()
    })
    expect(rows()).toMatchObject([
      {
        kind: 'activity-create',
        key: 'me',
        status: 'failed',
        error: { code: 'permission-denied' },
      },
    ])
    expect(rows()[0].error.message).toMatch(/refused/)
    // On disk, so a reload does not lose it.
    expect(JSON.parse(localStorage.getItem('smartsync:unsent:me'))).toHaveLength(1)
    goOnline()
  })

  test('a malformed write refused with another code keeps its own message', async () => {
    const write = held()
    createActivityDoc.mockReturnValue(write.promise)
    mount()
    goOffline()
    fireEvent.click(screen.getByText('send'))
    await flush()
    await act(async () => {
      write.reject({ code: 'invalid-argument', message: 'Document too large' })
      await flush()
    })
    expect(rows()[0].error).toEqual({ code: 'invalid-argument', message: 'Document too large' })
    goOnline()
  })

  test('an immediate refusal of a form write is not kept — the form is still on screen', async () => {
    updateActivityDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    mount()
    fireEvent.click(screen.getByText('edit'))
    await flush()
    expect(rows()).toEqual([])
  })

  test('multiple queued writes are tracked one by one, in order, and settle independently', async () => {
    const first = held()
    const second = held()
    second.promise.id = 'm-2'
    createActivityDoc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    mount()
    goOffline()
    fireEvent.click(screen.getByText('send'))
    fireEvent.click(screen.getByText('send-2'))
    await flush()
    expect(rows().map((r) => r.payload.title)).toEqual(['hello there', 'second one'])
    await act(async () => {
      second.reject({ code: 'permission-denied' })
      first.settle({})
      await flush()
    })
    expect(rows()).toMatchObject([{ status: 'failed', payload: { title: 'second one' } }])
    goOnline()
  })

  test('a queued activity and a queued edit are kept with what they carried', async () => {
    const create = held()
    create.promise.id = 'act-minted'
    createActivityDoc.mockReturnValue(create.promise)
    updateActivityDoc.mockReturnValue(new Promise(() => {}))
    mount()
    goOffline()
    fireEvent.click(screen.getByText('create'))
    fireEvent.click(screen.getByText('edit'))
    await flush()
    expect(rows()).toMatchObject([
      {
        kind: 'activity-create',
        key: 'me',
        status: 'pending',
        payload: { title: 'Late run', id: 'act-minted' },
      },
      {
        kind: 'activity-edit',
        key: 'a1',
        status: 'pending',
        payload: { title: 'Renamed' },
        // Only the judged fields of what the form was seeded with.
        before: { title: 'Old', description: 'd' },
      },
    ])
    expect(rows()[1].before.extra).toBeUndefined()
    await act(async () => {
      create.reject({ code: 'permission-denied' })
      await flush()
    })
    expect(rows()[0].status).toBe('failed')
    expect(rows()[1].status).toBe('pending')
    goOnline()
  })

  test('a second edit of the same activity while the first is pending replaces it', async () => {
    updateActivityDoc.mockReturnValue(new Promise(() => {}))
    mount()
    goOffline()
    fireEvent.click(screen.getByText('edit'))
    fireEvent.click(screen.getByText('edit-other'))
    await flush()
    expect(rows().map((r) => [r.key, r.payload.title])).toEqual([
      ['a1', 'Renamed'],
      ['a2', 'Other'],
    ])
    fireEvent.click(screen.getByText('edit-2'))
    await flush()
    // The newer row carries everything the older did; the other activity's
    // row is untouched.
    expect(rows().map((r) => [r.key, r.payload.title])).toEqual([
      ['a2', 'Other'],
      ['a1', 'Renamed again'],
    ])
    // And the replaced row is not brought back from storage on the next save.
    const stored = JSON.parse(localStorage.getItem('smartsync:unsent:me'))
    expect(stored.map((r) => r.payload.title)).toEqual(['Other', 'Renamed again'])
    goOnline()
  })

  test('a failed edit is not replaced by a newer save — it is the person’s to restore or discard', async () => {
    const first = held()
    updateActivityDoc.mockReturnValueOnce(first.promise)
    updateActivityDoc.mockReturnValue(new Promise(() => {}))
    mount()
    goOffline()
    fireEvent.click(screen.getByText('edit'))
    await flush()
    await act(async () => {
      first.reject({ code: 'permission-denied' })
      await flush()
    })
    expect(rows()).toMatchObject([{ key: 'a1', status: 'failed' }])
    fireEvent.click(screen.getByText('edit-2'))
    await flush()
    expect(rows()).toMatchObject([
      { key: 'a1', status: 'failed', payload: { title: 'Renamed' } },
      { key: 'a1', status: 'pending', payload: { title: 'Renamed again' } },
    ])
    goOnline()
  })

  test('discarding removes the row', async () => {
    const write = held()
    createActivityDoc.mockReturnValue(write.promise)
    mount()
    goOffline()
    fireEvent.click(screen.getByText('send'))
    await flush()
    await act(async () => {
      write.reject({ code: 'permission-denied' })
      await flush()
    })
    goOnline()
    expect(rows()).toHaveLength(1)
    fireEvent.click(screen.getByText('discard-first'))
    expect(rows()).toEqual([])
    expect(JSON.parse(localStorage.getItem('smartsync:unsent:me'))).toEqual([])
  })

  test('rows are kept per account and never shown to another', async () => {
    const write = held()
    createActivityDoc.mockReturnValue(write.promise)
    mount()
    goOffline()
    fireEvent.click(screen.getByText('send'))
    await flush()
    await act(async () => {
      write.reject({ code: 'permission-denied' })
      await flush()
    })
    goOnline()
    expect(rows()).toHaveLength(1)
    cleanup()
    currentUser = { uid: 'someone-else', interests: [], historyCategories: [] }
    mount()
    expect(rows()).toEqual([])
    cleanup()
    currentUser = { uid: 'me', interests: [], historyCategories: [] }
    mount()
    expect(rows()).toHaveLength(1)
  })

  test('another tab\u2019s rows are kept when this tab saves, and a row this tab released stays gone', async () => {
    // Two tabs of one account share the key. Each saves its own list; a
    // plain overwrite lost whatever the other tab had queued.
    const other = {
      id: 'other-tab-1',
      at: Date.now(),
      session: 'the-other-tab',
      kind: 'activity-create',
      key: 't1',
      status: 'pending',
      payload: { title: 'from the other tab', id: 'm-o' },
      error: null,
    }
    const stored = () => JSON.parse(localStorage.getItem('smartsync:unsent:me') || '[]')
    const write = held()
    createActivityDoc.mockReturnValue(write.promise)
    mount()
    goOffline()
    fireEvent.click(screen.getByText('send'))
    await flush()
    await act(async () => {
      write.reject({ code: 'permission-denied' })
      await flush()
    })
    goOnline()
    expect(rows()).toHaveLength(1)
    const mine = stored()[0].id
    // The other tab writes its row while this tab is open…
    localStorage.setItem('smartsync:unsent:me', JSON.stringify([...stored(), other]))
    // …and this tab's next save keeps it, alongside its own change.
    fireEvent.click(screen.getByText('discard-first'))
    await flush()
    expect(rows()).toEqual([])
    expect(stored().map((r) => r.id)).toEqual(['other-tab-1'])
    // A row this tab discarded is not brought back by a later save either,
    // even if the other tab still had a copy.
    localStorage.setItem(
      'smartsync:unsent:me',
      JSON.stringify([
        ...stored(),
        { ...other, id: 'other-tab-2' },
        { ...other, id: mine, session: 'x' },
      ]),
    )
    const second = held()
    second.promise.id = 'm-2'
    createActivityDoc.mockReturnValue(second.promise)
    goOffline()
    fireEvent.click(screen.getByText('send'))
    await flush()
    await act(async () => {
      second.reject({ code: 'permission-denied' })
      await flush()
    })
    goOnline()
    const ids = stored().map((r) => r.id)
    expect(ids).toContain('other-tab-1')
    expect(ids).toContain('other-tab-2')
    expect(ids).not.toContain(mine)
    expect(ids).toHaveLength(3)
  })

  describe('when the browser blocks storage', () => {
    // Accessing localStorage throws in a page that blocks site data. The
    // rows are kept in memory for the life of the page, nothing crashes,
    // and leaving the page is put to the person first.
    const real = {
      local: Object.getOwnPropertyDescriptor(window, 'localStorage'),
      session: Object.getOwnPropertyDescriptor(window, 'sessionStorage'),
    }
    const block = (name) =>
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException('Storage is disabled', 'SecurityError')
        },
      })
    const restore = () => {
      Object.defineProperty(window, 'localStorage', real.local)
      Object.defineProperty(window, 'sessionStorage', real.session)
    }
    const unloadGuarded = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    afterEach(restore)

    test('rows are kept in memory: noted, failed with a reason, retried and discarded — no crash', async () => {
      block('localStorage')
      block('sessionStorage')
      const write = held()
      createActivityDoc.mockReturnValue(write.promise)
      expect(() => mount()).not.toThrow()
      goOffline()
      fireEvent.click(screen.getByText('send'))
      await flush()
      expect(rows()).toMatchObject([{ status: 'pending', payload: { title: 'hello there' } }])
      await act(async () => {
        write.reject({ code: 'permission-denied' })
        await flush()
      })
      expect(rows()).toMatchObject([{ status: 'failed', error: { code: 'permission-denied' } }])
      fireEvent.click(screen.getByText('discard-first'))
      await flush()
      expect(rows()).toEqual([])
      goOnline()
    })

    test('leaving the page is guarded only while memory is the only copy of something', async () => {
      block('localStorage')
      block('sessionStorage')
      createActivityDoc.mockReturnValue(new Promise(() => {}))
      mount()
      expect(unloadGuarded()).toBe(false)
      goOffline()
      fireEvent.click(screen.getByText('send'))
      await flush()
      expect(rows()).toHaveLength(1)
      expect(unloadGuarded()).toBe(true)
      fireEvent.click(screen.getByText('discard-first'))
      await flush()
      expect(unloadGuarded()).toBe(false)
      goOnline()
    })

    test('with storage working, leaving the page is never guarded', async () => {
      createActivityDoc.mockReturnValue(new Promise(() => {}))
      mount()
      goOffline()
      fireEvent.click(screen.getByText('send'))
      await flush()
      expect(rows()).toHaveLength(1)
      expect(JSON.parse(localStorage.getItem('smartsync:unsent:me'))).toHaveLength(1)
      expect(unloadGuarded()).toBe(false)
      goOnline()
    })

    test('with only localStorage blocked, this tab’s sessionStorage keeps the rows across a reload', async () => {
      block('localStorage')
      createActivityDoc.mockReturnValue(new Promise(() => {}))
      mount()
      goOffline()
      fireEvent.click(screen.getByText('send'))
      await flush()
      expect(JSON.parse(sessionStorage.getItem('smartsync:unsent:me'))).toMatchObject([
        { payload: { title: 'hello there' } },
      ])
      expect(unloadGuarded()).toBe(false)
      goOnline()
    })
  })

  describe('after a reload while a write was still queued', () => {
    const fromEarlier = (over = {}) => ({
      id: 'old-1',
      at: Date.now() - 60_000,
      session: 'a-previous-page-load',
      kind: 'activity-create',
      key: 't1',
      status: 'pending',
      payload: { title: 'from before', id: 'm-old' },
      error: null,
      ...over,
    })

    test('a write that landed is dropped once the queue has drained', async () => {
      localStorage.setItem('smartsync:unsent:me', JSON.stringify([fromEarlier()]))
      outcomeOf.mockResolvedValue('landed')
      mount()
      act(() => emit.activities([], { fromCache: false }))
      await flush()
      expect(drainQueue).toHaveBeenCalledTimes(1)
      expect(outcomeOf).toHaveBeenCalledWith(expect.objectContaining({ id: 'old-1' }))
      expect(rows()).toEqual([])
    })

    test('a write that was refused meanwhile becomes failed, with a reason', async () => {
      localStorage.setItem('smartsync:unsent:me', JSON.stringify([fromEarlier()]))
      outcomeOf.mockResolvedValue('refused')
      mount()
      act(() => emit.activities([], { fromCache: false }))
      await flush()
      expect(rows()).toMatchObject([{ status: 'failed', error: { code: 'refused' } }])
    })

    test('an edit overtaken by somebody else’s is superseded, in words that say so', async () => {
      localStorage.setItem(
        'smartsync:unsent:me',
        JSON.stringify([
          fromEarlier({ kind: 'activity-edit', key: 'a1', payload: { title: 'Mine' } }),
          fromEarlier({ id: 'old-2', kind: 'profile', key: 'me', payload: { bio: 'Mine' } }),
        ]),
      )
      outcomeOf.mockResolvedValue('superseded')
      mount()
      act(() => emit.activities([], { fromCache: false }))
      await flush()
      expect(rows()).toMatchObject([
        {
          kind: 'activity-edit',
          status: 'failed',
          error: { code: 'superseded', message: expect.stringMatching(/changed by somebody else/) },
        },
        {
          kind: 'profile',
          status: 'failed',
          error: { code: 'superseded', message: expect.stringMatching(/another device/) },
        },
      ])
    })

    test('nothing is asked until the server has answered — the browser saying "online" is not that', async () => {
      localStorage.setItem('smartsync:unsent:me', JSON.stringify([fromEarlier()]))
      // Offline before the page even loads.
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
      try {
        mount()
        act(() => emit.activities([], { fromCache: true }))
        await flush()
        expect(drainQueue).not.toHaveBeenCalled()
        expect(rows()[0].status).toBe('pending')
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
        goOnline()
        await flush()
        // Online in the browser's eyes, but the server has not said a word:
        // draining the queue needs the server, so the question waits.
        expect(drainQueue).not.toHaveBeenCalled()
        act(() => emit.activities([], { fromCache: false }))
        await flush()
        expect(drainQueue).toHaveBeenCalledTimes(1)
      } finally {
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
      }
    })

    test('a drain that never finishes is given up on, and tried again the next time the server answers', async () => {
      vi.useFakeTimers()
      try {
        localStorage.setItem('smartsync:unsent:me', JSON.stringify([fromEarlier()]))
        drainQueue.mockReturnValueOnce(new Promise(() => {}))
        outcomeOf.mockResolvedValue('landed')
        mount()
        act(() => emit.activities([], { fromCache: false }))
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000)
        })
        expect(rows()[0].status).toBe('pending')
        // The link goes and comes back; the drain is asked for again.
        act(() => emit.activities([], { fromCache: true }))
        act(() => emit.activities([], { fromCache: false }))
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(drainQueue).toHaveBeenCalledTimes(2)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(rows()).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })

    test('rows queued in this page load are left to their own promises', async () => {
      const write = held()
      createActivityDoc.mockReturnValue(write.promise)
      mount()
      goOffline()
      fireEvent.click(screen.getByText('send'))
      await flush()
      goOnline()
      await flush()
      expect(drainQueue).not.toHaveBeenCalled()
      expect(rows()[0].status).toBe('pending')
    })

    test('a check that fails leaves the row pending for next time', async () => {
      localStorage.setItem('smartsync:unsent:me', JSON.stringify([fromEarlier()]))
      outcomeOf.mockRejectedValue(new Error('unavailable'))
      mount()
      act(() => emit.activities([], { fromCache: false }))
      await flush()
      expect(rows()[0].status).toBe('pending')
      expect(reportError).toHaveBeenCalledWith('unsent.reconcile', expect.anything(), {
        kind: 'activity-create',
      })
    })
  })
})

describe('an identity sweep that started from the cache', () => {
  // A rename or anonymous-mode switch saved offline stamped only the hosted
  // activities the cache held and noted that on the profile. Once the server
  // has answered, the rest are brought into line from the server's list.
  function Probe() {
    useApp()
    return null
  }
  const mountWith = (user) => {
    currentUser = { uid: 'me', interests: [], historyCategories: [], ...user }
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
  }
  const flush = () =>
    act(async () => {
      for (let i = 0; i < 4; i += 1) await Promise.resolve()
    })

  test('waits for the server, then finishes the sweep once', async () => {
    mountWith({ identitySweepPending: true, name: 'Anonymous user', avatar: 'AN' })
    act(() => emit.activities([], { fromCache: true }))
    await flush()
    expect(completeIdentitySweep).not.toHaveBeenCalled()
    act(() => emit.activities([], { fromCache: false }))
    await flush()
    expect(completeIdentitySweep).toHaveBeenCalledTimes(1)
    expect(completeIdentitySweep).toHaveBeenCalledWith('me', {
      name: 'Anonymous user',
      avatar: 'AN',
    })
    // Another server snapshot while it runs, or after, does not start a second.
    act(() => emit.activities([], { fromCache: false }))
    await flush()
    expect(completeIdentitySweep).toHaveBeenCalledTimes(1)
  })

  test('nothing to finish, nothing is asked', async () => {
    mountWith({ identitySweepPending: false, name: 'Alice', avatar: 'AL' })
    act(() => emit.activities([], { fromCache: false }))
    await flush()
    expect(completeIdentitySweep).not.toHaveBeenCalled()
  })

  test('a sweep that fails is recorded and tried again when the server answers after a gap', async () => {
    completeIdentitySweep.mockRejectedValueOnce(new Error('unavailable'))
    mountWith({ identitySweepPending: true, name: 'Alice', avatar: 'AL' })
    act(() => emit.activities([], { fromCache: false }))
    await flush()
    expect(completeIdentitySweep).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith('users.identitySweep', expect.anything(), {
      uid: 'me',
    })
    // The link drops and comes back.
    act(() => emit.activities([], { fromCache: true }))
    act(() => emit.activities([], { fromCache: false }))
    await flush()
    expect(completeIdentitySweep).toHaveBeenCalledTimes(2)
  })
})

describe('a notification arriving while the app is on screen', () => {
  function ToastProbe() {
    const { celebration } = useApp()
    return <span data-testid="toast">{celebration ? JSON.stringify(celebration) : ''}</span>
  }
  const toast = () => {
    const text = screen.getByTestId('toast').textContent
    return text ? JSON.parse(text) : null
  }
  const note = (id, extra = {}) => ({
    id,
    type: 'chat',
    kind: 'newMessage',
    params: { name: 'Mya', title: 'Run', text: 'hi' },
    title: 'New message in Run',
    body: 'Mya: hi',
    activityId: 'act1',
    read: false,
    createdAt: Date.now(),
    ...extra,
  })

  test('is a toast that opens the record; the inbox catching up is not', () => {
    render(
      <AppProvider>
        <ToastProbe />
      </AppProvider>,
    )
    // The first snapshot is the inbox as it stands — whatever it holds.
    act(() => emit.notifications([note('old1'), note('old2')]))
    expect(toast()).toBeNull()
    act(() => emit.notifications([note('new1'), note('old1'), note('old2')]))
    expect(toast()).toMatchObject({ title: 'New message in Run', body: 'Mya: hi', to: '/n/new1' })
  })

  test('a record already read, or from long before, is not news', () => {
    render(
      <AppProvider>
        <ToastProbe />
      </AppProvider>,
    )
    act(() => emit.notifications([]))
    act(() =>
      emit.notifications([
        note('r1', { read: true }),
        note('stale', { createdAt: Date.now() - 10 * 60_000 }),
      ]),
    )
    expect(toast()).toBeNull()
  })

  test('a join is the badge’s to tell, and a message in the thread on screen is already seen', () => {
    render(
      <AppProvider>
        <ToastProbe />
      </AppProvider>,
    )
    act(() => emit.notifications([]))
    act(() =>
      emit.notifications([
        note('j1', {
          type: 'activity',
          kind: 'someoneJoined',
          params: { name: 'Mya', title: 'Run' },
        }),
      ]),
    )
    expect(toast()).toBeNull()
    window.history.pushState({}, '', '/activity/act1/chat')
    act(() =>
      emit.notifications([note('c1'), note('j1', { type: 'activity', kind: 'someoneJoined' })]),
    )
    expect(toast()).toBeNull()
    window.history.pushState({}, '', '/home')
    act(() =>
      emit.notifications([
        note('c2'),
        note('c1'),
        note('j1', { type: 'activity', kind: 'someoneJoined' }),
      ]),
    )
    expect(toast()).toMatchObject({ to: '/n/c2' })
  })

  test('a safety notice is a warning toast', () => {
    render(
      <AppProvider>
        <ToastProbe />
      </AppProvider>,
    )
    act(() => emit.notifications([]))
    act(() =>
      emit.notifications([
        note('m1', {
          type: 'moderation',
          kind: 'warning',
          params: { reason: 'Be kind.' },
          title: 'A warning about your SmartSync account',
          body: 'Be kind. Nothing has been taken away.',
          activityId: null,
        }),
      ]),
    )
    expect(toast()).toMatchObject({ tone: 'warning', icon: 'alert', to: '/n/m1' })
  })

  test('a new account starts from its own inbox, not the last one’s', () => {
    const view = render(
      <AppProvider>
        <ToastProbe />
      </AppProvider>,
    )
    act(() => emit.notifications([note('a1')]))
    currentUser = { uid: 'other', interests: [], historyCategories: [] }
    view.rerender(
      <AppProvider>
        <ToastProbe />
      </AppProvider>,
    )
    // The other account's first snapshot: baseline, not news.
    act(() => emit.notifications([note('b1')]))
    expect(toast()).toBeNull()
  })
})
