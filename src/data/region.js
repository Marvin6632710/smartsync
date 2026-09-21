/**
 * Where SmartSync operates.
 *
 * The app is for meeting people in Thailand, so the map does not let you leave
 * it and the database does not accept an activity outside it. Both read these
 * numbers, and so do the rules — kept in one place because a map that shows
 * one area while the database accepts another is how you end up with
 * activities nobody can find.
 *
 * **This is a rectangle, not a border.** Thailand's outline is a complicated
 * shape and a box around it necessarily takes in slivers of Myanmar, Laos,
 * Cambodia and Malaysia — Vientiane sits inside it. That is an accepted
 * limitation, not an oversight: the purpose is to keep the map on the country
 * and to reject an activity pinned in the Atlantic, and a rectangle does both.
 * Enforcing the actual border would need a polygon and point-in-polygon tests
 * the security rules cannot express.
 *
 * The extremes it contains, with a little margin for GPS drift at the edges:
 *   north  20.46°N  Mae Sai, Chiang Rai
 *   south   5.61°N  Betong, Yala
 *   west   97.34°E  Mae Hong Son
 *   east  105.64°E  Ubon Ratchathani
 */
export const THAILAND = {
  south: 5.5,
  west: 97.2,
  north: 20.6,
  east: 105.7,
}

/** Google's LatLngBoundsLiteral uses the same named edges as the rules. */
export const THAILAND_BOUNDS = THAILAND

/** Roughly the middle of the country, for a map with nothing else to show. */
export const THAILAND_CENTRE = [15.0, 101.5]

/**
 * The zoom at which the whole country fits a phone screen.
 *
 * Below this you would be looking at Malaysia and southern China, which is the
 * thing the bounds exist to prevent — clamping the pan but not the zoom just
 * means you leave the country by pinching instead of dragging.
 */
export const MIN_ZOOM = 5

export const withinThailand = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= THAILAND.south &&
  lat <= THAILAND.north &&
  lng >= THAILAND.west &&
  lng <= THAILAND.east
