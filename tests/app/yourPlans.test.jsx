// @vitest-environment jsdom
/**
 * Your plans: hosting and going, told apart.
 *
 * The page existed and answered half the question. A host is a participant
 * of their own activity, so hosted activities were already in the list — but
 * under one heading that said "joined", which is why people were reading the
 * chat list instead: a thread per activity was the closest thing the app had
 * to "what am I involved in". "What am I running?" and "what am I turning up
 * to?" have different work attached, and these pin that the page now
 * separates them and keeps everything.
 */
import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import en from '../../src/i18n/locales/en.json'

// The cards show who is going, by uid, from the shared directory.
const REST = {
  directory: new Map([['me', { name: 'Me', avatar: 'ME' }]]),
  joinedIds: [],
  blockedIds: new Set(),
}
let app = { ...REST, joinedActivities: [] }
vi.mock('../../src/context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }))
vi.mock('../../src/hooks/useMorph', () => ({ useMorph: () => () => {} }))
vi.mock('../../src/components/SavedPicture', () => ({
  ActivityPicture: () => null,
  AvatarContent: () => null,
}))

const plan = (id, hostId, isPast = false) => ({
  id,
  title: id,
  category: 'Coffee',
  date: '2026-10-02',
  time: '18:00',
  startsAt: 2_000_000_000_000,
  isPast,
  locationName: 'Somewhere',
  participants: 2,
  capacity: 8,
  participantUids: ['me'],
  hostId,
})

let Page
beforeEach(async () => {
  Page = (await import('../../src/pages/JoinedActivitiesPage')).default
})
afterEach(cleanup)

const mount = () =>
  render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  )

/** The section under a given heading. */
const group = (heading) =>
  screen
    .getAllByRole('heading', { level: 2 })
    .find((h) => h.textContent === heading)
    ?.closest('.section-block')

const titlesIn = (section) =>
  within(section)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent.trim())

describe('your plans', () => {
  test('what you host and what you joined are separate groups', () => {
    app = {
      ...REST,
      joinedActivities: [plan('mine1', 'me'), plan('theirs1', 'someone'), plan('mine2', 'me')],
    }
    mount()
    expect(titlesIn(group(en.joined.hosting))).toEqual(['mine1', 'mine2'])
    expect(titlesIn(group(en.joined.going))).toEqual(['theirs1'])
  })

  test('nothing is lost between the groups', () => {
    const plans = [plan('a', 'me'), plan('b', 'someone'), plan('c', 'someone', true)]
    app = { ...REST, joinedActivities: plans }
    mount()
    const shown = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent.trim())
    for (const p of plans) expect(shown).toContain(p.title)
  })

  test('what has been is its own group, and not mixed into what is coming', () => {
    app = {
      ...REST,
      joinedActivities: [plan('upcoming', 'someone'), plan('done', 'someone', true)],
    }
    mount()
    expect(titlesIn(group(en.joined.going))).toEqual(['upcoming'])
    expect(titlesIn(group(en.joined.past))).toEqual(['done'])
  })

  test('a past activity you hosted counts as history, not as hosting', () => {
    // "You are hosting" is a list of work still to do.
    app = { ...REST, joinedActivities: [plan('old', 'me', true)] }
    mount()
    expect(group(en.joined.hosting)).toBeUndefined()
    expect(titlesIn(group(en.joined.past))).toEqual(['old'])
  })

  test('a group with nothing in it is left out, not shown empty', () => {
    app = { ...REST, joinedActivities: [plan('theirs', 'someone')] }
    mount()
    expect(group(en.joined.hosting)).toBeUndefined()
    expect(group(en.joined.past)).toBeUndefined()
    expect(group(en.joined.going)).toBeTruthy()
  })

  test('each group says how many, and the count agrees with the cards', () => {
    app = { ...REST, joinedActivities: [plan('a', 'me'), plan('b', 'me'), plan('c', 'someone')] }
    mount()
    for (const heading of [en.joined.hosting, en.joined.going]) {
      const section = group(heading)
      const count = Number(within(section).getByText(/^\d+$/).textContent)
      expect(titlesIn(section)).toHaveLength(count)
    }
  })

  test('nothing at all says what to do about it', () => {
    app = { ...REST, joinedActivities: [] }
    mount()
    expect(screen.getByText(en.joined.none)).toBeTruthy()
    expect(screen.getByText(en.profile.findActivities)).toBeTruthy()
  })
})
