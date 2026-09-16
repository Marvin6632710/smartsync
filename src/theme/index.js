import { useSyncExternalStore } from 'react'

/**
 * The app's appearance: light, dark, or whatever the device is set to.
 *
 * The preference is one word on this device (`smartsync:theme`), like the
 * language and the other preferences. What the page actually shows is the
 * resolved theme — `light` or `dark` — stamped on the root element as
 * `data-theme`, and the stylesheet's second token set does the rest; no
 * component knows which theme it is in. `public/theme-boot.js` stamps the
 * same attribute before the first paint, from the same stored word, so the
 * page never opens in one theme and switches to another.
 */
export const THEMES = ['light', 'dark', 'system']
export const DEFAULT_THEME = 'system'
export const THEME_KEY = 'smartsync:theme'

/** The colour the browser paints its own chrome, per resolved theme. */
const CHROME = { light: '#f4eee6', dark: '#171410' }

const media =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

function readPreference() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return THEMES.includes(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** The preference in force: 'light', 'dark' or 'system'. */
export function getThemePreference() {
  return readPreference()
}

/** What a preference means right now: 'light' or 'dark'. */
export function resolveTheme(preference = readPreference()) {
  if (preference === 'light' || preference === 'dark') return preference
  return media?.matches ? 'dark' : 'light'
}

/**
 * Stamps the resolved theme on the document. Called once here, whenever
 * the preference changes, and whenever the device changes its mind while
 * the preference is 'system'.
 */
export function applyTheme() {
  if (typeof document === 'undefined') return resolveTheme()
  const theme = resolveTheme()
  const root = document.documentElement
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', CHROME[theme])
  return theme
}

/** Keeps the choice and applies it. Anything unknown means 'system'. */
export function setThemePreference(preference) {
  const next = THEMES.includes(preference) ? preference : DEFAULT_THEME
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // Storage may be unavailable; the choice still holds for this page.
  }
  applyTheme()
  notify()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The preference and the theme it currently resolves to, for the one
 * screen that shows them. Only that screen re-renders when either changes;
 * everything else is themed by the stylesheet through the root attribute.
 */
export function useThemePreference() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => DEFAULT_THEME)
  const resolved = useSyncExternalStore(subscribe, resolveTheme, () => 'light')
  return { preference, resolved, setThemePreference }
}

// One listener for the device, attached once for the life of the page:
// when the preference is 'system', a change of the device's setting
// restamps the document at once, with no reload and no React involved.
if (media) {
  const onDeviceChange = () => {
    if (readPreference() === 'system') applyTheme()
    notify()
  }
  if (typeof media.addEventListener === 'function') media.addEventListener('change', onDeviceChange)
  else if (typeof media.addListener === 'function') media.addListener(onDeviceChange)
}

// A choice made in another tab reaches this one as it stands.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_KEY) return
    applyTheme()
    notify()
  })
}

applyTheme()
