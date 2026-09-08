import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import {
  initialMessages,
  initialNotifications,
  initialUser,
  mockActivities,
} from '../data/mockData'

import { loadStorage, saveStorage } from '../utils/storage'

import { rankActivities } from '../services/recommendationService'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  // =========================================================
  // USER
  // =========================================================

  const [user, setUser] = useState(() => loadStorage('smartsync:user', initialUser))

  // =========================================================
  // ACTIVITIES
  // =========================================================

  const [activities, setActivities] = useState(() =>
    loadStorage('smartsync:activities', mockActivities),
  )

  // =========================================================
  // JOINED ACTIVITIES
  // =========================================================

  const [joinedIds, setJoinedIds] = useState(() => loadStorage('smartsync:joined', ['a1']))

  // =========================================================
  // MESSAGES
  // =========================================================

  const [messages, setMessages] = useState(() => loadStorage('smartsync:messages', initialMessages))

  // =========================================================
  // NOTIFICATIONS
  // =========================================================

  const [notifications, setNotifications] = useState(() =>
    loadStorage('smartsync:notifications', initialNotifications),
  )

  // =========================================================
  // FOLLOWED USERS
  // Users we want activity notifications from
  // =========================================================

  const [followedUserIds, setFollowedUserIds] = useState(() =>
    loadStorage('smartsync:followedUsers', []),
  )

  // =========================================================
  // PRIVACY
  // =========================================================

  const [privacy, setPrivacy] = useState(() =>
    loadStorage('smartsync:privacy', {
      anonymousMode: false,
      locationPermission: true,
      approximateLocation: true,
      notifications: true,
    }),
  )

  // =========================================================
  // FILTERS
  // =========================================================

  const [filters, setFilters] = useState(() =>
    loadStorage('smartsync:filters', {
      category: 'All',
      maxDistance: 10,
      date: 'Any',
      timeBand: 'Any',
      availableOnly: true,
    }),
  )

  // =========================================================
  // CELEBRATION / POPUP
  // =========================================================

  const [celebration, setCelebration] = useState(null)

  // =========================================================
  // SAVE USER
  // =========================================================

  useEffect(() => {
    saveStorage('smartsync:user', user)
  }, [user])

  // =========================================================
  // SAVE ACTIVITIES
  // =========================================================

  useEffect(() => {
    saveStorage('smartsync:activities', activities)
  }, [activities])

  // =========================================================
  // SAVE JOINED ACTIVITIES
  // =========================================================

  useEffect(() => {
    saveStorage('smartsync:joined', joinedIds)
  }, [joinedIds])

  // =========================================================
  // SAVE MESSAGES
  // =========================================================

  useEffect(() => {
    saveStorage('smartsync:messages', messages)
  }, [messages])

  // =========================================================
  // SAVE NOTIFICATIONS
  // =========================================================

  useEffect(() => {
    saveStorage('smartsync:notifications', notifications)
  }, [notifications])

  // =========================================================
  // SAVE FOLLOWED USERS
  // =========================================================

  useEffect(() => {
    saveStorage('smartsync:followedUsers', followedUserIds)
  }, [followedUserIds])

  // =========================================================
  // SAVE PRIVACY
  // =========================================================

  useEffect(() => {
    saveStorage('smartsync:privacy', privacy)
  }, [privacy])

  // =========================================================
  // SAVE FILTERS
  // =========================================================

  useEffect(() => {
    saveStorage('smartsync:filters', filters)
  }, [filters])

  // =========================================================
  // AUTO HIDE POPUP
  // =========================================================

  useEffect(() => {
    if (!celebration) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setCelebration(null)
    }, 2800)

    return () => window.clearTimeout(timer)
  }, [celebration])

  // =========================================================
  // SHOW POPUP
  // =========================================================

  function pushCelebration(payload) {
    setCelebration({
      id: Date.now(),

      emoji: '✨',

      title: '',

      body: '',

      ...payload,
    })
  }

  // =========================================================
  // RECOMMENDATIONS
  // =========================================================

  const recommendations = useMemo(() => {
    return rankActivities(user, activities)
  }, [user, activities])

  // =========================================================
  // FILTERED ACTIVITIES
  // =========================================================

  const filteredActivities = useMemo(() => {
    return recommendations.filter((activity) => {
      // CATEGORY
      if (filters.category !== 'All' && activity.category !== filters.category) {
        return false
      }

      // DISTANCE
      if ((activity.distanceKm || 0) > Number(filters.maxDistance || 999)) {
        return false
      }

      // DATE
      if (filters.date !== 'Any' && activity.date !== filters.date) {
        return false
      }

      // TIME
      if (filters.timeBand !== 'Any' && activity.timeBand !== filters.timeBand) {
        return false
      }

      // AVAILABLE SPOTS
      if (filters.availableOnly && activity.participants >= activity.capacity) {
        return false
      }

      return true
    })
  }, [recommendations, filters])

  // =========================================================
  // USER NOTIFICATION FOLLOW
  //
  // Click "Notify me"
  // -> add user id
  // -> create notification
  // -> show popup
  //
  // Click again
  // -> turn it off
  // =========================================================

  function toggleUserNotifications(targetUser) {
    if (!targetUser?.id) {
      return
    }

    const alreadyOn = followedUserIds.includes(targetUser.id)

    // =====================================================
    // TURN OFF
    // =====================================================

    if (alreadyOn) {
      setFollowedUserIds((previous) => previous.filter((id) => id !== targetUser.id))

      pushCelebration({
        emoji: '🔕',

        title: 'Notifications off',

        body: `${targetUser.name} activity alerts turned off.`,
      })

      return
    }

    // =====================================================
    // TURN ON
    // =====================================================

    setFollowedUserIds((previous) => [...new Set([...previous, targetUser.id])])

    // ADD CONFIRMATION TO NOTIFICATION PAGE

    const notification = {
      id: `follow-${Date.now()}`,

      type: 'follow',

      title: `Following ${targetUser.name}`,

      body: `You'll get notified when ${targetUser.name} creates a new activity.`,

      userId: targetUser.id,

      read: false,

      time: 'Now',
    }

    setNotifications((previous) => [notification, ...previous])

    // POPUP

    pushCelebration({
      emoji: '🔔',

      title: 'Notifications on',

      body: `You'll get ${targetUser.name}'s activity alerts.`,
    })
  }

  // =========================================================
  // CHECK IF USER NOTIFICATION IS ON
  // OPTIONAL HELPER
  // =========================================================

  function isFollowingUser(userId) {
    return followedUserIds.includes(userId)
  }

  // =========================================================
  // JOIN ACTIVITY
  // =========================================================

  function joinActivity(id) {
    if (joinedIds.includes(id)) {
      return
    }

    // ADD TO JOINED

    setJoinedIds((previous) => [...previous, id])

    // INCREASE PARTICIPANTS

    setActivities((previous) =>
      previous.map((activity) => {
        if (activity.id !== id) {
          return activity
        }

        return {
          ...activity,

          participants: Math.min(
            activity.capacity,

            activity.participants + 1,
          ),

          joinedUserIds: [...new Set([...(activity.joinedUserIds || []), 'me'])],
        }
      }),
    )

    const activity = activities.find((item) => item.id === id)

    if (!activity) {
      return
    }

    // CREATE NOTIFICATION

    setNotifications((previous) => [
      {
        id: `join-${Date.now()}`,

        type: 'activity',

        title: 'Activity joined',

        body: `You joined ${activity.title}.`,

        activityId: id,

        read: false,

        time: 'Now',
      },

      ...previous,
    ])

    pushCelebration({
      emoji: '🎉',

      title: 'You are in!',

      body: `${activity.title} added to your list.`,
    })
  }

  // =========================================================
  // LEAVE ACTIVITY
  // =========================================================

  function leaveActivity(id) {
    if (!joinedIds.includes(id)) {
      return
    }

    setJoinedIds((previous) => previous.filter((activityId) => activityId !== id))

    setActivities((previous) =>
      previous.map((activity) => {
        if (activity.id !== id) {
          return activity
        }

        return {
          ...activity,

          participants: Math.max(
            0,

            activity.participants - 1,
          ),

          joinedUserIds: (activity.joinedUserIds || []).filter((userId) => userId !== 'me'),
        }
      }),
    )

    const activity = activities.find((item) => item.id === id)

    if (activity) {
      pushCelebration({
        emoji: '👋',

        title: 'Activity left',

        body: `You left ${activity.title}.`,
      })
    }
  }

  // =========================================================
  // CANCEL ACTIVITY
  //
  // For the host only. Leaving would orphan the activity
  // (it stays listed with no owner interaction available),
  // so hosts cancel/delete it instead.
  // =========================================================

  function cancelActivity(id) {
    const activity = activities.find((item) => item.id === id)

    if (!activity || activity.createdBy !== 'me') {
      return
    }

    setActivities((previous) => previous.filter((item) => item.id !== id))

    setJoinedIds((previous) => previous.filter((activityId) => activityId !== id))

    pushCelebration({
      emoji: '🗑️',

      title: 'Activity cancelled',

      body: `${activity.title} was removed.`,
    })
  }

  // =========================================================
  // CREATE ACTIVITY
  // =========================================================

  function createActivity(data) {
    const id = `a-${Date.now()}`

    const newActivity = {
      id,

      ...data,

      distanceKm: Number(data.distanceKm || 1.5),

      participants: 1,

      capacity: Number(data.capacity || 8),

      createdBy: 'me',

      host: user.name,

      similarUsersJoined: false,

      joinedUserIds: ['me'],

      tags: [data.category, data.timeBand, 'Hosted by you'],

      x: 35 + Math.round(Math.random() * 30),

      y: 30 + Math.round(Math.random() * 30),
    }

    // ADD ACTIVITY

    setActivities((previous) => [newActivity, ...previous])

    // AUTO JOIN OWN ACTIVITY

    setJoinedIds((previous) => [...new Set([...previous, id])])

    // CREATE NOTIFICATION

    setNotifications((previous) => [
      {
        id: `created-${Date.now()}`,

        type: 'activity',

        title: 'Activity created',

        body: `${newActivity.title} is live.`,

        activityId: id,

        read: false,

        time: 'Now',
      },

      ...previous,
    ])

    pushCelebration({
      emoji: '🚀',

      title: 'Activity created',

      body: `${newActivity.title} is live now.`,
    })

    return id
  }

  // =========================================================
  // UPDATE ACTIVITY
  // =========================================================

  function updateActivity(id, updates) {
    setActivities((previous) =>
      previous.map((activity) => {
        if (activity.id !== id) {
          return activity
        }

        return {
          ...activity,

          ...updates,

          capacity: Math.max(
            activity.participants,
            Number(updates.capacity ?? activity.capacity),
          ),
        }
      }),
    )

    pushCelebration({
      emoji: '✨',

      title: 'Saved',

      body: 'Changes saved.',
    })
  }

  // =========================================================
  // SEND MESSAGE
  // =========================================================

  function sendMessage(activityId, text) {
    const trimmed = text.trim()

    if (!trimmed) {
      return
    }

    const now = new Date()

    const message = {
      id: `message-${Date.now()}`,

      senderId: 'me',

      sender: privacy.anonymousMode ? 'Anonymous' : user.name,

      text: trimmed,

      time: now.toLocaleTimeString([], {
        hour: 'numeric',

        minute: '2-digit',
      }),
    }

    setMessages((previous) => ({
      ...previous,

      [activityId]: [...(previous[activityId] || []), message],
    }))
  }

  // =========================================================
  // MARK NOTIFICATION READ
  // =========================================================

  function markNotificationRead(id) {
    setNotifications((previous) =>
      previous.map((notification) => {
        if (notification.id !== id) {
          return notification
        }

        return {
          ...notification,

          read: true,
        }
      }),
    )
  }

  // =========================================================
  // MARK ALL NOTIFICATIONS READ
  // =========================================================

  function markAllNotificationsRead() {
    setNotifications((previous) => previous.map((notification) => ({ ...notification, read: true })))
  }

  // =========================================================
  // RESET PROTOTYPE
  // =========================================================

  function resetPrototype() {
    setUser(initialUser)

    setActivities(mockActivities)

    setJoinedIds(['a1'])

    setMessages(initialMessages)

    setNotifications(initialNotifications)

    setFollowedUserIds([])

    setPrivacy({
      anonymousMode: false,

      locationPermission: true,

      approximateLocation: true,

      notifications: true,
    })

    setFilters({
      category: 'All',

      maxDistance: 10,

      date: 'Any',

      timeBand: 'Any',

      availableOnly: true,
    })

    pushCelebration({
      emoji: '🔄',

      title: 'Reset complete',

      body: 'Demo data restored.',
    })
  }

  // =========================================================
  // CONTEXT VALUES
  // =========================================================

  const value = {
    // USER
    user,
    setUser,

    // ACTIVITIES
    activities,
    recommendations,
    filteredActivities,

    // JOIN
    joinedIds,
    joinActivity,
    leaveActivity,
    cancelActivity,

    // CREATE / UPDATE
    createActivity,
    updateActivity,

    // MESSAGES
    messages,
    sendMessage,

    // NOTIFICATIONS
    notifications,
    markNotificationRead,
    markAllNotificationsRead,

    // USER ACTIVITY ALERTS
    followedUserIds,
    toggleUserNotifications,
    isFollowingUser,

    // PRIVACY
    privacy,
    setPrivacy,

    // FILTERS
    filters,
    setFilters,

    // RESET
    resetPrototype,

    // POPUPS
    celebration,
    pushCelebration,
  }

  // =========================================================
  // PROVIDER
  // =========================================================

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// =========================================================
// CUSTOM HOOK
// =========================================================

export function useApp() {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error('useApp must be used inside AppProvider')
  }

  return context
}
