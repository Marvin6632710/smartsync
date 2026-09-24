/**
 * The two calls SmartSync makes to OpenAI, and nothing else.
 *
 * `moderate` is the Moderation API — free to use, which is why every
 * message can go through it — and `readImageText` is a small vision call
 * that transcribes the words in a picture so they can be moderated as
 * text. The second one costs money, so it is optional and bounded; see
 * `CHAT_IMAGE_OCR` in README §11.
 *
 * Written against the documented HTTP shape rather than the SDK: one
 * POST each, no dependency to install, nothing to keep in step but two
 * request bodies. Both are read from the official documentation
 * (developers.openai.com/api/docs, 2026-09-22).
 *
 * Every failure is classified, never thrown blindly: the caller has to
 * tell "the service is down" (keep the message, offer Retry) from "our
 * request was wrong" (a bug, and the message still must not be sent).
 */
import { MODERATION_MODEL, imageTextPrompt } from './moderation.js'

const API = 'https://api.openai.com/v1'
export const DEFAULT_TIMEOUT_MS = 8_000
/** Small, cheap, and it can see. Overridable for when the model list moves on. */
export const DEFAULT_VISION_MODEL = 'gpt-5.6-luna'
/** A transcription of a meme is short; this is a ceiling, not a target. */
const MAX_OCR_TOKENS = 400

export class ModerationError extends Error {
  constructor(kind, message, status) {
    super(message)
    this.kind = kind // 'unavailable' | 'rate-limited' | 'refused' | 'invalid'
    this.status = status ?? null
  }
}

/**
 * Which kind of failure this is.
 *
 * 5xx is theirs and will pass; 401/403 mean the key is wrong or revoked,
 * which is ours to fix and not something a person can retry their way
 * out of; anything without a status is the network.
 *
 * 429 is the one that needs its body read. Two different things arrive
 * with that status: an actual rate limit, which passes in a minute and
 * is fairly the sender's to wait out, and an exhausted credit balance,
 * which is an account we did not top up and will never clear on its own.
 * Telling somebody "you have sent a lot in a short time" when the truth
 * is "we ran out of credit" blames them for our invoice, and invites
 * them to wait for something that is not coming. Measured on
 * 2026-09-23: the moderation endpoint answers a bare `Too Many
 * Requests` for both, but `/v1/responses` names the second one
 * `insufficient_quota` / `credit_balance_exhausted`, so when a body says
 * so, it is believed.
 */
const QUOTA = /insufficient_quota|credit_balance_exhausted|billing_hard_limit|exceeded your current quota/i

export function classify(status, detail = '') {
  if (!Number.isFinite(status)) return 'unavailable'
  if (status === 429) return QUOTA.test(String(detail)) ? 'refused' : 'rate-limited'
  if (status >= 500) return 'unavailable'
  if (status === 401 || status === 403) return 'refused'
  return 'invalid'
}

async function post(path, body, { apiKey, timeoutMs, baseUrl }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl || API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      let detail = ''
      try {
        detail = await response.text()
      } catch (error) {
        // Preserve the old tolerance for an unreadable error body, but do not
        // turn an actual timeout into a response with an empty detail.
        if (controller.signal.aborted) throw error
      }
      throw new ModerationError(
        classify(response.status, detail),
        detail.slice(0, 300),
        response.status,
      )
    }
    // Parsing is part of the request too. Keeping it inside the abort window
    // prevents a server that sent headers and then stalled its body from
    // occupying the Function's much larger outer timeout.
    return await response.json()
  } catch (error) {
    if (error instanceof ModerationError) throw error
    // An abort is a timeout here; either way nothing was decided, so the
    // message stays unsent rather than going through unchecked.
    throw new ModerationError('unavailable', String(error?.message || error))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One moderation call. `parts` is what is being checked — text, an image,
 * or both — in the documented mixed-input form.
 *
 * Returns the API's own `results[0]`; the judging is somebody else's job
 * (see moderation.js), so this stays a transport.
 */
export function moderationInput({ text, imageDataUrl }) {
  const input = []
  if (text) input.push({ type: 'text', text })
  if (imageDataUrl) input.push({ type: 'image_url', image_url: { url: imageDataUrl } })
  return input
}

export function openaiClient({ apiKey, baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, visionModel }) {
  return {
    async moderate({ text, imageDataUrl }) {
      const input = moderationInput({ text, imageDataUrl })
      if (input.length === 0) return null
      const body = await post(
        '/moderations',
        { model: MODERATION_MODEL, input },
        { apiKey, timeoutMs, baseUrl },
      )
      const result = body?.results?.[0]
      if (!result || typeof result !== 'object') {
        // A shape we do not understand is not permission to deliver.
        throw new ModerationError('invalid', 'the moderation response had no result')
      }
      return result
    },

    /**
     * The words in a picture, for moderating as text. Returns '' when
     * there are none — and when the model says anything odd, because an
     * empty transcription costs one extra moderation call at worst,
     * while trusting a strange one could put the model's own words in
     * front of a decision about somebody's message.
     */
    async readImageText({ imageDataUrl }) {
      const body = await post(
        '/responses',
        {
          model: visionModel || DEFAULT_VISION_MODEL,
          max_output_tokens: MAX_OCR_TOKENS,
          input: [
            {
              type: 'message',
              role: 'user',
              content: [
                { type: 'input_text', text: imageTextPrompt },
                { type: 'input_image', image_url: imageDataUrl },
              ],
            },
          ],
        },
        { apiKey, timeoutMs, baseUrl },
      )
      const text = collectOutputText(body)
      return text.slice(0, 2000)
    },
  }
}

/** The transcription, wherever the Responses API put it. */
export function collectOutputText(body) {
  if (typeof body?.output_text === 'string') return body.output_text.trim()
  const parts = []
  for (const item of Array.isArray(body?.output) ? body.output : []) {
    for (const piece of Array.isArray(item?.content) ? item.content : []) {
      if (piece?.type === 'output_text' && typeof piece.text === 'string') parts.push(piece.text)
    }
  }
  return parts.join(' ').trim()
}
