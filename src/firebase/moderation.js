import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

import { db } from './config'
import { storedText } from '../i18n/notificationText'
import { reportError } from '../utils/reportError'

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
  // Minted locally, like a message, so a report queued offline can be
  // checked after a reload.
  const ref = doc(collection(db, 'reports'))
  const pending = setDoc(ref, {
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
  }).then(() => ref)
  pending.id = ref.id
  return pending
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
    // Metadata too, and the origin reported alongside the row — see the
    // note on the profile watchers in users.js.
    { includeMetadataChanges: true },
    (snap) =>
      callback(
        snap.exists()
          ? {
              role: snap.data().role || 'user',
              suspended: !!snap.data().suspended,
              banned: snap.data().banned === true,
            }
          : { role: 'user', suspended: false, banned: false },
        { fromCache: snap.metadata?.fromCache === true },
      ),
    onError,
  )
}

/**
 * Suspends or restores an account.
 *
 * Reads the existing row first so the role survives. The previous version
 * wrote `role: 'user'` alongside the flag, which meant suspending a moderator
 * quietly demoted them — and un-suspending them left them demoted, with
 * nothing anywhere saying it had happened.
 */
/**
 * Changes one field of a role row without losing the others.
 *
 * These rows carry three independent decisions — rank, suspension, closure —
 * taken by different people at different times, and each writer has to
 * preserve the two it is not changing. Doing that with a read followed by a
 * write loses updates whenever two moderators act at once: suspend somebody
 * while a colleague is promoting them, and the promotion writes back the
 * `suspended: false` it read a moment earlier, quietly lifting the
 * suspension. Nothing in the rules can catch that — both writes are
 * individually legitimate.
 *
 * A transaction re-runs if the document changed underneath it, so the
 * surviving row always reflects both decisions. Notifications stay outside,
 * because a transaction may run its body more than once and nobody should be
 * told twice.
 */
/**
 * Returns the row as it was and as it is, so a caller can tell whether the
 * change was a change. Every notice below is sent only when it was: a
 * moderator whose first attempt half-succeeded — the row written, the
 * report's resolution refused — presses the button again, and the person
 * must not be told twice that the same thing happened to them.
 */
async function patchRole(uid, change, claim) {
  const ref = doc(db, 'roles', uid)
  return runTransaction(db, async (tx) => {
    // Read before any write, as a transaction requires — and read in the
    // same transaction, so the role row is committed only if the claim was
    // still this moderator's at commit time.
    if (claim) await assertClaim(tx, claim)
    const snap = await tx.get(ref)
    const existing = snap.data() || {}
    const before = {
      role: existing.role || 'user',
      suspended: existing.suspended === true,
      banned: existing.banned === true,
    }
    const next = {
      role: before.role,
      suspended: before.suspended,
      ...(before.banned ? { banned: true } : {}),
      ...change,
    }
    tx.set(ref, next, { merge: true })
    // The decision lands with the row or not at all — see recordDecision.
    if (claim?.decision) recordDecision(tx, claim)
    return { before, after: { ...before, ...change } }
  })
}

export async function setSuspended(uid, suspended, claim) {
  const { before } = await patchRole(uid, { suspended }, claim)
  if (before.suspended === suspended) return
  // Every notice below is stored in English, the language notifications are
  // written in, and worded for its reader on their own screen — see
  // i18n/notificationText, which is where these templates live.
  await tell(uid, storedText(suspended ? 'suspended' : 'activeAgain'))
}

// -------------------------------------------------------------- reports ----

/**
 * How long a moderator's claim on a report stays theirs.
 *
 * Mirrored in firestore.rules, which is where it is enforced. A moderator
 * who closed the tab mid-action must not lock a report for good; after this
 * long a colleague may take it over, and anything the original still tries
 * to write is refused because the claim is no longer theirs.
 */
export const CLAIM_TTL_MS = 5 * 60_000

