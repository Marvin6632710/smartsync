import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from './ConfirmDialog'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

/**
 * A way out of setup.
 *
 * Onboarding is deliberately not skippable — matching has nothing to work
 * with until interests exist — but "not skippable" turned into "no way out at
 * all": every route redirects back to /interests until setup finishes, and
 * neither setup screen offered a sign-out. Somebody who created an account by
 * mistake, or on a friend's phone, could only escape by clearing site data.
 */
export default function SignOutLink({ label }) {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const { pushCelebration } = useApp()
  const [asking, setAsking] = useState(false)

  return (
    <>
      <button className="text-button wide-centre" onClick={() => setAsking(true)}>
        {label || t('auth.signOutDialog.notYou')}
      </button>
      <ConfirmDialog
        open={asking}
        title={t('auth.signOutDialog.title')}
        body={t('auth.signOutDialog.setupBody')}
        confirmLabel={t('auth.signOutDialog.confirm')}
        cancelLabel={t('auth.signOutDialog.stay')}
        tone="danger"
        onConfirm={() => {
          setAsking(false)
          signOut().catch(() =>
            pushCelebration({
              icon: 'alert',
              tone: 'warning',
              title: t('auth.signOutDialog.failed'),
              body: t('common.pleaseTryAgain'),
            }),
          )
        }}
        onCancel={() => setAsking(false)}
      />
    </>
  )
}
