import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LocationPicker from '../components/LocationPicker'
import { categories } from '../data/categories'
import { useApp } from '../context/AppContext'
import { deriveTimeBand } from '../firebase/activities'
import { formatClock } from '../utils/time'

const today = () => new Date().toISOString().slice(0, 10)

const initial = {
  title: '',
  category: 'Football',
  description: '',
  date: today(),
  time: '19:00',
  locationName: '',
  lat: null,
  lng: null,
  capacity: 10,
}

export default function CreateActivityPage() {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { createActivity } = useApp()
  const navigate = useNavigate()

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.description.trim()) {
      setError('Please complete the activity name and description.')
      return
    }
    if (!form.locationName.trim()) {
      setError('Please name the place you are meeting.')
      return
    }
    // A coordinate is required, and there is no sensible default: guessing one
    // would put a real activity somewhere nobody agreed to meet.
    if (form.lat == null || form.lng == null) {
      setError('Tap the map to place the activity, or use your current location.')
      return
    }
    if (Number(form.capacity) < 2) {
      setError('Maximum participants must be at least 2.')
      return
    }
    if (new Date(`${form.date}T${form.time}`) < new Date()) {
      setError('Pick a date and time in the future.')
      return
    }
    setError('')
    setBusy(true)
    const id = await createActivity(form)
    setBusy(false)
    if (id) navigate(`/activity/${id}`)
  }

  return (
    <div className="page-content">
      <section>
        <span className="eyebrow">Create together</span>
        <h2>Start an activity</h2>
        <p className="helper-text">Everyone using SmartSync will be able to find and join it.</p>
      </section>

      <form className="form-card" onSubmit={submit}>
        <label>
          Activity name
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Saturday Football"
            maxLength={100}
          />
        </label>
        <label>
          Category
          <select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {categories.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            rows="4"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Tell participants what to expect"
            maxLength={1000}
          />
        </label>

        <div className="form-row">
          <label>
            Date
            <input
              type="date"
              min={today()}
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </label>
          <label>
            Time
            <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </label>
        </div>
        {/* Time band used to be a separate dropdown that could contradict the
            time. It is derived now, so it is shown rather than asked. */}
        <p className="helper-text">
          {formatClock(form.time)} counts as {deriveTimeBand(form.time).toLowerCase()}.
        </p>

        <LocationPicker
          value={form}
          onChange={(next) => setForm((current) => ({ ...current, ...next }))}
        />

        <label>
          Maximum participants
          <input
            type="number"
            min="2"
            max="500"
            value={form.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create activity'}
        </button>
      </form>
    </div>
  )
}
