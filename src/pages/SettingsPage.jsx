import React, { useState } from 'react'
import {
  Bell,
  ChevronRight,
  Languages,
  LogOut,
  MessageSquareWarning,
  ScrollText,
  ShieldAlert,
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

export default function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { pushCelebration } = useApp()
  const [signOutOpen, setSignOutOpen] = useState(false)

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
        {/* Always here, not only when there is something on it. A row that
            appears the moment you are warned tells you off twice. */}
        <button className="setting-row" onClick={() => navigate('/warnings')}>
          <MessageSquareWarning size={18} />
          <span>
            <strong>{t('settings.warnings')}</strong>
            <small>{t('settings.warningsHint')}</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="setting-row" onClick={() => navigate('/weights')}>
          <SlidersHorizontal size={18} />
          <span>
            <strong>{t('settings.weights')}</strong>
            <small>{t('settings.weightsHint')}</small>
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

      {user.isModerator && (
        <div className="settings-card">
          <button className="setting-row" onClick={() => navigate('/moderation')}>
            <ShieldAlert size={18} />
            <span>
              <strong>{t('settings.moderation')}</strong>
              <small>
                {user.isAdmin
                  ? t('settings.moderationHintAdmin')
                  : t('settings.moderationHintModerator')}
              </small>
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
