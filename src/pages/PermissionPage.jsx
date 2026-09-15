import React, { useState } from 'react'
import { BellRing, LocateFixed, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import CelebrationToast from '../components/CelebrationToast'
import SignOutLink from '../components/SignOutLink'
import { useAuth } from '../context/AuthContext'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { useSaveProfile } from '../hooks/useSaveProfile'
import { setNotificationsEnabled, updatePrivateProfile } from '../firebase/users'
import { coarsen } from '../utils/geo'

export default function PermissionPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { request, clear, busy, error } = useDeviceLocation()
  const { save, saving } = useSaveProfile()
  const privacy = user.privacy

  // Only the field that changed: the merge keeps the rest of the map, and
  // spreading it back in copied the notifications preference — which lives
  // on the public profile — into the private one, where nothing reads it.
  //
  // Turning approximation on also rounds the position already on file: the
  // switch promised "never your exact position" while the exact one it had
  // been given a minute earlier stayed stored until the next request.
  // Turning it off cannot sharpen a rounded value; the next request does.
  const toggleApproximate = () => {
    const next = !privacy.approximateLocation
    const patch = { privacy: { approximateLocation: next } }
    if (next && user.location) patch.location = coarsen(user.location)
    return save(() => updatePrivateProfile(user.uid, patch))
  }

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
    const ok = await save(() => updatePrivateProfile(user.uid, { onboarded: true }), {
      failure: t('onboarding.permissions.finishFailed'),
    })
    setFinishing(false)
    // Only leave the screen if the write actually landed — otherwise the
    // routing gate bounces straight back here and it looks like a dead button.
    if (ok) navigate('/home', { replace: true })
  }

  return (
    <div className="standalone-page onboarding-page">
      <CelebrationToast />
      <div className="onboarding-header luxe-header">
        <span className="eyebrow">{t('onboarding.permissions.eyebrow')}</span>
        <h1>{t('onboarding.permissions.title')}</h1>
        <p>{t('onboarding.permissions.lead')}</p>
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
            <strong>{t('onboarding.permissions.location')}</strong>
            <small>
              {busy
                ? t('onboarding.permissions.askingDevice')
                : t('onboarding.permissions.locationHint')}
            </small>
          </span>
          <span className={`switch ${privacy.locationPermission ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <button
          className="setting-row"
          onClick={toggleApproximate}
          disabled={saving}
          role="switch"
          aria-checked={privacy.approximateLocation}
        >
          <ShieldCheck size={18} />
          <span>
            <strong>{t('onboarding.permissions.approximate')}</strong>
            <small>{t('onboarding.permissions.approximateHint')}</small>
          </span>
          <span
            className={`switch ${privacy.approximateLocation ? 'on' : ''}`}
            aria-hidden="true"
          />
        </button>
        <button
          className="setting-row"
          onClick={() => save(() => setNotificationsEnabled(user.uid, !privacy.notifications))}
          role="switch"
          aria-checked={privacy.notifications}
        >
          <BellRing size={18} />
          <span>
            <strong>{t('onboarding.permissions.notifications')}</strong>
            <small>{t('onboarding.permissions.notificationsHint')}</small>
          </span>
          <span className={`switch ${privacy.notifications ? 'on' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      <p className="helper-text">{t('onboarding.permissions.skipNote')}</p>

      <button className="primary-button wide" onClick={finish} disabled={finishing}>
        {finishing
          ? t('onboarding.permissions.settingUp')
          : user.onboarded
            ? t('common.done')
            : t('onboarding.permissions.enter')}
      </button>

      {!user.onboarded && <SignOutLink />}
    </div>
  )
}
