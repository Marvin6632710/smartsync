// Explicit extension: Vite resolves either form, but Node's ESM loader does
// not, and this module is imported directly by scripts/evaluate.mjs.
import { formatDistance } from '../utils/geo.js'

export const recommendationWeights = {
  interest: 35,
  distance: 20,
  time: 15,
  history: 15,
  popularity: 10,
  behavior: 5,
}

/**
 * The six signals, in the order they are presented to a user.
 *
 * Exported so the settings screen and the evaluation harness both describe
 * them the same way, rather than each keeping its own copy of the labels.
 */
export const signalLabels = {
  interest: 'Matches your interests',
  distance: 'Close to you',
  time: 'Fits your preferred time',
  history: 'Like things you have joined',
  popularity: 'Popular with others',
  behavior: 'Similar people are going',
}

/**
 * Weights are a parameter, not a constant.
 *
 * Two things need to vary them: the settings screen, where changing one and
 * watching the ranking reorder is the clearest way to show what the algorithm
 * is doing; and the evaluation harness, which zeroes each in turn to measure
 * what that signal is actually contributing. A module-level constant could
 * support neither.
 *
 * Missing keys fall back to the defaults, so a partially-specified set is
 * safe rather than silently scoring those signals as zero.
 */
function resolveWeights(weights) {
  return weights ? { ...recommendationWeights, ...weights } : recommendationWeights
}

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

// Every comparison in this file is done on lowercased strings, and the values
// arrive from a database that other people write to. `(value || '')` is not a
// guard — a number or an object passes it straight through and then throws on
// .toLowerCase(). Coercing first is, and it costs nothing.
const key = (value) => (value === null || value === undefined ? '' : String(value).toLowerCase())

export function calculateRecommendationScore(user, activity, weights) {
  // `activity` is guarded as carefully as `user`. It was only guarded on the
  // category line, so a missing activity threw on the very next read.
  const interests = (user?.interests || []).map(key)
  const category = key(activity?.category)
  const tags = Array.isArray(activity?.tags) ? activity.tags.map(key) : []
  // An empty category must not match an empty interest entry — that would
  // score "we know nothing about either" as a direct interest hit.
  const interest =
    category && interests.includes(category)
      ? 1
      : interests.some((i) => i && tags.includes(i))
        ? 0.75
        : 0.2

  // Distance is now measured from the user's real position, which means it
  // can genuinely be unknown (location not granted, or not yet resolved).
  // `|| 0` used to turn "unknown" into "zero kilometres away", handing every
  // activity full marks on 20% of the score for a fact nobody knew. Unknown
  // now scores neutrally: no reward, no penalty.
  const distanceKm = activity?.distanceKm
  const distance = Number.isFinite(distanceKm) ? clamp(1 - Math.max(0, distanceKm - 1) / 12) : 0.5
  const preferred = key(user?.preferredTime)
  const time = preferred && preferred === key(activity?.timeBand) ? 1 : 0.55

  const historyCategories = (user?.historyCategories || []).map(key)
  const history = category && historyCategories.includes(category) ? 1 : 0.5

  const participants = Number(activity?.participants) || 0
  const capacity = Number(activity?.capacity) || 1
  const popularity = clamp(Math.max(0, participants) / Math.max(capacity, 1))
  const behavior = activity?.similarUsersJoined ? 1 : 0.45

  const w = resolveWeights(weights)
  const weighted =
    interest * w.interest +
    distance * w.distance +
    time * w.time +
    history * w.history +
    popularity * w.popularity +
    behavior * w.behavior

  // Normalised by the weight total rather than assuming it is 100. Once a
  // user can move the sliders the total is whatever they made it, and an
  // unnormalised score would drift outside 0-100 and stop meaning "percent".
  const total = w.interest + w.distance + w.time + w.history + w.popularity + w.behavior
  return total > 0 ? Math.round((weighted / total) * 100) : 0
}

