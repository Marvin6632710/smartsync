import { categories } from '../data/categories'

const knownCategories = new Set(categories.map((category) => category.toLowerCase()))
export const categoryKey = (value) => {
  const key = String(value || '').toLowerCase()
  return knownCategories.has(key) ? key : 'other'
}

/** Coordinate data stays provider-independent in Firestore. */
export const mapPoint = (point) =>
  Array.isArray(point) ? { lat: point[0], lng: point[1] } : { lat: point.lat, lng: point.lng }

export function moveMap(map, point, zoom) {
  map.setCenter(mapPoint(point))
  if (zoom !== undefined) map.setZoom(zoom)
}

/** Google caps fitBounds after its camera settles, rather than as an option. */
export function fitMapPoints(map, api, points, { padding = 48, maxZoom = 15 } = {}) {
  const bounds = new api.LatLngBounds()
  points.forEach((point) => bounds.extend(mapPoint(point)))
  const settled = api.event.addListenerOnce(map, 'idle', () => {
    if (map.getZoom() > maxZoom) map.setZoom(maxZoom)
  })
  map.fitBounds(bounds, padding)
  return () => settled.remove()
}

export function projectPoint(map, api, point, zoom) {
  const projection = map.getProjection()
  if (!projection) return null
  const world = projection.fromLatLngToPoint(new api.LatLng(mapPoint(point)))
  const scale = 2 ** zoom
  return { x: world.x * scale, y: world.y * scale }
}

export function unprojectPoint(map, api, point, zoom) {
  const scale = 2 ** zoom
  const coordinate = map
    .getProjection()
    .fromPointToLatLng(new api.Point(point.x / scale, point.y / scale))
  return [coordinate.lat(), coordinate.lng()]
}
