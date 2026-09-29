/**
 * Which rows Discover shows.
 *
 * The rows are the part that can quietly lose an activity. Discover used to
 * stop at six cards with the true total printed beside the heading, and
 * people read it as their activity never having been posted; the rows by
 * category are what replaces that guarantee. Most of this file is that one
 * promise, stated the several ways it could be broken.
 */
import { describe, expect, test } from 'vitest'

import {
  FILLING_AT,
  MIN_CURATED,
  RAIL_LIMIT,
  coversEverything,
  discoverRows,
} from '../../src/services/discoverRows'

const HOUR = 3_600_000
const BASE = 2_000_000_000_000

const activity = (id, over = {}) => ({
  id,
  title: id,
  category: 'Coffee',
  startsAt: BASE,
  participants: 1,
  capacity: 10,
  ...over,
})

/** `n` activities an hour apart, cycling through `categories`. */
const feed = (n, categories = ['Coffee']) =>
  Array.from({ length: n }, (_, i) =>
    activity(`a${i}`, {
      category: categories[i % categories.length],
      startsAt: BASE + i * HOUR,
    }),
  )

const rowsByKind = (rows, kind) => rows.filter((row) => row.kind === kind)

describe('nothing falls out of all the rows', () => {
  test('every activity is somewhere, in a feed bigger than any row', () => {
    const activities = feed(RAIL_LIMIT * 3, ['Coffee', 'Gaming', 'Study'])
    const rows = discoverRows({ activities })
    expect(coversEverything(rows, activities)).toBe(true)
  })

  test('the hero is still in its row by category', () => {
    // It is kept out of the curated rows so the first row is not the hero
    // again — but out of the partition it would be the one activity on the
    // page that no row accounts for.
    const activities = feed(8, ['Coffee', 'Gaming'])
    const rows = discoverRows({ activities, heroId: 'a0' })
    expect(coversEverything(rows, activities)).toBe(true)
    const coffee = rows.find((row) => row.key === 'category:coffee')
    expect(coffee.items.some((item) => item.id === 'a0')).toBe(true)
  })

  test('the rows by category are a partition — each activity in exactly one', () => {
    const activities = feed(30, ['Coffee', 'Gaming', 'Study', 'Food'])
    const categories = rowsByKind(discoverRows({ activities }), 'category')
    const seen = []
    for (const row of categories) for (const item of row.items) seen.push(item.id)
    expect(seen).toHaveLength(activities.length)
    expect(new Set(seen).size).toBe(activities.length)
  })

  test('an activity with no category is kept, not dropped', () => {
    const activities = [activity('a1', { category: '' }), activity('a2', { category: null })]
    const rows = discoverRows({ activities })
    expect(coversEverything(rows, activities)).toBe(true)
    expect(rows.find((row) => row.key === 'category:other').items).toHaveLength(2)
  })

  test('a category is one row however its name is cased or spaced', () => {
    const activities = [
      activity('a1', { category: 'Coffee' }),
      activity('a2', { category: 'coffee' }),
      activity('a3', { category: ' COFFEE ' }),
    ]
    const categories = rowsByKind(discoverRows({ activities }), 'category')
    expect(categories).toHaveLength(1)
    expect(categories[0].items).toHaveLength(3)
  })

  test('a category bigger than a curated row is not truncated to fit one', () => {
    // Capping the rows by category is exactly how the old feed lost the rest.
    const activities = feed(RAIL_LIMIT + 9)
    const coffee = discoverRows({ activities }).find((row) => row.key === 'category:coffee')
    expect(coffee.items).toHaveLength(RAIL_LIMIT + 9)
  })
})

describe('a row has to earn its heading', () => {
  test('a curated row needs more than one in it', () => {
    const activities = [activity('a1', { participants: 9, capacity: 10 })]
    const rows = discoverRows({ activities })
    // One "Filling up" over one activity is not a finding.
    expect(rowsByKind(rows, 'filling')).toHaveLength(0)
    expect(rowsByKind(rows, 'soon')).toHaveLength(0)
    // The category row is the coverage, so it appears at any size.
    expect(rowsByKind(rows, 'category')).toHaveLength(1)
  })

  test('"Near you" only appears where the distance is actually known', () => {
    const withNone = feed(6)
    expect(rowsByKind(discoverRows({ activities: withNone }), 'near')).toHaveLength(0)
    // One activity with a distance is not a row about what is near you.
    const withOne = [...feed(5), activity('near1', { distanceKm: 0.4 })]
    expect(rowsByKind(discoverRows({ activities: withOne }), 'near')).toHaveLength(0)
    const withTwo = [
      ...feed(5),
      activity('near1', { distanceKm: 2.5 }),
      activity('near2', { distanceKm: 0.4 }),
    ]
    const near = rowsByKind(discoverRows({ activities: withTwo }), 'near')[0]
    expect(near.items.map((item) => item.id)).toEqual(['near2', 'near1'])
  })

  test('"Filling up" is what is nearly taken and can still be joined', () => {
    const activities = [
      activity('empty', { participants: 1, capacity: 10 }),
      activity('full', { participants: 10, capacity: 10 }),
      activity('nearly', { participants: 9, capacity: 10 }),
      activity('alsoNearly', { participants: 8, capacity: 10 }),
    ]
    const filling = rowsByKind(discoverRows({ activities }), 'filling')[0]
    // Something already full is not an answer to "what am I doing tonight",
    // and something a quarter full is not news.
    expect(filling.items.map((item) => item.id)).toEqual(['nearly', 'alsoNearly'])
    expect(9 / 10).toBeGreaterThanOrEqual(FILLING_AT)
  })

  test('nothing in means no rows at all, rather than empty headings', () => {
    expect(discoverRows({ activities: [] })).toEqual([])
    expect(discoverRows()).toEqual([])
  })
})

describe('the order the rows come in', () => {
  test('what is on soonest is first, and it is in start order', () => {
    const activities = [...feed(4)].reverse()
    const rows = discoverRows({ activities })
    expect(rows[0].kind).toBe('soon')
    expect(rows[0].items.map((item) => item.id)).toEqual(['a0', 'a1', 'a2', 'a3'])
  })

  test('the biggest category leads, and ties keep a stable order', () => {
    const activities = [
      ...feed(3, ['Gaming']),
      activity('c1', { category: 'Coffee' }),
      activity('s1', { category: 'Study' }),
    ]
    const categories = rowsByKind(discoverRows({ activities }), 'category')
    expect(categories[0].category).toBe('gaming')
    // Coffee and Study both have one: by name, so the page does not
    // rearrange itself between renders.
    expect(categories.slice(1).map((row) => row.category)).toEqual(['coffee', 'study'])
  })

  test('a curated row is capped, and takes the soonest of what it has', () => {
    const activities = feed(RAIL_LIMIT + 5)
    const soon = discoverRows({ activities })[0]
    expect(soon.items).toHaveLength(RAIL_LIMIT)
    expect(soon.items[0].id).toBe('a0')
    expect(MIN_CURATED).toBeLessThan(RAIL_LIMIT)
  })
})
