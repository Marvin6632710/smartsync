/**
 * One chat message, from a request to a row in a thread — or to a
 * refusal that never reaches anybody else.
 *
 * The order is deliberate, and cheap-and-certain comes before expensive
 * and uncertain: is this person allowed to write here at all, have they
 * already sent this, are they inside their limits, and only then does
 * anything go to OpenAI. Nothing is written to the thread until the
 * moderation verdict is in, which is what "moderate before delivery"
 * means here: there is no moment when an unchecked message exists in a
 * place another person could read, preview, or be notified about.
 *
 * Every outcome is a value. The Function turns only two of them into
 * errors — not signed in, and a request that is not the app's — because
 * everything else is something the screen should explain rather than
 * something that should look like a crash.
 */
import { decide, SEVERE } from './moderation.js'
import { ModerationError } from './openai.js'

export const RETENTION_DAYS = 30
/** New send checks one person may start hourly, and the app may start daily. */
export const DEFAULT_USER_CAP = 60
export const DEFAULT_DAILY_CAP = 5000
const HOUR_MS = 60 * 60_000
/** How much of a message the inbox preview and the notification carry. */
const PREVIEW = 80

const dayOf = (now) => new Date(now).toISOString().slice(0, 10)
const outcome = (status, extra = {}) => ({ status, ...extra })

/**
 * The hour's window for one person, as a value.
 *
 * Shared shape with the AI Picks limiter: a start and a count, a new
 * window when the old one has run out, and no allowance when a start is
 * not a finite number — an absent or corrupt counter must not read as
 * "an hour ago".
 */
export function rateWindow(state, now, { perWindow, windowMs = HOUR_MS }) {
  const start = Number(state?.start)
  const count = Number(state?.count) || 0
  if (!Number.isFinite(start) || now - start >= windowMs) {
    return { allowed: true, next: { start: now, count: 1 } }
  }
  if (count >= perWindow) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) }
  }
  return { allowed: true, next: { start, count: count + 1 } }
}

async function takeTurn({ db, uid, now, caps }) {
  const userRef = db.doc(`chatModeration/${uid}`)
  const dayRef = db.doc(`chatModerationUsage/${dayOf(now)}`)
  return db.runTransaction(async (tx) => {
    const [userSnap, daySnap] = await tx.getAll(userRef, dayRef)
    const day = Number(daySnap.data()?.count) || 0
    if (day >= caps.daily) return { allowed: false, scope: 'day', retryAfterSeconds: 3600 }
    const window = rateWindow(userSnap.data()?.sends, now, { perWindow: caps.user })
    if (!window.allowed) return { allowed: false, scope: 'user', retryAfterSeconds: window.retryAfterSeconds }
    tx.set(userRef, { sends: window.next, uid }, { merge: true })
    tx.set(dayRef, { count: day + 1, updatedAt: now }, { merge: true })
    return { allowed: true }
  })
}

/**
 * Everything the rules would have checked, checked again here — because
 * the rules no longer see this write at all. The Admin SDK bypasses
 * them, so this function *is* the rule for a chat message, and it has to
 * be as strict as the one it replaced: a participant of an activity that
 * exists, inside the retention window, not suspended and not closed.
 */
export async function gate({ db, uid, activityId, now }) {
  const refs = [db.doc(`activities/${activityId}`), db.doc(`roles/${uid}`)]
  const [activitySnap, roleSnap] = await readAll(db, refs)
  return gateSnapshots({ activitySnap, roleSnap, uid, now })
}

/** One server RPC when the Admin SDK supports it; small fakes can fall back. */
async function readAll(db, refs) {
  if (typeof db.getAll === 'function') return db.getAll(...refs)
  return Promise.all(refs.map((ref) => ref.get()))
}

/** The gate itself, shared by the public helper and the send preflight. */
function gateSnapshots({ activitySnap, roleSnap, uid, now }) {
  if (!activitySnap.exists) return { ok: false, status: 'not-found' }
  const activity = activitySnap.data() || {}
  const role = roleSnap.data() || {}
  if (role.suspended === true || role.banned === true) return { ok: false, status: 'not-allowed' }
  const participants = Array.isArray(activity.participantUids) ? activity.participantUids : []
  if (!participants.includes(uid)) return { ok: false, status: 'not-allowed' }
  const startsAt = activity.startsAt?.toMillis?.() ?? Number(activity.startsAt)
  if (Number.isFinite(startsAt) && now - startsAt > RETENTION_DAYS * 24 * HOUR_MS) {
    return { ok: false, status: 'closed' }
  }
  return { ok: true, activity, participants }
}

/**
 * Checks the independent parts of a message together, then checks any words
 * transcribed from its picture. Results stay in policy order — typed text,
 * picture, picture text — no matter which first-stage request answers first.
 *
 * The picture is checked twice over: once as a picture, and once as
 * whatever words are readable in it. That second pass is what catches a
 * screenshot of abuse, since the API applies `hate`, `harassment` and
 * `illicit` to text only.
 */
