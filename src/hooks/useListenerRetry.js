import { useCallback, useState } from 'react'
import { currentUid } from '../firebase/auth'

/**
 * Guards a Firestore listener's error callback against the noise of switching
 * accounts.
 *
 * Two failures look identical to `onSnapshot` and mean opposite things.
 *
 * When somebody signs out, the credential is revoked before React runs any
 * cleanup, so every open listener reports permission-denied on behalf of a
 * session that no longer exists. Those errors belong to whoever just left and
 * must not be shown to whoever arrives next — which is what used to happen:
 * signing out and back in as a different account landed on "Can't load your
 * profile", or a "Couldn't load the latest data" banner over stale cached
 * rows, and stayed there until the page was reloaded.
 *
 * Then the incoming session's own listeners are refused once as well, because
 * the watch stream reattaches carrying the token Firestore has just rejected.
 * Nothing is wrong with those listeners; they simply need to be made again.
 *
 * So: errors from a session that has ended are dropped, the first
 * permission-denied under a live session buys exactly one re-subscribe, and
 * anything after that is passed through to the caller — a rule that genuinely
 * refuses this user must surface, not be retried forever in silence.
 *
 * Usage: spread `attempt` into the effect's dependency array so bumping it
 * re-subscribes, and wrap each error callback in `guard`.
 */
export function useListenerRetry(uid) {
  const [attempt, setAttempt] = useState(0)

  const guard = useCallback(
    (onError) => (error) => {
      if (currentUid() !== uid) return
      if (error?.code === 'permission-denied' && attempt < 1) {
        window.setTimeout(() => setAttempt(1), 400)
        return
      }
      onError?.(error)
    },
    [uid, attempt],
  )

  return { attempt, guard, resetAttempts: useCallback(() => setAttempt(0), []) }
}
