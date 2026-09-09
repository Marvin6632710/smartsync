import React, { useState } from 'react'
import { CalendarDays, Check, Clock3, Edit3, MapPin, MessageCircle, Users } from 'lucide-react'
import CategoryIcon from '../components/CategoryIcon'
import ConfirmDialog from '../components/ConfirmDialog'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'

export default function ActivityDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { recommendations, joinedIds, joinActivity, leaveActivity, cancelActivity } = useApp()
  // Declared before the not-found early return: hooks must run
  // unconditionally on every render.
  const [cancelOpen, setCancelOpen] = useState(false)
  const a = recommendations.find((item) => item.id === id)

  if (!a) {
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Activity not found</h3>
          <p>Please go back.</p>
          <button className="primary-button" onClick={() => navigate('/home')}>
            Back
          </button>
        </div>
      </div>
    )
  }

  const joined = joinedIds.includes(id)
  const isHost = a.createdBy === 'me'
  const fill = Math.max(
    0,
    Math.min(100, Math.round((a.participants / Math.max(a.capacity, 1)) * 100)),
  )

  const confirmCancel = () => {
    setCancelOpen(false)
    cancelActivity(id)
    navigate('/home')
  }

  return (
    <div className="page-content">
      <BackButton />

      <section className="detail-hero" data-category={(a.category || '').toLowerCase()}>
        <div className="card-topline">
          <span className="category-chip">
            <CategoryIcon category={a.category} size={12} />
            {a.category}
          </span>
          <span className="match-pill">{a.matchScore}% match</span>
        </div>
        <h2>{a.title}</h2>
        <p>{a.description}</p>
        <div className="detail-facts">
          <span>
            <MapPin size={14} />
            {a.location} · {a.distanceKm} km
          </span>
          <span>
            <CalendarDays size={14} />
            {a.date}
          </span>
          <span>
            <Clock3 size={14} />
            {a.time}
          </span>
          <span>
            <Users size={14} />
            {a.participants}/{a.capacity} joined
          </span>
        </div>
        <div className="capacity-meter large-meter">
          <span style={{ width: `${fill}%` }} />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Why this?</span>
            <h2>Match reasons</h2>
          </div>
          <button className="text-button" onClick={() => navigate(`/recommendations/${id}`)}>
            More
          </button>
        </div>
        <ul className="reason-list">
          {a.reasons.map((r) => (
            <li key={r}>
              <Check size={15} />
              {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Host</span>
            <h3>{a.host}</h3>
          </div>
        </div>
        <p className="helper-text">See who else is going.</p>
        <button
          className="secondary-button"
          onClick={() => navigate(`/activity/${id}/participants`)}
        >
          <Users size={17} /> View participants
        </button>
      </section>

      {isHost && (
        <button className="secondary-button wide" onClick={() => navigate(`/activity/${id}/edit`)}>
          <Edit3 size={17} /> Edit activity
        </button>
      )}

      {isHost ? (
        <div className="action-stack">
          <button className="primary-button wide" onClick={() => navigate(`/activity/${id}/chat`)}>
            <MessageCircle size={18} /> Open chat
          </button>
          <button className="danger-button wide" onClick={() => setCancelOpen(true)}>
            Cancel activity
          </button>
        </div>
      ) : joined ? (
        <div className="action-stack">
          <button className="primary-button wide" onClick={() => navigate(`/activity/${id}/chat`)}>
            <MessageCircle size={18} /> Open chat
          </button>
          <button className="danger-button wide" onClick={() => leaveActivity(id)}>
            Leave activity
          </button>
        </div>
      ) : (
        <button
          className="primary-button wide"
          disabled={a.participants >= a.capacity}
          onClick={() => joinActivity(id)}
        >
          {a.participants >= a.capacity ? 'Full' : 'Join activity'}
        </button>
      )}

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this activity?"
        body={`${a.title} will be removed for everyone who joined. This can't be undone.`}
        confirmLabel="Cancel activity"
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={confirmCancel}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  )
}
