import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

import { db } from './config'
import { reportError } from '../utils/reportError'

const MAX_NOTIFICATIONS = 50

const notificationsRef = (uid) => collection(db, 'users', uid, 'notifications')

export function watchNotifications(uid, callback, onError) {
  return onSnapshot(
    query(notificationsRef(uid), orderBy('createdAt', 'desc'), limit(MAX_NOTIFICATIONS)),
    (snap) =>
      callback(
        snap.docs.map((d) => {
          const data = d.data()
          return { id: d.id, ...data, createdAt: data.createdAt?.toMillis?.() ?? Date.now() }
        }),
      ),
    onError,
  )
}

/**
 * Notifications are written into the *recipient's* inbox, which is why the
 * rules allow any signed-in user to create one: "Alex joined your activity"
 * has to be written by Alex. The rules constrain the shape and force
 * read:false so a sender cannot forge a pre-read system message.
 */
export function pushNotification(uid, { type, title, body, activityId = null }) {
  return addDoc(notificationsRef(uid), {
    type: type || 'general',
    title: String(title || '').slice(0, 120),
    body: String(body || '').slice(0, 300),
    activityId,
    read: false,
    createdAt: serverTimestamp(),
  })
}

export function markNotificationRead(uid, notificationId) {
  return updateDoc(doc(db, 'users', uid, 'notifications', notificationId), { read: true })
}

export async function markAllNotificationsRead(uid) {
  const snap = await getDocs(notificationsRef(uid))
  const unread = snap.docs.filter((d) => d.data().read === false)
  if (unread.length === 0) return
  const batch = writeBatch(db)
  unread.forEach((entry) => batch.update(entry.ref, { read: true }))
  await batch.commit()
}

// ---------------------------------------------------------------- following

/**
 * A follow is stored twice, and the second copy is the one that does the work.
 *
 * `users/{me}/following/{them}` is private to me and drives the button. On
 * its own it made a promise nobody could keep: "you'll be alerted when they
 * post an activity" needs the *host* to know who is listening, and a list
 * kept under each listener, readable by nobody else, is unreachable from the
 * host's side — there is no server here to look across accounts. So the same
 * follow is mirrored to `users/{them}/followers/{me}`, readable by the host,
 * and the host's own client tells each follower when it creates something.
 * What the host learns is a list of ids, and nothing in the app shows it.
 */
const followingRef = (uid) => collection(db, 'users', uid, 'following')
const followingDoc = (uid, targetId) => doc(db, 'users', uid, 'following', targetId)
const followersRef = (uid) => collection(db, 'users', uid, 'followers')
const followerDoc = (hostId, followerId) => doc(db, 'users', hostId, 'followers', followerId)

/**
 * How many followers one activity announces itself to.
 *
 * The announcement is written by the host's phone, one document per follower,
 * so it has to be bounded by something other than how popular somebody is.
 * Two hundred is far past anything a campus produces and small enough to
 * finish in a few seconds on a poor connection. Beyond it, the rest simply
 * are not told — arbitrary, like every unordered window in this app, but
 * bounded and honest.
 */
export const FOLLOWER_FANOUT_LIMIT = 200

export function watchFollowing(uid, callback, onError) {
  return onSnapshot(followingRef(uid), (snap) => callback(snap.docs.map((d) => d.id)), onError)
}

/** Both halves in one batch, so the button and the delivery cannot disagree. */
export function followUser(uid, targetId) {
  const at = { createdAt: serverTimestamp() }
  return writeBatch(db)
    .set(followingDoc(uid, targetId), at)
    .set(followerDoc(targetId, uid), at)
    .commit()
}

export function unfollowUser(uid, targetId) {
  return writeBatch(db)
    .delete(followingDoc(uid, targetId))
    .delete(followerDoc(targetId, uid))
    .commit()
}

/**
 * Writes the missing half of a follow made before the mirror existed.
 *
 * Follows recorded by earlier versions have only the private copy, so the
 * host has never heard of them. One read per followed person, once per
 * session, and a write only where the mirror is absent. Best-effort: a
 * failure here leaves the follow exactly as it was.
 */
export async function ensureFollowerMirror(uid, targetId) {
  const ref = followerDoc(targetId, uid)
  const existing = await getDoc(ref)
  if (existing.exists()) return false
  await setDoc(ref, { createdAt: serverTimestamp() })
  return true
}

/**
 * Tells everyone following the host that they have posted something.
 *
 * Idempotent by construction: the notification's id is derived from the
 * activity, so a second run — a retry, a double-tap that somehow got past
 * the button — is a `set` on a document that already exists, which the
 * rules refuse. Nobody is told twice.
 *
 * Never throws. The activity is already created; a follower who could not be
 * told is not a reason to report the creation as failed. A refusal is what a
 * follower who turned notifications off, or who has blocked the host, looks
 * like from here, and neither is an error. Anything else is recorded.
 *
 * Returns what happened, for whoever wants to know.
 */
export async function notifyFollowers(hostId, activityId, { title, body, skip = new Set() }) {
  let followers
  try {
    followers = await getDocs(query(followersRef(hostId), limit(FOLLOWER_FANOUT_LIMIT)))
  } catch (error) {
    reportError('notifications.followers', error, { hostId })
    return { told: 0, declined: 0, failed: 0 }
  }

  const results = await Promise.allSettled(
    followers.docs
      .map((entry) => entry.id)
      .filter((followerId) => followerId !== hostId && !skip.has(followerId))
      .map((followerId) =>
        setDoc(doc(db, 'users', followerId, 'notifications', `follow-${activityId}`), {
          type: 'follow',
          title: String(title || '').slice(0, 120),
          body: String(body || '').slice(0, 300),
          activityId,
          read: false,
          createdAt: serverTimestamp(),
        }),
      ),
  )

  const outcome = { told: 0, declined: 0, failed: 0 }
  for (const result of results) {
    if (result.status === 'fulfilled') outcome.told += 1
    else if (result.reason?.code === 'permission-denied') outcome.declined += 1
    else {
      outcome.failed += 1
      reportError('notifications.followers', result.reason, { hostId, activityId })
    }
  }
  return outcome
}
