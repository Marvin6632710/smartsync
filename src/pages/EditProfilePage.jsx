import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { interests } from '../data/mockData'
import { useApp } from '../context/AppContext'

const MIN_INTERESTS = 3

export default function EditProfilePage() {
  const { user, setUser } = useApp()
  const [form, setForm] = useState(user)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const toggle = (i) =>
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(i) ? f.interests.filter((x) => x !== i) : [...f.interests, i],
    }))
  return (
    <div className="page-content">
      <BackButton />
      <h2>Edit profile</h2>
      <form
        className="form-card"
        onSubmit={(e) => {
          e.preventDefault()
          if (form.interests.length < MIN_INTERESTS) {
            setError(`Pick at least ${MIN_INTERESTS} interests.`)
            return
          }
          setUser(form)
          navigate('/profile')
        }}
      >
        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label>
          Username
          <input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          />
        </label>
        <label>
          Bio
          <textarea
            rows="3"
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          />
        </label>
        <label>
          Preferred time
          <select
            value={form.preferredTime}
            onChange={(e) => setForm((f) => ({ ...f, preferredTime: e.target.value }))}
          >
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Evening</option>
          </select>
        </label>
        <div>
          <span className="label-like">Interests</span>
          <div className="selection-summary">
            <span className="tiny-chip">{form.interests.length} selected</span>
            <span className="helper-text">Minimum {MIN_INTERESTS}</span>
          </div>
          <div className="interest-grid small-grid">
            {interests.map((i) => (
              <button
                type="button"
                key={i}
                className={`interest-chip ${form.interests.includes(i) ? 'selected' : ''}`}
                onClick={() => toggle(i)}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button wide" disabled={form.interests.length < MIN_INTERESTS}>
          Save profile
        </button>
      </form>
    </div>
  )
}
