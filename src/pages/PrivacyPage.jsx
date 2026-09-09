import React from 'react'
import { EyeOff, LocateFixed, MapPinned, ShieldCheck } from 'lucide-react'
import BackButton from '../components/BackButton'
import { useAuth } from '../context/AuthContext'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { setAnonymousMode, updatePrivateProfile } from '../firebase/users'

export default function PrivacyPage() {
  const { user } = useAuth()
  const { request, clear, busy, error } = useDeviceLocation()
  const privacy = user.privacy

  const setPrivacy = (patch) =>
    updatePrivateProfile(user.uid, { privacy: { ...privacy, ...patch } })

  return (
    <div className="page-content">
      <BackButton />
      <section>
        <span className="eyebrow">User-controlled privacy</span>
        <h2>Privacy controls</h2>
        <p className="helper-text">
          These settings change what other people can actually read about you, not just what this
          app chooses to display.
        </p>
      </section>
      <div className="settings-card">
        <button
          className="setting-row"
          onClick={() => setAnonymousMode(user.uid, !user.anonymous, user.realName)}
          role="switch"
          aria-checked={user.anonymous}
        >
          <EyeOff size={18} />
          <span>
            <strong>Anonymous mode</strong>
            <small>Your real name is removed from the profile others can read</small>
          </span>
          <span className={`switch ${user.anonymous ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <button
          className="setting-row"
          onClick={() => (privacy.locationPermission ? clear() : request())}
          role="switch"
          aria-checked={privacy.locationPermission}
          disabled={busy}
        >
          <LocateFixed size={18} />
          <span>
            <strong>Location</strong>
            <small>{busy ? 'Asking your device…' : 'Used to sort activities by distance'}</small>
          </span>
          <span className={`switch ${privacy.locationPermission ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <button
          className="setting-row"
          onClick={() => setPrivacy({ approximateLocation: !privacy.approximateLocation })}
          role="switch"
          aria-checked={privacy.approximateLocation}
        >
          <MapPinned size={18} />
          <span>
            <strong>Approximate location</strong>
            <small>Round your position to about a kilometre before storing it</small>
          </span>
          <span
            className={`switch ${privacy.approximateLocation ? 'on' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">How this works</span>
            <h3>Enforced, not just hidden</h3>
          </div>
          <ShieldCheck size={20} />
        </div>
        <p>
          Your email, your real name while anonymous mode is on, and your stored position live in a
          part of your profile the database will not serve to anyone but you. Activity chats are
          readable only by people who joined that activity.
        </p>
      </section>
    </div>
  )
}
