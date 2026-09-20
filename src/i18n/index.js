import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import my from './locales/my.json'
import th from './locales/th.json'
import zh from './locales/zh.json'
// Shared with the Cloud Function that words a push; see notificationText.
import kinds from './notificationKinds.json'

/**
 * The languages the interface speaks.
 *
 * `code` is what the app stores and what i18next runs on; `locale` is the
 * BCP 47 tag handed to Intl for dates, times and numbers, where a region
 * matters (Thai and Burmese use the calendar and clock of their country;
 * Simplified Chinese is written as it is in mainland China). `label` is the
 * language's own name for itself — a selector that says "Thai" to somebody
 * who reads only Thai has failed at the one moment it was needed.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-GB' },
  { code: 'th', label: 'ไทย', locale: 'th-TH' },
  { code: 'my', label: 'မြန်မာ', locale: 'my-MM' },
  { code: 'zh', label: '简体中文', locale: 'zh-CN' },
]

export const DEFAULT_LANGUAGE = 'en'

/** Where the choice is kept: on this device, like the other preferences. */
export const LANGUAGE_KEY = 'smartsync:language'

const CODES = new Set(LANGUAGES.map((language) => language.code))

/** The supported code a stored or browser value maps to, or null. */
export function matchLanguage(value) {
  const tag = String(value || '')
    .trim()
    .toLowerCase()
  if (!tag) return null
  if (CODES.has(tag)) return tag
  // "th-TH", "my-MM", "zh-CN", "zh-Hans-CN", "en-US" — the primary subtag
  // is the language. Traditional-script Chinese tags fall back to the only
  // Chinese offered rather than to English, which would be further away.
  const primary = tag.split('-')[0]
  return CODES.has(primary) ? primary : null
}

function storedLanguage() {
  try {
    return matchLanguage(localStorage.getItem(LANGUAGE_KEY))
  } catch {
    return null
  }
}

function browserLanguage() {
  if (typeof navigator === 'undefined') return null
  const candidates = Array.isArray(navigator.languages) ? navigator.languages : [navigator.language]
  for (const candidate of candidates) {
    const match = matchLanguage(candidate)
    if (match) return match
  }
  return null
}

/**
 * What the app starts in: the language chosen on this device, else the
 * browser's first supported language, else English. Chosen once, here, so
 * the first paint is already in the right language rather than flashing
 * English and switching.
 */
export function initialLanguage() {
  return storedLanguage() || browserLanguage() || DEFAULT_LANGUAGE
}

export function languageOf(code) {
  return LANGUAGES.find((language) => language.code === code) || LANGUAGES[0]
}

/** The Intl locale for the language in force. */
export function currentLocale() {
  return languageOf(i18n.language).locale
}

/**
 * Switches language and keeps the choice. The document's `lang` follows,
 * so the browser picks the right fonts, hyphenation and screen-reader voice.
 */
export async function setLanguage(code) {
  const next = matchLanguage(code) || DEFAULT_LANGUAGE
  await i18n.changeLanguage(next)
  try {
    localStorage.setItem(LANGUAGE_KEY, next)
  } catch {
    // Storage may be unavailable; the choice still holds for this page.
  }
}

function applyDocumentLanguage(code) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = code
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    th: { translation: th },
    my: { translation: my },
    zh: { translation: zh },
  },
  lng: initialLanguage(),
  // Anything a translation lacks is shown in English rather than as a key.
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...CODES],
  // Resources are bundled and already in memory: initialise synchronously,
  // so nothing renders before the strings exist.
  initImmediate: false,
  interpolation: {
    // React escapes for us; escaping again would print "&amp;".
    escapeValue: false,
  },
  returnNull: false,
  returnEmptyString: false,
})

applyDocumentLanguage(i18n.language)
i18n.on('languageChanged', applyDocumentLanguage)

// A choice made in one tab reaches the others as they stand, rather than
// on their next reload: the browser tells every other tab about the write.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== LANGUAGE_KEY) return
    const next = matchLanguage(event.newValue)
    if (next && next !== i18n.language) i18n.changeLanguage(next)
  })
}

/**
 * The display name of a stored value — a category, a time band, a report
 * reason, a signal — which stays in English in the database and on the
 * wire, and is translated only at the moment it is shown. Anything not in
 * the table (an unknown value from an older record) is shown as it is.
 */
