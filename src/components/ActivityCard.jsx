import React, { useRef } from 'react'
import { ArrowUpRight, Clock3, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CategoryIcon from './CategoryIcon'
import GoingStack from './GoingStack'
import { useMorph } from '../hooks/useMorph'
import { categoryLabel, distanceLabel } from '../i18n'
import { formatActivityDate, formatClock } from '../utils/time'
import { activityBadge } from '../utils/urgency'

export default function ActivityCard({ activity, compact = false }) {
  const { t } = useTranslation()
  const morph = useMorph()
  // The coloured header, which is the half that grows into the activity page.
  // Naming the whole card would drag its white body along, and a white block
  // stretching into a coloured one looks like a glitch rather than a move.
  const visual = useRef(null)
  const categoryKey = (activity.category || '').toLowerCase()
  // At most one, chosen by what would change your mind: see activityBadge.
  const badge = activityBadge(activity)
  const fill = Math.max(
    0,
    Math.min(
      100,
      Math.round(((activity.participants || 0) / Math.max(activity.capacity || 1, 1)) * 100),
    ),
  )
  return (
    <button
      className={`activity-card ${compact ? 'compact' : ''}`}
      data-category={categoryKey}
      onClick={() => morph(`/activity/${activity.id}`, visual.current)}
      aria-label={t('card.open', { title: activity.title })}
    >
      <div className="activity-visual" ref={visual}>
        <div className="card-topline">
          <span className="category-chip">
            <CategoryIcon category={activity.category} size={12} />
            {categoryLabel(activity.category)}
          </span>
          {/* A past activity only ever appears in your own history, where a
              match score is meaningless — what matters is that it is over. */}
          {activity.isPast ? (
            <span className="match-pill ended-pill">{t('card.ended')}</span>
          ) : (
            <span className="match-pill">
              {t('common.match', { value: activity.matchScore ?? '--' })}
            </span>
          )}
        </div>
        <div className="activity-title-block">
          <h3>{activity.title}</h3>
        </div>
      </div>

      {/* What you need to decide whether to open it, and nothing else.
          The description, the tags and the match reasoning all used to sit
          here, which made every card a paragraph and a list of twelve plans a
          wall of text — you could fit two on a screen. They are on the
          activity's own page, one tap away, which is where somebody who is
          actually interested will read them. */}
      <div className="activity-body">
        <div className="meta-line">
          <span>
            <Clock3 size={13} /> {formatActivityDate(activity.date)} · {formatClock(activity.time)}
          </span>
          <span>
            <MapPin size={13} />{' '}
            {/* Distance is unknown until the user shares their location, and
                showing nothing is more honest than showing a made-up number. */}
            {activity.distanceKm != null
              ? `${distanceLabel(activity.distanceKm)} · ${activity.locationName}`
              : activity.locationName}
          </span>
        </div>

        <div className="activity-foot">
          <GoingStack uids={activity.participantUids} capacity={activity.capacity} />
          {badge && <span className={`urgency-pill tone-${badge.tone}`}>{badge.label}</span>}
          <ArrowUpRight size={16} className="card-go" aria-hidden="true" />
        </div>
      </div>

      {/* A hairline across the foot of the card rather than a bar squeezed
          between the count and the arrow: it reads as how full this is
          without asking for a share of the row. */}
      <div className="capacity-meter" aria-hidden="true">
        <span style={{ width: `${fill}%` }} />
      </div>
    </button>
  )
}
