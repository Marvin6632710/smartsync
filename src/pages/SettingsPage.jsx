import React, { useState } from 'react'
import {
  Bell,
  ChevronRight,
  Languages,
  LogOut,
  MessageSquareWarning,
  ScrollText,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  SunMoon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from '../components/ConfirmDialog'
import LanguageMenu from '../components/LanguageMenu'
import ThemeChoice from '../components/ThemeChoice'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useMyWarnings } from '../hooks/useMyWarnings'

export default function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { pushCelebration } = useApp()
  const [signOutOpen, setSignOutOpen] = useState(false)
  // The record itself, so the card can say how much is on it. A warning
  // never lapses — the rules refuse every edit and delete — so every one on
  // the record is active. Until the first answer, and if the read failed,
  // the card says that and nothing more: "no active warnings" is a claim,
  // and it is made only when true.
  const { warnings, loading, error } = useMyWarnings(user.uid)
  const active = loading || error ? 0 : warnings.length
  const warningsBody = (() => {
    if (loading) return t('settings.warningsChecking')
    if (error) return t('warnings.loadFailed')
    if (active === 0) return t('settings.warningsNone')
    return t('settings.warningsActive', { count: active })
  })()
  // One card, in one of two places: the moment there is something on the
  // record it is the first thing on the page, and the whole card takes the
  // warning tone; with nothing on it, it waits under the preferences in a
  // quiet state, so a clean record is not an alert.
  const warningsCard = (
    <div className={`settings-card warnings-card${active > 0 ? ' has-warnings' : ''}`}>
      <button
        className="setting-row warnings-row"
        onClick={() => navigate('/warnings')}
        aria-describedby="warnings-body"
      >
        <span className="warnings-icon" aria-hidden="true">
          <MessageSquareWarning size={18} />
        </span>
        <span className="warnings-text">
          <strong>
            {t('settings.warnings')}
            {active > 0 && (
              <span className="warnings-count">
                {t('settings.warningsBadge', { count: active })}
              </span>
            )}
          </strong>
          <small id="warnings-body">{warningsBody}</small>
          <span className="warnings-link">
            {t('settings.viewWarnings')} <ChevronRight size={15} aria-hidden="true" />
          </span>
        </span>
      </button>
    </div>
  )

  // A sign-out that fails leaves the person signed in; that used to be an
  // unhandled rejection and a screen that did not change.
  const leave = () =>
    signOut().catch(() =>
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: t('auth.signOutDialog.failed'),
        body: t('common.pleaseTryAgain'),
      }),
    )

  return (
    <div className="page-content">
      <h2>{t('settings.title')}</h2>

      {active > 0 && warningsCard}

      <div className="settings-card">
        {/* The language first: it is the one row somebody who cannot read
            the rest is looking for. */}
        <div className="setting-row language-row">
          <Languages size={18} />
          <span>
            <strong>{t('settings.language')}</strong>
            <small>{t('language.hint')}</small>
          </span>
          <LanguageMenu />
        </div>
        <div className="setting-row theme-row">
          <SunMoon size={18} />
          <span>
            <strong>{t('settings.theme')}</strong>
            <small>{t('theme.hint')}</small>
          </span>
          <ThemeChoice />
        </div>
        <button className="setting-row" onClick={() => navigate('/privacy')}>
          <ShieldCheck size={18} />
          <span>
            <strong>{t('settings.privacy')}</strong>
            <small>{t('settings.privacyHint')}</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="setting-row" onClick={() => navigate('/filters')}>
          <SlidersHorizontal size={18} />
          <span>
            <strong>{t('settings.discovery')}</strong>
            <small>{t('settings.discoveryHint')}</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="setting-row" onClick={() => navigate('/blocked')}>
          <ShieldOff size={18} />
          <span>
            <strong>{t('settings.blocked')}</strong>
            <small>{t('settings.blockedHint')}</small>
          </span>
          <ChevronRight size={17} />
        </button>
        {/* The inbox switch, browser notifications and the devices they
            reach live on their own page: three things, not a toggle. */}
        <button className="setting-row" onClick={() => navigate('/settings/notifications')}>
          <Bell size={18} />
          <span>
            <strong>{t('settings.notifications')}</strong>
            <small>{t('settings.notificationsHint')}</small>
          </span>
          <ChevronRight size={17} />
        </button>
        {/* What was agreed to at the door, for reading again afterwards. */}
        <button className="setting-row" onClick={() => navigate('/terms')}>
          <ScrollText size={18} />
          <span>
            <strong>{t('settings.terms')}</strong>
            <small>{t('settings.termsHint')}</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </div>

      {active === 0 && warningsCard}

      {/* The desk: the admin console is its own room, and this is its
          door from Settings. */}
      {user.isAdmin && (
        <div className="settings-card">
          <button className="setting-row" onClick={() => navigate('/admin')}>
            <ShieldCheck size={18} />
            <span>
              <strong>{t('settings.adminConsole')}</strong>
              <small>{t('settings.adminConsoleHint')}</small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
      )}

      <div className="panel">
        <h3>{t('settings.account')}</h3>
        <p className="helper-text">{t('settings.signedInAs', { email: user.email })}</p>
        <button className="danger-button wide" onClick={() => setSignOutOpen(true)}>
          <LogOut size={17} /> {t('settings.signOut')}
        </button>
      </div>

      <ConfirmDialog
        open={signOutOpen}
        title={t('auth.signOutDialog.title')}
        body={t('auth.signOutDialog.settingsBody')}
        confirmLabel={t('auth.signOutDialog.confirm')}
        cancelLabel={t('auth.signOutDialog.staySignedIn')}
        tone="danger"
        onConfirm={() => {
          setSignOutOpen(false)
          leave()
        }}
        onCancel={() => setSignOutOpen(false)}
      />
    </div>
  )
}
