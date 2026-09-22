/**
 * Tests over what is left of the recommendation engine: the compatibility
 * score behind People match, the "somebody like you is going" fact that
 * the AI Picks request carries, and the one order the browser imposes on
 * a feed before the model ranks it.
 *
 * Pure functions — data in, values out — so no database, no emulator and
 * no browser.
 */
import { describe, expect, test } from 'vitest'

import {
  calculateUserCompatibility,
  computeParticipantSimilarity,
  computeSimilarUsersJoined,
  enrichActivities,
  jaccardIndex,
  SIMILAR_USER_THRESHOLD,
} from '../../src/services/compatibility'

const user = (overrides = {}) => ({
  uid: 'me',
  interests: ['Football', 'Gaming'],
  preferredTime: 'Evening',
  historyCategories: ['Football'],
  ...overrides,
})

const activity = (overrides = {}) => ({
  id: 'a1',
  category: 'Football',
  tags: ['Football'],
  timeBand: 'Evening',
  distanceKm: 1,
  participants: 5,
  capacity: 10,
  participantUids: [],
  ...overrides,
})

// ---------------------------------------------------------------------------

describe('jaccard index', () => {
  test('identical sets score 1, disjoint sets score 0', () => {
    expect(jaccardIndex(['a', 'b'], ['a', 'b'])).toBe(1)
    expect(jaccardIndex(['a'], ['b'])).toBe(0)
  })

  test('two empty lists score 0, not NaN', () => {
    // No shared evidence is not the same as perfect agreement.
    expect(jaccardIndex([], [])).toBe(0)
  })

  test('is symmetric', () => {
    expect(jaccardIndex(['a', 'b', 'c'], ['b'])).toBe(jaccardIndex(['b'], ['a', 'b', 'c']))
  })

  test('penalises listing everything', () => {
    const focused = jaccardIndex(['Football'], ['Football'])
    const scattergun = jaccardIndex(
      ['Football'],
      ['Football', 'Gym', 'Study', 'Coffee', 'Movies', 'Food'],
    )
    expect(focused).toBeGreaterThan(scattergun)
  })

  test('coerces non-strings instead of throwing', () => {
    expect(() => jaccardIndex([1, null, {}], ['1'])).not.toThrow()
  })
})