export async function checkParts({ openai, text, image, ocr, log }) {
  // The independent first-stage checks start together. A picture's
  // transcription still needs one second stage when it found words, but it
  // no longer sits behind the typed-text and image moderation calls.
  const readImageText = async () => {
    try {
      return await openai.readImageText({ imageDataUrl: image.dataUrl })
    } catch (error) {
      // Transcription is the one step allowed to fail without holding
      // the message: the picture itself has already been moderated,
      // and a vision outage must not stop a photo of a football pitch.
      // Said out loud in the log, because it is a gap in coverage
      // while it lasts.
      log?.warn?.('chat image text unread', {
        kind: error?.kind || 'unavailable',
        detail: String(error?.message || error).slice(0, 200),
      })
      return ''
    }
  }
  const readablePromise = image && ocr ? readImageText() : Promise.resolve('')

  const [textResult, imageResult, readable] = await Promise.all([
    text ? openai.moderate({ text }) : Promise.resolve(null),
    image ? openai.moderate({ imageDataUrl: image.dataUrl }) : Promise.resolve(null),
    readablePromise,
  ])

  // Fixed insertion order keeps the same first-refusal and source semantics
  // regardless of which concurrent request happened to answer first.
  const results = []
  if (text) results.push({ source: 'text', result: textResult })
  if (image) results.push({ source: 'image', result: imageResult })
  if (readable) {
    results.push({ source: 'image-text', result: await openai.moderate({ text: readable }) })
  }
  return results
}

/**
 * The whole path. `openai` is the adapter, injected so the tests can
 * hand it a stand-in and the emulator can point it at a local server.
 */
