import React, { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Compass,
  Map,
  MessageSquare,
  Plus,
  ShieldAlert,
  Sparkles,
  WifiOff,
  User,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import BackButton from './BackButton'
import CelebrationToast from './CelebrationToast'
import RouteErrorBoundary from './RouteErrorBoundary'
import JoinBurst from './JoinBurst'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

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
  weights: 'Matching weights',
  blocked: 'Blocked people',
  moderation: 'Moderation',
  joined: 'Joined',
  404: 'Not found',
}

export default function Shell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notifications, celebration, dataError, offline, browserOffline, serverSilent } = useApp()
  const { user } = useAuth()
  const unread = notifications.filter((n) => !n.read).length
  const simpleTitle = location.pathname.split('/')[1] || 'home'
  // The create button belongs on the five screens you browse from, where
  // starting something yourself is a reasonable next thought. Everywhere else
  // it is a floating obstacle: it sat on top of the sticky Join button on an
  // activity page, on top of the send button in a chat, and — on a narrow
  // phone — on top of the search field in the moderation queue.
  const atRootTab = tabs.some((tab) => tab.to === location.pathname)
  const showCreate = atRootTab

  /**
   * The bar's title, the way iOS does it.
   *
   * Every screen printed its name twice — once in the bar and again as the
   * heading directly beneath it. So the bar holds its title back while the
   * page's own heading is still on screen, and takes it over once you have
   * scrolled past it. You always know where you are; you are never told
   * twice at once.
   *
   * A page too short to scroll never reaches that point, so it shows the
   * title immediately rather than sitting nameless forever.
   */
  const scrollRef = useRef(null)
  const lastScroll = useRef(0)
  const [barTitled, setBarTitled] = useState(false)
  // The create button floats over the list, so while you are reading downwards
  // it steps out of the way of the card underneath it and comes back the
  // moment you scroll up — which is also the moment you are most likely to be
  // looking for it. It is never hidden at rest at the top of a list.
  const [createTucked, setCreateTucked] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    lastScroll.current = el.scrollTop
    const update = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 8
      const top = el.scrollTop
      setBarTitled(!canScroll || top > 10)

      const delta = top - lastScroll.current
      // A dead band, so a thumb resting on the glass does not flicker it.
      if (Math.abs(delta) > 6) {
        setCreateTucked(delta > 0 && top > 140)
        lastScroll.current = top
      }
      if (top <= 140) setCreateTucked(false)
    }
    el.addEventListener('scroll', update, { passive: true })
    // Fires once on observe, which is what initialises the state — and again
    // whenever content arriving changes whether the page can scroll at all.
    const resize = new ResizeObserver(update)
    resize.observe(el)
    if (el.firstElementChild) resize.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      resize.disconnect()
    }
  }, [location.pathname])
  const title = routeTitles[simpleTitle] || 'Discover'

  return (
    <div className="app-shell">
      <div className="mobile-frame">
        <header className="topbar" data-titled={barTitled ? 'yes' : 'no'}>
          {atRootTab ? (
            <button
              className="avatar top-avatar"
              onClick={() => navigate('/profile')}
              aria-label="Open profile"
            >
              {user.avatar}
            </button>
          ) : (
            <BackButton />
          )}
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
        {/* A suspended account can still read, so it must be told why the
            rest has stopped working. Silently disabled controls read as a
            broken app rather than a decision somebody made. */}
        {user.suspended && (
          <div className="suspended-banner" role="alert">
            <ShieldAlert size={15} />
            <span>
              Your account is suspended. You can still read, but cannot create, join or message.
            </span>
          </div>
        )}

        {/* Two banners in one place: the device has no connection, which
            the browser says outright, or the server has said nothing for
            long enough — which on a slow link is the connection being slow,
            not gone, and is worded as what is known rather than as a
            verdict. Either way what is on screen is the last thing loaded,
            and any change made now is queued. */}
        {offline && (
          <div className="offline-banner" role="status">
            <WifiOff size={15} />
            <span>
              {serverSilent && !browserOffline
                ? 'No answer from the server yet — showing what was last loaded. Changes will sync when it answers.'
                : 'Offline — changes will sync when you reconnect.'}
            </span>
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

        <CelebrationToast />

        {/* Sits outside the scroller and above everything, so a burst thrown
            from the middle of the screen is never clipped by the card that
            caused it. Keyed on the celebration id, which changes once per
            event — that is what makes it fire exactly once. */}
        {celebration?.burst && (
          <div data-category={celebration.burst}>
            <JoinBurst token={celebration.id} color="var(--cat, var(--accent))" />
          </div>
        )}

        <main className="page-scroll" ref={scrollRef}>
          {/* Scoped to the page, so one screen failing leaves the bar and the
              tabs intact rather than replacing the whole app. */}
          <RouteErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </main>

        {/* An activity page is a place to act on that activity, not to start
            another one; a chat is a place to talk. */}
        {showCreate && (
          <button
            className="fab-create"
            data-tucked={createTucked ? 'yes' : 'no'}
            onClick={() => navigate('/create')}
            aria-label="Create activity"
            // The rules refuse it anyway; disabling here means the answer is
            // immediate and explained rather than a rejection after the fact.
            disabled={user.suspended}
          >
            <Plus size={26} />
          </button>
        )}

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
