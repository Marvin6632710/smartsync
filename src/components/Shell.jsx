import { AvatarContent } from './SavedPicture'
import React, { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Compass,
  Map,
  MessageSquare,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  WifiOff,
  User,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BackButton from './BackButton'
import CelebrationToast from './CelebrationToast'
import BrandMark from './BrandMark'
import LanguageMenu from './LanguageMenu'
import PushInvite from './PushInvite'
import { usePushNavigation } from '../hooks/usePushNavigation'
import RouteErrorBoundary from './RouteErrorBoundary'
import JoinBurst from './JoinBurst'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

// Labels are translation keys; the words are looked up at render.
const tabs = [
  { to: '/home', label: 'nav.discover', icon: Compass },
  { to: '/map', label: 'nav.map', icon: Map },
  { to: '/recommendations', label: 'nav.aiPicks', icon: Sparkles },
  { to: '/messages', label: 'nav.messages', icon: MessageSquare },
  { to: '/profile', label: 'nav.profile', icon: User },
]

const ROUTE_TITLES = new Set([
  'home',
  'search',
  'map',
  'activity',
  'create',
  'filters',
  'recommendations',
  'matching',
  'messages',
  'notifications',
  'profile',
  'settings',
  'privacy',
  'blocked',
  'moderation',
  'joined',
  'terms',
  '404',
])

/**
 * Which screen the scroller is showing, as one word the stylesheet can key
 * on: the width a page is given on a wide screen, and the composition it
 * takes there, are decided in CSS by this rather than by every page naming
 * its own. Sub-routes that need a different width from their parent get
 * their own word (an activity's chat is a column; the activity itself is
 * two).
 */
function viewOf(pathname) {
  const [, first = 'home', second, third] = pathname.split('/')
  if (first === 'activity') return third ? `activity-${third}` : 'activity'
  if (first === 'profile') return second === 'edit' ? 'profile-edit' : 'profile'
  return first
}

// The bar's tabs, minus Profile: on a wide screen the avatar at the end of
// the header is the way to the profile, the way every web application does
// it, so a fifth tab would be the same door twice.
const headerTabs = tabs.filter((tab) => tab.to !== '/profile')

export default function Shell() {
  const { t } = useTranslation()
  usePushNavigation()
  const navigate = useNavigate()
  const location = useLocation()
  const { unreadCount, celebration, dataError, offline, browserOffline, serverSilent } = useApp()
  const { user } = useAuth()
  // The badge: the exact number up to ninety-nine, then "99+"; nothing at
  // zero. The button's name carries the count too, since a screen reader
  // does not read a badge — "Notifications, 3 unread".
  const unread = unreadCount
  const badgeText = unread > 99 ? '99+' : String(unread)
  const bellLabel =
    unread > 0
      ? t('shell.notificationsUnread', { count: unread, shown: badgeText })
      : t('shell.notifications')
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
    for (const child of el.children) resize.observe(child)
    return () => {
      el.removeEventListener('scroll', update)
      resize.disconnect()
    }
  }, [location.pathname])
  // The page scrolls inside `main`, not the document, and a scroller only
  // answers Page Down or the arrow keys once something inside it has focus.
  // So each screen starts with focus on the scroller — unless the screen has
  // already put it somewhere of its own, the way Search focuses its field.
  // Nothing is drawn for it, and a screen reader lands on the new page
  // rather than staying on the tab that was pressed.
  useEffect(() => {
    const el = scrollRef.current
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
  }, [location.pathname])
  const title = t(`titles.${ROUTE_TITLES.has(simpleTitle) ? simpleTitle : 'home'}`)
  const view = viewOf(location.pathname)

  return (
    <div className="app-shell">
      {/* Two headers, one shown at a time by the stylesheet. Under 720px the
          app is a phone: a bar with the way back, and tabs along the bottom.
          From 720px it is a web application: one header carrying the brand,
          the tabs, search, the create action, notifications and the profile,
          and nothing along the bottom. Both are rendered so that no width
          measurement runs in JavaScript and no header flashes in late. */}
      <header className="topbar" data-titled={barTitled ? 'yes' : 'no'}>
        {atRootTab ? (
          <button
            className="avatar top-avatar"
            onClick={() => navigate('/profile')}
            aria-label={t('shell.openProfile')}
          >
            <AvatarContent person={user} />
          </button>
        ) : (
          <BackButton />
        )}
        <div className="topbar-copy">
          <span className="eyebrow">{t('common.appName')}</span>
          <h1>{title}</h1>
        </div>
        <div className="topbar-meta">
          <button
            className="icon-button notification-button"
            onClick={() => navigate('/notifications')}
            aria-label={bellLabel}
          >
            <Bell size={20} />
            {unread > 0 && (
              <span className="badge" aria-hidden="true">
                {badgeText}
              </span>
            )}
          </button>
        </div>
      </header>

      <header className="web-header">
        <div className="web-header-inner">
          <NavLink to="/home" className="brand" aria-label={t('common.appName')}>
            <BrandMark tile size={32} className="brand-mark" />
            <span className="brand-name">{t('common.appName')}</span>
          </NavLink>

          <nav className="web-nav" aria-label={t('nav.primary')}>
            {headerTabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => (isActive ? 'web-nav-item active' : 'web-nav-item')}
                title={t(label)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{t(label)}</span>
              </NavLink>
            ))}
          </nav>

          <div className="web-actions">
            <button
              className="web-search"
              onClick={() => navigate('/search')}
              aria-label={t('search.label')}
              title={t('search.label')}
            >
              <Search size={18} aria-hidden="true" />
              <span>{t('titles.search')}</span>
            </button>
            <button
              className="web-create"
              onClick={() => navigate('/create')}
              aria-label={t('shell.createActivity')}
              title={t('shell.createActivity')}
              disabled={user.suspended}
            >
              <Plus size={18} aria-hidden="true" />
              <span>{t('nav.create')}</span>
            </button>
            <button
              className="icon-button notification-button"
              onClick={() => navigate('/notifications')}
              aria-label={bellLabel}
              title={bellLabel}
            >
              <Bell size={20} />
              {unread > 0 && (
                <span className="badge" aria-hidden="true">
                  {badgeText}
                </span>
              )}
            </button>
            {/* The desk, for the admin: the console is its own room, and
                this is its door from the app. */}
            {user.isAdmin && (
              <button
                className="icon-button web-console"
                onClick={() => navigate('/admin')}
                aria-label={t('shell.console')}
                title={t('shell.console')}
              >
                <ShieldAlert size={19} />
              </button>
            )}
            {/* The same control as the Settings row, and the same stored
                choice: here so the one person who cannot read the page
                finds it without first finding Settings. The stylesheet
                shows the language's name where there is room and the icon
                alone where there is not; the picker itself is unchanged. */}
            <div className="web-language">
              <LanguageMenu compact />
            </div>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                isActive ? 'avatar web-avatar active' : 'avatar web-avatar'
              }
              aria-label={t('nav.profile')}
              title={t('nav.profile')}
            >
              <AvatarContent person={user} />
            </NavLink>
          </div>
        </div>
      </header>

      {/* Offline is a normal state here, not an error: Firestore serves
          reads from cache and queues writes. Saying so is the difference
          between "this app still works" and "did my join actually save?" */}
      {/* A suspended account can still read, so it must be told why the
          rest has stopped working. Silently disabled controls read as a
          broken app rather than a decision somebody made. */}
      {/* One row of the shell whatever is in it, so a banner arriving never
          shifts the scroller into a different track. */}
      <div className="shell-banners">
        <PushInvite />
        {user.suspended && (
          <div className="suspended-banner" role="alert">
            <ShieldAlert size={15} />
            <span>{t('shell.suspended')}</span>
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
              {serverSilent && !browserOffline ? t('shell.serverSilent') : t('shell.offline')}
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
            <span>{t('shell.dataError')}</span>
            <button className="text-button" onClick={() => window.location.reload()}>
              {t('common.retry')}
            </button>
          </div>
        )}
      </div>

      <CelebrationToast />

      {/* Sits outside the scroller and above everything, so a burst thrown
          from the middle of the screen is never clipped by the card that
          caused it. Keyed on the celebration id, which changes once per
          event — that is what makes it fire exactly once. */}
      {celebration?.burst && (
        <div className="burst-layer" data-category={celebration.burst}>
          <JoinBurst token={celebration.id} color="var(--cat, var(--accent))" />
        </div>
      )}

      <main className="page-scroll" ref={scrollRef} data-view={view} tabIndex={-1}>
        {/* On a wide screen the phone bar is gone, and with it the way back.
            A sub-page gets it here instead, at the head of its own column. */}
        {!atRootTab && (
          <div className="page-bar">
            <BackButton />
          </div>
        )}
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
          aria-label={t('shell.createActivity')}
          // The rules refuse it anyway; disabling here means the answer is
          // immediate and explained rather than a rejection after the fact.
          disabled={user.suspended}
        >
          <Plus size={26} />
        </button>
      )}

      <nav className="bottom-nav" aria-label={t('nav.primary')}>
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <span className="nav-icon-wrap">
              <Icon size={21} />
            </span>
            <span>{t(label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
