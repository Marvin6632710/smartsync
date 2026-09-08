import React from 'react'
import { ArrowUpRight, Clock3, MapPin, Users, WandSparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const categoryLabels = {
  football: 'Football',
  basketball: 'Basketball',
  running: 'Running',
  gym: 'Gym',
  study: 'Study',
  coffee: 'Coffee',
  gaming: 'Gaming',
  hangouts: 'Hangout',
  cycling: 'Cycling',
  movies: 'Movies',
  food: 'Food',
  events: 'Event',
}

export default function ActivityCard({ activity, compact = false }) {
  const navigate = useNavigate()
  const categoryKey = (activity.category || '').toLowerCase()
  const fill = Math.max(0, Math.min(100, Math.round(((activity.participants || 0) / Math.max(activity.capacity || 1, 1)) * 100)))
  const description = activity.description || 'Activity for you.'

  return (
    <button
      className={`activity-card ${compact ? 'compact' : ''}`}
      data-category={categoryKey}
      onClick={() => navigate(`/activity/${activity.id}`)}
      aria-label={`Open ${activity.title}`}
    >
      <div className="activity-visual">
        <div className="card-topline">
          <span className="category-chip">{activity.category}</span>
          <span className="match-pill"><WandSparkles size={14} /> {activity.matchScore ?? '--'}%</span>
        </div>
        <div className="activity-title-block">
          <small>{categoryLabels[categoryKey] || 'Activity'}</small>
          <h3>{activity.title}</h3>
          {!compact && <p>{description}</p>}
        </div>
      </div>

      <div className="activity-body">
        <div className="meta-grid">
          <span><MapPin size={15} /> {activity.distanceKm} km · {activity.location}</span>
          <span><Clock3 size={15} /> {activity.date} · {activity.time}</span>
          <span><Users size={15} /> {activity.participants}/{activity.capacity}</span>
        </div>

        <div className="capacity-meter" aria-hidden="true">
          <span style={{ width: `${fill}%` }} />
        </div>

        {!compact && (
          <div className="chip-row activity-tags">
            {(activity.tags || []).slice(0, 3).map((tag) => <span className="tiny-chip" key={tag}>{tag}</span>)}
          </div>
        )}

        <div className="reason-line">
          <span>{activity.reasons?.[0] || 'Good match for you'}</span>
          <ArrowUpRight size={15} />
        </div>
      </div>
    </button>
  )
}
