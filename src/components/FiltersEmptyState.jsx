import React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'

/**
 * Shown wherever discovery filters have hidden everything. Always offers a
 * one-tap way out — without it the app looks broken rather than filtered,
 * and the filter page is several taps away.
 */
export default function FiltersEmptyState({ body }) {
  const { t } = useTranslation()
  const { resetFilters } = useApp()

  return (
    <div className="empty-state">
      <SlidersHorizontal size={26} />
      <h3>{t('filtersEmpty.title')}</h3>
      <p>{body || t('filtersEmpty.body')}</p>
      <button className="secondary-button" onClick={resetFilters}>
        {t('filtersEmpty.clear')}
      </button>
    </div>
  )
}
