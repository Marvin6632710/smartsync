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
