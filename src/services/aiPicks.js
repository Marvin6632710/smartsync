/**
 * AI Picks, the browser's half.
 *
 * The Function ranks; this decides what it is given and what to make of
 * what comes back. What it is given is deliberately thin: the person's
 * interests, the categories they have joined and how often, their
 * preferred time of day, whether distance is known, the names of places
 * they have joined activities at — and, per activity, the facts that
 * bear on fit, the place's name among them (ADR-031). No name, no email,
 * no host, no coordinates, no message. What comes back is a list of ids with
 * reason codes, and both are checked again here against the activities
 * on screen before anything is rendered: an id that has since dropped
 * out of the eligible set is not shown, and a reason is worded from the
 * activity's own data, never from text the model wrote.
 */
import { categories, timeBands } from '../data/categories'

export const CANDIDATE_CAP = 40
export const PICK_CAP = 8
const MAX_DESCRIPTION = 240
const MAX_PLACE = 60
const MAX_PLACES = 12
const DAY_MS = 86_400_000

const key = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

/** The categories in `list` that the app knows, once each, in list order. */
function knownCategories(list) {
  const out = []
  for (const item of Array.isArray(list) ? list : []) {
    const match = categories.find((c) => key(c) === key(item))
    if (match && !out.includes(match)) out.push(match)
  }
  return out
}

/** A place's name as the host wrote it, tidied and cut to length. */
const placeName = (activity) =>
  String(activity?.locationName || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PLACE)

/**
 * The names of the places the person has joined activities at, once each
 * whatever the casing, in the order of the joined list (next first, then
 * most recent). Names, never coordinates: the venue as its host wrote
 * it, which is what a person would recognise.
 */
export function placesBefore(joinedActivities = []) {
  const out = []
  for (const activity of Array.isArray(joinedActivities) ? joinedActivities : []) {
    const place = placeName(activity)
    if (place && !out.some((seen) => key(seen) === key(place))) out.push(place)
    if (out.length === MAX_PLACES) break
  }
  return out
}

/** Whether a stored position is usable: two finite numbers. */
export const hasUsableLocation = (location) =>
  Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng))

/**
 * The person, as signals. `history` merges what the profile remembers
 * (every category ever joined, without counts) with what the app can see
 * now (the joined list, with counts), so "joined Running four times" is
 * said when it is known and "joined Running" when only that is.
 */
export function signalsOf(user, joinedActivities = []) {
  const counts = new Map()
  for (const activity of Array.isArray(joinedActivities) ? joinedActivities : []) {
    const [category] = knownCategories([activity?.category])
    if (category) counts.set(category, (counts.get(category) || 0) + 1)
  }
  for (const category of knownCategories(user?.historyCategories)) {
    if (!counts.has(category)) counts.set(category, 1)
  }
  const history = [...counts.entries()]
    .map(([category, joined]) => ({ category, joined }))
    .sort((a, b) => b.joined - a.joined || a.category.localeCompare(b.category))
    .slice(0, 12)
  return {
    interests: knownCategories(user?.interests).slice(0, 12),
    preferredTime: timeBands.includes(user?.preferredTime) ? user.preferredTime : '',
    history,
    hasLocation: hasUsableLocation(user?.location),
    placesBefore: placesBefore(joinedActivities),
  }
}

/** One activity, as the facts the model may see. */
export function candidateOf(activity, now = Date.now()) {
  const startsAt = Number(activity?.startsAt)
  // Not `Number(...)`: an unknown distance is null, and Number(null) is 0,
  // which would put every activity on top of the person.
  const distance = activity?.distanceKm
  const capacity = Math.max(1, Math.round(Number(activity?.capacity) || 1))
  const participants = Math.max(0, Math.round(Number(activity?.participants) || 0))
  return {
    id: String(activity.id),
    title: String(activity.title || '').slice(0, 80),
    category: String(activity.category || ''),
    timeBand: timeBands.includes(activity?.timeBand) ? activity.timeBand : '',
    daysAhead: Number.isFinite(startsAt) ? Math.max(0, Math.floor((startsAt - now) / DAY_MS)) : 0,
    distanceKm: Number.isFinite(distance) ? Math.round(distance * 10) / 10 : null,
    capacity,
    participants: Math.min(participants, 10_000),
    similar: activity?.similarUsersJoined === true,
    place: placeName(activity),
    description: String(activity?.description || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DESCRIPTION),
  }
}

