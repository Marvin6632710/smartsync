/**
 * What the console's charts are drawn from.
 *
 * Pure, and separate from the drawing, because the hard part here is not the
 * rectangles — it is saying only what the data supports. The console reads
 * windows, not collections: the newest three hundred log entries, the newest
 * two hundred warnings, the newest two hundred decided reports. Counting a day
 * that fell out of the window gives zero, and a zero on a chart is a claim
 * that nothing happened. So the window's edge is found first, and every day
 * before it is marked unknown instead.
 */

/** Local midnight, so a day on the chart is the admin's day. */
const startOfDay = (ms) => {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const DAY_MS = 86_400_000

/**
 * The earliest moment every feed still covers, or null when they all hold
 * their whole collection and nothing is missing.
 *
 * A feed that came back short of its limit is complete — there was no more to
 * send. A feed that filled its limit has an edge, and the answer is the
 * *newest* of those edges: past it, at least one of the three has stopped
 * contributing, so a total there would be short without saying so.
 */
export function coverageFrom(feeds) {
  let floor = null
  for (const feed of feeds) {
    if (!feed || feed.rows.length < feed.page) continue
    let oldest = null
    for (const row of feed.rows) {
      const at = feed.at(row)
      if (typeof at === 'number' && (oldest === null || at < oldest)) oldest = at
    }
    if (oldest !== null && (floor === null || oldest > floor)) floor = oldest
  }
  return floor
}

/**
 * How many of `times` fall on each of the last `days` days, oldest first.
 *
 * `knownFrom` is `coverageFrom`'s answer: a day that ends before it is not
 * counted, it is marked `known: false`, and the chart draws it as an absence.
 */
export function dailyCounts(times, { days = 14, now = Date.now(), knownFrom = null } = {}) {
  const today = startOfDay(now)
  const buckets = new Map()
  for (let back = days - 1; back >= 0; back -= 1) {
    buckets.set(today - back * DAY_MS, 0)
  }
  const earliest = today - (days - 1) * DAY_MS
  for (const at of times) {
    if (typeof at !== 'number') continue
    const day = startOfDay(at)
    if (day < earliest || day > today) continue
    buckets.set(day, (buckets.get(day) ?? 0) + 1)
  }
  return [...buckets.entries()].map(([day, value]) => ({
    key: String(day),
    at: day,
    value,
    // The whole day has to be inside the window, not just its last moment:
    // a day the window opened halfway through is a day half counted.
    known: knownFrom === null || day >= startOfDay(knownFrom),
  }))
}

/**
 * How many reports gave each reason, biggest first.
 *
 * Every reason is present even at nought, because "nobody reported this"
 * is the finding on a moderation screen, not a row to leave out. Ties keep
 * the order the reasons are declared in, so the chart does not reshuffle
 * itself between renders.
 */
export function countByReason(reports, reasons) {
  const counts = new Map(reasons.map((reason) => [reason, 0]))
  let other = 0
  for (const report of reports) {
    const reason = report?.reason
    if (counts.has(reason)) counts.set(reason, counts.get(reason) + 1)
    else other += 1
  }
  const rows = reasons.map((reason, index) => ({ key: reason, value: counts.get(reason), index }))
  // A reason no longer offered can still be on an old report. It is counted,
  // never silently dropped, and never mixed into a reason it is not.
  if (other > 0) rows.push({ key: 'unknown', value: other, index: reasons.length })
  return rows.sort((a, b) => b.value - a.value || a.index - b.index)
}
