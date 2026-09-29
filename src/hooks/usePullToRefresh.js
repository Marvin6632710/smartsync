import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pull down at the top of a list to load it again.
 *
 * The gesture every phone has taught its owner, and on a laptop the nearest
 * honest equivalent: scrolling up hard against a list that is already at its
 * top. Both end in the same call, so no screen has to care which one it was.
 *
 * Two things are deliberately not React state. The distance is written
 * straight onto the element as a custom property, because it changes every
 * frame of the gesture and re-rendering the shell sixty times a second to
 * move a spinner is how a smooth pull becomes a stuttering one. And the
 * phase is kept in a ref beside its state, because the event handlers are
 * registered once and would otherwise read whatever the phase was when they
 * were made.
 */

/** Damped finger travel, in pixels, that arms the refresh. */
export const PULL_THRESHOLD = 64
/** However hard it is pulled, the sheet stops here. */
const PULL_CEILING = 108
/** The sheet follows the finger at this fraction of its travel, so the pull
 *  has weight instead of sticking to the glass. */
const DAMPING = 0.52
/**
 * A wheel has no moment of release, so there the refresh fires as soon as
 * this much upward scrolling has piled up against the top. Higher than the
 * touch threshold on purpose: a mouse wheel arrives in ~100px steps and a
 * trackpad in a flood, and this should be three deliberate clicks or one
 * firm flick — not the tail of a scroll that merely ended up at the top.
 */
const WHEEL_BUDGET = 240
/** The pile is forgotten this long after the last wheel event, so scrolling
 *  up twice a minute apart never adds up to a refresh. */
const WHEEL_IDLE_MS = 350
/** The spinner stays at least this long: an answer from cache is instant,
 *  and a spinner that appears and vanishes reads as a glitch, not a reload. */
const MIN_SPIN_MS = 550
/** And no longer than this, whatever it was waiting for. A gesture that
 *  cannot end is worse than a refresh that did not finish. */
const MAX_SPIN_MS = 9000
/** How long the spring back to rest is given, matching the stylesheet. */
const EASE_MS = 300

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @param targetRef  the scroller to watch — the element with `overflow: auto`.
 * @param onRefresh  the work. May return a promise; the spinner waits for it.
 * @param enabled    false on screens where the gesture makes no sense.
 * @returns `phase`: 'idle', 'pull' under the finger, 'armed' once letting go
 *          would refresh, 'busy' while it does.
 */
