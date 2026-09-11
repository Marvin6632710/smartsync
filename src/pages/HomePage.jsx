import React from 'react'
import { ArrowRight, Filter, Map, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ActivityCard from '../components/ActivityCard'
import CategoryIcon from '../components/CategoryIcon'
import FiltersEmptyState from '../components/FiltersEmptyState'
import ActivitiesLoading from '../components/ActivitiesLoading'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { formatActivityDate, formatClock } from '../utils/time'

/**
 * Discover.
 *
 * Rebuilt around one measurement: the old version spent about seven hundred
 * pixels on a greeting, a stats trio and an interests card before the first
 * activity, so on a phone you reached the point of the app only by scrolling.
 * It also printed the same match percentage four times on one screen.
 *
 * Now the top pick *is* the hero — a real, tappable thing to do tonight rather
 * than a dashboard about you — and the first ordinary card lands within the
 * first screen. Stats about your own account moved to Profile, where somebody
 * who wants them will go looking.
 */
export default function HomePage() {
  const navigate = useNavigate()
  const { filteredActivities, recommendations, loading } = useApp()
  const { user } = useAuth()
  const heroPick = recommendations[0]
  const rest = recommendations.slice(1, 3)
  const firstName = (user.realName || '').split(' ')[0]

  return (
    <div className="page-content">
      <header className="discover-head">
        <div>
          <span className="eyebrow">{user.anonymous ? 'Anonymous mode' : `Hi, ${firstName}`}</span>
          <h1>What are you doing tonight?</h1>
        </div>
      </header>

      <div className="discover-tools">
        <button onClick={() => navigate('/search')}>
          <Search size={16} /> Search
        </button>
        <button onClick={() => navigate('/filters')}>
          <Filter size={16} /> Filter
        </button>
        <button onClick={() => navigate('/map')}>
          <Map size={16} /> Map
        </button>
      </div>

      {heroPick && (
        <button
          className="hero-pick"
          data-category={(heroPick.category || '').toLowerCase()}
          onClick={() => navigate(`/activity/${heroPick.id}`)}
        >
          <div className="hero-pick-top">
            <span className="category-chip">
              <CategoryIcon category={heroPick.category} size={12} />
              {heroPick.category}
            </span>
            <span className="hero-score">{heroPick.matchScore}%</span>
          </div>
          <h2>{heroPick.title}</h2>
          <p className="hero-when">
            {formatActivityDate(heroPick.date)} · {formatClock(heroPick.time)} ·{' '}
            {heroPick.locationName}
          </p>
          <p className="hero-why">{heroPick.reasons?.slice(0, 2).join(' • ')}</p>
          <span className="hero-cta">
            Take a look <ArrowRight size={16} />
          </span>
        </button>
      )}

      {rest.length > 0 && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">For you</span>
              <h2>Also worth a look</h2>
            </div>
            <button className="text-button" onClick={() => navigate('/recommendations')}>
              See all <ArrowRight size={15} />
            </button>
          </div>
          <div className="stack">
            {rest.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        </section>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Nearby</span>
            <h2>Happening soon</h2>
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
              .slice(0, 6)
              .map((activity) => <ActivityCard key={activity.id} activity={activity} compact />)
          )}
        </div>
      </section>
    </div>
  )
}
