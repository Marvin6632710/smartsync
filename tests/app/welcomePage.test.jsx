// @vitest-environment jsdom
/**
 * The front door: the headline, the two ways in — each reachable twice,
 * from the bar and from the hero — the stage drawn with the app's own
 * card, reasons and chat, the counts read from the code, the language and
 * the appearance changeable on the page, and every word of it in each of
 * the four languages.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { categories } from '../../src/data/categories'
import i18n, { LANGUAGES } from '../../src/i18n'
import en from '../../src/i18n/locales/en.json'
import my from '../../src/i18n/locales/my.json'
import th from '../../src/i18n/locales/th.json'
import zh from '../../src/i18n/locales/zh.json'

let WelcomePage
let theme
beforeAll(async () => {
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  theme = await import('../../src/theme')
  WelcomePage = (await import('../../src/pages/WelcomePage')).default
})
beforeEach(() => {
  localStorage.clear()
  theme.setThemePreference('system')
})
afterEach(async () => {
  cleanup()
  localStorage.clear()
  await i18n.changeLanguage('en')
})

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/signin" element={<p>sign-in page</p>} />
        <Route path="/signup" element={<p>sign-up page</p>} />
        <Route path="/terms" element={<p>terms page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('the welcome page', () => {
  test('says what SmartSync is, with the last phrase in the accent', () => {
    mount()
    const headline = screen.getByRole('heading', { level: 1 })
    expect(headline.textContent).toBe(
      'Discover activities, meet people, and find experiences that match you.',
    )
    expect(headline.querySelector('.welcome-accent').textContent).toBe('match you')
    expect(screen.getByText(en.welcome.lead)).toBeTruthy()
  })

  test('offers Sign up first and Log in second, in the hero and in the bar', () => {
    mount()
    const buttons = screen.getAllByRole('button', { name: /Sign up|Log in/ })
    expect(buttons.map((b) => b.textContent.trim())).toEqual(['Sign up', 'Log in'])
    expect(buttons[0].className).toContain('primary-button')
    expect(buttons[1].className).toContain('secondary-button')
    expect(screen.getByRole('link', { name: 'Sign up' }).getAttribute('href')).toBe('/signup')
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/signin')
  })

  test('Sign up goes to the sign-up form and Log in to the sign-in form', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Sign up/ }))
    expect(screen.getByText('sign-up page')).toBeTruthy()
    cleanup()
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Log in/ }))
    expect(screen.getByText('sign-in page')).toBeTruthy()
  })

  test('the facts under the buttons are read from the code', () => {
    mount()
    const facts = [...document.querySelectorAll('.welcome-facts li')].map((li) => li.textContent)
    expect(facts).toEqual([
      `${categories.length} categories`,
      `${LANGUAGES.length} languages`,
      en.welcome.facts.free,
    ])
    expect(categories.length).toBe(12)
    expect(LANGUAGES.length).toBe(4)
  })

  test('the stage is the app: a card with its score, the reasons for it, the chat', () => {
    mount()
    const stage = document.querySelector('.welcome-stage')
    expect(stage.getAttribute('aria-hidden')).toBe('true')
    const card = stage.querySelector('.activity-card')
    expect(card.getAttribute('data-category')).toBe('football')
    expect(card.querySelector('.match-pill').textContent).toBe('92% match')
    expect(card.querySelector('h3').textContent).toBe(en.welcome.stage.cardTitle)
    expect(card.querySelector('.going-count').textContent).toBe('4 of 10 going')
    expect(card.querySelector('.urgency-pill').textContent).toBe('6 spots left')
    // Worded by the same function that words them inside the app.
    const reasons = [...stage.querySelectorAll('.reason-list li')].map((li) => li.textContent)
    expect(reasons).toEqual([
      'Matches your Football interest',
      'Only 1.2 km away',
      'Fits your preferred evening time',
    ])
    const bubbles = [...stage.querySelectorAll('.message-bubble strong')].map((s) => s.textContent)
    expect(bubbles).toEqual([en.welcome.stage.chatName, 'You'])
  })

  test('keeps the three steps, adds the three safety points, and links to the full terms', () => {
    mount()
    const steps = [...document.querySelectorAll('.welcome-steps strong')].map((s) => s.textContent)
    expect(steps).toEqual([en.welcome.step1Title, en.welcome.step2Title, en.welcome.step3Title])
    const safe = [...document.querySelectorAll('.welcome-safe-list strong')].map(
      (s) => s.textContent,
    )
    expect(safe).toEqual([en.welcome.safe1Title, en.welcome.safe2Title, en.welcome.safe3Title])
    fireEvent.click(screen.getByRole('link', { name: en.welcome.termsLink }))
    expect(screen.getByText('terms page')).toBeTruthy()
  })

  test('the appearance can be chosen on the page and is stamped at once', () => {
    mount()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(theme.THEME_KEY)).toBe('dark')
    fireEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(theme.THEME_KEY)).toBe('system')
  })

  test.each([
    ['th', th],
    ['my', my],
    ['zh', zh],
  ])('reads in %s', async (code, locale) => {
    await i18n.changeLanguage(code)
    mount()
    const headline = screen.getByRole('heading', { level: 1 })
    expect(headline.textContent).toBe(locale.welcome.headline.replace(/<\/?\d>/g, ''))
    expect(headline.querySelector('.welcome-accent')).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(locale.welcome.signUp) })).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(locale.welcome.logIn) })).toBeTruthy()
    expect(screen.getByText(locale.welcome.stage.cardTitle)).toBeTruthy()
    // The reasons follow the language too.
    expect(document.querySelector('.reason-list li').textContent).toBe(
      locale.reasons.interest.replace('{{category}}', locale.categories.football),
    )
    expect(document.documentElement.lang).toBe(code)
  })

  test('the language can be changed on the page itself', () => {
    mount()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'th' } })
    expect(screen.getByText(th.welcome.lead)).toBeTruthy()
  })
})
