/**
 * How old somebody is, and whether SmartSync is for them.
 *
 * Three decisions are made here and nowhere else, so the sign-up form,
 * the gate on the app, the profile card and the security rules all agree
 * about the same person.
 *
 * **A date of birth is stored, not an age.** An age is only true for a
 * year. Somebody who typed 15 would still be 15 at their thirtieth
 * birthday, and the one number the minimum depends on would be the one
 * number quietly going stale. The date is kept in the private half of
 * the profile, with the email and the real name, because it is the same
 * kind of thing; what other people can see — when its owner allows it —
 * is the age computed from it.
 *
 * **Fifteen and over.** `MIN_AGE` is the whole policy. Change it here
 * and the form, the gate, the wording and the rules follow, except for
 * the rules' own copy of the cut-off, which has to be written in their
 * language — `firestore.rules` names this file so the two stay together.
 *
 * **A birthday is a date, not an instant.** All of this works on
 * `YYYY-MM-DD` strings compared as dates, never on timestamps, so
 * nobody turns fifteen at a different moment depending on which side of
 * midnight UTC their phone is.
 */

/** The youngest SmartSync is for. Fifteen counts; fourteen does not. */
export const MIN_AGE = 15

/** Nobody is older than this, and a typo that says so is a typo. */
export const MAX_AGE = 120

const PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A date as `YYYY-MM-DD`, in no particular timezone because a birthday has none. */
export function isoDate(date) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Whether this is a date that could be somebody's birthday.
 *
 * Shape first, then reality: `2026-02-31` matches the pattern and is not
 * a day, and `Date` would quietly roll it forward to March rather than
 * refuse it, so the parsed date is compared back to what was typed.
 */
export function isValidDob(value) {
  if (typeof value !== 'string' || !PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return false
  return isoDate(parsed) === value
}

/**
 * Whole years lived, on the given day. `null` when the date is not one.
 *
 * Counted from the calendar rather than by dividing milliseconds, so a
 * leap year cannot make somebody a day too old, and somebody born on 29
 * February has their birthday on 1 March in the years that have no 29th.
 */
export function ageOn(dateOfBirth, now = new Date()) {
  if (!isValidDob(dateOfBirth)) return null
  const [year, month, day] = dateOfBirth.split('-').map(Number)
  let age = now.getFullYear() - year
  const monthNow = now.getMonth() + 1
  const dayNow = now.getDate()
  // Their birthday has not come round yet this year.
  if (monthNow < month || (monthNow === month && dayNow < day)) age -= 1
  if (age < 0 || age > MAX_AGE) return null
  return age
}

/** Old enough for SmartSync. */
export function meetsMinimumAge(dateOfBirth, now = new Date()) {
  const age = ageOn(dateOfBirth, now)
  return age !== null && age >= MIN_AGE
}

/**
 * The latest date of birth that is old enough today — the `max` the date
 * field should offer, so the picker cannot be used to choose a date the
 * form is about to refuse.
 */
export function latestEligibleDob(now = new Date()) {
  const cutoff = new Date(now.getFullYear() - MIN_AGE, now.getMonth(), now.getDate())
  return isoDate(cutoff)
}

/** The earliest date worth offering, so the picker is not a thousand years long. */
export function earliestEligibleDob(now = new Date()) {
  const cutoff = new Date(now.getFullYear() - MAX_AGE, now.getMonth(), now.getDate())
  return isoDate(cutoff)
}

/**
 * What the public profile should carry: their age when they have agreed
 * to show it, and `null` when they have not.
 *
 * `null` rather than a number left behind and hidden at render time.
 * Anonymous mode already works this way (ADR-005) for the same reason —
 * Firestore has no field-level read rules, so a value present in a
 * public document is a value anybody can read, whatever the screen
 * chooses to draw. Consent withdrawn has to mean the number leaves.
 */
export function publicAge({ dateOfBirth, showAge }, now = new Date()) {
  if (!showAge) return null
  return ageOn(dateOfBirth, now)
}
