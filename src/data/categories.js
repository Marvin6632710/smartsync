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
