import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { interests } from '../data/mockData'
import { useApp } from '../context/AppContext'

export default function EditActivityPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activities, updateActivity } = useApp()
  const existing = useMemo(() => activities.find((a) => a.id === id), [activities, id])
  const [form, setForm] = useState(existing || {})
  const [error, setError] = useState('')
  if (!existing)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Activity not found</h3>
        </div>
      </div>
    )
  const minCapacity = Math.max(2, existing.participants)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const submit = (e) => {
    e.preventDefault()
    if (!form.title?.trim() || !form.description?.trim()) {
      setError('Activity name and description are required.')
      return
    }
    if (Number(form.capacity) < minCapacity) {
      setError(`Capacity can't be below the current ${existing.participants} participants.`)
      return
    }
    updateActivity(id, form)
    navigate(`/activity/${id}`)
  }
  return (
    <div className="page-content">
      <BackButton />
      <h2>Edit activity</h2>
      <form className="form-card" onSubmit={submit}>
        <label>
          Activity name
          <input value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label>
          Category
          <select
            value={form.category || 'Football'}
            onChange={(e) => set('category', e.target.value)}
          >
            {interests.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            rows="4"
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Date
            <input value={form.date || ''} onChange={(e) => set('date', e.target.value)} />
          </label>
          <label>
            Time
            <input value={form.time || ''} onChange={(e) => set('time', e.target.value)} />
          </label>
        </div>
        <label>
          Time preference
          <select
            value={form.timeBand || 'Evening'}
            onChange={(e) => set('timeBand', e.target.value)}
          >
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Evening</option>
          </select>
        </label>
        <label>
          Location
          <input value={form.location || ''} onChange={(e) => set('location', e.target.value)} />
        </label>
        <label>
          Capacity
          <input
            type="number"
            min={minCapacity}
            value={form.capacity || minCapacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </label>
        <p className="helper-text">
          {`Can't go below the ${existing.participants} people already joined.`}
        </p>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button wide">Save changes</button>
      </form>
    </div>
  )
}
