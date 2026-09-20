/**
 * Tokens nobody has used in two months are gone.
 *
 * A browser that never opened the app again keeps its subscription until
 * the browser drops it, which may be never; FCM's own advice is to treat a
 * token unseen for sixty days as stale. The app refreshes `lastSeenAt` at
 * most once a day, so a token with an old stamp really is an old device.
 */
export const STALE_TOKEN_DAYS = 60

export async function removeStaleTokens({ db, Timestamp, now = Date.now(), limit = 500 }) {
  const cutoff = Timestamp.fromMillis(now - STALE_TOKEN_DAYS * 24 * 60 * 60 * 1000)
  const snap = await db
    .collectionGroup('pushTokens')
    .where('lastSeenAt', '<', cutoff)
    .limit(limit)
    .get()
  if (snap.empty) return 0
  const batch = db.batch()
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return snap.size
}
