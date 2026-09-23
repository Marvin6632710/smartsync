import React, { useMemo } from 'react'
import { ChevronRight, Compass, RefreshCw, Sparkles, TriangleAlert, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import ActivityCard from '../components/ActivityCard'
import ActivitiesLoading from '../components/ActivitiesLoading'
import CategoryIcon from '../components/CategoryIcon'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useAiPicks } from '../hooks/useAiPicks'
import { categoryLabel, listInWords, reasonText } from '../i18n'
import { improveHints, resolvePicks, thinProfile, unrankedPicks } from '../services/aiPicks'
import { groupByInterest, interestsWithNothing, pickForInterests } from '../services/interestPicks'
import { activeFilterCount } from '../utils/filters'
import { formatRelativeTime } from '../utils/time'

/**
 * AI Picks.
 *
 * Two lists, answering two questions. At the top, "what should I join?":
 * the activities you could join right now — upcoming, not full, inside
 * your discovery filters, not already on your list — put in order by
 * Gemini from your interests, what you have joined, your preferred time
 * and how far away things are, each with the reasons it fits. The model
 * ranks activities it was handed; it cannot invent one, and every reason
 * it gives is a fact the app checked before wording it. Nothing ranks in
 * the browser (ADR-030): when the model has no answer — no key on the
 * server, a quota, an outage, an answer the app could not use — the same
 * activities appear soonest first, and the page says plainly that they
 * are not ranked and offers to ask again.
 *
 * Below, "what is on in my interests?": everything in the categories you
 * chose, grouped under the interest that earned it, soonest first. Nothing
 * outside your interests appears there, ever — that is what makes it
 * checkable by the person reading it.
 */
const HINT_ROUTES = {
  join: '/home',
  interests: '/interests',
  time: '/profile/edit',
  location: '/privacy',
}

/** One pick: the card, and under it the reasons in words. */
function Pick({ pick }) {
  const why = pick.reasons.map(reasonText).filter(Boolean)
  return (
    <div className="ai-pick">
      <ActivityCard activity={pick.activity} />
      {why.length > 0 && <p className="ai-pick-why">{why.join(' · ')}</p>}
    </div>
  )
}

