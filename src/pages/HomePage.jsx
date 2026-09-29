import { ActivityPicture } from '../components/SavedPicture'
import React, { useMemo, useRef } from 'react'
import { ArrowRight, Filter, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMorph } from '../hooks/useMorph'
import ActivityRail from '../components/ActivityRail'
import CategoryIcon from '../components/CategoryIcon'
import FiltersEmptyState from '../components/FiltersEmptyState'
import ActivitiesLoading from '../components/ActivitiesLoading'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { activeFilterCount } from '../utils/filters'
import { formatActivityDate, formatClock, greetingFor, partOfDay, questionFor } from '../utils/time'
import { categoryLabel } from '../i18n'
import { pickForInterests } from '../services/interestPicks'
import { discoverRows } from '../services/discoverRows'

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
 *
 * Below the hero the feed is rows you scroll sideways, the shape streaming
 * apps have taught everyone to read: a heading that says why these belong
 * together, and a row you can take in without committing to any of it. One
 * long list said only "here is everything", which is the one thing a
 * browsing reader is not asking for.
 *
 * What is in each row, and the guarantee that no activity falls out of all
 * of them, is `services/discoverRows.js`.
 */

/**
 * What a row is called, and the smaller line above it saying why it is here.
 *
 * Kept next to the page rather than in `discoverRows`, which decides what
 * belongs in a row and has no business knowing what language it is read in.
 */
function railTitle(row, t) {
  if (row.kind === 'category') return categoryLabel(row.category)
  return t(`home.rails.${row.kind}`)
}
function railEyebrow(row, t) {
  if (row.kind === 'category') return t('home.rails.categoryEyebrow')
  return t(`home.rails.${row.kind}Why`)
}

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
  // A taste of the other page, plainly labelled as such — a pointer rather
  // than a second copy of it.
  const interestPicks = useMemo(
    () => pickForInterests(recommendations, user.interests),
    [recommendations, user.interests],
  )
  const rows = useMemo(
    () => discoverRows({ activities: soonest, interestPicks, heroId: heroPick?.id ?? null }),
    [soonest, interestPicks, heroPick],
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
    <div className="page-content discover-page" data-part={part}>
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

      {/* Loading and "your filters match nothing" are states of the whole
          feed, not of any one row, so they replace the rows rather than
          appearing inside an empty one. */}
      {loading ? (
        <div className="stack card-grid">
          <ActivitiesLoading />
        </div>
      ) : filteredActivities.length === 0 ? (
        <FiltersEmptyState />
      ) : (
        rows.map((row) => (
          <ActivityRail
            key={row.key}
            eyebrow={railEyebrow(row, t)}
            title={railTitle(row, t)}
            count={row.items.length}
            activities={row.items}
            action={
              row.kind === 'interests' ? (
                <button className="text-button" onClick={() => navigate('/recommendations')}>
                  {t('common.seeAll')} <ArrowRight size={15} />
                </button>
              ) : null
            }
          />
        ))
      )}
    </div>
  )
}
