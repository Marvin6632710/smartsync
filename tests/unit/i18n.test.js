// @vitest-environment jsdom
/**
 * The language layer: which language the app starts in, how a choice is
 * kept, and that every language has every string — a missing key would
 * show English silently, and a missing placeholder would swallow a name.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import i18n, {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_KEY,
  categoryLabel,
  currentLocale,
  distanceLabel,
  formatPercent,
  initialLanguage,
  languageOf,
  listInWords,
  matchLanguage,
  personName,
  reasonLines,
  reasonText,
  setLanguage,
  takedownReasonText,
  timeBandLabel,
} from '../../src/i18n'
import en from '../../src/i18n/locales/en.json'
import my from '../../src/i18n/locales/my.json'
import th from '../../src/i18n/locales/th.json'
import zh from '../../src/i18n/locales/zh.json'

beforeEach(() => {
  localStorage.clear()
})
afterEach(async () => {
  localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('the four languages', () => {
  test('are offered under their own names', () => {
    expect(LANGUAGES.map((language) => language.label)).toEqual([
      'English',
      'ไทย',
      'မြန်မာ',
      '简体中文',
    ])
    expect(LANGUAGES.map((language) => language.code)).toEqual(['en', 'th', 'my', 'zh'])
  })

  test('matchLanguage accepts codes, region tags and script tags', () => {
    expect(matchLanguage('th')).toBe('th')
    expect(matchLanguage('TH-th')).toBe('th')
    expect(matchLanguage('my-MM')).toBe('my')
    expect(matchLanguage('zh-Hans-CN')).toBe('zh')
    expect(matchLanguage('zh-TW')).toBe('zh')
    expect(matchLanguage('en-US')).toBe('en')
    expect(matchLanguage('fr')).toBeNull()
    expect(matchLanguage('')).toBeNull()
    expect(matchLanguage(undefined)).toBeNull()
  })

  test('languageOf falls back to English for anything unknown', () => {
    expect(languageOf('my').locale).toBe('my-MM')
    expect(languageOf('xx').code).toBe(DEFAULT_LANGUAGE)
    expect(languageOf(undefined).code).toBe(DEFAULT_LANGUAGE)
  })
})

describe('the language the app starts in', () => {
  test('is the one kept on this device before anything the browser says', () => {
    localStorage.setItem(LANGUAGE_KEY, 'my')
    expect(initialLanguage()).toBe('my')
  })

  test('is the first supported browser language when nothing is kept', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'languages')
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['fr-FR', 'th-TH', 'en'],
    })
    try {
      expect(initialLanguage()).toBe('th')
    } finally {
      if (original) Object.defineProperty(navigator, 'languages', original)
      else delete navigator.languages
    }
  })

  test('ignores a stored value that is no longer a supported language', () => {
    localStorage.setItem(LANGUAGE_KEY, 'klingon')
    const original = Object.getOwnPropertyDescriptor(navigator, 'languages')
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['de-DE'] })
    try {
      expect(initialLanguage()).toBe('en')
    } finally {
      if (original) Object.defineProperty(navigator, 'languages', original)
      else delete navigator.languages
    }
  })
})

describe('setLanguage', () => {
  test('switches the strings, keeps the choice, and marks the document', async () => {
    await setLanguage('th')
    expect(i18n.language).toBe('th')
    expect(i18n.t('nav.discover')).toBe(th.nav.discover)
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('th')
    expect(document.documentElement.lang).toBe('th')
    expect(currentLocale()).toBe('th-TH')
  })

  test('maps an unsupported code to English rather than leaving a broken state', async () => {
    await setLanguage('xx')
    expect(i18n.language).toBe('en')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en')
  })

  test('falls back to English for a key a language lacks', async () => {
    await setLanguage('zh')
    expect(i18n.t('nav.discover')).toBe(zh.nav.discover)
    // A key added to English but not yet to the others shows the English
    // wording rather than the key's name.
    i18n.addResource('en', 'translation', 'probe.onlyEnglish', 'Only in English')
    expect(i18n.t('probe.onlyEnglish')).toBe('Only in English')
    i18n.removeResourceBundle('en', 'translation')
    i18n.addResourceBundle('en', 'translation', en, true, true)
  })
})

/** Every leaf key of a locale file, with plural suffixes folded away. */
function leafKeys(tree, prefix = '') {
  const keys = new Map()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') {
      for (const [k, v] of leafKeys(value, path)) keys.set(k, v)
    } else {
      keys.set(path.replace(/_(one|other)$/, ''), value)
    }
  }
  return keys
}
const placeholders = (text) => new Set(String(text).match(/\{\{\w+\}\}/g) || [])

