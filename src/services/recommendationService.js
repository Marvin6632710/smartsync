export const recommendationWeights = {
  interest: 35,
  distance: 20,
  time: 15,
  history: 15,
  popularity: 10,
  behavior: 5,
}

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

export function calculateRecommendationScore(user, activity) {
  // `activity` is guarded as carefully as `user`. It was only guarded on the
  // category line, so a missing activity threw on the very next read.
  const interests = (user?.interests || []).map((item) => String(item).toLowerCase())
  const category = (activity?.category || '').toLowerCase()
  const interest = interests.includes(category)
    ? 1
    : interests.some((i) => activity?.tags?.map((t) => String(t).toLowerCase()).includes(i))
      ? 0.75
      : 0.2

  const distance = clamp(1 - Math.max(0, (activity?.distanceKm || 0) - 1) / 12)
  const preferred = (user?.preferredTime || '').toLowerCase()
  const time = preferred && preferred === (activity?.timeBand || '').toLowerCase() ? 1 : 0.55

  const historyCategories = (user?.historyCategories || []).map((item) =>
    String(item).toLowerCase(),
  )
  const history = historyCategories.includes(category) ? 1 : 0.5

  const popularity = clamp((activity?.participants || 0) / Math.max(activity?.capacity || 1, 1))
  const behavior = activity?.similarUsersJoined ? 1 : 0.45

  const weighted =
    interest * recommendationWeights.interest +
    distance * recommendationWeights.distance +
    time * recommendationWeights.time +
    history * recommendationWeights.history +
    popularity * recommendationWeights.popularity +
    behavior * recommendationWeights.behavior

  return Math.round(weighted)
}

export function getRecommendationReasons(user, activity) {
  const reasons = []
  const interests = (user?.interests || []).map((item) => String(item).toLowerCase())
  const category = (activity?.category || '').toLowerCase()
  const preferredTime = (user?.preferredTime || '').toLowerCase()
  const timeBand = (activity?.timeBand || '').toLowerCase()

  if (category && interests.includes(category))
    reasons.push(`Matches your ${activity.category} interest`)

  // ?? not ||: a 0 km activity is the nearest possible, but || treated it as
  // missing and skipped the reason entirely.
  const distanceKm = activity?.distanceKm ?? null
  if (distanceKm !== null && distanceKm <= 3) reasons.push(`Only ${distanceKm} km away`)

  // Both sides must actually have a time. Comparing the empty-string
  // fallbacks made "no time either side" look like a match, which both
  // claimed a reason that wasn't true and then threw reading .toLowerCase()
  // of the missing timeBand.
  if (preferredTime && preferredTime === timeBand)
    reasons.push(`Fits your preferred ${timeBand} time`)

  if (
    category &&
    (user?.historyCategories || []).map((x) => String(x).toLowerCase()).includes(category)
  )
    reasons.push('Similar to activities you joined before')
  if (activity?.similarUsersJoined) reasons.push('Similar users are joining')
  if ((activity?.participants || 0) / Math.max(activity?.capacity || 1, 1) >= 0.6)
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
  const joinedPeerIds = (activity?.joinedUserIds || []).filter((id) => id !== 'me')
  if (joinedPeerIds.length === 0) return false

  return joinedPeerIds.some((id) => {
    const peer = peers.find((p) => p.id === id)
    if (!peer) return false
    return calculateUserCompatibility(user, peer).score >= SIMILAR_USER_THRESHOLD
  })
}

export function rankActivities(user, activities, peers = []) {
  return [...activities]
    .map((activity) => {
      // Computed before scoring, since both the score and the reasons read it.
      const enriched = {
        ...activity,
        similarUsersJoined: computeSimilarUsersJoined(user, activity, peers),
      }

      return {
        ...enriched,
        matchScore: calculateRecommendationScore(user, enriched),
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
const toKeySet = (list) => new Set((list || []).map((x) => String(x).toLowerCase()))

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
