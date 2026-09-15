import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

import { db } from './config'

const activitiesRef = collection(db, 'activities')
const activityDoc = (id) => doc(db, 'activities', id)

// Activities that finished more than a day ago are not fetched at all. Without
// a floor the listener would re-download the entire history of the app on
// every launch, which gets slow and expensive well before it gets useful.
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Time band is derived from the actual start time rather than being a separate
 * field the host picks. Previously the two could contradict each other — a
 * 7 AM activity tagged "Evening" — and the recommendation engine trusted the
 * tag, so a typo silently corrupted 15% of every score.
 */
export function deriveTimeBand(time) {
  // The shape is checked before the number is: `Number('')` is 0, not NaN,
  // so an emptied time field parsed as midnight and came out "Morning"
  // rather than falling through to the default — the same slip formatClock
  // already guards against.
  const match = /^(\d{1,2}):\d{2}$/.exec(String(time || '').trim())
  const hour = match ? Number(match[1]) : NaN
  if (!Number.isFinite(hour) || hour > 23) return 'Evening'
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

/** Combines a 'YYYY-MM-DD' date and 'HH:MM' time into a real instant. */
function toStartsAt(date, time) {
  const parsed = new Date(`${date}T${time || '00:00'}`)
  return Number.isNaN(parsed.getTime()) ? null : Timestamp.fromDate(parsed)
}

/** Firestore Timestamps are not plain data; normalise them at the boundary. */
function normalise(snapshot) {
  const data = snapshot.data()
  return {
    ...data,
    id: snapshot.id,
    participantUids: data.participantUids || [],
    participants: (data.participantUids || []).length,
    startsAt: data.startsAt?.toMillis?.() ?? null,
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
    // True while a local write to this document has not yet been accepted by
    // the server. The screen may act on the optimistic version; anything that
    // asks the *server* about it — a listener whose rule reads the document —
    // has to wait, because the server has not seen the write yet.
    pendingWrite: snapshot.metadata?.hasPendingWrites === true,
  }
}

/**
 * How much of the future the discovery feed holds at once.
 *
 * This query had no bound at all: every signed-in client opened a live
 * listener on every upcoming activity in the database and kept it open. That
 * is fine with two dozen activities and untenable with two thousand — the
 * cost is per document read, it is paid again by every person who opens the
 * app, and it grows with the platform rather than with the user.
 *
 * Four hundred, soonest first, is far more than anybody scrolls and small
 * enough to stay cheap. What it cannot do is guarantee that something you
 * joined months ahead is inside the window, which is why `watchMyActivities`
 * exists alongside it rather than instead of it.
 */
export const DISCOVERY_LIMIT = 400

/** A person's own activities are theirs to keep; this bound is a sanity cap. */
export const MINE_LIMIT = 200

/**
 * Live feed of the soonest activities from yesterday onwards.
 *
 * Cancelled ones are included deliberately: they must disappear from
 * discovery but stay visible to people who had joined, so the filtering is
 * done by the caller rather than the query.
 */
export function watchActivities(callback, onError) {
  const cutoff = Timestamp.fromMillis(Date.now() - HISTORY_WINDOW_MS)
  return onSnapshot(
    query(
      activitiesRef,
      where('startsAt', '>=', cutoff),
      orderBy('startsAt', 'asc'),
      limit(DISCOVERY_LIMIT),
    ),
    // includeMetadataChanges so the listener also fires when only the
    // connection state changes. Without it, going offline is silent until
    // some document happens to change — which offline it never will.
    { includeMetadataChanges: true },
    (snap) => callback(snap.docs.map(normalise), { fromCache: snap.metadata.fromCache }),
    onError,
  )
}

/**
 * Everything this person hosts or has joined, whenever it happens.
 *
 * The companion to the bound above. Capping discovery is safe; capping it
 * without this would not be, because the cap is by start time and would
 * eventually push somebody's own commitment out of their own list — they
 * would have joined something and then watched it vanish. The host is the
 * first entry on their own roster, so one array-contains covers both hosting
 * and joining, and the result set is the size of one person's social life
 * rather than the platform's.
 */
export function watchMyActivities(uid, callback, onError) {
  return onSnapshot(
    query(
      activitiesRef,
      where('participantUids', 'array-contains', uid),
      orderBy('startsAt', 'desc'),
      limit(MINE_LIMIT),
    ),
    // Metadata changes too, and this one is not optional: `pendingWrite` is
    // read from the snapshot, and a write being accepted by the server is a
    // metadata-only change. Without this, an activity held only by this feed
    // — one outside the discovery window — would stay marked pending after
    // its create or join landed, and its chat would never open.
    { includeMetadataChanges: true },
    (snap) => callback(snap.docs.map(normalise)),
    onError,
  )
}

/**
 * Creates an activity and resolves with its id once the server has it.
 *
 * The id is also available *before* that, as `.id` on the returned promise.
 * The id is minted locally, so nothing about it depends on the server — and
 * a screen that is offline needs it now: the activity is already in the
 * local cache and on the feed, and "Creating…" until the connection came
 * back was the only thing standing between the host and their own page.
 * `addDoc` mints the same way but keeps the reference to itself until the
 * acknowledgement; a `doc()` followed by `setDoc` is the same create with
 * the id in hand.
 */
export function createActivity(user, data) {
  const time = data.time || '18:00'
  const ref = doc(activitiesRef)
  const written = setDoc(ref, {
    title: String(data.title || '').trim(),
    description: String(data.description || '').trim(),
    category: data.category,
    tags: [data.category, deriveTimeBand(time)].filter(Boolean),
    locationName: String(data.locationName || '').trim(),
    lat: Number(data.lat),
    lng: Number(data.lng),
    date: data.date,
    time,
    startsAt: toStartsAt(data.date, time),
    timeBand: deriveTimeBand(time),
    capacity: Math.round(Number(data.capacity) || 8),
    // The host is the first participant of their own activity.
    participantUids: [user.uid],
    hostId: user.uid,
    hostName: user.name,
    hostAvatar: user.avatar,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const pending = written.then(() => ref.id)
  pending.id = ref.id
  return pending
}

export function updateActivity(activityId, updates) {
  const patch = { ...updates, updatedAt: serverTimestamp() }
  if (updates.capacity !== undefined) patch.capacity = Math.round(Number(updates.capacity))
  // `startsAt` is the instant every query runs on, and it is derived from
  // the date and the time together. Moving one without the other used to
  // leave it where it was — silently, since only `time` triggered the
  // recompute. Refused loudly instead: the one caller sends both, and a
  // future one that does not should find out here rather than in a feed
  // that quietly shows the old day.
  const movesDate = updates.date !== undefined
  const movesTime = updates.time !== undefined
  if (movesDate || movesTime) {
    if (!updates.date || !updates.time) {
      return Promise.reject(new Error('updateActivity: date and time must be given together'))
    }
    patch.timeBand = deriveTimeBand(updates.time)
    patch.startsAt = toStartsAt(updates.date, updates.time)
  }
  return updateDoc(activityDoc(activityId), patch)
}

/**
 * Joining is one write to one field.
 *
 * `arrayUnion` is a server-side transform, so two people taking the last seat
 * at the same moment cannot both read "one seat left" and both win: the server
 * applies the transforms in order and evaluates the capacity rule against the
 * resolved roster, so the second request is rejected rather than overselling.
 * It is also idempotent, which makes a double-tap on Join harmless.
 */
export function joinActivity(activityId, uid) {
  return updateDoc(activityDoc(activityId), {
    participantUids: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  })
}

export function leaveActivity(activityId, uid) {
  return updateDoc(activityDoc(activityId), {
    participantUids: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  })
}

/**
 * The host's name and avatar are copied onto every activity they host, so a
 * list can be rendered without resolving every host — and a copy that is
 * never refreshed goes stale the moment the original changes. That was not
 * merely untidy: turning on anonymous mode once rewrote the profile and left
 * the real name sitting on each hosted activity, readable by any signed-in
 * stranger. The two functions below are the halves of the rewrite; users.js
 * puts them in the same batch as the profile, so the profile and every copy
 * of the name change together or not at all.
 */

/**
 * Every activity this person hosts, as references, for a batch to stamp.
 *
 * `partial` says whether the list is the server's or the cache's. Offline,
 * Firestore answers a query from whatever it holds — which, measured, can
 * be a subset of the host's activities — without saying so unless asked.
 * A sweep built on that list stamps only what was cached, so the caller
 * records that the sweep is unfinished and completes it from the server
 * later (see `completeIdentitySweep` in users.js).
 */
export async function hostedActivityRefs(uid) {
  const mine = await getDocs(query(activitiesRef, where('hostId', '==', uid)))
  const refs = mine.docs.map((entry) => entry.ref)
  refs.partial = mine.metadata?.fromCache === true
  return refs
}

/**
 * The host's activities as the server holds them, with their current copy
 * of the host's name and avatar — for finishing a sweep the cache could
 * only start. Rejects offline, which is the point: this is asked only once
 * the connection is known to be back.
 */
export async function hostedActivitiesFromServer(uid) {
  const mine = await getDocsFromServer(query(activitiesRef, where('hostId', '==', uid)))
  return mine.docs.map((entry) => ({
    ref: entry.ref,
    hostName: entry.data().hostName,
    hostAvatar: entry.data().hostAvatar,
  }))
}

/**
 * Adds the identity rewrite for each activity to a batch somebody else owns.
 *
 * Split out so the profile write can sit in the *same* batch as the
 * activities it has to agree with: see `writeIdentity` in users.js. The
 * caller is responsible for staying under the batch limit.
 */
export function stampHostIdentity(batch, refs, { name, avatar }) {
  refs.forEach((ref) =>
    batch.update(ref, { hostName: name, hostAvatar: avatar, updatedAt: serverTimestamp() }),
  )
}

/**
 * Hosts cancel rather than delete. See firestore.rules — a hard delete would
 * orphan the message subcollection and erase the chat history of everyone who
 * had joined.
 */
/**
 * Removes an activity nobody else joined.
 *
 * Distinct from cancelling: with only the host on the roster there is nobody
 * whose plans are being changed and nothing to announce, so leaving a
 * tombstone in everyone's history would be noise. The rules allow this only
 * while the host is the sole participant.
 */
export function deleteActivity(activityId) {
  return deleteDoc(activityDoc(activityId))
}

export function cancelActivity(activityId) {
  return updateDoc(activityDoc(activityId), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  })
}