describe('translation files', () => {
  const english = leafKeys(en)

  test.each([
    ['th', th],
    ['my', my],
    ['zh', zh],
  ])('%s has every key English has, and nothing more', (_code, locale) => {
    const keys = leafKeys(locale)
    const missing = [...english.keys()].filter((key) => !keys.has(key))
    const extra = [...keys.keys()].filter((key) => !english.has(key))
    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  test.each([
    ['th', th],
    ['my', my],
    ['zh', zh],
  ])('%s keeps every placeholder English uses', (_code, locale) => {
    const keys = leafKeys(locale)
    const mismatched = []
    for (const [key, text] of english) {
      const expected = placeholders(text)
      const actual = placeholders(keys.get(key))
      if ([...expected].some((p) => !actual.has(p)) || [...actual].some((p) => !expected.has(p))) {
        mismatched.push(key)
      }
    }
    expect(mismatched).toEqual([])
  })

  test('no translation is left empty', () => {
    for (const locale of [th, my, zh]) {
      for (const [key, text] of leafKeys(locale)) {
        // Not trimmed: Thai joins a list with a bare space, on purpose.
        expect(String(text), key).not.toBe('')
      }
    }
  })
})

describe('display labels for stored values', () => {
  test('translate a stored English category at display time only', async () => {
    expect(categoryLabel('Football')).toBe('Football')
    await setLanguage('th')
    expect(categoryLabel('Football')).toBe(th.categories.football)
    expect(timeBandLabel('Evening')).toBe(th.timeBands.evening)
    // A value the table does not know is shown as stored, never as a key.
    expect(categoryLabel('Underwater basket weaving')).toBe('Underwater basket weaving')
    expect(categoryLabel('')).toBe('')
  })

  test('word the app’s own takedown reasons but leave a moderator’s words alone', async () => {
    await setLanguage('zh')
    expect(takedownReasonText('The host’s account was suspended')).toBe(zh.activity.hostSuspended)
    expect(takedownReasonText('Spam, three reports')).toBe('Spam, three reports')
  })
})

describe('numbers and lists', () => {
  test('keep Latin digits in every language', async () => {
    await setLanguage('my')
    expect(formatPercent(35)).toMatch(/35/)
    expect(formatPercent(35)).not.toMatch(/[၀-၉]/)
    expect(distanceLabel(0.35)).toMatch(/350/)
    expect(distanceLabel(2.345)).toMatch(/2\.3/)
    expect(distanceLabel(12.6)).toMatch(/13/)
    expect(distanceLabel(undefined)).toBe('')
  })

  test('join a list the way the language does', async () => {
    expect(listInWords(['Football', 'Coffee', 'Study'])).toBe('Football, Coffee and Study')
    expect(listInWords(['Football'])).toBe('Football')
    expect(listInWords([])).toBe('')
    await setLanguage('zh')
    expect(listInWords(['足球', '咖啡'])).toBe('足球和咖啡')
  })
})

describe('recommendation reasons', () => {
  test('are worded from the scorer’s facts in the language in force', async () => {
    const activity = {
      reasons: ['Matches your interest in Football'],
      reasonKeys: [{ key: 'interest', category: 'Football' }],
    }
    expect(reasonLines(activity)).toEqual([i18n.t('reasons.interest', { category: 'Football' })])
    await setLanguage('th')
    expect(reasonLines(activity)).toEqual([
      th.reasons.interest.replace('{{category}}', th.categories.football),
    ])
  })

  test('fall back to the English sentences of an activity without facts', () => {
    expect(reasonLines({ reasons: ['Close to you'] })).toEqual(['Close to you'])
    expect(reasonLines({})).toEqual([])
    expect(reasonText('plain')).toBe('plain')
  })
})

describe('dates and lists without browser locale data', () => {
  test('name days and months from the translation, so Burmese never falls back to English', async () => {
    const { formatActivityDate } = await import('../../src/utils/time')
    const now = new Date(2026, 8, 15) // a Tuesday
    await setLanguage('my')
    expect(formatActivityDate('2026-09-18', now)).toBe(my.time.weekdays[5])
    expect(formatActivityDate('2026-09-25', now)).toBe(
      `${my.time.monthsShort[8]} 25 ${my.time.weekdaysShort[5]}`,
    )
    expect(listInWords(['ဘောလုံး', 'ကော်ဖီ', 'အပြေး'])).toBe('ဘောလုံး၊ ကော်ဖီနှင့် အပြေး')
    await setLanguage('th')
    expect(formatActivityDate('2026-09-18', now)).toBe('วันศุกร์')
    expect(formatActivityDate('2026-09-25', now)).toBe('ศ. 25 ก.ย.')
    expect(listInWords(['ฟุตบอล', 'กาแฟ', 'วิ่ง'])).toBe('ฟุตบอล กาแฟ และวิ่ง')
    await setLanguage('zh')
    expect(formatActivityDate('2026-09-25', now)).toBe('9月25日周五')
    await setLanguage('en')
    expect(formatActivityDate('2026-09-18', now)).toBe('Friday')
    expect(formatActivityDate('2026-09-25', now)).toBe('Fri 25 Sept')
  })
})

describe('personName', () => {
  test('words the app’s own placeholder names and leaves people’s names alone', async () => {
    expect(personName('Anonymous user')).toBe('Anonymous user')
    expect(personName('Mya')).toBe('Mya')
    await setLanguage('th')
    expect(personName('Anonymous user')).toBe(th.profile.anonymousName)
    expect(personName('New user')).toBe(th.profile.newUserName)
    expect(personName('Mya')).toBe('Mya')
    expect(personName(undefined)).toBeUndefined()
    expect(personName('')).toBe('')
  })

  test('reaches into stored notifications and report context', async () => {
    const { localizeNotification, storedText } = await import('../../src/i18n/notificationText')
    const { localizeReportContext, storedContext } = await import('../../src/i18n/reportContext')
    await setLanguage('zh')
    const shown = localizeNotification(
      storedText('someoneJoined', { name: 'Anonymous user', title: 'Sunday football' }),
    )
    expect(shown.body).toContain(zh.profile.anonymousName)
    expect(shown.body).not.toContain('Anonymous user')
    const context = localizeReportContext(
      storedContext('activity', { title: 'Run', place: 'Park', host: 'Anonymous user' }),
    )
    expect(context).toContain(zh.profile.anonymousName)
    expect(context).toContain('Run')
  })
})

describe('another tab', () => {
  test('changing the language there changes it here', async () => {
    await setLanguage('en')
    window.dispatchEvent(
      new StorageEvent('storage', { key: LANGUAGE_KEY, newValue: 'zh', oldValue: 'en' }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(i18n.language).toBe('zh')
    expect(document.documentElement.lang).toBe('zh')
    // Other keys, and values that are not a language, are ignored.
    window.dispatchEvent(new StorageEvent('storage', { key: 'smartsync:other', newValue: 'th' }))
    window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY, newValue: 'nope' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(i18n.language).toBe('zh')
  })
})
