import React from 'react'
import { Bell, Compass, Map, MessageSquare, Plus, Sparkles, User } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const tabs = [
  { to: '/home', label: 'Discover', icon: Compass },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/recommendations', label: 'AI Picks', icon: Sparkles },
  { to: '/messages', label: 'Inbox', icon: MessageSquare },
  { to: '/profile', label: 'Profile', icon: User },
]

const routeTitles = {
  home: 'Discover',
  search: 'Search',
  map: 'Map',
  activity: 'Activity',
  create: 'Create activity',
  filters: 'Filters',
  recommendations: 'Recommendations',
  matching: 'People match',
  messages: 'Messages',
  notifications: 'Notifications',
  profile: 'Profile',
  settings: 'Settings',
  privacy: 'Privacy',
  joined: 'Joined',
  404: 'Not found',
}

export default function Shell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notifications, celebration, user } = useApp()
  const unread = notifications.filter((n) => !n.read).length
  const simpleTitle = location.pathname.split('/')[1] || 'home'
  const title = routeTitles[simpleTitle] || 'SmartSync'
  const isMainView = ['/home', '/map', '/messages', '/profile', '/recommendations'].includes(
    location.pathname,
  )

  return (
    <div className="app-shell">
      <div className="mobile-frame">
        <header className="topbar">
          <button
            className="avatar top-avatar"
            onClick={() => navigate('/profile')}
            aria-label="Open profile"
          >
            {user.avatar}
          </button>
          <div className="topbar-copy">
            <span className="eyebrow">SmartSync</span>
            <h1>{isMainView ? 'SmartSync' : title}</h1>
          </div>
          <div className="topbar-meta">
            <button
              className="icon-button notification-button"
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
            >
              <Bell size={20} />
              {unread > 0 && <span className="badge">{unread}</span>}
            </button>
          </div>
        </header>

        {celebration && (
          <div className="celebration-toast" key={celebration.id} role="status" aria-live="polite">
            <div className="toast-emoji">{celebration.emoji}</div>
            <div>
              <strong>{celebration.title}</strong>
              <p>{celebration.body}</p>
            </div>
          </div>
        )}

        <main className="page-scroll">
          <Outlet />
        </main>

        <button
          className="fab-create"
          onClick={() => navigate('/create')}
          aria-label="Create activity"
        >
          <Plus size={26} />
        </button>

        <nav className="bottom-nav" aria-label="Primary navigation">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <span className="nav-icon-wrap">
                <Icon size={21} />
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
