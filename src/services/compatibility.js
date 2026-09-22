/**
 * How alike two people are, and whether anyone like you is going.
 *
 * What is left of the recommendation engine after Gemini took over the
 * ranking (ADR-030): the compatibility score behind the People match
 * screen, and the one fact about an activity that only the browser can
 * compute — that somebody genuinely similar to you has joined it — which
 * the AI Picks request carries as `similar` and the model may cite as a
 * reason. Nothing here ranks an activity; that is the model's job.
 */

// Every comparison is done on lowercased strings, and the values arrive
// from a database that other people write to. `(value || '')` is not a
// guard — a number or an object passes it straight through and then throws
// on .toLowerCase(). Coercing first is, and it costs nothing.
const key = (value) => (value === null || value === undefined ? '' : String(value).toLowerCase())

const compatibilityWeights = {
  interests: 70,
  time: 15,
  history: 15,
}

// Normalises a list into a comparable set. String() rather than a bare
// .toLowerCase() so a non-string that reaches us from corrupt persisted
// state degrades instead of throwing.
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

// A peer counts as "similar" at or above this compatibility. Named so the
// claim can be justified rather than eyeballed.
export const SIMILAR_USER_THRESHOLD = 50

/**
 * How much like this user are the people already going?
 *
 * Returns the best compatibility among them as a 0-1 value, or null when
 * nobody else has joined — which is genuinely unknown rather than zero.
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

  const byUid = peers instanceof Map ? peers : new Map(peers.map((peer) => [peer.uid, peer]))
  const scores = others
    .map((id) => byUid.get(id))
    .filter(Boolean)
    .map((peer) => calculateUserCompatibility(user, peer).score)

  return scores.length ? Math.max(...scores) / 100 : null
}

/**
 * Whether anyone genuinely similar has joined — a claim worth making or
 * not making, not a number to show a user.
 */
export function computeSimilarUsersJoined(user, activity, peers = []) {
  const similarity = computeParticipantSimilarity(user, activity, peers)
  return similarity !== null && similarity * 100 >= SIMILAR_USER_THRESHOLD
}

/**
 * Every activity with that one fact attached, in the order a discovery
 * feed reads: soonest first, anything without a start time last. The
 * only order the browser imposes; the ranking is asked of the model.
 */
export function enrichActivities(user, activities, peers = []) {
  // Indexed once: looking each participant up by scanning the peer list
  // would be O(activities × roster × peers) on every snapshot.
  const byUid = new Map((peers || []).map((peer) => [peer.uid, peer]))
  const at = (a) => (Number.isFinite(a.startsAt) ? a.startsAt : Number.POSITIVE_INFINITY)
  return [...activities]
    .map((activity) => ({
      ...activity,
      similarUsersJoined: computeSimilarUsersJoined(user, activity, byUid),
    }))
    .sort((a, b) => at(a) - at(b))
}
