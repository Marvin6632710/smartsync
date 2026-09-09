import React, { useEffect, useState } from 'react'
import { Bell, CalendarDays, Eye, Inbox } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'
import { formatRelativeTime } from '../utils/time'

export default function NotificationsPage() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useApp()
  const navigate = useNavigate()
  const hasUnread = notifications.some((n) => !n.read)

  // Ages are derived at render, so re-render each minute to keep them
  // truthful while the page sits open — otherwise "Just now" would stick.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(tick)
  }, [])
  const open = (n) => {
    markNotificationRead(n.id)
    if (n.activityId) navigate(`/activity/${n.activityId}`)
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
        <span className="filter-chip active">
          <Bell size={16} /> All
        </span>
        <span className="filter-chip">
          <Inbox size={16} /> Requests
        </span>
        <span className="filter-chip">
          <CalendarDays size={16} /> Activities
        </span>
        <span className="filter-chip">
          <Eye size={16} /> Updates
        </span>
      </div>
      <div className="stack list-stack">
        {notifications.map((n) => (
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
      </div>
    </div>
  )
}
