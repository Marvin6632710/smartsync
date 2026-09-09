import { useEffect, useState } from 'react'

import { watchMessages } from '../firebase/messages'

/**
 * Live messages for one activity.
 *
 * Scoped to the chat screen rather than held globally: a thread is only worth
 * streaming while someone is looking at it, and the security rules only let
 * participants read one at all.
 */
export function useThread(activityId, enabled = true) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!activityId || !enabled) return undefined
    return watchMessages(
      activityId,
      (rows) => {
        setMessages(rows)
        setLoading(false)
      },
      (watchError) => {
        setError(watchError)
        setLoading(false)
      },
    )
  }, [activityId, enabled])

  return { messages, loading, error }
}
