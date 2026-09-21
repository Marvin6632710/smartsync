import React, { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ActivityCard from '../components/ActivityCard'
import ActivitiesLoading from '../components/ActivitiesLoading'
import { useApp } from '../context/AppContext'
import { filtersActive as narrowing } from '../utils/filters'

export default function SearchPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const { filteredActivities, loading, filters, resetFilters } = useApp()
  const searchTerm = query.trim().toLowerCase()

  // Keep the existing discovery filters, with a way to clear them when a
  // name search finds nothing. An empty query never becomes a discovery feed.
  const filtersActive = narrowing(filters)
  const results = useMemo(() => {
    if (!searchTerm) return []
    return filteredActivities.filter((a) => (a.title || '').toLowerCase().includes(searchTerm))
  }, [searchTerm, filteredActivities])

  return (
    <div className="page-content">
      <section className="headline-block">
        <h2>{t('search.title')}</h2>
        <p className="helper-text">{t('search.lead')}</p>
      </section>
      <div className="search-box">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
        />
      </div>
      <div className="stack list-stack card-grid">
        {!searchTerm ? (
          <div className="empty-state" role="status">
            <Search size={30} aria-hidden="true" />
            <p>{t('search.emptyPrompt')}</p>
          </div>
        ) : (
          <>
            {results.map((a) => (
              <ActivityCard key={a.id} activity={a} compact />
            ))}
            {loading ? (
              <ActivitiesLoading rows={2} />
            ) : (
              results.length === 0 && (
                <div className="empty-state" role="status">
                  <Search size={30} aria-hidden="true" />
                  <h3>{t('search.noResults')}</h3>
                  <p>{t('search.noMatch')}</p>
                  {filtersActive && (
                    <button className="secondary-button" onClick={resetFilters}>
                      {t('search.clearAndSearch')}
                    </button>
                  )}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}
