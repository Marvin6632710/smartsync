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
        <div className="card-skeleton" key={i} aria-hidden="true">
          <span className="skeleton-line wide" />
          <span className="skeleton-line" />
          <span className="skeleton-line short" />
        </div>
      ))}
    </div>
  )
}
