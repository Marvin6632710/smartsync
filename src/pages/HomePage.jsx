import React, { useMemo, useRef } from 'react'
import { ArrowRight, Filter, Map, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCountUp } from '../hooks/useCountUp'
import { useMorph } from '../hooks/useMorph'
import ActivityCard from '../components/ActivityCard'
import CategoryIcon from '../components/CategoryIcon'
import FiltersEmptyState from '../components/FiltersEmptyState'
import ActivitiesLoading from '../components/ActivitiesLoading'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { formatActivityDate, formatClock, greetingFor, partOfDay, questionFor } from '../utils/time'
import { pickForInterests } from '../services/interestPicks'

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
/** Its own component so the counter's re-renders stop at this element. */
function HeroScore({ value }) {
  const shown = useCountUp(value)
  return <span className="hero-score">{shown}%</span>
}

export default function HomePage() {
  const navigate = useNavigate()
  const morph = useMorph()
  const heroRef = useRef(null)
  const { filteredActivities, recommendations, loading } = useApp()
  const { user } = useAuth()
  /**
   * Discover answers "what is on", AI Picks answers "what suits me".
   *
   * Both pages used to read the same match-ranked array, so they were one
   * list under two names. This page is now ordered by *when*: the hero is
   * the next thing you could still join, and the list below runs soonest
   * first. Ranking by fit is the other page's job, and it does it properly
   * — only your chosen interests, grouped, with its working shown.
   */
  const soonest = useMemo(
    () => [...filteredActivities].sort((a, b) => (a.startsAt || 0) - (b.startsAt || 0)),
    [filteredActivities],
  )
  // The next one with room. Something already full is not an answer to
  // "what am I doing tonight".
  const heroPick = useMemo(
    () => soonest.find((a) => (a.participants || 0) < (a.capacity || 0)) || soonest[0],
    [soonest],
  )
  // A short taste of the other page, plainly labelled as such — a pointer
  // rather than a second copy of it.
  const fromPicks = useMemo(
    () =>
      pickForInterests(recommendations, user.interests)
        .filter((a) => a.id !== heroPick?.id)
        .slice(0, 2),
    [recommendations, user.interests, heroPick],
  )
  const firstName = (user.realName || '').split(' ')[0]
  // Recomputed on every render rather than held in state: the only thing that
  // could change it is the clock crossing an hour boundary, and a screen this
  // cheap to re-render will do that on its own long before anyone notices.
  const part = partOfDay()

  return (
    <div className="page-content">
      <header className="discover-head" data-part={part}>
        <div>
          <span className="eyebrow">
            {user.anonymous ? 'Anonymous mode' : `${greetingFor(part)}, ${firstName}`}
          </span>
          {/* h2, not h1: the topbar already carries this page's h1, and
              every other screen in the shell follows the same shape. */}
          <h2>{questionFor(part)}</h2>
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
          ref={heroRef}
          data-category={(heroPick.category || '').toLowerCase()}
          onClick={() => morph(`/activity/${heroPick.id}`, heroRef.current)}
        >
          <div className="hero-pick-top">
            <span className="category-chip">
              <CategoryIcon category={heroPick.category} size={12} />
              {heroPick.category}
            </span>
            <HeroScore value={heroPick.matchScore} />
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

      {fromPicks.length > 0 && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">From your interests</span>
              <h2>AI Picks</h2>
            </div>
            <button className="text-button" onClick={() => navigate('/recommendations')}>
              See all <ArrowRight size={15} />
            </button>
          </div>
          <div className="stack">
            {fromPicks.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        </section>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Soonest first</span>
            <h2>Happening soon</h2>
          </div>
          <span className="count-chip">{soonest.length}</span>
        </div>
        <div className="stack">
          {loading ? (
            <ActivitiesLoading />
          ) : filteredActivities.length === 0 ? (
            <FiltersEmptyState />
          ) : (
            soonest
              .slice(0, 6)
              .map((activity) => <ActivityCard key={activity.id} activity={activity} compact />)
          )}
        </div>
      </section>
    </div>
  )
}
