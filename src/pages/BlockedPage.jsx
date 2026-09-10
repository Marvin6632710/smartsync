import React, { useState } from 'react'
import { ShieldOff } from 'lucide-react'
import BackButton from '../components/BackButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { useApp } from '../context/AppContext'
import { formatRelativeTime } from '../utils/time'

/**
 * The list of people you have blocked, and the only way back.
 *
 * A block that cannot be undone is a trap rather than a control, and one that
 * can only be undone by finding the person again is barely better — the whole
 * point is that you no longer see them anywhere.
 */
export default function BlockedPage() {
  const { blocked, unblockPerson } = useApp()
  const [confirming, setConfirming] = useState(null)

  return (
    <div className="page-content">
      <BackButton />
      <section className="headline-block">
        <span className="eyebrow">Safety</span>
        <h2>Blocked people</h2>
        <p className="helper-text">
          You do not see their activities and they cannot join yours. They are not told that you
          blocked them.
        </p>
      </section>

      <div className="stack">
        {blocked.map((person) => (
          <div className="person-card" key={person.uid}>
            <div className="avatar">{person.avatar || '?'}</div>
            <div>
              <h3>{person.name}</h3>
              {/* The stored name is a snapshot from the moment of blocking, so
                  this list stays readable even if they rename themselves or
                  turn on anonymous mode afterwards. The timestamp is absent
                  for a moment while the write is still local. */}
              <p>
                {person.createdAt?.toMillis
                  ? `Blocked ${formatRelativeTime(person.createdAt.toMillis())}`
                  : 'Blocked'}
              </p>
            </div>
            <button className="text-button" onClick={() => setConfirming(person)}>
              Unblock
            </button>
          </div>
        ))}

        {blocked.length === 0 && (
          <div className="empty-state">
            <ShieldOff size={28} />
            <h3>Nobody is blocked</h3>
            <p>
              You can block someone from a participant list, the people screen, or when reporting
              them.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={`Unblock ${confirming?.name}?`}
        body="You will start seeing their activities again, and they will be able to join yours."
        confirmLabel="Unblock"
        cancelLabel="Keep blocked"
        onConfirm={() => {
          unblockPerson(confirming.uid)
          setConfirming(null)
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}
