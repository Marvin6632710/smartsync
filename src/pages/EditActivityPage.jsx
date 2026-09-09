import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import LocationPicker from '../components/LocationPicker'
import { categories } from '../data/categories'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { deriveTimeBand } from '../firebase/activities'
import { formatClock } from '../utils/time'

export default function EditActivityPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activities, updateActivity } = useApp()
  const { user } = useAuth()
  const existing = useMemo(() => activities.find((item) => item.id === id), [activities, id])
  const [form, setForm] = useState(() => existing || {})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!existing)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Activity not found</h3>
        </div>
      </div>
    )

  // The rules reject a non-host edit anyway; this keeps the user from filling
  // in a form that was always going to be refused.
  if (existing.hostId !== user.uid)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Only the host can edit this</h3>
          <p>Ask {existing.hostName} to make changes.</p>
        </div>
      </div>
    )

  const minCapacity = Math.max(2, existing.participants)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title?.trim() || !form.description?.trim()) {
      setError('Activity name and description are required.')
      return
    }
    if (!form.locationName?.trim() || form.lat == null || form.lng == null) {
      setError('The activity needs a named place and a pin on the map.')
      return
    }
    if (Number(form.capacity) < minCapacity) {
      setError(`Capacity can't be below the ${existing.participants} people already joined.`)
      return
    }
    setError('')
    setBusy(true)
    await updateActivity(id, {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      locationName: form.locationName.trim(),
      lat: Number(form.lat),
      lng: Number(form.lng),
      date: form.date,
      time: form.time,
      capacity: form.capacity,
      tags: [form.category, deriveTimeBand(form.time)].filter(Boolean),
    })
    setBusy(false)
    navigate(`/activity/${id}`)
  }

  return (
    <div className="page-content">
      <BackButton />
      <h2>Edit activity</h2>
      <form className="form-card" onSubmit={submit}>
        <label>
          Activity name
          <input
            value={form.title || ''}
            onChange={(e) => set('title', e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          Category
          <select
            value={form.category || 'Football'}
            onChange={(e) => set('category', e.target.value)}
          >
            {categories.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            rows="4"
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
            maxLength={1000}
          />
        </label>
        <div className="form-row">
          <label>
            Date
            <input
              type="date"
              value={form.date || ''}
              onChange={(e) => set('date', e.target.value)}
            />
          </label>
          <label>
            Time
            <input
              type="time"
              value={form.time || ''}
              onChange={(e) => set('time', e.target.value)}
            />
          </label>
        </div>
        <p className="helper-text">
          {formatClock(form.time)} counts as {deriveTimeBand(form.time).toLowerCase()}.
        </p>

        <LocationPicker
          value={form}
          onChange={(next) => setForm((current) => ({ ...current, ...next }))}
        />

        <label>
          Capacity
          <input
            type="number"
            min={minCapacity}
            max="500"
            value={form.capacity || minCapacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </label>
        <p className="helper-text">
          {`Can't go below the ${existing.participants} people already joined.`}
        </p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
