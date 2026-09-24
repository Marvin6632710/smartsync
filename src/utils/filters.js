/**
 * The discovery filters: what the feed, the search and the map all narrow
 * by. They are a per-device view preference (see AppContext), kept in
 * localStorage, and this file is the one place that knows their shape.
 *
 * Categories and time bands are sets, and an empty set is "no restriction"
 * — all categories, any time — rather than "nothing". Within a set an
 * activity has to match any one member; between the groups it has to
 * satisfy every one. So football or basketball, in the morning or evening,
 * within ten kilometres, with a spot left.
 */
import { categories, timeBands } from '../data/categories'

// Fifteen was too short for a city this size: an activity across Bangkok
// is simply further than that, and somebody who would happily travel for
// the right thing had no way to say so — the slider stopped before the
// answer. Thirty is the ceiling now. The clamp in `storedDistance` reads
// this, so a stored choice from the old range is still valid and nobody's
// saved filter changes meaning when the maximum moves.
export const DISTANCE_RANGE = { min: 1, max: 30 }

// Single source of truth — used as the initial state, by every reset, and
// as the yardstick for "is anything narrowing the feed".
export const defaultFilters = {
  categories: [],
  maxDistance: 20,
  timeBands: [],
  availableOnly: true,
}

/**
 * What `maxDistance` defaulted to before 2026-09-24, and why it is still
 * written down.
 *
 * The filters are saved to localStorage by an effect that runs on mount,
 * so every device that has ever opened SmartSync already has a number
 * stored — including the ones that never touched the slider. Raising the
 * default alone would therefore have reached nobody who had used the app
 * before, which is everybody who reported activities going missing.
 *
 * So a stored ten is read as "never chose one" and becomes the new
 * default. This cannot hide anything: the only direction it moves is
 * wider. It does override somebody who deliberately picked ten, which is
 * the cost, and it is worth it because ten was the default for long
 * enough that almost every ten on a device is one nobody chose.
 */
const PREVIOUS_DEFAULT_DISTANCE = 10

/**
 * The members of `chosen` that are in `vocabulary`, once each, in the
 * vocabulary's order — so two sets with the same members compare equal
 * however they were picked, and a category since dropped from the list
 * cannot linger in a stored filter.
 */
function knownOnly(chosen, vocabulary) {
  if (!Array.isArray(chosen)) return []
  return vocabulary.filter((item) => chosen.includes(item))
}

/**
 * Whichever shape the group was stored in: a set under `setKey`, or — from
 * before 2026-09-21 — one choice under `singleKey`, where 'All' and 'Any'
 * stood for no restriction. Those two words are not in either vocabulary,
 * so `knownOnly` turns them into the empty set, which means the same thing.
 */
function storedSet(source, setKey, singleKey) {
  if (Array.isArray(source[setKey])) return source[setKey]
  if (typeof source[singleKey] === 'string') return [source[singleKey]]
  return []
}

function storedDistance(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return defaultFilters.maxDistance
  if (number === PREVIOUS_DEFAULT_DISTANCE) return defaultFilters.maxDistance
  return Math.min(DISTANCE_RANGE.max, Math.max(DISTANCE_RANGE.min, Math.round(number)))
}

/**
 * The stored filters in the current shape, whatever version wrote them.
 *
 * Field by field: a value that is missing or unrecognised falls back to
 * that field's default alone, so one stale field does not cost the others.
 * The storage schema version was deliberately not bumped for the move to
 * sets — a bump wipes every `smartsync:` key, and a saved single choice is
 * worth keeping as a set of one.
 */
export function normaliseFilters(stored) {
  const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  return {
    categories: knownOnly(storedSet(source, 'categories', 'category'), categories),
    maxDistance: storedDistance(source.maxDistance),
    timeBands: knownOnly(storedSet(source, 'timeBands', 'timeBand'), timeBands),
    availableOnly:
      typeof source.availableOnly === 'boolean'
        ? source.availableOnly
        : defaultFilters.availableOnly,
  }
}

/**
 * `chosen` with `value` added or removed, kept in the vocabulary's order.
 */
export function toggleChoice(chosen, value, vocabulary) {
  const set = new Set(knownOnly(chosen, vocabulary))
  if (set.has(value)) set.delete(value)
  else set.add(value)
  return vocabulary.filter((item) => set.has(item))
}

/**
 * Does this activity pass the filters? OR within a group, AND between them.
 */
export function matchesFilters(activity, filters) {
  if (filters.categories.length > 0 && !filters.categories.includes(activity.category)) return false
  // An unknown distance is never filtered out — hiding everything until
  // the user grants location would make the app look broken.
  if (
    Number.isFinite(activity.distanceKm) &&
    activity.distanceKm > Number(filters.maxDistance || 999)
  )
    return false
  if (filters.timeBands.length > 0 && !filters.timeBands.includes(activity.timeBand)) return false
  if (filters.availableOnly && activity.participants >= activity.capacity) return false
  return true
}

/**
 * How many choices are narrowing the feed beyond the defaults: each chosen
 * category and time band counts one, and the distance and the availability
 * switch count one each when moved off their defaults. Zero means the feed
 * is exactly what a fresh install shows.
 */
export function activeFilterCount(filters) {
  return (
    filters.categories.length +
    filters.timeBands.length +
    (filters.maxDistance !== defaultFilters.maxDistance ? 1 : 0) +
    (filters.availableOnly !== defaultFilters.availableOnly ? 1 : 0)
  )
}

export const filtersActive = (filters) => activeFilterCount(filters) > 0
