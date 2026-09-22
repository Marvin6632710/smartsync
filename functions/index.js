/**
 * SmartSync's server side: small, and only where the browser cannot go.
 *
 * Two things live here. A browser cannot send a push to another browser —
 * the Web Push protocol wants a private key that must never ship in client
 * code — so this is the trusted sender: it listens for a notification
 * landing in somebody's inbox and, for the kinds that matter when the app
 * is closed, forwards it to that person's devices through Firebase Cloud
 * Messaging. The inbox record stays the truth; this is a copy of it, sent
 * once.
 *
 * And a browser cannot hold an API key, so the call to Gemini that ranks
 * AI Picks is made from here, for a signed-in person, with the key kept
 * in Secret Manager (`GEMINI_API_KEY`). See lib/recommend.js.
 *
 * Chat messages are sent from here too, for a different reason: a
 * message has to be moderated *before* anybody else can read it, and
 * anything the browser does can be skipped by a client that simply does
 * not run it. The rules no longer let any client write a message at all
 * (ADR-033); this is the only way in, and it checks the same things the
 * rules used to, then OpenAI's Moderation API, and only then writes.
 * See lib/sendChat.js.
 */
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'

import { deliverPush } from './lib/deliver.js'
import { DEFAULT_MODEL, geminiRanker } from './lib/gemini.js'
import { removeStaleTokens } from './lib/housekeeping.js'
import { validateSend } from './lib/chat.js'
import { openaiClient } from './lib/openai.js'
import { profanityList } from './lib/moderation.js'
import { validateRequest } from './lib/picks.js'
import { recommend } from './lib/recommend.js'
import { resolveBlock, sendChatMessage } from './lib/sendChat.js'
import { fcmTransport, logTransport } from './lib/transport.js'

initializeApp()
const db = getFirestore()

// The public origin, for the link a click follows when the app is closed.
const ORIGIN = process.env.PUSH_ORIGIN || 'https://smartsync-c1f07.web.app'

// Under the emulator there is nothing to send with, so the push goes to the
// log; set PUSH_TRANSPORT=fcm to force the real thing (needs credentials).
const useLog =
  process.env.PUSH_TRANSPORT === 'log' ||
  (process.env.FUNCTIONS_EMULATOR === 'true' && process.env.PUSH_TRANSPORT !== 'fcm')
const transport = useLog ? logTransport(logger) : fcmTransport(getMessaging())

export const onNotificationCreated = onDocumentCreated(
  { document: 'users/{uid}/notifications/{id}', region: 'us-central1', retry: false },
  async (event) => {
    const snap = event.data
    if (!snap) return
    const { uid, id } = event.params
    try {
      await deliverPush({
        db,
        FieldValue,
        transport,
        uid,
        id,
        record: snap.data(),
        eventId: event.id,
        origin: ORIGIN,
        log: logger,
      })
    } catch (error) {
      // Recorded, not rethrown: a retry would find the claim and stop, and
      // the inbox record — the thing that matters — is already there.
      logger.error('push delivery failed', { uid, id, error: String(error?.message || error) })
    }
  },
)

export const cleanupPushTokens = onSchedule(
  { schedule: 'every 24 hours', region: 'us-central1' },
  async () => {
    const removed = await removeStaleTokens({ db, Timestamp })
    logger.info('stale push tokens removed', { removed })
  },
)

// ---------------------------------------------------------------- AI Picks

// The key never leaves the server: a secret, bound to this one function,
// read at call time. Locally, the emulator takes it from
// functions/.secret.local (ignored by git); without one the function
// answers "not configured" and the app shows what is on, unranked.
const geminiKey = defineSecret('GEMINI_API_KEY')

// Tunable without a code change, through functions/.env (also ignored):
// which model, how many model calls one person may make an hour, how many
// the whole app may make a day. Defaults are in the code that reads them.
const picksCaps = () => ({
  user: Number(process.env.PICKS_USER_HOURLY_CAP) || undefined,
  daily: Number(process.env.PICKS_DAILY_CAP) || undefined,
})

export const recommendActivities = onCall(
  {
    region: 'us-central1',
    secrets: [geminiKey],
    // Longer than the model call's own ninety seconds, so a slow answer
    // is returned rather than cut off by the platform (ADR-032).
    timeoutSeconds: 110,
    memory: '256MiB',
    // A ceiling on how many copies may run at once, which is a ceiling on
    // how fast the model can be called whatever the per-person limits say.
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to get recommendations.')
    }
    let checked
    try {
      checked = validateRequest(request.data)
    } catch (error) {
      throw new HttpsError('invalid-argument', String(error?.message || error))
    }
    const apiKey = String(geminiKey.value() || '').trim()
    const ranker = apiKey
      ? geminiRanker({
          apiKey,
          model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
          // For the emulator only: a stand-in server that speaks the API,
          // so the whole path can be exercised without a key or a bill.
          baseUrl:
            process.env.FUNCTIONS_EMULATOR === 'true' ? process.env.GEMINI_BASE_URL : undefined,
        })
      : null
    return recommend({
      db,
      uid: request.auth.uid,
      signals: checked.signals,
      candidates: checked.candidates,
      force: checked.force,
      ranker,
      log: logger,
      caps: picksCaps(),
    })
  },
)

