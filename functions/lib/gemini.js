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
 * - One retry at most, and a timeout: the browser is waiting, and "not
 *   ranked, try again" said promptly beats a ranking that arrives after
 *   the person has left. The SDK would otherwise try five times with
 *   growing pauses.
 */
import { GoogleGenAI } from '@google/genai'

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
export const DEFAULT_TIMEOUT_MS = 20_000

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
          retries: {
            strategy: 'attempt-count-backoff',
            maxRetries: 1,
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
