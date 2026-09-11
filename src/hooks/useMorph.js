import { useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'

/** The one name a morphing pair shares. Only ever on two elements at a time. */
export const MORPH = 'activity-morph'

/**
 * Navigation that carries the thing you tapped with you.
 *
 * The coloured header of a card and the coloured hero of an activity page are
 * the same object seen at two sizes, so the browser is told to treat them as
 * one: it grabs both, works out the difference, and grows one into the other.
 * The screen stops being replaced and starts being travelled through — which
 * is the difference between a website and something that feels built.
 *
 * Three ways it declines, all silent:
 *
 * - No View Transitions in this browser. Older Safari, mostly. Plain
 *   navigation, exactly as before.
 * - Somebody has asked their phone for less motion. Then this is precisely
 *   the sort of thing they were asking to be spared.
 * - The transition is interrupted by another navigation. The promise rejects;
 *   the name is cleared either way, because a stale view-transition-name left
 *   on an element breaks the *next* transition — two elements sharing a name
 *   is an error, and it would be a confusing one to debug later.
 */
export function useMorph() {
  const navigate = useNavigate()
  // A transition takes about half a second, and a card is a big target. Two
  // taps inside that window used to push two history entries, so Back had to
  // be pressed twice to get out of a screen the user only meant to open once.
  const busy = useRef(false)

  return useCallback(
    (to, sourceEl) => {
      if (busy.current) return
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (typeof document.startViewTransition !== 'function' || reduced) {
        navigate(to)
        return
      }

      const el = sourceEl
      if (el) el.style.viewTransitionName = MORPH
      busy.current = true

      // flushSync so the route has actually re-rendered before the browser
      // takes its "after" snapshot. Without it React batches the update past
      // the end of the callback and the browser photographs the old screen
      // twice, producing a cross-fade from a page to itself.
      const transition = document.startViewTransition(() => {
        flushSync(() => navigate(to))
      })

      const clear = () => {
        if (el) el.style.viewTransitionName = ''
        busy.current = false
      }
      // Both arms, because an interrupted transition rejects — and a rejected
      // promise with no handler is an unhandled rejection in the console as
      // well as a lock that never releases.
      transition.finished.then(clear, clear)
    },
    [navigate],
  )
}
