import React from 'react'
import { BellRing, LocateFixed, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function PermissionPage() {
  const navigate = useNavigate()
  const { privacy, setPrivacy } = useApp()
  const toggle = (key) => setPrivacy((p) => ({ ...p, [key]: !p[key] }))

  return (
    <div className="standalone-page onboarding-page">
      <div className="onboarding-header luxe-header">
        <span className="eyebrow">Permissions</span>
        <h1>You stay in control.</h1>
        <p>Choose what the app can use.</p>
      </div>
      <div className="settings-card">
        <button className="setting-row" onClick={() => toggle('locationPermission')}>
          <LocateFixed />
          <span>
            <strong>Location</strong>
            <small>Show nearby activities</small>
          </span>
          <span className={`switch ${privacy.locationPermission ? 'on' : ''}`} />
        </button>
        <button className="setting-row" onClick={() => toggle('approximateLocation')}>
          <ShieldCheck />
          <span>
            <strong>Approximate location</strong>
            <small>Hide exact position</small>
          </span>
          <span className={`switch ${privacy.approximateLocation ? 'on' : ''}`} />
        </button>
        <button className="setting-row" onClick={() => toggle('notifications')}>
          <BellRing />
          <span>
            <strong>Notifications</strong>
            <small>Get reminders and updates</small>
          </span>
          <span className={`switch ${privacy.notifications ? 'on' : ''}`} />
        </button>
      </div>
      <button className="primary-button wide" onClick={() => navigate('/interests')}>
        Continue
      </button>
    </div>
  )
}
