import React from 'react'
import { ArrowRight, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
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
          <MapPin size={12} /> Nearby
        </span>
        <span className="tiny-chip">
          <Sparkles size={12} /> Smart matches
        </span>
        <span className="tiny-chip">
          <ShieldCheck size={12} /> Privacy first
        </span>
      </div>
      <button className="primary-button wide" onClick={() => navigate('/signup')}>
        Create account <ArrowRight size={17} />
      </button>
      <button className="text-button" onClick={() => navigate('/signin')}>
        I already have an account
      </button>
    </div>
  )
}
