import React, { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useAuth } from '../context/AuthContext'

/**
 * A way out of setup.
 *
 * Onboarding is deliberately not skippable — matching has nothing to work
 * with until interests exist — but "not skippable" turned into "no way out at
 * all": every route redirects back to /interests until setup finishes, and
 * neither setup screen offered a sign-out. Somebody who created an account by
 * mistake, or on a friend's phone, could only escape by clearing site data.
 */
export default function SignOutLink({ label = 'Not you? Sign out' }) {
  const { signOut } = useAuth()
  const [asking, setAsking] = useState(false)

  return (
    <>
      <button className="text-button wide-centre" onClick={() => setAsking(true)}>
        {label}
      </button>
      <ConfirmDialog
        open={asking}
        title="Sign out?"
        body="Your account stays, and setup starts where you left off next time you sign in."
        confirmLabel="Sign out"
        cancelLabel="Stay"
        tone="danger"
        onConfirm={() => {
          setAsking(false)
          signOut()
        }}
        onCancel={() => setAsking(false)}
      />
    </>
  )
}
