import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'

import { db } from './config'

// Chat is capped per activity. Without a limit the listener re-downloads the
// entire history on every new message, which gets expensive fast on a free
// Firestore quota.
const MESSAGE_PAGE = 200

/**
 * How long an activity's chat stays open after it starts.
 *
 * Mirrored in firestore.rules, which is where it is actually enforced — the
 * rules cannot import from here. This copy exists so the interface can close
 * the thread and say why, instead of letting the user type a message that the
 * database was always going to refuse.
 */
export const CHAT_RETENTION_DAYS = 30

export function isChatClosed(activity, now = Date.now()) {
  if (!activity || !Number.isFinite(activity.startsAt)) return false
  return now - activity.startsAt > CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000
}

const messagesRef = (activityId) => collection(db, 'activities', activityId, 'messages')

export function watchMessages(activityId, callback, onError) {
  return onSnapshot(
    query(messagesRef(activityId), orderBy('createdAt', 'desc'), limit(MESSAGE_PAGE)),
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          // Pending local writes have no server timestamp yet; fall back to
          // now so an optimistic message sorts last instead of jumping to
          // the top of the thread.
          createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        }
      })
      callback(rows.reverse())
    },
    onError,
  )
}

export function sendMessage(activityId, user, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return Promise.resolve()
  return addDoc(messagesRef(activityId), {
    senderId: user.uid,
    senderName: user.name,
    senderAvatar: user.avatar,
    text: trimmed.slice(0, 2000),
    createdAt: serverTimestamp(),
  })
}

/** Newest message only — enough for an inbox preview, one document per thread. */
export function watchLatestMessage(activityId, callback, onError) {
  return onSnapshot(
    query(messagesRef(activityId), orderBy('createdAt', 'desc'), limit(1)),
    (snap) => {
      const first = snap.docs[0]
      if (!first) {
        callback(null)
        return
      }
      const data = first.data()
      callback({ id: first.id, ...data, createdAt: data.createdAt?.toMillis?.() ?? Date.now() })
    },
    onError,
  )
}
