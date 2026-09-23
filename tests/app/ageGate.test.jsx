// @vitest-environment jsdom
/**
 * The age gate, through App's real routing.
 *
 * Three things are checked here and nowhere else: that an account with no
 * date of birth on file cannot reach any screen but the one asking for
 * it, that an account below the minimum gets the refusal instead of the
 * app, and that neither can be walked around by typing a different
 * address — which is the whole reason the check sits in the router
 * rather than on a page.
 *
 * The gate the *database* enforces is a separate thing, tested in
 * tests/rules/firestore.test.js. This file is about what a person sees.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import i18n from '../../src/i18n'
import en from '../../src/i18n/locales/en.json'
import { TERMS_KEY, TERMS_VERSION } from '../../src/terms'

const base = {
  uid: 'me',
  name: 'Uma',
  avatar: 'UM',
  email: 'uma@example.com',
  onboarded: true,
  banned: false,
  isAdmin: false,
  age: null,
  privacy: { showAge: false },
}
let auth = { status: 'ready', user: base, profileReady: true, profileError: null, signOut: vi.fn() }

vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    notifications: [],
    celebration: null,
    dataError: null,
    offline: false,
    browserOffline: false,
    serverSilent: false,
    pushInvite: null,
    dismissPushInvite: () => {},
    pushCelebration: () => {},
  }),
}))
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: {}, usingEmulators: true }))
vi.mock('firebase/firestore', async (importActual) => ({
  ...(await importActual()),
  collection: () => ({}),
}))
vi.mock('../../src/firebase/moderation', async (importActual) => ({
  ...(await importActual()),
  watchMyWarnings: () => () => {},
}))
// The closed-account screen reads the notification that closed it; there
// is no database here, and this test is about which screen renders.
vi.mock('../../src/firebase/notifications', async (importActual) => ({
  ...(await importActual()),
  watchNotifications: () => () => {},
}))
vi.mock('../../src/components/CelebrationToast', () => ({ default: () => null }))
vi.mock('../../src/components/JoinBurst', () => ({ default: () => null }))
vi.mock('../../src/components/PushInvite', () => ({ default: () => null }))

globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

let App
beforeAll(async () => {
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  App = (await import('../../src/App')).default
})

beforeEach(() => {
  localStorage.clear()
  // The terms dialog sits over everything; accepted here so these tests
  // are about the age gate rather than about it.
  localStorage.setItem(TERMS_KEY, String(TERMS_VERSION))
})

afterEach(async () => {
  cleanup()
  localStorage.clear()
  await i18n.changeLanguage('en')
})

const as = (user) => {
  auth = { ...auth, user: { ...base, ...user } }
}
const mount = (path = '/home') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('an account with no date of birth on file', () => {
  test('is asked, in place of the app', () => {
    as({ dateOfBirth: '' })
    mount()
    expect(screen.getByRole('heading', { name: en.age.title })).toBeTruthy()
  })

  test('is asked before onboarding, not after', () => {
    // Interests are something somebody makes; whether they should be
    // making it here is answered first.
    as({ dateOfBirth: '', onboarded: false })
    mount('/interests')
    expect(screen.getByRole('heading', { name: en.age.title })).toBeTruthy()
  })

  test.each(['/home', '/profile', '/map', '/settings', '/admin', '/activity/x/chat'])(
    'cannot reach %s by typing it',
    (path) => {
      as({ dateOfBirth: '' })
      mount(path)
      expect(screen.getByRole('heading', { name: en.age.title })).toBeTruthy()
    },
  )

  test('can still leave', () => {
    as({ dateOfBirth: '' })
    mount()
    expect(screen.getByRole('button', { name: en.age.signOutInstead })).toBeTruthy()
  })
})

describe('an account below the minimum', () => {
  // Reachable when the minimum is raised after the account was let in —
  // the rules refuse a new one, so this is the upgrade case.
  test('gets the refusal instead of the app', () => {
    as({ dateOfBirth: '2015-01-01', age: 11 })
    mount()
    expect(screen.getByRole('heading', { name: en.age.tooYoungTitle })).toBeTruthy()
  })

  test('cannot reach the app by typing an address either', () => {
    as({ dateOfBirth: '2015-01-01', age: 11 })
    mount('/profile')
    expect(screen.queryByRole('heading', { name: en.age.tooYoungTitle })).toBeTruthy()
  })
})

describe('an account old enough', () => {
  test('is let through to the app', () => {
    as({ dateOfBirth: '1996-05-04', age: 30 })
    mount()
    expect(screen.queryByRole('heading', { name: en.age.title })).toBeNull()
    expect(screen.queryByRole('heading', { name: en.age.tooYoungTitle })).toBeNull()
  })

  test('a closed account is still closed, whatever its date of birth says', () => {
    // The order matters: banned outranks everything, including this.
    as({ dateOfBirth: '', banned: true })
    mount()
    expect(screen.queryByRole('heading', { name: en.age.title })).toBeNull()
    expect(screen.getByRole('heading', { name: en.closed.title })).toBeTruthy()
  })
})
