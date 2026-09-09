import React from 'react'
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  Compass,
  Link2,
  LogOut,
  Map,
  MessageSquare,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  WifiOff,
  User,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

const toastIcons = {
  sparkles: Sparkles,
  check: Check,
  bell: Bell,
  'bell-off': BellOff,
  'log-out': LogOut,
  trash: Trash2,
  rotate: RotateCcw,
  link: Link2,
  alert: AlertTriangle,
}

const tabs = [
  { to: '/home', label: 'Discover', icon: Compass },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/recommendations', label: 'AI Picks', icon: Sparkles },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/profile', label: 'Profile', icon: User },
]

const routeTitles = {
  home: 'Discover',
  search: 'Search',
  map: 'Map',
  activity: 'Activity',
  create: 'Create activity',
  filters: 'Filters',
  recommendations: 'AI Picks',
  matching: 'People match',
  messages: 'Messages',
  notifications: 'Notifications',
  profile: 'Profile',
  settings: 'Settings',
  privacy: 'Privacy',
  joined: 'Joined',
  404: 'Not found',
}

function CelebrationToast({ celebration }) {
  const Icon = toastIcons[celebration.icon] || Sparkles
  return (
    <div className="celebration-toast" key={celebration.id} role="status" aria-live="polite">
      <div className={`toast-icon ${celebration.tone || 'default'}`}>
        <Icon size={18} />
      </div>
      <div>
        <strong>{celebration.title}</strong>
        <p>{celebration.body}</p>
      </div>
    </div>
  )
}

export default function Shell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notifications, celebration, dataError, offline } = useApp()
  const { user } = useAuth()
  const unread = notifications.filter((n) => !n.read).length
  const simpleTitle = location.pathname.split('/')[1] || 'home'
  const title = routeTitles[simpleTitle] || 'Discover'

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
            <h1>{title}</h1>
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

        {/* Offline is a normal state here, not an error: Firestore serves
            reads from cache and queues writes. Saying so is the difference
            between "this app still works" and "did my join actually save?" */}
        {offline && (
          <div className="offline-banner" role="status">
            <WifiOff size={15} />
            <span>Offline — changes will sync when you reconnect.</span>
          </div>
        )}

        {/* A listener failure used to be invisible: the screens simply showed
            "nothing here", which reads as "there is nothing" rather than "we
            could not load it". Non-blocking, because whatever did load is
            still worth showing. */}
        {dataError && (
          <div className="data-error-banner" role="alert">
            <AlertTriangle size={15} />
            <span>Couldn&apos;t load the latest data. Check your connection.</span>
            <button className="text-button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}

        {celebration && <CelebrationToast celebration={celebration} />}

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
