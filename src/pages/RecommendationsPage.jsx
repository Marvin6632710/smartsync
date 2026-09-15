import React, { useMemo } from 'react'
import { ChevronRight, Compass, SlidersHorizontal, Sparkles, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import ActivityCard from '../components/ActivityCard'
import ActivitiesLoading from '../components/ActivitiesLoading'
import CategoryIcon from '../components/CategoryIcon'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { signalLabels, weightShares } from '../services/recommendationService'
import {
  groupByInterest,
  interestsWithNothing,
  listInWords,
  pickForInterests,
} from '../services/interestPicks'

/**
 * AI Picks.
 *
 * This page and Discover used to render the same array, so the app had two
 * names for one list and the claim at the top of this one — "activities that
 * match your interests" — was not true of most of what it showed.
 *
 * They answer different questions now. Discover answers "what is on?": every
 * upcoming activity, soonest first, whatever it is. This answers "what suits
 * me?": only the categories you chose, ranked by fit, grouped under the
 * interest that earned each one, and showing its working.
 *
 * Two consequences worth stating. Nothing outside your interests appears
 * here, ever — that is what makes the page checkable by the person reading
 * it. And Discover's filter chips do not apply: those are for browsing, and
 * silently narrowing your picks with a filter set on another screen is how
 * somebody ends up believing there is nothing on.
 */
/**
 * How strongly each rank is drawn, strongest first: one accent at falling
 * opacity, so the six signals read as one scale rather than six colours.
 * Six entries for six signals; a seventh signal would need a seventh tone.
 */
const RANK_TONES = [1, 0.8, 0.62, 0.46, 0.33, 0.22]

export default function RecommendationsPage() {
  const { recommendations, loading, weights } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()

  const interests = useMemo(() => user.interests || [], [user.interests])
  const picks = useMemo(
    () => pickForInterests(recommendations, interests),
    [recommendations, interests],
  )
  const groups = useMemo(() => groupByInterest(picks, interests), [picks, interests])
  const missing = useMemo(() => interestsWithNothing(picks, interests), [picks, interests])
  const top = picks[0]

  // Ordered strongest first, so the explanation reads in the order the
  // scoring actually applies rather than the order the object was typed.
  // The weights in force, not the shipped ones: this page ranks with what
  // the sliders say, so it has to describe the same thing. It showed the
  // defaults, so moving a slider changed the list and left the explanation
  // contradicting it.
  const signals = useMemo(
    () =>
      Object.entries(weightShares(weights))
        .map(([id, weight]) => ({ id, weight, label: signalLabels[id] || id }))
        .sort((a, b) => b.weight - a.weight),
    [weights],
  )

  if (loading) {
    return (
      <div className="page-content">
        <section className="headline-block">
          <span className="eyebrow">AI Picks</span>
          <h2>Made for you</h2>
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
          <span className="eyebrow">AI Picks</span>
          <h2>Made for you</h2>
        </section>
        <div className="empty-state">
          <Sparkles size={28} />
          <h3>Tell it what you like first</h3>
          <p>
            This page only ever shows the categories you choose. Pick a few and it fills up straight
            away.
          </p>
          <button className="primary-button" onClick={() => navigate('/interests')}>
            Choose your interests
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      <section className="headline-block">
        <span className="eyebrow">AI Picks</span>
        <h2>Made for you</h2>
        <p className="helper-text">
          Only {listInWords(interests)} — the interests you chose. Ranked by how well each one fits,
          not by when it happens.
        </p>
      </section>

      {picks.length === 0 ? (
        <div className="empty-state">
          <Sparkles size={28} />
          <h3>Nothing in your interests yet</h3>
          <p>
            Nobody is hosting {listInWords(interests)} at the moment. Discover has everything that
            is on, or you can add an interest.
          </p>
          <div className="action-stack">
            <button className="primary-button" onClick={() => navigate('/home')}>
              <Compass size={17} /> See what is on
            </button>
            <button className="secondary-button" onClick={() => navigate('/interests')}>
              Add an interest
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* THE STRONGEST MATCH, WITH ITS WORKING SHOWN
              A number on its own asks to be trusted. The reasons underneath
              are the same ones the scorer produced, so the claim is
              checkable rather than decorative. */}
          <section
            className="top-pick"
            data-category={(top.category || '').toLowerCase()}
            aria-labelledby="top-pick-title"
          >
            <div className="top-pick-head">
              <span className="category-chip">
                <CategoryIcon category={top.category} size={12} />
                {top.category}
              </span>
              <span className="top-pick-score">
                <Sparkles size={14} aria-hidden="true" />
                {top.matchScore}%
              </span>
            </div>
            <h3 id="top-pick-title">{top.title}</h3>
            <ul className="top-pick-reasons">
              {(top.reasons || []).slice(0, 3).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <button className="primary-button wide" onClick={() => navigate(`/activity/${top.id}`)}>
              Take a look
            </button>
          </section>

          {/* HOW THIS WORKS
              Six signals with real weights, in the order they actually carry.
              An app that ranks what a person sees should be able to say how,
              and this is the screen where saying it belongs.

              The weights are shares of one whole, so they are drawn as one:
              a single strip split six ways, strongest first, in one colour
              at falling strength — the question "how much does each one
              matter?" is answered by the strip before a number is read. The
              list underneath carries the numbers, in the same order and the
              same tones, and is what a screen reader gets; the strip is a
              picture of it. */}
          <section className="panel how-panel" aria-labelledby="how-title">
            <div className="how-head">
              <span className="eyebrow">How this works</span>
              <h3 id="how-title">What the ranking counts</h3>
              <p className="helper-text">Each match score is split between six signals.</p>
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
                  <span className="how-share">{signal.weight}%</span>
                </li>
              ))}
            </ol>
            <button type="button" className="how-action" onClick={() => navigate('/weights')}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>Change what matters</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </section>

          {/* GROUPED UNDER THE INTEREST THAT EARNED THEM */}
          {groups.map((group) => (
            <section className="section-block" key={group.key}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Because you like</span>
                  <h2>{group.label}</h2>
                </div>
                <span className="count-chip">{group.items.length}</span>
              </div>
              <div className="stack">
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
              Nothing in {listInWords(missing)} right now. It will appear here as soon as somebody
              hosts one.
            </p>
          )}
        </>
      )}

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
    </div>
  )
}
