import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useConsole } from '../ConsoleContext'
import { KindBadge, Empty, When } from './index'
import { takedownReasonText } from '../../i18n'

/**
 * A list of history events (see ../history.js), newest first: when, what,
 * who did it, to whom, and why — with a way to the report or the activity
 * it concerns. `base` is the console the links stay inside.
 */
export default function Timeline({ events, base, emptyTitle, emptyBody, compact = false }) {
  const { t } = useTranslation()
  const { nameFor, activityById } = useConsole()

  if (events.length === 0) {
    return <Empty title={emptyTitle || t('console.history.none')} body={emptyBody} />
  }

  return (
    <ol className={`con-timeline ${compact ? 'compact' : ''}`}>
      {events.map((event) => {
        const activity = event.activityId ? activityById.get(event.activityId) : null
        return (
          <li key={event.id} className="con-event">
            <div className="con-event-head">
              <KindBadge kind={event.kind} />
              <When at={event.at} exact={!compact} />
            </div>
            <div className="con-event-body">
              <span className="con-event-who">
                {t('console.history.byTo', {
                  by: nameFor(event.by),
                  subject: nameFor(event.subjectId),
                })}
              </span>
              {event.reason && (
                <span className="con-event-reason">“{takedownReasonText(event.reason)}”</span>
              )}
              <span className="con-event-links">
                {event.subjectId && (
                  <Link to={`${base}/accounts/${event.subjectId}`}>
                    {t('console.history.account')}
                  </Link>
                )}
                {event.reportId && (
                  <Link to={`${base}/reports/${event.reportId}`}>
                    {t('console.history.report')}
                  </Link>
                )}
                {event.activityId && (
                  <Link to={`/activity/${event.activityId}`}>
                    {activity?.title || t('console.history.activity')}
                  </Link>
                )}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
