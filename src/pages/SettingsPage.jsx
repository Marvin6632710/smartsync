import React from 'react'
import {
  Bell,
  ChevronRight,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { privacy, setPrivacy, resetPrototype } = useApp()
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
            <small>Temporary local conversations</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button
          className="setting-row"
          onClick={() => setPrivacy((p) => ({ ...p, notifications: !p.notifications }))}
          role="switch"
          aria-checked={privacy.notifications}
        >
          <Bell size={18} />
          <span>
            <strong>Notifications</strong>
            <small>Local prototype notifications</small>
          </span>
          <span className={`switch ${privacy.notifications ? 'on' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <div className="panel danger-panel">
        <h3>Prototype data</h3>
        <p className="helper-text">
          Reset localStorage data back to the original SmartSync demo content.
        </p>
        <button
          className="danger-button wide"
          onClick={() => {
            if (window.confirm('Reset SmartSync prototype data?')) resetPrototype()
          }}
        >
          <RotateCcw size={17} /> Reset prototype
        </button>
      </div>
    </div>
  )
}
