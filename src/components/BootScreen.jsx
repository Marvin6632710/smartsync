import React from 'react'
import { useTranslation } from 'react-i18next'

import BrandMark from './BrandMark'

/**
 * Shown while Firebase restores the session from disk. Without it every
 * reload flashes the sign-in screen for a moment before landing the user back
 * where they were, which reads as a bug.
 */
export default function BootScreen({ label }) {
  const { t } = useTranslation()
  return (
    <div className="standalone-page boot-screen">
      <div className="brand-orb pulsing">
        <BrandMark tile size={72} className="orb-mark" />
      </div>
      <p className="boot-label">{label || t('common.loading')}</p>
    </div>
  )
}
