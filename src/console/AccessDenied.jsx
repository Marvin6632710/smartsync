import React from 'react'
import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import BrandMark from '../components/BrandMark'
import './console.css'

/**
 * The console's door, closed. Somebody who is not an admin should never
 * have got here, but the address is guessable and the screen must not
 * depend on the menu hiding it — so it says what this is and offers the
 * way back, and nothing of what lies behind it. The rules refuse every
 * read and write anyway; this is the courtesy, not the control.
 *
 * `reason`: 'admins' for anybody without the rank, 'suspended' for an
 * admin on hold.
 */
export default function AccessDenied({ reason = 'admins' }) {
  const { t } = useTranslation()
  return (
    <div className="console-denied">
      <div className="console-denied-card" role="alert">
        <BrandMark tile size={40} />
        <ShieldAlert size={26} aria-hidden="true" />
        <h1>{t(`console.denied.${reason}Title`)}</h1>
        <p>{t(`console.denied.${reason}Body`)}</p>
        <div className="con-action-row">
          <Link className="secondary-button" to="/home">
            {t('console.backToApp')}
          </Link>
        </div>
      </div>
    </div>
  )
}
