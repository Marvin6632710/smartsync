import React, { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import ActivityCard from '../components/ActivityCard'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const { recommendations } = useApp()
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recommendations
    return recommendations.filter((a) => [a.title, a.category, a.location, a.description].some((field) => (field || '').toLowerCase().includes(q)))
  }, [query, recommendations])

  return (
    <div className="page-content light-page">
      <BackButton />
      <section className="headline-block">
        <h2>Search</h2>
        <p className="helper-text">Find activities fast.</p>
      </section>
      <div className="search-box soft-search"><Search size={18}/><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activity or place" /></div>
      <div className="stack list-stack">
        {results.map((a) => <ActivityCard key={a.id} activity={a} compact />)}
        {results.length === 0 && <div className="empty-state"><Search size={30}/><h3>No results</h3><p>Try another word.</p></div>}
      </div>
    </div>
  )
}
