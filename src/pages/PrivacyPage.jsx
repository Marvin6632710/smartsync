import React from 'react'
import { EyeOff, LocateFixed, MapPinned, ShieldCheck } from 'lucide-react'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'

export default function PrivacyPage() {
  const { privacy, setPrivacy } = useApp()
  const toggle = (k) => setPrivacy((p) => ({ ...p, [k]: !p[k] }))
  return (
    <div className="page-content">
      <BackButton />
      <section>
        <span className="eyebrow">User-controlled privacy</span>
        <h2>Privacy controls</h2>
        <p className="helper-text">
          These controls are stored locally. The prototype does not send precise GPS data to a
          backend.
        </p>
      </section>
      <div className="settings-card">
        <button
          className="setting-row"
          onClick={() => toggle('anonymousMode')}
          role="switch"
          aria-checked={privacy.anonymousMode}
        >
          <EyeOff />
          <span>
            <strong>Anonymous mode</strong>
            <small>Hide your display name in local activity interactions</small>
          </span>
          <span className={`switch ${privacy.anonymousMode ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <button
          className="setting-row"
          onClick={() => toggle('locationPermission')}
          role="switch"
          aria-checked={privacy.locationPermission}
        >
          <LocateFixed />
          <span>
            <strong>Location permission</strong>
            <small>Enable or disable location-based prototype behavior</small>
          </span>
          <span className={`switch ${privacy.locationPermission ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <button
          className="setting-row"
          onClick={() => toggle('approximateLocation')}
          role="switch"
          aria-checked={privacy.approximateLocation}
        >
          <MapPinned />
          <span>
            <strong>Approximate location</strong>
            <small>Prefer general nearby area instead of precise coordinates</small>
          </span>
          <span
            className={`switch ${privacy.approximateLocation ? 'on' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Privacy principle</span>
            <h3>Temporary by design</h3>
          </div>
          <ShieldCheck size={20} />
        </div>
        <p>
          Activity chats are tied to activities in this prototype. A production backend can enforce
          chat expiry and controlled data retention after activities finish.
        </p>
      </section>
    </div>
  )
}
