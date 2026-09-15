import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useApp } from '../context/AppContext'
import { awaitWrite, QUEUED } from '../utils/writes'

/**
 * Wraps a profile write so a failure is visible.
 *
 * Settings screens write straight to `firebase/users` rather than going
 * through a context action, because a preference toggle is a pass-through
 * with nothing to orchestrate. The cost of that shortcut was no error
 * handling: `setAnonymousMode` was fire-and-forget, so a refused or dropped
 * write left the switch flipped on screen and the change never made — the
 * worst kind of failure, because it looks like success.
 *
 * Returns `saving` too, so a control can be disabled while a write is in
 * flight instead of being double-tapped.
 *
 * Offline, the write is applied locally and queued, and this resolves
 * without waiting for a server that is not there — the switch is already
 * showing the new state, and "Saving…" until the connection came back
 * helped nobody. A refusal that arrives later is still shown.
 */
export function useSaveProfile() {
  const { t } = useTranslation()
  const { pushCelebration, offline } = useApp()
  const [saving, setSaving] = useState(false)

  const save = async (action, { failure = t('toasts.saveFailed') } = {}) => {
    setSaving(true)
    const fail = (error) =>
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: failure,
        body:
          error?.code === 'permission-denied'
            ? t('common.noPermission')
            : t('common.checkConnection'),
      })
    try {
      const outcome = await awaitWrite(action(), { offline, onLater: fail })
      if (outcome === QUEUED) {
        pushCelebration({
          icon: 'check',
          title: t('toasts.savedWillSync'),
          body: t('toasts.finishWhenOnline'),
        })
      }
      return true
    } catch (error) {
      fail(error)
      return false
    } finally {
      setSaving(false)
    }
  }

  return { save, saving }
}
