// @vitest-environment jsdom
/**
 * People for you: what a card shows before you ask, and what it shows
 * after.
 *
 * The page used to put everything on every card at once — six interest
 * chips, two fact pills and a bordered notification block with its own
 * heading and sentence — so ten people was ten walls of text and nothing
 * to compare. The detail is a drawer now, and these pin the part that
 * would quietly come undone: that the drawer starts shut, that pressing
 * the person opens it, and that opening one person does not open or
 * close anybody else.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import en from '../../src/i18n/locales/en.json'
import { SIMILAR_USER_THRESHOLD } from '../../src/services/compatibility'

const toggleUserNotifications = vi.fn()
let app = { peers: [], followedUserIds: [], toggleUserNotifications }

vi.mock('../../src/context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    // Football and Gaming are shared with Chaw; Cycling is not.
    user: { uid: 'me', interests: ['Football', 'Gaming', 'Cycling'], preferredTime: 'evening' },
  }),
}))
vi.mock('../../src/components/SavedPicture', () => ({ AvatarContent: () => null }))

let UserMatchingPage
beforeEach(async () => {
  UserMatchingPage = (await import('../../src/pages/UserMatchingPage')).default
})
afterEach(cleanup)

const peer = (name, extra = {}) => ({
  uid: name.toLowerCase(),
  name,
  avatar: name.slice(0, 2),
  interests: ['Football', 'Gaming'],
  preferredTime: 'evening',
  ...extra,
})

const mount = (peers) => {
  app = { ...app, peers }
  return render(<UserMatchingPage />)
}

/** The card for one person, found by the name it is labelled with. */
const cardFor = (name) => screen.getByRole('region', { name })
const toggleIn = (name) => within(cardFor(name)).getByRole('button', { expanded: false })

describe('a card before it is opened', () => {
  beforeEach(() => mount([peer('Chaw')]))

  test('shows the name and the way to follow them', () => {
    const card = cardFor('Chaw')
    expect(within(card).getByText('Chaw')).toBeTruthy()
    expect(within(card).getByText(en.matching.notifyMe)).toBeTruthy()
  })

  test('does not show the interests, the time, or the sentence about the button', () => {
    const card = cardFor('Chaw')
    // The chips, the two facts and the explanation are all the drawer's.
    expect(within(card).queryByText(en.matching.freeLabel)).toBeNull()
    expect(within(card).queryByText(en.matching.interestsLabel)).toBeNull()
    expect(within(card).queryByText(/posts an activity/)).toBeNull()
  })
})

describe('pressing the person', () => {
  test('opens the detail, and pressing again closes it', () => {
    mount([peer('Chaw')])
    fireEvent.click(toggleIn('Chaw'))

    const card = cardFor('Chaw')
    expect(within(card).getByText(en.matching.freeLabel)).toBeTruthy()
    expect(within(card).getByText(en.matching.interestsLabel)).toBeTruthy()
    expect(within(card).getByText(en.matching.sharedLabel)).toBeTruthy()
    // The sentence saying what Notify me does comes with it.
    expect(within(card).getByText(/posts an activity/)).toBeTruthy()

    fireEvent.click(within(card).getByRole('button', { expanded: true }))
    expect(within(cardFor('Chaw')).queryByText(en.matching.freeLabel)).toBeNull()
  })

  test('leaves everybody else alone — two people can be compared at once', () => {
    // An accordion would make comparing two people impossible, which is
    // the one thing this page is for.
    mount([peer('Chaw'), peer('Cindy', { interests: ['Gym', 'Coffee'] })])
    fireEvent.click(toggleIn('Chaw'))
    expect(within(cardFor('Cindy')).queryByText(en.matching.freeLabel)).toBeNull()

    fireEvent.click(toggleIn('Cindy'))
    expect(within(cardFor('Chaw')).getByText(en.matching.freeLabel)).toBeTruthy()
    expect(within(cardFor('Cindy')).getByText(en.matching.freeLabel)).toBeTruthy()
  })

  test('the toggle reports whether it is open', () => {
    mount([peer('Chaw')])
    const toggle = toggleIn('Chaw')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    // And it points at the thing it opened, so the drawer is reachable.
    const card = cardFor('Chaw')
    expect(card.querySelector(`#${toggle.getAttribute('aria-controls')}`)).toBeTruthy()
  })
})

describe('the score', () => {
  test('is marked strong only at or above the threshold the picks use', () => {
    // Identical interests and time is a full score; nothing in common is
    // well under it, so the two sides of the cut are both covered.
    mount([peer('Chaw'), peer('Cindy', { interests: ['Gym'], preferredTime: 'morning' })])
    const strong = cardFor('Chaw').querySelector('.match-pill')
    const quiet = cardFor('Cindy').querySelector('.match-pill')
    expect(Number(strong.textContent.replace(/\D/g, ''))).toBeGreaterThanOrEqual(
      SIMILAR_USER_THRESHOLD,
    )
    expect(strong.dataset.strong).toBe('yes')
    expect(Number(quiet.textContent.replace(/\D/g, ''))).toBeLessThan(SIMILAR_USER_THRESHOLD)
    expect(quiet.dataset.strong).toBe('no')
  })
})

describe('following somebody', () => {
  test('works without opening the card', () => {
    mount([peer('Chaw')])
    fireEvent.click(within(cardFor('Chaw')).getByText(en.matching.notifyMe))
    expect(toggleUserNotifications).toHaveBeenCalledWith(expect.objectContaining({ uid: 'chaw' }))
  })
})
