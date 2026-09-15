import React from 'react'
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  Link2,
  LogOut,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { useApp } from '../context/AppContext'

const toastIcons = {
  sparkles: Sparkles,
  check: Check,
  bell: Bell,
  'bell-off': BellOff,
  'log-out': LogOut,
  trash: Trash2,
  rotate: RotateCcw,
  link: Link2,
  alert: AlertTriangle,
}

/**
 * The one toast, wherever it is needed.
 *
 * It lived inside the shell, so anything said from a screen outside it —
 * the two onboarding pages — was never shown: a refused interests save left
 * a button that simply did not advance, and a failed sign-out changed
 * nothing on screen. The shell still renders it; the standalone pages now
 * can too.
 */
export default function CelebrationToast() {
  const { celebration } = useApp()
  if (!celebration) return null
  const Icon = toastIcons[celebration.icon] || Sparkles
  return (
    <div className="celebration-toast" key={celebration.id} role="status" aria-live="polite">
      <div className={`toast-icon ${celebration.tone || 'default'}`}>
        <Icon size={18} />
      </div>
      <div>
        <strong>{celebration.title}</strong>
        <p>{celebration.body}</p>
      </div>
    </div>
  )
}
