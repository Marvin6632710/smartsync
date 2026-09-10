import {
  addDoc,
  collection,
  deleteDoc,
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
  where,
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
export function fileReport({
  reporterId,
  targetType,
  targetId,
  subjectId,
  activityId,
  reason,
  detail,
  context,
}) {
  return addDoc(collection(db, 'reports'), {
    reporterId,
    targetType,
    // What was reported.
    targetId,
    // Who is answerable for it — the person, the activity's host, or the
    // message's sender. The rules check this against the real document, so it
    // is safe for the queue to act on. Suspension used to act on `targetId`,
    // which for a message report is a message id: reporting a message wrote a
    // roles document against the message and suspended nobody.
    subjectId,
    // Only message reports carry this, and only so the rules can find the
    // message to verify `subjectId` against.
    ...(activityId ? { activityId } : {}),
    reason,
    detail: String(detail || '').slice(0, 1000),
    context: String(context || '').slice(0, 500),
    status: 'open',
    createdAt: serverTimestamp(),
  })
}

// ---------------------------------------------------------------- roles ----

/**
 * Somebody's role and whether they are suspended.
 *
 * Roles live in their own collection, never on the profile a user can edit —
 * a role stored anywhere its holder can write is a role its holder can grant
 * themselves. A missing row means an ordinary user, which is why nothing has
 * to be written when somebody signs up.
 */
export function watchRole(uid, callback, onError) {
  return onSnapshot(
    doc(db, 'roles', uid),
    (snap) =>
      callback(
        snap.exists()
          ? { role: snap.data().role || 'user', suspended: !!snap.data().suspended }
          : { role: 'user', suspended: false },
      ),
    onError,
  )
}

/** Appoint or dismiss a moderator. Admin only, and never for yourself. */
export function setUserRole(uid, role, suspended = false) {
  return setDoc(doc(db, 'roles', uid), { role, suspended }, { merge: true })
}

/**
 * Suspends or restores an account.
 *
 * Reads the existing row first so the role survives. The previous version
 * wrote `role: 'user'` alongside the flag, which meant suspending a moderator
 * quietly demoted them — and un-suspending them left them demoted, with
 * nothing anywhere saying it had happened.
 */
export async function setSuspended(uid, suspended) {
  const ref = doc(db, 'roles', uid)
  const existing = await getDoc(ref)
  await setDoc(ref, { role: existing.data()?.role || 'user', suspended }, { merge: true })
  await tell(
    uid,
    suspended
      ? {
          title: 'Your account is suspended',
          body: 'You can still read SmartSync, but cannot create, join or message.',
        }
      : {
          title: 'Your account is active again',
          body: 'The suspension on your account is lifted.',
        },
  )
}

// -------------------------------------------------------------- reports ----

const REPORT_PAGE = 100

/** The queue a moderator works from: everything still open, newest first. */
export function watchOpenReports(callback, onError) {
  return onSnapshot(
    query(
      collection(db, 'reports'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
      limit(REPORT_PAGE),
    ),
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
 * Records what a moderator decided.
 *
 * Only the decision is writable — the rules refuse any change to the reason,
 * the description or the reporter. A record a reviewer can rewrite is not a
 * record.
 */
export function resolveReport(reportId, { status, outcome, moderatorId }) {
  return updateDoc(doc(db, 'reports', reportId), {
    status,
    outcome: String(outcome || '').slice(0, 300),
    reviewedBy: moderatorId,
    reviewedAt: serverTimestamp(),
  })
}

/**
 * Tells somebody a moderator acted on them.
 *
 * Best-effort by design. The rules refuse a notification to anyone who has
 * switched notifications off, and a refused courtesy must not look like a
 * failed decision — the removal or the suspension has already happened and is
 * not being rolled back because we could not announce it.
 */
async function tell(uid, { title, body, activityId }) {
  if (!uid) return
  try {
    await addDoc(collection(db, 'users', uid, 'notifications'), {
      type: 'moderation',
      title,
      body: body.slice(0, 300),
      // Carrying the id makes the notification open the activity, where the
      // banner explains the decision in full. Without it the note is a
      // dead end that tells you something happened and not where.
      ...(activityId ? { activityId } : {}),
      read: false,
      createdAt: serverTimestamp(),
    })
  } catch {
    // Nothing to do and nothing to report: the decision stands either way.
  }
}

/**
 * Takes an activity down.
 *
 * Distinct from a host cancelling: this says the activity broke the rules,
 * it names who decided, and neither the host nor anybody else can undo it
 * from inside the app.
 */
export async function removeActivity(activityId, { moderatorId, reason }) {
  const ref = doc(db, 'activities', activityId)
  // Read before writing, to know whose plans this is about to cancel.
  const before = (await getDoc(ref)).data()
  const note = String(reason || '').slice(0, 300)

  await updateDoc(ref, {
    status: 'removed',
    moderation: { by: moderatorId, reason: note },
    updatedAt: serverTimestamp(),
  })

  if (!before) return
  const title = before.title || 'An activity'
  await tell(before.hostId, {
    title: 'Your activity was removed',
    body: `SmartSync removed "${title}": ${note}.`,
    activityId,
  })
  // Everyone who had joined planned their evening around this. They find out
  // now, not by turning up. Not the host, who got the fuller note above, and
  // not whoever just pressed the button — a moderator who happens to be on
  // the roster does not need telling what they themselves did.
  await Promise.allSettled(
    (before.participantUids || [])
      .filter((memberId) => memberId !== before.hostId && memberId !== moderatorId)
      .map((memberId) =>
        tell(memberId, {
          title: 'An activity you joined was removed',
          body: `"${title}" is not going ahead. SmartSync removed it.`,
          activityId,
        }),
      ),
  )
}

/**
 * Every account currently suspended, for the review list.
 *
 * A moderation system that can suspend but not un-suspend is not finished:
 * without this the only way back was the Firebase console, which is not a
 * place a moderator should have to go.
 *
 * Readable by moderators because the roles rules allow it — and a list query
 * is allowed precisely because `isModerator()` does not depend on which
 * document is being read, so it either holds for all of them or none.
 */
export function watchSuspended(callback, onError) {
  return onSnapshot(
    query(collection(db, 'roles'), where('suspended', '==', true)),
    (snap) => callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    onError,
  )
}

/** Lifts a suspension. The rules decide whether this caller may. */
export function liftSuspension(uid) {
  return setSuspended(uid, false)
}

/**
 * Suspends an account and stands down everything it is hosting.
 *
 * The suspension alone is not enough, and this is the sharpest collision in
 * the whole design. Somebody is suspended precisely because they may be a
 * danger to the people they would be meeting — and their existing activities
 * would otherwise stay live, still in discovery, still accepting strangers.
 * The rules refuse those joins now, but a listing you cannot join and are
 * never told why about is a worse experience than one that is honestly gone.
 *
 * The client could not do this filtering on its own even if it wanted to:
 * roles are readable only by their owner and by moderators, so discovery
 * genuinely cannot tell that a host is suspended.
 *
 * Each takedown records the real reason and notifies whoever had joined, so
 * nobody turns up to something that is not happening. Lifting the suspension
 * does not bring them back — an admin restores them one at a time, which is
 * the same review any other reversal gets.
 */
export async function suspendAccount(uid, { moderatorId }) {
  await setSuspended(uid, true)

  const hosted = await getDocs(query(collection(db, 'activities'), where('hostId', '==', uid)))
  const standing = hosted.docs.filter((d) => d.data().status === 'active')

  // Settled rather than awaited in sequence: one failure must not leave the
  // rest of somebody's activities live after they have been suspended.
  const results = await Promise.allSettled(
    standing.map((d) =>
      removeActivity(d.id, {
        moderatorId,
        reason: 'The host\u2019s account was suspended',
      }),
    ),
  )
  return {
    stoodDown: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  }
}

/**
 * Puts a removed activity back. Admin only — the rules enforce that, this is
 * only the button. The reason overwrites the takedown note, so the document
 * carries the second decision and the report carries the first.
 */
export async function restoreActivity(activityId, { adminId, reason }) {
  const ref = doc(db, 'activities', activityId)
  const before = (await getDoc(ref)).data()
  await updateDoc(ref, {
    status: 'active',
    moderation: { by: adminId, reason: String(reason || '').slice(0, 300) },
    updatedAt: serverTimestamp(),
  })
  if (before?.hostId) {
    await tell(before.hostId, {
      title: 'Your activity is back',
      body: `"${before.title || 'Your activity'}" was reviewed again and restored.`,
      activityId,
    })
  }
}
