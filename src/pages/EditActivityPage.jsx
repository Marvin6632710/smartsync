import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import LocationPicker from '../components/LocationPicker'
import { categories } from '../data/categories'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { deriveTimeBand } from '../firebase/activities'
import { formatClock } from '../utils/time'
import { withinThailand } from '../data/region'

export default function EditActivityPage() {
  const { id } = useParams()
  const { activities } = useApp()
  const { user } = useAuth()
  const existing = useMemo(() => activities.find((item) => item.id === id), [activities, id])

  if (!existing)
    return (
      <div className="page-content">
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
        <div className="empty-state">
          <h3>Only the host can edit this</h3>
          <p>Ask {existing.hostName} to make changes.</p>
        </div>
      </div>
    )

  // A removed activity is frozen: the rules refuse every edit to it, so the
  // form would only ever be a way to lose your typing. The details page no
  // longer offers the button, but this route is guessable.
  if (existing.status === 'removed')
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>This activity was removed</h3>
          <p>
            {existing.moderation?.reason
              ? `SmartSync removed it: ${existing.moderation.reason}. It cannot be edited or put back from here.`
              : 'SmartSync removed it. It cannot be edited or put back from here.'}
          </p>
        </div>
      </div>
    )

  return <EditActivityForm existing={existing} />
}

/**
 * The form itself, mounted only once the activity is known.
 *
 * It used to live in the component above, seeded with `existing || {}` on
 * first render. On a cold load of this URL the listener has not delivered
 * anything yet, so the seed was `{}` — and when the activity arrived a moment
 * later the screen showed an edit form with every field empty. Seeding here
 * means the first render this form ever does already has the data; a later
 * snapshot updates `existing` without touching what is being typed, exactly
 * as before.
 */
function EditActivityForm({ existing }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { updateActivity } = useApp()
  const [form, setForm] = useState(existing)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
    // Editing is also the path by which an older activity outside the box
    // would be saved again, so it has to pass the same test as a new one.
    if (!withinThailand(form.lat, form.lng)) {
      setError('SmartSync only runs in Thailand — pick a spot inside the country.')
      return
    }
    if (Number(form.capacity) < minCapacity) {
      setError(`Capacity can't be below the ${existing.participants} people already joined.`)
      return
    }
    // Both halves of the instant, always: the data layer refuses one without
    // the other, and the rules refuse an empty time, so say so here.
    if (!form.date || !form.time) {
      setError('Pick a date and a time.')
      return
    }
    // Only when the time is being moved: a host fixing the description of
    // something that has already happened must not be told to reschedule it.
    const moved = form.date !== existing.date || form.time !== existing.time
    if (moved && new Date(`${form.date}T${form.time}`) < new Date()) {
      setError('Pick a date and time in the future.')
      return
    }
    setError('')
    setBusy(true)
    const saved = await updateActivity(id, {
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
    // Stay put if it did not save. The toast has already said why, and the
    // typing is still on screen to try again with.
    if (saved) navigate(`/activity/${id}`)
  }

  return (
    <div className="page-content">
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
