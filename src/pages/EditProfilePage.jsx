import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { categories, MIN_INTERESTS, timeBands } from '../data/categories'
import { useAuth } from '../context/AuthContext'
import { updateDisplayName, updatePublicProfile } from '../firebase/users'

export default function EditProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // Seeded from realName, not the public name: while anonymous mode is on the
  // public document says "Anonymous user", and loading that into the field
  // would let a save overwrite the real name with the placeholder.
  const [form, setForm] = useState({
    name: user.realName,
    username: user.username,
    bio: user.bio || '',
    preferredTime: user.preferredTime || '',
    interests: user.interests || [],
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const toggle = (interest) =>
    setForm((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((item) => item !== interest)
        : [...current.interests, interest],
    }))

  const submit = async (event) => {
    event.preventDefault()
    if (form.name.trim().length < 2) {
      setError('Please enter your name.')
      return
    }
    if (form.interests.length < MIN_INTERESTS) {
      setError(`Pick at least ${MIN_INTERESTS} interests.`)
      return
    }
    setError('')
    setBusy(true)
    try {
      await updatePublicProfile(user.uid, {
        username: form.username.trim(),
        bio: form.bio.trim(),
        preferredTime: form.preferredTime,
        interests: form.interests,
      })
      // The name lives in both documents and has to move in both at once.
      await updateDisplayName(user.uid, form.name.trim(), user.anonymous)
      navigate('/profile')
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content">
      <BackButton />
      <h2>Edit profile</h2>
      <form className="form-card" onSubmit={submit}>
        <label>
          Name
          <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} />
        </label>
        {user.anonymous && (
          <small className="field-hint">
            Anonymous mode is on, so others still see “Anonymous user”.
          </small>
        )}
        <label>
          Username
          <input
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            maxLength={40}
          />
        </label>
        <label>
          Bio
          <textarea
            rows="3"
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            maxLength={300}
          />
        </label>
        <label>
          Preferred time
          <select value={form.preferredTime} onChange={(e) => set('preferredTime', e.target.value)}>
            <option value="">No preference</option>
            {timeBands.map((band) => (
              <option key={band}>{band}</option>
            ))}
          </select>
        </label>
        <div>
          <span className="label-like">Interests</span>
          <div className="selection-summary">
            <span className="tiny-chip">{form.interests.length} selected</span>
            <span className="helper-text">Minimum {MIN_INTERESTS}</span>
          </div>
          <div className="interest-grid small-grid">
            {categories.map((interest) => (
              <button
                type="button"
                key={interest}
                className={`interest-chip ${form.interests.includes(interest) ? 'selected' : ''}`}
                onClick={() => toggle(interest)}
                aria-pressed={form.interests.includes(interest)}
              >
                {interest}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button wide"
          disabled={busy || form.interests.length < MIN_INTERESTS}
        >
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}
