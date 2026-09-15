import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Shown when a signed-in user's profile cannot be loaded or created.
 *
 * Without this the app sits on "Loading your profile…" indefinitely: the
 * error was captured in state and never rendered, so there was no message,
 * no retry, and — worst of it — no way to sign out and try another account.
 * A dead end with no exit is a worse failure than the original error.
 */
export default function ProfileErrorScreen({ error, onRetry, onSignOut }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const retry = async () => {
    setBusy(true)
    try {
      await onRetry()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="standalone-page boot-screen">
      <div className="brand-orb warning-orb">
        <AlertTriangle size={30} />
      </div>
      <div className="entry-copy">
        <h1>{t('errors.profileTitle')}</h1>
        <p>{t('errors.profileBody')}</p>
      </div>
      {/* The raw code is shown deliberately: it is the one thing that makes a
          support conversation about this possible. */}
      {error?.code && <p className="form-notice">{t('errors.errorCode', { code: error.code })}</p>}
      <button className="primary-button wide" onClick={retry} disabled={busy}>
        {busy ? t('common.tryingAgain') : t('common.tryAgain')}
      </button>
      <button className="text-button" onClick={onSignOut}>
        {t('common.signOut')}
      </button>
    </div>
  )
}