export async function sendChatMessage({
  db,
  FieldValue,
  uid,
  request,
  openai,
  now = Date.now(),
  caps = {},
  policy = {},
  log = console,
}) {
  const limits = { user: caps.user ?? DEFAULT_USER_CAP, daily: caps.daily ?? DEFAULT_DAILY_CAP }
  const { activityId, clientMsgId, text, image } = request
  const messageRef = db.doc(`activities/${activityId}/messages/${clientMsgId}`)

  // One read round for the whole preflight. The message stays first in the
  // decision order: a retry after a timeout confirms the original delivery
  // even if the activity or account changed after it landed, and it consumes
  // no second rate-limit turn.
  const activityRef = db.doc(`activities/${activityId}`)
  const roleRef = db.doc(`roles/${uid}`)
  const userRef = db.doc(`users/${uid}`)
  const [existing, activitySnap, roleSnap, userSnap] = await readAll(db, [
    messageRef,
    activityRef,
    roleRef,
    userRef,
  ])
  if (existing.exists) return outcome('sent', { id: clientMsgId, duplicate: true })

  const allowed = gateSnapshots({ activitySnap, roleSnap, uid, now })
  if (!allowed.ok) return outcome(allowed.status)

  const user = userSnap.data() || {}
  const sender = {
    name: String(user.name || 'SmartSync user').slice(0, 60),
    avatar: String(user.avatar || '').slice(0, 8),
    activityTitle: String(allowed.activity.title || '').slice(0, 120),
  }

  if (!openai) return outcome('unavailable', { reason: 'not-configured' })

  const turn = await takeTurn({ db, uid, now, caps: limits })
  if (!turn.allowed) {
    log.info?.('chat moderation rate-limited', { uid, scope: turn.scope })
    return outcome('rate-limited', { retryAfterSeconds: turn.retryAfterSeconds })
  }

  let results
  try {
    results = await checkParts({ openai, text, image, ocr: policy.ocr !== false, log })
  } catch (error) {
    const kind = error instanceof ModerationError ? error.kind : 'unavailable'
    log.warn?.('chat moderation call failed', {
      uid,
      kind,
      status: error?.status ?? null,
      detail: String(error?.message || error).slice(0, 300),
    })
    // Nothing is written. The message stays with the person who wrote it.
    return outcome('unavailable', { reason: kind })
  }

  const verdict = decide({
    results,
    text,
    profanity: policy.profanity || 'allow',
    words: policy.words || [],
  })

  if (!verdict.allowed) {
    log.info?.('chat message blocked', {
      uid,
      activityId,
      reason: verdict.reason,
      source: verdict.source,
      hasImage: Boolean(image),
    })
    await recordBlock({
      db,
      FieldValue,
      uid,
      sender,
      activityId,
      clientMsgId,
      text,
      image,
      verdict,
      now,
    })
    return outcome('blocked', {
      reason: verdict.reason,
      source: verdict.source,
      severe: verdict.severe,
    })
  }

  // Approved — and only now does anything become readable by anybody
  // else. One batch, so a message and its picture arrive together and a
  // half-written thread cannot exist.
  const batch = db.batch()
  batch.set(messageRef, {
    senderId: uid,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    text,
    hasImage: Boolean(image),
    createdAt: FieldValue.serverTimestamp(),
    moderatedAt: now,
  })
  if (image) {
    batch.set(db.doc(`chatPictures/${clientMsgId}`), {
      activityId,
      senderId: uid,
      dataUrl: image.dataUrl,
      createdAt: now,
    })
  }
  for (const participantId of allowed.participants) {
    if (!participantId || participantId === uid) continue
    // The same ten-minute bucket the client used to write, now written
    // here: a notification for an unapproved message is exactly what
    // "must not appear in notifications or unread counts" forbids, and
    // the only way to promise that is for the same code that approves a
    // message to be the code that announces it.
    const bucket = Math.floor(now / (10 * 60_000))
    batch.set(
      db.doc(`users/${participantId}/notifications/chat-${activityId}-${bucket}`),
      {
        type: 'chat',
        kind: 'newMessage',
        params: {
          title: sender.activityTitle || '',
          name: sender.name,
          text: (text || sender.pictureWord || '').slice(0, PREVIEW),
        },
        title: sender.activityTitle || '',
        body: (text || '').slice(0, PREVIEW),
        activityId,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }
  await batch.commit()
  log.info?.('chat message sent', { uid, activityId, hasImage: Boolean(image) })
  return outcome('sent', { id: clientMsgId })
}

/**
 * What is kept when a message is refused.
 *
 * Enough for a person to ask a human to look again, and no more: the
 * content, who wrote it, where, and what the decision was — in a place
 * only admins can read, never in the thread.
 *
 * With one exception, and it is not a small one. When the category is
 * sexual content involving minors, nothing is kept at all: no text, no
 * picture, no appeal to open. The provider is explicit that its API is
 * not a detector for that material and must not be sent it, so a flag
 * from it is a reason to get a human involved immediately and to hold no
 * copy — not a reason for this code to file evidence. What the record
 * carries then is that it happened, to whom, and when (README §11 has
 * what the operator must do next).
 */
async function recordBlock({ db, FieldValue, uid, sender, activityId, clientMsgId, text, image, verdict, now }) {
  const ref = db.doc(`moderationBlocks/${clientMsgId}`)
  const base = {
    uid,
    senderName: sender.name || '',
    activityId,
    reason: verdict.reason,
    source: verdict.source,
    categories: verdict.categories.map((entry) => entry.name),
    severe: verdict.severe,
    status: verdict.severe ? 'severe' : 'blocked',
    createdAt: FieldValue.serverTimestamp(),
    blockedAt: now,
  }
  if (verdict.severe) {
    await ref.set({ ...base, contentHeld: false })
    return
  }
  await ref.set({
    ...base,
    contentHeld: true,
    text,
    hasImage: Boolean(image),
    ...(image ? { dataUrl: image.dataUrl } : {}),
  })
}

/**
 * An admin's answer to an appeal. Upholding it closes the record;
 * overturning it posts the message the person actually wrote, from the
 * held copy — so an apology for a false positive is the message itself
 * appearing, not a note asking them to type it again.
 */
export async function resolveBlock({ db, FieldValue, adminId, blockId, decision, now = Date.now() }) {
  const ref = db.doc(`moderationBlocks/${blockId}`)
  const snap = await ref.get()
  if (!snap.exists) return outcome('not-found')
  const row = snap.data() || {}
  if (row.status === 'overturned' || row.status === 'upheld') return outcome('already-resolved')
  if (decision !== 'overturn') {
    await ref.set({ status: 'upheld', reviewedBy: adminId, reviewedAt: now }, { merge: true })
    return outcome('upheld')
  }
  if (row.severe || row.contentHeld !== true) return outcome('no-content')
  const gateResult = await gate({ db, uid: row.uid, activityId: row.activityId, now })
  if (!gateResult.ok) return outcome(gateResult.status)
  const batch = db.batch()
  batch.set(db.doc(`activities/${row.activityId}/messages/${blockId}`), {
    senderId: row.uid,
    senderName: row.senderName,
    senderAvatar: '',
    text: row.text || '',
    hasImage: row.hasImage === true,
    createdAt: FieldValue.serverTimestamp(),
    moderatedAt: now,
    releasedBy: adminId,
  })
  if (row.hasImage === true && row.dataUrl) {
    batch.set(db.doc(`chatPictures/${blockId}`), {
      activityId: row.activityId,
      senderId: row.uid,
      dataUrl: row.dataUrl,
      createdAt: now,
    })
  }
  // The held copy goes the moment it is no longer needed: the message is
  // in the thread now, and a second copy in an admin-only collection is
  // just a place for it to leak from.
  batch.set(
    ref,
    {
      status: 'overturned',
      reviewedBy: adminId,
      reviewedAt: now,
      contentHeld: false,
      text: FieldValue.delete(),
      dataUrl: FieldValue.delete(),
    },
    { merge: true },
  )
  await batch.commit()
  return outcome('overturned')
}

export { SEVERE }