/**
 * What went wrong with a claim, in words the screen can act on.
 *
 * `claim-held`: somebody else holds a fresh claim. `already-handled`: the
 * report is no longer open. `claim-lost`: the claim this action was taken
 * under is no longer this moderator's — taken over after it went stale, or
 * the report was closed — so the action was aborted before it changed
 * anything.
 */
export class ModerationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ModerationError'
    this.code = code
    // Who closed it, for `already-handled`: a moderator whose own decision
    // landed while the acknowledgement was lost is told it was theirs, not
    // that a colleague beat them to it.
    this.details = details
  }
}

const reportDoc = (reportId) => doc(db, 'reports', reportId)

const claimAgeMs = (claim, now = Date.now()) => {
  const at = claim?.at?.toMillis?.()
  // A claim whose server time has not resolved yet was written moments ago.
  return Number.isFinite(at) ? now - at : 0
}
const claimFresh = (claim, now = Date.now()) => claimAgeMs(claim, now) < CLAIM_TTL_MS

/**
 * Takes the report for this moderator, or says why not.
 *
 * Working a report is three writes in order — claim, act, record — and this
 * is the first. Two moderators used to be able to act on the same report at
 * once: the record kept whichever landed second, and a suspension could be
 * taken on a complaint a colleague had just dismissed. The claim is a lease
 * stamped with the server's clock, refused by the rules while somebody
 * else's is fresh; every action from the queue reads it in the same
 * transaction that writes the consequence (see `assertClaim`).
 *
 * A transaction, so the read and the write are one step: a fresh claim by
 * somebody else is `claim-held`, a closed report is `already-handled`, and
 * the rules are the final word on both if the clocks disagree.
 */
export async function claimReport(reportId, moderatorId) {
  const ref = reportDoc(reportId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().status !== 'open') {
      throw new ModerationError('already-handled', 'This report is no longer open.', {
        reviewedBy: snap.exists() ? snap.data().reviewedBy || null : null,
      })
    }
    const claim = snap.data().claim
    if (claim && claim.by !== moderatorId && claimFresh(claim)) {
      throw new ModerationError('claim-held', 'Another moderator is working on this report.')
    }
    tx.update(ref, { claim: { by: moderatorId, at: serverTimestamp() } })
  })
}

/**
 * Lets the next person in after an action that did not finish.
 *
 * Best-effort: the claim expires on its own, so a release that fails costs
 * a colleague a few minutes and nothing else. Only ever removes this
 * moderator's own claim — the rules refuse anything else.
 */
export async function releaseReport(reportId) {
  try {
    await updateDoc(reportDoc(reportId), { claim: deleteField() })
  } catch (error) {
    if (error?.code !== 'permission-denied') reportError('moderation.release', error, { reportId })
  }
}

/**
 * Reads the claim inside an action's transaction, and aborts the action if
 * it is no longer this moderator's.
 *
 * Because the read is part of the transaction, the write it guards commits
 * only if the report was unchanged since — Firestore retries the body when
 * the report moves underneath it, and the re-run sees the new claim. That
 * is what makes "the claim is still valid" true at commit time rather than
 * merely at the moment of asking.
 */
async function assertClaim(tx, { reportId, moderatorId }) {
  const snap = await tx.get(reportDoc(reportId))
  const data = snap.exists() ? snap.data() : null
  if (!data || data.status !== 'open') {
    throw new ModerationError('claim-lost', 'This report was closed before the action landed.', {
      reviewedBy: data?.reviewedBy || null,
    })
  }
  if (data.claim?.by !== moderatorId) {
    throw new ModerationError('claim-lost', 'This report is no longer yours to act on.')
  }
}

