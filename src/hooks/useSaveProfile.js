import { useState } from 'react'

import { useApp } from '../context/AppContext'

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
 */
export function useSaveProfile() {
  const { pushCelebration } = useApp()
  const [saving, setSaving] = useState(false)

  const save = async (action, { failure = "Couldn't save that" } = {}) => {
    setSaving(true)
    try {
      await action()
      return true
    } catch (error) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: failure,
        body:
          error?.code === 'permission-denied'
            ? 'You do not have permission.'
            : 'Check your connection and try again.',
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  return { save, saving }
}
