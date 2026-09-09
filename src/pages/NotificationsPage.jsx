import React, { useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, CalendarDays, MessageCircle, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'
import { formatRelativeTime } from '../utils/time'

// Each chip maps to notification types the app genuinely writes, so no filter
// can select a category that will always be empty.
const FILTERS = [
  { key: 'all', label: 'All', icon: Bell, types: null },
  { key: 'activities', label: 'Activities', icon: CalendarDays, types: ['activity'] },
  { key: 'chat', label: 'Messages', icon: MessageCircle, types: ['chat'] },
  {
    key: 'other',
    label: 'Updates',
    icon: Sparkles,
    types: ['follow', 'recommendation', 'general'],
  },
]

export default function NotificationsPage() {
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
    markNotificationRead(notification.id)
    if (notification.activityId) navigate(`/activity/${notification.activityId}`)
  }

  return (
    <div className="page-content">
      <div className="title-row">
        <BackButton />
        <h2>Notifications</h2>
        {hasUnread && (
          <button
            className="text-button"
            style={{ marginLeft: 'auto' }}
            onClick={markAllNotificationsRead}
          >
            Mark all read
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
              <Icon size={16} /> {option.label}
            </button>
          )
        })}
      </div>

      <div className="stack list-stack">
        {visible.map((n) => (
          <button
            className={`notification-card nomad-note ${n.read ? 'read' : ''}`}
            key={n.id}
            onClick={() => open(n)}
          >
            <div className="avatar small">{(n.title || '?').slice(0, 1)}</div>
            <div>
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              <small>{formatRelativeTime(n.createdAt, now)}</small>
            </div>
            {!n.read && <span className="live-dot" />}
          </button>
        ))}
        {visible.length === 0 && (
          <div className="empty-state">
            <BellOff size={30} />
            <h3>{filter === 'all' ? 'Nothing yet' : 'Nothing here'}</h3>
            <p>
              {filter === 'all'
                ? 'Joins, messages and activity updates will show up here.'
                : 'Try another filter.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