/** Soonest first, anything without a start time last; the input untouched. */
export function soonestFirst(activities) {
  const at = (a) => (Number.isFinite(a?.startsAt) ? a.startsAt : Number.POSITIVE_INFINITY)
  return (Array.isArray(activities) ? activities : []).slice().sort((a, b) => at(a) - at(b))
}

/**
 * The activities worth sending: the eligible ones, soonest first, up to
 * the cap. Nothing ranks them before the model does — the cap is there
 * so a very full feed cannot run up the bill, and when it bites, what is
 * nearest in time is the least arbitrary forty to keep.
 */
export function chooseCandidates(activities) {
  return soonestFirst(activities)
    .filter((a) => a && a.id && a.title && a.category)
    .slice(0, CANDIDATE_CAP)
}

export function buildPicksRequest({ user, activities, joinedActivities, now = Date.now(), force }) {
  const chosen = chooseCandidates(activities)
  return {
    signals: signalsOf(user, joinedActivities),
    candidates: chosen.map((a) => candidateOf(a, now)),
    ...(force ? { force: true } : {}),
  }
}

/**
 * What a cached answer is good for — the same signals and the same set
 * of activities. Order-free, so the feed re-sorting itself is not a
 * change, and free of the facts that drift minute by minute.
 */
export function picksSignature(request) {
  const { signals, candidates } = request
  return JSON.stringify({
    i: [...signals.interests].sort(),
    t: signals.preferredTime,
    h: [...signals.history].sort((a, b) => a.category.localeCompare(b.category)),
    l: signals.hasLocation,
    p: [...signals.placesBefore].sort(),
    c: candidates.map((c) => c.id).sort(),
  })
}

/**
 * A reason code, as the facts the wording needs: a key and the value
 * the sentence carries, so `reasonText` can word it in every language.
 */
export function reasonFacts(code, activity) {
  switch (code) {
    case 'interest':
      return { key: 'interest', category: activity.category }
    case 'time':
      return { key: 'time', band: activity.timeBand }
    case 'distance':
      return Number.isFinite(activity.distanceKm)
        ? { key: 'distance', distanceKm: activity.distanceKm }
        : null
    case 'spots':
      return {
        key: 'spots',
        count: Math.max(0, (Number(activity.capacity) || 0) - (Number(activity.participants) || 0)),
      }
    case 'place': {
      const place = placeName(activity)
      return place ? { key: 'place', place } : null
    }
    case 'history':
    case 'behavior':
    case 'popularity':
    case 'soon':
      return { key: code }
    default:
      return null
  }
}

/**
 * The model's picks joined back to the activities on screen. An id the
 * screen no longer has (left the eligible set since the request) is
 * dropped, and so is any reason the activity's own data does not support;
 * a pick may end up with no reasons at all, which is shown as none.
 */
export function resolvePicks(picks, activities) {
  const byId = new Map((Array.isArray(activities) ? activities : []).map((a) => [String(a.id), a]))
  const seen = new Set()
  const out = []
  for (const pick of Array.isArray(picks) ? picks : []) {
    const activity = byId.get(String(pick?.id))
    if (!activity || seen.has(activity.id)) continue
    seen.add(activity.id)
    const reasons = (Array.isArray(pick.reasons) ? pick.reasons : [])
      .map((code) => reasonFacts(code, activity))
      .filter(Boolean)
    out.push({ activity, reasons })
    if (out.length === PICK_CAP) break
  }
  return out
}

/**
 * When the model has no answer, nothing ranks: what a person sees instead
 * is what is coming up soonest, said to be exactly that.
 */
export function unrankedPicks(activities) {
  return chooseCandidates(activities).slice(0, PICK_CAP)
}

/**
 * What would make the picks better, for someone the app knows little
 * about — said as things they can do, in the order they matter.
 */
export function improveHints(signals, { interestCount = 0 } = {}) {
  const hints = []
  if (signals.history.length === 0) hints.push('join')
  if (interestCount < 5) hints.push('interests')
  if (!signals.preferredTime) hints.push('time')
  if (!signals.hasLocation) hints.push('location')
  return hints
}

/** Little history: nothing joined yet, or nothing beyond the bare minimum told. */
export const thinProfile = (signals) =>
  signals.history.length === 0 || (!signals.preferredTime && !signals.hasLocation)
