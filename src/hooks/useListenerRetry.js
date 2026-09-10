import { useCallback, useState } from 'react'
import { currentUid, refreshCredential } from '../firebase/auth'

// How many times a transient denial buys a re-subscribe. Two, because one was
// not enough: a fresh sign-up that follows a sign-out in the same page was
// still refused on the second attempt, and landed on the error screen.
const MAX_RETRIES = 2

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
 * So: errors from a session that has ended are dropped, and a
 * permission-denied under a live session buys a fresh credential and a
 * re-subscribe, twice. Anything after that is passed through to the caller —
 * a rule that genuinely refuses this user must surface, not be retried
 * forever in silence.
 *
 * Usage: spread `attempt` into the effect's dependency array so bumping it
 * re-subscribes, and wrap each error callback in `guard`.
 */
export function useListenerRetry(uid) {
  const [attempt, setAttempt] = useState(0)

  const guard = useCallback(
    (onError) => (error) => {
      if (currentUid() !== uid) return
      if (error?.code === 'permission-denied' && attempt < MAX_RETRIES) {
        // Ask for a new token first, then re-subscribe. Every listener in the
        // group reports the same denial at the same moment and each lands
        // here, so this is written to be idempotent: they all set the same
        // attempt number, and React collapses that to one re-render.
        refreshCredential().then(() => setAttempt(attempt + 1))
        return
      }
      onError?.(error)
    },
    [uid, attempt],
  )

  return { attempt, guard, resetAttempts: useCallback(() => setAttempt(0), []) }
}
