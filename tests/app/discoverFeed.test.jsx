// @vitest-environment jsdom
/**
 * Discover shows every activity that passed the filters.
 *
 * It used to show six, with the count beside the heading still reporting
 * the true total — so a feed of eighteen rendered six cards under the
 * number 18, and nothing on the screen said the rest existed. The people
 * who reported it described it as activities "in some categories" not
 * appearing, which is what a cap looks like from the outside: the list
 * is ordered by start time, so whatever is cut clusters in whichever
 * categories happen to fall later.
 *
 * The number in this file is deliberately larger than any cap anybody
 * would reach for, so re-introducing one fails here rather than in
 * somebody's hands.
 */
import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import en from '../../src/i18n/locales/en.json'
import { defaultFilters } from '../../src/utils/filters'

const CATEGORIES = ['Football', 'Study', 'Coffee', 'Gaming', 'Cycling', 'Movies', 'Food', 'Running']

/** `count` activities, an hour apart, cycling through the categories. */
const feedOf = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `a${index}`,
    title: `Activity ${index}`,
    category: CATEGORIES[index % CATEGORIES.length],
    date: '2026-10-01',
    time: '18:00',
    startsAt: 2_000_000_000_000 + index * 3_600_000,
    locationName: 'Somewhere',
    participants: 1,
    capacity: 10,
    participantUids: ['someone'],
    hostId: 'someone',
  }))

let app = {
  filteredActivities: [],
  recommendations: [],
  loading: false,
  filters: defaultFilters,
  // The cards show who is going, by uid, from the shared directory.
  directory: new Map([['someone', { name: 'Someone', avatar: 'SO' }]]),
  joinedIds: [],
  blockedIds: new Set(),
}

vi.mock('../../src/context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', realName: 'Uma Test', interests: ['Football'] } }),
}))
vi.mock('../../src/hooks/useMorph', () => ({ useMorph: () => () => {} }))
// Pictures are fetched per activity from a database this test does not have.
vi.mock('../../src/components/SavedPicture', () => ({
  ActivityPicture: () => null,
  AvatarContent: () => null,
}))

let HomePage
beforeEach(async () => {
  HomePage = (await import('../../src/pages/HomePage')).default
})
afterEach(cleanup)

const mount = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )

/** The "Happening soon" section, which is the feed proper. */
const feedSection = () => document.querySelector('.soon-block')
const cardsIn = (section) => within(section).getAllByRole('heading', { level: 3 })

describe('the Discover feed', () => {
  test('renders every activity that passed the filters, not a sample', () => {
    const activities = feedOf(23)
    app = { ...app, filteredActivities: activities, recommendations: activities }
    mount()
    const section = feedSection()
    expect(section).toBeTruthy()
    // The count beside the heading and the number of cards have to agree.
    // They disagreeing silently is the whole bug this test exists for.
    expect(within(section).getByText('23')).toBeTruthy()
    expect(cardsIn(section)).toHaveLength(23)
  })

  test('no category is dropped, whatever order they arrive in', () => {
    const activities = feedOf(23)
    app = { ...app, filteredActivities: activities, recommendations: activities }
    mount()
    const shown = new Set(cardsIn(feedSection()).map((heading) => heading.textContent.trim()))
    for (const activity of activities) {
      expect(shown.has(activity.title), `${activity.title} (${activity.category})`).toBe(true)
    }
  })

  test('a small feed still shows all of it', () => {
    const activities = feedOf(3)
    app = { ...app, filteredActivities: activities, recommendations: activities }
    mount()
    expect(cardsIn(feedSection())).toHaveLength(3)
  })

  test('nothing through the filters is still the empty state, not a blank list', () => {
    app = { ...app, filteredActivities: [], recommendations: [] }
    mount()
    expect(screen.getByText(en.filtersEmpty.title)).toBeTruthy()
  })
})
