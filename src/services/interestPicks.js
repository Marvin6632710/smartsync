/**
 * What belongs on AI Picks, and nothing else.
 *
 * Discover and AI Picks were showing the same list. Both read the same array
 * — every upcoming activity, ranked — so the second page was the first page
 * with a different heading, and the promise it made ("activities that match
 * your interests") was not true of most of what it showed.
 *
 * The rule here is deliberately strict: an activity qualifies when its
 * category is one the user actually picked. Not "shares a tag with", not
 * "scored well anyway". A page that claims to be built from your interests
 * has to be checkable by the person reading it — they picked Football and
 * Coffee, so everything here is Football or Coffee, and when something
 * unexpected appears they are right to stop believing the rest.
 *
 * Order is left alone. The list arriving here is already soonest first, and
 * these functions only ever filter and group, never reorder within a group.
 */

const key = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

/** The user's interests as a lookup, deduplicated and case-insensitive. */
export function interestSet(interests) {
  const set = new Set()
  for (const interest of Array.isArray(interests) ? interests : []) {
    const k = key(interest)
    if (k) set.add(k)
  }
  return set
}

/** Does this activity sit in a category the user chose? */
export function matchesInterests(activity, interests) {
  const set = interests instanceof Set ? interests : interestSet(interests)
  if (set.size === 0) return false
  return set.has(key(activity?.category))
}

/**
 * The activities to show, in the order they arrived.
 *
 * With no interests chosen this returns nothing rather than everything. That
 * is the honest answer: the page cannot pick for you when you have told it
 * nothing, and quietly falling back to "here is everything" is how the two
 * pages became identical in the first place.
 */
export function pickForInterests(activities, interests) {
  const set = interestSet(interests)
  if (set.size === 0) return []
  return (Array.isArray(activities) ? activities : []).filter((a) => matchesInterests(a, set))
}

/**
 * The picks grouped under the interest that earned them.
 *
 * Groups lead with whichever has something on soonest, so the heading with
 * tonight's plan under it is first rather than whatever order the interests
 * were tapped in months ago. Within a group the incoming order is preserved,
 * which is soonest first — so that is also the order the groups appear in.
 */
export function groupByInterest(activities, interests) {
  const set = interestSet(interests)
  if (set.size === 0) return []

  const groups = new Map()
  for (const activity of Array.isArray(activities) ? activities : []) {
    const k = key(activity?.category)
    if (!set.has(k)) continue
    if (!groups.has(k)) groups.set(k, { key: k, label: activity.category, items: [] })
    groups.get(k).items.push(activity)
  }

  return [...groups.values()]
}

/**
 * Interests with nothing on right now.
 *
 * Saying so is the difference between "the app found nothing for Coffee" and
 * "the app forgot you like Coffee". Returned in the order they were chosen,
 * with the original spelling, so the sentence reads the way the user wrote it.
 */
export function interestsWithNothing(activities, interests) {
  const list = Array.isArray(interests) ? interests : []
  const present = new Set(
    (Array.isArray(activities) ? activities : []).map((a) => key(a?.category)),
  )
  const seen = new Set()
  const empty = []
  for (const interest of list) {
    const k = key(interest)
    if (!k || seen.has(k)) continue
    seen.add(k)
    if (!present.has(k)) empty.push(interest)
  }
  return empty
}

/** "Football", "Football and Coffee", "Football, Coffee and Study". */
export function listInWords(items) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean)
  if (list.length === 0) return ''
  if (list.length === 1) return String(list[0])
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}
