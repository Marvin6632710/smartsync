import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

import { db } from './config'

/**
 * Blocking and reporting.
 *
 * Kept in its own module because these are the only writes whose purpose is
 * to stop something happening rather than to make something happen, and they
 * answer to a different question: not "does this work" but "does this hold
 * when somebody is trying to make it fail".
 */

const blockedRef = (uid) => collection(db, 'users', uid, 'blocked')
const blockDoc = (uid, targetId) => doc(db, 'users', uid, 'blocked', targetId)

/**
 * Your block list. Private to you — see firestore.rules for why publishing
 * it would be a harm in itself.
 *
 * The stored name is a snapshot taken at the moment of blocking. That is
 * deliberate: the list has to stay readable to you even if the person later
 * renames themselves or turns on anonymous mode, or you would be looking at
 * a list of strangers with no way to tell who was who.
 */
export function watchBlocked(uid, callback, onError) {
  return onSnapshot(
    blockedRef(uid),
    (snap) => callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    onError,
  )
}

export function blockUser(uid, target) {
  return setDoc(blockDoc(uid, target.uid), {
    name: target.name || 'SmartSync user',
    avatar: target.avatar || '?',
    createdAt: serverTimestamp(),
  })
}

export function unblockUser(uid, targetId) {
  return deleteDoc(blockDoc(uid, targetId))
}

export const REPORT_REASONS = [
  { key: 'harassment', label: 'Harassment or abuse' },
  { key: 'inappropriate', label: 'Inappropriate content' },
  { key: 'safety', label: 'A safety concern' },
  { key: 'fake', label: 'Fake or misleading activity' },
  { key: 'spam', label: 'Spam or a scam' },
  { key: 'other', label: 'Something else' },
]

/**
 * Files a report.
 *
 * Reports are immutable once written, including to the person who wrote them:
 * evidence that either side can alter or quietly withdraw is not evidence.
 *
 * `context` carries whatever the reporter was looking at — the message text,
 * the activity title — because a report that says only "user X, harassment"
 * gives a reviewer nothing to act on, and by the time anyone reads it the
 * chat may have closed.
 */
export function fileReport({ reporterId, targetType, targetId, reason, detail, context }) {
  return addDoc(collection(db, 'reports'), {
    reporterId,
    targetType,
    targetId,
    reason,
    detail: String(detail || '').slice(0, 1000),
    context: String(context || '').slice(0, 500),
    status: 'open',
    createdAt: serverTimestamp(),
  })
}
