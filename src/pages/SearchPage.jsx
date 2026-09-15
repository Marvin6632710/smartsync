import React, { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ActivityCard from '../components/ActivityCard'
import FiltersEmptyState from '../components/FiltersEmptyState'
import ActivitiesLoading from '../components/ActivitiesLoading'
import { defaultFilters, useApp } from '../context/AppContext'

export default function SearchPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const { filteredActivities, recommendations, loading, filters, resetFilters } = useApp()

  // Search runs over what the filters allow, not over everything. If a filter
  // is narrowing the set, saying only "nothing matches that word" is
  // misleading — no word can find a coffee morning while the category is
  // pinned to Basketball, so "try another word" is advice that cannot work.
  const filtersActive = Object.keys(defaultFilters).some(
    (key) => filters[key] !== defaultFilters[key],
  )
  const hiddenByFilters = recommendations.length - filteredActivities.length
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
      <section className="headline-block">
        <h2>{t('search.title')}</h2>
        <p className="helper-text">{t('search.lead')}</p>
      </section>
      <div className="search-box">
        <Search size={18} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
        />
      </div>
      <div className="stack list-stack">
        {results.map((a) => (
          <ActivityCard key={a.id} activity={a} compact />
        ))}

        {/* Two different dead ends, and conflating them is misleading: the
            filters can hide everything before the query is even considered. */}
        {loading ? (
          <ActivitiesLoading rows={2} />
        ) : filteredActivities.length === 0 ? (
          <FiltersEmptyState body={t('filtersEmpty.searchBody')} />
        ) : (
          results.length === 0 && (
            <div className="empty-state">
              <Search size={30} />
              <h3>{t('search.noResults')}</h3>
              {filtersActive ? (
                <>
                  <p>
                    {t('search.noMatchFiltered', {
                      query: query.trim(),
                      count: filteredActivities.length,
                      noun: t('search.activity', { count: filteredActivities.length }),
                      hidden:
                        hiddenByFilters > 0
                          ? t('search.withHidden', { count: hiddenByFilters })
                          : '',
                    })}
                  </p>
                  <button className="secondary-button" onClick={resetFilters}>
                    {t('search.clearAndSearch')}
                  </button>
                </>
              ) : (
                <p>{t('search.noMatch', { query: query.trim() })}</p>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}
