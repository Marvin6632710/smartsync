import React, { useEffect, useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { watchNotifications } from '../firebase/notifications'
import { localizeNotification } from '../i18n/notificationText'

/**
 * What a closed account sees, in place of the app.
 *
 * It says why. Being told an account is closed without being told what for is
 * the thing that makes people certain they were treated arbitrarily, whether
 * or not they were — and the decision is easier to defend when it is stated
 * plainly than when it is hidden behind a blank screen.
 *
 * The reason is read from the notification the closure wrote, which is the one
 * collection a closed account can still read: their own. Everything else — the
 * activities, other people's profiles, the chats — is refused by the rules, so
 * there is no version of this screen that could show more than it does.
 */
export default function ClosedAccountScreen() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  // The notification itself is kept, and worded at render, so a change of
  // language re-words it too.
  const [closure, setClosure] = useState(null)

  useEffect(() => {
    if (!user?.uid) return undefined
    return watchNotifications(
      user.uid,
      (rows) => {
        const latest = rows.find((n) => n.type === 'moderation' && /closed/i.test(n.title || ''))
        setClosure(latest || null)
      },
      () => setClosure(null),
    )
  }, [user?.uid])
  const reason = closure ? localizeNotification(closure).body : null

  return (
    <div className="page-content boot-screen">
      <div className="empty-state">
        <ShieldOff size={30} />
        <h3>{t('closed.title')}</h3>
        <p>{reason || t('closed.body')}</p>
        <p className="helper-text">{t('closed.why')}</p>
        <div className="button-row">
          <button className="primary-button" onClick={() => navigate('/appeals')}>
            {t('appeals.appeal')}
          </button>
          <button className="secondary-button" onClick={signOut}>
            {t('common.signOut')}
          </button>
        </div>
      </div>
    </div>
  )
}
