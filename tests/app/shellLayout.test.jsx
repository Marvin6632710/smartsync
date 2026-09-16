// @vitest-environment jsdom
/**
 * The shell renders both a phone bar and a web header and lets the
 * stylesheet choose between them, so nothing about the width is decided in
 * JavaScript and no header arrives late. What it does decide is what the
 * stylesheet needs to know: which screen is showing (`data-view`, which
 * sets a page's width and composition on a wide screen), and whether the
 * page is a sub-page (which gets a way back above its column).
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import i18n, { LANGUAGE_KEY } from '../../src/i18n'
import my from '../../src/i18n/locales/my.json'

vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    notifications: [{ read: false }, { read: false }, { read: true }],
    celebration: null,
    dataError: null,
    offline: false,
    browserOffline: false,
    serverSilent: false,
  }),
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', name: 'Uma', avatar: 'UM', isModerator: false } }),
}))
vi.mock('../../src/components/CelebrationToast', () => ({ default: () => null }))
vi.mock('../../src/components/JoinBurst', () => ({ default: () => null }))

globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

const { default: Shell } = await import('../../src/components/Shell')

const mount = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  )

afterEach(async () => {
  cleanup()
  localStorage.clear()
  await i18n.changeLanguage('en')
})

test('both headers are rendered, and each carries the unread count', () => {
  mount('/home')
  expect(document.querySelector('.topbar')).not.toBeNull()
  expect(document.querySelector('.web-header')).not.toBeNull()
  const badges = [...document.querySelectorAll('.notification-button .badge')]
  expect(badges.map((b) => b.textContent)).toEqual(['2', '2'])
})

test('the web header has the four tabs and reaches the profile through the avatar', () => {
  mount('/home')
  const links = [...document.querySelectorAll('.web-nav a')].map((a) => a.getAttribute('href'))
  expect(links).toEqual(['/home', '/map', '/recommendations', '/messages'])
  expect(document.querySelector('.web-avatar').getAttribute('href')).toBe('/profile')
  // The phone keeps all five.
  expect(document.querySelectorAll('.bottom-nav a')).toHaveLength(5)
})

test('the active tab is marked in both navigations', () => {
  mount('/map')
  expect(document.querySelector('.web-nav a.active').getAttribute('href')).toBe('/map')
  expect(document.querySelector('.bottom-nav a.active').getAttribute('href')).toBe('/map')
  cleanup()
  mount('/profile')
  expect(document.querySelector('.web-avatar.active')).not.toBeNull()
  expect(document.querySelector('.web-nav a.active')).toBeNull()
})

test.each([
  ['/home', 'home'],
  ['/activity/abc', 'activity'],
  ['/activity/abc/chat', 'activity-chat'],
  ['/activity/abc/edit', 'activity-edit'],
  ['/activity/abc/participants', 'activity-participants'],
  ['/profile', 'profile'],
  ['/profile/edit', 'profile-edit'],
  ['/recommendations', 'recommendations'],
  ['/recommendations/abc', 'recommendations-details'],
  ['/moderation/people', 'moderation'],
  ['/settings', 'settings'],
])('%s is the %s view', (path, view) => {
  mount(path)
  expect(document.querySelector('main.page-scroll').dataset.view).toBe(view)
})

test('a sub-page gets a way back above its column; a root tab does not', () => {
  mount('/settings')
  expect(document.querySelector('main > .page-bar .topbar-back')).not.toBeNull()
  cleanup()
  mount('/home')
  expect(document.querySelector('main > .page-bar')).toBeNull()
})

test('the create action is offered in the header and, on a root tab, as the floating button', () => {
  mount('/home')
  expect(document.querySelector('.web-create')).not.toBeNull()
  expect(document.querySelector('.fab-create')).not.toBeNull()
  cleanup()
  mount('/settings')
  expect(document.querySelector('.web-create')).not.toBeNull()
  expect(document.querySelector('.fab-create')).toBeNull()
})

test('the web header carries the language picker, beside the avatar, on the one stored choice', async () => {
  mount('/home')
  const actions = document.querySelector('.web-actions')
  const picker = actions.querySelector('.web-language select')
  expect(picker).not.toBeNull()
  // Immediately before the avatar, so it sits where the eye looks for a
  // personal setting; it is the same control the Settings page shows.
  expect(picker.closest('.web-language').nextElementSibling).toBe(
    actions.querySelector('.web-avatar'),
  )
  expect(screen.getAllByRole('combobox', { name: i18n.t('language.select') })).toHaveLength(1)
  expect([...picker.options].map((o) => o.textContent)).toEqual([
    'English',
    'ไทย',
    'မြန်မာ',
    '简体中文',
  ])
  expect(picker.value).toBe('en')

  fireEvent.change(picker, { target: { value: 'my' } })
  // Both navigations reword at once, the document is marked, and the choice
  // is kept under the key the Settings page and the entry screens read.
  const labelsIn = (selector) =>
    [...document.querySelectorAll(selector)].map((label) => label.textContent)
  await screen.findByRole('heading', { name: my.nav.discover })
  expect(labelsIn('.web-nav-item > span')).toEqual([
    my.nav.discover,
    my.nav.map,
    my.nav.aiPicks,
    my.nav.messages,
  ])
  expect(labelsIn('.bottom-nav a > span:last-child')).toEqual([
    my.nav.discover,
    my.nav.map,
    my.nav.aiPicks,
    my.nav.messages,
    my.nav.profile,
  ])
  expect(document.querySelector('.web-create').textContent).toBe(my.nav.create)
  expect(document.documentElement.lang).toBe('my')
  expect(localStorage.getItem(LANGUAGE_KEY)).toBe('my')
  expect(picker.value).toBe('my')
})