/**
 * Writes the decision into the same transaction as the action it records.
 *
 * This is what makes the claim a control rather than a convention for
 * suspensions and warnings. A takedown names its report and the rules
 * check the claim on the activity write itself; a role row cannot name a
 * report — it is deliberately three fields and nothing else — so the rules
 * cannot check the claim there. Committing the decision with the action
 * closes that: the rules refuse the decision unless the claim is held and
 * the report is open, a transaction commits everything or nothing, and so
 * a suspension recorded against a report can only ever land under its
 * claim. It also closes the gap between acting and recording — there is no
 * moment at which the account is suspended and the report still open.
 */
function recordDecision(tx, { reportId, moderatorId, decision }) {
  tx.update(reportDoc(reportId), {
    status: decision.status,
    outcome: String(decision.outcome || '').slice(0, 300),
    reviewedBy: moderatorId,
    reviewedAt: serverTimestamp(),
  })
}

// How many open reports the queue loads at once. Exported because the screen
// has to be able to say when it is showing a capped view: a moderator who
// cannot see that older reports exist has no way to know the oldest — the
// ones that have waited longest — are the ones being hidden.
export const REPORT_PAGE = 100
const WARNING_PAGE = 200

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
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
            // Flattened for the screen, which shows who is working on what.
            claimedBy: data.claim?.by ?? null,
            claimedAt: data.claim?.at?.toMillis?.() ?? (data.claim ? Date.now() : null),
          }
        }),
      ),
    onError,
  )
}

/** Is somebody else's claim on this row still fresh? (For the screen; the rules decide.) */
export function claimedByOther(row, moderatorId, now = Date.now()) {
  if (!row?.claimedBy || row.claimedBy === moderatorId) return false
  return now - (row.claimedAt ?? now) < CLAIM_TTL_MS
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
  } catch (error) {
    // The decision still stands — a removal is not rolled back because we
    // could not announce it — but "nothing to report" was too strong. This is
    // somebody not being told their activity was taken down, or that they
    // were warned, and it left no trace on any device. It is recorded now
    // even though it is not surfaced.
    reportError('moderation.tell', error, { uid })
  }
}

/**
 * Takes an activity down.
 *
 * Distinct from a host cancelling: this says the activity broke the rules,
 * it names who decided, and neither the host nor anybody else can undo it
 * from inside the app.
 */
export async function removeActivity(activityId, { moderatorId, reason, reportId, decision }) {
  const ref = doc(db, 'activities', activityId)
  const note = String(reason || '').slice(0, 300)

  // Read and write in one transaction.
  //
  // It used to read the activity, then write it in a separate call, and use
  // the first result to decide who to notify. Between the two, a host could
  // rename it or somebody could join or leave — so the notices could quote a
  // title that no longer existed, or miss a person who had joined a moment
  // before. Firestore retries the transaction when the document changes
  // underneath it, so the roster notified is the roster at the instant of
  // removal.
  //
  // The rules still decide whether this is allowed; a transaction makes the
  // read and the write consistent, it does not grant permission.
  //
  // Already removed means nothing to do — not a second record and not a
  // second round of notices. The queue can present the same activity twice
  // (two reports, or one whose resolution failed after the takedown landed),
  // and pressing Remove on it again used to tell the host and every
  // participant, again, that it had been removed.
  //
  // From the queue, the takedown names its report and reads the claim in
  // the same transaction: a claim that was lost aborts it before anything
  // changes, and the rules refuse the write unless the claim is held. The
  // decision, when there is one to record, is committed in the same step —
  // an activity already down still gets its report closed, and neither
  // half can land without the other.
  const before = await runTransaction(db, async (tx) => {
    if (reportId) await assertClaim(tx, { reportId, moderatorId })
    const snap = await tx.get(ref)
    const standing = snap.exists() && snap.data().status !== 'removed'
    if (standing) {
      tx.update(ref, {
        status: 'removed',
        moderation: { by: moderatorId, reason: note, ...(reportId ? { reportId } : {}) },
        updatedAt: serverTimestamp(),
      })
    }
    if (reportId && decision) recordDecision(tx, { reportId, moderatorId, decision })
    return standing ? snap.data() : null
  })

  if (!before) return
  const title = before.title || 'An activity'
  await tell(before.hostId, {
    ...storedText('activityRemoved', { title, reason: note }),
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
          ...storedText('joinedRemoved', { title }),
          activityId,
        }),
      ),
  )
}

