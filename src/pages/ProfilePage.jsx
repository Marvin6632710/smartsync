import React from 'react'
import { Edit3, Settings, Share2, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'

export default function ProfilePage() {
  const { user, privacy, activities, joinedIds, recommendations } = useApp()
  const navigate = useNavigate()
  const joined = activities.filter((a) => joinedIds.includes(a.id))
  const best = recommendations[0]

  return (
    <div className="page-content light-page">
      <section className="profile-showcase">
        <div className="profile-actions-top">
          <button className="icon-button slim" onClick={() => navigate('/settings')}>
            <Settings size={18} />
          </button>
          <div className="mini-actions">
            <button className="icon-button slim">
              <Share2 size={18} />
            </button>
            <button className="icon-button slim">
              <ShieldCheck size={18} />
            </button>
          </div>
        </div>
        <div className="profile-center">
          <div className="avatar xl">{privacy.anonymousMode ? 'AN' : user.avatar}</div>
          <h2>{privacy.anonymousMode ? 'Anonymous user' : user.name}</h2>
          <p>{user.bio}</p>
          <div className="profile-handle">{user.username}</div>
        </div>
      </section>

      <section className="promo-card">
        <div className="promo-icon">★</div>
        <div>
          <strong>Upgrade your profile</strong>
          <p>Unlock more visibility and better matching.</p>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Overview</span>
            <h2>Your activity life</h2>
          </div>
          <button className="text-button" onClick={() => navigate('/profile/edit')}>
            <Edit3 size={16} /> Edit
          </button>
        </div>
        <div className="profile-stats-grid compact-stats">
          <div className="stat-card">
            <span>Joined</span>
            <strong>{joined.length}</strong>
            <small>activities</small>
          </div>
          <div className="stat-card">
            <span>Top match</span>
            <strong>{best?.matchScore || '--'}%</strong>
            <small>{best?.category || 'Activity'}</small>
          </div>
        </div>
        <div className="chip-row">
          {user.interests.map((i) => (
            <span className="tiny-chip" key={i}>
              {i}
            </span>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Joined</span>
            <h2>Recent activities</h2>
          </div>
          <button className="text-button" onClick={() => navigate('/joined')}>
            See all
          </button>
        </div>
        <div className="stack">
          {joined.slice(0, 2).map((a) => (
            <ActivityCard key={a.id} activity={{ ...a, matchScore: '—' }} compact />
          ))}
        </div>
      </section>
    </div>
  )
}
