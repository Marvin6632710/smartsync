import React, { useEffect, useState } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { getCurrentPosition } from '../utils/geo'

// Bangkok. Only ever a starting view — the pin is not set until the host
// actually places it, so an unedited map cannot be submitted as a real place.
const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 }

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

function ClickToPlace({ onPick }) {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
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
  const point = value?.lat != null && value?.lng != null ? { lat: value.lat, lng: value.lng } : null

  const useMyLocation = async () => {
    setBusy(true)
    setError('')
    try {
      const position = await getCurrentPosition()
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
          center={point ? [point.lat, point.lng] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPick={(next) => onChange({ ...value, ...next })} />
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
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
