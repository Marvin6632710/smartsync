import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Shown when a signed-in user's profile cannot be loaded or created.
 *
 * Without this the app sits on "Loading your profile…" indefinitely: the
 * error was captured in state and never rendered, so there was no message,
 * no retry, and — worst of it — no way to sign out and try another account.
 * A dead end with no exit is a worse failure than the original error.
 */
export default function ProfileErrorScreen({ error, onRetry, onSignOut }) {
  const [busy, setBusy] = useState(false)

  const retry = async () => {
    setBusy(true)
    try {
      await onRetry()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="standalone-page boot-screen">
      <div className="brand-orb warning-orb">
        <AlertTriangle size={30} />
      </div>
      <div className="entry-copy">
        <h1>Can&apos;t load your profile</h1>
        <p>
          You are signed in, but your profile could not be loaded. This is usually a connection
          problem.
        </p>
      </div>
      {/* The raw code is shown deliberately: it is the one thing that makes a
          support conversation about this possible. */}
      {error?.code && <p className="form-notice">Error: {error.code}</p>}
      <button className="primary-button wide" onClick={retry} disabled={busy}>
        {busy ? 'Trying again…' : 'Try again'}
      </button>
      <button className="text-button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  )
}
