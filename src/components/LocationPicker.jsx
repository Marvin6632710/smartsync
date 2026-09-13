import React, { useEffect, useMemo, useState } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { MIN_ZOOM, THAILAND_BOUNDS, THAILAND_CENTRE, withinThailand } from '../data/region'
import { getCurrentPosition } from '../utils/geo'

// Bangkok. Only ever a starting view — the pin is not set until the host
// actually places it, so an unedited map cannot be submitted as a real place.
const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 }

const OUTSIDE_MESSAGE = 'SmartSync only runs in Thailand — pick a spot inside the country.'

/**
 * Leaflet's default marker is a PNG resolved relative to the CSS file, which
 * bundlers break. A divIcon is styled by our own CSS instead, so there is no
 * asset to lose and the pin matches the rest of the app.
 */
const pinIcon = L.divIcon({
  className: 'leaflet-pin',
  html: '<span class="leaflet-pin-dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

function ClickToPlace({ onPick, onReject }) {
  useMapEvents({
    click: (event) => {
      const { lat, lng } = event.latlng
      // `maxBounds` keeps the *view* inside the country, but at the minimum
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
  const map = useMap()
  useEffect(() => {
    if (point) map.setView([point.lat, point.lng], map.getZoom())
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Memoised on the coordinates: the form re-renders this on every keystroke
  // in every other field, and a fresh object each time re-ran the recentre
  // below — so once a pin was placed, typing the title dragged the map back
  // to it on each character.
  const lat = value?.lat
  const lng = value?.lng
  const point = useMemo(() => (lat != null && lng != null ? { lat, lng } : null), [lat, lng])

  // An existing pin outside the box would otherwise open the map at a centre
  // `maxBounds` immediately drags away from, which looks like a glitch. Only
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
        setError(`You appear to be outside Thailand. ${OUTSIDE_MESSAGE}`)
        return
      }
      onChange({ ...value, ...position })
    } catch {
      setError('Could not get your location. Tap the map instead.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="location-picker">
      <label>
        Place name
        <input
          value={value?.locationName || ''}
          onChange={(event) => onChange({ ...value, locationName: event.target.value })}
          placeholder="e.g. Lumpini Park"
          maxLength={120}
        />
      </label>

      <div className="picker-map">
        <MapContainer
          center={openAt}
          zoom={13}
          minZoom={MIN_ZOOM}
          maxBounds={THAILAND_BOUNDS}
          maxBoundsViscosity={1}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            bounds={THAILAND_BOUNDS}
            noWrap
          />
          <ClickToPlace
            onPick={(next) => {
              setError('')
              onChange({ ...value, ...next })
            }}
            onReject={() => setError(OUTSIDE_MESSAGE)}
          />
          {point && <Marker position={[point.lat, point.lng]} icon={pinIcon} />}
          <Recenter point={point} />
        </MapContainer>
      </div>

      <div className="picker-actions">
        <span className="helper-text">
          {point ? (
            <>
              <MapPin size={13} /> Pin placed at {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
            </>
          ) : (
            'Tap the map to place the activity.'
          )}
        </span>
        <button type="button" className="secondary-button" onClick={useMyLocation} disabled={busy}>
          <LocateFixed size={16} /> {busy ? 'Locating…' : 'Use my location'}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
