import React, { useState } from 'react'
import { Flag } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { storedContext } from '../i18n/reportContext'
import BootScreen from '../components/BootScreen'
import ReportDialog from '../components/ReportDialog'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { categoryLabel } from '../i18n'

export default function ParticipantsPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { activities, peers, loading, syncing } = useApp()
  const { user } = useAuth()
  const [reporting, setReporting] = useState(null)
  const activity = activities.find((item) => item.id === id)

  if (!activity && (loading || syncing)) return <BootScreen />

  if (!activity)
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>{t('activity.notFound')}</h3>
        </div>
      </div>
    )

  // Real people, resolved from the roster on the activity itself. A uid with
  // no matching profile is still shown — someone is on the roster, and
  // silently dropping them would make the count disagree with the list.
  const directory = [user, ...peers]
  const participants = (activity.participantUids || []).map((uid) => {
    const person = directory.find((entry) => entry?.uid === uid)
    return person || { uid, name: t('common.unknownUser'), avatar: '?', interests: [] }
  })

  return (
    <div className="page-content">
      <span className="eyebrow">{activity.title}</span>
      <h2>{t('participants.title')}</h2>
      <p className="helper-text">
        {t('participants.spotsTaken', {
          count: activity.participants,
          capacity: activity.capacity,
        })}
      </p>
      <div className="stack">
        {participants.map((person) => (
          <div className="person-card" key={person.uid}>
            <div className="avatar">{person.avatar || '?'}</div>
            <div>
              <h3>
                {person.name}
                {person.uid === activity.hostId && (
                  <span className="tiny-chip host-chip">{t('common.host')}</span>
                )}
                {person.uid === user.uid && <span className="tiny-chip">{t('common.you')}</span>}
              </h3>
              <p>
                {(person.interests || []).slice(0, 3).map(categoryLabel).join(' · ') ||
                  t('participants.participant')}
              </p>
            </div>
            {/* Reporting belongs here, next to the people you are about to
                meet in person, rather than buried in a settings screen. */}
            {person.uid !== user.uid && (
              <button
                className="icon-button slim person-report"
                onClick={() =>
                  setReporting({
                    type: 'user',
                    id: person.uid,
                    name: person.name,
                    avatar: person.avatar,
                    label: 'participants.reportLabel',
                    context: storedContext('participant', { title: activity.title }),
                  })
                }
                aria-label={t('participants.reportPerson', { name: person.name })}
              >
                <Flag size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <ReportDialog
        open={Boolean(reporting)}
        subject={reporting}
        onClose={() => setReporting(null)}
      />
    </div>
  )
}
