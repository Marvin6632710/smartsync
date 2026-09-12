/**
 * The urgency signals.
 *
 * These decide whether a card shouts. The failure mode is not a crash but a
 * lie: a badge that says "Filling up" on a half-empty activity, or a
 * countdown still ticking on something that finished yesterday. Both cost
 * more trust than they buy attention, so most of these tests are about when
 * the app should say *nothing*.
 */
import { describe, expect, test } from 'vitest'
import { activityBadge, capacityNote, timeUntilLabel } from '../../src/utils/urgency'

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0)
const inMinutes = (m) => NOW + m * 60_000

describe('timeUntilLabel', () => {
  test('stays quiet when the start is far off', () => {
    // The date line on the card already says "Thursday". A countdown to it
    // would be noise on every card in the list.
    expect(timeUntilLabel(inMinutes(7 * 60), NOW)).toBeNull()
    expect(timeUntilLabel(inMinutes(60 * 24 * 3), NOW)).toBeNull()
  })

  test('counts down inside the hour', () => {
    expect(timeUntilLabel(inMinutes(45), NOW)).toEqual({ label: 'In 45 min', tone: 'now' })
    expect(timeUntilLabel(inMinutes(20), NOW)).toEqual({ label: 'In 20 min', tone: 'now' })
  })

  test('says "starting now" rather than counting the last few minutes', () => {
    // "In 3 min" is a number nobody can act on; it reads as pressure.
    expect(timeUntilLabel(inMinutes(14), NOW).label).toBe('Starting now')
    expect(timeUntilLabel(inMinutes(1), NOW).label).toBe('Starting now')
    expect(timeUntilLabel(NOW, NOW).label).toBe('Starting now')
  })

  test('counts hours up to six, with the right plural', () => {
    expect(timeUntilLabel(inMinutes(60), NOW)).toEqual({ label: 'In 1 hour', tone: 'soon' })
    expect(timeUntilLabel(inMinutes(180), NOW)).toEqual({ label: 'In 3 hours', tone: 'soon' })
    expect(timeUntilLabel(inMinutes(350), NOW).label).toBe('In 6 hours')
  })

  test('goes quiet once it has started, rather than counting backwards', () => {
    expect(timeUntilLabel(inMinutes(-5), NOW)).toBeNull()
    expect(timeUntilLabel(inMinutes(-60 * 24), NOW)).toBeNull()
  })

  test('a minute either side of now still reads as starting', () => {
    // Two devices whose clocks disagree slightly must not flip the label to
    // nothing while somebody is looking at it.
    expect(timeUntilLabel(inMinutes(-0.5), NOW).label).toBe('Starting now')
  })

  test('nonsense in, nothing out', () => {
    expect(timeUntilLabel(null, NOW)).toBeNull()
    expect(timeUntilLabel(undefined, NOW)).toBeNull()
    expect(timeUntilLabel('soon', NOW)).toBeNull()
    expect(timeUntilLabel(NaN, NOW)).toBeNull()
    expect(timeUntilLabel(inMinutes(30), NaN)).toBeNull()
  })

  test('accepts a Date as readily as a timestamp', () => {
    expect(timeUntilLabel(new Date(inMinutes(30)), NOW).label).toBe('In 30 min')
  })
})

describe('capacityNote', () => {
  test('stays quiet when there is plenty of room', () => {
    expect(capacityNote(3, 18)).toBeNull()
    expect(capacityNote(0, 10)).toBeNull()
    expect(capacityNote(5, 12)).toBeNull()
  })

  test('names the exact number when it is nearly gone', () => {
    expect(capacityNote(16, 18)).toEqual({ label: '2 spots left', tone: 'last', left: 2 })
    expect(capacityNote(17, 18)).toEqual({ label: '1 spot left', tone: 'last', left: 1 })
  })

  test('says full, and never a negative number of places', () => {
    expect(capacityNote(18, 18)).toEqual({ label: 'Full', tone: 'full', left: 0 })
    // Over-full should not be reachable, but if a roster ever exceeds
    // capacity the card must not read "-1 spots left".
    expect(capacityNote(20, 18)).toEqual({ label: 'Full', tone: 'full', left: 0 })
  })

  test('"filling up" needs a crowd to be meaningful', () => {
    // 3 of 4 is 75% but it is a coffee for four, not an event filling up.
    expect(capacityNote(3, 4)).toEqual({ label: '1 spot left', tone: 'last', left: 1 })
    expect(capacityNote(8, 10)).toEqual({ label: '2 spots left', tone: 'last', left: 2 })
    expect(capacityNote(17, 20)).toEqual({ label: 'Filling up', tone: 'filling', left: 3 })
  })

  test('a small activity is never called "filling up" on proportion alone', () => {
    expect(capacityNote(4, 5)?.tone).toBe('last')
    expect(capacityNote(4, 5)?.label).toBe('1 spot left')
  })

  test('the wording carries the meaning without the colour', () => {
    // Colour must never be the only channel; every tone has distinct words.
    const labels = [capacityNote(20, 20), capacityNote(19, 20), capacityNote(17, 20)].map(
      (n) => n.label,
    )
    expect(new Set(labels).size).toBe(3)
  })

  test('nonsense in, nothing out', () => {
    expect(capacityNote(undefined, 10)).toBeNull()
    expect(capacityNote(3, 0)).toBeNull()
    expect(capacityNote(3, null)).toBeNull()
    expect(capacityNote(-1, 10)).toBeNull()
    expect(capacityNote('three', 10)).toBeNull()
  })
})

describe('activityBadge', () => {
  const base = { startsAt: inMinutes(30), participants: 3, capacity: 18, status: 'active' }

  test('shows one badge, not several competing claims', () => {
    // Starting soon AND nearly full: the card gets one of them.
    const badge = activityBadge({ ...base, participants: 17, capacity: 18 }, NOW)
    expect(badge).not.toBeNull()
    expect(typeof badge.label).toBe('string')
  })

  test('"Full" outranks the countdown, because it decides whether you can go', () => {
    const badge = activityBadge({ ...base, participants: 18, capacity: 18 }, NOW)
    expect(badge.label).toBe('Full')
  })

  test('the countdown outranks "filling up", because fact beats persuasion', () => {
    const badge = activityBadge({ ...base, participants: 17, capacity: 20 }, NOW)
    expect(badge.label).toBe('In 30 min')
  })

  test('falls back to the roster when the start is far off', () => {
    const badge = activityBadge(
      { ...base, startsAt: inMinutes(60 * 30), participants: 17, capacity: 20 },
      NOW,
    )
    expect(badge.label).toBe('Filling up')
  })

  test('says nothing when there is nothing worth saying', () => {
    // Days away and three-quarters empty: no badge at all. Most cards in a
    // healthy list should look like this one.
    expect(activityBadge({ ...base, startsAt: inMinutes(60 * 30) }, NOW)).toBeNull()
  })

  test('a finished or cancelled activity is never urgent', () => {
    expect(activityBadge({ ...base, isPast: true, participants: 18 }, NOW)).toBeNull()
    expect(activityBadge({ ...base, status: 'cancelled', participants: 18 }, NOW)).toBeNull()
    expect(activityBadge({ ...base, status: 'removed' }, NOW)).toBeNull()
  })

  test('nothing in, nothing out', () => {
    expect(activityBadge(null, NOW)).toBeNull()
    expect(activityBadge({}, NOW)).toBeNull()
  })
})
