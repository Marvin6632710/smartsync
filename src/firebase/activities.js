import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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
  const hour = Number(String(time || '').split(':')[0])
  if (!Number.isFinite(hour)) return 'Evening'
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

/** Combines a 'YYYY-MM-DD' date and 'HH:MM' time into a real instant. */
export function toStartsAt(date, time) {
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
  }
}

/**
 * Live feed of every activity from yesterday onwards, soonest first.
 *
 * Cancelled ones are included deliberately: they must disappear from
 * discovery but stay visible to people who had joined, so the filtering is
 * done by the caller rather than the query.
 */
export function watchActivities(callback, onError) {
  const cutoff = Timestamp.fromMillis(Date.now() - HISTORY_WINDOW_MS)
  return onSnapshot(
    query(activitiesRef, where('startsAt', '>=', cutoff), orderBy('startsAt', 'asc')),
    (snap) => callback(snap.docs.map(normalise)),
    onError,
  )
}

export function watchActivity(activityId, callback, onError) {
  return onSnapshot(
    activityDoc(activityId),
    (snap) => callback(snap.exists() ? normalise(snap) : null),
    onError,
  )
}

export async function createActivity(user, data) {
  const time = data.time || '18:00'
  const created = await addDoc(activitiesRef, {
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
  return created.id
}

export function updateActivity(activityId, updates) {
  const patch = { ...updates, updatedAt: serverTimestamp() }
  if (updates.capacity !== undefined) patch.capacity = Math.round(Number(updates.capacity))
  if (updates.time) {
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
 * Hosts cancel rather than delete. See firestore.rules — a hard delete would
 * orphan the message subcollection and erase the chat history of everyone who
 * had joined.
 */
export function cancelActivity(activityId) {
  return updateDoc(activityDoc(activityId), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  })
}