export function getRecommendationReasons(user, activity) {
  const reasons = []
  const interests = (user?.interests || []).map(key)
  const category = key(activity?.category)
  const preferredTime = key(user?.preferredTime)
  const timeBand = key(activity?.timeBand)

  if (category && interests.includes(category))
    reasons.push(`Matches your ${activity.category} interest`)

  // ?? not ||: a 0 km activity is the nearest possible, but || treated it as
  // missing and skipped the reason entirely.
  const distanceKm = activity?.distanceKm
  if (Number.isFinite(distanceKm) && distanceKm <= 3)
    reasons.push(`Only ${formatDistance(distanceKm)} away`)

  // Both sides must actually have a time. Comparing the empty-string
  // fallbacks made "no time either side" look like a match, which both
  // claimed a reason that wasn't true and then threw reading .toLowerCase()
  // of the missing timeBand.
  if (preferredTime && preferredTime === timeBand)
    reasons.push(`Fits your preferred ${timeBand} time`)

  if (category && (user?.historyCategories || []).map(key).includes(category))
    reasons.push('Similar to activities you joined before')
  if (activity?.similarUsersJoined) reasons.push('Similar users are joining')
  if (
    Math.max(0, Number(activity?.participants) || 0) /
      Math.max(Number(activity?.capacity) || 1, 1) >=
    0.6
  )
    reasons.push('Popular with the community')
  // Five, not four: there are exactly five signals, and capping at four
  // silently hid the collaborative one on the strongest matches — the very
  // activities where it is most worth showing.
  return reasons.slice(0, 5).length
    ? reasons.slice(0, 5)
    : ['Matches your current discovery preferences']
}

// A peer counts as "similar" at or above this compatibility. Named so the
// collaborative signal can be justified rather than eyeballed.
export const SIMILAR_USER_THRESHOLD = 50

/**
 * Was this activity joined by anyone actually similar to the user?
 *
 * This used to be a boolean hand-typed into mockData, so the collaborative
 * term of the score was decorative — it never responded to who the user is
 * or who joined. Derived from real compatibility against the joined peers.
 */
export function computeSimilarUsersJoined(user, activity, peers = []) {
  const joinedPeerIds = (activity?.participantUids || []).filter((id) => id !== user?.uid)
  if (joinedPeerIds.length === 0) return false

  return joinedPeerIds.some((id) => {
    const peer = peers.find((p) => p.uid === id)
    if (!peer) return false
    return calculateUserCompatibility(user, peer).score >= SIMILAR_USER_THRESHOLD
  })
}

export function rankActivities(user, activities, peers = [], weights) {
  return [...activities]
    .map((activity) => {
      // Computed before scoring, since both the score and the reasons read it.
      const enriched = {
        ...activity,
        similarUsersJoined: computeSimilarUsersJoined(user, activity, peers),
      }

      return {
        ...enriched,
        matchScore: calculateRecommendationScore(user, enriched, weights),
        reasons: getRecommendationReasons(user, enriched),
      }
    })
    .sort((a, b) => b.matchScore - a.matchScore)
}

export const compatibilityWeights = {
  interests: 70,
  time: 15,
  history: 15,
}

// Normalises a list into a comparable set. String() rather than a bare
// .toLowerCase() so a non-string that reaches us from corrupt persisted
// state degrades instead of throwing — the same crash-guard reasoning as
// Q-01 elsewhere in this file.
const toKeySet = (list) => new Set((Array.isArray(list) ? list : []).map(key))

/**
 * Jaccard index: |A ∩ B| / |A ∪ B|. Two empty sets score 0 rather than
 * NaN — no shared evidence is not the same as perfect agreement.
 */
export function jaccardIndex(listA, listB) {
  const a = toKeySet(listA)
  const b = toKeySet(listB)
  const union = new Set([...a, ...b])
  if (union.size === 0) return 0
  const intersection = [...a].filter((x) => b.has(x))
  return intersection.length / union.size
}

export function calculateUserCompatibility(currentUser, otherUser) {
  const a = toKeySet(currentUser?.interests)
  const b = toKeySet(otherUser?.interests)
  const shared = [...a].filter((x) => b.has(x))

  // Jaccard rather than a per-match bonus: `shared.length * 22` ignored how
  // many interests each person has, so someone listing everything scored as
  // "compatible" with everyone. Dividing by the union penalises that.
  const interests = jaccardIndex([...a], [...b]) * compatibilityWeights.interests
  const time =
    currentUser?.preferredTime && currentUser.preferredTime === otherUser?.preferredTime
      ? compatibilityWeights.time
      : 0
  const history =
    jaccardIndex(currentUser?.historyCategories, otherUser?.historyCategories) *
    compatibilityWeights.history

  return { score: Math.round(interests + time + history), shared }
}
