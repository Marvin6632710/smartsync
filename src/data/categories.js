/**
 * The fixed set of activity categories.
 *
 * These are a controlled vocabulary, not user data: the recommendation engine
 * compares a user's interests against an activity's category by exact match,
 * so both sides have to be drawn from the same list. Everything else that
 * used to live in mockData.js — fake users, fake activities, a hardcoded
 * "me" — is now real data in Firestore.
 */
export const categories = [
  'Football',
  'Basketball',
  'Running',
  'Gym',
  'Study',
  'Coffee',
  'Gaming',
  'Hangouts',
  'Cycling',
  'Movies',
  'Food',
  'Events',
]

export const timeBands = ['Morning', 'Afternoon', 'Evening']

/**
 * How many interests someone must pick.
 *
 * Enforced in two places — first-run setup and the profile editor — and they
 * have to agree: a lower bar in one lets someone leave the engine with less
 * to rank on than the other insisted upon.
 */
export const MIN_INTERESTS = 3
