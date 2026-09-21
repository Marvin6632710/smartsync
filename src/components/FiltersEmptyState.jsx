import React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'

/**
 * Shown wherever discovery filters have hidden everything. Always offers a
 * one-tap way out — without it the app looks broken rather than filtered —
 * and, beside it, the way to the filters themselves, which are otherwise
 * several taps away: with sets to choose from, loosening one group is
 * often the better answer than clearing everything.
 */
export default function FiltersEmptyState({ body }) {
  const { t } = useTranslation()
  const { resetFilters } = useApp()
  const navigate = useNavigate()

  return (
    <div className="empty-state">
      <SlidersHorizontal size={26} />
      <h3>{t('filtersEmpty.title')}</h3>
      <p>{body || t('filtersEmpty.body')}</p>
      <div className="button-row filters-empty-actions">
        <button className="secondary-button" onClick={() => navigate('/filters')}>
          {t('filtersEmpty.adjust')}
        </button>
        <button className="primary-button" onClick={resetFilters}>
          {t('filtersEmpty.clear')}
        </button>
      </div>
    </div>
  )
}
