import React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useApp } from '../context/AppContext'

/**
 * Shown wherever discovery filters have hidden everything. Always offers a
 * one-tap way out — without it the app looks broken rather than filtered,
 * and the filter page is several taps away.
 */
export default function FiltersEmptyState({
  body = 'Try widening the distance, or clear the filters to see everything nearby.',
}) {
  const { resetFilters } = useApp()

  return (
    <div className="empty-state">
      <SlidersHorizontal size={26} />
      <h3>No activities match your filters</h3>
      <p>{body}</p>
      <button className="secondary-button" onClick={resetFilters}>
        Clear filters
      </button>
    </div>
  )
}
