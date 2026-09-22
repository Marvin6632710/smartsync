import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

import { auth, db } from './config'
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
 * Changes one field of a role row without losing the other.
 *
 * A row carries two independent decisions — suspension and closure — taken
 * at different times, and each writer has to preserve the one it is not
 * changing. Doing that with a read followed by a write loses updates
 * whenever two admins act at once: suspend somebody while a colleague is
 * reopening them, and the reopening writes back the `suspended: false` it
 * read a moment earlier, quietly lifting the suspension. Nothing in the
 * rules can catch that — both writes are individually legitimate.
 *
 * A transaction re-runs if the document changed underneath it, so the
 * surviving row always reflects both decisions. Notifications stay outside,
 * because a transaction may run its body more than once and nobody should be
 * told twice.
 *
 * Returns the row as it was and as it is, so a caller can tell whether the
 * change was a change. Every notice below is sent only when it was: an
 * admin whose first attempt half-succeeded — the row written, the report's
 * resolution refused — presses the button again, and the person must not be
 * told twice that the same thing happened to them.
 */
async function patchRole(uid, change, claim, meta = {}) {
  const ref = doc(db, 'roles', uid)
  return runTransaction(db, async (tx) => {
    // Read before any write, as a transaction requires — and read in the
    // same transaction, so the role row is committed only if the claim was
    // still this admin's at commit time.
    if (claim) await assertClaim(tx, claim)
    const snap = await tx.get(ref)
    const existing = snap.data() || {}
    const before = {
      suspended: existing.suspended === true,
      banned: existing.banned === true,
    }
    // The only role the app ever writes. Nobody acts on an admin from inside
    // the app — the rules refuse the write — and there is no other rank, so
    // a row that still says `moderator` from before that rank was retired
    // is brought into line by the first decision taken on it.
    const next = {
      role: 'user',
      suspended: before.suspended,
      ...(before.banned ? { banned: true } : {}),
      ...change,
    }
    tx.set(ref, next, { merge: true })
    // The decision lands with the row or not at all — see recordDecision.
    if (claim?.decision) recordDecision(tx, claim)
    // And the record of who changed what, in the same step — only when the
    // change was a change. A repeat is not a second decision.
    const kind = roleChangeKind(before, change)
    if (kind) {
      recordAction(tx, {
        kind,
        by: meta.by || claim?.adminId,
        subjectId: uid,
        reportId: claim?.reportId,
        reason: meta.reason,
      })
    }
    return { before, after: { ...before, ...change } }
  })
}

/**
 * Which of the four account decisions a role patch is, or null when it
 * changes nothing. Each patch carries exactly one field, so the one that
 * differs from the row is the decision.
 */
function roleChangeKind(before, change) {
  if ('suspended' in change && change.suspended !== before.suspended) {
    return change.suspended ? 'suspend' : 'lift'
  }
  if ('banned' in change && change.banned !== before.banned) {
    return change.banned ? 'close' : 'reopen'
  }
  return null
}

export async function setSuspended(uid, suspended, claim, meta) {
  const { before } = await patchRole(uid, { suspended }, claim, meta)
  if (before.suspended === suspended) return
  // Every notice below is stored in English, the language notifications are
  // written in, and worded for its reader on their own screen — see
  // i18n/notificationText, which is where these templates live.
  await tell(uid, storedText(suspended ? 'suspended' : 'activeAgain'))
}

// -------------------------------------------------------------- reports ----

/**
 * How long an admin's claim on a report stays theirs.
 *
 * Mirrored in firestore.rules, which is where it is enforced. An admin
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
 * under is no longer this admin's — taken over after it went stale, or
 * the report was closed — so the action was aborted before it changed
 * anything.
 */
export class ModerationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ModerationError'
    this.code = code
    // Who closed it, for `already-handled`: an admin whose own decision
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
 * Takes the report for this admin, or says why not.
 *
 * Working a report is three writes in order — claim, act, record — and this
 * is the first. Two admins used to be able to act on the same report at
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
export async function claimReport(reportId, adminId) {
  const ref = reportDoc(reportId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().status !== 'open') {
      throw new ModerationError('already-handled', 'This report is no longer open.', {
        reviewedBy: snap.exists() ? snap.data().reviewedBy || null : null,
      })
    }
    const claim = snap.data().claim
    if (claim && claim.by !== adminId && claimFresh(claim)) {
      throw new ModerationError('claim-held', 'Another admin is working on this report.')
    }
    tx.update(ref, { claim: { by: adminId, at: serverTimestamp() } })
  })
}

