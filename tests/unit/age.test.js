/**
 * How old somebody is, and whether SmartSync is for them.
 *
 * The whole age policy is one pure module, so the minimum can be argued
 * with here rather than by making accounts. Dates are fixed rather than
 * relative to today, or this file would pass in September and fail in
 * March.
 */
import { describe, expect, test } from 'vitest'

import {
  ageOn,
  earliestEligibleDob,
  isoDate,
  isValidDob,
  latestEligibleDob,
  MAX_AGE,
  meetsMinimumAge,
  MIN_AGE,
  publicAge,
} from '../../src/utils/age'

const on = (iso) => new Date(`${iso}T12:00:00`)

describe('the policy', () => {
  test('is fifteen and over', () => {
    expect(MIN_AGE).toBe(15)
  })
})

describe('isValidDob', () => {
  test('accepts a date', () => {
    expect(isValidDob('2000-01-01')).toBe(true)
    expect(isValidDob('2004-02-29')).toBe(true)
  })

  test('refuses what is not one', () => {
    // The third is the one that matters: `Date` rolls 31 February
    // forward into March rather than refusing it, so a shape check alone
    // would have accepted a day that does not exist.
    for (const bad of ['', '2000-1-1', '2001-02-29', '2000-13-01', 'yesterday', null, 42, {}]) {
      expect(isValidDob(bad), String(bad)).toBe(false)
    }
  })
})

describe('ageOn', () => {
  test('counts whole years', () => {
    expect(ageOn('2000-06-15', on('2026-06-15'))).toBe(26)
  })

  test('the day before a birthday is still the year before', () => {
    expect(ageOn('2011-09-24', on('2026-09-23'))).toBe(14)
    expect(ageOn('2011-09-23', on('2026-09-23'))).toBe(15)
  })

  test('a leap-year birthday has one in the years without a 29 February', () => {
    // Born 29 February 2008: on 28 February 2026 they are 17, and on
    // 1 March they are 18. Dividing milliseconds gets this wrong.
    expect(ageOn('2008-02-29', on('2026-02-28'))).toBe(17)
    expect(ageOn('2008-02-29', on('2026-03-01'))).toBe(18)
  })

  test('nothing sensible in, null out', () => {
    expect(ageOn('not a date')).toBeNull()
    expect(ageOn('')).toBeNull()
    // The future is not an age, and neither is the fourteenth century.
    expect(ageOn('2030-01-01', on('2026-09-23'))).toBeNull()
    expect(ageOn('1400-01-01', on('2026-09-23'))).toBeNull()
  })
})

describe('meetsMinimumAge', () => {
  test('fifteen counts; fourteen does not', () => {
    expect(meetsMinimumAge('2011-09-23', on('2026-09-23'))).toBe(true)
    expect(meetsMinimumAge('2011-09-24', on('2026-09-23'))).toBe(false)
  })

  test('a date that is not one is not a way in', () => {
    // A blank, a future date and a shape the form never produced all
    // have to fail closed — this is the check the gate is made of.
    for (const bad of ['', 'tomorrow', '2030-01-01', null, undefined]) {
      expect(meetsMinimumAge(bad, on('2026-09-23')), String(bad)).toBe(false)
    }
  })
})

describe('what the date picker offers', () => {
  test('the latest date it allows is exactly old enough', () => {
    const latest = latestEligibleDob(on('2026-09-23'))
    expect(latest).toBe('2011-09-23')
    expect(meetsMinimumAge(latest, on('2026-09-23'))).toBe(true)
    // And one day later is not, which is the boundary the form draws.
    expect(meetsMinimumAge('2011-09-24', on('2026-09-23'))).toBe(false)
  })

  test('the earliest is a plausible lifetime, not the year zero', () => {
    expect(earliestEligibleDob(on('2026-09-23'))).toBe('1906-09-23')
    expect(ageOn(earliestEligibleDob(on('2026-09-23')), on('2026-09-23'))).toBe(MAX_AGE)
  })

  test('isoDate pads, so the strings sort as dates', () => {
    expect(isoDate(new Date(2006, 0, 5))).toBe('2006-01-05')
    expect('2006-01-05' < '2006-01-15').toBe(true)
  })
})

describe('the number on a public profile going stale', () => {
  // publicAge is what refreshPublicAge compares against. The case that
  // matters is a birthday: the stored number was right yesterday and is
  // wrong today, and nothing would notice without this.
  test('a birthday makes the stored number wrong, and it can be told', () => {
    const person = { dateOfBirth: '2001-03-14', showAge: true }
    expect(publicAge(person, on('2026-03-13'))).toBe(24)
    expect(publicAge(person, on('2026-03-14'))).toBe(25)
  })

  test('withdrawing consent disagrees with any stored number', () => {
    expect(publicAge({ dateOfBirth: '2001-03-14', showAge: false })).toBeNull()
  })
})

describe('publicAge — what other people can see', () => {
  test('is the number when they have agreed to it', () => {
    expect(publicAge({ dateOfBirth: '2000-06-15', showAge: true }, on('2026-09-23'))).toBe(26)
  })

  test('is null when they have not — absent, not hidden', () => {
    // The difference matters: Firestore has no field-level read rules,
    // so a value left in a public document is readable whatever the
    // screen draws. Consent withdrawn has to remove the number.
    expect(publicAge({ dateOfBirth: '2000-06-15', showAge: false }, on('2026-09-23'))).toBeNull()
  })

  test('is null when there is no date to work from', () => {
    expect(publicAge({ dateOfBirth: '', showAge: true })).toBeNull()
  })
})
