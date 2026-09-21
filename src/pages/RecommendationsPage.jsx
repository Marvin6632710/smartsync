import React, { useMemo } from 'react'
import {
  ChevronRight,
  Compass,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  UsersRound,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import ActivityCard from '../components/ActivityCard'
import ActivitiesLoading from '../components/ActivitiesLoading'
import CategoryIcon from '../components/CategoryIcon'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useAiPicks } from '../hooks/useAiPicks'
import { categoryLabel, listInWords, reasonLines, reasonText, signalLabel } from '../i18n'
import { improveHints, resolvePicks, standardPicks, thinProfile } from '../services/aiPicks'
import { weightShares } from '../services/recommendationService'
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
 * it gives is a fact the app checked before wording it. When the model
 * has no answer — no key on the server, a quota, an outage, an answer
 * the app could not use — the same activities appear in the standard
 * engine's order, and the page says so plainly.
 *
 * Below, "what is on in my interests?": everything in the categories you
 * chose, grouped under the interest that earned it, ranked by the standard
 * score. Nothing outside your interests appears there, ever — that is what
 * makes it checkable by the person reading it.
 */
/**
 * How strongly each rank is drawn, strongest first: one accent at falling
 * opacity, so the six signals read as one scale rather than six colours.
 * Six entries for six signals; a seventh signal would need a seventh tone.
 */