/**
 * Lets the next person in after an action that did not finish.
 *
 * Best-effort: the claim expires on its own, so a release that fails costs
 * a colleague a few minutes and nothing else. Only ever removes this
 * admin's own claim — the rules refuse anything else.
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
 * it is no longer this admin's.
 *
 * Because the read is part of the transaction, the write it guards commits
 * only if the report was unchanged since — Firestore retries the body when
 * the report moves underneath it, and the re-run sees the new claim. That
 * is what makes "the claim is still valid" true at commit time rather than
 * merely at the moment of asking.
 */
async function assertClaim(tx, { reportId, adminId }) {
  const snap = await tx.get(reportDoc(reportId))
  const data = snap.exists() ? snap.data() : null
  if (!data || data.status !== 'open') {
    throw new ModerationError('claim-lost', 'This report was closed before the action landed.', {
      reviewedBy: data?.reviewedBy || null,
    })
  }
  if (data.claim?.by !== adminId) {
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
function recordDecision(tx, { reportId, adminId, decision }) {
  tx.update(reportDoc(reportId), {
    status: decision.status,
    outcome: String(decision.outcome || '').slice(0, 300),
    reviewedBy: adminId,
    reviewedAt: serverTimestamp(),
  })
}

/**
 * Writes the record of an action into the same transaction as the action.
 *
 * The state documents say what is true — a role row says suspended, an
 * activity says removed — and nothing said who made it so, when, or why: a
 * role row is three fields on purpose, and a restore overwrites the
 * takedown it undoes. `moderationLog` holds the decisions in order, and the
 * rules make each entry worth reading: it names its writer as the caller,
 * it is stamped by the server, and it can only claim a state the subject is
 * actually in once the batch lands (see the rules for `getAfter`). Written
 * in the transaction so the action and its record land together or not at
 * all.
 *
 * The writer is whoever the caller says acted, else whoever is signed in
 * on this client — the only value the rules will accept anyway. With
 * neither known there is nothing to attribute, and nothing is written.
 */
export const LOG_KINDS = ['suspend', 'lift', 'close', 'reopen', 'remove', 'restore']

function recordAction(tx, { kind, by, subjectId, activityId, reportId, reason }) {
  const actor = by || auth?.currentUser?.uid
  if (!actor || !subjectId) return
  tx.set(doc(collection(db, 'moderationLog')), {
    kind,
    by: actor,
    subjectId,
    ...(activityId ? { activityId } : {}),
    ...(reportId ? { reportId } : {}),
    reason: String(reason || '').slice(0, 500),
    at: serverTimestamp(),
  })
}

// How many open reports the queue loads at once. Exported because the screen
// has to be able to say when it is showing a capped view: an admin who
// cannot see that older reports exist has no way to know the oldest — the
// ones that have waited longest — are the ones being hidden.
export const REPORT_PAGE = 100
export const WARNING_PAGE = 200

/** How many refused messages the appeals queue carries. */
export const BLOCKS_PAGE = 100

/**
 * Chat messages the moderator refused, newest first — the appeals queue.
 *
 * Read-only for everybody, admins included: the decision was made by the
 * Cloud Function and only that Function may write here (see
 * firestore.rules). An admin's answer goes back through a callable, not
 * through this listener's collection.
 */
export function watchModerationBlocks(callback, onError) {
  return onSnapshot(
    query(collection(db, 'moderationBlocks'), orderBy('createdAt', 'desc'), limit(BLOCKS_PAGE)),
    (snap) =>
      callback(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toMillis?.() ?? data.blockedAt ?? Date.now(),
          }
        }),
      ),
    onError,
  )
}

/** The queue an admin works from: everything still open, newest first. */
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
export function claimedByOther(row, adminId, now = Date.now()) {
  if (!row?.claimedBy || row.claimedBy === adminId) return false
  return now - (row.claimedAt ?? now) < CLAIM_TTL_MS
}

/**
 * Records what an admin decided.
 *
 * Only the decision is writable — the rules refuse any change to the reason,
 * the description or the reporter. A record a reviewer can rewrite is not a
 * record.
 */
export function resolveReport(reportId, { status, outcome, adminId }) {
  return updateDoc(doc(db, 'reports', reportId), {
    status,
    outcome: String(outcome || '').slice(0, 300),
    reviewedBy: adminId,
    reviewedAt: serverTimestamp(),
  })
}

