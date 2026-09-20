import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { doc, getDoc } from 'firebase/firestore'

import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase/config'
import { reportError } from '../utils/reportError'

/**
 * Where a tap on a browser notification lands: `/n/{id}`.
 *
 * The notification is marked read the way the inbox marks one read, and
 * the person is sent on to what it was about — the thread for a message,
 * the activity for anything about an activity, the inbox for the rest. One
 * path for a tap on the OS banner, a tap on the in-app toast, and a link
 * pasted from either.
 */
export default function NotificationOpenPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notifications, markNotificationRead } = useApp()

  useEffect(() => {
    let cancelled = false
    async function open() {
      let record = notifications.find((n) => n.id === id) || null
      if (!record) {
        // Older than the inbox window, or the inbox has not loaded yet: ask.
        try {
          const snap = await getDoc(doc(db, 'users', user.uid, 'notifications', id))
          if (snap.exists()) record = { id: snap.id, ...snap.data() }
        } catch (error) {
          reportError('notifications.open', error, { id })
        }
      }
      if (cancelled) return
      if (record && !record.read) {
        markNotificationRead(id).catch((error) =>
          reportError('notifications.markRead', error, { id }),
        )
      }
      // Close the OS banner for this record, if one is still showing.
      closeShownNotification(id)
      const activityId = record?.activityId
      const to = !activityId
        ? '/notifications'
        : record.type === 'chat'
          ? `/activity/${activityId}/chat`
          : `/activity/${activityId}`
      navigate(to, { replace: true })
    }
    open()
    return () => {
      cancelled = true
    }
    // Runs once for the id; the inbox list is only a shortcut past a read.
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page-content">
      <p className="helper-text">{t('pushSettings.opening')}</p>
    </div>
  )
}

async function closeShownNotification(id) {
  try {
    if (!('serviceWorker' in navigator)) return
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return
    const shown = await registration.getNotifications()
    shown.filter((n) => n.data?.id === id).forEach((n) => n.close())
  } catch {
    // Nothing to close.
  }
}
