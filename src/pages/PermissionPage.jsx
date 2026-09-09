import React, { useState } from 'react'
import { BellRing, LocateFixed, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { setNotificationsEnabled, updatePrivateProfile } from '../firebase/users'

export default function PermissionPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { request, clear, busy, error } = useDeviceLocation()
  const privacy = user.privacy

  const setPrivacy = (patch) =>
    updatePrivateProfile(user.uid, { privacy: { ...privacy, ...patch } })

  // The location switch is not a preference that is merely recorded — it
  // triggers the browser's real permission prompt and stores a real position.
  const toggleLocation = async () => {
    if (privacy.locationPermission) {
      await clear()
      return
    }
    await request()
  }

  const [finishing, setFinishing] = useState(false)

  // Awaited, not fired-and-forgotten. Routing is gated on `onboarded`, so
  // navigating before the write lands means the gate still reads false and
  // bounces straight back to interest selection.
  const finish = async () => {
    setFinishing(true)
    try {
      await updatePrivateProfile(user.uid, { onboarded: true })
      navigate('/home', { replace: true })
    } finally {
      setFinishing(false)
    }
  }

  return (
    <div className="standalone-page onboarding-page">
      <div className="onboarding-header luxe-header">
        <span className="eyebrow">Permissions</span>
        <h1>You stay in control.</h1>
        <p>Choose what the app can use.</p>
      </div>
      <div className="settings-card">
        <button
          className="setting-row"
          onClick={toggleLocation}
          role="switch"
          aria-checked={privacy.locationPermission}
          disabled={busy}
        >
          <LocateFixed size={18} />
          <span>
            <strong>Location</strong>
            <small>{busy ? 'Asking your device…' : 'Rank activities by how near they are'}</small>
          </span>
          <span className={`switch ${privacy.locationPermission ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <button
          className="setting-row"
          onClick={() => setPrivacy({ approximateLocation: !privacy.approximateLocation })}
          role="switch"
          aria-checked={privacy.approximateLocation}
        >
          <ShieldCheck size={18} />
          <span>
            <strong>Approximate location</strong>
            <small>Store your area, never your exact position</small>
          </span>
          <span
            className={`switch ${privacy.approximateLocation ? 'on' : ''}`}
            aria-hidden="true"
          />
        </button>
        <button
          className="setting-row"
          onClick={() => setNotificationsEnabled(user.uid, !privacy.notifications)}
          role="switch"
          aria-checked={privacy.notifications}
        >
          <BellRing size={18} />
          <span>
            <strong>Notifications</strong>
            <small>Get told when someone joins or messages</small>
          </span>
          <span className={`switch ${privacy.notifications ? 'on' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="helper-text">
        You can skip location — activities still work, they just will not be sorted by distance.
      </p>

      <button className="primary-button wide" onClick={finish} disabled={finishing}>
        {finishing ? 'Setting up…' : user.onboarded ? 'Done' : 'Enter SmartSync'}
      </button>
    </div>
  )
}
