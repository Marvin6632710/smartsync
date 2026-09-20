/**
 * One timeline out of three records: the log, the warnings and the decided
 * reports become events of one shape, newest first, and a report that
 * appears in two lists appears once.
 */
import { describe, expect, test } from 'vitest'

import { EVENT_KINDS, decisionEvent, historyEvents } from '../../src/console/history'

describe('historyEvents', () => {
  test('merges the three records into one order, newest first', () => {
    const events = historyEvents({
      log: [
        {
          id: 'l1',
          kind: 'suspend',
          by: 'mod',
          subjectId: 'bob',
          reason: 'x',
          at: 300,
          reportId: 'r1',
        },
      ],
      warnings: [{ id: 'w1', by: 'mod', subjectId: 'bob', reason: 'be kind', createdAt: 100 }],
      reports: [
        {
          id: 'r1',
          status: 'actioned',
          outcome: 'Account suspended',
          reviewedBy: 'mod',
          reviewedAt: 400,
          subjectId: 'bob',
          targetType: 'user',
        },
        { id: 'r2', status: 'open', subjectId: 'bob', targetType: 'user' },
      ],
    })
    expect(events.map((e) => [e.kind, e.at])).toEqual([
      ['actioned', 400],
      ['suspend', 300],
      ['warn', 100],
    ])
    expect(events[0]).toMatchObject({
      id: 'report:r1',
      by: 'mod',
      reason: 'Account suspended',
      reportId: 'r1',
      source: 'report',
    })
    expect(events[1]).toMatchObject({ id: 'log:l1', reportId: 'r1', source: 'log' })
    expect(events[2]).toMatchObject({ id: 'warning:w1', reason: 'be kind', source: 'warning' })
  })

  test('a Firestore timestamp on a warning is read as milliseconds', () => {
    const [event] = historyEvents({
      warnings: [
        { id: 'w1', by: 'mod', subjectId: 'bob', reason: 'x', createdAt: { toMillis: () => 555 } },
      ],
    })
    expect(event.at).toBe(555)
  })

  test('a decision names the activity a report concerned, whichever way it did', () => {
    expect(
      decisionEvent({
        id: 'r',
        status: 'dismissed',
        targetType: 'activity',
        targetId: 'a1',
        subjectId: 'h',
      }).activityId,
    ).toBe('a1')
    expect(
      decisionEvent({
        id: 'r',
        status: 'dismissed',
        targetType: 'message',
        targetId: 'm1',
        activityId: 'a2',
        subjectId: 'h',
      }).activityId,
    ).toBe('a2')
    expect(decisionEvent({ id: 'r', status: 'open', targetType: 'user', targetId: 'u' })).toBeNull()
  })

  test('the same report in two lists is one event', () => {
    const decided = {
      id: 'r1',
      status: 'dismissed',
      reviewedBy: 'mod',
      reviewedAt: 1,
      subjectId: 'b',
      targetType: 'user',
    }
    expect(historyEvents({ reports: [decided, { ...decided }] })).toHaveLength(1)
  })

  test('the kinds are the log’s six, a warning, and the two decisions — nothing about ranks', () => {
    expect(EVENT_KINDS).toEqual([
      'suspend',
      'lift',
      'close',
      'reopen',
      'remove',
      'restore',
      'warn',
      'actioned',
      'dismissed',
    ])
  })
})
