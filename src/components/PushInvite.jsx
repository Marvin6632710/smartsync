import React, { useState } from 'react'
import { BellRing } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { registerPushDevice, rememberDeclined, requestPermission } from '../firebase/push'
import { reportError } from '../utils/reportError'

/**
 * The one time the app asks for notifications: after a join, once, with a
 * reason. A browser prompt on page load is the fastest way to be refused
 * for good; a question that names the activity just joined is one people
 * say yes to. "Not now" is remembered for a month.
 */
export default function PushInvite() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { pushInvite, dismissPushInvite, pushCelebration } = useApp()
  const [busy, setBusy] = useState(false)
  if (!pushInvite || !user) return null

  const decline = () => {
    rememberDeclined()
    dismissPushInvite()
  }

  const accept = async () => {
    setBusy(true)
    try {
      const result = await requestPermission()
      if (result !== 'granted') {
        dismissPushInvite()
        if (result === 'denied') {
          pushCelebration({
            icon: 'bell-off',
            tone: 'warning',
            title: t('pushSettings.deniedTitle'),
            body: t('pushSettings.deniedBody'),
          })
        }
        return
      }
      await registerPushDevice(user.uid, { language: i18n.language })
      dismissPushInvite()
      pushCelebration({
        icon: 'bell',
        tone: 'success',
        title: t('pushSettings.enabledTitle'),
        body: t('pushSettings.enabledBody'),
      })
    } catch (error) {
      reportError('push.invite', error, { uid: user.uid })
      dismissPushInvite()
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: t('pushSettings.failedTitle'),
        body: t('common.pleaseTryAgain'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="push-invite" role="status">
      <BellRing size={16} />
      <span className="push-invite-text">
        <strong>{t('pushSettings.inviteTitle', { title: pushInvite.title })}</strong>
        <small>{t('pushSettings.inviteBody')}</small>
      </span>
      <span className="push-invite-actions">
        <button className="text-button" onClick={decline} disabled={busy}>
          {t('pushSettings.inviteLater')}
        </button>
        <button className="primary-button small" onClick={accept} disabled={busy}>
          {t('pushSettings.inviteAccept')}
        </button>
      </span>
    </div>
  )
}
