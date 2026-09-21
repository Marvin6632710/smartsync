/**
 * AI Picks, the browser's half: what is sent (and, more to the point,
 * what is not), what a cached answer is good for, and how the model's
 * codes become reasons worded from the activity's own data.
 */
import { describe, expect, test } from 'vitest'

import {
  buildPicksRequest,
  CANDIDATE_CAP,
  candidateOf,
  chooseCandidates,
  hasUsableLocation,
  improveHints,
  PICK_CAP,
  picksSignature,
  reasonFacts,
  resolvePicks,
  signalsOf,
  standardPicks,
  thinProfile,
} from '../../src/services/aiPicks'

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0)
const DAY = 86_400_000

const activity = (id, extra = {}) => ({
  id,
  title: `Activity ${id}`,
  description: 'A thing to do.',
  category: 'Football',
  timeBand: 'Evening',
  startsAt: NOW + 3 * DAY,
  date: '2026-09-24',
  time: '19:00',
  distanceKm: 2.34,
  capacity: 10,
  participants: 4,
  hostId: 'host-1',
  hostName: 'Somebody Real',
  hostAvatar: 'SR',
  locationName: 'Lumpini Park',
  lat: 13.73,
  lng: 100.54,
  participantUids: ['u1', 'u2'],
  matchScore: 61,
  reasonKeys: [{ key: 'interest', category: 'Football' }],
  similarUsersJoined: false,
  ...extra,
})
const user = (extra = {}) => ({
  uid: 'me',
  email: 'me@example.com',
  name: 'Me',
  interests: ['Football', 'coffee', 'Knitting', 'Football'],
  preferredTime: 'Evening',
  historyCategories: ['Running', 'Coffee'],
  location: { lat: 13.7, lng: 100.5 },
  ...extra,
})

describe('candidateOf', () => {
  test('is the facts about the activity, and none of the people', () => {
    const c = candidateOf(activity('a1'), NOW)
    expect(c).toEqual({
      id: 'a1',
      title: 'Activity a1',
      category: 'Football',
      timeBand: 'Evening',
      daysAhead: 3,
      distanceKm: 2.3,
      capacity: 10,
      participants: 4,
      similar: false,
      matchScore: 61,
      description: 'A thing to do.',
    })
    for (const field of [
      'hostId',
      'hostName',
      'hostAvatar',
      'locationName',
      'lat',
      'lng',
      'participantUids',
    ])
      expect(c).not.toHaveProperty(field)
  })

  test('an unknown distance stays unknown — never nought', () => {
    expect(candidateOf(activity('a1', { distanceKm: null }), NOW).distanceKm).toBeNull()
    expect(candidateOf(activity('a1', { distanceKm: undefined }), NOW).distanceKm).toBeNull()
    expect(candidateOf(activity('a1', { distanceKm: 0 }), NOW).distanceKm).toBe(0)
  })

  test('days ahead never goes below nought, and long text is cut', () => {
    expect(candidateOf(activity('a1', { startsAt: NOW - DAY }), NOW).daysAhead).toBe(0)
    expect(candidateOf(activity('a1', { startsAt: NOW + 12 * 3_600_000 }), NOW).daysAhead).toBe(0)
    expect(
      candidateOf(activity('a1', { description: 'x'.repeat(1000) }), NOW).description,
    ).toHaveLength(240)
    expect(candidateOf(activity('a1', { title: 't'.repeat(200) }), NOW).title).toHaveLength(80)
  })
})

describe('signalsOf', () => {
  test('known interests once each, joined categories with counts, the time, whether distance is known', () => {
    const joined = [
      activity('j1', { category: 'Running' }),
      activity('j2', { category: 'Running' }),
      activity('j3', { category: 'Gym' }),
    ]
    expect(signalsOf(user(), joined)).toEqual({
      interests: ['Football', 'Coffee'],
      preferredTime: 'Evening',
      history: [
        { category: 'Running', joined: 2 },
        { category: 'Coffee', joined: 1 },
        { category: 'Gym', joined: 1 },
      ],
      hasLocation: true,
    })
  })

  test('nothing known reads as nothing known', () => {
    expect(signalsOf({ uid: 'x' })).toEqual({
      interests: [],
      preferredTime: '',
      history: [],
      hasLocation: false,
    })
    expect(
      signalsOf(user({ preferredTime: 'Night', location: { lat: 'x' } }), []).preferredTime,
    ).toBe('')
    expect(hasUsableLocation({ lat: 1, lng: 2 })).toBe(true)
    expect(hasUsableLocation(null)).toBe(false)
  })
})

