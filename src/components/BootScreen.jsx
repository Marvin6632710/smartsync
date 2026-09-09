import React from 'react'
import { Sparkles } from 'lucide-react'

/**
 * Shown while Firebase restores the session from disk. Without it every
 * reload flashes the sign-in screen for a moment before landing the user back
 * where they were, which reads as a bug.
 */
export default function BootScreen({ label = 'Loading…' }) {
  return (
    <div className="standalone-page boot-screen">
      <div className="brand-orb pulsing">
        <Sparkles size={34} />
      </div>
      <p className="boot-label">{label}</p>
    </div>
  )
}
