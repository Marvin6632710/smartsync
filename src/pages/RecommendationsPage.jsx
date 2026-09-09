import React from 'react'
import { ChevronRight, Sparkles, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import ActivityCard from '../components/ActivityCard'
import FiltersEmptyState from '../components/FiltersEmptyState'
import ActivitiesLoading from '../components/ActivitiesLoading'
import { useApp } from '../context/AppContext'

export default function RecommendationsPage() {
  const { filteredActivities, loading } = useApp()
  const navigate = useNavigate()

  const top = filteredActivities[0]

  return (
    <div className="page-content">
      {/* HEADER */}
      <section className="headline-block">
        <span className="eyebrow">AI Picks</span>

        <h2>Made for you</h2>

        <p className="helper-text">Activities that match your interests.</p>
      </section>

      {/* TOP MATCH */}
      {top && (
        <section
          className="surprise-card"
          onClick={() => navigate(`/activity/${top.id}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate(`/activity/${top.id}`)
            }
          }}
          role="button"
          tabIndex="0"
        >
          <div className="surprise-copy">
            <span className="eyebrow">Best match</span>

            <h3>{top.title}</h3>

            <p>{top.reasons?.[0]}</p>
          </div>

          <div className="surprise-score">
            <Sparkles size={18} />

            <strong>{top.matchScore}%</strong>
          </div>
        </section>
      )}

      {/* USER MATCHING */}
      <button className="people-match-banner" onClick={() => navigate('/matching')}>
        <div className="people-match-icon">
          <UsersRound size={23} />
        </div>

        <div className="people-match-copy">
          <strong>People for you</strong>

          <span>Find similar people and follow their activities</span>
        </div>

        <ChevronRight size={18} />
      </button>

      {/* ACTIVITIES */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Recommended</span>

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
            filteredActivities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
