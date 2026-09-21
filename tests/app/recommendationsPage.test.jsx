// @vitest-environment jsdom
/**
 * AI Picks on the page: what is asked of the Function and when, how the
 * answer is shown, what happens when there is none — and that a render
 * is never a request.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import i18n from '../../src/i18n'
import th from '../../src/i18n/locales/th.json'
import { defaultFilters } from '../../src/utils/filters'

const NOW = Date.now()
const DAY = 86_400_000

// The callable, answering whatever the test says next.
const calls = []
let answer = () => ({ data: { source: 'gemini', picks: [], createdAt: NOW } })
vi.mock('../../src/firebase/functions', () => ({
  recommendActivitiesCall: (request) => {
    calls.push(request)
    return Promise.resolve().then(() => answer(request))
  },
}))
// The card is somebody else's test; here it is the title.
vi.mock('../../src/components/ActivityCard', () => ({
  default: ({ activity }) => <article data-testid="card">{activity.title}</article>,
}))

const activity = (id, extra = {}) => ({
  id,
  title: `Activity ${id}`,
  category: 'Football',
  timeBand: 'Evening',
  startsAt: NOW + 2 * DAY,
  distanceKm: null,
  capacity: 10,
  participants: 3,
  hostId: 'h',
  matchScore: 60,
  reasonKeys: [{ key: 'interest', category: 'Football' }],
  ...extra,
})
let app
let user
vi.mock('../../src/context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user }) }))

const { default: RecommendationsPage } = await import('../../src/pages/RecommendationsPage')
const { forgetAiPicks, PICKS_DEBOUNCE_MS } = await import('../../src/hooks/useAiPicks')

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/recommendations']}>
      <Routes>
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/filters" element={<p>the filters</p>} />
        <Route path="/interests" element={<p>the interests</p>} />
      </Routes>
    </MemoryRouter>,
  )
// Past the debounce and the promise: the request has been made and answered.
const settle = async () => {
  await act(async () => {
    vi.advanceTimersByTime(PICKS_DEBOUNCE_MS + 10)
  })
  await act(async () => {})
}
const bar = () => document.querySelector('.ai-source')
const cardTitles = () =>
  [...document.querySelectorAll('.ai-picks [data-testid="card"]')].map((c) => c.textContent)
const whys = () => [...document.querySelectorAll('.ai-pick-why')].map((p) => p.textContent)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  calls.length = 0
  forgetAiPicks()
  user = {
    uid: 'me',
    interests: ['Football', 'Coffee'],
    preferredTime: 'Evening',
    historyCategories: ['Running'],
    location: null,
  }
  const feed = [
    activity('a1', { matchScore: 80 }),
    activity('b2', { category: 'Coffee', timeBand: 'Morning', matchScore: 70 }),
    activity('c3', { category: 'Running', matchScore: 40, reasonKeys: [{ key: 'history' }] }),
    activity('joined', { matchScore: 99 }),
  ]
  app = {
    recommendations: feed,
    filteredActivities: feed,
    joinedIds: ['joined'],
    joinedActivities: [activity('joined')],
    loading: false,
    weights: undefined,
    filters: defaultFilters,
  }
})
afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

test('asks once the feed settles — with the eligible activities and the signals, nothing personal — and shows the answer with its reasons', async () => {
  answer = () => ({
    data: {
      source: 'gemini',
      picks: [
        { id: 'b2', reasons: ['interest'] },
        { id: 'a1', reasons: ['interest', 'time'] },
        { id: 'c3', reasons: ['history'] },
      ],
      createdAt: NOW,
      cached: false,
    },
  })
  mount()
  expect(bar().textContent).toContain('Asking Gemini')
  expect(calls).toHaveLength(0)
  await settle()
  expect(calls).toHaveLength(1)
  const [request] = calls
  // The joined activity is not a candidate; nothing about people is sent.
  expect(request.candidates.map((c) => c.id).sort()).toEqual(['a1', 'b2', 'c3'])
  expect(request.signals).toEqual({
    interests: ['Football', 'Coffee'],
    preferredTime: 'Evening',
    history: [
      { category: 'Football', joined: 1 },
      { category: 'Running', joined: 1 },
    ],
    hasLocation: false,
  })
  expect(JSON.stringify(request)).not.toMatch(/"uid"|"hostId"|:"me"|:"h"/)
  // The answer, in the model's order: the first as the hero, the rest as cards.
  expect(bar().dataset.state).toBe('gemini')
  expect(bar().textContent).toContain('Ranked by Gemini')
  expect(screen.getByText('Activity b2', { selector: '#top-pick-title' })).toBeTruthy()
  expect(cardTitles()).toEqual(['Activity a1', 'Activity c3'])
  expect(whys()).toEqual([
    'Matches your Football interest · Fits your preferred evening time',
    'Similar to activities you joined before',
  ])
})

test('a re-render is not a request; a refresh is, past the cache', async () => {
  answer = () => ({
    data: { source: 'gemini', picks: [{ id: 'a1', reasons: [] }], createdAt: NOW },
  })
  const view = mount()
  await settle()
  expect(calls).toHaveLength(1)
  view.rerender(
    <MemoryRouter initialEntries={['/recommendations']}>
      <Routes>
        <Route path="/recommendations" element={<RecommendationsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  app = { ...app, filteredActivities: [...app.filteredActivities] }
  view.rerender(
    <MemoryRouter initialEntries={['/recommendations']}>
      <Routes>
        <Route path="/recommendations" element={<RecommendationsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await settle()
  expect(calls).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
  expect(bar().textContent).toContain('Asking Gemini')
  await settle()
  expect(calls).toHaveLength(2)
  expect(calls[1].force).toBe(true)
})

test('a changed question — an interest added — is asked again on its own', async () => {
  answer = () => ({
    data: { source: 'gemini', picks: [{ id: 'a1', reasons: [] }], createdAt: NOW },
  })
  const view = mount()
  await settle()
  expect(calls).toHaveLength(1)
  user = { ...user, interests: ['Football', 'Coffee', 'Running'] }
  view.rerender(
    <MemoryRouter initialEntries={['/recommendations']}>
      <Routes>
        <Route path="/recommendations" element={<RecommendationsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await settle()
  expect(calls).toHaveLength(2)
  expect(calls[1].signals.interests).toEqual(['Football', 'Coffee', 'Running'])
})

test('no answer from the model: the same activities in the app’s own order, said plainly, with a way to try again', async () => {
  answer = () => ({ data: { source: 'standard', reason: 'rate-limited', retryAfterSeconds: 1500 } })
  mount()
  await settle()
  expect(bar().dataset.state).toBe('standard')
  expect(bar().textContent).toContain('Standard picks.')
  expect(bar().textContent).toContain('Try again in 25 minutes')
  // Best-scored first, with the engine's reasons.
  expect(screen.getByText('Activity a1', { selector: '#top-pick-title' })).toBeTruthy()
  expect(cardTitles()).toEqual(['Activity b2', 'Activity c3'])
  answer = () => ({
    data: { source: 'gemini', picks: [{ id: 'c3', reasons: ['history'] }], createdAt: NOW },
  })
  fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
  await settle()
  expect(bar().dataset.state).toBe('gemini')
  expect(screen.getByText('Activity c3', { selector: '#top-pick-title' })).toBeTruthy()
})

test('the Function failing outright is said too, and Try again asks again', async () => {
  answer = () => Promise.reject(new Error('functions/internal'))
  mount()
  await settle()
  expect(bar().dataset.state).toBe('standard')
  expect(bar().textContent).toContain('could not be reached')
  answer = () => ({
    data: { source: 'gemini', picks: [{ id: 'a1', reasons: ['time'] }], createdAt: NOW },
  })
  fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
  await settle()
  expect(calls).toHaveLength(2)
  expect(bar().dataset.state).toBe('gemini')
})

test('an answer naming something no longer on screen is not shown', async () => {
  answer = () => ({
    data: {
      source: 'gemini',
      picks: [
        { id: 'gone', reasons: ['interest'] },
        { id: 'a1', reasons: [] },
      ],
      createdAt: NOW,
    },
  })
  mount()
  await settle()
  expect(screen.getByText('Activity a1', { selector: '#top-pick-title' })).toBeTruthy()
  expect(screen.queryByText('Activity gone')).toBeNull()
})

test('nothing eligible: no request, an empty state that names the filters and offers them', async () => {
  app = { ...app, filteredActivities: [], filters: { ...defaultFilters, categories: ['Gym'] } }
  mount()
  await settle()
  expect(calls).toHaveLength(0)
  expect(bar()).toBeNull()
  expect(screen.getByText('Nothing to pick from right now')).toBeTruthy()
  expect(screen.getByText(/fits your discovery filters \(1 active\)/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Adjust filters' }))
  expect(screen.getByText('the filters')).toBeTruthy()
})

test('little to go on: the hints say what would help, each going where it is done', async () => {
  user = { ...user, historyCategories: [], preferredTime: '', location: null }
  app = { ...app, joinedIds: [], joinedActivities: [] }
  answer = () => ({
    data: { source: 'gemini', picks: [{ id: 'a1', reasons: [] }], createdAt: NOW },
  })
  mount()
  await settle()
  expect(screen.getByText('Get better picks')).toBeTruthy()
  const hints = [...document.querySelectorAll('.improve-list button')].map((b) => b.textContent)
  expect(hints).toEqual([
    'Join an activity or two — what you do is the strongest signal',
    'Add a few more interests',
    'Set your preferred time of day',
    'Allow location so distance can count',
  ])
  fireEvent.click(screen.getByRole('button', { name: 'Add a few more interests' }))
  expect(screen.getByText('the interests')).toBeTruthy()
})

test('a well-known person gets no hints', async () => {
  user = { ...user, location: { lat: 13.7, lng: 100.5 } }
  answer = () => ({
    data: { source: 'gemini', picks: [{ id: 'a1', reasons: [] }], createdAt: NOW },
  })
  mount()
  await settle()
  expect(screen.queryByText('Get better picks')).toBeNull()
})

test('in Thai, the bar and the reasons are Thai; the wire stays English', async () => {
  await act(() => i18n.changeLanguage('th'))
  answer = () => ({
    data: {
      source: 'gemini',
      picks: [{ id: 'a1', reasons: ['interest', 'time'] }],
      createdAt: NOW,
    },
  })
  mount()
  await settle()
  expect(bar().textContent).toContain(th.picks.sourceGemini)
  expect(calls[0].signals.interests).toEqual(['Football', 'Coffee'])
  expect(document.querySelector('.top-pick-reasons').textContent).toContain(th.categories.football)
})