/**
 * Every row in `roles` — who holds a rank, and who is suspended.
 *
 * One listener rather than one per question. The collection only has a
 * document for people who have been given a rank or had a suspension placed
 * on them, so it is a handful of rows even on a busy campus, and deriving the
 * three lists the moderation screen needs from one snapshot is cheaper than
 * three queries and keeps them consistent with each other.
 *
 * Readable by moderators because the roles rules allow it — and a *list* is
 * allowed precisely because `isModerator()` does not depend on which document
 * is being read, so it either holds for every row or for none.
 */
export function watchRoles(callback, onError) {
  return onSnapshot(
    collection(db, 'roles'),
    (snap) => callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    onError,
  )
}

/** Lifts a suspension. The rules decide whether this caller may. */
export function liftSuspension(uid) {
  return setSuspended(uid, false)
}

/**
 * Appoints or dismisses a moderator. Admin only — the rules enforce that,
 * this is only the button.
 *
 * Reads the existing row first for the same reason `setSuspended` does: the
 * two fields on a role document mean different things and neither may clobber
 * the other. Appointing somebody who is currently suspended must not quietly
 * lift the suspension, and dismissing a suspended moderator must not quietly
 * lift it either. They are separate decisions and stay separate.
 *
 * Dismissal writes `role: 'user'` rather than deleting the row, even though
 * the rules allow an admin to delete it and a missing row means the same
 * thing. Deleting would take any suspension with it — a dismissal that
 * silently un-suspends somebody is exactly the kind of surprise a moderation
 * tool must not have.
 */
export async function setUserRole(uid, role) {
  const { before } = await patchRole(uid, { role })
  if (before.role === role) return
  await tell(uid, storedText(role === 'moderator' ? 'nowModerator' : 'noLongerModerator'))
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
async function standDownHosted(uid, { moderatorId, reason }) {
  const hosted = await getDocs(query(collection(db, 'activities'), where('hostId', '==', uid)))
  const standing = hosted.docs.filter((d) => d.data().status === 'active')

  // Settled rather than awaited in sequence: one failure must not leave the
  // rest of somebody's activities live after the account behind them is gone.
  const results = await Promise.allSettled(
    standing.map((d) => removeActivity(d.id, { moderatorId, reason })),
  )
  return {
    stoodDown: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  }
}

export async function suspendAccount(uid, { moderatorId, reportId, decision }) {
  // The suspension itself is tied to the claim, and the decision is
  // recorded in the same transaction; the stand-down that follows is a
  // consequence of a suspension that has already landed, and runs whatever
  // happens to the claim afterwards.
  await setSuspended(uid, true, reportId ? { reportId, moderatorId, decision } : undefined)
  return standDownHosted(uid, {
    moderatorId,
    reason: 'The host\u2019s account was suspended',
  })
}

/**
 * Closes an account for good. Admin only — the rules enforce that.
 *
 * The end of the ladder, and the only rung with nothing after it: a warning
 * costs nothing, a takedown costs one activity, a suspension is a limit that
 * can be lifted, and this is the relationship ending. Everything the account
 * is hosting goes with it, for the same reason a suspension stands activities
 * down — the people who signed up to meet them need telling, not a locked
 * door on the night.
 *
 * The reason is written where the person can read it. Being told an account
 * is closed without being told why is the kind of thing that makes people
 * certain they were treated arbitrarily, whether or not they were.
 */
export async function closeAccount(uid, { adminId, reason }) {
  const note = String(reason || '').slice(0, 300)
  const { before } = await patchRole(uid, { banned: true })
  if (before.banned) {
    // Closed already. Still stand down anything left standing — that half
    // may be what failed last time — but say nothing twice.
    return standDownHosted(uid, {
      moderatorId: adminId,
      reason: 'The host\u2019s account was closed',
    })
  }
  // Not "you can no longer sign in" — they can, and they just did, or they
  // would not be reading this. Saying something the person can see is false
  // undermines the sentence next to it, which is the one that matters.
  await tell(uid, storedText('closed', { reason: note }))
  return standDownHosted(uid, {
    moderatorId: adminId,
    reason: 'The host\u2019s account was closed',
  })
}

/** Reopens a closed account. Admin only, because closing one was. */
export async function reopenAccount(uid, { reason }) {
  const { before } = await patchRole(uid, { banned: false })
  if (!before.banned) return
  await tell(uid, storedText('reopened', { reason: String(reason || '').slice(0, 300) }))
}

// -------------------------------------------------------------- warnings ---

/**
 * Everything anybody has been warned about. Moderators read all of it; the
 * rules let each person read their own.
 */
export function watchWarnings(callback, onError) {
  return onSnapshot(
    query(collection(db, 'warnings'), orderBy('createdAt', 'desc'), limit(WARNING_PAGE)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  )
}

/**
 * Your own warnings.
 *
 * Filtered by subject, which is not a convenience — the rules allow a read
 * only where the document is about you, and Firestore refuses an entire query
 * if any document it could return would fail. An unfiltered list is therefore
 * refused for everybody except a moderator, and this filter is what makes the
 * query answerable at all.
 */
export function watchMyWarnings(uid, callback, onError) {
  return onSnapshot(
    query(collection(db, 'warnings'), where('subjectId', '==', uid)),
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)),
      ),
    onError,
  )
}

