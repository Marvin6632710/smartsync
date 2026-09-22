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
import { validateRequest } from './lib/picks.js'
import { recommend } from './lib/recommend.js'
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
    timeoutSeconds: 30,
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
