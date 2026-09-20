/**
 * SmartSync's server side: small, and only where the browser cannot go.
 *
 * A browser cannot send a push to another browser — the Web Push protocol
 * wants a private key that must never ship in client code — so this is the
 * trusted sender. It listens for a notification landing in somebody's
 * inbox and, for the kinds that matter when the app is closed, forwards it
 * to that person's devices through Firebase Cloud Messaging. The inbox
 * record stays the truth; this is a copy of it, sent once.
 */
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { logger } from 'firebase-functions'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'

import { deliverPush } from './lib/deliver.js'
import { removeStaleTokens } from './lib/housekeeping.js'
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
