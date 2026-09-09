import React, { useState } from 'react'
import {
  Bell,
  ChevronRight,
  LogOut,
  MessageCircle,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuth } from '../context/AuthContext'
import { updatePrivateProfile } from '../firebase/users'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [signOutOpen, setSignOutOpen] = useState(false)
  const privacy = user.privacy

  return (
    <div className="page-content">
      <BackButton />
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
          onClick={() =>
            updatePrivateProfile(user.uid, {
              privacy: { ...privacy, notifications: !privacy.notifications },
            })
          }
          role="switch"
          aria-checked={privacy.notifications}
        >
          <Bell size={18} />
          <span>
            <strong>Notifications</strong>
            <small>Joins, messages and activity updates</small>
          </span>
          <span className={`switch ${privacy.notifications ? 'on' : ''}`} aria-hidden="true" />
        </button>
      </div>

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
          signOut()
        }}
        onCancel={() => setSignOutOpen(false)}
      />
    </div>
  )
}