const RANK_TONES = [1, 0.8, 0.62, 0.46, 0.33, 0.22]

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
  const {
    recommendations,
    filteredActivities,
    joinedIds,
    joinedActivities,
    loading,
    weights,
    filters,
  } = useApp()
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

  // The list to show: the model's, joined back to the activities on screen,
  // or the standard ranking of the same activities with the reason the
  // model's is missing.
  const shown = useMemo(() => {
    if (ai.result?.source === 'gemini') {
      const items = resolvePicks(ai.result.picks, eligible)
      if (items.length) return { source: 'gemini', items, createdAt: ai.result.createdAt }
      return { source: 'standard', items: standardPicks(eligible), reason: 'stale' }
    }
    return {
      source: 'standard',
      items: standardPicks(eligible),
      reason: ai.result?.reason || (ai.status === 'error' ? 'error' : null),
      retryAfterSeconds: ai.result?.retryAfterSeconds,
    }
  }, [ai.result, ai.status, eligible])
  const top = shown.items[0]
  const rest = shown.items.slice(1)
  const asking = ai.status === 'loading'
  const narrowing = activeFilterCount(filters)
  const hints = useMemo(
    () =>
      thinProfile(ai.request.signals)
        ? improveHints(ai.request.signals, { interestCount: interests.length })
        : [],
    [ai.request.signals, interests.length],
  )

  const standardAll = useMemo(
    () => pickForInterests(recommendations, interests),
    [recommendations, interests],
  )
  const groups = useMemo(() => groupByInterest(standardAll, interests), [standardAll, interests])
  const missing = useMemo(
    () => interestsWithNothing(standardAll, interests),
    [standardAll, interests],
  )

  // Ordered strongest first, so the explanation reads in the order the
  // scoring actually applies rather than the order the object was typed.
  // The weights in force, not the shipped ones: this page ranks with what
  // the sliders say, so it has to describe the same thing.
  const signals = useMemo(
    () =>
      Object.entries(weightShares(weights))
        .map(([id, weight]) => ({ id, weight, label: signalLabel(id) }))
        .sort((a, b) => b.weight - a.weight),
    // The labels follow the language, which `t` changes with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weights, t],
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

  // The line above the picks: who ranked them and when, or why it is the
  // standard ranking — with the way to ask again beside it.
  const sourceBar = (() => {
    if (asking) {
      return (
        <div className="ai-source" data-state="asking" role="status" aria-live="polite">
          <Sparkles size={15} aria-hidden="true" />
          <span>{t('picks.asking')}</span>
        </div>
      )
    }
    if (shown.source === 'gemini') {
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
      <div className="ai-source" data-state="standard" role="status" aria-live="polite">
        <TriangleAlert size={15} aria-hidden="true" />
        <span>
          <strong>{t('picks.sourceStandard')}</strong>{' '}
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
      </section>

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
      ) : asking || !top ? (
        <section className="top-pick top-pick-loading" aria-busy="true">
          <span className="category-chip">
            <Sparkles size={12} aria-hidden="true" />
            {t('picks.eyebrow')}
          </span>
          <h3>{t('picks.asking')}</h3>
          <ActivitiesLoading rows={1} />
        </section>
      ) : (
        /* THE STRONGEST MATCH, WITH ITS WORKING SHOWN
           A number on its own asks to be trusted. The reasons underneath
           are facts the app checked, so the claim is checkable rather
           than decorative. */
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
            <span className="top-pick-score">
              <Sparkles size={14} aria-hidden="true" />
              {t('common.percent', { value: top.activity.matchScore })}
            </span>
          </div>
          <h3 id="top-pick-title">{top.activity.title}</h3>
          <ul className="top-pick-reasons">
            {(top.reasons.length ? top.reasons.map(reasonText) : reasonLines(top.activity))
              .slice(0, 3)
              .map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
          </ul>
          {/* Room for it on a wide screen, where this card sits beside the
              weights and has the height; a phone keeps it to the activity
              page. */}
          {top.activity.description && <p className="top-pick-desc">{top.activity.description}</p>}
          <button
            className="primary-button wide"
            onClick={() => navigate(`/activity/${top.activity.id}`)}
          >
            {t('picks.takeALook')}
          </button>
        </section>
      )}

      {/* HOW THIS WORKS
          The model, and then the six signals with real weights, in the
          order they actually carry. An app that ranks what a person sees
          should be able to say how, and this is the screen where saying
          it belongs.

          The weights are shares of one whole, so they are drawn as one:
          a single strip split six ways, strongest first, in one colour
          at falling strength. The list underneath carries the numbers,
          in the same order and the same tones, and is what a screen
          reader gets; the strip is a picture of it. */}
      <section className="panel how-panel" aria-labelledby="how-title">
        <div className="how-head">
          <span className="eyebrow">{t('picks.howEyebrow')}</span>
          <h3 id="how-title">{t('picks.howTitle')}</h3>
          <p className="helper-text">{t('picks.howLead')}</p>
        </div>
        <div className="how-strip" aria-hidden="true">
          {signals.map(
            (signal, rank) =>
              signal.weight > 0 && (
                <span
                  key={signal.id}
                  style={{ flexGrow: signal.weight, '--tone': RANK_TONES[rank] }}
                />
              ),
          )}
        </div>
        <ol className="how-list">
          {signals.map((signal, rank) => (
            // A signal turned down to nothing is listed — the six are the
            // six — but drawn as switched off rather than merely last.
            <li
              key={signal.id}
              style={{ '--tone': RANK_TONES[rank] }}
              data-off={signal.weight === 0 ? 'true' : undefined}
            >
              <span className="how-swatch" aria-hidden="true" />
              <span className="how-label">{signal.label}</span>
              <span className="how-share">{t('common.percent', { value: signal.weight })}</span>
            </li>
          ))}
        </ol>
        <p className="helper-text how-privacy">{t('picks.privacy')}</p>
        <button type="button" className="how-action" onClick={() => navigate('/weights')}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>{t('picks.changeWhatMatters')}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </section>

      {eligible.length > 0 && (
        <>
          {/* THE REST OF THE PICKS, EACH WITH ITS REASONS */}
          {asking ? (
            <section className="section-block ai-picks" aria-busy="true">
              <ActivitiesLoading rows={2} />
            </section>
          ) : (
            rest.length > 0 && (
              <section className="section-block ai-picks" aria-labelledby="ai-picks-title">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      {shown.source === 'gemini'
                        ? t('picks.sourceGemini')
                        : t('picks.sourceStandard')}
                    </span>
                    <h2 id="ai-picks-title">{t('picks.alsoForYou')}</h2>
                  </div>
                  <span className="count-chip">{rest.length}</span>
                </div>
                <div className="stack card-grid">
                  {rest.map((pick) => (
                    <Pick key={pick.activity.id} pick={pick} />
                  ))}
                </div>
                {narrowing > 0 && (
                  <p className="helper-text quiet-note">
                    {t('picks.withinFilters', { count: narrowing })}{' '}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => navigate('/filters')}
                    >
                      {t('filtersEmpty.adjust')}
                    </button>
                  </p>
                )}
              </section>
            )
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
      {standardAll.length === 0 ? (
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

      <button className="people-match-banner" onClick={() => navigate('/matching')}>
        <div className="people-match-icon">
          <UsersRound size={23} />
        </div>
        <div className="people-match-copy">
          <strong>{t('picks.peopleForYou')}</strong>
          <span>{t('picks.peopleForYouHint')}</span>
        </div>
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
