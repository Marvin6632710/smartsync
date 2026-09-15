// @vitest-environment jsdom
/**
 * Not loaded is not not found.
 *
 * Every deep link — a notification tap, a shared URL, a reload — reaches the
 * activity pages before the first snapshot, and each used to say the
 * activity did not exist for exactly as long as the connection was slow.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

let app = {}
vi.mock('../../src/context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', isModerator: false } }),
}))
vi.mock('../../src/components/LocationPicker', () => ({ default: () => null }))
vi.mock('../../src/components/ReportDialog', () => ({ default: () => null }))
vi.mock('../../src/components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('../../src/components/GoingStack', () => ({ default: () => null }))

const { default: ActivityDetailsPage } = await import('../../src/pages/ActivityDetailsPage')
const { default: EditActivityPage } = await import('../../src/pages/EditActivityPage')
const { default: ParticipantsPage } = await import('../../src/pages/ParticipantsPage')
const { default: RecommendationDetailsPage } =
  await import('../../src/pages/RecommendationDetailsPage')

afterEach(cleanup)

const base = (loading, activities = [], syncing = false) => ({
  syncing,
  activities,
  allActivities: activities,
  recommendations: activities.filter((a) => a.status === 'active' && !a.isPast),
  joinedIds: activities.filter((a) => a.participantUids.includes('me')).map((a) => a.id),
  peers: [],
  weights: {},
  loading,
  joinActivity: vi.fn(),
  leaveActivity: vi.fn(),
  cancelActivity: vi.fn(),
  removeActivity: vi.fn(),
  pushCelebration: vi.fn(),
  updateActivity: vi.fn(),
})

const at = (path, pattern, element) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
      </Routes>
    </MemoryRouter>,
  )

const screens = [
  ['details', '/activity/a1', '/activity/:id', <ActivityDetailsPage />, 'Activity not found'],
  ['edit', '/activity/a1/edit', '/activity/:id/edit', <EditActivityPage />, 'Activity not found'],
  [
    'participants',
    '/activity/a1/participants',
    '/activity/:id/participants',
    <ParticipantsPage />,
    'Activity not found',
  ],
  [
    'recommendation',
    '/recommendations/a1',
    '/recommendations/:id',
    <RecommendationDetailsPage />,
    'Recommendation not found',
  ],
]

describe.each(screens)('%s', (_name, path, pattern, element, notFound) => {
  test('waits while the feed is loading', () => {
    app = base(true)
    at(path, pattern, element)
    expect(screen.queryByText(notFound)).toBeNull()
    expect(screen.getByText(/Loading/)).toBeTruthy()
  })

  test('says not found once the feed has loaded without it', () => {
    app = base(false)
    at(path, pattern, element)
    expect(screen.getByText(notFound)).toBeTruthy()
  })

  test('a warm cache that lacks it still waits for the server\u2019s first word', () => {
    // The first snapshot comes from the cache and ends `loading`; an
    // activity posted since the last visit — the one a notification links
    // to — is not in it, and is not missing either.
    app = base(false, [], true)
    at(path, pattern, element)
    expect(screen.queryByText(notFound)).toBeNull()
    expect(screen.getByText(/Loading/)).toBeTruthy()
  })
})

test('the recommendation breakdown opens for anything scored, not only current picks', () => {
  // The details page offers "More" on a past activity you joined; that
  // used to land on "Recommendation not found".
  const past = {
    id: 'a1',
    title: 'Last week',
    status: 'active',
    isPast: true,
    matchScore: 64,
    reasons: ['Matches your Coffee interest'],
    participantUids: ['me'],
    participants: 1,
    capacity: 5,
    hostId: 'h',
  }
  app = base(false, [past])
  at('/recommendations/a1', '/recommendations/:id', <RecommendationDetailsPage />)
  expect(screen.getByText('64%')).toBeTruthy()
  expect(screen.getByText('Last week')).toBeTruthy()
})
