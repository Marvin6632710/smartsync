import React from 'react'
import { EyeOff, LocateFixed, MapPinned, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { useSaveProfile } from '../hooks/useSaveProfile'
import { setAnonymousMode, updatePrivateProfile } from '../firebase/users'
import { coarsen } from '../utils/geo'

export default function PrivacyPage() {
  const { t } = useTranslation()
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

  return (
    <div className="page-content">
      <section>
        <span className="eyebrow">{t('privacy.eyebrow')}</span>
        <h2>{t('privacy.title')}</h2>
        <p className="helper-text">{t('privacy.lead')}</p>
      </section>
      <div className="settings-card">
        <button
          className="setting-row"
          onClick={() =>
            save(() => setAnonymousMode(user.uid, !user.anonymous, user.realName), {
              failure: t('privacy.anonymousFailed'),
            })
          }
          role="switch"
          aria-checked={user.anonymous}
          disabled={saving}
        >
          <EyeOff size={18} />
          <span>
            <strong>{t('privacy.anonymous')}</strong>
            <small>{t('privacy.anonymousHint')}</small>
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
            <strong>{t('privacy.location')}</strong>
            <small>{busy ? t('privacy.askingDevice') : t('privacy.locationHint')}</small>
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
          <MapPinned size={18} />
          <span>
            <strong>{t('privacy.approximate')}</strong>
            <small>{t('privacy.approximateHint')}</small>
          </span>
          <span
            className={`switch ${privacy.approximateLocation ? 'on' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t('privacy.howEyebrow')}</span>
            <h3>{t('privacy.howTitle')}</h3>
          </div>
          <ShieldCheck size={20} />
        </div>
        <p>{t('privacy.howBody')}</p>
      </section>
    </div>
  )
}
