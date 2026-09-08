import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { interests } from '../data/mockData'
import { useApp } from '../context/AppContext'

export default function EditProfilePage() {
  const { user, setUser } = useApp()
  const [form, setForm] = useState(user)
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
        <button className="primary-button wide">Save profile</button>
      </form>
    </div>
  )
}
