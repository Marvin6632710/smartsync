import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { categories, timeBands } from '../data/categories'
import { defaultFilters, useApp } from '../context/AppContext'
import { categoryLabel, timeBandLabel } from '../i18n'

export default function FilterPage() {
  const { t } = useTranslation()
  const { filters, setFilters } = useApp()
  const [draft, setDraft] = useState(filters)
  const navigate = useNavigate()
  const set = (k, v) => setDraft((f) => ({ ...f, [k]: v }))
  const reset = () => {
    setDraft(defaultFilters)
    setFilters(defaultFilters)
  }
  return (
    <div className="page-content">
      <h2>{t('filters.title')}</h2>
      <div className="form-card">
        {/* The stored values stay English ('All', 'Football', 'Any',
            'Morning'); only the option labels are translated. */}
        <label>
          {t('filters.category')}
          <select value={draft.category} onChange={(e) => set('category', e.target.value)}>
            <option value="All">{t('filters.all')}</option>
            {categories.map((i) => (
              <option key={i} value={i}>
                {categoryLabel(i)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('filters.maxDistance')}{' '}
          <strong>{t('filters.km', { value: draft.maxDistance })}</strong>
          <input
            type="range"
            min="1"
            max="15"
            value={draft.maxDistance}
            onChange={(e) => set('maxDistance', Number(e.target.value))}
          />
        </label>
        <label>
          {t('filters.time')}
          <select value={draft.timeBand} onChange={(e) => set('timeBand', e.target.value)}>
            <option value="Any">{t('filters.any')}</option>
            {timeBands.map((band) => (
              <option key={band} value={band}>
                {timeBandLabel(band)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="setting-row compact-row"
          onClick={() => set('availableOnly', !draft.availableOnly)}
          role="switch"
          aria-checked={draft.availableOnly}
        >
          <span>
            <strong>{t('filters.availableOnly')}</strong>
            <small>{t('filters.availableOnlyHint')}</small>
          </span>
          <span className={`switch ${draft.availableOnly ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <div className="button-row">
          <button className="secondary-button" onClick={reset}>
            {t('filters.reset')}
          </button>
          <button
            className="primary-button"
            onClick={() => {
              setFilters(draft)
              navigate('/home')
            }}
          >
            {t('filters.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
