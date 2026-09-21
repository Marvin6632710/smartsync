import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GoogleMarker, useGoogleMap, useGoogleMapEvents } from './GoogleMap'
import { emojiFor } from '../data/categories'
import { categoryKey, fitMapPoints, moveMap, projectPoint, unprojectPoint } from '../utils/maps'

const CLUSTER_RADIUS_PX = 46
const CLUSTER_MAX_ZOOM = 16

/** Group overlapping screen positions; keep the current map view on rerenders. */
function useClusters(activities) {
  const { map, api } = useGoogleMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  const [projection, setProjection] = useState(() => map.getProjection())
  useGoogleMapEvents({
    zoom_changed: () => setZoom(map.getZoom()),
    projection_changed: () => setProjection(map.getProjection()),
  })
  return useMemo(() => {
    // Projection arrives asynchronously. Individual pins remain available
    // until Google can supply the pixels used for grouping.
    if (!projection)
      return activities.map((activity) => ({
        id: activity.id,
        items: [activity],
        position: [activity.lat, activity.lng],
      }))
    const groups = []
    for (const activity of activities) {
      const point = projectPoint(map, api, activity, zoom)
      const near = groups.find(
        (group) => Math.hypot(group.point.x - point.x, group.point.y - point.y) < CLUSTER_RADIUS_PX,
      )
      if (near) {
        near.items.push(activity)
        near.point = {
          x: (near.point.x * (near.items.length - 1) + point.x) / near.items.length,
          y: (near.point.y * (near.items.length - 1) + point.y) / near.items.length,
        }
      } else groups.push({ point, items: [activity] })
    }
    return groups.map((group) => ({
      id: group.items.map((activity) => activity.id).join('|'),
      items: group.items,
      position: unprojectPoint(map, api, group.point, zoom),
    }))
  }, [activities, map, api, zoom, projection])
}

function Pin({ category, selected, count }) {
  const key = categoryKey(category)
  return (
    <span className={`map-activity-pin ${selected ? 'selected' : ''} ${count ? 'cluster' : ''}`}>
      <span className="pin-body" data-category={key}>
        <i>{count || emojiFor(key)}</i>
      </span>
    </span>
  )
}

export default function ActivityMapPins({ activities, selectedId, onSelect }) {
  const { t } = useTranslation()
  const { map, api } = useGoogleMap()
  const clusters = useClusters(activities)
  return clusters.map((cluster) => {
    if (cluster.items.length === 1) {
      const activity = cluster.items[0]
      return (
        <GoogleMarker
          key={activity.id}
          position={activity}
          title={activity.title}
          selected={selectedId === activity.id}
          onClick={() => onSelect(activity.id)}
        >
          <Pin category={activity.category} selected={selectedId === activity.id} />
        </GoogleMarker>
      )
    }
    const counts = new Map()
    for (const item of cluster.items) {
      const key = categoryKey(item.category)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const spread = cluster.items.map((activity) =>
      projectPoint(map, api, activity, CLUSTER_MAX_ZOOM),
    )
    const separable = spread.some((point, i) =>
      spread.some(
        (other, j) =>
          j > i && Math.hypot(point.x - other.x, point.y - other.y) >= CLUSTER_RADIUS_PX,
      ),
    )
    const selected = cluster.items.some((activity) => activity.id === selectedId)
    return (
      <GoogleMarker
        key={cluster.id}
        position={cluster.position}
        title={t('map.listCount', { count: cluster.items.length })}
        selected={selected}
        onClick={() => {
          if (separable) {
            fitMapPoints(map, api, cluster.items, { padding: 64, maxZoom: CLUSTER_MAX_ZOOM })
          } else {
            // Activities in the same building never separate at any useful
            // zoom. Cycle them so every activity can still be opened.
            const at = cluster.items.findIndex((activity) => activity.id === selectedId)
            onSelect(cluster.items[(at + 1) % cluster.items.length].id)
          }
        }}
      >
        <Pin category={dominant} selected={selected} count={cluster.items.length} />
      </GoogleMarker>
    )
  })
}

export function FitToActivities({ points }) {
  const { map, api } = useGoogleMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      moveMap(map, points[0], 14)
      return
    }
    return fitMapPoints(map, api, points)
  }, [points, map, api])
  return null
}

export function FlyTo({ target, zoom = 15, atLeast = false }) {
  const { map } = useGoogleMap()
  useEffect(() => {
    if (target) moveMap(map, target, atLeast ? Math.max(map.getZoom(), zoom) : zoom)
  }, [target, zoom, atLeast, map])
  return null
}
