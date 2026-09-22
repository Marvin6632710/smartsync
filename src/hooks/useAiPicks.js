import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { recommendActivitiesCall } from '../firebase/functions'
import { buildPicksRequest, picksSignature } from '../services/aiPicks'
import { reportError } from '../utils/reportError'

/**
 * How long an answer is kept on this device before the same question is
 * asked again — the Function keeps its own copy for as long, so a reload
 * inside the window costs a read, not a model call.
 */
export const PICKS_TTL_MS = 10 * 60_000
/**
 * The feed arrives in snapshots and a person's profile in another; the
 * request is sent once they have settled, not once per snapshot.
 */
export const PICKS_DEBOUNCE_MS = 1_200

// Answers by account and question, for the life of the page. Navigating
// away and back, or a re-render for any reason, is not a new request.
const answers = new Map()

/** For sign-out and tests. */
export function forgetAiPicks() {
  answers.clear()
}

/**
 * The model's ranking of `activities` for `user`, or the reason there is
 * none. `status` is 'idle' (nothing to ask about), 'loading', 'ready' or
 * 'error'; `result` is the Function's answer when ready — `source`
 * 'gemini' with `picks`, or 'none' with a `reason`. A new question
 * (the signals or the eligible set changed) is asked on its own after a
 * short pause; `refresh` asks again past every cache; `retry` asks again
 * after an error.
 */
export function useAiPicks({ user, activities, joinedActivities, enabled = true }) {
  const uid = user?.uid || null
  const request = useMemo(
    () => buildPicksRequest({ user, activities, joinedActivities }),
    // The signals are derived from these four fields of the profile and
    // from the two lists; the profile object itself changes identity on
    // every snapshot, which must not re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      user?.interests,
      user?.preferredTime,
      user?.historyCategories,
      user?.location,
      activities,
      joinedActivities,
    ],
  )
  const signature = useMemo(() => picksSignature(request), [request])
  // The question, or null when there is nothing to ask about.
  const cacheKey = uid && enabled && request.candidates.length > 0 ? `${uid}|${signature}` : null

  // What the last ask for a question came to. The answer itself lives in
  // `answers`; this records that an ask settled, and how, so the screen
  // can tell "asking" from "asked and refused".
  const [settled, setSettled] = useState({ key: null, error: null })
  // Bumped to ask again. `force` rides in a ref: read when the request is
  // made and spent when it settles, so a later change of question asks
  // normally — and a development double-run of the effect reads the same
  // value both times.
  const [turn, setTurn] = useState(0)
  const forceRef = useRef(false)
  // The freshest facts (distances, spots) go with the request whenever it
  // is finally sent; only the question — the signature — decides when.
  const latestRequest = useRef(request)
  useEffect(() => {
    latestRequest.current = request
  }, [request])

  // Derived, not set: the kept answer to this question, else the refusal
  // of the last ask for it, else "asking". A kept answer past its time is
  // still shown — the effect below asks again and the new one replaces
  // it — rather than a blank while the same question is re-asked.
  const kept = cacheKey ? answers.get(cacheKey) : null
  let status = 'idle'
  let result = null
  let error = null
  if (cacheKey) {
    if (kept) {
      status = 'ready'
      result = kept.result
    } else if (settled.key === cacheKey && settled.error) {
      status = 'error'
      error = settled.error
    } else {
      status = 'loading'
    }
  }

  useEffect(() => {
    if (!cacheKey) return undefined
    const force = forceRef.current
    const have = answers.get(cacheKey)
    if (have && !force && Date.now() - have.at < PICKS_TTL_MS) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { data } = await recommendActivitiesCall({
          ...latestRequest.current,
          ...(force ? { force: true } : {}),
        })
        if (cancelled) return
        forceRef.current = false
        answers.set(cacheKey, { result: data, at: Date.now() })
        setSettled({ key: cacheKey, error: null })
      } catch (caught) {
        if (cancelled) return
        forceRef.current = false
        reportError('picks.recommend', caught, { uid })
        setSettled({ key: cacheKey, error: caught })
      }
    }, PICKS_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // `turn` is the deliberate re-ask; the key is the question.
  }, [cacheKey, turn, uid])

  const refresh = useCallback(() => {
    if (cacheKey) answers.delete(cacheKey)
    forceRef.current = true
    setSettled({ key: null, error: null })
    setTurn((n) => n + 1)
  }, [cacheKey])
  const retry = useCallback(() => {
    forceRef.current = false
    setSettled({ key: null, error: null })
    setTurn((n) => n + 1)
  }, [])

  return { status, result, error, request, refresh, retry }
}
