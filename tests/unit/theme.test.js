// @vitest-environment jsdom
/**
 * The appearance preference: what the page opens in, how a choice is kept,
 * and that 'system' follows the device as it changes — without a reload.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

/** A stand-in for matchMedia whose answer the tests can change. */
const device = { matches: false, listeners: new Set() }
const fakeMediaQuery = {
  get matches() {
    return device.matches
  },
  addEventListener: (_type, listener) => device.listeners.add(listener),
  removeEventListener: (_type, listener) => device.listeners.delete(listener),
}
const deviceChanges = (dark) => {
  device.matches = dark
  device.listeners.forEach((listener) => listener({ matches: dark }))
}

let theme
beforeAll(async () => {
  window.matchMedia = vi.fn(() => fakeMediaQuery)
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />'
  theme = await import('../../src/theme')
})
beforeEach(() => {
  localStorage.clear()
  device.matches = false
  theme.setThemePreference('system')
})
afterEach(() => {
  localStorage.clear()
})

describe('the preference', () => {
  test('defaults to following the device, and reads only the three words', () => {
    expect(theme.getThemePreference()).toBe('system')
    localStorage.setItem(theme.THEME_KEY, 'dark')
    expect(theme.getThemePreference()).toBe('dark')
    localStorage.setItem(theme.THEME_KEY, 'sepia')
    expect(theme.getThemePreference()).toBe('system')
  })

  test('is kept on the device and stamped on the document at once', () => {
    theme.setThemePreference('dark')
    expect(localStorage.getItem(theme.THEME_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]').content).toBe('#171410')
    theme.setThemePreference('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]').content).toBe('#f4eee6')
  })

  test('treats anything unknown as following the device', () => {
    theme.setThemePreference('neon')
    expect(localStorage.getItem(theme.THEME_KEY)).toBe('system')
  })
})

describe('following the device', () => {
  test('resolves to whatever the device says right now', () => {
    device.matches = true
    expect(theme.resolveTheme('system')).toBe('dark')
    device.matches = false
    expect(theme.resolveTheme('system')).toBe('light')
    expect(theme.resolveTheme('dark')).toBe('dark')
    expect(theme.resolveTheme('light')).toBe('light')
  })

  test('restamps the document when the device changes, and only then', () => {
    theme.setThemePreference('system')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    deviceChanges(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    deviceChanges(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  test('ignores the device while a theme is chosen outright', () => {
    theme.setThemePreference('light')
    deviceChanges(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    theme.setThemePreference('dark')
    deviceChanges(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  test('attaches one device listener for the life of the page', () => {
    expect(device.listeners.size).toBe(1)
    theme.setThemePreference('dark')
    theme.setThemePreference('system')
    expect(device.listeners.size).toBe(1)
  })
})

describe('another tab', () => {
  test('changing the preference there changes the document here', () => {
    localStorage.setItem(theme.THEME_KEY, 'dark')
    window.dispatchEvent(new StorageEvent('storage', { key: theme.THEME_KEY, newValue: 'dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    window.dispatchEvent(new StorageEvent('storage', { key: 'smartsync:other', newValue: 'x' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
