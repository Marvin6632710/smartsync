// @vitest-environment jsdom
/**
 * The one-press appearance switch in the bar.
 *
 * The three-way choice — light, dark, or follow the device — stays in
 * Settings, because "follow my device" is decided once. This is the other
 * case: the screen in front of you is wrong *now*. So the only thing worth
 * pinning is that a press does what its label promises, including from
 * `system`, where what it means depends on what the device is currently
 * saying rather than on the stored word.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import en from '../../src/i18n/locales/en.json'

let deviceIsDark = false
beforeEach(() => {
  localStorage.clear()
  deviceIsDark = false
  window.matchMedia = vi.fn(() => ({
    get matches() {
      return deviceIsDark
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
  vi.resetModules()
})
afterEach(cleanup)

/** Fresh modules each time: the theme store is module state by design. */
async function mount() {
  const { default: ThemeToggle } = await import('../../src/components/ThemeToggle')
  const theme = await import('../../src/theme')
  render(<ThemeToggle />)
  return { theme, button: screen.getByRole('button') }
}

const stored = () => localStorage.getItem('smartsync:theme')

describe('the appearance toggle', () => {
  test('in light, it offers dark — and takes it', async () => {
    const { button } = await mount()
    expect(button.getAttribute('aria-label')).toBe(en.theme.switchTo.dark)
    fireEvent.click(button)
    expect(stored()).toBe('dark')
  })

  test('in dark, it offers light', async () => {
    localStorage.setItem('smartsync:theme', 'dark')
    const { button } = await mount()
    expect(button.getAttribute('aria-label')).toBe(en.theme.switchTo.light)
    fireEvent.click(button)
    expect(stored()).toBe('light')
  })

  test('from "system" it takes the opposite of what is actually on screen', async () => {
    // The stored word is neither light nor dark, so the press has to be
    // decided by what the device is saying at that moment — otherwise it
    // would sometimes appear to do nothing.
    deviceIsDark = true
    localStorage.setItem('smartsync:theme', 'system')
    const { button } = await mount()
    expect(button.getAttribute('aria-label')).toBe(en.theme.switchTo.light)
    fireEvent.click(button)
    expect(stored()).toBe('light')
  })

  test('from "system" on a light device, the same in reverse', async () => {
    deviceIsDark = false
    localStorage.setItem('smartsync:theme', 'system')
    const { button } = await mount()
    expect(button.getAttribute('aria-label')).toBe(en.theme.switchTo.dark)
    fireEvent.click(button)
    expect(stored()).toBe('dark')
  })

  test('a press changes what the page is wearing, not just what is stored', async () => {
    const { button } = await mount()
    fireEvent.click(button)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  test('the label is the action, not the state', async () => {
    // A screen reader should hear what pressing does, not what it is
    // looking at — the page already says that in every other way.
    const { button } = await mount()
    expect(button.getAttribute('aria-label')).toMatch(/switch to/i)
  })
})
