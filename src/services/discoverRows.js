/**
 * Which rows Discover shows, and what goes in each.
 *
 * The streaming-app shape is rows, and a row is a claim about its contents:
 * the heading says why these belong together. So the rows have to be chosen
 * rather than generated, and two rules keep them honest.
 *
 * **Nothing may be hidden.** Discover used to stop at six cards with the true
 * total printed beside the heading, so a feed of eighteen showed six under the
 * number 18 and people read it as their activity never having been posted.
 * The rows by category are what replaces that guarantee here: every activity
 * has exactly one category, so those rows are a partition of the whole feed —
 * every activity is in exactly one of them, whatever the curated rows above
 * happen to pick. `coversEverything` is that promise written down, and a test
 * holds it.
 *
 * **A row that says nothing is not shown.** A curated row needs enough in it
 * to be a row rather than a card with a title over it; "Filling up" over one
 * half-empty activity is not a finding. The rows by category are the
 * exception and appear at any size, because they are the coverage.
 */

/** Most cards in one row. Past this, scrolling sideways stops being browsing. */
export const RAIL_LIMIT = 20
/** A curated row needs at least this many to earn its heading. */
export const MIN_CURATED = 2
/** How much of its capacity is taken before an activity is "filling up". */
export const FILLING_AT = 0.7

const byStart = (a, b) => (a.startsAt || 0) - (b.startsAt || 0)
const takenOf = (a) => (a.participants || 0) / Math.max(a.capacity || 1, 1)
const categoryOf = (a) => (a.category || '').trim().toLowerCase() || 'other'

/**
 * @param activities    the feed, already filtered — every one of these must
 *                      end up in exactly one row by category.
 * @param interestPicks the model's picks narrowed to the chosen interests.
 * @param heroId        the activity shown as the billboard, kept out of the
 *                      curated rows so the first row is not the hero again.
 *                      It stays in its row by category: that is the partition.
 */
export function discoverRows({ activities = [], interestPicks = [], heroId = null } = {}) {
  const notHero = (a) => a.id !== heroId
  const rows = []

  const soonest = [...activities].sort(byStart)
  const soon = soonest.filter(notHero).slice(0, RAIL_LIMIT)
  if (soon.length >= MIN_CURATED) rows.push({ key: 'soon', kind: 'soon', items: soon })

  const mine = interestPicks.filter(notHero).slice(0, RAIL_LIMIT)
  if (mine.length >= MIN_CURATED) rows.push({ key: 'interests', kind: 'interests', items: mine })

  // Nearly taken and still joinable. Something already full is not an answer
  // to "what am I doing tonight", and something a quarter full is not news.
  const filling = activities
    .filter(notHero)
    .filter((a) => {
      const taken = takenOf(a)
      return taken >= FILLING_AT && (a.participants || 0) < (a.capacity || 0)
    })
    .sort((a, b) => takenOf(b) - takenOf(a))
    .slice(0, RAIL_LIMIT)
  if (filling.length >= MIN_CURATED) rows.push({ key: 'filling', kind: 'filling', items: filling })

  // Only where the distance is actually known: it is null until the reader
  // shares a location, and a row called "Near you" built from the ones that
  // happen to have a number is a row that misleads about the rest.
  const near = activities
    .filter(notHero)
    .filter((a) => typeof a.distanceKm === 'number')
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, RAIL_LIMIT)
  if (near.length >= MIN_CURATED) rows.push({ key: 'near', kind: 'near', items: near })

  // The partition. Biggest first so the page opens on the fullest rows, then
  // by name, so the order does not move about between renders when two
  // categories are the same size.
  const groups = new Map()
  for (const activity of activities) {
    const key = categoryOf(activity)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(activity)
  }
  const categories = [...groups.entries()]
    .map(([category, items]) => ({
      key: `category:${category}`,
      kind: 'category',
      category,
      items: [...items].sort(byStart),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.category.localeCompare(b.category))

  return [...rows, ...categories]
}

/**
 * Whether the rows account for every activity — the promise made above.
 *
 * Exported so a test can hold it rather than the comment alone. The curated
 * rows are capped at `RAIL_LIMIT` and the rows by category deliberately are
 * not — capping those is exactly how the old six-card feed lost the rest — so
 * this is what would catch somebody adding a cap there later.
 */
export function coversEverything(rows, activities) {
  const shown = new Set()
  for (const row of rows) for (const item of row.items) shown.add(item.id)
  return activities.every((activity) => shown.has(activity.id))
}
