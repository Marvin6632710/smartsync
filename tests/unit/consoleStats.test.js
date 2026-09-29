/**
 * What the console's charts are allowed to claim.
 *
 * The drawing is not the risk here; the arithmetic behind it is. The console
 * reads windows, not collections — the newest three hundred log entries, the
 * newest two hundred warnings — and a day that fell out of a window counts
 * zero, which on a chart is a claim that nothing happened that day. These pin
 * the difference between "nothing happened" and "nothing is known", because
 * that is the one thing a bar chart cannot say for itself.
 */
import { describe, expect, test } from 'vitest'

import { countByReason, coverageFrom, dailyCounts } from '../../src/console/stats'

const DAY = 86_400_000
// A fixed afternoon, so a test never straddles midnight.
const NOW = new Date('2026-09-20T14:00:00').getTime()
const daysAgo = (n) => NOW - n * DAY

describe('coverageFrom', () => {
  test('a feed short of its limit holds everything, so nothing is unknown', () => {
    const rows = [{ at: daysAgo(3) }, { at: daysAgo(9) }]
    expect(coverageFrom([{ rows, page: 300, at: (r) => r.at }])).toBeNull()
  })

  test('a feed at its limit is bounded by its oldest row', () => {
    const rows = [{ at: daysAgo(1) }, { at: daysAgo(5) }]
    expect(coverageFrom([{ rows, page: 2, at: (r) => r.at }])).toBe(daysAgo(5))
  })

  test('the newest edge wins — past it, one feed has already stopped', () => {
    // The log reaches back ten days, the warnings only four. Four is the
    // answer: a total before that is short by however many warnings fell out.
    const log = [{ at: daysAgo(1) }, { at: daysAgo(10) }]
    const warnings = [{ at: daysAgo(2) }, { at: daysAgo(4) }]
    expect(
      coverageFrom([
        { rows: log, page: 2, at: (r) => r.at },
        { rows: warnings, page: 2, at: (r) => r.at },
      ]),
    ).toBe(daysAgo(4))
  })

  test('a full feed beside an incomplete one still bounds the answer', () => {
    const full = [{ at: daysAgo(6) }]
    const partial = [{ at: daysAgo(30) }]
    expect(
      coverageFrom([
        { rows: full, page: 1, at: (r) => r.at },
        { rows: partial, page: 99, at: (r) => r.at },
      ]),
    ).toBe(daysAgo(6))
  })

  test('an empty feed claims nothing', () => {
    expect(coverageFrom([{ rows: [], page: 300, at: (r) => r.at }])).toBeNull()
    expect(coverageFrom([])).toBeNull()
  })
})

describe('dailyCounts', () => {
  test('one bucket per day, oldest first, ending today', () => {
    const points = dailyCounts([], { days: 5, now: NOW })
    expect(points).toHaveLength(5)
    expect(points.map((p) => p.value)).toEqual([0, 0, 0, 0, 0])
    expect(points[4].at).toBe(new Date('2026-09-20T00:00:00').getTime())
  })

  test('events land on their own local day', () => {
    const points = dailyCounts([daysAgo(0), daysAgo(0), daysAgo(2)], { days: 3, now: NOW })
    expect(points.map((p) => p.value)).toEqual([1, 0, 2])
  })

  test('anything outside the range is left out rather than piled on an end', () => {
    const points = dailyCounts([daysAgo(40), NOW + DAY], { days: 3, now: NOW })
    expect(points.map((p) => p.value)).toEqual([0, 0, 0])
  })

  test('with nothing missing, every day is counted', () => {
    const points = dailyCounts([], { days: 3, now: NOW, knownFrom: null })
    expect(points.every((p) => p.known)).toBe(true)
  })

  test('days before the window opened are unknown, not nought', () => {
    // The feeds reach back two days; the chart covers five.
    const points = dailyCounts([], { days: 5, now: NOW, knownFrom: daysAgo(2) })
    expect(points.map((p) => p.known)).toEqual([false, false, true, true, true])
  })

  test('a day the window opened halfway through is not counted as whole', () => {
    // Coverage starts at midday on the third day back. That day is missing
    // its morning, so a count for it would be short — and a short count on a
    // chart is indistinguishable from a quiet day.
    const midday = new Date('2026-09-18T12:00:00').getTime()
    const points = dailyCounts([], { days: 4, now: NOW, knownFrom: midday })
    expect(points.map((p) => p.known)).toEqual([false, true, true, true])
  })

  test('rubbish in the timestamps is skipped, not counted as the epoch', () => {
    const points = dailyCounts([null, undefined, 'yesterday', daysAgo(1)], { days: 2, now: NOW })
    expect(points.map((p) => p.value)).toEqual([1, 0])
  })
})

describe('countByReason', () => {
  const reasons = ['harassment', 'spam', 'safety']

  test('biggest first', () => {
    const rows = countByReason(
      [{ reason: 'spam' }, { reason: 'spam' }, { reason: 'safety' }],
      reasons,
    )
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ['spam', 2],
      ['safety', 1],
      ['harassment', 0],
    ])
  })

  test('a reason nobody chose is still a row — that is the finding', () => {
    const rows = countByReason([{ reason: 'spam' }], reasons)
    expect(rows.map((r) => r.key).sort()).toEqual(['harassment', 'safety', 'spam'])
  })

  test('ties keep the declared order, so the chart does not reshuffle itself', () => {
    const a = countByReason([], reasons).map((r) => r.key)
    const b = countByReason([], reasons).map((r) => r.key)
    expect(a).toEqual(reasons)
    expect(b).toEqual(a)
  })

  test('a reason no longer offered is counted, never dropped and never merged', () => {
    const rows = countByReason([{ reason: 'witchcraft' }, { reason: 'spam' }], reasons)
    const unknown = rows.find((r) => r.key === 'unknown')
    expect(unknown?.value).toBe(1)
    expect(rows.find((r) => r.key === 'spam').value).toBe(1)
  })

  test('a report with no reason at all still counts somewhere', () => {
    const rows = countByReason([{}, { reason: null }], reasons)
    expect(rows.find((r) => r.key === 'unknown')?.value).toBe(2)
  })

  test('nothing filed means no phantom "other" row', () => {
    expect(countByReason([], reasons).some((r) => r.key === 'unknown')).toBe(false)
  })
})
