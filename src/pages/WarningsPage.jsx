import React, { useEffect, useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { watchMyWarnings } from '../firebase/moderation'
import { formatRelativeTime } from '../utils/time'

/**
 * What you have been warned about.
 *
 * A warning nobody can go back and read is a rumour. The notification says it
 * once and scrolls away; this is the record, and it is the same record a
 * moderator sees — there is no second, harsher version of it kept somewhere
 * else. Who issued it is deliberately not shown: the decision is SmartSync's,
 * and naming an individual moderator to the person they acted on invites
 * exactly the retaliation the ranks exist to prevent.
 */
export default function WarningsPage() {
  const { user } = useAuth()
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Bumped by Try again: the listener is dead once it has reported an
  // error, so trying again means making it again.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!user?.uid) return undefined
    return watchMyWarnings(
      user.uid,
      (rows) => {
        setWarnings(rows)
        setError(null)
        setLoading(false)
      },
      // A read that failed used to fall through to "Nothing on your record",
      // which on this page of all pages is the one thing it must not say
      // unless it is true.
      (watchError) => {
        setError(watchError)
        setLoading(false)
      },
    )
  }, [user?.uid, attempt])

  const retry = () => {
    setError(null)
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  return (
    <div className="page-content">
      <section className="headline-block">
        <span className="eyebrow">Your account</span>
        <h2>Warnings</h2>
        <p className="helper-text">
          SmartSync exists to get people into the same room safely. A warning means something you
          did worked against that, and that it was noticed — nothing has been taken away.
        </p>
      </section>

      <div className="stack list-stack">
        {warnings.map((warning) => (
          <article className="report-card" key={warning.id}>
            <header>
              <span className="report-kind">
                <MessageSquareWarning size={13} /> warning
              </span>
              <time>{formatRelativeTime(warning.createdAt?.toMillis?.())}</time>
            </header>
            <p className="report-detail-text">“{warning.reason}”</p>
          </article>
        ))}

        {!loading && error && (
          <div className="empty-state" role="alert">
            <MessageSquareWarning size={28} />
            <h3>Couldn&apos;t load your record</h3>
            <p>Check your connection and try again.</p>
            <button className="primary-button" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && warnings.length === 0 && (
          <div className="empty-state">
            <MessageSquareWarning size={28} />
            <h3>Nothing on your record</h3>
            <p>You have not been warned about anything.</p>
          </div>
        )}
      </div>
    </div>
  )
}
