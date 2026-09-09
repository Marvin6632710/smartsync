import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

import { db } from './config'

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

export function deleteNotification(uid, notificationId) {
  return deleteDoc(doc(db, 'users', uid, 'notifications', notificationId))
}

// ---------------------------------------------------------------- following

const followingRef = (uid) => collection(db, 'users', uid, 'following')

export function watchFollowing(uid, callback, onError) {
  return onSnapshot(followingRef(uid), (snap) => callback(snap.docs.map((d) => d.id)), onError)
}

export function followUser(uid, targetId) {
  return writeBatch(db)
    .set(doc(db, 'users', uid, 'following', targetId), { createdAt: serverTimestamp() })
    .commit()
}

export function unfollowUser(uid, targetId) {
  return deleteDoc(doc(db, 'users', uid, 'following', targetId))
}