export function usePullToRefresh({ targetRef, onRefresh, enabled = true }) {
  const [phase, setPhase] = useState('idle')
  const phaseRef = useRef('idle')
  // The live gesture: where the finger started, and whether it has committed
  // to being a pull rather than a scroll or a sideways swipe.
  const startRef = useRef(null)
  // What upward wheeling has piled up at the top, and when it last grew.
  const wheelRef = useRef({ piled: 0, at: 0 })
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  // Pending return to rest, so a new pull cancels the one before it.
  const easingRef = useRef(0)

  /**
   * Where the page sits, written onto the scroller for the stylesheet.
   *
   * `state` is 'yes' while a finger or wheel is driving it — no transition, so
   * the page tracks the gesture exactly — or 'easing' for the spring back,
   * which is the same transform with a transition on it. It becomes 'no' only
   * once that is over, because the stylesheet shifts the page with a
   * transform, and a transform that is *always* present — even
   * `translateY(0)` — makes every page a containing block, which would leave
   * each `position: fixed` dialog inside one fixed to the page instead of to
   * the window.
   */
  const paint = useCallback(
    (px, state = 'yes') => {
      const el = targetRef.current
      if (!el) return
      window.clearTimeout(easingRef.current)
      el.style.setProperty('--pull', `${px}px`)
      // How far along the gesture is, for the parts of the sheet that grow
      // rather than move: the spinner's turn and the label's opacity.
      el.style.setProperty('--pull-arm', String(Math.min(1, px / PULL_THRESHOLD)))
      el.dataset.pulling = state
    },
    [targetRef],
  )

  /**
   * Where to pin the sheet once it leaves the page and becomes a floating
   * pill. The scroller's own top: below the phone bar or the web header,
   * below a banner when one is up, and none of those is a constant that
   * could be written in the stylesheet instead. Measured when a refresh
   * starts and again if the window changes under it.
   */
  const pin = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    el.style.setProperty('--pull-pin', `${Math.round(el.getBoundingClientRect().top) + 12}px`)
  }, [targetRef])

  /** Let go: back to rest, with the transition, and no transform after that. */
  const release = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    // Nothing to spring back from, so nothing to animate either.
    if (!el.dataset.pulling || el.dataset.pulling === 'no') {
      paint(0, 'no')
      return
    }
    paint(0, 'easing')
    easingRef.current = window.setTimeout(() => {
      if (el.dataset.pulling === 'easing') el.dataset.pulling = 'no'
    }, EASE_MS)
  }, [paint, targetRef])

  const settle = useCallback((next) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const run = useCallback(async () => {
    if (phaseRef.current === 'busy') return
    pin()
    settle('busy')
    // The sheet eases to exactly the spinner's height and waits there. A
    // wheel refresh fires from a third of the way down, and snapping the rest
    // of the way looked like a glitch rather than a hand-off.
    paint(PULL_THRESHOLD, 'easing')
    wheelRef.current = { piled: 0, at: 0 }
    startRef.current = null
    try {
      await Promise.race([
        Promise.all([onRefreshRef.current?.(), sleep(MIN_SPIN_MS)]),
        sleep(MAX_SPIN_MS),
      ])
    } catch {
      // A refresh that failed says so in its own words — the banner the
      // listeners raise. The gesture's only job now is to end.
    }
    release()
    settle('idle')
  }, [paint, pin, release, settle])

  useEffect(() => {
    const el = targetRef.current
    if (!el || !enabled) return undefined

    const atTop = () => el.scrollTop <= 0
    // A dialog owns the screen while it is open. The list behind it is not
    // being read, let alone pulled.
    const covered = () => Boolean(document.querySelector('.dialog-backdrop'))

    const clear = () => {
      if (phaseRef.current === 'busy') return
      wheelRef.current.piled = 0
      release()
      settle('idle')
    }

    const onTouchStart = (event) => {
      if (phaseRef.current === 'busy' || covered()) return
      // Two fingers is a pinch, and anywhere but the top is a scroll.
      if (event.touches.length !== 1 || !atTop()) {
        startRef.current = null
        return
      }
      const touch = event.touches[0]
      startRef.current = { y: touch.clientY, x: touch.clientX, live: false }
    }

    const onTouchMove = (event) => {
      const start = startRef.current
      if (!start || phaseRef.current === 'busy') return
      const touch = event.touches[0]
      const dy = touch.clientY - start.y
      const dx = touch.clientX - start.x
      // Sideways first: a horizontal swipe belongs to something else — a
      // carousel, or the browser's own gesture back — and is not ours to take.
      if (!start.live && Math.abs(dx) > Math.abs(dy)) {
        startRef.current = null
        return
      }
      // Upwards, back into the list: the pull is over. Hand the scroller back
      // rather than holding the page still under a finger that wants to read.
      if (dy <= 0) {
        if (start.live) {
          start.live = false
          clear()
        }
        return
      }
      // Something scrolled the list away from the top between the finger
      // landing and now, and this was never a pull.
      if (!start.live && !atTop()) {
        startRef.current = null
        return
      }
      start.live = true
      // The scroller must not also scroll, or the list slides up behind the
      // sheet. Only possible because this listener is not passive.
      if (event.cancelable) event.preventDefault()
      const pulled = Math.min(PULL_CEILING, dy * DAMPING)
      paint(pulled)
      settle(pulled >= PULL_THRESHOLD ? 'armed' : 'pull')
    }

    const onTouchEnd = () => {
      const start = startRef.current
      startRef.current = null
      if (!start?.live || phaseRef.current === 'busy') return
      if (phaseRef.current === 'armed') {
        run()
        return
      }
      clear()
    }

    // A wheel gesture has no end, so it is forgotten instead: this fires
    // once the deltas stop arriving, and puts the sheet away.
    let forgetting = 0
    const forget = () => {
      window.clearTimeout(forgetting)
      forgetting = window.setTimeout(clear, WHEEL_IDLE_MS)
    }

    const onWheel = (event) => {
      if (phaseRef.current === 'busy' || covered()) return
      const pile = wheelRef.current
      const now = event.timeStamp || Date.now()
      // Anywhere but the top, or any downward turn, empties the pile. Only
      // scrolling up against a list already at its top counts towards this.
      if (!atTop() || event.deltaY >= 0) {
        pile.at = now
        if (pile.piled > 0) clear()
        return
      }
      if (now - pile.at > WHEEL_IDLE_MS) pile.piled = 0
      pile.at = now
      pile.piled += -event.deltaY
      if (pile.piled >= WHEEL_BUDGET) {
        window.clearTimeout(forgetting)
        run()
        return
      }
      // Shown against the same threshold the finger pulls to, so the sheet
      // arrives at the same place either way. It never reads 'armed' here:
      // there is nothing to release, and the budget firing is the release.
      paint(Math.min(PULL_THRESHOLD, (pile.piled / WHEEL_BUDGET) * PULL_THRESHOLD))
      settle('pull')
      forget()
    }

    // The pill is pinned to the window, so a window that changes shape under
    // it — a rotation, a resized browser — has to be measured again.
    const onResize = () => {
      if (phaseRef.current === 'busy') pin()
    }
    window.addEventListener('resize', onResize)

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.clearTimeout(forgetting)
      window.removeEventListener('resize', onResize)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
      startRef.current = null
      // Leaving a screen mid-pull must not leave the next one shifted down.
      paint(0, 'no')
    }
  }, [targetRef, enabled, paint, pin, release, settle, run])

  return { phase }
}
