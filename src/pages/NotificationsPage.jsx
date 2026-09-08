import React from 'react'
import { Bell, CalendarDays, Eye, Inbox } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'

export default function NotificationsPage() {
  const { notifications, markNotificationRead } = useApp()
  const navigate = useNavigate()
  const open = (n) => {
    markNotificationRead(n.id)
    if (n.activityId) navigate(`/activity/${n.activityId}`)
  }

  return (
    <div className="page-content light-page">
      <div className="title-row">
        <BackButton />
        <h2>Notifications</h2>
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
            <div className="note-bar" />
            <div className="avatar small">{n.title.slice(0, 1)}</div>
            <div>
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              <small>{n.time}</small>
            </div>
            {!n.read && <span className="live-dot" />}
          </button>
        ))}
      </div>
    </div>
  )
}
