const EARTH_RADIUS_KM = 6371

const toRadians = (degrees) => (degrees * Math.PI) / 180

/**
 * Great-circle distance between two coordinates, in kilometres.
 *
 * Replaces the hand-typed `distanceKm` field the prototype used. Distance is
 * now derived from where the user actually is and where the activity actually
 * is, which is what makes the 20% distance weight in the recommendation score
 * mean something.
 *
 * Returns null when either point is unknown, so callers can distinguish
 * "no location yet" from "zero kilometres away" — a distinction the scorer
 * cares about.
 */
export function distanceBetween(from, to) {
  if (!Number.isFinite(from?.lat) || !Number.isFinite(from?.lng)) return null
  if (!Number.isFinite(to?.lat) || !Number.isFinite(to?.lng)) return null

  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)

  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Coarsens a coordinate to roughly a 1 km grid.
 *
 * Used when the user has "approximate location" enabled: their exact position
 * never leaves the device, only the rounded one is stored. Two decimal places
 * is about 1.1 km of latitude, which is enough to rank nearby activities
 * without pinpointing someone's home.
 */
export function coarsen(point) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return null
  return {
    lat: Math.round(point.lat * 100) / 100,
    lng: Math.round(point.lng * 100) / 100,
  }
}

/** Human-friendly distance: "450 m", "2.4 km", "12 km". */
export function formatDistance(km) {
  if (km === null || km === undefined || !Number.isFinite(km)) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

/**
 * Browser geolocation as a promise, with an explicit timeout.
 *
 * The permission prompt is the browser's own, so this both asks for and reads
 * the position; a rejection here means the user declined or the device could
 * not get a fix, and callers fall back to ranking without distance.
 */
export function getCurrentPosition({ timeout = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser does not support location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60_000 },
    )
  })
}
