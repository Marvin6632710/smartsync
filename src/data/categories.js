/**
 * The fixed set of activity categories.
 *
 * These are a controlled vocabulary, not user data: AI Picks compares a
 * user's interests against an activity's category by exact match, so both
 * sides have to be drawn from the same list. Everything else that
 * used to live in mockData.js — fake users, fake activities, a hardcoded
 * "me" — is now real data in Firestore.
 */
export const categories = [
  'Football',
  'Basketball',
  'Running',
  'Gym',
  'Study',
  'Coffee',
  'Gaming',
  'Hangouts',
  'Cycling',
  'Movies',
  'Food',
  'Events',
]

export const timeBands = ['Morning', 'Afternoon', 'Evening']

/**
 * How many interests someone must pick.
 *
 * Enforced in two places — first-run setup and the profile editor — and they
 * have to agree: a lower bar in one lets someone leave AI Picks with less
 * to rank on than the other insisted upon.
 */
export const MIN_INTERESTS = 3

/**
 * One emoji per category, for the map.
 *
 * A coloured dot tells you an activity is there; it does not tell you what it
 * is without a legend nobody reads. An emoji is legible at sixteen pixels, in
 * any language, and needs no key — which is the whole point of a map you are
 * meant to choose from at a glance.
 *
 * Chosen for how they read *small*. Several obvious candidates carry a
 * variation selector (U+FE0F) and fall back to a flat monochrome glyph on
 * some platforms — which is why Gym is a bicep rather than a weightlifter and
 * Events is a ticket rather than a ticket-stub-with-selector.
 *
 * Keyed by the lowercased category, and every value here is a literal. Map
 * markers render these through React into Google Advanced Markers; category
 * names are also checked against the fixed vocabulary before becoming CSS hooks.
 */
export const categoryEmoji = {
  football: '\u26bd',
  basketball: '\ud83c\udfc0',
  running: '\ud83c\udfc3',
  gym: '\ud83d\udcaa',
  study: '\ud83d\udcda',
  coffee: '\u2615',
  gaming: '\ud83c\udfae',
  hangouts: '\ud83d\udc4b',
  cycling: '\ud83d\udeb2',
  movies: '\ud83c\udfac',
  food: '\ud83c\udf5c',
  events: '\ud83c\udfab',
}

/** Anything unrecognised still gets a pin, just a generic one. */
export const emojiFor = (category) =>
  categoryEmoji[String(category || '').toLowerCase()] || '\ud83d\udccd'
