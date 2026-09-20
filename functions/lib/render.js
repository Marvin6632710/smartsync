/**
 * The words on a push, in the recipient's language.
 *
 * The same strings the screen uses: the locale files are copied into this
 * package by scripts/sync-locales.mjs, so nothing is translated twice. A
 * record carries its `kind` and `params`; the wording is rendered here from
 * the same keys `localizeNotification` uses in the app.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import i18next from 'i18next'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = join(here, '..', 'locales')

export const LANGUAGES = ['en', 'th', 'my', 'zh']
export const DEFAULT_LANGUAGE = 'en'

const readJson = (file) => JSON.parse(readFileSync(join(localesDir, file), 'utf8'))

let instance = null
let kinds = null

function load() {
  if (instance) return instance
  const table = readJson('notificationKinds.json')
  kinds = table
  const resources = {}
  for (const code of LANGUAGES) resources[code] = { translation: readJson(`${code}.json`) }
  instance = i18next.createInstance()
  instance.init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGES,
    initImmediate: false,
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
  })
  return instance
}

/** The supported code a stored or device value maps to, or null. */
export function matchLanguage(value) {
  const tag = String(value || '')
    .trim()
    .toLowerCase()
  if (!tag) return null
  if (LANGUAGES.includes(tag)) return tag
  const primary = tag.split('-')[0]
  return LANGUAGES.includes(primary) ? primary : null
}

/**
 * Title and body for a push, or null for a kind the table does not know.
 *
 * A chat push never carries the message text unless the recipient asked
 * for previews: a lock screen is not a private place, so by default it says
 * who wrote, and in which thread, and no more.
 */
export function renderPush({ kind, params = {}, language, chatPreview = false }) {
  const i18n = load()
  const key = kinds.kinds[kind]
  if (!key) return null
  const lng = matchLanguage(language) || DEFAULT_LANGUAGE
  const t = (k, p) => i18n.t(k, { lng, ...p })
  const filled = { ...params }
  const appName = kinds.appNames[String(filled.name ?? '').trim()]
  if (appName) filled.name = t(appName)
  const title = t(`notifications.templates.${key}Title`, filled)
  const body =
    kind === 'newMessage' && !chatPreview
      ? t('notifications.push.messageFrom', filled)
      : t(`notifications.templates.${key}Body`, filled)
  return { title: clip(title, 120), body: clip(body, 300), language: lng }
}

const clip = (text, max) => {
  const s = String(text ?? '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
