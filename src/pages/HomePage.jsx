import { ActivityPicture } from '../components/SavedPicture'
import React, { useMemo, useRef } from 'react'
import { ArrowRight, Filter, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMorph } from '../hooks/useMorph'
import ActivityCard from '../components/ActivityCard'
import CategoryIcon from '../components/CategoryIcon'
import FiltersEmptyState from '../components/FiltersEmptyState'
import ActivitiesLoading from '../components/ActivitiesLoading'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { activeFilterCount } from '../utils/filters'
import { formatActivityDate, formatClock, greetingFor, partOfDay, questionFor } from '../utils/time'
import { categoryLabel } from '../i18n'
import { pickForInterests } from '../services/interestPicks'

/**
 * Discover.
 *
 * Rebuilt around one measurement: the old version spent about seven hundred
 * pixels on a greeting, a stats trio and an interests card before the first
 * activity, so on a phone you reached the point of the app only by scrolling.
 *
 * Now the next thing on *is* the hero — a real, tappable thing to do tonight
 * rather than a dashboard about you — and the first ordinary card lands
 * within the first screen. Stats about your own account moved to Profile,
 * where somebody who wants them will go looking.
 */

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const morph = useMorph()
  const heroRef = useRef(null)
  const { filteredActivities, recommendations, loading, filters } = useApp()
  const { user } = useAuth()
  /**
   * Discover answers "what is on", AI Picks answers "what suits me".
   *
   * Both pages used to read the same ranked array, so they were one list
   * under two names. This page is ordered by *when*: the hero is the next
   * thing you could still join, and the list below runs soonest first.
   * Ranking by fit is the other page's job — Gemini's order, with the
   * reasons, and only your chosen interests underneath.
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
  // How many choices are narrowing the feed, on the button that opens them:
  // a short list should look filtered, not empty.
  const narrowing = activeFilterCount(filters)

  // The wide layouts are decided in the stylesheet from what is on the page:
  // with picks, the feed takes a sidebar; without, it takes the full width.
  return (
    <div
      className="page-content discover-page"
      data-part={part}
      data-picks={fromPicks.length > 0 ? 'yes' : 'no'}
    >
      <header className="discover-head" data-part={part}>
        <div>
          <span className="eyebrow">
            {user.anonymous
              ? t('home.anonymousMode')
              : t('home.greetingWithName', { greeting: greetingFor(part), name: firstName })}
          </span>
          {/* h2, not h1: the topbar already carries this page's h1, and
              every other screen in the shell follows the same shape. */}
          <h2>{questionFor(part)}</h2>
        </div>
      </header>

      <div className="discover-tools">
        <button onClick={() => navigate('/search')}>
          <Search size={16} /> {t('common.search')}
        </button>
        <button
          onClick={() => navigate('/filters')}
          data-active={narrowing > 0 ? 'yes' : 'no'}
          aria-label={narrowing > 0 ? t('home.filterActive', { count: narrowing }) : undefined}
        >
          <Filter size={16} /> {t('common.filter')}
          {narrowing > 0 && (
            <span className="tool-count" aria-hidden="true">
              {narrowing}
            </span>
          )}
        </button>
      </div>

      {heroPick && (
        <button
          className={`hero-pick ${heroPick.pictureVersion ? 'has-picture' : ''}`}
          ref={heroRef}
          data-category={(heroPick.category || '').toLowerCase()}
          onClick={() => morph(`/activity/${heroPick.id}`, heroRef.current)}
        >
          <ActivityPicture activity={heroPick} />
          <div className="hero-pick-top">
            <span className="category-chip">
              <CategoryIcon category={heroPick.category} size={12} />
              {categoryLabel(heroPick.category)}
            </span>
          </div>
          <h2>{heroPick.title}</h2>
          <p className="hero-when">
            {formatActivityDate(heroPick.date)} · {formatClock(heroPick.time)} ·{' '}
            {heroPick.locationName}
          </p>
          {/* Room for it on a wide screen, where the hero is a banner rather
              than a card; a phone shows it on the activity's own page. */}
          {heroPick.description && <p className="hero-desc">{heroPick.description}</p>}
          <span className="hero-cta">
            {t('home.takeALook')} <ArrowRight size={16} />
          </span>
        </button>
      )}

      {fromPicks.length > 0 && (
        <section className="section-block picks-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t('home.fromInterests')}</span>
              <h2>{t('home.aiPicks')}</h2>
            </div>
            <button className="text-button" onClick={() => navigate('/recommendations')}>
              {t('common.seeAll')} <ArrowRight size={15} />
            </button>
          </div>
          <div className="stack card-grid">
            {fromPicks.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        </section>
      )}

      <section className="section-block soon-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t('home.soonestFirst')}</span>
            <h2>{t('home.happeningSoon')}</h2>
          </div>
          <span className="count-chip">{soonest.length}</span>
        </div>
        <div className="stack card-grid">
          {loading ? (
            <ActivitiesLoading />
          ) : filteredActivities.length === 0 ? (
            <FiltersEmptyState />
          ) : (
            // Every activity that passed the filters, not a sample of them.
            // This used to stop at six, with the count beside the heading
            // still reporting the true total — so a feed of eighteen showed
            // six cards under the number 18, with nothing on the screen
            // saying the rest existed or how to reach them. People read
            // that as their activity never having been posted, and because
            // the order is by start time, the ones cut were whichever
            // categories happened to fall later.
            soonest.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} compact />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
