import React, { useEffect, useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import BackButton from '../components/BackButton'
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

  useEffect(() => {
    if (!user?.uid) return undefined
    return watchMyWarnings(
      user.uid,
      (rows) => {
        setWarnings(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [user?.uid])

  return (
    <div className="page-content">
      <BackButton />
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

        {!loading && warnings.length === 0 && (
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
