import React from 'react'
import { MapPinned, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const features = [
    [Sparkles, 'Smart discovery', 'Find the best activities for you.'],
    [UsersRound, 'Activity-based social', 'Meet through real plans.'],
    [ShieldCheck, 'Privacy first', 'Control your visibility and location.'],
    [MapPinned, 'Nearby map', 'See activities around Bangkok.'],
  ]

  return (
    <div className="standalone-page onboarding-page">
      <div className="onboarding-header luxe-header">
        <span className="eyebrow">Welcome</span>
        <h1>Better plans. Better people.</h1>
        <p>SmartSync helps you discover and join activities near you.</p>
      </div>
      <div className="feature-stack">
        {features.map(([Icon, title, text]) => (
          <div className="feature-row" key={title}>
            <div className="feature-icon">
              <Icon size={20} />
            </div>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </div>
      <button className="primary-button wide" onClick={() => navigate('/permissions')}>
        Continue
      </button>
    </div>
  )
}
