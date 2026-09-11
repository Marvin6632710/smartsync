import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LocationPicker from '../components/LocationPicker'
import { categories } from '../data/categories'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { deriveTimeBand } from '../firebase/activities'
import { formatClock } from '../utils/time'
import { withinThailand } from '../data/region'

const today = () => new Date().toISOString().slice(0, 10)

const initial = {
  title: '',
  // Deliberately empty rather than defaulting to the first category. A
  // default here is not a convenience: category is what matching runs on, so
  // a study session published as Football by somebody who never opened the
  // dropdown is wrong for them, wrong for everybody it is then recommended
  // to, and teaches their own history the wrong thing.
  category: '',
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
  const { user } = useAuth()
  const navigate = useNavigate()

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.description.trim()) {
      setError('Please complete the activity name and description.')
      return
    }
    if (!form.category) {
      setError(
        'Pick a category. It is what matching runs on, so a wrong one hides your activity from the people it suits.',
      )
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
    // The picker will not let you place a pin outside the country, but the
    // form state can also arrive from a draft, so the check is repeated where
    // the save happens rather than trusted to the component that set it.
    if (!withinThailand(form.lat, form.lng)) {
      setError('SmartSync only runs in Thailand — pick a spot inside the country.')
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

  // The button that leads here is disabled while suspended, but the route is
  // guessable — and a form somebody can fill in and never submit is worse
  // than being told plainly at the top.
  if (user.suspended)
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>Your account is suspended</h3>
          <p>
            You cannot create activities while your account is suspended. You can still read
            SmartSync and follow the activities you already joined.
          </p>
        </div>
      </div>
    )

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
            <option value="">Choose a category…</option>
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
