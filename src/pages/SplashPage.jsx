import React from 'react'
import { ArrowRight, Sparkles, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function SplashPage() {
  const navigate = useNavigate()
  return (
    <div className="standalone-page splash-page premium-entry">
      <div className="brand-orb">
        <Sparkles size={42} />
      </div>
      <div className="entry-copy">
        <span className="eyebrow">SmartSync</span>
        <h1>Meet by doing.</h1>
        <p>Find nearby activities and join fast.</p>
      </div>
      <div className="entry-highlights">
        <span className="tiny-chip">
          <Star size={12} /> Clean UI
        </span>
        <span className="tiny-chip">
          <Star size={12} /> Smart matches
        </span>
        <span className="tiny-chip">
          <Star size={12} /> Smooth motion
        </span>
      </div>
      <button className="primary-button wide" onClick={() => navigate('/onboarding')}>
        Get started <ArrowRight size={17} />
      </button>
      <button className="text-button" onClick={() => navigate('/home')}>
        Open app
      </button>
      <span className="prototype-label">Senior project prototype</span>
    </div>
  )
}
