import { doc, getDoc, waitForPendingWrites } from 'firebase/firestore'

import { db } from './config'

/**
 * Did a write that was queued in an earlier session land?
 *
 * Firestore keeps queued writes across reloads and sends them when it can,
 * but the promise that would have said whether they were accepted died with
 * the page. So the app keeps its own note of what it queued (see `unsent`
 * in AppContext) and, once the queue has drained, asks the database: a
 * create either exists now or it does not; an update either shows the
 * fields it carried, or still shows what it set out to change — or shows
 * something else again, because somebody edited the document meanwhile.
 *
 * That third answer is the one a field-for-field comparison alone got
 * wrong. An edit that landed and was then edited again from another device
 * no longer matched what it carried, and was offered back as "couldn't be
 * saved" — to be restored over the newer edit. So a row for an edit also
 * carries what the form was seeded with (`before`): the document still
 * showing that is the write refused; the document showing neither is a
 * newer edit from elsewhere, and the row is superseded rather than failed.
 */
export const LANDED = 'landed'
export const REFUSED = 'refused'
export const SUPERSEDED = 'superseded'

/** The fields an edit is judged on, per kind. */
export const EDIT_FIELDS = {
  // Capacity is rounded and tags derived on the way in, so neither is
  // compared; these six are stored as typed.
  'activity-edit': ['title', 'description', 'locationName', 'date', 'time', 'category'],
  // The name is not compared: anonymous mode maps it to a placeholder in the
  // public document, which is the one read here.
  profile: ['username', 'bio', 'preferredTime', 'interests'],
}

/** Just these fields of `source`, for a row to carry and to be judged on. */
export const pick = (source, fields) =>
  Object.fromEntries(fields.map((field) => [field, source?.[field]]))

const SAME = (stored, wanted) =>
  Object.entries(wanted).every(
    ([key, value]) => JSON.stringify(stored?.[key]) === JSON.stringify(value),
  )

function judge(stored, row, fields) {
  const withPicture = (value, version) =>
    row.payload.picture ? { ...value, pictureVersion: version || null } : value
  const current = withPicture(stored, stored.pictureVersion)
  if (SAME(current, withPicture(pick(row.payload, fields), row.payload.picture?.version)))
    return LANDED
  // A row from before `before` was recorded: the old, two-way answer.
  if (!row.before) return REFUSED
  return SAME(current, withPicture(pick(row.before, fields), row.before.pictureVersion))
    ? REFUSED
    : SUPERSEDED
}

export function drainQueue() {
  return waitForPendingWrites(db)
}

/** LANDED, REFUSED or SUPERSEDED — see above. */
export async function outcomeOf(row) {
  const { kind, key, payload } = row
  const exists = async (...path) => ((await getDoc(doc(db, ...path))).exists() ? LANDED : REFUSED)
  switch (kind) {
    case 'message':
      return exists('activities', key, 'messages', payload.id)
    case 'activity-create':
      return exists('activities', payload.id)
    case 'report':
      return exists('reports', payload.id)
    case 'activity-edit': {
      const snap = await getDoc(doc(db, 'activities', key))
      if (!snap.exists()) return REFUSED
      return judge(snap.data(), row, EDIT_FIELDS['activity-edit'])
    }
    case 'profile': {
      const snap = await getDoc(doc(db, 'users', key))
      if (!snap.exists()) return REFUSED
      return judge(snap.data(), row, EDIT_FIELDS.profile)
    }
    default:
      // Unknown kinds are treated as landed rather than resurrected for ever.
      return LANDED
  }
}
