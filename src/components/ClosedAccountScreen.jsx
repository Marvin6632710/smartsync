import React, { useEffect, useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { watchNotifications } from '../firebase/notifications'

/**
 * What a closed account sees, in place of the app.
 *
 * It says why. Being told an account is closed without being told what for is
 * the thing that makes people certain they were treated arbitrarily, whether
 * or not they were — and the decision is easier to defend when it is stated
 * plainly than when it is hidden behind a blank screen.
 *
 * The reason is read from the notification the closure wrote, which is the one
 * collection a closed account can still read: their own. Everything else — the
 * activities, other people's profiles, the chats — is refused by the rules, so
 * there is no version of this screen that could show more than it does.
 */
export default function ClosedAccountScreen() {
  const { user, signOut } = useAuth()
  const [reason, setReason] = useState(null)

  useEffect(() => {
    if (!user?.uid) return undefined
    return watchNotifications(
      user.uid,
      (rows) => {
        const latest = rows.find((n) => n.type === 'moderation' && /closed/i.test(n.title || ''))
        setReason(latest?.body || null)
      },
      () => setReason(null),
    )
  }, [user?.uid])

  return (
    <div className="page-content boot-screen">
      <div className="empty-state">
        <ShieldOff size={30} />
        <h3>This account has been closed</h3>
        <p>
          {reason ||
            'SmartSync closed this account for breaking the community policy. It can no longer host, join, or message anybody.'}
        </p>
        <p className="helper-text">
          SmartSync exists to get people into the same room safely. An account is only closed when
          keeping it open would work against that.
        </p>
        <button className="primary-button" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