describe('chooseCandidates and the request', () => {
  test('best-scored first, at most forty, only things with an id, a title and a category', () => {
    const many = Array.from({ length: 50 }, (_, i) => activity(`c${i}`, { matchScore: i }))
    const chosen = chooseCandidates([...many, { id: 'broken' }])
    expect(chosen).toHaveLength(CANDIDATE_CAP)
    expect(chosen[0].id).toBe('c49')
    expect(chosen.at(-1).id).toBe('c10')
  })

  test('the request is the signals and the candidates, with force only when asked', () => {
    const req = buildPicksRequest({
      user: user(),
      activities: [activity('a1')],
      joinedActivities: [],
      now: NOW,
    })
    expect(Object.keys(req).sort()).toEqual(['candidates', 'signals'])
    expect(req.candidates[0].id).toBe('a1')
    expect(JSON.stringify(req)).not.toMatch(/me@example|Somebody|Lumpini|u1|13\.7/)
    expect(
      buildPicksRequest({ user: user(), activities: [], joinedActivities: [], force: true }).force,
    ).toBe(true)
  })

  test('the signature is order-free and ignores what drifts', () => {
    const a = buildPicksRequest({
      user: user(),
      activities: [activity('a1'), activity('b2')],
      joinedActivities: [],
      now: NOW,
    })
    const b = buildPicksRequest({
      user: user({ interests: ['Coffee', 'Football'] }),
      activities: [activity('b2', { distanceKm: 9, participants: 9 }), activity('a1')],
      joinedActivities: [],
      now: NOW,
    })
    expect(picksSignature(a)).toBe(picksSignature(b))
    const c = buildPicksRequest({
      user: user({ preferredTime: '' }),
      activities: [activity('a1'), activity('b2')],
      joinedActivities: [],
      now: NOW,
    })
    expect(picksSignature(c)).not.toBe(picksSignature(a))
    const d = buildPicksRequest({
      user: user(),
      activities: [activity('a1')],
      joinedActivities: [],
      now: NOW,
    })
    expect(picksSignature(d)).not.toBe(picksSignature(a))
  })
})

describe('reasons', () => {
  test('a code becomes the facts the wording needs, from the activity itself', () => {
    const a = activity('a1', { capacity: 10, participants: 8, distanceKm: 1.5 })
    expect(reasonFacts('interest', a)).toEqual({ key: 'interest', category: 'Football' })
    expect(reasonFacts('time', a)).toEqual({ key: 'time', band: 'Evening' })
    expect(reasonFacts('distance', a)).toEqual({ key: 'distance', distanceKm: 1.5 })
    expect(reasonFacts('spots', a)).toEqual({ key: 'spots', count: 2 })
    expect(reasonFacts('history', a)).toEqual({ key: 'history' })
    expect(reasonFacts('made-up', a)).toBeNull()
    // No distance, no distance reason — whatever the model said.
    expect(reasonFacts('distance', activity('a1', { distanceKm: null }))).toBeNull()
  })

  test('picks are joined back to what is on screen; the rest is dropped', () => {
    const shown = [activity('a1'), activity('b2', { reasonKeys: [{ key: 'popularity' }] })]
    const out = resolvePicks(
      [
        { id: 'b2', reasons: ['made-up'] },
        { id: 'gone', reasons: ['interest'] },
        { id: 'a1', reasons: ['interest', 'time'] },
        { id: 'a1', reasons: [] },
      ],
      shown,
    )
    expect(out.map((p) => p.activity.id)).toEqual(['b2', 'a1'])
    // A pick with no usable reason wears the engine's own.
    expect(out[0].reasons).toEqual([{ key: 'popularity' }])
    expect(out[1].reasons).toEqual([
      { key: 'interest', category: 'Football' },
      { key: 'time', band: 'Evening' },
    ])
    expect(
      resolvePicks(
        Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, reasons: [] })),
        Array.from({ length: 12 }, (_, i) => activity(`c${i}`)),
      ),
    ).toHaveLength(PICK_CAP)
  })

  test('the standard picks are the same shape, from the engine', () => {
    const out = standardPicks([
      activity('a1', { matchScore: 10 }),
      activity('b2', { matchScore: 90 }),
    ])
    expect(out.map((p) => p.activity.id)).toEqual(['b2', 'a1'])
    expect(out[0].reasons).toEqual([{ key: 'interest', category: 'Football' }])
  })
})

describe('what would help', () => {
  test('a thin profile is one with nothing joined, or neither a time nor a place', () => {
    expect(thinProfile({ history: [], preferredTime: 'Evening', hasLocation: true })).toBe(true)
    expect(
      thinProfile({
        history: [{ category: 'Gym', joined: 1 }],
        preferredTime: '',
        hasLocation: false,
      }),
    ).toBe(true)
    expect(
      thinProfile({
        history: [{ category: 'Gym', joined: 1 }],
        preferredTime: 'Evening',
        hasLocation: false,
      }),
    ).toBe(false)
  })

  test('the hints are the gaps, in the order they matter', () => {
    expect(
      improveHints({ history: [], preferredTime: '', hasLocation: false }, { interestCount: 3 }),
    ).toEqual(['join', 'interests', 'time', 'location'])
    expect(
      improveHints(
        { history: [{ category: 'Gym', joined: 1 }], preferredTime: 'Evening', hasLocation: true },
        { interestCount: 6 },
      ),
    ).toEqual([])
  })
})
