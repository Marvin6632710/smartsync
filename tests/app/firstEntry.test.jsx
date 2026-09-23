// @vitest-environment jsdom
/**
 * The first-entry flow, end to end through App's routing: the Terms &
 * Safety dialog over everything, the page behind it inert until the box
 * is ticked, then the front door and the ways in — and none of it again
 * on the next visit, until the terms change. Identity and data are faked;
 * the routing is real.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import i18n from '../../src/i18n'
import en from '../../src/i18n/locales/en.json'
import { TERMS_KEY, TERMS_VERSION, resetTermsAcceptance } from '../../src/terms'

const signedOut = {
  status: 'signed-out',
  user: null,
  profileReady: false,
  profileError: null,
  retryProfile: vi.fn(),
  signOut: vi.fn(),
}
const member = {
  uid: 'me',
  name: 'Uma',
  avatar: 'UM',
  email: 'uma@example.com',
  // Old enough, and answered — otherwise every one of these renders the
  // age gate instead of the screen under test (App.jsx puts it above
  // onboarding on purpose).
  dateOfBirth: '1996-05-04',
  onboarded: true,
  banned: false,
  isAdmin: false,
}
const signedIn = { ...signedOut, status: 'ready', user: member, profileReady: true }
let auth = signedOut

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
// The activities module names its collection at import time, against a
// database this test does not have.
vi.mock('firebase/firestore', async (importActual) => ({
  ...(await importActual()),
  collection: () => ({}),
}))
// Settings watches the warnings on your record; there is no record here.
vi.mock('../../src/firebase/moderation', async (importActual) => ({
  ...(await importActual()),
  watchMyWarnings: () => () => {},
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
  resetTermsAcceptance()
  auth = signedOut
})
afterEach(async () => {
  cleanup()
  resetTermsAcceptance()
  localStorage.clear()
  await i18n.changeLanguage('en')
})

const mount = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

const termsShowing = () => screen.queryByRole('dialog', { name: en.terms.title }) !== null
const stageInert = () => document.querySelector('.app-stage').hasAttribute('inert')
const accept = () => {
  fireEvent.click(screen.getByRole('checkbox', { name: en.terms.agree }))
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
}

describe('a first visit', () => {
  test('opens on the agreement over the front door, then the way that was chosen', () => {
    mount('/')
    expect(termsShowing()).toBe(true)
    // The front door is already behind the dialog, and out of reach.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Discover')
    expect(stageInert()).toBe(true)

    accept()
    expect(termsShowing()).toBe(false)
    expect(stageInert()).toBe(false)
    expect(localStorage.getItem(TERMS_KEY)).toBe(TERMS_VERSION)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Discover')

    fireEvent.click(screen.getByRole('button', { name: /Sign up/ }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.auth.signUp.title)
    fireEvent.click(screen.getByRole('link', { name: en.auth.signUp.signInLink }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.auth.signIn.title)
  })

  test('keeps the address that was asked for: a link to sign-in shows sign-in behind it', () => {
    mount('/signin')
    expect(termsShowing()).toBe(true)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.auth.signIn.title)
    accept()
    expect(termsShowing()).toBe(false)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.auth.signIn.title)
  })

  test('is asked while the session is still resolving, over the boot screen', () => {
    auth = { ...signedOut, status: 'loading' }
    mount('/')
    expect(termsShowing()).toBe(true)
    expect(screen.getByText(en.app.starting)).toBeTruthy()
    accept()
    expect(termsShowing()).toBe(false)
    expect(screen.getByText(en.app.starting)).toBeTruthy()
  })
})

describe('a return visit', () => {
  test('skips the agreement once it has been accepted on this device', () => {
    localStorage.setItem(TERMS_KEY, TERMS_VERSION)
    mount('/')
    expect(termsShowing()).toBe(false)
    expect(stageInert()).toBe(false)
    expect(screen.getByRole('button', { name: /Sign up/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Log in/ })).toBeTruthy()
  })

  test('asks again when the terms have changed since', () => {
    localStorage.setItem(TERMS_KEY, '2020-01-01')
    mount('/')
    expect(termsShowing()).toBe(true)
    accept()
    expect(localStorage.getItem(TERMS_KEY)).toBe(TERMS_VERSION)
  })
})

describe('somebody already signed in', () => {
  test('is asked too, over the app, and then the terms are readable from Settings', () => {
    auth = signedIn
    mount('/terms')
    expect(termsShowing()).toBe(true)
    expect(document.querySelector('.web-header')).not.toBeNull()
    expect(stageInert()).toBe(true)
    accept()
    expect(stageInert()).toBe(false)
    // /terms inside the shell: the full text under the app's own header.
    expect(document.querySelector('.web-header')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(en.terms.fullTitle)
    expect(document.querySelectorAll('.terms-section')).toHaveLength(7)
  })

  test('sees nothing of the agreement once it stands, and the front door is behind them', () => {
    auth = signedIn
    localStorage.setItem(TERMS_KEY, TERMS_VERSION)
    mount('/terms')
    expect(termsShowing()).toBe(false)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(en.terms.fullTitle)
    // Settings offers the row.
    cleanup()
    mount('/settings')
    expect(screen.getByRole('button', { name: /Terms & Safety/ })).toBeTruthy()
  })
})

describe('the full text before signing in', () => {
  test('is at /terms from the front door, with a way back', () => {
    localStorage.setItem(TERMS_KEY, TERMS_VERSION)
    mount('/')
    fireEvent.click(screen.getByRole('link', { name: en.welcome.termsLink }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.terms.fullTitle)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Discover')
  })
})
