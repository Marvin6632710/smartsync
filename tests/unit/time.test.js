/**
 * The date and time logic.
 *
 * All of it is user-visible — a greeting, an activity's date on every card, a
 * clock on every chat bubble — and none of it was tested. It is also the kind
 * of code that is wrong only at the boundaries: midnight, the hour a label
 * changes, a date the browser cannot parse, the week that rolls over. Those
 * are exactly the cases nobody hits by hand and everybody hits eventually.
 */
import { describe, expect, test } from 'vitest'
import {
  formatActivityDate,
  formatClock,
  formatMessageTime,
  formatRelativeTime,
  greetingFor,
  partOfDay,
  questionFor,
} from '../../src/utils/time'

describe('partOfDay', () => {
  const at = (hour, minute = 0) => partOfDay(new Date(2026, 8, 12, hour, minute))

  test('covers all twenty-four hours with no gap', () => {
    // A gap would fall through to the default copy, which reads as a bug
    // rather than a neutral fallback.
    const seen = new Set()
    for (let hour = 0; hour < 24; hour += 1) seen.add(at(hour))
    expect(seen).toEqual(new Set(['late', 'morning', 'afternoon', 'evening']))
  })

  test('changes exactly where it says it does', () => {
    expect(at(4, 59)).toBe('late')
    expect(at(5, 0)).toBe('morning')
    expect(at(10, 59)).toBe('morning')
    expect(at(11, 0)).toBe('afternoon')
    expect(at(15, 59)).toBe('afternoon')
    expect(at(16, 0)).toBe('evening')
    expect(at(21, 59)).toBe('evening')
    expect(at(22, 0)).toBe('late')
  })

  test('midnight is late, not morning', () => {
    // The obvious off-by-one: `hour < 5` has to catch 0, or 1am greets you
    // with "Morning".
    expect(at(0, 0)).toBe('late')
    expect(at(1, 30)).toBe('late')
  })

  test('every part has copy, and an unknown part still says something', () => {
    for (const part of ['morning', 'afternoon', 'evening', 'late']) {
      expect(greetingFor(part)).toBeTruthy()
      expect(questionFor(part)).toMatch(/\?$/)
    }
    expect(greetingFor('nonsense')).toBeTruthy()
    expect(questionFor(undefined)).toMatch(/\?$/)
  })
})

describe('formatRelativeTime', () => {
  const now = Date.UTC(2026, 8, 12, 12, 0, 0)
  const ago = (ms) => formatRelativeTime(now - ms, now)

  test('nothing in, nothing out', () => {
    expect(formatRelativeTime(null, now)).toBe('')
    expect(formatRelativeTime(0, now)).toBe('')
    expect(formatRelativeTime(undefined, now)).toBe('')
  })

  test('reads naturally across every scale', () => {
    expect(ago(0)).toBe('Just now')
    expect(ago(59_000)).toBe('Just now')
    expect(ago(60_000)).toBe('1 min ago')
    expect(ago(59 * 60_000)).toBe('59 min ago')
    expect(ago(60 * 60_000)).toBe('1 hr ago')
    expect(ago(2 * 60 * 60_000)).toBe('2 hrs ago')
    expect(ago(24 * 60 * 60_000)).toBe('1 day ago')
    expect(ago(6 * 24 * 60 * 60_000)).toBe('6 days ago')
    expect(ago(7 * 24 * 60 * 60_000)).toBe('1 week ago')
    expect(ago(21 * 24 * 60 * 60_000)).toBe('3 weeks ago')
  })

  test('singular and plural are never wrong', () => {
    expect(ago(60 * 60_000)).not.toContain('hrs')
    expect(ago(24 * 60 * 60_000)).not.toContain('days')
    expect(ago(7 * 24 * 60 * 60_000)).not.toContain('weeks')
  })

  test('a timestamp from the future does not read as negative', () => {
    // Two devices whose clocks disagree by a few seconds is ordinary, and
    // "-1 min ago" is the kind of thing people screenshot.
    expect(ago(-30_000)).toBe('Just now')
    expect(ago(-5 * 60_000)).toBe('Just now')
  })
})

describe('formatActivityDate', () => {
  const now = new Date(2026, 8, 12, 15, 0, 0) // Sat 12 Sep 2026, mid-afternoon

  test('nothing in, nothing out', () => {
    expect(formatActivityDate('', now)).toBe('')
    expect(formatActivityDate(null, now)).toBe('')
  })

  test('names the days people actually think in', () => {
    expect(formatActivityDate('2026-09-12', now)).toBe('Today')
    expect(formatActivityDate('2026-09-13', now)).toBe('Tomorrow')
    expect(formatActivityDate('2026-09-11', now)).toBe('Yesterday')
  })

  test('the next week is a weekday, beyond that is a date', () => {
    expect(formatActivityDate('2026-09-14', now)).toMatch(/day$/)
    expect(formatActivityDate('2026-09-17', now)).toMatch(/day$/)
    expect(formatActivityDate('2026-09-30', now)).toMatch(/\d/)
  })

  test('"Today" does not depend on the time of day', () => {
    // The comparison is against midnight, not against `now`. If it were
    // against `now`, an activity earlier today would round to "Yesterday".
    for (const hour of [0, 1, 9, 15, 23]) {
      const clock = new Date(2026, 8, 12, hour, 30)
      expect(formatActivityDate('2026-09-12', clock)).toBe('Today')
    }
  })

  test('an unparseable date is shown as given rather than as Invalid Date', () => {
    expect(formatActivityDate('not-a-date', now)).toBe('not-a-date')
    expect(formatActivityDate('2026-13-45', now)).toBe('2026-13-45')
  })

  test('crossing a month and a year still reads correctly', () => {
    const lastDay = new Date(2026, 11, 31, 12, 0, 0)
    expect(formatActivityDate('2026-12-31', lastDay)).toBe('Today')
    expect(formatActivityDate('2027-01-01', lastDay)).toBe('Tomorrow')
  })
})

describe('formatClock', () => {
  test('nothing in, nothing out', () => {
    expect(formatClock('')).toBe('')
    expect(formatClock(null)).toBe('')
  })

  test('renders a real time', () => {
    expect(formatClock('19:00')).toMatch(/7|19/)
    expect(formatClock('00:00')).toMatch(/12|00/)
    expect(formatClock('23:59')).toMatch(/59/)
  })

  test('nonsense comes back unchanged instead of a confident wrong answer', () => {
    // `Number('')` is 0, not NaN, so '::' used to map to [0, 0] — both finite —
    // and render as a perfectly plausible "12:00 AM". A malformed time showing
    // as itself is visibly not an answer; showing as midnight is a wrong one.
    expect(formatClock('abc')).toBe('abc')
    expect(formatClock('::')).toBe('::')
    expect(formatClock(':')).toBe(':')
    expect(formatClock('7')).toBe('7')
    expect(formatClock('25:00')).toBe('25:00')
    expect(formatClock('12:75')).toBe('12:75')
    expect(formatClock('19:00:00')).toBe('19:00:00')
  })

  test('and the shapes an <input type=time> really produces still work', () => {
    expect(formatClock('09:05')).toMatch(/9.*05/)
    expect(formatClock('9:05')).toMatch(/9.*05/)
    expect(formatClock(' 19:00 ')).toMatch(/7|19/)
  })

  test('a message with no timestamp renders nothing, not the epoch', () => {
    expect(formatMessageTime(null)).toBe('')
    expect(formatMessageTime(0)).toBe('')
  })
})
