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
  const interests = (user?.interests || []).map((item) => item.toLowerCase())
  const category = (activity?.category || '').toLowerCase()
  const interest = interests.includes(category) ? 1 : interests.some((i) => activity.tags?.map((t) => t.toLowerCase()).includes(i)) ? 0.75 : 0.2

  const distance = clamp(1 - Math.max(0, (activity.distanceKm || 0) - 1) / 12)
  const preferred = (user?.preferredTime || '').toLowerCase()
  const time = preferred && preferred === (activity.timeBand || '').toLowerCase() ? 1 : 0.55

  const historyCategories = (user?.historyCategories || []).map((item) => item.toLowerCase())
  const history = historyCategories.includes(category) ? 1 : 0.5

  const popularity = clamp((activity.participants || 0) / Math.max(activity.capacity || 1, 1))
  const behavior = activity.similarUsersJoined ? 1 : 0.45

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
  const interests = (user?.interests || []).map((item) => item.toLowerCase())
  if (interests.includes((activity.category || '').toLowerCase())) reasons.push(`Matches your ${activity.category} interest`)
  if ((activity.distanceKm || 99) <= 3) reasons.push(`Only ${activity.distanceKm} km away`)
  if ((user?.preferredTime || '').toLowerCase() === (activity.timeBand || '').toLowerCase()) reasons.push(`Fits your preferred ${activity.timeBand.toLowerCase()} time`)
  if ((user?.historyCategories || []).map((x) => x.toLowerCase()).includes((activity.category || '').toLowerCase())) reasons.push('Similar to activities you joined before')
  if (activity.similarUsersJoined) reasons.push('Similar users are joining')
  if ((activity.participants || 0) / Math.max(activity.capacity || 1, 1) >= 0.6) reasons.push('Popular with the community')
  return reasons.slice(0, 4).length ? reasons.slice(0, 4) : ['Matches your current discovery preferences']
}

export function rankActivities(user, activities) {
  return [...activities]
    .map((activity) => ({ ...activity, matchScore: calculateRecommendationScore(user, activity), reasons: getRecommendationReasons(user, activity) }))
    .sort((a, b) => b.matchScore - a.matchScore)
}

export function calculateUserCompatibility(currentUser, otherUser) {
  const a = new Set((currentUser?.interests || []).map((x) => x.toLowerCase()))
  const b = new Set((otherUser?.interests || []).map((x) => x.toLowerCase()))
  const shared = [...a].filter((x) => b.has(x))
  const base = Math.min(70, shared.length * 22)
  const time = currentUser?.preferredTime === otherUser?.preferredTime ? 15 : 5
  const activity = (currentUser?.historyCategories || []).some((x) => (otherUser?.historyCategories || []).includes(x)) ? 15 : 7
  return { score: Math.min(98, base + time + activity), shared }
}
