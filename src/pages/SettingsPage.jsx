import React, { useState } from 'react'
import {
  Bell,
  ChevronRight,
  LogOut,
  MessageCircle,
  MessageSquareWarning,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { setNotificationsEnabled } from '../firebase/users'
import { useSaveProfile } from '../hooks/useSaveProfile'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { pushCelebration } = useApp()
  const [signOutOpen, setSignOutOpen] = useState(false)
  const { save, saving } = useSaveProfile()
  const privacy = user.privacy

  // A sign-out that fails leaves the person signed in; that used to be an
  // unhandled rejection and a screen that did not change.
  const leave = () =>
    signOut().catch(() =>
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: "Couldn't sign out",
        body: 'Please try again.',
      }),
    )

  return (
    <div className="page-content">
      <h2>Settings</h2>

      <div className="settings-card">
        <button className="setting-row" onClick={() => navigate('/privacy')}>
          <ShieldCheck size={18} />
          <span>
            <strong>Privacy</strong>
            <small>Anonymous mode and location controls</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="setting-row" onClick={() => navigate('/filters')}>
          <SlidersHorizontal size={18} />
          <span>
            <strong>Discovery preferences</strong>
            <small>Category, distance and availability</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="setting-row" onClick={() => navigate('/blocked')}>
          <ShieldOff size={18} />
          <span>
            <strong>Blocked people</strong>
            <small>Who you have blocked, and how to undo it</small>
          </span>
          <ChevronRight size={17} />
        </button>
        {/* Always here, not only when there is something on it. A row that
            appears the moment you are warned tells you off twice. */}
        <button className="setting-row" onClick={() => navigate('/warnings')}>
          <MessageSquareWarning size={18} />
          <span>
            <strong>Warnings</strong>
            <small>Anything SmartSync has raised with you</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="setting-row" onClick={() => navigate('/weights')}>
          <SlidersHorizontal size={18} />
          <span>
            <strong>Matching weights</strong>
            <small>See and adjust how activities are scored</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="setting-row" onClick={() => navigate('/messages')}>
          <MessageCircle size={18} />
          <span>
            <strong>Activity messages</strong>
            <small>Chats for activities you joined</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button
          className="setting-row"
          onClick={() => save(() => setNotificationsEnabled(user.uid, !privacy.notifications))}
          role="switch"
          aria-checked={privacy.notifications}
          disabled={saving}
        >
          <Bell size={18} />
          <span>
            <strong>Notifications</strong>
            <small>Joins, messages and activity updates</small>
          </span>
          <span className={`switch ${privacy.notifications ? 'on' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {user.isModerator && (
        <div className="settings-card">
          <button className="setting-row" onClick={() => navigate('/moderation')}>
            <ShieldAlert size={18} />
            <span>
              <strong>Moderation</strong>
              <small>
                Open reports {user.isAdmin ? '· you are an admin' : '· you are a moderator'}
              </small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
      )}

      <div className="panel">
        <h3>Account</h3>
        <p className="helper-text">Signed in as {user.email}.</p>
        <button className="danger-button wide" onClick={() => setSignOutOpen(true)}>
          <LogOut size={17} /> Sign out
        </button>
      </div>

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        body="You will need your email and password to sign back in. Nothing is deleted."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        tone="danger"
        onConfirm={() => {
          setSignOutOpen(false)
          leave()
        }}
        onCancel={() => setSignOutOpen(false)}
      />
    </div>
  )
}
