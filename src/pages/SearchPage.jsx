import React, { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import ActivityCard from '../components/ActivityCard'
import BackButton from '../components/BackButton'
import FiltersEmptyState from '../components/FiltersEmptyState'
import { useApp } from '../context/AppContext'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const { filteredActivities } = useApp()
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return filteredActivities
    return filteredActivities.filter((a) =>
      [a.title, a.category, a.locationName, a.description].some((field) =>
        (field || '').toLowerCase().includes(q),
      ),
    )
  }, [query, filteredActivities])

  return (
    <div className="page-content">
      <BackButton />
      <section className="headline-block">
        <h2>Search</h2>
        <p className="helper-text">Find activities fast.</p>
      </section>
      <div className="search-box">
        <Search size={18} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search activity or place"
        />
      </div>
      <div className="stack list-stack">
        {results.map((a) => (
          <ActivityCard key={a.id} activity={a} compact />
        ))}

        {/* Two different dead ends, and conflating them is misleading: the
            filters can hide everything before the query is even considered. */}
        {filteredActivities.length === 0 ? (
          <FiltersEmptyState body="Your filters are hiding every activity, so there is nothing to search." />
        ) : (
          results.length === 0 && (
            <div className="empty-state">
              <Search size={30} />
              <h3>No results</h3>
              <p>Nothing matches “{query.trim()}”. Try another word.</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