describe('user compatibility', () => {
  const other = (overrides = {}) => ({
    uid: 'u2',
    interests: ['Football', 'Gym'],
    preferredTime: 'Evening',
    historyCategories: ['Football'],
    ...overrides,
  })

  test('is an integer between 0 and 100', () => {
    const { score } = calculateUserCompatibility(user(), other())
    expect(Number.isInteger(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  test('is symmetric', () => {
    expect(calculateUserCompatibility(user(), other()).score).toBe(
      calculateUserCompatibility(other(), user()).score,
    )
  })

  test('identical people score 100', () => {
    const person = user()
    expect(calculateUserCompatibility(person, { ...person, uid: 'u2' }).score).toBe(100)
  })

  test('reports the shared interests it found', () => {
    const { shared } = calculateUserCompatibility(user(), other())
    expect(shared).toEqual(['football'])
  })

  test('someone who lists every interest does not match everybody', () => {
    const everything = other({
      interests: ['Football', 'Gaming', 'Gym', 'Study', 'Coffee', 'Movies', 'Food', 'Running'],
    })
    const focused = other({ interests: ['Football', 'Gaming'] })
    expect(calculateUserCompatibility(user(), focused).score).toBeGreaterThan(
      calculateUserCompatibility(user(), everything).score,
    )
  })

  test('survives missing profiles', () => {
    expect(() => calculateUserCompatibility(null, null)).not.toThrow()
    expect(calculateUserCompatibility({}, {}).score).toBe(0)
  })
})

describe('participant similarity (the continuous collaborative signal)', () => {
  const peers = [
    {
      uid: 'twin',
      interests: ['Football', 'Gaming'],
      preferredTime: 'Evening',
      historyCategories: ['Football'],
    },
    { uid: 'stranger', interests: ['Knitting'], preferredTime: 'Morning', historyCategories: [] },
  ]

  test('is null when nobody else has joined', () => {
    // Genuinely unknown, not zero — the scorer must not read "empty" as
    // "full of people unlike you".
    expect(
      computeParticipantSimilarity(user(), activity({ participantUids: [] }), peers),
    ).toBeNull()
    expect(
      computeParticipantSimilarity(user(), activity({ participantUids: ['me'] }), peers),
    ).toBeNull()
  })

  test('is null when no joined peer has a loaded profile', () => {
    expect(
      computeParticipantSimilarity(user(), activity({ participantUids: ['ghost'] }), peers),
    ).toBeNull()
  })

  test('reports the best match, not the average', () => {
    // One person worth meeting should not be diluted by a crowd of strangers.
    const both = computeParticipantSimilarity(
      user(),
      activity({ participantUids: ['twin', 'stranger'] }),
      peers,
    )
    const twinOnly = computeParticipantSimilarity(
      user(),
      activity({ participantUids: ['twin'] }),
      peers,
    )
    expect(both).toBe(twinOnly)
  })

  test('is between 0 and 1', () => {
    const value = computeParticipantSimilarity(
      user(),
      activity({ participantUids: ['twin'] }),
      peers,
    )
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(1)
  })
})

describe('similar users joined', () => {
  const peers = [
    {
      uid: 'twin',
      interests: ['Football', 'Gaming'],
      preferredTime: 'Evening',
      historyCategories: ['Football'],
    },
    { uid: 'stranger', interests: ['Knitting'], preferredTime: 'Morning', historyCategories: [] },
  ]

  test('is false when nobody has joined', () => {
    expect(computeSimilarUsersJoined(user(), activity({ participantUids: [] }), peers)).toBe(false)
  })

  test('ignores the user themselves', () => {
    // Otherwise everyone is trivially "similar" to their own activities.
    expect(computeSimilarUsersJoined(user(), activity({ participantUids: ['me'] }), peers)).toBe(
      false,
    )
  })

  test('is true when a compatible peer joined', () => {
    expect(computeSimilarUsersJoined(user(), activity({ participantUids: ['twin'] }), peers)).toBe(
      true,
    )
  })

  test('is false when only an incompatible peer joined', () => {
    expect(
      computeSimilarUsersJoined(user(), activity({ participantUids: ['stranger'] }), peers),
    ).toBe(false)
  })

  test('ignores uids with no known profile', () => {
    expect(computeSimilarUsersJoined(user(), activity({ participantUids: ['ghost'] }), peers)).toBe(
      false,
    )
  })

  test('the threshold is a real compatibility score', () => {
    const twin = calculateUserCompatibility(user(), peers[0]).score
    const stranger = calculateUserCompatibility(user(), peers[1]).score
    expect(twin).toBeGreaterThanOrEqual(SIMILAR_USER_THRESHOLD)
    expect(stranger).toBeLessThan(SIMILAR_USER_THRESHOLD)
  })
})

describe('enrichActivities', () => {
  const peers = [
    {
      uid: 'twin',
      interests: ['Football', 'Gaming'],
      preferredTime: 'Evening',
      historyCategories: ['Football'],
    },
  ]

  test('soonest first, unknown start last, and the input untouched', () => {
    const list = [
      activity({ id: 'later', startsAt: 300 }),
      activity({ id: 'never' }),
      activity({ id: 'soon', startsAt: 100 }),
      activity({ id: 'next', startsAt: 200 }),
    ]
    const before = list.map((a) => a.id)
    expect(enrichActivities(user(), list, peers).map((a) => a.id)).toEqual([
      'soon',
      'next',
      'later',
      'never',
    ])
    expect(list.map((a) => a.id)).toEqual(before)
  })

  test('attaches whether somebody like you is going, and nothing else', () => {
    const [withTwin, alone] = enrichActivities(
      user(),
      [
        activity({ id: 'a', startsAt: 1, participantUids: ['twin'] }),
        activity({ id: 'b', startsAt: 2, participantUids: [] }),
      ],
      peers,
    )
    expect(withTwin.similarUsersJoined).toBe(true)
    expect(alone.similarUsersJoined).toBe(false)
    expect(withTwin).not.toHaveProperty('matchScore')
    expect(withTwin).not.toHaveProperty('reasons')
  })

  test('handles an empty list', () => {
    expect(enrichActivities(user(), [], peers)).toEqual([])
  })
})

describe('fuzzing', () => {
  const pick = (list) => list[Math.floor(Math.random() * list.length)]
  const maybe = (value) => (Math.random() < 0.25 ? undefined : value)
  const pool = ['Football', 'Gaming', 'Study', '', null, 42, {}]

  test('compatibility stays symmetric and in range across 3000 random pairs', () => {
    for (let i = 0; i < 3000; i += 1) {
      const a = {
        interests: maybe([pick(pool)]),
        preferredTime: maybe(pick(['Morning', ''])),
        historyCategories: maybe([pick(pool)]),
      }
      const b = {
        interests: maybe([pick(pool)]),
        preferredTime: maybe(pick(['Morning', ''])),
        historyCategories: maybe([pick(pool)]),
      }
      const forward = calculateUserCompatibility(a, b).score
      const backward = calculateUserCompatibility(b, a).score
      expect(forward).toBe(backward)
      expect(Number.isInteger(forward)).toBe(true)
      expect(forward).toBeGreaterThanOrEqual(0)
      expect(forward).toBeLessThanOrEqual(100)
    }
  })
})
