import { useEffect, useRef, useState } from 'react'

/**
 * Where the counter should be, part-way through.
 *
 * Pure so it can be tested without a DOM: it is the arithmetic, not the
 * animation, that decides what number a user reads.
 */
export function countUpValue(target, elapsed, duration) {
  const safe = Number.isFinite(target) ? target : 0
  if (!Number.isFinite(elapsed) || !Number.isFinite(duration) || duration <= 0) return safe
  const t = Math.min(1, Math.max(0, elapsed / duration))
  // easeOutCubic — the last few numbers land slowly, the way a mechanical
  // counter settles.
  return Math.round(safe * (1 - Math.pow(1 - t, 3)))
}

/**
 * Whether to animate at all, or just show the number.
 *
 * Animating is the *optional* half. A page that is hidden gets no animation
 * frames, so a counter that insists on animating shows the 0 it starts from
 * and never moves — which is not a missing flourish but a wrong number. This
 * is the fix for Discover's top pick reading "0%" when its real score was 58.
 */
export function shouldAnimate({ reducedMotion, pageHidden }) {
  return !reducedMotion && !pageHidden
}

/**
 * Counts a number up to its value once, on arrival.
 *
 * A match score is the app's one piece of arithmetic the user is meant to care
 * about, and printing it fully formed says nothing about where it came from.
 * Watching it climb says a calculation happened — which is true, and is the
 * sort of half-second that makes software feel considered rather than
 * assembled. It is still only decoration, so every path that cannot animate
 * ends on the real number rather than on zero.
 */
export function useCountUp(target, duration = 900) {
  const safe = Number.isFinite(target) ? target : 0
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const pageHidden = typeof document !== 'undefined' && document.hidden
  const animate = shouldAnimate({ reducedMotion, pageHidden })

  const [shown, setShown] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    // Nothing is set on this path — the final value is returned directly
    // below, and setting it here would be a render triggering a render.
    if (!animate) return undefined

    let start = null
    const step = (now) => {
      if (start === null) start = now
      setShown(countUpValue(safe, now - start, duration))
      if (now - start < duration) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)

    // If the frames stop arriving part-way — the tab is backgrounded
    // mid-count, or the browser throttles them — land on the real number
    // rather than wherever the animation got to. Timers are throttled in the
    // background too, but unlike rAF they still fire.
    const settle = setTimeout(() => setShown(safe), duration + 400)

    return () => {
      cancelAnimationFrame(frame.current)
      clearTimeout(settle)
    }
  }, [safe, duration, animate])

  return animate ? shown : safe
}
