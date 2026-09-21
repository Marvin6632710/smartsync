// @vitest-environment jsdom
/**
 * The warnings card in Settings: the whole card is the way to the record,
 * it says how much is on it only once it knows — "no active warnings" is a
 * claim, not a default — and with something on it, it is the first thing on
 * the page, with a count in words and a labelled way in.
 */
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import i18n from '../../src/i18n'
import th from '../../src/i18n/locales/th.json'

const subscriptions = []
vi.mock('../../src/firebase/moderation', () => ({
  watchMyWarnings: (uid, onRows, onError) => {
    subscriptions.push({ uid, onRows, onError })
    return () => {}
  },
}))
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ pushCelebration: () => {}, celebration: null, offline: false }),
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    signOut: () => Promise.resolve(),
    user: { uid: 'me', email: 'me@x.y', privacy: { notifications: true } },
  }),
}))
vi.mock('../../src/firebase/users', () => ({ setNotificationsEnabled: vi.fn() }))

const { default: SettingsPage } = await import('../../src/pages/SettingsPage')

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/warnings" element={<p>the record</p>} />
      </Routes>
    </MemoryRouter>,
  )
const latest = () => subscriptions.at(-1)
const row = () => screen.getByRole('button', { name: /Current warnings/ })
const card = () => row().closest('.warnings-card')
// Where the card sits among the page's cards: first, or after the preferences.
const cardIndex = () =>
  [...document.querySelectorAll('.page-content > .settings-card')].indexOf(card())

beforeEach(() => {
  subscriptions.length = 0
})
afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

test('watches your own record, and says it is checking until it answers', () => {
  mount()
  expect(latest().uid).toBe('me')
  expect(row().textContent).toContain('Checking your record')
  expect(screen.queryByText('No active warnings')).toBeNull()
  expect(card().classList.contains('has-warnings')).toBe(false)
  expect(card().querySelector('.warnings-count')).toBeNull()
})

test('a clean record is quiet, below the preferences, with no badge, and still a way in', () => {
  mount()
  act(() => latest().onRows([]))
  expect(row().textContent).toContain('No active warnings')
  expect(row().textContent).toContain('View warnings')
  expect(card().classList.contains('has-warnings')).toBe(false)
  expect(card().querySelector('.warnings-count')).toBeNull()
  expect(cardIndex()).toBe(1)
})

test('warnings put the card first, turn it, count them in words, and explain', () => {
  mount()
  act(() => latest().onRows([{ id: 'w1', reason: 'Be kind' }]))
  expect(cardIndex()).toBe(0)
  expect(card().classList.contains('has-warnings')).toBe(true)
  expect(card().querySelector('.warnings-count').textContent).toBe('1 warning')
  expect(row().textContent).toContain('You have an active account warning. Review it for details.')

  act(() => latest().onRows([{ id: 'w1' }, { id: 'w2' }]))
  expect(card().querySelector('.warnings-count').textContent).toBe('2 warnings')
  expect(row().textContent).toContain('You have active account warnings. Review them for details.')
  expect(row().getAttribute('aria-describedby')).toBe('warnings-body')
})

test('a read that failed says so, and does not pass for a clean record', () => {
  mount()
  act(() => latest().onError({ code: 'permission-denied' }))
  expect(row().textContent).toContain("Couldn't load your record")
  expect(screen.queryByText('No active warnings')).toBeNull()
  expect(card().classList.contains('has-warnings')).toBe(false)
  expect(cardIndex()).toBe(1)
})

test('the whole card is a button that opens the record, from the keyboard too', () => {
  mount()
  act(() => latest().onRows([{ id: 'w1' }]))
  expect(row().tagName).toBe('BUTTON')
  row().focus()
  expect(document.activeElement).toBe(row())
  act(() => row().click())
  expect(screen.getByText('the record')).toBeTruthy()
})

test('the count and the explanation read in Thai', async () => {
  await i18n.changeLanguage('th')
  mount()
  act(() => latest().onRows([{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }]))
  const thai = screen.getByRole('button', { name: new RegExp(th.settings.warnings) })
  expect(thai.querySelector('.warnings-count').textContent).toBe(
    th.settings.warningsBadge_other.replace('{{count}}', '3'),
  )
  expect(thai.textContent).toContain(th.settings.warningsActive_other)
  expect(thai.textContent).toContain(th.settings.viewWarnings)
})
