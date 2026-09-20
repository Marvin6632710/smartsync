/**
 * Which inbox records become a push: the table from the architecture
 * note, checked kind by kind. Routine things never push; safety things
 * always do; everything else asks the preferences, with the defaults.
 */
import { describe, expect, test } from 'vitest'

import { categoryEnabled, decidePush, DEFAULT_PUSH_PREFS } from '../../functions/lib/policy.js'

describe('decidePush', () => {
  test.each([
    ['newMessage', 'chat', 'chat-act1', 900, 'high'],
    ['someoneJoined', 'joins', 'roster-act1', 3600, 'normal'],
    ['activityCancelled', 'activity', 'activity-act1', 86400, 'high'],
    ['joinedRemoved', 'activity', 'activity-act1', 86400, 'high'],
    ['activityRemoved', 'moderation', 'moderation-n1', 604800, 'high'],
    ['warning', 'moderation', 'moderation-n1', 604800, 'high'],
    ['suspended', 'moderation', 'moderation-n1', 604800, 'high'],
    ['closed', 'moderation', 'moderation-n1', 604800, 'high'],
  ])('%s → %s, tag %s, ttl %s, %s', (kind, category, tag, ttl, urgency) => {
    const plan = decidePush({ kind, activityId: 'act1', params: {} }, 'n1')
    expect(plan).toMatchObject({ category, tag, ttl, urgency })
    expect(plan.mandatory).toBe(category === 'moderation')
  })

  test('a followed host collapses per host, so a busy host is one banner', () => {
    const plan = decidePush(
      { kind: 'activityPosted', activityId: 'act9', params: { hostId: 'host1' } },
      'n1',
    )
    expect(plan).toMatchObject({ category: 'follows', tag: 'follow-host1', urgency: 'normal' })
    // An older record without the host id still collapses, per activity.
    expect(decidePush({ kind: 'activityPosted', activityId: 'act9' }, 'n1').tag).toBe('follow-act9')
  })

  test.each(['activityBack', 'recommendation', undefined])('%s is never a push', (kind) => {
    expect(decidePush({ kind, activityId: 'act1' }, 'n1')).toBeNull()
  })

  test('a record with no kind — written by an older app — is never pushed', () => {
    expect(decidePush({ type: 'chat', title: 'New message in x', body: 'a: b' }, 'n1')).toBeNull()
  })
})

describe('categoryEnabled', () => {
  test('defaults: chat, activity and follows on; joins off', () => {
    expect(DEFAULT_PUSH_PREFS).toEqual({ chat: true, joins: false, activity: true, follows: true })
    for (const [category, fallback] of Object.entries(DEFAULT_PUSH_PREFS)) {
      expect(categoryEnabled(category, {})).toBe(fallback)
      expect(categoryEnabled(category, undefined)).toBe(fallback)
    }
  })

  test('a stored choice wins over the default, either way', () => {
    expect(categoryEnabled('chat', { push: { chat: false } })).toBe(false)
    expect(categoryEnabled('joins', { push: { joins: true } })).toBe(true)
    // Not a boolean: the default holds.
    expect(categoryEnabled('chat', { push: { chat: 'no' } })).toBe(true)
  })

  test('moderation cannot be switched off', () => {
    expect(categoryEnabled('moderation', { push: { moderation: false } })).toBe(true)
  })
})
