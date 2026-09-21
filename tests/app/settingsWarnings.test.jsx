// @vitest-environment jsdom
/**
 * The warnings row in Settings is its own card, and it says how much is on
 * the record — but only once it knows. Until the listener answers, and when
 * it fails, the row says what it is for and nothing more: "nothing on your
 * record" is a claim, not a default.
 */
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
const latest = () => subscriptions.at(-1)
const row = () => screen.getByRole('button', { name: /Current warnings/ })
const card = () => row().closest('.warnings-card')

beforeEach(() => {
  subscriptions.length = 0
})
afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

test('the row watches your own record, and says only what it is for until it answers', () => {
  mount()
  expect(latest().uid).toBe('me')
  expect(row().textContent).toContain('Anything SmartSync has raised with you')
  expect(screen.queryByText('Nothing on your record')).toBeNull()
  expect(card().classList.contains('has-warnings')).toBe(false)
})

test('a clean record is said to be clean, quietly', () => {
  mount()
  act(() => latest().onRows([]))
  expect(row().textContent).toContain('Nothing on your record')
  expect(card().classList.contains('has-warnings')).toBe(false)
  expect(card().querySelector('.warnings-count')).toBeNull()
})

test('warnings turn the card, count them, and use the singular for one', () => {
  mount()
  act(() => latest().onRows([{ id: 'w1', reason: 'Be kind' }]))
  expect(row().textContent).toContain('1 warning on your record — read it')
  expect(card().classList.contains('has-warnings')).toBe(true)
  expect(card().querySelector('.warnings-count').textContent).toBe('1')

  act(() => latest().onRows([{ id: 'w1' }, { id: 'w2' }]))
  expect(row().textContent).toContain('2 warnings on your record — read them')
  expect(card().querySelector('.warnings-count').textContent).toBe('2')
})

test('a read that failed does not pass for a clean record', () => {
  mount()
  act(() => latest().onError({ code: 'permission-denied' }))
  expect(row().textContent).toContain('Anything SmartSync has raised with you')
  expect(screen.queryByText('Nothing on your record')).toBeNull()
  expect(card().classList.contains('has-warnings')).toBe(false)
})

test('the count reads in Thai', async () => {
  await i18n.changeLanguage('th')
  mount()
  act(() => latest().onRows([{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }]))
  const thai = screen.getByRole('button', { name: new RegExp(th.settings.warnings) })
  expect(thai.textContent).toContain(th.settings.warningsCount_other.replace('{{count}}', '3'))
})
