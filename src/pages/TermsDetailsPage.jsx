import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import TermsText from '../components/TermsText'

/**
 * The full Terms & Safety text at /terms, for looking up after it was
 * agreed to: from the front door's footer before signing in, and from
 * Settings after. Inside the shell the bar provides the way back; on its
 * own it needs one.
 */
export default function TermsDetailsPage({ standalone = false }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (standalone) {
    return (
      <div className="standalone-page terms-reading">
        <div className="terms-doc-bar">
          <button
            type="button"
            className="icon-button"
            onClick={() => navigate('/')}
            aria-label={t('common.back')}
          >
            <ArrowLeft size={18} />
          </button>
          <h1>{t('terms.fullTitle')}</h1>
        </div>
        <TermsText />
      </div>
    )
  }

  return (
    <div className="page-content terms-content">
      <h2>{t('terms.fullTitle')}</h2>
      <TermsText headingLevel={3} />
    </div>
  )
}
