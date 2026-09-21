import React, { useState } from 'react'
import { Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { categories, timeBands } from '../data/categories'
import { useApp } from '../context/AppContext'
import { categoryLabel, timeBandLabel } from '../i18n'
import { defaultFilters, DISTANCE_RANGE, toggleChoice } from '../utils/filters'

/**
 * One group of choices: a legend, a hint, an "all of them" control and a
 * checkbox per option. Real checkboxes, visually dressed as chips, so the
 * keyboard and a screen reader get the native behaviour — Space toggles,
 * the state is announced — and nothing has to be reinvented for them.
 *
 * "All" is a toggle button rather than a checkbox: pressing it clears the
 * group, and it shows as pressed whenever the group is empty, because an
 * empty group means no restriction. It cannot be un-pressed on its own —
 * picking an option is what does that.
 */
function ChoiceGroup({ legend, hint, allLabel, options, labelFor, chosen, onToggle, onClear }) {
  const { t } = useTranslation()
  const none = chosen.length === 0
  return (
    <fieldset className="choice-group">
      <legend>
        <span className="choice-legend">{legend}</span>
        {!none && (
          <span className="tiny-chip choice-count">
            {t('filters.selected', { count: chosen.length })}
          </span>
        )}
      </legend>
      <p className="field-hint">{hint}</p>
      <div className="choice-grid">
        <button
          type="button"
          className={`choice-chip choice-all${none ? ' selected' : ''}`}
          aria-pressed={none}
          onClick={onClear}
        >
          <span className="choice-mark" aria-hidden="true">
            <Check size={14} strokeWidth={3} />
          </span>
          {allLabel}
        </button>
        {options.map((option) => {
          const checked = chosen.includes(option)
          return (
            <label key={option} className={`choice-chip${checked ? ' selected' : ''}`}>
              <input type="checkbox" checked={checked} onChange={() => onToggle(option)} />
              <span className="choice-mark" aria-hidden="true">
                <Check size={14} strokeWidth={3} />
              </span>
              {labelFor(option)}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function FilterPage() {
  const { t } = useTranslation()
  const { filters, setFilters } = useApp()
  // A draft: nothing here reaches the feed until Apply. Opening the page
  // starts from what is applied, so it always shows the selections in force.
  const [draft, setDraft] = useState(filters)
  const navigate = useNavigate()
  const set = (k, v) => setDraft((f) => ({ ...f, [k]: v }))
  const toggle = (k, vocabulary, value) =>
    setDraft((f) => ({ ...f, [k]: toggleChoice(f[k], value, vocabulary) }))
  // Reset applies as well as clears: it is the way out of a feed that shows
  // nothing, and a reset that still needed Apply left people on the page.
  const reset = () => {
    setDraft(defaultFilters)
    setFilters(defaultFilters)
  }
  return (
    <div className="page-content">
      <h2>{t('filters.title')}</h2>
      <div className="form-card">
        {/* The stored values stay English ('Football', 'Morning'); only the
            option labels are translated. */}
        <ChoiceGroup
          legend={t('filters.category')}
          hint={t('filters.categoryHint')}
          allLabel={t('filters.allCategories')}
          options={categories}
          labelFor={categoryLabel}
          chosen={draft.categories}
          onToggle={(value) => toggle('categories', categories, value)}
          onClear={() => set('categories', [])}
        />
        <ChoiceGroup
          legend={t('filters.time')}
          hint={t('filters.timeHint')}
          allLabel={t('filters.anyTime')}
          options={timeBands}
          labelFor={timeBandLabel}
          chosen={draft.timeBands}
          onToggle={(value) => toggle('timeBands', timeBands, value)}
          onClear={() => set('timeBands', [])}
        />
        <label>
          {t('filters.maxDistance')}{' '}
          <strong>{t('filters.km', { value: draft.maxDistance })}</strong>
          <input
            type="range"
            min={DISTANCE_RANGE.min}
            max={DISTANCE_RANGE.max}
            value={draft.maxDistance}
            onChange={(e) => set('maxDistance', Number(e.target.value))}
          />
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
