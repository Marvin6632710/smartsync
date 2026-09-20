/**
 * The words on a push, in the recipient's language, from the same strings
 * the screen uses. The locale files are copied into the functions package
 * first, as they are before every emulator run and deploy.
 */
import { execFileSync } from 'node:child_process'
import { beforeAll, describe, expect, test } from 'vitest'

import { renderPush, matchLanguage } from '../../functions/lib/render.js'
import en from '../../src/i18n/locales/en.json'
import th from '../../src/i18n/locales/th.json'
import my from '../../src/i18n/locales/my.json'
import zh from '../../src/i18n/locales/zh.json'

const LOCALES = { en, th, my, zh }

beforeAll(() => {
  execFileSync('node', ['functions/scripts/sync-locales.mjs'], { stdio: 'ignore' })
})

describe('renderPush', () => {
  test.each(['en', 'th', 'my', 'zh'])('a cancellation in %s is the screen’s own wording', (lng) => {
    const out = renderPush({
      kind: 'activityCancelled',
      params: { title: 'Bangkok Night Gamers' },
      language: lng,
    })
    expect(out.language).toBe(lng)
    expect(out.title).toBe(LOCALES[lng].notifications.templates.cancelledTitle)
    expect(out.body).toContain('Bangkok Night Gamers')
    expect(out.body).not.toMatch(/\{\{/)
  })

  test('a chat push says who wrote, not what, unless previews are on', () => {
    const params = { name: 'Mya', title: 'Sunday football', text: 'my address is 12 Rama IX' }
    const quiet = renderPush({ kind: 'newMessage', params, language: 'en' })
    expect(quiet.title).toBe('New message in Sunday football')
    expect(quiet.body).toBe('Mya sent a message.')
    expect(quiet.body).not.toContain('Rama IX')
    const loud = renderPush({ kind: 'newMessage', params, language: 'en', chatPreview: true })
    expect(loud.body).toBe('Mya: my address is 12 Rama IX')
  })

  test.each(['th', 'my', 'zh'])('the quiet chat body exists in %s', (lng) => {
    const out = renderPush({
      kind: 'newMessage',
      params: { name: 'Mya', title: 'x' },
      language: lng,
    })
    expect(out.body).toContain('Mya')
    expect(out.body).not.toBe('notifications.push.messageFrom')
    expect(out.body).not.toBe('Mya sent a message.')
  })

  test('the app’s own names are worded per language, a person’s is kept', () => {
    const anon = renderPush({
      kind: 'someoneJoined',
      params: { name: 'Anonymous user', title: 'Run' },
      language: 'th',
    })
    expect(anon.body).toContain(th.profile.anonymousName)
    expect(anon.body).not.toContain('Anonymous user')
    const named = renderPush({
      kind: 'someoneJoined',
      params: { name: 'Narin', title: 'Run' },
      language: 'th',
    })
    expect(named.body).toContain('Narin')
  })

  test('an unknown language falls back to English; a region tag maps to its language', () => {
    expect(renderPush({ kind: 'warning', params: { reason: 'x' }, language: 'fr' }).language).toBe(
      'en',
    )
    expect(
      renderPush({ kind: 'warning', params: { reason: 'x' }, language: 'zh-CN' }).language,
    ).toBe('zh')
    expect(matchLanguage('th-TH')).toBe('th')
    expect(matchLanguage('')).toBeNull()
  })

  test('an unknown kind is nothing to say', () => {
    expect(renderPush({ kind: 'nope', params: {}, language: 'en' })).toBeNull()
  })

  test('titles and bodies are bounded, whatever the parameters carry', () => {
    const out = renderPush({
      kind: 'warning',
      params: { reason: 'x'.repeat(2000) },
      language: 'en',
    })
    expect(out.body.length).toBeLessThanOrEqual(300)
    expect(out.title.length).toBeLessThanOrEqual(120)
  })
})
