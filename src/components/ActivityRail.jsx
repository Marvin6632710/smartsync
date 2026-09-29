import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import ActivityCard from './ActivityCard'

/**
 * A row of activities you scroll sideways — the shape every streaming app
 * has taught people to read.
 *
 * The point of the form is that a row is a *claim about its contents*: the
 * heading says why these belong together, and the eye takes the row in
 * without committing to any of it. A vertical list of everything says only
 * "here is everything", which is the one thing a browsing reader is not
 * asking for.
 *
 * The cards are the same `ActivityCard` the rest of the app uses. A rail-only
 * card would be a second component to keep in step with the first, and the
 * card already has the shape this needs: a coloured header that reads as
 * artwork, then the two facts you decide on.
 *
 * The arrows are for the mouse and nothing else — `aria-hidden`, out of the
 * tab order. Somebody moving by keyboard tabs through the cards themselves
 * and the browser scrolls each into view, so a pair of arrow buttons per rail
 * would be two more stops on the way to the same place.
 */

/** How much of the next card stays in view after a press, as a fraction. */
const PEEK = 0.15

export default function ActivityRail({ title, eyebrow, count, activities, action }) {
  const { t } = useTranslation()
  const headingId = useId()
  const trackRef = useRef(null)
  // Whether there is anything left to scroll to on each side. Both start
  // false so no arrow is drawn before the track has been measured.
  const [reach, setReach] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    // A pixel of slack: fractional widths mean scrollLeft rarely lands
    // exactly on its maximum, and an arrow that never goes away is worse
    // than one that never appears.
    setReach({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 })
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return undefined
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // Fires once on observe, which is what settles the initial state, and
    // again whenever the row is resized or its contents change.
    const resize = new ResizeObserver(measure)
    resize.observe(el)
    for (const child of el.children) resize.observe(child)
    return () => {
      el.removeEventListener('scroll', measure)
      resize.disconnect()
    }
  }, [measure, activities])

  const step = (direction) => {
    const el = trackRef.current
    if (!el) return
    // A screenful at a time, less a peek, so the card at the edge stays
    // half in view and the row reads as continuous rather than paged.
    el.scrollBy({ left: direction * el.clientWidth * (1 - PEEK), behavior: 'smooth' })
  }

  if (activities.length === 0) return null

  return (
    <section className="rail" aria-labelledby={headingId}>
      <div className="rail-head">
        <div className="rail-titles">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={headingId}>{title}</h2>
        </div>
        <div className="rail-head-end">
          {count != null && <span className="count-chip">{count}</span>}
          {action}
        </div>
      </div>
      <div
        className="rail-viewport"
        data-start={reach.start ? 'yes' : 'no'}
        data-end={reach.end ? 'yes' : 'no'}
      >
        <ul className="rail-track" ref={trackRef}>
          {activities.map((activity) => (
            <li key={activity.id}>
              <ActivityCard activity={activity} />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="rail-arrow"
          data-side="start"
          onClick={() => step(-1)}
          aria-hidden="true"
          tabIndex={-1}
          title={t('home.scrollBack')}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          className="rail-arrow"
          data-side="end"
          onClick={() => step(1)}
          aria-hidden="true"
          tabIndex={-1}
          title={t('home.scrollOn')}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  )
}
