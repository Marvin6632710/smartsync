import React from 'react'
import { AlertTriangle, ArrowLeftCircle, WifiOff } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import BrandMark from '../components/BrandMark'
import CelebrationToast from '../components/CelebrationToast'
import LanguageMenu from '../components/LanguageMenu'
import RouteErrorBoundary from '../components/RouteErrorBoundary'
import ThemeChoice from '../components/ThemeChoice'
import { useConsole } from './ConsoleContext'
import DeskDialogs from './DeskDialogs'
import './console.css'

/**
 * The console's frame: a sidebar of sections on the left, a strip with the
 * page's name and the tools on top, the page itself in the rest.
 * Desktop-first — this is a desk, not a phone — with a usable fallback
 * under 900px where the sidebar becomes a row of tabs and the details
 * panel slides over the list.
 *
 * Drawn from the app's tokens so it is the same product, and in a teal of
 * its own so it is unmistakably a different room.
 */
export default function ConsoleLayout({ nav, title }) {
  const { t } = useTranslation()
  const location = useLocation()
  const { user, app, referenceError, errors, openReports, statusOf } = useConsole()

  const current =
    [...nav].reverse().find((item) => {
      const path = item.to
      return item.end ? location.pathname === path : location.pathname.startsWith(path)
    }) || nav[0]

  // The two figures worth having in the sidebar at all times.
  const open = openReports.length
  const mine = openReports.filter((r) => statusOf(r) === 'mine').length

  return (
    <div className="console" data-console="admin">
      <aside className="console-side">
        <div className="console-brand">
          <BrandMark tile size={30} />
          <div>
            <strong>{t('common.appName')}</strong>
            <span>{title}</span>
          </div>
        </div>
        <nav className="console-nav" aria-label={title}>
          {nav.map(({ to, end, label, icon: Icon, count }) => {
            const badge = count === 'open' ? open : count === 'mine' ? mine : null
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  isActive ? 'console-nav-item active' : 'console-nav-item'
                }
              >
                <Icon size={17} aria-hidden="true" />
                <span>{t(label)}</span>
                {badge > 0 && <span className="console-nav-count">{badge}</span>}
              </NavLink>
            )
          })}
        </nav>
        <div className="console-side-foot">
          <NavLink to="/home" className="console-nav-item">
            <ArrowLeftCircle size={17} aria-hidden="true" />
            <span>{t('console.backToApp')}</span>
          </NavLink>
        </div>
      </aside>

      <div className="console-main">
        <header className="console-top">
          <div className="console-top-titles">
            <span className="con-eyebrow">{title}</span>
            <h1>{t(current.label)}</h1>
          </div>
          <div className="console-top-tools">
            <LanguageMenu compact />
            <ThemeChoice />
            <span className="console-user" title={user.email}>
              <span className="avatar console-avatar" aria-hidden="true">
                {user.avatar}
              </span>
              <span className="console-user-copy">
                <strong>{user.name}</strong>
                <small>{t(`moderation.role.${user.role}`, { defaultValue: user.role })}</small>
              </span>
            </span>
          </div>
        </header>

        <div className="console-banners">
          {app.offline && (
            <div className="offline-banner" role="status">
              <WifiOff size={15} />
              <span>
                {app.serverSilent && !app.browserOffline
                  ? t('shell.serverSilent')
                  : t('shell.offline')}
              </span>
            </div>
          )}
          {referenceError && (
            <div className="data-error-banner" role="alert">
              <AlertTriangle size={15} />
              <span>{t('moderation.referenceError')}</span>
            </div>
          )}
          {(errors.open || errors.resolved || errors.log) && (
            <div className="data-error-banner" role="alert">
              <AlertTriangle size={15} />
              <span>
                {t('moderation.loadFailed')}{' '}
                {[errors.open, errors.resolved, errors.log].some(
                  (e) => e?.code === 'permission-denied',
                )
                  ? t('moderation.checkRole')
                  : ''}
              </span>
            </div>
          )}
        </div>

        <main className="console-body" data-page={current.key}>
          <RouteErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>

      <CelebrationToast />
      <DeskDialogs />
    </div>
  )
}
