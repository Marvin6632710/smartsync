/**
 * The one place that talks to Gemini.
 *
 * A ranker is a function from a prompt to the text the model returned;
 * this builds the real one over the official SDK (`@google/genai`,
 * Interactions API), and `recommend.js` takes any function of that shape,
 * so the rest is tested with a ranker that answers instantly.
 *
 * Choices, with their reasons:
 * - `store: false`: nothing about the request is kept on Google's side
 *   for later retrieval. The data is anonymous, but it is still someone's.
 * - JSON with a schema, so the answer is parseable by construction; what
 *   it says is still checked by `parsePicks`.
 * - A low thinking level: ordering forty short records is not a hard
 *   problem, and thought tokens are billed as output.
 * - A timeout, and no retry of our own: the browser is waiting, and a
 *   ranking that arrives after the person has left is worth nothing.
 *   The SDK would otherwise try five times with growing pauses — and
 *   on the free tier, where one attempt can take over a minute (see
 *   the timeout below), a second attempt cannot fit inside the
 *   Function's own budget. The page's Try again is the retry, and it
 *   is the person's to press.
 */
import { GoogleGenAI } from '@google/genai'

/**
 * `flash`, not `flash-lite`, since 2026-09-22.
 *
 * Lite is the cheaper and faster of the two and was the right default
 * while the key had billing behind it. On the free-tier project the app
 * now uses, every lite call came back "currently experiencing high
 * demand" for as long as it was tried, while flash answered at once —
 * a model with no capacity for you is not a cheaper model, it is no
 * model. `GEMINI_MODEL` in functions/.env overrides this without a code
 * change, so going back is one line when lite has room again.
 */
export const DEFAULT_MODEL = 'gemini-3.5-flash'
/**
 * Ninety seconds, not twenty, since 2026-09-22 (ADR-032).
 *
 * On a paid project this call answered in two or three seconds and
 * twenty was generous. On the free tier the app now uses, the same call
 * measured 43, 49, 65 and 75 seconds — the time is spent queuing, not
 * generating. Twenty seconds there means the answer is always thrown
 * away just before it arrives. Ninety catches what the free tier
 * actually delivers and still leaves room under the Function's budget
 * (110 s) and the browser's (115 s).
 */
export const DEFAULT_TIMEOUT_MS = 90_000

/** The error the adapter throws: a name for the kind, and the HTTP status if there was one. */
export class RankerError extends Error {
  constructor(kind, message, status) {
    super(message)
    this.kind = kind // 'rate-limited' | 'unavailable' | 'invalid'
    this.status = status
  }
}

/** What went wrong, from the SDK's error: 429 is the quota, 5xx and timeouts are the service. */
export function classifyError(error) {
  const status = Number(error?.status ?? error?.statusCode)
  if (status === 429) return 'rate-limited'
  if (status >= 500 || !Number.isFinite(status)) return 'unavailable'
  // The key or the account, not the request: an invalid key (401), no
  // credit left (402), or the project shut out (403 "Your project has
  // been denied access") — the live outage of 2026-09-22 was the last
  // one, and read as "an answer the app could not use" until this.
  if (status === 401 || status === 402 || status === 403) return 'refused'
  // Other 400s: our request was refused (a rejected schema, say). The
  // person should not pay for it with a blank page.
  return 'invalid'
}

export function geminiRanker({
  apiKey,
  model = DEFAULT_MODEL,
  baseUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const ai = new GoogleGenAI({
    apiKey,
    ...(baseUrl ? { httpOptions: { baseUrl } } : {}),
  })
  return async function rank({ systemInstruction, input, schema }) {
    let interaction
    try {
      interaction = await ai.interactions.create(
        {
          model,
          input,
          system_instruction: systemInstruction,
          store: false,
          generation_config: { max_output_tokens: 1024, thinking_level: 'low' },
          response_format: { type: 'text', mime_type: 'application/json', schema },
        },
        {
          timeout_ms: timeoutMs,
          // None: at this timeout a second attempt would outlive the
          // Function. See the note at the top of the file.
          retries: {
            strategy: 'attempt-count-backoff',
            maxRetries: 0,
            backoff: { initialInterval: 400, maxInterval: 400, exponent: 1 },
          },
        },
      )
    } catch (error) {
      throw new RankerError(classifyError(error), String(error?.message || error), error?.status)
    }
    if (interaction?.status && interaction.status !== 'completed') {
      throw new RankerError('unavailable', `interaction ${interaction.status}`)
    }
    const text = interaction?.output_text
    if (typeof text !== 'string' || !text.trim()) {
      throw new RankerError('invalid', 'the model returned no text')
    }
    return { text, model: interaction.model || model, usage: interaction.usage || null }
  }
}
