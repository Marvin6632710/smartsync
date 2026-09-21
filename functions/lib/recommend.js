/**
 * One request for AI Picks, from checked input to an answer the browser
 * can show — through the cache, the rate limits and the model, in that
 * order, so the cheap answers come first.
 *
 * Every outcome is a value, not an exception: the browser always has the
 * standard ranking to fall back on, and this says which of the two it is
 * getting and why. Only a request that is not the app's (wrong shape, no
 * account) is refused outright, and that happens before this is reached.
 *
 * Kept in Firestore, per person, in `aiPicks/{uid}` (readable by nobody
 * but this code): the last answer with the signature of the request it
 * answered, and the hour's call count. `aiPicksUsage/{day}` counts the
 * day's calls across everyone, so a bad day cannot become a bad bill.
 */
import { buildPrompt, parsePicks, rateWindow, signatureOf } from './picks.js'

export const CACHE_TTL_MS = 10 * 60_000
export const USER_WINDOW_MS = 60 * 60_000
/** Model calls per person per hour, and per day across the whole app. */
export const DEFAULT_USER_CAP = 10
export const DEFAULT_DAILY_CAP = 1500

const dayOf = (now) => new Date(now).toISOString().slice(0, 10)
const secondsToNextDay = (now) => {
  const next = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate() + 1,
  )
  return Math.max(1, Math.ceil((next - now) / 1000))
}

const standard = (reason, extra = {}) => ({ source: 'standard', reason, ...extra })

/**
 * Takes the call, or says when to come back. One transaction over the
 * person's hour and the day's total, so two requests racing cannot both
 * be the last one allowed.
 */
async function takeCall({ db, uid, now, caps }) {
  const userRef = db.doc(`aiPicks/${uid}`)
  const dayRef = db.doc(`aiPicksUsage/${dayOf(now)}`)
  return db.runTransaction(async (tx) => {
    const [userSnap, daySnap] = await tx.getAll(userRef, dayRef)
    const day = Number(daySnap.data()?.count) || 0
    if (day >= caps.daily) {
      return { allowed: false, retryAfterSeconds: secondsToNextDay(now), scope: 'day' }
    }
    const window = rateWindow(userSnap.data()?.calls, now, {
      perWindow: caps.user,
      windowMs: USER_WINDOW_MS,
    })
    if (!window.allowed) {
      return { allowed: false, retryAfterSeconds: window.retryAfterSeconds, scope: 'user' }
    }
    tx.set(userRef, { calls: window.next }, { merge: true })
    tx.set(dayRef, { count: day + 1, updatedAt: now }, { merge: true })
    return { allowed: true }
  })
}

export async function recommend({
  db,
  uid,
  signals,
  candidates,
  force = false,
  ranker,
  now = Date.now(),
  log = console,
  caps = {},
}) {
  const limits = { user: caps.user ?? DEFAULT_USER_CAP, daily: caps.daily ?? DEFAULT_DAILY_CAP }
  const signature = signatureOf({ signals, candidates })
  const ref = db.doc(`aiPicks/${uid}`)

  // The cache first: the same question, answered in the last ten minutes,
  // gets the same answer without a call — a reload, a second tab, another
  // device. A refresh the person asked for goes past it.
  const cached = (await ref.get()).data()
  if (
    !force &&
    cached?.signature === signature &&
    Array.isArray(cached.picks) &&
    now - Number(cached.createdAt) < CACHE_TTL_MS
  ) {
    return {
      source: 'gemini',
      picks: cached.picks,
      model: cached.model || null,
      createdAt: Number(cached.createdAt),
      cached: true,
    }
  }

  if (!ranker) return standard('not-configured')

  const turn = await takeCall({ db, uid, now, caps: limits })
  if (!turn.allowed) {
    log.info?.('ai picks rate-limited', { uid, scope: turn.scope })
    return standard('rate-limited', { retryAfterSeconds: turn.retryAfterSeconds })
  }

  const prompt = buildPrompt({ signals, candidates })
  let answer
  try {
    answer = await ranker(prompt)
  } catch (error) {
    const kind = error?.kind || 'unavailable'
    log.warn?.('ai picks model call failed', {
      uid,
      kind,
      status: error?.status ?? null,
      message: String(error?.message || error).slice(0, 300),
    })
    return standard(kind)
  }

  const picks = parsePicks(answer.text, candidates, signals)
  if (!picks) {
    log.warn?.('ai picks answer unusable', { uid, sample: String(answer.text).slice(0, 200) })
    return standard('invalid')
  }

  await ref.set(
    { signature, picks, model: answer.model || null, createdAt: now, uid },
    { merge: true },
  )
  log.info?.('ai picks ranked', {
    uid,
    candidates: candidates.length,
    picks: picks.length,
    model: answer.model || null,
    tokens: answer.usage?.total_tokens ?? null,
  })
  return { source: 'gemini', picks, model: answer.model || null, createdAt: now, cached: false }
}
