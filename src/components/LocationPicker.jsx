import React, { useEffect, useMemo, useState } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import GoogleMap, { GoogleMarker, useGoogleMap, useGoogleMapEvents } from './GoogleMap'

import { THAILAND_CENTRE, withinThailand } from '../data/region'
import { getCurrentPosition } from '../utils/geo'

// Bangkok. Only ever a starting view — the pin is not set until the host
// actually places it, so an unedited map cannot be submitted as a real place.
const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 }

function ClickToPlace({ onPick, onReject }) {
  useGoogleMapEvents({
    click: (event) => {
      if (!event.latLng) return
      const { lat, lng } = event.latLng.toJSON()
      // The map restriction keeps the view inside the country, but at the minimum
      // zoom the viewport is taller than the box, so the sea below Malaysia
      // and a strip of Myanmar are still on screen and still clickable. The
      // rules would reject such a pin on write; catching it here means the
      // host finds out while the map is in front of them.
      if (!withinThailand(lat, lng)) {
        onReject()
        return
      }
      onPick({ lat, lng })
    },
  })
  return null
}

function Recenter({ point }) {
  const { map } = useGoogleMap()
  useEffect(() => {
    if (point) map.setCenter(point)
  }, [point, map])
  return null
}

/**
 * Picks a real coordinate for an activity.
 *
 * The prototype asked the host to type "distance from you in km", which is
 * not a property of the activity at all — it differs for every person looking
 * at it. A coordinate is the real fact; each viewer's distance is computed
 * from it and their own position.
 */
export default function LocationPicker({ value, onChange }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  // The error is kept as a key, so a change of language re-words it.
  const [error, setError] = useState('')
  // Memoised on the coordinates: the form re-renders this on every keystroke
  // in every other field, and a fresh object each time re-ran the recentre
  // below — so once a pin was placed, typing the title dragged the map back
  // to it on each character.
  const lat = value?.lat
  const lng = value?.lng
  const point = useMemo(() => (lat != null && lng != null ? { lat, lng } : null), [lat, lng])

  // An existing pin outside the box would otherwise open the map at a centre
  // the map restriction immediately drags away from, which looks like a glitch. Only
  // data predating the constraint can be in that state, and it is rare enough
  // to be worth one line rather than a migration.
  const openAt =
    point && withinThailand(point.lat, point.lng)
      ? [point.lat, point.lng]
      : point
        ? THAILAND_CENTRE
        : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]

  const useMyLocation = async () => {
    setBusy(true)
    setError('')
    try {
      const position = await getCurrentPosition()
      // Somebody abroad testing the app gets a straight answer instead of a
      // pin the save silently refuses.
      if (!withinThailand(position.lat, position.lng)) {
        setError('location.youAreOutside')
        return
      }
      onChange({ ...value, ...position })
    } catch {
      setError('location.unavailableTapMap')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="location-picker">
      <label>
        {t('location.placeName')}
        <input
          value={value?.locationName || ''}
          onChange={(event) => onChange({ ...value, locationName: event.target.value })}
          placeholder={t('location.placePlaceholder')}
          maxLength={120}
        />
      </label>

      <div className="picker-map">
        <GoogleMap center={openAt} zoom={13} gestureHandling="cooperative">
          <ClickToPlace
            onPick={(next) => {
              setError('')
              onChange({ ...value, ...next })
            }}
            onReject={() => setError('location.outsideThailand')}
          />
          {point && (
            <GoogleMarker position={point} title={t('location.selectedPin')} anchorTop="-50%">
              <span className="map-picker-pin">
                <span className="map-pin-dot" />
              </span>
            </GoogleMarker>
          )}
          <Recenter point={point} />
        </GoogleMap>
      </div>

      <div className="picker-actions">
        <span className="helper-text">
          {point ? (
            <>
              <MapPin size={13} />{' '}
              {t('location.pinPlaced', { lat: point.lat.toFixed(4), lng: point.lng.toFixed(4) })}
            </>
          ) : (
            t('location.tapToPlace')
          )}
        </span>
        <button type="button" className="secondary-button" onClick={useMyLocation} disabled={busy}>
          <LocateFixed size={16} /> {busy ? t('location.locating') : t('location.useMyLocation')}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  )
}
