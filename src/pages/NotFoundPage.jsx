import React from 'react'
import { Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="page-content">
      <div className="empty-state">
        <Compass size={34} />
        <h2>{t('errors.pageNotFound')}</h2>
        <p>{t('errors.pageNotFoundBody')}</p>
        <button className="primary-button" onClick={() => navigate('/home')}>
          {t('errors.backToDiscovery')}
        </button>
      </div>
    </div>
  )
}
