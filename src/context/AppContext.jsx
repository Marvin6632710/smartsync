import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { useAuth } from './AuthContext'
import {
  cancelActivity as cancelActivityDoc,
  createActivity as createActivityDoc,
  deleteActivity as deleteActivityDoc,
  joinActivity as joinActivityDoc,
  leaveActivity as leaveActivityDoc,
  updateActivity as updateActivityDoc,
  watchActivities,
} from '../firebase/activities'
import { sendMessage as sendMessageDoc, watchLatestMessage } from '../firebase/messages'
import {
  followUser,
  markAllNotificationsRead as markAllReadDoc,
  markNotificationRead as markReadDoc,
  pushNotification,
  unfollowUser,
  watchFollowing,
  watchNotifications,
} from '../firebase/notifications'
import {
  blockUser as blockUserDoc,
  fileReport,
  unblockUser as unblockUserDoc,
  watchBlocked,
} from '../firebase/moderation'
import { recordCategoryHistory, watchPeers } from '../firebase/users'
import { rankActivities, recommendationWeights } from '../services/recommendationService'
import { distanceBetween } from '../utils/geo'
import { loadStorage, saveStorage } from '../utils/storage'

const AppContext = createContext(null)

// Single source of truth — previously duplicated in the initial state,
// resetPrototype and FilterPage's own reset.
export const defaultFilters = {
  category: 'All',
  maxDistance: 10,
  timeBand: 'Any',
  availableOnly: true,
}

