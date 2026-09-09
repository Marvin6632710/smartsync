import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { categories } from '../data/categories'
import { defaultFilters, useApp } from '../context/AppContext'

export default function FilterPage() {
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
      <BackButton />
      <h2>Discovery filters</h2>
      <div className="form-card">
        <label>
          Category
          <select value={draft.category} onChange={(e) => set('category', e.target.value)}>
            <option>All</option>
            {categories.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </label>
        <label>
          Maximum distance: <strong>{draft.maxDistance} km</strong>
          <input
            type="range"
            min="1"
            max="15"
            value={draft.maxDistance}
            onChange={(e) => set('maxDistance', Number(e.target.value))}
          />
        </label>
        <label>
          Time
          <select value={draft.timeBand} onChange={(e) => set('timeBand', e.target.value)}>
            <option>Any</option>
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Evening</option>
          </select>
        </label>
        <button
          className="setting-row compact-row"
          onClick={() => set('availableOnly', !draft.availableOnly)}
          role="switch"
          aria-checked={draft.availableOnly}
        >
          <span>
            <strong>Available spots only</strong>
            <small>Hide activities that are already full</small>
          </span>
          <span className={`switch ${draft.availableOnly ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <div className="button-row">
          <button className="secondary-button" onClick={reset}>
            Reset
          </button>
          <button
            className="primary-button"
            onClick={() => {
              setFilters(draft)
              navigate('/home')
            }}
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  )
}