// ------------------------------------------------------------------ chat

// The moderation key, like the Gemini one: a secret bound to these
// functions, read at call time, never in the bundle and never in a
// VITE_ variable. Without it nothing is sent — a chat with no
// moderation is exactly what this feature exists to prevent — and the
// screen says the service is unavailable rather than pretending.
const openaiKey = defineSecret('OPENAI_API_KEY')

// Tunable through functions/.env (ignored by git): whether ordinary
// swearing is blocked as well as abuse, extra words for that list,
// whether the words inside pictures are read, which vision model reads
// them, and the two rate limits. Defaults are in the code that reads them.
const chatPolicy = () => ({
  profanity: process.env.CHAT_PROFANITY_POLICY === 'block' ? 'block' : 'allow',
  words: profanityList(process.env.CHAT_PROFANITY_WORDS),
  ocr: process.env.CHAT_IMAGE_OCR !== 'off',
})
const chatCaps = () => ({
  user: Number(process.env.CHAT_USER_HOURLY_CAP) || undefined,
  daily: Number(process.env.CHAT_DAILY_CAP) || undefined,
})
const moderationClient = () => {
  const apiKey = String(openaiKey.value() || '').trim()
  if (!apiKey) return null
  return openaiClient({
    apiKey,
    visionModel: process.env.OPENAI_VISION_MODEL,
    // For the emulator only: a stand-in that speaks both endpoints, so
    // the whole path can be exercised without a key or a bill.
    baseUrl: process.env.FUNCTIONS_EMULATOR === 'true' ? process.env.OPENAI_BASE_URL : undefined,
  })
}

/** Where the sender's own name comes from — theirs, not what they claimed. */
async function senderOf(uid, activityId) {
  const [userSnap, activitySnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`activities/${activityId}`).get(),
  ])
  const user = userSnap.data() || {}
  return {
    name: String(user.name || 'SmartSync user').slice(0, 60),
    avatar: String(user.avatar || '').slice(0, 8),
    activityTitle: String(activitySnap.data()?.title || '').slice(0, 120),
  }
}

export const sendChatMessageCall = onCall(
  {
    region: 'us-central1',
    secrets: [openaiKey],
    // Two moderation calls and a transcription, each with its own short
    // timeout, plus the writes.
    timeoutSeconds: 60,
    memory: '512MiB',
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to send a message.')
    }
    let checked
    try {
      checked = validateSend(request.data)
    } catch (error) {
      throw new HttpsError('invalid-argument', String(error?.message || error))
    }
    const sender = await senderOf(request.auth.uid, checked.activityId)
    return sendChatMessage({
      db,
      FieldValue,
      uid: request.auth.uid,
      sender,
      request: checked,
      openai: moderationClient(),
      caps: chatCaps(),
      policy: chatPolicy(),
      log: logger,
    })
  },
)

/**
 * "A human should look at this." Sets the flag on the person's own
 * blocked message; the admin console lists what has been appealed.
 * Nobody can appeal somebody else's, and nothing about the decision can
 * be changed from here.
 */
export const requestChatReview = onCall(
  { region: 'us-central1', timeoutSeconds: 20, memory: '256MiB', maxInstances: 5 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.')
    const blockId = String(request.data?.blockId || '')
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(blockId)) {
      throw new HttpsError('invalid-argument', 'blockId is not an id')
    }
    const ref = db.doc(`moderationBlocks/${blockId}`)
    const snap = await ref.get()
    if (!snap.exists) return { status: 'not-found' }
    const row = snap.data() || {}
    if (row.uid !== request.auth.uid) throw new HttpsError('permission-denied', 'Not your message.')
    if (row.severe === true) return { status: 'not-appealable' }
    if (row.status !== 'blocked') return { status: row.status }
    await ref.set({ appealed: true, appealedAt: Date.now() }, { merge: true })
    return { status: 'appealed' }
  },
)

/** An admin's answer to an appeal. Overturning posts the message. */
export const resolveChatBlock = onCall(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB', maxInstances: 5 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.')
    const roleSnap = await db.doc(`roles/${request.auth.uid}`).get()
    const role = roleSnap.data() || {}
    if (role.role !== 'admin' || role.suspended === true || role.banned === true) {
      throw new HttpsError('permission-denied', 'Admins only.')
    }
    const blockId = String(request.data?.blockId || '')
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(blockId)) {
      throw new HttpsError('invalid-argument', 'blockId is not an id')
    }
    const decision = request.data?.decision === 'overturn' ? 'overturn' : 'uphold'
    return resolveBlock({ db, FieldValue, adminId: request.auth.uid, blockId, decision })
  },
)

