import React from 'react'

/**
 * Placeholder shown while the first activities snapshot is still in flight.
 *
 * Without it the screens fell through to the "no activities match your
 * filters" empty state, which told a user on a cold start that their filters
 * were the problem and offered a Clear filters button that could not help.
 * Saying nothing is better than saying something untrue.
 */
export default function ActivitiesLoading({ rows = 3 }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading activities…</span>
      {Array.from({ length: rows }, (_, i) => (
        // Shaped like the card that is coming: a block where the coloured
        // header will be, then the lines beneath it. A placeholder that does
        // not match what replaces it produces a jump at the very moment the
        // content arrives, which is the moment it is most noticeable.
        <div className="card-skeleton" key={i} aria-hidden="true">
          <span className="skeleton-head" />
          <span className="skeleton-line" />
          <span className="skeleton-line short" />
          {/* The card that replaces this one ends with faces and a count, so
              the placeholder does too — otherwise the foot row appears from
              nowhere and nudges everything below it at the exact moment the
              content lands. */}
          <span className="skeleton-foot">
            <span className="skeleton-face" />
            <span className="skeleton-face" />
            <span className="skeleton-face" />
            <span className="skeleton-line tiny" />
          </span>
        </div>
      ))}
    </div>
  )
}