const labelFor = (group) => (value) => {
  const key = String(value || '')
    .trim()
    .toLowerCase()
  if (!key) return ''
  return i18n.t(`${group}.${key}`, { defaultValue: String(value) })
}
export const categoryLabel = labelFor('categories')
export const timeBandLabel = labelFor('timeBands')
export const reportReasonLabel = labelFor('reportReasons')
export const signalLabel = labelFor('signals')

/**
 * "Football", "Football and Coffee", "Football, Coffee and Study" — joined
 * the way the language joins a list. The joiner and the final conjunction
 * come from the translation rather than Intl.ListFormat: not every
 * browser ships list data for every language (desktop Chrome has none for
 * Burmese and quietly answers in English), and the same words must come
 * out on every device.
 */
export function listInWords(items) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean).map(String)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  return i18n.t('common.listLast', {
    list: list.slice(0, -1).join(i18n.t('common.listJoin')),
    last: list[list.length - 1],
  })
}

/**
 * A distance for the screen. `formatDistance` in utils/geo stays English
 * and dependency-free because the evaluation harness imports it under
 * plain Node; this is the same shape in the language in force.
 */
export function distanceLabel(km) {
  if (km === null || km === undefined || !Number.isFinite(km)) return ''
  if (km < 1) return i18n.t('distance.metres', { value: Math.round(km * 1000) })
  if (km < 10) return i18n.t('distance.km', { value: km.toFixed(1) })
  return i18n.t('distance.km', { value: Math.round(km) })
}

/** Digits are kept Latin everywhere: counts, percentages, distances, clocks. */
export function formatNumber(value, options = {}) {
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value ?? '')
  return new Intl.NumberFormat(currentLocale(), { numberingSystem: 'latn', ...options }).format(
    number,
  )
}

/** "35%" — the sign follows the locale's convention, the digits stay Latin. */
export function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return `${value ?? '--'}%`
  return new Intl.NumberFormat(currentLocale(), {
    style: 'percent',
    numberingSystem: 'latn',
    maximumFractionDigits: 0,
  }).format(number / 100)
}

export default i18n

/**
 * A recommendation reason, worded for the language in force.
 *
 * The scorer attaches reasons as facts (`reasonKeys`: a code and the value
 * the wording needs) next to the English sentences it always produced
 * (`reasons`). The facts are worded here; an activity from before the facts
 * existed — a cached one, a test fixture — falls back to its sentences.
 */
export function reasonText(reason) {
  if (!reason || typeof reason !== 'object') return String(reason ?? '')
  return i18n.t(`reasons.${reason.key}`, {
    defaultValue: i18n.t('reasons.default'),
    category: categoryLabel(reason.category),
    distance: distanceLabel(reason.distanceKm),
    // Lower-cased for the scripts that have a case, so the English reads as
    // it always did ("your preferred evening time"); the others are untouched.
    band: timeBandLabel(reason.band).toLowerCase(),
  })
}

export function reasonLines(activity) {
  if (Array.isArray(activity?.reasonKeys)) return activity.reasonKeys.map(reasonText)
  return Array.isArray(activity?.reasons) ? activity.reasons.map(String) : []
}

/**
 * A person's name as it should be shown.
 *
 * Two names are the app's rather than a person's: the public name written
 * in place of the real one while anonymous mode is on — stored, so the
 * privacy holds against a direct read of the database and travels onto
 * every activity the person hosts — and the name a profile gets when none
 * was typed. Both are fixed English constants in the documents and worded
 * here for the reader. Any other name is somebody's own and is left alone.
 */
export function personName(name) {
  const key = kinds.appNames[String(name ?? '').trim()]
  return key ? i18n.t(key) : name
}

/**
 * A takedown reason as the app itself writes it — when an account is
 * suspended or closed, everything it hosts comes down with one of two fixed
 * reasons — is worded for the reader; an admin's own words are shown as
 * written.
 */
const APP_TAKEDOWN_REASONS = {
  'The host\u2019s account was suspended': 'activity.hostSuspended',
  'The host\u2019s account was closed': 'activity.hostClosed',
}
export function takedownReasonText(reason) {
  const key = APP_TAKEDOWN_REASONS[String(reason ?? '')]
  return key ? i18n.t(key) : reason
}
