/**
 * Sending a chat message, which the browser no longer does by itself.
 *
 * Every message goes to a Cloud Function that moderates it and writes it
 * only if it passes (ADR-033). The rules refuse a message written from
 * here, so this is not a policy the app is being polite about — it is
 * the only way a message can exist.
 *
 * What comes back is a status, never an exception, except for the two
 * things that are not the app's business to explain: not signed in, and
 * a request that is not the app's shape.
 */
import { httpsCallable } from 'firebase/functions'

import { client } from './functions'

/**
 * Long enough for two moderation calls and a transcription, each with
 * its own timeout on the server, plus the writes. Shorter than the
 * Function's own budget would mean the browser giving up on a message
 * the server is about to deliver — and then a retry that sends it
 * twice, which is what `clientMsgId` exists to prevent anyway.
 */
const SEND_TIMEOUT_MS = 70_000

let send = null
let review = null
let resolve = null

/**
 * `{ activityId, clientMsgId, text, image }` in; one of these out:
 *
 * - `{ status: 'sent', id }` — it is in the thread.
 * - `{ status: 'blocked', reason, severe }` — it is not, and the reason
 *   is a code the screen words ('harassment', 'threat', 'hate',
 *   'sexual', 'violence', 'self-harm', 'profanity', 'sexual-minors').
 * - `{ status: 'unavailable' | 'rate-limited' | 'closed' | 'not-allowed'
 *   | 'not-found' }` — nothing was sent and the screen says which.
 */
export function sendChatMessage(data) {
  if (!send) {
    send = httpsCallable(client(), 'sendChatMessageCall', { timeout: SEND_TIMEOUT_MS })
  }
  return send(data).then((result) => result.data)
}

/** "A person should look at this." Only ever about your own message. */
export function requestChatReview(blockId) {
  if (!review) {
    review = httpsCallable(client(), 'requestChatReview', { timeout: 20_000 })
  }
  return review({ blockId }).then((result) => result.data)
}

/** An admin's answer. `decision` is 'overturn' or 'uphold'. */
export function resolveChatBlock(blockId, decision) {
  if (!resolve) {
    resolve = httpsCallable(client(), 'resolveChatBlock', { timeout: 30_000 })
  }
  return resolve({ blockId, decision }).then((result) => result.data)
}