export default function RecommendationsPage() {
  const { t } = useTranslation()
  const { recommendations, filteredActivities, joinedIds, joinedActivities, loading, filters } =
    useApp()
  const { user } = useAuth()
  const navigate = useNavigate()

  const interests = useMemo(() => user.interests || [], [user.interests])
  // What the model is given: everything you could join now. `filteredActivities`
  // already applies visibility, blocking, availability and your discovery
  // filters; what is left to take out is what you are already going to.
  const eligible = useMemo(
    () => filteredActivities.filter((a) => !joinedIds.includes(a.id)),
    [filteredActivities, joinedIds],
  )
  const ai = useAiPicks({
    user,
    activities: eligible,
    joinedActivities,
    enabled: !loading && interests.length > 0,
  })

  // The list to show: the model's, joined back to the activities on screen
  // — or, with no ranking, the same activities soonest first and the reason
  // the ranking is missing.
  const shown = useMemo(() => {
    if (ai.result?.source === 'gemini') {
      const picks = resolvePicks(ai.result.picks, eligible)
      if (picks.length) return { source: 'gemini', picks, createdAt: ai.result.createdAt }
      return { source: 'none', unranked: unrankedPicks(eligible), reason: 'stale' }
    }
    return {
      source: 'none',
      unranked: unrankedPicks(eligible),
      reason: ai.result?.reason || (ai.status === 'error' ? 'error' : null),
      retryAfterSeconds: ai.result?.retryAfterSeconds,
    }
  }, [ai.result, ai.status, eligible])
  const ranked = shown.source === 'gemini'
  const top = ranked ? shown.picks[0] : null
  const rest = ranked ? shown.picks.slice(1) : []
  const asking = ai.status === 'loading'
  const narrowing = activeFilterCount(filters)
  const hints = useMemo(
    () =>
      thinProfile(ai.request.signals)
        ? improveHints(ai.request.signals, { interestCount: interests.length })
        : [],
    [ai.request.signals, interests.length],
  )

  const inInterests = useMemo(
    () => pickForInterests(recommendations, interests),
    [recommendations, interests],
  )
  const groups = useMemo(() => groupByInterest(inInterests, interests), [inInterests, interests])
  const missing = useMemo(
    () => interestsWithNothing(inInterests, interests),
    [inInterests, interests],
  )

  if (loading) {
    return (
      <div className="page-content">
        <section className="headline-block">
          <span className="eyebrow">{t('picks.eyebrow')}</span>
          <h2>{t('picks.title')}</h2>
        </section>
        <ActivitiesLoading />
      </div>
    )
  }

  // Nothing to pick from. Saying "no matches" here would be a lie: the app
  // has not been told anything to match against.
  if (interests.length === 0) {
    return (
      <div className="page-content">
        <section className="headline-block">
          <span className="eyebrow">{t('picks.eyebrow')}</span>
          <h2>{t('picks.title')}</h2>
        </section>
        <div className="empty-state">
          <Sparkles size={28} />
          <h3>{t('picks.noInterestsTitle')}</h3>
          <p>{t('picks.noInterestsBody')}</p>
          <button className="primary-button" onClick={() => navigate('/interests')}>
            {t('picks.chooseInterests')}
          </button>
        </div>
      </div>
    )
  }

  // The line above the picks: who ranked them and when, or why nothing did
  // — with the way to ask again beside it.
  const sourceBar = (() => {
    if (asking) {
      return (
        <div className="ai-source" data-state="asking" role="status" aria-live="polite">
          <Sparkles size={15} aria-hidden="true" />
          <span>{t('picks.asking')}</span>
        </div>
      )
    }
    if (ranked) {
      return (
        <div className="ai-source" data-state="gemini" role="status" aria-live="polite">
          <Sparkles size={15} aria-hidden="true" />
          <span>
            {t('picks.sourceGemini')}
            {shown.createdAt ? ` · ${formatRelativeTime(shown.createdAt)}` : ''}
          </span>
          <button type="button" className="text-button ai-refresh" onClick={ai.refresh}>
            <RefreshCw size={14} aria-hidden="true" /> {t('picks.refresh')}
          </button>
        </div>
      )
    }
    const minutes = Math.max(1, Math.ceil((shown.retryAfterSeconds || 0) / 60))
    return (
      <div className="ai-source" data-state="none" role="status" aria-live="polite">
        <TriangleAlert size={15} aria-hidden="true" />
        <span>
          <strong>{t('picks.sourceNone')}</strong>{' '}
          {t(`picks.fallback.${shown.reason || 'unavailable'}`, {
            defaultValue: t('picks.fallback.unavailable'),
            count: minutes,
          })}
        </span>
        <button
          type="button"
          className="text-button ai-refresh"
          onClick={ai.status === 'error' ? ai.retry : ai.refresh}
        >
          <RefreshCw size={14} aria-hidden="true" /> {t('common.tryAgain')}
        </button>
      </div>
    )
  })()

  return (
    <div className="page-content picks-page">
      <section className="headline-block">
        <span className="eyebrow">{t('picks.eyebrow')}</span>
        <h2>{t('picks.title')}</h2>
        <p className="helper-text">{t('picks.lead')}</p>
        {/* What leaves the device to be ranked, said where the ranking is
            asked for — and what never does. */}
        <p className="helper-text how-privacy">{t('picks.privacy')}</p>
      </section>

      {/* People used to be the final item after every activity group, which
          made a whole recommendation feature look like a footer. It belongs
          beside the page introduction: still part of AI Picks, but visible
          before somebody commits to scrolling through the activity lists. */}
      <button className="people-match-banner" onClick={() => navigate('/matching')}>
        <div className="people-match-icon">
          <UsersRound size={24} />
        </div>
        <div className="people-match-copy">
          <strong>{t('picks.peopleForYou')}</strong>
          <span>{t('picks.peopleForYouHint')}</span>
        </div>
        <ChevronRight size={20} />
      </button>

      {eligible.length > 0 && sourceBar}

      {eligible.length === 0 ? (
        /* Nothing to pick from: no request is made, and the reason is said
           — with the filters, if they are what is in the way. */
        <div className="empty-state picks-empty">
          <Sparkles size={28} />
          <h3>{t('picks.emptyTitle')}</h3>
          <p>
            {narrowing > 0
              ? t('picks.emptyBodyFilters', { count: narrowing })
              : t('picks.emptyBody')}
          </p>
          <div className="action-stack">
            <button className="primary-button" onClick={() => navigate('/home')}>
              <Compass size={17} /> {t('picks.seeWhatsOn')}
            </button>
            {narrowing > 0 && (
              <button className="secondary-button" onClick={() => navigate('/filters')}>
                {t('filtersEmpty.adjust')}
              </button>
            )}
          </div>
        </div>
      ) : asking ? (
        <section className="top-pick top-pick-loading" aria-busy="true">
          <span className="category-chip">
            <Sparkles size={12} aria-hidden="true" />
            {t('picks.eyebrow')}
          </span>
          <h3>{t('picks.asking')}</h3>
          <ActivitiesLoading rows={1} />
        </section>
      ) : (
        top && (
          /* THE MODEL'S FIRST PICK, WITH ITS WORKING SHOWN
             A top pick on its own asks to be trusted. The reasons underneath
             are facts the app checked, so the claim is checkable rather
             than decorative. Only a ranking gets a hero: with none, there
             is no first. */
          <section
            className="top-pick"
            data-category={(top.activity.category || '').toLowerCase()}
            aria-labelledby="top-pick-title"
          >
            <div className="top-pick-head">
              <span className="category-chip">
                <CategoryIcon category={top.activity.category} size={12} />
                {categoryLabel(top.activity.category)}
              </span>
              <span className="top-pick-badge">
                <Sparkles size={14} aria-hidden="true" />
                {t('picks.topPick')}
              </span>
            </div>
            <h3 id="top-pick-title">{top.activity.title}</h3>
            <ul className="top-pick-reasons">
              {top.reasons
                .map(reasonText)
                .filter(Boolean)
                .slice(0, 3)
                .map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
            </ul>
            {/* Room for it on a wide screen, where this card is a banner and
                has the width; a phone keeps it to the activity page. */}
            {top.activity.description && (
              <p className="top-pick-desc">{top.activity.description}</p>
            )}
            <button
              className="primary-button wide"
              onClick={() => navigate(`/activity/${top.activity.id}`)}
            >
              {t('picks.takeALook')}
            </button>
          </section>
        )
      )}

      {eligible.length > 0 && (
        <>
          {/* THE REST OF THE PICKS, EACH WITH ITS REASONS — OR, WITH NO
              RANKING, WHAT IS COMING UP SOONEST, SAID TO BE JUST THAT */}
          {asking ? (
            <section className="section-block ai-picks" aria-busy="true">
              <ActivitiesLoading rows={2} />
            </section>
          ) : ranked ? (
            rest.length > 0 && (
              <section className="section-block ai-picks" aria-labelledby="ai-picks-title">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">{t('picks.sourceGemini')}</span>
                    <h2 id="ai-picks-title">{t('picks.alsoForYou')}</h2>
                  </div>
                  <span className="count-chip">{rest.length}</span>
                </div>
                <div className="stack card-grid">
                  {rest.map((pick) => (
                    <Pick key={pick.activity.id} pick={pick} />
                  ))}
                </div>
                {narrowing > 0 && <WithinFilters count={narrowing} />}
              </section>
            )
          ) : (
            <section className="section-block ai-picks" aria-labelledby="ai-picks-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{t('picks.unrankedEyebrow')}</span>
                  <h2 id="ai-picks-title">{t('picks.unrankedTitle')}</h2>
                </div>
                <span className="count-chip">{shown.unranked.length}</span>
              </div>
              <div className="stack card-grid">
                {shown.unranked.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} />
                ))}
              </div>
              {narrowing > 0 && <WithinFilters count={narrowing} />}
            </section>
          )}

          {/* LITTLE HISTORY: WHAT WOULD MAKE THE PICKS BETTER */}
          {hints.length > 0 && (
            <section className="panel improve-panel" aria-labelledby="improve-title">
              <div className="how-head">
                <span className="eyebrow">{t('picks.improveEyebrow')}</span>
                <h3 id="improve-title">{t('picks.improveTitle')}</h3>
                <p className="helper-text">{t('picks.improveLead')}</p>
              </div>
              <ul className="improve-list">
                {hints.map((hint) => (
                  <li key={hint}>
                    <button
                      type="button"
                      className="how-action"
                      onClick={() => navigate(HINT_ROUTES[hint])}
                    >
                      <span>{t(`picks.improve.${hint}`)}</span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* EVERYTHING IN YOUR INTERESTS, GROUPED UNDER THE INTEREST THAT EARNED IT */}
      {inInterests.length === 0 ? (
        <div className="empty-state">
          <Sparkles size={28} />
          <h3>{t('picks.nothingTitle')}</h3>
          <p>{t('picks.nothingBody', { interests: listInWords(interests.map(categoryLabel)) })}</p>
          <div className="action-stack">
            <button className="primary-button" onClick={() => navigate('/home')}>
              <Compass size={17} /> {t('picks.seeWhatsOn')}
            </button>
            <button className="secondary-button" onClick={() => navigate('/interests')}>
              {t('picks.addInterest')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <section className="section-block" key={group.key}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{t('picks.becauseYouLike')}</span>
                  <h2>{categoryLabel(group.label)}</h2>
                </div>
                <span className="count-chip">{group.items.length}</span>
              </div>
              <div className="stack card-grid">
                {group.items.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} />
                ))}
              </div>
            </section>
          ))}

          {/* An interest with nothing on is worth saying out loud: otherwise
              it reads as though the app forgot about it. */}
          {missing.length > 0 && (
            <p className="helper-text quiet-note">
              {t('picks.nothingIn', { interests: listInWords(missing.map(categoryLabel)) })}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** The picks are only from inside your filters; say so, with the way out. */
function WithinFilters({ count }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <p className="helper-text quiet-note">
      {t('picks.withinFilters', { count })}{' '}
      <button type="button" className="text-button" onClick={() => navigate('/filters')}>
        {t('filtersEmpty.adjust')}
      </button>
    </p>
  )
}
