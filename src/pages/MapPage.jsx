import React, { useMemo, useState } from 'react'
import { ChevronRight, List, LocateFixed, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import CategoryIcon from '../components/CategoryIcon'
import FiltersEmptyState from '../components/FiltersEmptyState'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { formatDistance } from '../utils/geo'

const BANGKOK = [13.7563, 100.5018]
const categoryKey = (value) => (value || '').toLowerCase()

// Styled by our own CSS rather than Leaflet's bundled PNG, which bundlers
// break, and which could not carry the per-category colour anyway.
const markerIcon = (category, selected) =>
  L.divIcon({
    className: `leaflet-activity-pin ${selected ? 'selected' : ''}`,
    html: `<span class="pin-body" data-category="${categoryKey(category)}"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })

const meIcon = L.divIcon({
  className: 'leaflet-me-pin',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

/** Keeps every pin in view whenever the set of activities changes. */
function FitToActivities({ points }) {
  const map = useMap()
  React.useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 14)
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 })
  }, [points, map])
  return null
}

function FlyToMe({ target }) {
  const map = useMap()
  React.useEffect(() => {
    if (target) map.setView(target, 15)
  }, [target, map])
  return null
}

export default function MapPage() {
  const { filteredActivities } = useApp()
  const { user } = useAuth()
  const { request, busy } = useDeviceLocation()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(null)
  const [flyTarget, setFlyTarget] = useState(null)

  const located = useMemo(
    () => filteredActivities.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng)),
    [filteredActivities],
  )

  const points = useMemo(() => located.map((a) => [a.lat, a.lng]), [located])

  const selectedActivity = useMemo(
    // The selected pin can be filtered out from under us, so fall back rather
    // than keep showing a card for something no longer on the map.
    () => located.find((activity) => activity.id === selectedId) || null,
    [located, selectedId],
  )

  const showMe = async () => {
    if (user.location) {
      setFlyTarget([user.location.lat, user.location.lng])
      return
    }
    const granted = await request()
    if (granted) setFlyTarget(null)
  }

  return (
    <div className="smart-map-page">
      <div className="smart-map">
        <MapContainer
          center={user.location ? [user.location.lat, user.location.lng] : BANGKOK}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {located.map((activity) => (
            <Marker
              key={activity.id}
              position={[activity.lat, activity.lng]}
              icon={markerIcon(activity.category, selectedId === activity.id)}
              eventHandlers={{ click: () => setSelectedId(activity.id) }}
            />
          ))}
          {user.location && (
            <Marker position={[user.location.lat, user.location.lng]} icon={meIcon} />
          )}
          <FitToActivities points={points} />
          <FlyToMe target={flyTarget} />
        </MapContainer>

        <button
          className="map-round-button map-search-button"
          onClick={() => navigate('/search')}
          aria-label="Search activities"
        >
          <Search size={19} />
        </button>
        <button
          className="map-round-button map-location-button"
          onClick={showMe}
          disabled={busy}
          aria-label="Show my location"
        >
          <LocateFixed size={19} />
        </button>
        <button
          className="map-round-button map-list-button"
          onClick={() => navigate('/recommendations')}
          aria-label="See activities as a list"
        >
          <List size={19} />
        </button>

        {selectedActivity && (
          <button
            className="map-activity-preview"
            data-category={categoryKey(selectedActivity.category)}
            onClick={() => navigate(`/activity/${selectedActivity.id}`)}
          >
            <div className="preview-icon">
              <CategoryIcon category={selectedActivity.category} size={18} />
            </div>
            <div className="preview-copy">
              <span className="preview-match">{selectedActivity.matchScore}% match</span>
              <strong>{selectedActivity.title}</strong>
              <small>
                {selectedActivity.distanceKm != null
                  ? `${formatDistance(selectedActivity.distanceKm)} away`
                  : selectedActivity.locationName}
              </small>
            </div>
            <ChevronRight size={18} />
          </button>
        )}

        {located.length === 0 && (
          <div className="map-empty">
            <FiltersEmptyState body="No activities match your filters, so the map has nothing to show." />
          </div>
        )}
      </div>
    </div>
  )
}
