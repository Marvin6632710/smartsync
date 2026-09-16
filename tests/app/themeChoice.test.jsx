// @vitest-environment jsdom
/**
 * The appearance switch in Settings: three options, one chosen, and the
 * choice reads without colour and works from the keyboard.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import i18n from '../../src/i18n'
import th from '../../src/i18n/locales/th.json'

let ThemeChoice
let theme
beforeAll(async () => {
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  theme = await import('../../src/theme')
  ThemeChoice = (await import('../../src/components/ThemeChoice')).default
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

describe('ThemeChoice', () => {
  test('offers Light, Dark and System as a radio group with one checked', () => {
    render(<ThemeChoice />)
    const group = screen.getByRole('radiogroup', { name: 'Choose appearance' })
    const radios = screen.getAllByRole('radio')
    expect(group).toBeTruthy()
    expect(radios.map((r) => r.textContent.trim())).toEqual(['Light', 'Dark', 'System'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    // The chosen cell carries the tick, so the state is not colour alone.
    expect(radios[2].querySelector('.segment-check')).toBeTruthy()
    expect(radios[0].querySelector('.segment-check')).toBeNull()
  })

  test('choosing Dark stamps the document, keeps the choice and moves the tick', () => {
    render(<ThemeChoice />)
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(theme.THEME_KEY)).toBe('dark')
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios[1].querySelector('.segment-check')).toBeTruthy()
    expect(radios[1].className).toContain('selected')
  })

  test('the arrow keys move the choice like a radio group', () => {
    render(<ThemeChoice />)
    const group = screen.getByRole('radiogroup')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(theme.getThemePreference()).toBe('light') // wraps from System
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(theme.getThemePreference()).toBe('dark')
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(theme.getThemePreference()).toBe('light')
    // Only the chosen option is in the tab order.
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1])
  })

  test('is worded in the language in force', async () => {
    await i18n.changeLanguage('th')
    render(<ThemeChoice />)
    expect(screen.getAllByRole('radio').map((r) => r.textContent.trim())).toEqual([
      th.theme.light,
      th.theme.dark,
      th.theme.system,
    ])
  })
})
