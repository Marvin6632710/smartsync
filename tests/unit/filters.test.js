/**
 * The discovery filters as sets: what a stored filter of any age becomes,
 * how an activity is matched against one (OR within a group, AND between
 * them), and what counts as "narrowing the feed".
 */
import { describe, expect, test } from 'vitest'
import {
  activeFilterCount,
  defaultFilters,
  DISTANCE_RANGE,
  filtersActive,
  matchesFilters,
  normaliseFilters,
  toggleChoice,
} from '../../src/utils/filters'
import { categories, timeBands } from '../../src/data/categories'

describe('normaliseFilters', () => {
  test('nothing stored gives the defaults: every category, any time', () => {
    expect(normaliseFilters(undefined)).toEqual(defaultFilters)
    expect(normaliseFilters(null)).toEqual(defaultFilters)
    expect(normaliseFilters({})).toEqual(defaultFilters)
    expect(normaliseFilters('junk')).toEqual(defaultFilters)
    expect(normaliseFilters([1, 2])).toEqual(defaultFilters)
  })

  test('the shape saved before 2026-09-21 — one choice per group — becomes a set of one', () => {
    expect(
      normaliseFilters({
        category: 'Football',
        maxDistance: 5,
        timeBand: 'Morning',
        availableOnly: false,
      }),
    ).toEqual({
      categories: ['Football'],
      maxDistance: 5,
      timeBands: ['Morning'],
      availableOnly: false,
    })
  })

  test("the old 'All' and 'Any' choices become the empty set, which means the same thing", () => {
    expect(
      normaliseFilters({ category: 'All', timeBand: 'Any', maxDistance: 10, availableOnly: true }),
    ).toEqual(defaultFilters)
  })

  test('the current shape passes through, in the vocabulary’s order and without repeats', () => {
    const stored = {
      categories: ['Running', 'Football', 'Running'],
      timeBands: ['Evening', 'Morning'],
      maxDistance: 3,
      availableOnly: true,
    }
    expect(normaliseFilters(stored)).toEqual({
      categories: ['Football', 'Running'],
      timeBands: ['Morning', 'Evening'],
      maxDistance: 3,
      availableOnly: true,
    })
  })

  test('a category or band that is not in the vocabulary is dropped, alone', () => {
    expect(
      normaliseFilters({ categories: ['Football', 'Knitting'], timeBands: ['Night', 'Evening'] }),
    ).toEqual({ ...defaultFilters, categories: ['Football'], timeBands: ['Evening'] })
    expect(normaliseFilters({ category: 'Knitting', timeBand: 'Night' })).toEqual(defaultFilters)
  })

  test('each field falls back on its own', () => {
    expect(
      normaliseFilters({ categories: 'Football', timeBands: { a: 1 }, maxDistance: 'far' }),
    ).toEqual(defaultFilters)
    expect(normaliseFilters({ availableOnly: 'yes' }).availableOnly).toBe(true)
    expect(normaliseFilters({ availableOnly: false }).availableOnly).toBe(false)
  })

  test('the distance is kept within the slider, and is a whole number', () => {
    expect(normaliseFilters({ maxDistance: 0 }).maxDistance).toBe(defaultFilters.maxDistance)
    expect(normaliseFilters({ maxDistance: -4 }).maxDistance).toBe(defaultFilters.maxDistance)
    expect(normaliseFilters({ maxDistance: 400 }).maxDistance).toBe(DISTANCE_RANGE.max)
    // The range reaches across a city, not across a district. A stored
    // choice from the old fifteen-kilometre slider is still inside it,
    // so nobody's saved filter quietly changed meaning when it moved.
    expect(DISTANCE_RANGE.max).toBe(30)
    expect(defaultFilters.maxDistance).toBe(20)
    // The filters are written to storage on mount, so every device that
    // has opened SmartSync already holds a number — including the ones
    // that never touched the slider. A stored ten is read as "never
    // chose one" and moves with the default; without this, raising the
    // default would have reached nobody who had used the app before.
    expect(normaliseFilters({ maxDistance: 10 }).maxDistance).toBe(20)
    // A choice that was never the default is left exactly alone.
    expect(normaliseFilters({ maxDistance: 3 }).maxDistance).toBe(3)
    expect(normaliseFilters({ maxDistance: 15 }).maxDistance).toBe(15)
    expect(normaliseFilters({ maxDistance: 30 }).maxDistance).toBe(30)
    expect(normaliseFilters({ maxDistance: 0.4 }).maxDistance).toBe(DISTANCE_RANGE.min)
    expect(normaliseFilters({ maxDistance: '7' }).maxDistance).toBe(7)
    expect(normaliseFilters({ maxDistance: 7.6 }).maxDistance).toBe(8)
  })
})

