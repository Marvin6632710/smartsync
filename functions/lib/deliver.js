/**
 * From an inbox record to a push on every device the recipient has.
 *
 * The record is the truth; this is a courtesy copy of it, sent once. Once
 * is the hard part: Firestore delivers a trigger at least once, so the
 * first thing done is a claim — a transaction that writes `delivery.push`
 * onto the record and refuses to run twice. Everything after the claim is
 * best-effort, and what happened is written back onto the record so a
 * person's inbox can say whether their phone was told.
 */
import { categoryEnabled, decidePush, HOURLY_BUDGET } from './policy.js'
import { renderPush } from './render.js'
import { DEAD_TOKEN_CODES } from './transport.js'

const MAX_FAILURES = 3
const MAX_TOKENS = 500 // FCM's ceiling for one multicast

export async function deliverPush({
  db,
  FieldValue,
  transport,
  uid,
  id,
  record,
  eventId,
  origin,
  now = Date.now(),
  log = console,
}) {
  const ref = db.doc(`users/${uid}/notifications/${id}`)
  const stamp = (push) =>
    ref.update({ 'delivery.push': { ...push, at: FieldValue.serverTimestamp() } })

  const plan = decidePush(record, id)
  if (!plan) {
    await stamp({ state: 'skipped', reason: 'policy' })
    return { state: 'skipped', reason: 'policy' }
  }

  // The claim. A second delivery of the same event, or a retry, finds the
  // field already there and stops.
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref)
    if (!fresh.exists || fresh.data()?.delivery?.push) return false
    tx.update(ref, {
      'delivery.push': { state: 'sending', eventId, at: FieldValue.serverTimestamp() },
    })
    return true
  })
  if (!claimed) return { state: 'duplicate' }

  const profile = (await db.doc(`users/${uid}/private/profile`).get()).data() || {}
  const prefs = profile.notifications || {}
  if (!categoryEnabled(plan.category, prefs)) {
    await stamp({ state: 'skipped', reason: 'preference', category: plan.category })
    return { state: 'skipped', reason: 'preference' }
  }

  if (!plan.mandatory && !(await withinBudget(db, uid, now))) {
    await stamp({ state: 'skipped', reason: 'budget', category: plan.category })
    return { state: 'skipped', reason: 'budget' }
  }

  const tokenSnap = await db.collection(`users/${uid}/pushTokens`).limit(MAX_TOKENS).get()
  if (tokenSnap.empty) {
    await stamp({ state: 'skipped', reason: 'no-tokens', category: plan.category })
    return { state: 'skipped', reason: 'no-tokens' }
  }

  // The recipient's own language first; a device's language only for a
  // profile that never said (older accounts); English last.
  const language =
    profile.language || tokenSnap.docs.map((d) => d.data().language).find(Boolean) || 'en'
  const text = renderPush({
    kind: record.kind,
    params: record.params || {},
    language,
    chatPreview: prefs.chatPreview === true,
  })
  if (!text) {
    await stamp({ state: 'skipped', reason: 'unknown-kind' })
    return { state: 'skipped', reason: 'unknown-kind' }
  }

  const url = `/n/${id}`
  const message = {
    // Data only, every value a string: the service worker decides how (and
    // whether) to show it, so the browser never draws one of its own on top.
    data: {
      id,
      uid,
      kind: String(record.kind),
      activityId: String(record.activityId || ''),
      tag: plan.tag,
      title: text.title,
      body: text.body,
      lang: text.language,
      url,
    },
    webpush: {
      headers: { TTL: String(plan.ttl), Urgency: plan.urgency },
      ...(origin ? { fcmOptions: { link: `${origin}${url}` } } : {}),
    },
  }

  const docs = tokenSnap.docs
  const results = await transport.send(
    docs.map((d) => d.data().token),
    message,
  )

  let sent = 0
  let removed = 0
  const batch = db.batch()
  results.forEach((result, index) => {
    const tokenDoc = docs[index]
    const failures = tokenDoc.data().failures || 0
    if (result.ok) {
      sent += 1
      if (failures > 0) batch.update(tokenDoc.ref, { failures: 0 })
      return
    }
    if (DEAD_TOKEN_CODES.has(result.code) || failures + 1 >= MAX_FAILURES) {
      removed += 1
      batch.delete(tokenDoc.ref)
    } else {
      batch.update(tokenDoc.ref, { failures: failures + 1, lastError: result.code || 'unknown' })
    }
  })
  await batch.commit()

  const outcome = {
    state: sent > 0 ? 'sent' : 'failed',
    eventId,
    category: plan.category,
    transport: transport.name,
    lang: text.language,
    sent,
    failed: results.length - sent,
    removed,
  }
  await stamp(outcome)
  log.info?.('push delivered', { uid, id, ...outcome })
  return outcome
}

/**
 * One counter per person per hour. Over the budget, the record still lands
 * in the inbox; the phone is simply not buzzed a thirty-first time.
 */
async function withinBudget(db, uid, now) {
  const ref = db.doc(`users/${uid}/private/pushMeter`)
  const hour = Math.floor(now / 3_600_000)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.exists ? snap.data() : {}
    const count = data.hour === hour ? data.count || 0 : 0
    if (count >= HOURLY_BUDGET) return false
    tx.set(ref, { hour, count: count + 1 })
    return true
  })
}