/**
 * Puts somebody on notice.
 *
 * The rung the system was missing. Before this the choices were to do nothing
 * or to take something away, and a ladder whose first rung is a punishment
 * gets climbed far too readily. A warning costs the person nothing and puts
 * the problem in writing — which is both fairer and, in practice, where most
 * of these end.
 *
 * It is a record, not a message: the rules refuse every edit and every delete,
 * from the moderator who wrote it and from an admin.
 */
export async function issueWarning(uid, { moderatorId, reason, reportId }) {
  const record = {
    subjectId: uid,
    by: moderatorId,
    reason: String(reason || '').slice(0, 500),
    ...(reportId ? { reportId } : {}),
    createdAt: serverTimestamp(),
  }
  if (reportId) {
    // From the queue: written only if the claim is still this moderator's —
    // the rules check that on the warning itself, since it names its
    // report — and the claim is let go in the same step, so the report is
    // open to the next person the moment the warning exists and never sits
    // claimed by a warning that failed.
    await runTransaction(db, async (tx) => {
      await assertClaim(tx, { reportId, moderatorId })
      tx.set(doc(collection(db, 'warnings')), record)
      tx.update(reportDoc(reportId), { claim: deleteField() })
    })
  } else {
    await addDoc(collection(db, 'warnings'), record)
  }
  await tell(uid, storedText('warning', { reason: String(reason || '').slice(0, 220) }))
}

/**
 * Puts a removed activity back. Admin only — the rules enforce that, this is
 * only the button. The reason overwrites the takedown note, so the document
 * carries the second decision and the report carries the first.
 */
export async function restoreActivity(activityId, { adminId, reason }) {
  const ref = doc(db, 'activities', activityId)
  // One transaction, like the removal, and for the same reason: the notice
  // names what was read, so what was read has to be what was written. And
  // nothing to do if it is not removed — a repeat is not a second decision.
  const before = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().status !== 'removed') return null
    tx.update(ref, {
      status: 'active',
      moderation: { by: adminId, reason: String(reason || '').slice(0, 300) },
      updatedAt: serverTimestamp(),
    })
    return snap.data()
  })
  if (before?.hostId) {
    await tell(before.hostId, {
      ...storedText('activityBack', { title: before.title || 'Your activity' }),
      activityId,
    })
  }
}
