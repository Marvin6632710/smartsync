import React from 'react'
import { useTranslation } from 'react-i18next'
import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'

export default function JoinedActivitiesPage() {
  // Already in the order commitments are kept: upcoming soonest first, then
  // what has been. An activity you joined that the host later cancelled is
  // still in it — this is your history, and recommendations drops those.
  const { t } = useTranslation()
  const { joinedActivities: joined } = useApp()
  return (
    <div className="page-content">
      <span className="eyebrow">{t('joined.eyebrow')}</span>
      <h2>{t('joined.title')}</h2>
      <div className="stack">
        {joined.map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
        {joined.length === 0 && (
          <div className="empty-state">
            <h3>{t('joined.none')}</h3>
            <p>{t('joined.noneBody')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
