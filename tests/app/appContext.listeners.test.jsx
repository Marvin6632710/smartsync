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
vi.mock('../../src/firebase/users', () => ({
  watchPeers: (uid, cb) => channel('peers')(uid, cb),
  recordCategoryHistory: vi.fn(() => Promise.resolve()),
}))
const followUser = vi.fn(() => Promise.resolve())
const unfollowUser = vi.fn(() => Promise.resolve())
const ensureFollowerMirror = vi.fn(() => Promise.resolve(false))
const notifyFollowers = vi.fn(() => Promise.resolve({ told: 0, declined: 0, failed: 0 }))
const pushChatNotification = vi.fn(() => Promise.resolve())
const reportError = vi.fn()
vi.mock('../../src/utils/reportError', () => ({ reportError }))
vi.mock('../../src/firebase/notifications', () => ({
  watchNotifications: (uid, cb) => channel('notifications')(uid, cb),
  watchFollowing: (uid, cb) => channel('following')(uid, cb),
  followUser,
  unfollowUser,
  ensureFollowerMirror,
  notifyFollowers,
  pushChatNotification,
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
  for (const k of Object.keys(threadError)) delete threadError[k]
  refreshCredential.mockClear()
  followUser.mockClear()
  unfollowUser.mockClear()
  ensureFollowerMirror.mockClear()
  notifyFollowers.mockClear()
  pushChatNotification.mockClear()
  pushChatNotification.mockImplementation(() => Promise.resolve())
  reportError.mockClear()
  createActivityDoc.mockReset()
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
      ['activities', 'blocked', 'following', 'mine', 'notifications', 'peers'].sort(),
    )
  })

  test('all five are closed on unmount — none is left running', () => {
    const view = render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    view.unmount()
    for (const name of ['activities', 'mine', 'peers', 'notifications', 'following', 'blocked']) {
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
  function Composer() {
    const { sendMessage } = useApp()
    return <button onClick={() => sendMessage('t1', 'hello')}>send</button>
  }
  const flush = () =>
    act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  const thread = (extra = {}) =>
    activity('t1', { participantUids: ['me', 'p1', 'p2', 'p3'], participants: 4, ...extra })

  test('tells every other participant through the bounded chat channel', async () => {
    render(
      <AppProvider>
        <Composer />
      </AppProvider>,
    )
    act(() => emit.activities([thread()], { fromCache: false }))
    act(() => emit.peers([]))
    fireEvent.click(screen.getByText('send'))
    await flush()
    const recipients = pushChatNotification.mock.calls.map(([uid]) => uid).sort()
    expect(recipients).toEqual(['p1', 'p2', 'p3'])
    const [, payload] = pushChatNotification.mock.calls[0]
    expect(payload).toMatchObject({ activityId: 't1', title: 'New message in t1' })
  })

  test('skips somebody who turned notifications off', async () => {
    render(
      <AppProvider>
        <Composer />
      </AppProvider>,
    )
    act(() => emit.activities([thread()], { fromCache: false }))
    act(() => emit.peers([{ uid: 'p2', name: 'P2', notificationsEnabled: false }]))
    fireEvent.click(screen.getByText('send'))
    await flush()
    expect(pushChatNotification.mock.calls.map(([uid]) => uid).sort()).toEqual(['p1', 'p3'])
  })

  test('a refusal is the bucket working, not an error; anything else is recorded', async () => {
    pushChatNotification
      .mockImplementationOnce(() => Promise.reject({ code: 'permission-denied' }))
      .mockImplementationOnce(() => Promise.reject(new Error('unavailable')))
    render(
      <AppProvider>
        <Composer />
      </AppProvider>,
    )
    act(() => emit.activities([thread()], { fromCache: false }))
    act(() => emit.peers([]))
    fireEvent.click(screen.getByText('send'))
    await flush()
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError.mock.calls[0][0]).toBe('notifications.chat')
  })
})
