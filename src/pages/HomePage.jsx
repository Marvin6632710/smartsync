import React from 'react'
import { ArrowRight, Filter, Map, Search, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ActivityCard from '../components/ActivityCard'
import FiltersEmptyState from '../components/FiltersEmptyState'
import ActivitiesLoading from '../components/ActivitiesLoading'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export default function HomePage() {
  const navigate = useNavigate()
  const { filteredActivities, recommendations, joinedIds, threadPreviews, loading } = useApp()
  const { user } = useAuth()
  const top = recommendations.slice(0, 2)
  const heroPick = recommendations[0]
  const activeChats = joinedIds.filter((id) => threadPreviews[id]).length

  return (
    <div className="page-content">
      <section className="hero-card">
        <div className="hero-badge-row">
          <span className="floating-pill">
            {user.anonymous ? 'Anonymous mode' : `Hi, ${user.realName}`}
          </span>
          <span className="floating-pill accent">Top match {heroPick?.matchScore || '--'}%</span>
        </div>
        <h2>Find your next plan.</h2>
        <p>Nearby activities picked for you.</p>
        <div className="hero-stat-grid">
          <div className="stat-card">
            <span>Match</span>
            <strong>{heroPick?.matchScore || '--'}%</strong>
            <small>{heroPick?.category || 'Activity'}</small>
          </div>
          <div className="stat-card">
            <span>Joined</span>
            <strong>{joinedIds.length}</strong>
            <small>activities</small>
          </div>
          <div className="stat-card">
            <span>Chats</span>
            <strong>{activeChats}</strong>
            <small>open</small>
          </div>
        </div>
        <div className="hero-actions">
          <button onClick={() => navigate('/search')}>
            <Search size={17} /> Search
          </button>
          <button onClick={() => navigate('/filters')}>
            <Filter size={17} /> Filter
          </button>
          <button onClick={() => navigate('/map')}>
            <Map size={17} /> Map
          </button>
        </div>
      </section>

      <section className="interest-ribbon panel-lite">
        <div>
          <span className="eyebrow">Your interests</span>
          <h3>Made for your vibe</h3>
        </div>
        <div className="chip-row">
          {(user.interests || []).slice(0, 5).map((interest) => (
            <span className="tiny-chip" key={interest}>
              {interest}
            </span>
          ))}
        </div>
      </section>

      {heroPick && (
        <section
          className="surprise-card"
          onClick={() => navigate(`/activity/${heroPick.id}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate(`/activity/${heroPick.id}`)
            }
          }}
          role="button"
          tabIndex="0"
        >
          <div className="surprise-copy">
            <span className="eyebrow">Top pick</span>
            <h3>{heroPick.title}</h3>
            <p>{heroPick.reasons?.slice(0, 2).join(' • ')}</p>
          </div>
          <div className="surprise-score">
            <Sparkles size={18} />
            <strong>{heroPick.matchScore}%</strong>
            <span>Open</span>
          </div>
        </section>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">For you</span>
            <h2>Top activities</h2>
          </div>
          <button className="text-button" onClick={() => navigate('/recommendations')}>
            See all <ArrowRight size={15} />
          </button>
        </div>
        <div className="stack">
          {top.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      </section>

      <section
        className="insight-card"
        onClick={() => navigate('/recommendations')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            navigate('/recommendations')
          }
        }}
        role="button"
        tabIndex="0"
      >
        <div className="feature-icon">
          <Sparkles size={21} />
        </div>
        <div>
          <strong>How matching works</strong>
          <p>Interest, distance, time, history and popularity.</p>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Nearby</span>
            <h2>Activities</h2>
          </div>
          <span className="count-chip">{filteredActivities.length}</span>
        </div>
        <div className="stack">
          {loading ? (
            <ActivitiesLoading />
          ) : filteredActivities.length === 0 ? (
            <FiltersEmptyState />
          ) : (
            filteredActivities
              .slice(0, 5)
              .map((activity) => <ActivityCard key={activity.id} activity={activity} compact />)
          )}
        </div>
      </section>
    </div>
  )
}
