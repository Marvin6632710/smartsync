// @vitest-environment jsdom
/**
 * Notifications are stored in English and worded for the reader. The
 * writer and the reader share one table, so anything the app writes must
 * come back in every language with its names and titles intact — and
 * anything it did not write must come back exactly as stored.
 */
import { afterEach, describe, expect, test } from 'vitest'

import i18n, { setLanguage } from '../../src/i18n'
import { localizeNotification, storedText } from '../../src/i18n/notificationText'
import { unsentErrorText } from '../../src/i18n/unsent'

afterEach(async () => {
  await i18n.changeLanguage('en')
})

const CASES = [
  ['someoneJoined', { name: 'Mya', title: 'Sunday football' }],
  ['activityCancelled', { title: 'Sunday football' }],
  ['activityPosted', { name: 'Mya', title: 'Sunday football', place: 'Lumphini Park' }],
  ['newMessage', { name: 'Mya', title: 'Sunday football', text: 'Running late: see you at 5' }],
  ['suspended', {}],
  ['activeAgain', {}],
  ['activityRemoved', { title: 'Sunday football', reason: 'Spam' }],
  ['joinedRemoved', { title: 'Sunday football' }],
  ['nowModerator', {}],
  ['noLongerModerator', {}],
  ['closed', { reason: 'Repeated harassment.' }],
  ['reopened', { reason: 'Appeal upheld.' }],
  ['warning', { reason: 'Please keep it civil.' }],
  ['activityBack', { title: 'Sunday football' }],
]

describe('storedText', () => {
  test('writes the English wording the app always wrote', () => {
    expect(storedText('someoneJoined', { name: 'Mya', title: 'Sunday football' })).toEqual({
      title: 'Someone joined',
      body: 'Mya joined Sunday football.',
    })
    expect(() => storedText('nope')).toThrow(/Unknown notification template/)
  })
})

describe('localizeNotification', () => {
  test.each(['th', 'my', 'zh'])('words every template in %s with the names kept', async (code) => {
    await setLanguage(code)
    for (const [kind, params] of CASES) {
      const stored = storedText(kind, params)
      const shown = localizeNotification(stored)
      // Something changed: it is no longer the English text...
      expect(shown.title + shown.body, kind).not.toBe(stored.title + stored.body)
      // ...and no user content was lost in the rewording.
      for (const value of Object.values(params)) {
        expect(shown.title + shown.body, `${kind} keeps ${value}`).toContain(value)
      }
      // ...and no placeholder leaked through unfilled.
      expect(shown.title + shown.body, kind).not.toMatch(/\{\{/)
    }
  })

  test('is the identity in English', () => {
    for (const [kind, params] of CASES) {
      const stored = storedText(kind, params)
      expect(localizeNotification(stored)).toEqual(stored)
    }
  })

  test('gives the colon in a message to the name and the rest to the text', async () => {
    await setLanguage('zh')
    const stored = storedText('newMessage', {
      name: 'Mya: the second',
      title: 'Plan: Sunday',
      text: 'Meet at 5: gate B',
    })
    const shown = localizeNotification(stored)
    expect(shown.body).toContain('Meet at 5: gate B')
    expect(shown.title).toContain('Plan: Sunday')
  })

  test('shows a notification it does not recognise as it was stored', async () => {
    await setLanguage('th')
    const stored = { title: 'Welcome aboard', body: 'Written by hand in the console.' }
    expect(localizeNotification(stored)).toEqual(stored)
    expect(localizeNotification({})).toEqual({ title: '', body: '' })
  })
})

describe('unsentErrorText', () => {
  test('words the codes and falls back to the stored message', async () => {
    await setLanguage('my')
    expect(unsentErrorText({ code: 'permission-denied' })).toBe(
      i18n.t('unsent.refusedNoLongerAllowed'),
    )
    expect(unsentErrorText({ code: 'superseded' }, 'profile')).toBe(
      i18n.t('unsent.supersededProfile'),
    )
    expect(unsentErrorText({ code: 'superseded' }, 'activity')).toBe(
      i18n.t('unsent.supersededActivity'),
    )
    expect(unsentErrorText({ code: 'weird', message: 'Server said no' })).toBe('Server said no')
    expect(unsentErrorText(null)).toBe('')
  })
})

describe('report context', () => {
  test('is stored in English and worded for the moderator, names intact', async () => {
    const { localizeReportContext, storedContext } = await import('../../src/i18n/reportContext')
    const cases = [
      ['activity', { title: 'Run at dawn', place: 'Lumphini Park', host: 'Narin' }],
      ['participant', { title: 'Sunday football' }],
      ['match', { score: 72 }],
      ['message', { text: 'See you at 5, gate B', name: 'Mya', title: 'Sunday football' }],
    ]
    expect(storedContext('activity', cases[0][1])).toBe(
      'Run at dawn at Lumphini Park, hosted by Narin',
    )
    expect(storedContext('message', cases[3][1])).toBe(
      '"See you at 5, gate B" — Mya in "Sunday football"',
    )
    for (const code of ['th', 'my', 'zh']) {
      await setLanguage(code)
      for (const [kind, params] of cases) {
        const shown = localizeReportContext(storedContext(kind, params))
        expect(shown, `${code} ${kind}`).not.toBe(storedContext(kind, params))
        for (const value of Object.values(params)) {
          expect(shown, `${code} ${kind} keeps ${value}`).toContain(String(value))
        }
      }
    }
    await setLanguage('th')
    expect(localizeReportContext('Written by hand')).toBe('Written by hand')
    expect(localizeReportContext(undefined)).toBe('')
    expect(() => storedContext('nope')).toThrow(/Unknown report context/)
  })
})
