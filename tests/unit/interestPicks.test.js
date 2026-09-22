/**
 * What AI Picks is allowed to show.
 *
 * The page tells the user "everything here is from the interests you chose".
 * That is a promise they can check by eye — they picked Football and Coffee,
 * so a Gaming card appearing means the page is lying and nothing else on it
 * is worth believing either. These tests are mostly about that promise, and
 * about the edges where it would be tempting to break it: no interests
 * chosen, unknown categories, odd casing.
 */
import { describe, expect, test } from 'vitest'
import {
  groupByInterest,
  interestSet,
  interestsWithNothing,
  listInWords,
  matchesInterests,
  pickForInterests,
} from '../../src/services/interestPicks'

// The list arrives soonest first; `startsAt` is that order made visible.
const act = (id, category, startsAt = 50) => ({ id, category, startsAt })
const INTERESTS = ['Football', 'Coffee', 'Study']

const SAMPLE = [
  act('a', 'Football', 10),
  act('b', 'Gaming', 20),
  act('c', 'Coffee', 30),
  act('d', 'Football', 40),
  act('e', 'Movies', 50),
  act('f', 'Coffee', 60),
]

describe('matchesInterests', () => {
  test('keeps what the user chose and drops what they did not', () => {
    expect(matchesInterests(act('x', 'Football'), INTERESTS)).toBe(true)
    expect(matchesInterests(act('x', 'Gaming'), INTERESTS)).toBe(false)
  })

  test('ignores casing and stray whitespace on both sides', () => {
    // Categories come from a fixed vocabulary, but interests are stored from
    // an older shape of the app and a mismatch here would silently empty the
    // page.
    expect(matchesInterests(act('x', 'football'), ['FOOTBALL'])).toBe(true)
    expect(matchesInterests(act('x', '  Coffee '), ['coffee'])).toBe(true)
  })

  test('a missing category never counts as a match', () => {
    expect(matchesInterests(act('x', undefined), INTERESTS)).toBe(false)
    expect(matchesInterests(act('x', ''), INTERESTS)).toBe(false)
    expect(matchesInterests(null, INTERESTS)).toBe(false)
  })

  test('no interests means nothing matches, rather than everything', () => {
    expect(matchesInterests(act('x', 'Football'), [])).toBe(false)
    expect(matchesInterests(act('x', 'Football'), null)).toBe(false)
  })
})

describe('pickForInterests', () => {
  test('shows only the chosen categories', () => {
    const picks = pickForInterests(SAMPLE, INTERESTS)
    expect(picks.map((a) => a.id)).toEqual(['a', 'c', 'd', 'f'])
    expect(picks.every((a) => INTERESTS.includes(a.category))).toBe(true)
  })

  test('leaves the incoming order untouched', () => {
    // The list arrives soonest first; filtering must not reorder it.
    const picks = pickForInterests(SAMPLE, INTERESTS)
    const starts = picks.map((a) => a.startsAt)
    expect(starts).toEqual([...starts].sort((x, y) => x - y))
  })

  test('with no interests it returns nothing, not everything', () => {
    // The failure that started this: falling back to the whole list is how
    // AI Picks became a copy of Discover.
    expect(pickForInterests(SAMPLE, [])).toEqual([])
    expect(pickForInterests(SAMPLE, undefined)).toEqual([])
  })

  test('nothing in, nothing out', () => {
    expect(pickForInterests([], INTERESTS)).toEqual([])
    expect(pickForInterests(null, INTERESTS)).toEqual([])
  })

  test('an interest nobody is hosting simply contributes nothing', () => {
    expect(pickForInterests(SAMPLE, ['Cycling'])).toEqual([])
  })
})

describe('groupByInterest', () => {
  test('groups under the interest that earned them', () => {
    const groups = groupByInterest(SAMPLE, INTERESTS)
    expect(groups.map((g) => g.label)).toEqual(['Football', 'Coffee'])
    expect(groups[0].items.map((a) => a.id)).toEqual(['a', 'd'])
    expect(groups[1].items.map((a) => a.id)).toEqual(['c', 'f'])
  })

  test('the group with something on soonest leads', () => {
    // Coffee's activity is the soonest here, so Coffee comes first despite
    // Football having more items.
    const groups = groupByInterest(
      [act('c', 'Coffee', 5), act('a', 'Football', 60), act('b', 'Football', 55)],
      INTERESTS,
    )
    expect(groups.map((g) => g.label)).toEqual(['Coffee', 'Football'])
  })

  test('an interest with nothing on produces no empty heading', () => {
    const groups = groupByInterest(SAMPLE, INTERESTS)
    expect(groups.map((g) => g.label)).not.toContain('Study')
  })

  test('keeps the category spelling the activity actually uses', () => {
    const groups = groupByInterest([act('a', 'Football', 70)], ['football'])
    expect(groups[0].label).toBe('Football')
  })

  test('no interests, no groups', () => {
    expect(groupByInterest(SAMPLE, [])).toEqual([])
  })
})

describe('interestsWithNothing', () => {
  test('names the interests with nothing on', () => {
    expect(interestsWithNothing(SAMPLE, INTERESTS)).toEqual(['Study'])
  })

  test('keeps the order and spelling the user chose', () => {
    expect(interestsWithNothing([], ['Coffee', 'Football'])).toEqual(['Coffee', 'Football'])
  })

  test('says nothing when every interest is covered', () => {
    expect(interestsWithNothing(SAMPLE, ['Football', 'Coffee'])).toEqual([])
  })

  test('a duplicated interest is only named once', () => {
    expect(interestsWithNothing([], ['Study', 'study', 'Study'])).toEqual(['Study'])
  })
})

describe('listInWords', () => {
  test('reads like a sentence at every length', () => {
    expect(listInWords([])).toBe('')
    expect(listInWords(['Football'])).toBe('Football')
    expect(listInWords(['Football', 'Coffee'])).toBe('Football and Coffee')
    expect(listInWords(['Football', 'Coffee', 'Study'])).toBe('Football, Coffee and Study')
  })

  test('survives gaps without printing "and undefined"', () => {
    expect(listInWords(['Football', null, 'Coffee'])).toBe('Football and Coffee')
    expect(listInWords(null)).toBe('')
  })
})

describe('interestSet', () => {
  test('deduplicates and normalises', () => {
    expect(interestSet(['Football', 'football', ' FOOTBALL '])).toEqual(new Set(['football']))
  })

  test('drops blanks rather than matching on them', () => {
    // An empty string in the set would make every activity with no category
    // a "match".
    const set = interestSet(['', '  ', null, 'Coffee'])
    expect(set).toEqual(new Set(['coffee']))
    expect(matchesInterests({ category: '' }, set)).toBe(false)
  })
})
