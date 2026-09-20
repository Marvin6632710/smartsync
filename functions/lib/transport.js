/**
 * How a push leaves: through FCM, or into the log.
 *
 * The emulator suite has no messaging emulator, and a Function running
 * locally has no credentials to reach the real one, so under the emulator
 * the push is written to the log instead — every other step (the policy,
 * the claim, the wording, the token bookkeeping) runs exactly as deployed.
 * A token beginning `invalid-` is reported as dead by the log transport,
 * so the cleanup path can be exercised locally too.
 */

/** FCM's ways of saying a token will never work again. */
export const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
])

export function fcmTransport(messaging) {
  return {
    name: 'fcm',
    async send(tokens, message) {
      const result = await messaging.sendEachForMulticast({ tokens, ...message })
      return result.responses.map((response, index) => ({
        token: tokens[index],
        ok: response.success,
        code: response.error?.code || null,
      }))
    },
  }
}

export function logTransport(log = console) {
  return {
    name: 'log',
    async send(tokens, message) {
      log.info('push (not sent: log transport)', {
        tokens: tokens.length,
        title: message.data?.title,
        body: message.data?.body,
        lang: message.data?.lang,
        tag: message.data?.tag,
        ttl: message.webpush?.headers?.TTL,
      })
      return tokens.map((token) => ({
        token,
        ok: !token.startsWith('invalid-'),
        code: token.startsWith('invalid-') ? 'messaging/registration-token-not-registered' : null,
      }))
    },
  }
}
