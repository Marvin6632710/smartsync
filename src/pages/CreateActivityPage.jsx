import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { interests } from '../data/mockData'
import { useApp } from '../context/AppContext'

const initial = {
  title: '',
  category: 'Football',
  description: '',
  date: 'Saturday',
  time: '7:00 PM',
  timeBand: 'Evening',
  location: 'Bangkok',
  distanceKm: 2,
  capacity: 10,
}
export default function CreateActivityPage() {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const { createActivity } = useApp()
  const navigate = useNavigate()
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))
  const submit = (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.description.trim() || !form.location.trim()) {
      setError('Please complete activity name, description and location.')
      return
    }
    if (Number(form.capacity) < 2) {
      setError('Maximum participants must be at least 2.')
      return
    }
    const distance = Number(form.distanceKm)
    if (!Number.isFinite(distance) || distance <= 0) {
      setError('Distance must be a positive number of kilometres.')
      return
    }
    const id = createActivity(form)
    navigate(`/activity/${id}`)
  }
  return (
    <div className="page-content">
      <section>
        <span className="eyebrow">Create together</span>
        <h2>Start an activity</h2>
        <p className="helper-text">
          This is saved to localStorage in the prototype and immediately appears in discovery.
        </p>
      </section>
      <form className="form-card" onSubmit={submit}>
        <label>
          Activity name
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Saturday Football"
          />
        </label>
        <label>
          Category
          <select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {interests.map((i) => (
              <option key={i}>{i}</option>
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
          />
        </label>
        <div className="form-row">
          <label>
            Date
            <input value={form.date} onChange={(e) => set('date', e.target.value)} />
          </label>
          <label>
            Time
            <input value={form.time} onChange={(e) => set('time', e.target.value)} />
          </label>
        </div>
        <label>
          Time preference
          <select value={form.timeBand} onChange={(e) => set('timeBand', e.target.value)}>
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Evening</option>
          </select>
        </label>
        <label>
          Location
          <input
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="Bangkok location"
          />
        </label>
        <label>
          Distance from you (km)
          <input
            type="number"
            min="0.1"
            max="50"
            step="0.1"
            value={form.distanceKm}
            onChange={(e) => set('distanceKm', e.target.value)}
          />
        </label>
        <p className="helper-text">Roughly how far away it is — this is 20% of the match score.</p>
        <label>
          Maximum participants
          <input
            type="number"
            min="2"
            max="100"
            value={form.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button wide" type="submit">
          Create activity
        </button>
      </form>
    </div>
  )
}