export function AppProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.uid || null

  const [activities, setActivities] = useState([])
  const [peers, setPeers] = useState([])
  const [notifications, setNotifications] = useState([])
  const [followedUserIds, setFollowedUserIds] = useState([])
  const [blocked, setBlocked] = useState([])
  const [threadPreviews, setThreadPreviews] = useState({})
  const [activitiesLoaded, setActivitiesLoaded] = useState(false)
  const [dataError, setDataError] = useState(null)

  // Filters are a per-device view preference, not shared account data, so
  // they stay in localStorage rather than costing a Firestore write on every
  // slider drag.
  const [filters, setFilters] = useState(() => loadStorage('smartsync:filters', defaultFilters))

  // Scoring weights are adjustable and kept per device, for the same reason
  // filters are: they change how *you* see the list, not what anyone else
  // sees. Any missing key falls back to the shipped default, so a stored set
  // written by an older version cannot silently zero a signal.
  const [weights, setWeights] = useState(() =>
    loadStorage('smartsync:weights', recommendationWeights),
  )
  const [celebration, setCelebration] = useState(null)

  // A minute-resolution clock. Whether an activity has started is a fact about
  // the current time, not about the data, so it has to be re-evaluated while
  // the screen sits open — otherwise a football match that kicked off ten
  // minutes ago stays advertised as joinable until someone reloads.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(tick)
  }, [])

  // Firestore keeps working without a connection: reads come from its local
  // cache and writes queue until it can reach the server. That is genuinely
  // useful on patchy campus wifi, but it is invisible — a join looks exactly
  // like a confirmed one — so the state has to be said out loud.
  const [browserOffline, setBrowserOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  )
  // Firestore's own answer to "can I reach the server right now". More
  // trustworthy than navigator.onLine, which only knows whether a network
  // interface exists and says nothing about whether the backend is up.
  // Stays null until the first server response, because before that
  // `fromCache` only means "we have not heard back yet" — loading, not
  // offline — and treating it as offline flashes the banner on every start.
  //
  // The two signals cover different failures, and their speed differs:
  // losing the device's connection fires the browser event immediately, while
  // a server that stops responding on a live network takes about a minute to
  // surface, since Firestore has to let its connection time out first.
  // Measured, not assumed.
  const [serverReachable, setServerReachable] = useState(null)
  const offline = browserOffline || serverReachable === false
  useEffect(() => {
    const goOffline = () => setBrowserOffline(true)
    const goOnline = () => setBrowserOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  useEffect(() => {
    saveStorage('smartsync:filters', filters)
  }, [filters])

  useEffect(() => {
    saveStorage('smartsync:weights', weights)
  }, [weights])

  // ---------------------------------------------------------------- live data

  // Signing out must not leave the previous account's activities on screen
  // for a frame. Clearing during render rather than in an effect is React's
  // recommended way to reset state when the thing it describes changes —
  // an effect would render the stale data once before wiping it.
  const [loadedFor, setLoadedFor] = useState(uid)
  if (loadedFor !== uid) {
    setLoadedFor(uid)
    setActivities([])
    setPeers([])
    setNotifications([])
    setFollowedUserIds([])
    setThreadPreviews({})
    setBlocked([])
    setDataError(null)
    setActivitiesLoaded(false)
    setServerReachable(null)
  }

  useEffect(() => {
    if (!uid) return undefined
    const stops = [
      watchActivities((next, meta) => {
        setActivities(next)
        setActivitiesLoaded(true)
        setServerReachable((previous) =>
          meta.fromCache ? (previous === null ? null : false) : true,
        )
      }, setDataError),
      watchPeers(uid, setPeers, setDataError),
      watchNotifications(uid, setNotifications, setDataError),
      watchFollowing(uid, setFollowedUserIds, setDataError),
      watchBlocked(uid, setBlocked, setDataError),
    ]
    return () => stops.forEach((stop) => stop())
  }, [uid])

  // ---------------------------------------------------------------- toasts

  useEffect(() => {
    if (!celebration) return undefined
    const timer = window.setTimeout(() => setCelebration(null), 2800)
    return () => window.clearTimeout(timer)
  }, [celebration])

  function pushCelebration(payload) {
    setCelebration({
      id: Date.now(),
      icon: 'sparkles',
      tone: 'default',
      title: '',
      body: '',
      ...payload,
    })
  }

  /**
   * Every write goes through here. A Firestore write can be rejected by the
   * security rules — that is the point of them — and a rejected write that
   * fails silently looks exactly like a broken button, so failures surface as
   * a toast rather than an unhandled promise rejection in the console.
   */
  async function attempt(action, { failure }) {
    try {
      return await action()
    } catch (error) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: failure,
        body:
          error?.code === 'permission-denied' ? 'You do not have permission.' : 'Please try again.',
      })
      return null
    }
  }

  // ------------------------------------------------------------ derived data

  // Membership lives on the activity itself, so "what have I joined" is a
  // question about the current data rather than a second list that has to be
  // kept in step with it. The two can no longer disagree.
  const joinedIds = useMemo(
    () => activities.filter((a) => (a.participantUids || []).includes(uid)).map((a) => a.id),
    [activities, uid],
  )

  // Distance is computed from where the user actually is, not typed into a
  // form. Unknown location leaves distanceKm null, which the scorer treats as
  // "no information" rather than "zero kilometres away".
  // Blocking is applied on the way out of the context, so no screen has to
  // remember to do it. What it hides is a deliberate list rather than
  // "everything": you keep activities you had already joined, because leaving
  // is your decision to make and a commitment should not evaporate — but you
  // stop being shown their activities, their profile and their messages.
  const blockedIds = useMemo(() => new Set(blocked.map((b) => b.uid)), [blocked])

  // The directory the matching screen ranks, and the one the scorer measures
  // similarity against. Blocked people are removed once, here, so everything
  // built on `peers` inherits the rule without having to know about it.
  const visiblePeers = useMemo(
    () => peers.filter((peer) => !blockedIds.has(peer.uid)),
    [peers, blockedIds],
  )

  // Everyone whose profile we hold, including ourselves.
  const directory = useMemo(() => {
    const map = new Map()
    if (user) map.set(user.uid, user)
    peers.forEach((peer) => map.set(peer.uid, peer))
    return map
  }, [user, peers])

  const located = useMemo(() => {
    const from = user?.location || null
    return activities.map((activity) => {
      const host = directory.get(activity.hostId)
      return {
        ...activity,
        // The host's name and avatar are copied onto the activity so a list
        // renders without resolving every host. The copy is swept when
        // someone renames or goes anonymous, but preferring the live profile
        // here means the screen is right even in the window before that sweep
        // lands — and right anyway if it ever fails.
        hostName: host?.name || activity.hostName,
        hostAvatar: host?.avatar || activity.hostAvatar,
        distanceKm: from ? distanceBetween(from, { lat: activity.lat, lng: activity.lng }) : null,
      }
    })
  }, [activities, directory, user?.location])

  // Scored once, over everything. Previously only active activities were
  // ranked, so an activity you had joined and the host then cancelled lost its
  // match score and rendered as "--%" in your own list.
  const scored = useMemo(
    () => rankActivities(user, located, visiblePeers, weights),
    [user, located, visiblePeers, weights],
  )

  // Activities are fetched from a day ago onwards so that ones you joined stay
  // reachable after they happen. That window is a storage decision, not a
  // product one: something that already started must not be offered as a plan.
  const timed = useMemo(
    () => scored.map((a) => ({ ...a, isPast: Number.isFinite(a.startsAt) && a.startsAt < now })),
    [scored, now],
  )

  const visibleActivities = useMemo(
    () => timed.filter((a) => a.status === 'active' || joinedIds.includes(a.id)),
    [timed, joinedIds],
  )

  // Discovery is upcoming activities only. Past and cancelled ones remain in
  // `visibleActivities`, so your own history still renders.
  const recommendations = useMemo(
    () =>
      visibleActivities.filter(
        (a) =>
          a.status === 'active' &&
          !a.isPast &&
          // Nothing hosted by somebody you blocked is ever suggested to you,
          // including things you had already joined. Those stay reachable
          // through your own joined list and their own page — a commitment
          // should not evaporate, and leaving is your decision to make — but
          // being shown them again alongside fresh suggestions is exactly what
          // blocking was meant to stop.
          !blockedIds.has(a.hostId),
      ),
    [visibleActivities, blockedIds],
  )

  const filteredActivities = useMemo(() => {
    return recommendations.filter((activity) => {
      if (filters.category !== 'All' && activity.category !== filters.category) return false
      // An unknown distance is never filtered out — hiding everything until
      // the user grants location would make the app look broken.
      if (
        Number.isFinite(activity.distanceKm) &&
        activity.distanceKm > Number(filters.maxDistance || 999)
      )
        return false
      if (filters.timeBand !== 'Any' && activity.timeBand !== filters.timeBand) return false
      if (filters.availableOnly && activity.participants >= activity.capacity) return false
      return true
    })
  }, [recommendations, filters])

  // -------------------------------------------------------- message previews

  // One listener per joined activity, each limited to the newest message, so
  // the inbox can show a preview without downloading whole threads.
  //
  // Keyed on a joined-id string rather than the array: the array is rebuilt on
  // every activities snapshot, and re-subscribing on each one would churn
  // listeners constantly. One effect owns both subscribing and unsubscribing —
  // an earlier version split them across two effects and a ref, which
  // StrictMode's mount/unmount/remount cycle tore down without ever rebuilding,
  // leaving every thread stuck on "No messages yet".
  const joinedKey = joinedIds.join(',')
  useEffect(() => {
    if (!uid || !joinedKey) return undefined
    const stops = joinedKey
      .split(',')
      .map((id) =>
        watchLatestMessage(id, (message) =>
          setThreadPreviews((previous) => ({ ...previous, [id]: message })),
        ),
      )
    return () => stops.forEach((stop) => stop())
  }, [joinedKey, uid])

  // ------------------------------------------------------------------ actions

  /**
   * Sends a notification to somebody else, honouring their choice not to
   * receive them.
   *
   * The rules enforce this too, but checking here matters: without it the
   * write is rejected, `attempt` reports a failure, and the user is told
   * their join did not work when it did. Never let a notification failure
   * surface as a failure of the thing that triggered it.
   */
  function notifyUser(recipientId, payload) {
    if (!recipientId || recipientId === uid) return
    const recipient = peers.find((peer) => peer.uid === recipientId)
    if (recipient?.notificationsEnabled === false) return
    pushNotification(recipientId, payload).catch(() => {})
  }

  async function joinActivity(id) {
    const activity = visibleActivities.find((item) => item.id === id)
    if (!activity || joinedIds.includes(id)) return
    if (activity.isPast) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: 'This already happened',
        body: `${activity.title} has already started.`,
      })
      return
    }

    // Not awaited. Firestore applies the write to its local cache immediately,
    // so the roster on screen has already changed; waiting for the server
    // means an offline user gets no confirmation at all and then a stale toast
    // minutes later when the connection returns. Confirm what they can already
    // see, and correct it if the server disagrees.
    const pending = joinActivityDoc(id, uid)

    // Not awaited, and failure is swallowed on purpose: learning that you
    // like football is a side effect of joining, not part of it. A rejection
    // here must not become an unhandled promise, and must not tell the user
    // their join went wrong when it did not.
    recordCategoryHistory(uid, user.historyCategories, activity.category).catch(() => {})
    notifyUser(activity.hostId, {
      type: 'activity',
      title: 'Someone joined',
      body: `${user.name} joined ${activity.title}.`,
      activityId: id,
    })
    pushCelebration({
      icon: 'check',
      tone: 'success',
      title: offline ? 'Joined — will sync' : 'You are in',
      body: offline
        ? `${activity.title} will be confirmed when you reconnect.`
        : `${activity.title} added to your list.`,
    })

    try {
      await pending
    } catch (error) {
      // Not routed through `attempt`, because its generic "you do not have
      // permission" is actively misleading here. The rules refuse a join for
      // two reasons a user can understand and act on: somebody took the last
      // place first (a real race — verified to happen), or the host cancelled
      // it underneath them.
      if (error?.code === 'permission-denied') {
        const fresh = activities.find((item) => item.id === id) || activity
        const full = (fresh.participants || 0) >= (fresh.capacity || 0)
        pushCelebration({
          icon: 'alert',
          tone: 'warning',
          title: full ? 'Someone got the last place' : 'Cannot join this activity',
          body: full
            ? `${activity.title} filled up just now.`
            : `${activity.title} is no longer open to join.`,
        })
      } else {
        pushCelebration({
          icon: 'alert',
          tone: 'warning',
          title: "Couldn't join",
          body: 'Please try again.',
        })
      }
      return
    }
  }

  async function leaveActivity(id) {
    const activity = activities.find((item) => item.id === id)
    if (!activity || !joinedIds.includes(id)) return
    const ok = await attempt(() => leaveActivityDoc(id, uid), { failure: "Couldn't leave" })
    if (ok === null) return
    pushCelebration({
      icon: 'log-out',
      title: 'Activity left',
      body: `You left ${activity.title}.`,
    })
  }

  async function cancelActivity(id) {
    const activity = activities.find((item) => item.id === id)
    if (!activity || activity.hostId !== uid) return
    const ok = await attempt(() => cancelActivityDoc(id), { failure: "Couldn't cancel" })
    if (ok === null) return

    // Everyone who was going deserves to be told.
    ;(activity.participantUids || []).forEach((participantId) =>
      notifyUser(participantId, {
        type: 'activity',
        title: 'Activity cancelled',
        body: `${activity.title} was cancelled by the host.`,
        activityId: id,
      }),
    )

    pushCelebration({
      icon: 'trash',
      tone: 'danger',
      title: 'Activity cancelled',
      body: `${activity.title} was cancelled.`,
    })
  }

  /**
   * Removes an activity nobody else joined. Cancelling is for activities with
   * other people in them, where the point is that they are told; here there
   * is nobody to tell, so a cancelled tombstone would just be clutter in the
   * host's own history.
   */
  async function removeActivity(id) {
    const activity = activities.find((item) => item.id === id)
    if (!activity || activity.hostId !== uid) return
    const ok = await attempt(() => deleteActivityDoc(id), { failure: "Couldn't delete" })
    if (ok === null) return
    pushCelebration({
      icon: 'trash',
      tone: 'danger',
      title: 'Activity deleted',
      body: `${activity.title} was removed.`,
    })
  }

  async function createActivity(data) {
    const id = await attempt(() => createActivityDoc(user, data), {
      failure: "Couldn't create activity",
    })
    if (!id) return null
    recordCategoryHistory(uid, user.historyCategories, data.category).catch(() => {})
    pushCelebration({
      icon: 'check',
      tone: 'success',
      title: 'Activity created',
      body: `${data.title} is live now.`,
    })
    return id
  }

  async function updateActivity(id, updates) {
    const ok = await attempt(() => updateActivityDoc(id, updates), {
      failure: "Couldn't save changes",
    })
    if (ok === null) return
    pushCelebration({ icon: 'check', tone: 'success', title: 'Saved', body: 'Changes saved.' })
  }

  async function sendMessage(activityId, text) {
    const activity = activities.find((item) => item.id === activityId)
    const ok = await attempt(() => sendMessageDoc(activityId, user, text), {
      failure: "Couldn't send",
    })
    if (ok === null || !activity) return
    ;(activity.participantUids || []).forEach((participantId) =>
      notifyUser(participantId, {
        type: 'chat',
        title: `New message in ${activity.title}`,
        body: `${user.name}: ${String(text).slice(0, 80)}`,
        activityId,
      }),
    )
  }

  function toggleUserNotifications(targetUser) {
    if (!targetUser?.uid) return
    const alreadyOn = followedUserIds.includes(targetUser.uid)
    if (alreadyOn) {
      unfollowUser(uid, targetUser.uid)
      pushCelebration({
        icon: 'bell-off',
        title: 'Notifications off',
        body: `${targetUser.name} activity alerts turned off.`,
      })
      return
    }
    followUser(uid, targetUser.uid)
    pushCelebration({
      icon: 'bell',
      title: 'Notifications on',
      body: `You'll get ${targetUser.name}'s activity alerts.`,
    })
  }

  const isFollowingUser = (userId) => followedUserIds.includes(userId)

  // ------------------------------------------------------------- moderation

  async function blockPerson(target) {
    if (!target?.uid || target.uid === uid) return
    const ok = await attempt(() => blockUserDoc(uid, target), { failure: "Couldn't block" })
    if (ok === null) return
    pushCelebration({
      icon: 'alert',
      title: `${target.name} blocked`,
      body: 'You will not see their activities, and they cannot join yours.',
    })
  }

  async function unblockPerson(targetId) {
    const person = blocked.find((b) => b.uid === targetId)
    const ok = await attempt(() => unblockUserDoc(uid, targetId), { failure: "Couldn't unblock" })
    if (ok === null) return
    pushCelebration({ icon: 'check', title: `${person?.name || 'They'} unblocked` })
  }

  async function submitReport(report) {
    const ok = await attempt(() => fileReport({ ...report, reporterId: uid }), {
      failure: "Couldn't send the report",
    })
    if (ok === null) return false
    pushCelebration({
      icon: 'check',
      tone: 'success',
      title: 'Report sent',
      body: 'Thank you. We review every report.',
    })
    return true
  }

  const value = {
    // Signed out is not "still loading" — it is a settled state with no data.
    loading: Boolean(uid) && !activitiesLoaded,
    offline,
    dataError,

    activities: visibleActivities,
    recommendations,
    filteredActivities,
    peers: visiblePeers,

    joinedIds,
    joinActivity,
    leaveActivity,
    cancelActivity,
    removeActivity,
    createActivity,
    updateActivity,

    threadPreviews,
    sendMessage,

    notifications,
    markNotificationRead: (id) => markReadDoc(uid, id),
    markAllNotificationsRead: () => markAllReadDoc(uid),

    followedUserIds,
    toggleUserNotifications,
    isFollowingUser,

    blocked,
    blockedIds,
    isBlocked: (userId) => blockedIds.has(userId),
    blockPerson,
    unblockPerson,
    submitReport,

    filters,
    setFilters,
    resetFilters: () => setFilters(defaultFilters),

    weights,
    setWeights,
    resetWeights: () => setWeights(recommendationWeights),

    celebration,
    pushCelebration,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
