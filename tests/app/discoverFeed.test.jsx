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
 *
 * The feed is rows you scroll sideways now, so the guarantee moved rather
 * than went: the rows by category are a partition of the feed, and these
 * check the page as a whole rather than one section of it. That is the
 * stronger claim of the two — it does not care which row anything landed in,
 * only that nothing landed outside all of them.
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
// A rail measures itself to decide whether to draw its arrows; jsdom has no
// layout, so there is nothing to observe and nothing to report.
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}
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

/** Every activity title on the page, in whichever row it ended up. */
const titlesOnPage = () =>
  new Set(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent.trim()))
const rails = () => [...document.querySelectorAll('.rail')]

describe('the Discover feed', () => {
  test('every activity that passed the filters is on the page, not a sample', () => {
    const activities = feedOf(23)
    app = { ...app, filteredActivities: activities, recommendations: activities }
    mount()
    const shown = titlesOnPage()
    for (const activity of activities) {
      expect(shown.has(activity.title), `${activity.title} is missing`).toBe(true)
    }
  })

  test('no category is dropped, whatever order they arrive in', () => {
    const activities = feedOf(23)
    app = { ...app, filteredActivities: activities, recommendations: activities }
    mount()
    // One row per category, and each holds its own — which is what makes the
    // rows a partition rather than eight samples.
    for (const category of CATEGORIES) {
      const heading = screen
        .getAllByRole('heading', { level: 2 })
        .find((h) => h.textContent === category)
      expect(heading, `no row for ${category}`).toBeTruthy()
      const row = heading.closest('.rail')
      const mine = activities.filter((a) => a.category === category)
      expect(within(row).getAllByRole('heading', { level: 3 })).toHaveLength(mine.length)
    }
  })

  test('a count beside a heading agrees with the cards under it', () => {
    // The count and the cards disagreeing silently is the whole bug this
    // file exists for; it just sits on a row now rather than a section.
    const activities = feedOf(23)
    app = { ...app, filteredActivities: activities, recommendations: activities }
    mount()
    for (const row of rails()) {
      const count = Number(within(row).getByText(/^\d+$/).textContent)
      expect(within(row).getAllByRole('heading', { level: 3 })).toHaveLength(count)
    }
  })

  test('a small feed still shows all of it', () => {
    const activities = feedOf(3)
    app = { ...app, filteredActivities: activities, recommendations: activities }
    mount()
    const shown = titlesOnPage()
    for (const activity of activities) expect(shown.has(activity.title)).toBe(true)
  })

  test('nothing through the filters is still the empty state, not a blank list', () => {
    app = { ...app, filteredActivities: [], recommendations: [] }
    mount()
    expect(screen.getByText(en.filtersEmpty.title)).toBeTruthy()
  })
})
