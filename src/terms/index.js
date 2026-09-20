import { useSyncExternalStore } from 'react'

/**
 * The Terms & Safety agreement: whether this device has accepted the
 * current one.
 *
 * SmartSync puts strangers in the same place at the same time, so the first
 * screen anybody sees says what the app is for and what it must never be
 * used for, and nothing else renders until that has been agreed to. The
 * agreement is kept on the device (`smartsync:terms`), like the language
 * and the theme, as the version that was accepted — not a boolean — so
 * that changing the words means changing the version, and everybody is
 * asked again. Anything but the current version counts as not accepted.
 *
 * On the device rather than on the profile, because it has to hold before
 * there is a profile: the gate comes before sign-in. A person signing in
 * on a new device accepts again there, which is the right thing for a
 * screen whose point is that it was read.
 */

/** Bump when the wording of the agreement changes in substance. */
export const TERMS_VERSION = '2026-09-20'

export const TERMS_KEY = 'smartsync:terms'

/**
 * The things SmartSync must never be used for, in the order the screen
 * lists them. Ids only: the words live with the translations.
 */
export const TERMS_RULES = [
  'trafficking',
  'sexual',
  'violence',
  'stalking',
  'scams',
  'illegal',
  'hate',
  'privateInfo',
]

/** The sections of the full text, in reading order. Words with the translations. */
export const TERMS_SECTIONS = [
  'about',
  'account',
  'rules',
  'meeting',
  'reporting',
  'privacy',
  'changes',
]

// A page that blocks site data throws on the access itself; the agreement
// then holds for this page and no longer, which is the most it can do.
let acceptedInMemory = false

const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

/** Has this device accepted the current version? */
export function hasAcceptedTerms() {
  if (acceptedInMemory) return true
  try {
    return localStorage.getItem(TERMS_KEY) === TERMS_VERSION
  } catch {
    return false
  }
}

/** Keeps the acceptance and lets the app through. */
export function acceptTerms() {
  acceptedInMemory = true
  try {
    localStorage.setItem(TERMS_KEY, TERMS_VERSION)
  } catch {
    // Storage may be unavailable; the acceptance still holds for this page.
  }
  notify()
}

/** For tests: forgets the acceptance, on the device and in memory. */
export function resetTermsAcceptance() {
  acceptedInMemory = false
  try {
    localStorage.removeItem(TERMS_KEY)
  } catch {
    // Nothing kept, nothing to forget.
  }
  notify()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether the current agreement has been accepted; re-renders when it is. */
export function useTermsAcceptance() {
  return useSyncExternalStore(subscribe, hasAcceptedTerms, () => false)
}

// An acceptance in another tab reaches this one as it stands: the other
// tab's Continue is this tab's too, rather than asking twice.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== TERMS_KEY) return
    notify()
  })
}
