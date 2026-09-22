/**
 * What SmartSync blocks, and what it deliberately does not.
 *
 * The Moderation API answers with thirteen categories, a boolean for each
 * and a score between 0 and 1. Turning that into "this message may go to
 * the thread" or "it may not" is a product decision, not an API one, and
 * it is made here — in one pure function with no network and no database,
 * so every rule in it can be tested and argued with.
 *
 * Two things this file is careful about.
 *
 * **It blocks what was asked for and nothing more.** Targeted harassment,
 * hateful abuse, threats, sexually explicit content, graphic violence and
 * the encouragement of self-harm. Not ordinary swearing, not an argument,
 * not somebody describing something that happened to them, and — this one
 * matters — not somebody in trouble asking for help.
 *
 * **It never decides on one number alone.** A category counts only when
 * the API's own boolean is true *and* its score clears a floor kept here.
 * The booleans on their own are tuned for a general audience and fire on
 * mild cases; the floor is what keeps a heated exchange about a football
 * match out of the blocked pile.
 *
 * Sources: the category list and response shape are the Moderation API's
 * own (`omni-moderation-latest`, developers.openai.com/api/docs/guides/
 * moderation, read 2026-09-22).
 */

/** The model the spec names. Kept here so the adapter and the docs agree. */
export const MODERATION_MODEL = 'omni-moderation-latest'

/**
 * Every category the API can return, and what SmartSync does with it.
 *
 * `reason` is the code the screen words for the person who wrote the
 * message — general on purpose ("this reads as a threat"), never the
 * category name and never a score. `image` records whether the API
 * applies that category to pictures at all; the six that do are the
 * reason `hate` and `harassment` in a meme have to be read as text
 * first (see `imageTextPrompt`).
 */
export const CATEGORIES = {
  harassment: { block: true, reason: 'harassment', floor: 0.5, image: false },
  'harassment/threatening': { block: true, reason: 'threat', floor: 0.35, image: false },
  hate: { block: true, reason: 'hate', floor: 0.45, image: false },
  'hate/threatening': { block: true, reason: 'threat', floor: 0.3, image: false },
  sexual: { block: true, reason: 'sexual', floor: 0.5, image: true },
  // The one category with no floor and no appeal: see `SEVERE` below.
  'sexual/minors': { block: true, reason: 'sexual-minors', floor: 0, image: false },
  'violence/graphic': { block: true, reason: 'violence', floor: 0.5, image: true },
  'illicit/violent': { block: true, reason: 'violence', floor: 0.5, image: false },
  'self-harm/instructions': { block: true, reason: 'self-harm', floor: 0.4, image: true },
  // Allowed, deliberately, every one of them:
  //
  // `violence` without `graphic` is how people talk about a film, a
  // tackle, or the news. `self-harm` and `self-harm/intent` are how
  // somebody says they are struggling — blocking that would take the
  // message away from the one person in the thread who might have
  // helped, and hide it from the Report button as well. `illicit`
  // without violence is not on the list SmartSync was asked to block.
  violence: { block: false, image: true },
  'self-harm': { block: false, image: true },
  'self-harm/intent': { block: false, image: true },
  illicit: { block: false, image: false },
}

/**
 * Sexual content involving minors is not treated as one block among many.
 *
 * The provider is explicit that its Moderation API is **not** a detector
 * for child sexual abuse material and must not be sent content suspected
 * of being it. So this codebase makes no claim to detect it: what the
 * category does here is stop the message, keep no copy of it anywhere
 * (no appeal record, no retained text, nothing an admin can open), and
 * raise a flag that says a human has to act. The obligations that follow
 * — reporting to NCMEC, preserving what the law requires, contacting the
 * provider — belong to whoever operates this app and are written down in
 * README §11, not automated here.
 */
export const SEVERE = 'sexual-minors'

