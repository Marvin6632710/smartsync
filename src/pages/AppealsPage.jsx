import React, { useEffect, useMemo, useState } from 'react'
import { Scale } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import AppealButton from '../components/AppealButton'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { watchModerationAppeals } from '../firebase/admin'
import { formatRelativeTime } from '../utils/time'

const EMPTY_ACTIVITIES = []

export default function AppealsPage({ standalone = false }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const app = useApp()
  const allActivities = app.allActivities || EMPTY_ACTIVITIES
  const [appeals, setAppeals] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => watchModerationAppeals(setAppeals, setError, { mine: true }), [])

  const options = useMemo(() => {
    const list = []
    if (user.suspended) list.push({ kind: 'suspension', targetId: user.uid })
    if (user.banned) list.push({ kind: 'closure', targetId: user.uid })
    for (const field of ['picture', 'bio', 'username']) {
      if (user.contentModeration?.[field]?.active) {
        list.push({ kind: `profile-${field}`, targetId: user.uid })
      }
    }
    if (!standalone) {
      for (const activity of allActivities.filter((row) => row.hostId === user.uid)) {
        if (activity.status === 'removed') {
          list.push({ kind: 'activity', targetId: activity.id, label: activity.title })
        }
        if (activity.contentModeration?.picture?.active) {
          list.push({ kind: 'activity-picture', targetId: activity.id, label: activity.title })
        }
      }
    }
    return list
  }, [allActivities, standalone, user])

  return (
    <div className={standalone ? 'appeals-standalone' : 'page-content'}>
      <div className="appeals-heading">
        <span className="appeals-heading-icon" aria-hidden="true">
          <Scale size={24} />
        </span>
        <div>
          <h2>{t('appeals.title')}</h2>
          <p>{t('appeals.intro')}</p>
        </div>
      </div>

      <section className="panel appeal-options">
        <h3>{t('appeals.available')}</h3>
        {options.length === 0 ? (
          <p className="helper-text">{t('appeals.noneAvailable')}</p>
        ) : (
          options.map((option) => (
            <div className="appeal-option" key={`${option.kind}-${option.targetId}`}>
              <span>
                <strong>{t(`adminPowers.appealKind.${option.kind}`)}</strong>
                {option.label && <small>{option.label}</small>}
              </span>
              <AppealButton {...option} />
            </div>
          ))
        )}
        <p className="helper-text">{t('appeals.messageHint')}</p>
      </section>

      <section className="panel">
        <h3>{t('appeals.history')}</h3>
        {error ? (
          <p className="form-error">{t('appeals.loadFailed')}</p>
        ) : appeals.length === 0 ? (
          <p className="helper-text">{t('appeals.noHistory')}</p>
        ) : (
          <div className="appeal-history">
            {appeals.map((appeal) => (
              <article key={appeal.id}>
                <div>
                  <strong>{t(`adminPowers.appealKind.${appeal.kind}`)}</strong>
                  <small>
                    {formatRelativeTime(appeal.createdAt?.toMillis?.() ?? appeal.createdAt)}
                  </small>
                </div>
                <span className="status-pill" data-status={appeal.status}>
                  {t(`adminPowers.appealStatus.${appeal.status}`, {
                    defaultValue: appeal.status,
                  })}
                </span>
                {appeal.outcome && <p>{appeal.outcome}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
