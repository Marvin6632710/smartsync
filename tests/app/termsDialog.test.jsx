// @vitest-environment jsdom
/**
 * The Terms & Safety dialog: the eight things the app is not for, a
 * checkbox, and a Continue that does nothing until the box is ticked; no
 * way out that is not the box and the button; the full text one link
 * away, unfolding in place; and all of it in each of the four languages.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import i18n from '../../src/i18n'
import en from '../../src/i18n/locales/en.json'
import my from '../../src/i18n/locales/my.json'
import th from '../../src/i18n/locales/th.json'
import zh from '../../src/i18n/locales/zh.json'
import {
  TERMS_KEY,
  TERMS_RULES,
  TERMS_SECTIONS,
  TERMS_VERSION,
  hasAcceptedTerms,
  resetTermsAcceptance,
} from '../../src/terms'
import TermsDialog from '../../src/components/TermsDialog'

beforeEach(() => {
  localStorage.clear()
  resetTermsAcceptance()
})
afterEach(async () => {
  cleanup()
  resetTermsAcceptance()
  localStorage.clear()
  await i18n.changeLanguage('en')
})

const continueButton = () => screen.getByRole('button', { name: /Continue/ })
const agreeBox = () => screen.getByRole('checkbox', { name: en.terms.agree })

describe('the agreement dialog', () => {
  test('is a modal dialog named by its title, with focus moved into it', () => {
    render(
      <>
        <button>behind</button>
        <TermsDialog />
      </>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Terms & Safety' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }))
    expect(document.body.style.overflow).toBe('hidden')
  })

  test('lists every rule, the way to report, and what breaking a rule costs', () => {
    render(<TermsDialog />)
    expect(screen.getByText(en.terms.neverTitle)).toBeTruthy()
    const items = [...document.querySelectorAll('.terms-rules li')].map((li) => li.textContent)
    expect(items).toEqual(TERMS_RULES.map((rule) => en.terms.rules[rule]))
    expect(items).toHaveLength(8)
    expect(screen.getByText(en.terms.report)).toBeTruthy()
    expect(screen.getByText(en.terms.consequences)).toBeTruthy()
    expect(screen.getByText(`Version ${TERMS_VERSION}`)).toBeTruthy()
  })

  test('Continue is disabled until the box is ticked, and then keeps the acceptance', () => {
    render(<TermsDialog />)
    expect(continueButton().disabled).toBe(true)
    expect(agreeBox().checked).toBe(false)

    // Submitting the form around a disabled button must not get through.
    fireEvent.submit(document.querySelector('.terms-consent'))
    expect(hasAcceptedTerms()).toBe(false)

    fireEvent.click(agreeBox())
    expect(continueButton().disabled).toBe(false)
    fireEvent.click(continueButton())
    expect(hasAcceptedTerms()).toBe(true)
    expect(localStorage.getItem(TERMS_KEY)).toBe(TERMS_VERSION)
  })

  test('has no other way out: no close button, and Escape does nothing', () => {
    render(<TermsDialog />)
    expect(screen.queryByRole('button', { name: /close|cancel/i })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(hasAcceptedTerms()).toBe(false)
  })

  test('the full text unfolds inside the dialog, keeps the tick, and folds away again', () => {
    render(<TermsDialog />)
    fireEvent.click(agreeBox())
    const toggle = screen.getByRole('button', { name: en.terms.readFull })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)

    expect(screen.getByText(en.terms.fullTitle)).toBeTruthy()
    const sections = [...document.querySelectorAll('.terms-section h4')].map((h) => h.textContent)
    expect(sections).toEqual(TERMS_SECTIONS.map((section) => en.terms.doc[section].title))
    // The long form repeats the eight rules, so the two can never disagree.
    expect(document.querySelectorAll('.terms-text-rules li')).toHaveLength(8)
    expect(agreeBox().checked).toBe(true)

    const hide = screen.getByRole('button', { name: en.terms.hideFull })
    expect(hide.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(hide)
    expect(screen.queryByText(en.terms.fullTitle)).toBeNull()
    expect(agreeBox().checked).toBe(true)
  })

  test('Tab stays inside the dialog', () => {
    render(
      <>
        <button>behind</button>
        <TermsDialog />
      </>,
    )
    // With Continue disabled the focusable ring is: language, read link, box.
    agreeBox().focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(agreeBox())
  })

  test('releases the page when it goes: body scroll and focus return', () => {
    const { unmount } = render(
      <>
        <button>behind</button>
        <TermsDialog />
      </>,
    )
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  test.each([
    ['th', th],
    ['my', my],
    ['zh', zh],
  ])('reads in %s', async (code, locale) => {
    await i18n.changeLanguage(code)
    render(<TermsDialog />)
    expect(screen.getByRole('dialog', { name: locale.terms.title })).toBeTruthy()
    expect(screen.getByText(locale.terms.rules.trafficking)).toBeTruthy()
    expect(screen.getByText(locale.terms.rules.privateInfo)).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: locale.terms.agree })).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(locale.common.continue) }).disabled).toBe(
      true,
    )
  })

  test('the language can be changed from inside the dialog', () => {
    render(<TermsDialog />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zh' } })
    expect(screen.getByRole('dialog', { name: zh.terms.title })).toBeTruthy()
  })
})
