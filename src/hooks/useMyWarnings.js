import { useEffect, useState } from 'react'
import { watchMyWarnings } from '../firebase/moderation'

/**
 * The warnings on your own record, live.
 *
 * Shared by the page that lists them and the Settings row that says how
 * many there are, so the two never disagree. `loading` holds until the first
 * answer and `error` is set when the read failed — and in either state the
 * caller must not claim the record is clean, because it does not know.
 * `retry` makes the listener again: one that has reported an error is dead.
 */
export function useMyWarnings(uid) {
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!uid) return undefined
    return watchMyWarnings(
      uid,
      (rows) => {
        setWarnings(rows)
        setError(null)
        setLoading(false)
      },
      (watchError) => {
        setError(watchError)
        setLoading(false)
      },
    )
  }, [uid, attempt])

  const retry = () => {
    setError(null)
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  return { warnings, loading, error, retry }
}
