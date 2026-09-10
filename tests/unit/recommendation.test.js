/**
 * Tests over the recommendation engine.
 *
 * These are pure functions — data in, numbers out — so they need no database,
 * no emulator and no browser. That is deliberate: the scoring is the part of
 * SmartSync worth defending, and it should be possible to prove it behaves
 * without standing anything up.
 */
import { describe, expect, test } from 'vitest'

import {
  calculateRecommendationScore,
  calculateUserCompatibility,
  computeParticipantSimilarity,
  computeSimilarUsersJoined,
  getRecommendationReasons,
  jaccardIndex,
  rankActivities,
  recommendationWeights,
  SIMILAR_USER_THRESHOLD,
} from '../../src/services/recommendationService'

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

describe('score bounds', () => {
  test('is always an integer between 0 and 100', () => {
    const score = calculateRecommendationScore(user(), activity())
    expect(Number.isInteger(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  test('the weights add up to 100', () => {
    const total = Object.values(recommendationWeights).reduce((sum, n) => sum + n, 0)
    expect(total).toBe(100)
  })

  test('a perfect match on every signal scores 100', () => {
    const score = calculateRecommendationScore(
      user({ historyCategories: ['Football'] }),
      activity({ distanceKm: 0, participants: 10, capacity: 10, participantSimilarity: 1 }),
    )
    expect(score).toBe(100)
  })

  test('survives corrupt weights without producing NaN or a negative score', () => {
    // Weights are persisted per device, so they outlive the version that
    // wrote them and can be edited by hand. Anything unusable falls back to
    // that signal's default rather than poisoning the arithmetic.
    const cases = [
      { interest: 'abc' },
      { interest: NaN },
      { interest: null },
      { interest: undefined },
      { interest: -50 },
      { interest: Infinity },
      {},
      { nonsense: 5 },
    ]
    for (const weights of cases) {
      const score = calculateRecommendationScore(user(), activity(), {
        ...recommendationWeights,
        ...weights,
      })
      expect(Number.isInteger(score)).toBe(true)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  test('every signal at zero scores zero rather than dividing by zero', () => {
    const score = calculateRecommendationScore(user(), activity(), {
      interest: 0,
      distance: 0,
      time: 0,
      history: 0,
      popularity: 0,
      behavior: 0,
    })
    expect(score).toBe(0)
  })

  test('survives an entirely empty user and activity', () => {
    expect(() => calculateRecommendationScore({}, {})).not.toThrow()
    expect(() => calculateRecommendationScore(null, null)).not.toThrow()
    expect(() => calculateRecommendationScore(undefined, undefined)).not.toThrow()
  })
})

describe('interest signal', () => {
  test('a category match beats a tag match, which beats neither', () => {
    const direct = calculateRecommendationScore(user(), activity({ category: 'Football' }))
    const viaTag = calculateRecommendationScore(
      user(),
      activity({ category: 'Fitness', tags: ['Football'] }),
    )
    const neither = calculateRecommendationScore(
      user(),
      activity({ category: 'Knitting', tags: ['Wool'] }),
    )
    expect(direct).toBeGreaterThan(viaTag)
    expect(viaTag).toBeGreaterThan(neither)
  })

  test('matching is case-insensitive', () => {
    const upper = calculateRecommendationScore(user({ interests: ['FOOTBALL'] }), activity())
    const lower = calculateRecommendationScore(user({ interests: ['football'] }), activity())
    expect(upper).toBe(lower)
  })
})

describe('distance signal', () => {
  test('nearer scores higher', () => {
    const near = calculateRecommendationScore(user(), activity({ distanceKm: 0.5 }))
    const far = calculateRecommendationScore(user(), activity({ distanceKm: 12 }))
    expect(near).toBeGreaterThan(far)
  })

  test('an unknown distance scores between near and far, not as zero km', () => {
    // The whole point of the fix: `|| 0` used to make "we have no idea where
    // you are" score identically to "it is right here".
    const unknown = calculateRecommendationScore(user(), activity({ distanceKm: null }))
    const here = calculateRecommendationScore(user(), activity({ distanceKm: 0 }))
    const faraway = calculateRecommendationScore(user(), activity({ distanceKm: 13 }))
    expect(unknown).toBeLessThan(here)
    expect(unknown).toBeGreaterThan(faraway)
  })

  test('undefined and null are treated the same', () => {
    expect(calculateRecommendationScore(user(), activity({ distanceKm: undefined }))).toBe(
      calculateRecommendationScore(user(), activity({ distanceKm: null })),
    )
  })
})

describe('time signal', () => {
  test('a matching time band scores higher', () => {
    const match = calculateRecommendationScore(user(), activity({ timeBand: 'Evening' }))
    const miss = calculateRecommendationScore(user(), activity({ timeBand: 'Morning' }))
    expect(match).toBeGreaterThan(miss)
  })

  test('no stated preference does not count as a match', () => {
    const noPreference = calculateRecommendationScore(
      user({ preferredTime: '' }),
      activity({ timeBand: '' }),
    )
    const stated = calculateRecommendationScore(user(), activity({ timeBand: 'Evening' }))
    expect(noPreference).toBeLessThan(stated)
  })
})

describe('history and popularity signals', () => {
  test('history only counts where interests do not already say it', () => {
    // The signal is revealed preference. A category you already listed as an
    // interest is scored by the interest term; counting it twice was measured
    // to make the ranking worse, not better.
    const alsoAnInterest = user({ interests: ['Football'], historyCategories: ['Football'] })
    const onlyInHistory = user({ interests: ['Gaming'], historyCategories: ['Football'] })
    const neither = user({ interests: ['Gaming'], historyCategories: [] })

    const football = activity({ category: 'Football', tags: [] })
    // Same interests, differing only in whether history adds anything.
    expect(calculateRecommendationScore(onlyInHistory, football)).toBeGreaterThan(
      calculateRecommendationScore(neither, football),
    )
    // And a stated interest is not double-counted through history.
    expect(calculateRecommendationScore(alsoAnInterest, football)).toBe(
      calculateRecommendationScore(
        user({ interests: ['Football'], historyCategories: [] }),
        football,
      ),
    )
  })

  test('a fuller activity scores higher', () => {
    const busy = calculateRecommendationScore(user(), activity({ participants: 9, capacity: 10 }))
    const empty = calculateRecommendationScore(user(), activity({ participants: 0, capacity: 10 }))
    expect(busy).toBeGreaterThan(empty)
  })

  test('a zero capacity does not divide by zero', () => {
    const score = calculateRecommendationScore(user(), activity({ capacity: 0, participants: 0 }))
    expect(Number.isFinite(score)).toBe(true)
  })
})

describe('reasons', () => {
  test('never claims a time fit when neither side stated a time', () => {
    // This was both a crash and a lie: two empty strings compared equal, so
    // the app announced "fits your preferred time" for a preference nobody
    // had expressed.
    const reasons = getRecommendationReasons(
      user({ preferredTime: '' }),
      activity({ timeBand: '' }),
    )
    expect(reasons.join(' ')).not.toMatch(/preferred/i)
  })

  test('mentions a zero-kilometre activity rather than skipping it', () => {
    const reasons = getRecommendationReasons(user(), activity({ distanceKm: 0 }))
    expect(reasons.some((r) => /away/.test(r))).toBe(true)
  })

  test('always returns at least one reason', () => {
    expect(getRecommendationReasons({}, {}).length).toBeGreaterThan(0)
  })

  test('does not throw on missing data', () => {
    expect(() => getRecommendationReasons(null, null)).not.toThrow()
    expect(() => getRecommendationReasons(user(), { category: 'Football' })).not.toThrow()
  })
})

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

  test('discriminates where the boolean could not', () => {
    // Both of these are below the threshold, so the old yes/no scored them
    // identically. The point of the change is that they no longer are.
    const near = calculateRecommendationScore(user(), activity({ participantSimilarity: 0.45 }))
    const far = calculateRecommendationScore(user(), activity({ participantSimilarity: 0.05 }))
    expect(near).toBeGreaterThan(far)
  })

  test('an unknown similarity scores between the extremes', () => {
    const unknown = calculateRecommendationScore(user(), activity({ participantSimilarity: null }))
    const best = calculateRecommendationScore(user(), activity({ participantSimilarity: 1 }))
    const worst = calculateRecommendationScore(user(), activity({ participantSimilarity: 0 }))
    expect(unknown).toBeLessThan(best)
    expect(unknown).toBeGreaterThan(worst)
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

describe('ranking', () => {
  const activities = [
    activity({ id: 'far', category: 'Knitting', tags: [], distanceKm: 14, timeBand: 'Morning' }),
    activity({ id: 'near', category: 'Football', distanceKm: 0.5 }),
    activity({ id: 'mid', category: 'Gaming', distanceKm: 5, timeBand: 'Morning' }),
  ]

  test('returns highest score first', () => {
    const ranked = rankActivities(user(), activities, [])
    const scores = ranked.map((a) => a.matchScore)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(ranked[0].id).toBe('near')
  })

  test('does not mutate the input', () => {
    const input = [activity()]
    const snapshot = JSON.stringify(input)
    rankActivities(user(), input, [])
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  test('attaches a score and reasons to every activity', () => {
    rankActivities(user(), activities, []).forEach((a) => {
      expect(typeof a.matchScore).toBe('number')
      expect(Array.isArray(a.reasons)).toBe(true)
      expect(a.reasons.length).toBeGreaterThan(0)
    })
  })

  test('handles an empty activity list', () => {
    expect(rankActivities(user(), [], [])).toEqual([])
  })
})

describe('fuzzing', () => {
  const pick = (list) => list[Math.floor(Math.random() * list.length)]
  const maybe = (value) => (Math.random() < 0.25 ? undefined : value)
  const pool = ['Football', 'Gaming', 'Study', '', null, 42, {}]

  test('never produces an invalid score across 5000 random profiles', () => {
    for (let i = 0; i < 5000; i += 1) {
      const randomUser = {
        interests: maybe([pick(pool), pick(pool)]),
        preferredTime: maybe(pick(['Morning', 'Evening', '', null])),
        historyCategories: maybe([pick(pool)]),
      }
      const randomActivity = {
        category: maybe(pick(pool)),
        tags: maybe([pick(pool)]),
        timeBand: maybe(pick(['Morning', 'Evening', '', null])),
        distanceKm: maybe(pick([0, 3, 40, -5, null, NaN])),
        participants: maybe(pick([0, 5, 999, -1])),
        capacity: maybe(pick([0, 10, 1])),
      }
      const score = calculateRecommendationScore(randomUser, randomActivity)
      expect(Number.isInteger(score)).toBe(true)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
      expect(getRecommendationReasons(randomUser, randomActivity).length).toBeGreaterThan(0)
    }
  })

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
