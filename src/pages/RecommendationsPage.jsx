import React from 'react'
import {
  BellRing,
  ChevronRight,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'

export default function RecommendationsPage() {
  const { recommendations } = useApp()
  const navigate = useNavigate()

  const top = recommendations[0]

  return (
    <div className="page-content light-page">

      {/* HEADER */}
      <section className="headline-block">
        <span className="eyebrow">
          AI Picks
        </span>

        <h2>
          Made for you
        </h2>

        <p className="helper-text">
          Activities that match your interests.
        </p>
      </section>


      {/* TOP MATCH */}
      {top && (
        <section
          className="surprise-card"
          onClick={() =>
            navigate(`/activity/${top.id}`)
          }
          role="button"
          tabIndex="0"
        >
          <div className="surprise-copy">

            <span className="eyebrow">
              Best match
            </span>

            <h3>
              {top.title}
            </h3>

            <p>
              {top.reasons?.[0]}
            </p>

          </div>

          <div className="surprise-score">

            <Sparkles size={18} />

            <strong>
              {top.matchScore}%
            </strong>

          </div>

        </section>
      )}


      {/* USER MATCHING */}
      <button
        className="people-match-banner"
        onClick={() =>
          navigate('/matching')
        }
      >

        <div className="people-match-icon">
          <UsersRound size={23} />
        </div>

        <div className="people-match-copy">

          <strong>
            People for you
          </strong>

          <span>
            Find similar people and follow their activities
          </span>

        </div>

        <div className="people-match-bell">
          <BellRing size={18} />
        </div>

        <ChevronRight size={19} />

      </button>


      {/* ACTIVITIES */}
      <section className="section-block">

        <div className="section-heading">

          <div>
            <span className="eyebrow">
              Recommended
            </span>

            <h2>
              Activities
            </h2>
          </div>

          <span className="count-chip">
            {recommendations.length}
          </span>

        </div>

        <div className="stack">

          {recommendations.map(
            (activity) => (

              <ActivityCard
                key={activity.id}
                activity={activity}
              />

            )
          )}

        </div>

      </section>


      <style>{`

        .people-match-banner {
          width: 100%;

          display: grid;

          grid-template-columns:
            auto
            1fr
            auto
            auto;

          align-items: center;

          gap: 12px;

          padding: 16px;

          text-align: left;

          border: 1px solid #ECD2E0;

          border-radius: 24px;

          background: #FFF;

          color: #151515;

          box-shadow:
            0 7px 18px
            rgba(0,0,0,0.04);

          transition:
            transform 180ms ease,
            box-shadow 180ms ease;
        }


        .people-match-banner:hover {
          transform:
            translateY(-2px);

          box-shadow:
            0 12px 24px
            rgba(167,171,222,0.14);
        }


        .people-match-icon {
          width: 48px;
          height: 48px;

          display: grid;
          place-items: center;

          border-radius: 17px;

          background: #FFD6EE;

          color: #D94E93;
        }


        .people-match-copy {
          min-width: 0;

          display: flex;
          flex-direction: column;

          gap: 4px;
        }


        .people-match-copy strong {
          font-size: 16px;
        }


        .people-match-copy span {
          color: #777;

          font-size: 12px;

          line-height: 1.35;
        }


        .people-match-bell {
          width: 34px;
          height: 34px;

          display: grid;
          place-items: center;

          border-radius: 50%;

          background: #FFF0F1;

          color: #FFA5D6;
        }

      `}</style>

    </div>
  )
}