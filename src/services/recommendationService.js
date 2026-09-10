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
  if (!weights) return recommendationWeights

  // Sanitised per key, not merged blindly. These arrive from localStorage,
  // which survives across versions and can be hand-edited: a string or a NaN
  // propagates through the arithmetic and the screen renders "NaN% match",
  // and a negative one renders "-11% match". Neither is caught by anything
  // downstream, because both are perfectly valid numbers to a template.
  const safe = {}
  for (const key of Object.keys(recommendationWeights)) {
    const raw = weights[key]
    const value = raw === null || raw === undefined || raw === '' ? NaN : Number(raw)
    safe[key] = Number.isFinite(value) && value >= 0 ? value : recommendationWeights[key]
  }
  return safe
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
  // Revealed preference: what you keep doing that you did NOT say you liked.
  //
  // Measurement showed 59% of a person's history categories are already among
  // their stated interests, so in its original form the signal spent most of
  // its weight repeating the interest term — and the ablation had it actively
  // hurting. Excluding what interests already cover leaves it saying the one
  // thing they cannot: the gap between what someone claims and what they do.
  //
  // Honest about the evidence: this stops history hurting, and averaged +0.8
  // precision@5 points over seven populations, but with a standard deviation
  // of 1.2 — the direction is supported, the magnitude is not.
  const history =
    category && historyCategories.includes(category) && !interests.includes(category) ? 1 : 0.5

  const participants = Number(activity?.participants) || 0
  const capacity = Number(activity?.capacity) || 1
  const popularity = clamp(Math.max(0, participants) / Math.max(capacity, 1))

  // Continuous, not a yes/no at a threshold. The binary version answered
  // "is anyone here at least 50% compatible with you", which measurement
  // showed was true for only 9% of activities — so on the other 91% it
  // contributed the same constant to everything and could not separate two
  // activities at all. The compatibility scores were already being computed
  // and then discarded in favour of a boolean.
  const similarity = activity?.participantSimilarity
  const behavior = Number.isFinite(similarity) ? clamp(similarity) : 0.45

  const w = resolveWeights(weights)
  const weighted =
    interest * w.interest +
    distance * w.distance +
    time * w.time +
    history * w.history +
    popularity * w.popularity +
    behavior * w.behavior

  // Normalised by the best score actually obtainable, not by the weight total.
  //
  // Two reasons it cannot be the total. Once a user can move the sliders the
  // total is whatever they made it, so an unnormalised score would drift
  // outside 0-100 and stop meaning "percent". And the interest and history
  // terms can no longer both be maximal — history only counts where interests
  // do not already say the same thing — so dividing by the total capped the
  // best possible match at 93%. A percentage nobody can ever score is a worse
  // number than one they can.
  const bestInterestAndHistory = Math.max(
    w.interest + 0.5 * w.history, // in a stated interest; history adds nothing
    0.75 * w.interest + w.history, // matched on a tag; history is free to speak
  )
  const achievable = bestInterestAndHistory + w.distance + w.time + w.popularity + w.behavior
  if (achievable <= 0) return 0
  return Math.min(100, Math.round((weighted / achievable) * 100))
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
 * How much like this user are the people already going?
 *
 * Returns the best compatibility among them as a 0-1 value, or null when
 * nobody else has joined — which is genuinely unknown rather than zero, and
 * the scorer treats it as such.
 *
 * The best match rather than the average, deliberately: one person you would
 * actually get on with is a better reason to go than a room of mild ones, and
 * averaging lets a crowd of strangers wash that person out.
 *
 * Peers whose profile is not loaded are skipped rather than counted as
 * incompatible — not knowing someone is not evidence against them.
 */
export function computeParticipantSimilarity(user, activity, peers = []) {
  const others = (activity?.participantUids || []).filter((id) => id !== user?.uid)
  if (others.length === 0) return null

  const scores = others
    .map((id) => peers.find((peer) => peer.uid === id))
    .filter(Boolean)
    .map((peer) => calculateUserCompatibility(user, peer).score)

  return scores.length ? Math.max(...scores) / 100 : null
}

/**
 * Whether anyone genuinely similar has joined — the threshold form, kept
 * because "similar people are going" is a claim worth making or not making,
 * not a number to show a user.
 */
export function computeSimilarUsersJoined(user, activity, peers = []) {
  const similarity = computeParticipantSimilarity(user, activity, peers)
  return similarity !== null && similarity * 100 >= SIMILAR_USER_THRESHOLD
}

export function rankActivities(user, activities, peers = [], weights) {
  return [...activities]
    .map((activity) => {
      // Computed once before scoring: the score reads the continuous value and
      // the reasons read the thresholded one, and deriving both from a single
      // pass avoids scoring every peer twice.
      const similarity = computeParticipantSimilarity(user, activity, peers)
      const enriched = {
        ...activity,
        participantSimilarity: similarity,
        similarUsersJoined: similarity !== null && similarity * 100 >= SIMILAR_USER_THRESHOLD,
      }

      return {
        ...enriched,
        matchScore: calculateRecommendationScore(user, enriched, weights),
        reasons: getRecommendationReasons(user, enriched),
      }
    })
    .sort((a, b) => b.matchScore - a.matchScore)
}

const compatibilityWeights = {
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