/**
 * Tells somebody an admin acted on them.
 *
 * Best-effort by design. The rules refuse a notification to anyone who has
 * switched notifications off, and a refused courtesy must not look like a
 * failed decision — the removal or the suspension has already happened and is
 * not being rolled back because we could not announce it.
 */
async function tell(uid, { title, body, activityId, kind, params }) {
  if (!uid) return
  try {
    await addDoc(collection(db, 'users', uid, 'notifications'), {
      type: 'moderation',
      title,
      body: body.slice(0, 300),
      // What it was worded from, for the reader's language and the push.
      ...(kind ? { kind, params: params || {} } : {}),
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
export async function removeActivity(activityId, { adminId, reason, reportId, decision }) {
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
    if (reportId) await assertClaim(tx, { reportId, adminId })
    const snap = await tx.get(ref)
    const standing = snap.exists() && snap.data().status !== 'removed'
    if (standing) {
      tx.update(ref, {
        status: 'removed',
        moderation: { by: adminId, reason: note, ...(reportId ? { reportId } : {}) },
        updatedAt: serverTimestamp(),
      })
      recordAction(tx, {
        kind: 'remove',
        by: adminId,
        subjectId: snap.data().hostId,
        activityId,
        reportId,
        reason: note,
      })
    }
    if (reportId && decision) recordDecision(tx, { reportId, adminId, decision })
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
  // not whoever just pressed the button — an admin who happens to be on
  // the roster does not need telling what they themselves did.
  await Promise.allSettled(
    (before.participantUids || [])
      .filter((memberId) => memberId !== before.hostId && memberId !== adminId)
      .map((memberId) =>
        tell(memberId, {
          ...storedText('joinedRemoved', { title }),
          activityId,
        }),
      ),
  )
}

/**
 * Every row in `roles` — who is an admin, who is suspended, who is closed.
 *
 * One listener rather than one per question. The collection only has a
 * document for people who hold the rank or have had a limit placed on them,
 * so it is a handful of rows even on a busy campus, and deriving the lists
 * the console needs from one snapshot is cheaper than three queries and
 * keeps them consistent with each other.
 *
 * Readable by an admin because the roles rules allow it — and a *list* is
 * allowed precisely because `isAdmin()` does not depend on which document
 * is being read, so it either holds for every row or for none.
 */
export function watchRoles(callback, onError) {
  return onSnapshot(
    collection(db, 'roles'),
    (snap) => callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    onError,
  )
}

/**
 * Lifts a suspension. The rules decide whether this caller may; the log
 * records who did and why.
 */
export function liftSuspension(uid, { adminId, reason } = {}) {
  return setSuspended(uid, false, undefined, { by: adminId, reason })
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
 * roles are readable only by their owner and by an admin, so discovery
 * genuinely cannot tell that a host is suspended.
 *
 * Each takedown records the real reason and notifies whoever had joined, so
 * nobody turns up to something that is not happening. Lifting the suspension
 * does not bring them back — an admin restores them one at a time, which is
 * the same review any other reversal gets.
 */
async function standDownHosted(uid, { adminId, reason }) {
  const hosted = await getDocs(query(collection(db, 'activities'), where('hostId', '==', uid)))
  const standing = hosted.docs.filter((d) => d.data().status === 'active')

  // Settled rather than awaited in sequence: one failure must not leave the
  // rest of somebody's activities live after the account behind them is gone.
  const results = await Promise.allSettled(
    standing.map((d) => removeActivity(d.id, { adminId, reason })),
  )
  return {
    stoodDown: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  }
}

export async function suspendAccount(uid, { adminId, reportId, decision, reason }) {
  // The suspension itself is tied to the claim, and the decision is
  // recorded in the same transaction; the stand-down that follows is a
  // consequence of a suspension that has already landed, and runs whatever
  // happens to the claim afterwards.
  await setSuspended(uid, true, reportId ? { reportId, adminId, decision } : undefined, {
    by: adminId,
    reason,
  })
  return standDownHosted(uid, {
    adminId,
    reason: 'The host\u2019s account was suspended',
  })
}

/**
 * Closes an account for good.
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
  const { before } = await patchRole(uid, { banned: true }, undefined, {
    by: adminId,
    reason: note,
  })
  if (before.banned) {
    // Closed already. Still stand down anything left standing — that half
    // may be what failed last time — but say nothing twice.
    return standDownHosted(uid, {
      adminId,
      reason: 'The host\u2019s account was closed',
    })
  }
  // Not "you can no longer sign in" — they can, and they just did, or they
  // would not be reading this. Saying something the person can see is false
  // undermines the sentence next to it, which is the one that matters.
  await tell(uid, storedText('closed', { reason: note }))
  return standDownHosted(uid, {
    adminId,
    reason: 'The host\u2019s account was closed',
  })
}

/** Reopens a closed account. */
export async function reopenAccount(uid, { adminId, reason }) {
  const { before } = await patchRole(uid, { banned: false }, undefined, {
    by: adminId,
    reason: String(reason || '').slice(0, 300),
  })
  if (!before.banned) return
  await tell(uid, storedText('reopened', { reason: String(reason || '').slice(0, 300) }))
}

// -------------------------------------------------------------- warnings ---

/**
 * Everything anybody has been warned about. An admin reads all of it; the
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
 * refused for everybody except an admin, and this filter is what makes the
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
 * from the admin who wrote it and from every other.
 */
export async function issueWarning(uid, { adminId, reason, reportId }) {
  const record = {
    subjectId: uid,
    by: adminId,
    reason: String(reason || '').slice(0, 500),
    ...(reportId ? { reportId } : {}),
    createdAt: serverTimestamp(),
  }
  if (reportId) {
    // From the queue: written only if the claim is still this admin's —
    // the rules check that on the warning itself, since it names its
    // report — and the claim is let go in the same step, so the report is
    // open to the next person the moment the warning exists and never sits
    // claimed by a warning that failed.
    await runTransaction(db, async (tx) => {
      await assertClaim(tx, { reportId, adminId })
      tx.set(doc(collection(db, 'warnings')), record)
      tx.update(reportDoc(reportId), { claim: deleteField() })
    })
  } else {
    await addDoc(collection(db, 'warnings'), record)
  }
  await tell(uid, storedText('warning', { reason: String(reason || '').slice(0, 220) }))
}

/**
 * Puts a removed activity back. The reason overwrites the takedown note, so
 * the document carries the second decision and the report carries the first.
 */
export async function restoreActivity(activityId, { adminId, reason }) {
  const ref = doc(db, 'activities', activityId)
  // One transaction, like the removal, and for the same reason: the notice
  // names what was read, so what was read has to be what was written. And
  // nothing to do if it is not removed — a repeat is not a second decision.
  const before = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().status !== 'removed') return null
    const note = String(reason || '').slice(0, 300)
    tx.update(ref, {
      status: 'active',
      moderation: { by: adminId, reason: note },
      updatedAt: serverTimestamp(),
    })
    // The activity now carries the second decision; the log keeps the
    // first — the takedown — as well, which is the point of having one.
    recordAction(tx, {
      kind: 'restore',
      by: adminId,
      subjectId: snap.data().hostId,
      activityId,
      reason: note,
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

// ------------------------------------------------------ history and counts

/** How many closed reports and log entries the console loads at once. */
export const RESOLVED_PAGE = 200
export const LOG_PAGE = 300

const ms = (value) => value?.toMillis?.() ?? null

/** A report row as the console reads it: timestamps in milliseconds, the claim flattened. */
function reportRow(d) {
  const data = d.data()
  return {
    id: d.id,
    ...data,
    createdAt: ms(data.createdAt) ?? Date.now(),
    reviewedAt: ms(data.reviewedAt),
    claimedBy: data.claim?.by ?? null,
    claimedAt: ms(data.claim?.at) ?? (data.claim ? Date.now() : null),
  }
}

const warningRow = (d) => ({ id: d.id, ...d.data(), createdAt: ms(d.data().createdAt) })
const logRow = (d) => ({ id: d.id, ...d.data(), at: ms(d.data().at) })

/**
 * The reports that have been decided, most recently decided first. What
 * the queue is for is the open ones; this is what an admin looks at to see
 * what was decided, and by whom. Bounded like the queue.
 */
export function watchResolvedReports(callback, onError) {
  return onSnapshot(
    query(
      collection(db, 'reports'),
      where('status', 'in', ['actioned', 'dismissed']),
      orderBy('reviewedAt', 'desc'),
      limit(RESOLVED_PAGE),
    ),
    (snap) => callback(snap.docs.map(reportRow)),
    onError,
  )
}

/** The log, newest first. */
export function watchModerationLog(callback, onError) {
  return onSnapshot(
    query(collection(db, 'moderationLog'), orderBy('at', 'desc'), limit(LOG_PAGE)),
    (snap) => callback(snap.docs.map(logRow)),
    onError,
  )
}

/** One report, for a link to one that is no longer in either page. */
export async function fetchReport(reportId) {
  const snap = await getDoc(doc(db, 'reports', reportId))
  return snap.exists() ? reportRow(snap) : null
}

const newestFirst = (field) => (a, b) => (b[field] || 0) - (a[field] || 0)

/**
 * Everything on record about one account: what was done to them, the
 * warnings they were given, the reports about them and the reports they
 * filed. Asked for by subject, which is what the rules allow a query to be
 * filtered by without an index, and complete rather than a page — the
 * console shows a person's whole record, not the recent end of it.
 */
export async function fetchAccountHistory(uid) {
  const [log, warnings, about, filed] = await Promise.all([
    getDocs(query(collection(db, 'moderationLog'), where('subjectId', '==', uid), limit(200))),
    getDocs(query(collection(db, 'warnings'), where('subjectId', '==', uid), limit(200))),
    getDocs(query(collection(db, 'reports'), where('subjectId', '==', uid), limit(200))),
    getDocs(query(collection(db, 'reports'), where('reporterId', '==', uid), limit(200))),
  ])
  return {
    log: log.docs.map(logRow).sort(newestFirst('at')),
    warnings: warnings.docs.map(warningRow).sort(newestFirst('createdAt')),
    reportsAbout: about.docs.map(reportRow).sort(newestFirst('createdAt')),
    reportsFiled: filed.docs.map(reportRow).sort(newestFirst('createdAt')),
  }
}

/** Everything on record about one activity: its takedowns and restores, and the reports that named it. */
export async function fetchActivityHistory(activityId) {
  const [log, direct, viaMessage] = await Promise.all([
    getDocs(
      query(collection(db, 'moderationLog'), where('activityId', '==', activityId), limit(100)),
    ),
    getDocs(query(collection(db, 'reports'), where('targetId', '==', activityId), limit(100))),
    getDocs(query(collection(db, 'reports'), where('activityId', '==', activityId), limit(100))),
  ])
  const reports = new Map()
  for (const d of [...direct.docs, ...viaMessage.docs]) reports.set(d.id, reportRow(d))
  return {
    log: log.docs.map(logRow).sort(newestFirst('at')),
    reports: [...reports.values()].sort(newestFirst('createdAt')),
  }
}

/**
 * Whole-collection figures for the admin overview, counted on the server.
 *
 * The console otherwise sees windows — the first five hundred accounts,
 * the four hundred soonest activities — and a total read off a window is
 * not a total. An aggregation counts the index without downloading the
 * documents, under the same rules as the query it counts. Each figure is
 * settled on its own: one that could not be counted is null and shown as
 * unknown, not as zero.
 */
export async function fetchCounts(now = Date.now()) {
  const users = collection(db, 'users')
  const activities = collection(db, 'activities')
  const reports = collection(db, 'reports')
  const count = async (q) => {
    try {
      return (await getCountFromServer(q)).data().count
    } catch (error) {
      reportError('moderation.count', error)
      return null
    }
  }
  const [
    accounts,
    activitiesTotal,
    activitiesActive,
    activitiesUpcoming,
    activitiesRemoved,
    activitiesCancelled,
    reportsOpen,
    reportsActioned,
    reportsDismissed,
    warnings,
    logEntries,
  ] = await Promise.all([
    count(users),
    count(activities),
    count(query(activities, where('status', '==', 'active'))),
    count(
      query(
        activities,
        where('status', '==', 'active'),
        where('startsAt', '>=', Timestamp.fromMillis(now)),
      ),
    ),
    count(query(activities, where('status', '==', 'removed'))),
    count(query(activities, where('status', '==', 'cancelled'))),
    count(query(reports, where('status', '==', 'open'))),
    count(query(reports, where('status', '==', 'actioned'))),
    count(query(reports, where('status', '==', 'dismissed'))),
    count(collection(db, 'warnings')),
    count(collection(db, 'moderationLog')),
  ])
  return {
    accounts,
    activitiesTotal,
    activitiesActive,
    activitiesUpcoming,
    activitiesRemoved,
    activitiesCancelled,
    reportsOpen,
    reportsActioned,
    reportsDismissed,
    warnings,
    logEntries,
    countedAt: now,
  }
}
