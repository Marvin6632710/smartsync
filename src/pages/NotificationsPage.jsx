import React, { useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, CalendarDays, MessageCircle, ShieldAlert, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import { localizeNotification } from '../i18n/notificationText'
import { reportError } from '../utils/reportError'
import { formatRelativeTime } from '../utils/time'

// Each chip maps to notification types the app genuinely writes, so no filter
// can select a category that will always be empty.
const FILTERS = [
  { key: 'all', label: 'notifications.all', icon: Bell, types: null },
  { key: 'activities', label: 'notifications.activities', icon: CalendarDays, types: ['activity'] },
  { key: 'chat', label: 'notifications.chat', icon: MessageCircle, types: ['chat'] },
  {
    key: 'other',
    label: 'notifications.updates',
    icon: Sparkles,
    types: ['follow', 'recommendation', 'general'],
  },
  // Moderation decisions get their own chip rather than being filed under
  // "Updates". Being told your activity was taken down, or your account
  // suspended, is not an update — and it is the one notification somebody
  // will come back looking for.
  { key: 'safety', label: 'notifications.safety', icon: ShieldAlert, types: ['moderation'] },
]

export default function NotificationsPage() {
  const { t } = useTranslation()
  const { notifications, markNotificationRead, markAllNotificationsRead } = useApp()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const hasUnread = notifications.some((n) => !n.read)

  // Ages are derived at render, so re-render each minute to keep them
  // truthful while the page sits open — otherwise "Just now" would stick.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(tick)
  }, [])

  const visible = useMemo(() => {
    const types = FILTERS.find((option) => option.key === filter)?.types
    if (!types) return notifications
    return notifications.filter((n) => types.includes(n.type))
  }, [notifications, filter])

  const open = (notification) => {
    // Best effort, and not awaited — the tap opens the activity either way —
    // but no longer left unhandled if it is refused.
    if (!notification.read) {
      markNotificationRead(notification.id).catch((error) =>
        reportError('notifications.markRead', error, { id: notification.id }),
      )
    }
    if (notification.activityId) navigate(`/activity/${notification.activityId}`)
  }

  const markAll = () =>
    markAllNotificationsRead().catch((error) => reportError('notifications.markAll', error))

  return (
    <div className="page-content">
      <div className="title-row">
        <h2>{t('notifications.title')}</h2>
        {hasUnread && (
          <button className="text-button" style={{ marginLeft: 'auto' }} onClick={markAll}>
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      <div className="chip-row category-row scroll-row">
        {FILTERS.map((option) => {
          const Icon = option.icon
          return (
            <button
              className={`filter-chip ${filter === option.key ? 'active' : ''}`}
              key={option.key}
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
            >
              <Icon size={16} /> {t(option.label)}
            </button>
          )
        })}
      </div>

      <div className="stack list-stack">
        {visible.map((n) => {
          // Stored in English by whoever wrote it; worded here for the reader.
          const text = localizeNotification(n)
          return (
            <button
              className={`notification-card nomad-note ${n.read ? 'read' : ''}`}
              key={n.id}
              onClick={() => open(n)}
            >
              <div className="avatar small">{(text.title || '?').slice(0, 1)}</div>
              <div>
                <strong>{text.title}</strong>
                <p>{text.body}</p>
                <small>{formatRelativeTime(n.createdAt, now)}</small>
              </div>
              {!n.read && <span className="live-dot" />}
            </button>
          )
        })}
        {visible.length === 0 && (
          <div className="empty-state">
            <BellOff size={30} />
            <h3>
              {filter === 'all' ? t('notifications.nothingYet') : t('notifications.nothingHere')}
            </h3>
            <p>
              {filter === 'all' ? t('notifications.nothingYetBody') : t('notifications.tryFilter')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
