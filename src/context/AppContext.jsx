import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { useAuth } from './AuthContext'
import {
  cancelActivity as cancelActivityDoc,
  createActivity as createActivityDoc,
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
import { recordCategoryHistory, watchPeers } from '../firebase/users'
import { rankActivities } from '../services/recommendationService'
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
  const [threadPreviews, setThreadPreviews] = useState({})
  const [activitiesLoaded, setActivitiesLoaded] = useState(false)
  const [dataError, setDataError] = useState(null)

  // Filters are a per-device view preference, not shared account data, so
  // they stay in localStorage rather than costing a Firestore write on every
  // slider drag.
  const [filters, setFilters] = useState(() => loadStorage('smartsync:filters', defaultFilters))
  const [celebration, setCelebration] = useState(null)

  useEffect(() => {
    saveStorage('smartsync:filters', filters)
  }, [filters])

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
    setDataError(null)
    setActivitiesLoaded(false)
  }

  useEffect(() => {
    if (!uid) return undefined
    const stops = [
      watchActivities((next) => {
        setActivities(next)
        setActivitiesLoaded(true)
      }, setDataError),
      watchPeers(uid, setPeers, setDataError),
      watchNotifications(uid, setNotifications, setDataError),
      watchFollowing(uid, setFollowedUserIds, setDataError),
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
  const located = useMemo(() => {
    const from = user?.location || null
    return activities.map((activity) => ({
      ...activity,
      distanceKm: from ? distanceBetween(from, { lat: activity.lat, lng: activity.lng }) : null,
    }))
  }, [activities, user?.location])

  // Scored once, over everything. Previously only active activities were
  // ranked, so an activity you had joined and the host then cancelled lost its
  // match score and rendered as "--%" in your own list.
  const scored = useMemo(() => rankActivities(user, located, peers), [user, located, peers])

  const visibleActivities = useMemo(
    () => scored.filter((a) => a.status === 'active' || joinedIds.includes(a.id)),
    [scored, joinedIds],
  )

  const recommendations = useMemo(
    () => visibleActivities.filter((a) => a.status === 'active'),
    [visibleActivities],
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
    const activity = activities.find((item) => item.id === id)
    if (!activity || joinedIds.includes(id)) return
    const ok = await attempt(() => joinActivityDoc(id, uid), { failure: "Couldn't join" })
    if (ok === null) return

    // Joining is the behaviour worth learning from, so record the category.
    // Leaving deliberately does not un-learn it — you did show interest.
    recordCategoryHistory(uid, user.historyCategories, activity.category)

    // A real notification to a real other person.
    notifyUser(activity.hostId, {
      type: 'activity',
      title: 'Someone joined',
      body: `${user.name} joined ${activity.title}.`,
      activityId: id,
    })

    pushCelebration({
      icon: 'check',
      tone: 'success',
      title: 'You are in',
      body: `${activity.title} added to your list.`,
    })
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

  async function createActivity(data) {
    const id = await attempt(() => createActivityDoc(user, data), {
      failure: "Couldn't create activity",
    })
    if (!id) return null
    recordCategoryHistory(uid, user.historyCategories, data.category)
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

  const value = {
    // Signed out is not "still loading" — it is a settled state with no data.
    loading: Boolean(uid) && !activitiesLoaded,
    dataError,

    activities: visibleActivities,
    recommendations,
    filteredActivities,
    peers,

    joinedIds,
    joinActivity,
    leaveActivity,
    cancelActivity,
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

    filters,
    setFilters,
    resetFilters: () => setFilters(defaultFilters),

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
