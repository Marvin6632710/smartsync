import React from 'react'
import { CalendarDays, Clock3, Edit3, MapPin, MessageCircle, Sparkles, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'

export default function ActivityDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { recommendations, joinedIds, joinActivity, leaveActivity } = useApp()
  const a = recommendations.find((item) => item.id === id)

  if (!a) {
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Activity not found</h3>
          <p>Please go back.</p>
          <button className="primary-button" onClick={() => navigate('/home')}>Back</button>
        </div>
      </div>
    )
  }

  const joined = joinedIds.includes(id)
  const fill = Math.max(0, Math.min(100, Math.round((a.participants / Math.max(a.capacity, 1)) * 100)))

  return (
    <div className="page-content">
      <BackButton />

      <section className="detail-hero detail-premium" data-category={(a.category || '').toLowerCase()}>
        <div className="card-topline">
          <span className="category-chip">{a.category}</span>
          <span className="match-pill"><Sparkles size={14}/>{a.matchScore}%</span>
        </div>
        <h2>{a.title}</h2>
        <p>{a.description}</p>
        <div className="detail-facts">
          <span><MapPin/>{a.location} · {a.distanceKm} km</span>
          <span><CalendarDays/>{a.date}</span>
          <span><Clock3/>{a.time}</span>
          <span><Users/>{a.participants}/{a.capacity}</span>
        </div>
        <div className="capacity-meter large-meter"><span style={{ width: `${fill}%` }} /></div>
      </section>

      <section className="panel spotlight-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Why this?</span>
            <h2>Match reasons</h2>
          </div>
          <button className="text-button" onClick={() => navigate(`/recommendations/${id}`)}>More</button>
        </div>
        <ul className="reason-list">{a.reasons.map((r) => <li key={r}>✓ {r}</li>)}</ul>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Host</span>
            <h3>{a.host}</h3>
          </div>
          <span className="count-chip">Participants</span>
        </div>
        <p className="helper-text">See who joined.</p>
        <button className="secondary-button" onClick={() => navigate(`/activity/${id}/participants`)}><Users size={17}/> View participants</button>
      </section>

      {a.createdBy === 'me' && <button className="secondary-button wide" onClick={() => navigate(`/activity/${id}/edit`)}><Edit3 size={17}/> Edit activity</button>}

      {joined ? (
        <div className="action-stack">
          <button className="primary-button wide" onClick={() => navigate(`/activity/${id}/chat`)}><MessageCircle size={18}/> Open chat</button>
          <button className="danger-button wide" onClick={() => leaveActivity(id)}>Leave activity</button>
        </div>
      ) : (
        <button className="primary-button wide" disabled={a.participants >= a.capacity} onClick={() => joinActivity(id)}>
          {a.participants >= a.capacity ? 'Full' : 'Join activity'}
        </button>
      )}
    </div>
  )
}
