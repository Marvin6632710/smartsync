import { useEffect, useRef, useState } from 'react'

import { refreshCredential } from '../firebase/auth'
import { watchMessages } from '../firebase/messages'

/** One fresh credential per subscription before a refusal is taken at its word. */
const MAX_AUTO_RETRIES = 1

/**
 * Live messages for one activity.
 *
 * Scoped to the chat screen rather than held globally: a thread is only worth
 * streaming while someone is looking at it, and the security rules only let
 * participants read one at all.
 *
 * A refused listener is now something the screen can see and something it
 * can recover from. It used to set an error nobody rendered and stop: the
 * thread showed "No messages yet" over a conversation that existed, and
 * nothing re-subscribed — the one listener a person is actually looking at
 * was the one with no retry. The first permission-denied under a live
 * subscription buys a fresh token and one more try, the same courtesy the
 * data listeners get; after that the error is reported, and `retry` lets
 * the person ask again themselves.
 */
export function useThread(activityId, enabled = true) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Bumped to subscribe again — by the automatic retry and by the screen.
  const [attempt, setAttempt] = useState(0)
  // Automatic retries spent on the current subscription. A ref, because a
  // retry re-runs the effect and a piece of state reset there would be a
  // render behind.
  const autoRetries = useRef(0)

  // The attempt the last subscription was made for. An effect run that is
  // not a retry — a different thread, or the same one reopened after its
  // gate closed and opened again — starts the automatic budget from zero.
  const lastAttempt = useRef(attempt)

  useEffect(() => {
    if (!activityId || !enabled) return undefined
    if (lastAttempt.current === attempt) autoRetries.current = 0
    lastAttempt.current = attempt
    let live = true
    const stop = watchMessages(
      activityId,
      (rows) => {
        if (!live) return
        autoRetries.current = 0
        setMessages(rows)
        setError(null)
        setLoading(false)
      },
      (watchError) => {
        if (!live) return
        if (watchError?.code === 'permission-denied' && autoRetries.current < MAX_AUTO_RETRIES) {
          autoRetries.current += 1
          refreshCredential().then(() => {
            if (live) setAttempt((current) => current + 1)
          })
          return
        }
        setError(watchError)
        setLoading(false)
      },
    )
    return () => {
      live = false
      stop()
    }
  }, [activityId, enabled, attempt])

  // A fresh subscription starts its retry budget afresh; a manual retry is
  // the person's decision, and is not counted against it.
  const retry = () => {
    autoRetries.current = 0
    setError(null)
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  return { messages, loading, error, retry }
}
