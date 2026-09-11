import React from 'react'
import { ArrowUpRight, Clock3, MapPin, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CategoryIcon from './CategoryIcon'
import { formatDistance } from '../utils/geo'
import { formatActivityDate, formatClock } from '../utils/time'

export default function ActivityCard({ activity, compact = false }) {
  const navigate = useNavigate()
  const categoryKey = (activity.category || '').toLowerCase()
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
      onClick={() => navigate(`/activity/${activity.id}`)}
      aria-label={`Open ${activity.title}`}
    >
      <div className="activity-visual">
        <div className="card-topline">
          <span className="category-chip">
            <CategoryIcon category={activity.category} size={12} />
            {activity.category}
          </span>
          {/* A past activity only ever appears in your own history, where a
              match score is meaningless — what matters is that it is over. */}
          {activity.isPast ? (
            <span className="match-pill ended-pill">Ended</span>
          ) : (
            <span className="match-pill">{activity.matchScore ?? '--'}% match</span>
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
              ? `${formatDistance(activity.distanceKm)} · ${activity.locationName}`
              : activity.locationName}
          </span>
        </div>

        <div className="activity-foot">
          <span className="going-count">
            <Users size={13} /> {activity.participants}/{activity.capacity}
          </span>
          <div className="capacity-meter" aria-hidden="true">
            <span style={{ width: `${fill}%` }} />
          </div>
          <ArrowUpRight size={16} />
        </div>
      </div>
    </button>
  )
}
