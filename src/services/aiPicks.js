/**
 * AI Picks, the browser's half.
 *
 * The Function ranks; this decides what it is given and what to make of
 * what comes back. What it is given is deliberately thin: the person's
 * interests, the categories they have joined and how often, their
 * preferred time of day, whether distance is known — and, per activity,
 * the facts that bear on fit. No name, no email, no host, no place name,
 * no coordinates, no message. What comes back is a list of ids with
 * reason codes, and both are checked again here against the activities
 * on screen before anything is rendered: an id that has since dropped
 * out of the eligible set is not shown, and a reason is worded from the
 * activity's own data, never from text the model wrote.
 */
import { categories, timeBands } from '../data/categories'

export const CANDIDATE_CAP = 40
export const PICK_CAP = 8
const MAX_DESCRIPTION = 240
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
    matchScore: Math.max(0, Math.min(100, Math.round(Number(activity?.matchScore) || 0))),
    description: String(activity?.description || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DESCRIPTION),
  }
}

/**
 * The activities worth sending: the eligible ones, best-scored first, up
 * to the cap. The list arrives already ranked by the standard engine, so
 * the cap keeps the strongest forty rather than an arbitrary forty.
 */
export function chooseCandidates(activities) {
  return (Array.isArray(activities) ? activities : [])
    .filter((a) => a && a.id && a.title && a.category)
    .slice()
    .sort((a, b) => (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0))
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
    c: candidates.map((c) => c.id).sort(),
  })
}

/**
 * A reason code, as the facts the wording needs — the same shape the
 * standard engine attaches (`reasonKeys`), so both speak through
 * `reasonText` and read alike in every language.
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
 * dropped; a pick with no supported reason falls back to the engine's own
 * reasons for that activity, which are always facts.
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
    out.push({
      activity,
      reasons: reasons.length ? reasons : (activity.reasonKeys || []).slice(0, 3),
    })
    if (out.length === PICK_CAP) break
  }
  return out
}

/** The standard ranking in the same shape, for when the model has no answer. */
export function standardPicks(activities) {
  return chooseCandidates(activities)
    .slice(0, PICK_CAP)
    .map((activity) => ({ activity, reasons: (activity.reasonKeys || []).slice(0, 3) }))
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
