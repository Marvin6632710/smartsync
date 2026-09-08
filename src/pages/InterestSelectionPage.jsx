import React from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { interests } from '../data/mockData'
import { useApp } from '../context/AppContext'

export default function InterestSelectionPage() {
  const navigate = useNavigate()
  const { user, setUser } = useApp()
  const selected = user.interests || []
  const toggle = (interest) => setUser((u) => ({ ...u, interests: selected.includes(interest) ? selected.filter((x) => x !== interest) : [...selected, interest] }))

  return (
    <div className="standalone-page onboarding-page">
      <div className="onboarding-header luxe-header">
        <span className="eyebrow">Interests</span>
        <h1>What do you like?</h1>
        <p>Pick at least 3.</p>
      </div>
      <div className="selection-summary">
        <span className="tiny-chip">{selected.length} selected</span>
        <span className="helper-text">Used for matching</span>
      </div>
      <div className="interest-grid">
        {interests.map((interest) => (
          <button key={interest} className={`interest-chip ${selected.includes(interest) ? 'selected' : ''}`} onClick={() => toggle(interest)}>
            {interest}
          </button>
        ))}
      </div>
      <button className="primary-button wide" disabled={selected.length < 3} onClick={() => navigate('/home')}>Enter app <ArrowRight size={17} /></button>
    </div>
  )
}
