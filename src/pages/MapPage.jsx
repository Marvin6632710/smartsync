import React, { useMemo, useState } from 'react'
import { ChevronRight, List, LocateFixed, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import CategoryIcon from '../components/CategoryIcon'
import { categories, emojiFor } from '../data/categories'
import { MIN_ZOOM, THAILAND_BOUNDS, THAILAND_CENTRE } from '../data/region'
import FiltersEmptyState from '../components/FiltersEmptyState'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { formatDistance } from '../utils/geo'

const BANGKOK = [13.7563, 100.5018]

const KNOWN_CATEGORIES = new Set(categories.map((c) => c.toLowerCase()))

/**
 * Normalises a category for use as a CSS hook.
 *
 * Leaflet builds markers from an HTML *string*, which it inserts with
 * innerHTML — so anything interpolated into it is executed as markup, not
 * escaped as text the way JSX would. A category is attacker-controlled (a
 * host can write any string to it), and `" onmouseover=alert(1) x="` fits
 * inside the length the rules allow. Whitelisting against the fixed
 * vocabulary means no attacker-controlled character can reach that string at
 * all, which is a stronger guarantee than escaping correctly every time.
 */
const categoryKey = (value) => {
  const key = String(value || '').toLowerCase()
  return KNOWN_CATEGORIES.has(key) ? key : 'other'
}

/**
 * A pin carrying the activity's emoji.
 *
 * Styled by our own CSS rather than Leaflet's bundled PNG, which bundlers
 * break, and which could not carry the per-category colour anyway.
 *
 * Both interpolations are safe by construction, and neither is safe by
 * escaping. `categoryKey` whitelists against the fixed vocabulary, and the
 * emoji is looked up from a fixed table keyed by that same whitelisted value
 * — so no character an attacker chose can reach this string, whatever they
 * managed to write into the category field. That is the same guarantee the
 * original XSS fix established, extended to the new content rather than
 * quietly weakened by it.
 */
const markerIcon = (category, selected) => {
  const key = categoryKey(category)
  return L.divIcon({
    className: `leaflet-activity-pin ${selected ? 'selected' : ''}`,
    html: `<span class="pin-body" data-category="${key}"><i>${emojiFor(key)}</i></span>`,
    // Tall enough for the emoji to read, and anchored at the point of the
    // teardrop rather than its middle, so the pin indicates the place it sits
    // on instead of hovering above it.
    iconSize: [36, 44],
    iconAnchor: [18, 44],
  })
}

const meIcon = L.divIcon({
  className: 'leaflet-me-pin',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

/**
 * A pin standing for several activities that would otherwise sit on top of
 * each other.
 *
 * Same construction rules as the single pin: the only thing interpolated is a
 * number we computed and a whitelisted category key.
 */
const clusterIcon = (count, key, selected) =>
  L.divIcon({
    className: `leaflet-activity-pin cluster ${selected ? 'selected' : ''}`,
    html: `<span class="pin-body" data-category="${key}"><i>${count}</i></span>`,
    iconSize: [40, 48],
    iconAnchor: [20, 48],
  })

/** How close two pins have to be, on screen, before they become one. */
const CLUSTER_RADIUS_PX = 46

/**
 * The deepest a cluster tap will zoom.
 *
 * Past this you are looking at individual buildings, which is further than is
 * useful for choosing where to go, and the tiles start to run out.
 */
const CLUSTER_MAX_ZOOM = 16

/**
 * Groups activities whose pins would overlap at the zoom you are looking at.
 *
 * Seven activities in central Bangkok drew seven teardrops on top of one
 * another, which is worse than the dots were: a bigger pin hides more. The
 * point of putting an emoji on the map was to let somebody choose at a glance,
 * and a pile does the opposite.
 *
 * Done here rather than with a clustering library, for the same reason the
 * project chose Leaflet over Google Maps: the dependency buys default blue
 * circles that would have to be restyled anyway, and the grouping itself is a
 * greedy pass over a few dozen points. It re-runs on zoom because "would
 * overlap" is a question about pixels, not about degrees — two activities a
 * kilometre apart collide at zoom 11 and are comfortably separate at 15.
 */
function useClusters(activities, radiusPx = CLUSTER_RADIUS_PX) {
  const map = useMap()
  const [zoom, setZoom] = React.useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })

  return React.useMemo(() => {
    const groups = []
    for (const activity of activities) {
      const point = map.project([activity.lat, activity.lng], zoom)
      const near = groups.find(
        (group) => Math.hypot(group.point.x - point.x, group.point.y - point.y) < radiusPx,
      )
      if (near) {
        near.items.push(activity)
        // Recentre on the running mean, so a group of five is marked in the
        // middle of the five rather than wherever the first one happened to be.
        near.point = {
          x: (near.point.x * (near.items.length - 1) + point.x) / near.items.length,
          y: (near.point.y * (near.items.length - 1) + point.y) / near.items.length,
        }
      } else {
        groups.push({ point, items: [activity] })
      }
    }
    return groups.map((group) => {
      const centre = map.unproject([group.point.x, group.point.y], zoom)
      return {
        id: group.items.map((a) => a.id).join('|'),
        items: group.items,
        position: [centre.lat, centre.lng],
      }
    })
  }, [activities, map, zoom, radiusPx])
}

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

/**
 * Every pin on the map, grouped so none of them hides another.
 *
 * Lives inside MapContainer because `useMap` — and so the pixel projection the
 * grouping depends on — is only available to a descendant.
 */
function ActivityPins({ activities, selectedId, onSelect }) {
  const map = useMap()
  const clusters = useClusters(activities)

  return clusters.map((cluster) => {
    if (cluster.items.length === 1) {
      const activity = cluster.items[0]
      return (
        <Marker
          key={activity.id}
          position={[activity.lat, activity.lng]}
          icon={markerIcon(activity.category, selectedId === activity.id)}
          eventHandlers={{ click: () => onSelect(activity.id) }}
        />
      )
    }

    // A group takes the colour of whatever it holds most of, which turns out
    // to be information rather than decoration: a cluster of five coffees
    // reads brown, and you can tell what a part of the city is for before you
    // have zoomed into it.
    const counts = new Map()
    for (const item of cluster.items) {
      const key = categoryKey(item.category)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]

    // Would zooming all the way in actually pull these apart? Two activities
    // in the same building stay inside the cluster radius at every zoom, so
    // for them the usual "tap to zoom in" does nothing at all and the group
    // becomes a pin that cannot be opened — the one thing on the map you
    // cannot reach. Checking first costs a projection per pin and lets the
    // other branch exist.
    const spread = cluster.items.map((a) => map.project([a.lat, a.lng], CLUSTER_MAX_ZOOM))
    const separable = spread.some((p, i) =>
      spread.some((q, j) => j > i && Math.hypot(p.x - q.x, p.y - q.y) >= CLUSTER_RADIUS_PX),
    )
    const holdsSelection = cluster.items.some((a) => a.id === selectedId)

    return (
      <Marker
        key={cluster.id}
        position={cluster.position}
        icon={clusterIcon(cluster.items.length, dominant, holdsSelection)}
        eventHandlers={{
          click: () => {
            if (separable) {
              // Zoom to the group rather than picking one of them arbitrarily.
              // Padding so the pins land inside the visible map, not under the
              // search button or the card that slides up.
              map.fitBounds(L.latLngBounds(cluster.items.map((a) => [a.lat, a.lng])).pad(0.35), {
                maxZoom: CLUSTER_MAX_ZOOM,
              })
              return
            }
            // Nothing to be gained by zooming, so step through what is here
            // instead: each tap shows the next one's card, and every activity
            // stays reachable.
            const at = cluster.items.findIndex((a) => a.id === selectedId)
            onSelect(cluster.items[(at + 1) % cluster.items.length].id)
          },
        }}
      />
    )
  })
}

function FlyToMe({ target }) {
  const map = useMap()
  React.useEffect(() => {
    if (target) map.setView(target, 15)
  }, [target, map])
  return null
}

export default function MapPage() {
  const { filteredActivities, loading } = useApp()
  const { user } = useAuth()
  const { request, busy } = useDeviceLocation()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(null)
  const [flyTarget, setFlyTarget] = useState(null)

  const located = useMemo(
    () => filteredActivities.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng)),
    [filteredActivities],
  )

  // Keyed on the coordinates, not the array. `filteredActivities` is rebuilt
  // every minute by the clock that decides what has started, and on every
  // snapshot, so `points` was a new array each time and the map re-fitted to
  // it — snapping the view back while somebody was panning around the city.
  // The view now moves only when the set of places on it actually changes.
  const pointsKey = useMemo(() => located.map((a) => `${a.lat},${a.lng}`).join('|'), [located])
  const points = useMemo(
    () => (pointsKey ? pointsKey.split('|').map((pair) => pair.split(',').map(Number)) : []),
    [pointsKey],
  )

  const mapCentre = useMemo(() => {
    if (user.location) return [user.location.lat, user.location.lng]
    if (located.length) return BANGKOK
    return THAILAND_CENTRE
  }, [user.location, located.length])

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
          // Where to look before anything else decides. Your own position if
          // you have shared it; otherwise the country as a whole when there is
          // nothing to show, because opening on Bangkok when the only activity
          // is in Chiang Mai points the map at the wrong place. With pins,
          // FitToActivities takes over on the next frame regardless.
          center={mapCentre}
          zoom={located.length || user.location ? 12 : MIN_ZOOM + 1}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          // The app is for meeting people in Thailand, so the map does not go
          // anywhere else. Viscosity 1 makes the edge a wall rather than a
          // rubber band, and the minimum zoom matters just as much as the
          // bounds: clamping the pan alone only means you leave the country by
          // pinching out instead of dragging.
          maxBounds={THAILAND_BOUNDS}
          maxBoundsViscosity={1}
          minZoom={MIN_ZOOM}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            // Tiles are fetched only for the box, so the map literally
            // contains Thailand and nothing else: at the minimum zoom the
            // country sits on the backdrop colour instead of trailing off
            // into Malaysia and Yunnan. It is also fewer tiles to fetch.
            bounds={THAILAND_BOUNDS}
            // Without this the world repeats sideways at low zoom and you get
            // a second Thailand at the edge of the screen.
            noWrap
          />
          <ActivityPins activities={located} selectedId={selectedId} onSelect={setSelectedId} />
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

        {!loading && located.length === 0 && (
          <div className="map-empty">
            <FiltersEmptyState body="No activities match your filters, so the map has nothing to show." />
          </div>
        )}
      </div>
    </div>
  )
}
