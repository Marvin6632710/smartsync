// @vitest-environment jsdom
/**
 * The language switch: choosing a language rewords the screen at once,
 * keeps the choice for the next visit, and offers each language under its
 * own name — the one thing the control must get right for somebody who
 * cannot read the rest of the page.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import i18n, { LANGUAGE_KEY } from '../../src/i18n'
import th from '../../src/i18n/locales/th.json'
import LanguageMenu from '../../src/components/LanguageMenu'

beforeEach(() => {
  localStorage.clear()
})
afterEach(async () => {
  cleanup()
  localStorage.clear()
  await i18n.changeLanguage('en')
})

function Screen() {
  const { t } = useTranslation()
  return (
    <div>
      <h1>{t('settings.title')}</h1>
      <LanguageMenu />
    </div>
  )
}

describe('LanguageMenu', () => {
  test('lists every language by its own name and shows the one in force', () => {
    render(<Screen />)
    const select = screen.getByRole('combobox', { name: i18n.t('language.select') })
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'English',
      'ไทย',
      'မြန်မာ',
      '简体中文',
    ])
    expect(select.value).toBe('en')
    expect(screen.getByRole('option', { name: 'ไทย' }).getAttribute('lang')).toBe('th')
  })

  test('rewords the page, keeps the choice and marks the document', async () => {
    render(<Screen />)
    expect(screen.getByRole('heading').textContent).toBe(i18n.t('settings.title', { lng: 'en' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'th' } })
    expect(await screen.findByText(th.settings.title)).toBeTruthy()
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('th')
    expect(document.documentElement.lang).toBe('th')
    expect(screen.getByRole('combobox').value).toBe('th')
  })
})
