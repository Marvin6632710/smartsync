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
  placesBefore,
  reasonFacts,
  resolvePicks,
  signalsOf,
  soonestFirst,
  thinProfile,
  unrankedPicks,
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
  test('is the facts about the activity — the place by name — and none of the people', () => {
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
      place: 'Lumpini Park',
      description: 'A thing to do.',
    })
    for (const field of ['hostId', 'hostName', 'hostAvatar', 'lat', 'lng', 'participantUids'])
      expect(c).not.toHaveProperty(field)
    // The name as written, tidied and cut; none is none.
    expect(candidateOf(activity('a1', { locationName: '  Siam   Square ' }), NOW).place).toBe(
      'Siam Square',
    )
    expect(candidateOf(activity('a1', { locationName: 'p'.repeat(90) }), NOW).place).toHaveLength(
      60,
    )
    expect(candidateOf(activity('a1', { locationName: undefined }), NOW).place).toBe('')
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
  test('known interests once each, joined categories with counts, the time, whether distance is known, the places', () => {
    const joined = [
      activity('j1', { category: 'Running' }),
      activity('j2', { category: 'Running', locationName: 'Benjakitti Park' }),
      activity('j3', { category: 'Gym', locationName: 'lumpini park' }),
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
      placesBefore: ['Lumpini Park', 'Benjakitti Park'],
    })
  })

  test('the places are names once each whatever the casing, at most twelve, never a coordinate', () => {
    const joined = [
      activity('j1', { locationName: 'A' }),
      activity('j2', { locationName: 'a' }),
      activity('j3', { locationName: '' }),
      activity('j4', { locationName: null }),
      ...Array.from({ length: 20 }, (_, i) => activity(`k${i}`, { locationName: `Place ${i}` })),
    ]
    const places = placesBefore(joined)
    expect(places).toHaveLength(12)
    expect(places.slice(0, 3)).toEqual(['A', 'Place 0', 'Place 1'])
    expect(JSON.stringify(places)).not.toMatch(/13\.7|100\.5/)
    expect(placesBefore(undefined)).toEqual([])
  })

  test('nothing known reads as nothing known', () => {
    expect(signalsOf({ uid: 'x' })).toEqual({
      interests: [],
      preferredTime: '',
      history: [],
      hasLocation: false,
      placesBefore: [],
    })
    expect(
      signalsOf(user({ preferredTime: 'Night', location: { lat: 'x' } }), []).preferredTime,
    ).toBe('')
    expect(hasUsableLocation({ lat: 1, lng: 2 })).toBe(true)
    expect(hasUsableLocation(null)).toBe(false)
  })
})

describe('chooseCandidates and the request', () => {
  test('soonest first, at most forty, only things with an id, a title and a category', () => {
    // Nothing scores them: when the cap bites, the nearest in time stay.
    const many = Array.from({ length: 50 }, (_, i) =>
      activity(`c${i}`, { startsAt: NOW + (50 - i) * DAY }),
    )
    const chosen = chooseCandidates([...many, { id: 'broken', startsAt: NOW }])
    expect(chosen).toHaveLength(CANDIDATE_CAP)
    expect(chosen[0].id).toBe('c49')
    expect(chosen.at(-1).id).toBe('c10')
  })

  test('soonestFirst puts an unknown start last and leaves the input alone', () => {
    const list = [
      activity('late', { startsAt: NOW + 5 * DAY }),
      activity('never', { startsAt: undefined }),
      activity('soon', { startsAt: NOW + DAY }),
    ]
    expect(soonestFirst(list).map((a) => a.id)).toEqual(['soon', 'late', 'never'])
    expect(list.map((a) => a.id)).toEqual(['late', 'never', 'soon'])
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
    // The place goes by name (ADR-031); nobody's name, uid or coordinates do.
    expect(req.candidates[0].place).toBe('Lumpini Park')
    expect(JSON.stringify(req)).not.toMatch(/me@example|Somebody|"u1"|13\.7|100\.5/)
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
    // A place joined since is a new question.
    const e = buildPicksRequest({
      user: user(),
      activities: [activity('a1'), activity('b2')],
      joinedActivities: [activity('j1', { locationName: 'Siam Square' })],
      now: NOW,
    })
    expect(picksSignature(e)).not.toBe(picksSignature(a))
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
    // The place by its name; no name, no place reason.
    expect(reasonFacts('place', a)).toEqual({ key: 'place', place: 'Lumpini Park' })
    expect(reasonFacts('place', activity('a1', { locationName: '' }))).toBeNull()
  })

  test('picks are joined back to what is on screen; the rest is dropped', () => {
    const shown = [activity('a1'), activity('b2')]
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
    // A pick with no usable reason has none — nothing is made up for it.
    expect(out[0].reasons).toEqual([])
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

  test('with no ranking, what is on soonest first, and no reasons claimed', () => {
    const out = unrankedPicks([
      activity('a1', { startsAt: NOW + 4 * DAY }),
      activity('b2', { startsAt: NOW + DAY }),
    ])
    expect(out.map((a) => a.id)).toEqual(['b2', 'a1'])
    expect(out[0]).not.toHaveProperty('reasons')
    expect(unrankedPicks(Array.from({ length: 12 }, (_, i) => activity(`c${i}`)))).toHaveLength(
      PICK_CAP,
    )
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
