import React, { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { categories, MIN_INTERESTS, timeBands } from '../data/categories'
import { useAuth } from '../context/AuthContext'
import { updatePublicProfile } from '../firebase/users'
import { useSaveProfile } from '../hooks/useSaveProfile'

export default function InterestSelectionPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selected, setSelected] = useState(user.interests || [])
  const [preferredTime, setPreferredTime] = useState(user.preferredTime || '')
  const [busy, setBusy] = useState(false)
  const { save } = useSaveProfile()

  const toggle = (interest) =>
    setSelected((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    )

  const submit = async () => {
    setBusy(true)
    const ok = await save(
      () => updatePublicProfile(user.uid, { interests: selected, preferredTime }),
      { failure: "Couldn't save your interests" },
    )
    setBusy(false)
    // Only move on if it saved. Advancing regardless would drop the answers
    // silently and leave the engine with nothing to rank on.
    if (ok) navigate(user.onboarded ? '/profile' : '/permissions', { replace: true })
  }

  return (
    <div className="standalone-page onboarding-page">
      <div className="onboarding-header luxe-header">
        <span className="eyebrow">Interests</span>
        <h1>What do you like?</h1>
        <p>Pick at least {MIN_INTERESTS}. This is what matching runs on.</p>
      </div>

      <div className="selection-summary">
        <span className="tiny-chip">{selected.length} selected</span>
        <span className="helper-text">Used for matching</span>
      </div>
      <div className="interest-grid">
        {categories.map((interest) => (
          <button
            key={interest}
            className={`interest-chip ${selected.includes(interest) ? 'selected' : ''}`}
            onClick={() => toggle(interest)}
            aria-pressed={selected.includes(interest)}
          >
            {interest}
          </button>
        ))}
      </div>

      {/* Preferred time is 15% of every match score, so it is asked for during
          setup rather than left empty until someone finds the profile editor. */}
      <div className="selection-summary">
        <span className="label-like">When are you usually free?</span>
      </div>
      <div className="chip-row">
        {timeBands.map((band) => (
          <button
            key={band}
            className={`interest-chip ${preferredTime === band ? 'selected' : ''}`}
            onClick={() => setPreferredTime(preferredTime === band ? '' : band)}
            aria-pressed={preferredTime === band}
          >
            {band}
          </button>
        ))}
      </div>

      <button
        className="primary-button wide"
        disabled={selected.length < MIN_INTERESTS || busy}
        onClick={submit}
      >
        {busy ? 'Saving…' : 'Continue'} <ArrowRight size={17} />
      </button>
    </div>
  )
}
