import { useEffect, useRef, useState } from 'react'

/**
 * Counts a number up to its value once, on arrival.
 *
 * A match score is the app's one piece of arithmetic that the user is meant to
 * care about, and printing it fully formed says nothing about where it came
 * from. Watching it climb says a calculation happened — which is true, and is
 * the sort of half-second that makes software feel considered rather than
 * assembled.
 *
 * Runs on rAF rather than a timer so it is tied to the frames the browser is
 * actually painting, and eases out so the last few numbers land slowly, the
 * way a mechanical counter settles. Anyone who has asked for less motion gets
 * the final number immediately.
 */
export function useCountUp(target, duration = 900) {
  const safe = Number.isFinite(target) ? target : 0
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    // No state is set on this path at all — the final value is returned
    // directly below. Setting it here instead would be a render triggering a
    // render for no reason, which is what the lint rule is there to catch.
    if (reduced) return undefined
    let start = null
    const step = (now) => {
      if (start === null) start = now
      const t = Math.min(1, (now - start) / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(safe * eased))
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [safe, duration, reduced])

  return reduced ? safe : shown
}