/** What a person may be told. The screen words these; the API's own labels never leave the server. */
export const REASONS = ['harassment', 'threat', 'hate', 'sexual', 'violence', 'self-harm', 'profanity', 'sexual-minors']

/**
 * Ordinary swearing, by policy rather than by the API — which has no
 * category for it, and should not: "this bloody bus" is not abuse.
 *
 * `allow` (the default) lets it through; `block` refuses it with its own
 * reason, so somebody can be told it was the language rather than
 * anything they were accused of meaning. The list is small, English, and
 * extendable through `CHAT_PROFANITY_WORDS` — a serious multilingual
 * list is not something to invent in a source file, and the API's
 * categories already carry the abuse cases in every language it speaks.
 */
export const PROFANITY_POLICIES = ['allow', 'block']
const SEED_PROFANITY = ['fuck', 'shit', 'cunt', 'bitch', 'bastard', 'dickhead', 'wanker']

export function profanityList(extra = '') {
  const added = String(extra || '')
    .split(',')
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...SEED_PROFANITY, ...added])]
}

/** Word-boundary match, so "Scunthorpe" and "class" are not swearing. */
export function hasProfanity(text, words) {
  const haystack = String(text || '').toLowerCase()
  return words.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u').test(haystack)
  })
}

/**
 * One API result into one decision.
 *
 * Returns `{ allowed, reason, categories }` — `categories` being the
 * blocking ones that fired, kept for the log and the admin's view of an
 * appeal, never for the sender.
 */
export function judge(result) {
  const categories = result?.categories || {}
  const scores = result?.category_scores || {}
  const fired = []
  for (const [name, rule] of Object.entries(CATEGORIES)) {
    if (!rule.block) continue
    if (categories[name] !== true) continue
    const score = Number(scores[name])
    if (Number.isFinite(score) && score < rule.floor) continue
    fired.push({ name, reason: rule.reason, score: Number.isFinite(score) ? score : null })
  }
  if (fired.length === 0) return { allowed: true, reason: null, categories: [] }
  // The gravest reason is the one the person is told about, and the order
  // here is that gravity — a message that is both a threat and harassment
  // reads as a threat.
  const order = ['sexual-minors', 'threat', 'hate', 'sexual', 'self-harm', 'violence', 'harassment']
  const reason = order.find((code) => fired.some((entry) => entry.reason === code)) || fired[0].reason
  return { allowed: false, reason, categories: fired }
}

/**
 * The whole decision for one message: the API's verdicts on everything
 * that was checked, plus the profanity policy.
 *
 * `results` is a list of `{ source, result }` — 'text' for what was
 * typed, 'image' for the picture, 'image-text' for words read out of the
 * picture — so a block can say which part of the message caused it
 * without the sender having to guess.
 */
export function decide({ results = [], text = '', caption = '', profanity = 'allow', words = [] }) {
  for (const entry of results) {
    const verdict = judge(entry.result)
    if (!verdict.allowed) {
      return {
        allowed: false,
        reason: verdict.reason,
        source: entry.source,
        categories: verdict.categories,
        severe: verdict.reason === SEVERE,
      }
    }
  }
  if (profanity === 'block' && hasProfanity(`${text} ${caption}`, words)) {
    return { allowed: false, reason: 'profanity', source: 'text', categories: [], severe: false }
  }
  return { allowed: true, reason: null, source: null, categories: [], severe: false }
}

/**
 * What the vision model is asked of a picture.
 *
 * Only a transcription — no judgement, no description of the image. The
 * words it returns are then put through the Moderation API like any
 * other text, which is what closes the gap the API's own image coverage
 * leaves: `hate`, `harassment` and `illicit` apply to text only, so a
 * meme whose picture is harmless and whose caption is abuse is invisible
 * to image moderation alone.
 */
export const imageTextPrompt =
  'Transcribe every word of text visible in this image, exactly as written, in its original language. ' +
  'Do not translate, summarise, describe the picture, or add anything of your own. ' +
  'If there is no readable text, reply with nothing at all.'