describe('toggleChoice', () => {
  test('adds what is absent and removes what is present, keeping the vocabulary’s order', () => {
    expect(toggleChoice([], 'Running', categories)).toEqual(['Running'])
    expect(toggleChoice(['Running'], 'Football', categories)).toEqual(['Football', 'Running'])
    expect(toggleChoice(['Football', 'Running'], 'Football', categories)).toEqual(['Running'])
    expect(toggleChoice(['Evening'], 'Morning', timeBands)).toEqual(['Morning', 'Evening'])
  })
})

describe('matchesFilters', () => {
  const activity = (extra = {}) => ({
    category: 'Football',
    timeBand: 'Morning',
    distanceKm: 4,
    participants: 2,
    capacity: 8,
    ...extra,
  })
  const filters = (extra = {}) => ({ ...defaultFilters, ...extra })

  test('the defaults let everything through that has room', () => {
    expect(matchesFilters(activity(), filters())).toBe(true)
    expect(matchesFilters(activity({ category: 'Coffee', timeBand: 'Evening' }), filters())).toBe(
      true,
    )
    expect(matchesFilters(activity({ participants: 8 }), filters())).toBe(false)
    expect(matchesFilters(activity({ participants: 8 }), filters({ availableOnly: false }))).toBe(
      true,
    )
  })

  test('within a group any one member will do', () => {
    const f = filters({ categories: ['Football', 'Basketball'] })
    expect(matchesFilters(activity({ category: 'Football' }), f)).toBe(true)
    expect(matchesFilters(activity({ category: 'Basketball' }), f)).toBe(true)
    expect(matchesFilters(activity({ category: 'Running' }), f)).toBe(false)
    const g = filters({ timeBands: ['Morning', 'Evening'] })
    expect(matchesFilters(activity({ timeBand: 'Morning' }), g)).toBe(true)
    expect(matchesFilters(activity({ timeBand: 'Evening' }), g)).toBe(true)
    expect(matchesFilters(activity({ timeBand: 'Afternoon' }), g)).toBe(false)
  })

  test('between the groups every one must hold', () => {
    const f = filters({ categories: ['Football', 'Basketball'], timeBands: ['Morning', 'Evening'] })
    expect(matchesFilters(activity({ category: 'Football', timeBand: 'Morning' }), f)).toBe(true)
    expect(matchesFilters(activity({ category: 'Basketball', timeBand: 'Evening' }), f)).toBe(true)
    expect(matchesFilters(activity({ category: 'Football', timeBand: 'Afternoon' }), f)).toBe(false)
    expect(matchesFilters(activity({ category: 'Running', timeBand: 'Morning' }), f)).toBe(false)
    // …and the distance and the room are still part of "every one".
    // Measured against the default rather than a fixed number, so moving
    // the default tests the boundary instead of failing on arithmetic.
    const beyond = defaultFilters.maxDistance + 1
    expect(matchesFilters(activity({ distanceKm: beyond }), f)).toBe(false)
    expect(matchesFilters(activity({ distanceKm: defaultFilters.maxDistance }), f)).toBe(true)
    expect(matchesFilters(activity({ participants: 8 }), f)).toBe(false)
  })

  test('an unknown distance is never a reason to hide something', () => {
    expect(matchesFilters(activity({ distanceKm: null }), filters({ maxDistance: 1 }))).toBe(true)
    expect(matchesFilters(activity({ distanceKm: undefined }), filters({ maxDistance: 1 }))).toBe(
      true,
    )
    expect(matchesFilters(activity({ distanceKm: 1.5 }), filters({ maxDistance: 1 }))).toBe(false)
  })
})

describe('what counts as narrowing the feed', () => {
  test('the defaults narrow nothing', () => {
    expect(activeFilterCount(defaultFilters)).toBe(0)
    expect(filtersActive(defaultFilters)).toBe(false)
    // Equal by value, not by identity — a freshly loaded copy is still the default.
    expect(filtersActive(normaliseFilters({ categories: [], timeBands: [] }))).toBe(false)
  })

  test('each chosen category and band counts one; the distance and the switch count one each', () => {
    expect(activeFilterCount({ ...defaultFilters, categories: ['Football', 'Basketball'] })).toBe(2)
    expect(activeFilterCount({ ...defaultFilters, timeBands: ['Morning'] })).toBe(1)
    expect(activeFilterCount({ ...defaultFilters, maxDistance: 3 })).toBe(1)
    expect(activeFilterCount({ ...defaultFilters, availableOnly: false })).toBe(1)
    expect(
      activeFilterCount({
        categories: ['Football', 'Basketball'],
        timeBands: ['Morning', 'Evening'],
        maxDistance: 3,
        availableOnly: false,
      }),
    ).toBe(6)
    expect(filtersActive({ ...defaultFilters, timeBands: ['Morning'] })).toBe(true)
  })
})
