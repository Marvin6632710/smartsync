import React, { useMemo, useState } from 'react'
import { ChevronRight, List, LocateFixed, Search, Sparkles, Users, Clock3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const ACTIVITY_EMOJIS = {
  Football: '⚽',
  Basketball: '🏀',
  Running: '🏃',
  Gym: '🏋️',
  Study: '📚',
  Coffee: '☕',
  Gaming: '🎮',
  Hangouts: '🎉',
  Cycling: '🚴',
  Movies: '🎬',
  Food: '🍜',
  Events: '🎟️',
}

function getActivityEmoji(category) {
  return ACTIVITY_EMOJIS[category] || '✨'
}

export default function MapPage() {
  const { recommendations } = useApp()
  const navigate = useNavigate()

  const [selectedId, setSelectedId] = useState(recommendations[0]?.id || null)

  const selectedActivity = useMemo(() => {
    return recommendations.find((activity) => activity.id === selectedId) || recommendations[0]
  }, [recommendations, selectedId])

  return (
    <>
      <div className="smart-map-page">
        {/* MAP */}
        <div className="smart-map">
          {/* Background map texture */}
          <div className="map-background-grid" />

          <div className="map-pastel-area map-area-one" />
          <div className="map-pastel-area map-area-two" />
          <div className="map-pastel-area map-area-three" />
          <div className="map-pastel-area map-area-four" />

          <div className="map-road road-one" />
          <div className="map-road road-two" />
          <div className="map-road road-three" />
          <div className="map-road road-four" />

          <div className="map-river river-one" />
          <div className="map-river river-two" />

          {/* SEARCH */}
          <button
            className="map-round-button map-search-button"
            onClick={() => navigate('/search')}
            aria-label="Search activities"
          >
            <Search size={25} strokeWidth={2.2} />
          </button>

          {/* SELECTED ACTIVITY PREVIEW */}
          {selectedActivity && (
            <button
              className="map-activity-preview"
              onClick={() => navigate(`/activity/${selectedActivity.id}`)}
            >
              <div className="preview-emoji">{getActivityEmoji(selectedActivity.category)}</div>

              <div className="preview-copy">
                <span className="preview-match">{selectedActivity.matchScore}% Match</span>

                <strong>{selectedActivity.title}</strong>

                <small>{selectedActivity.distanceKm} km away</small>
              </div>

              <ChevronRight size={21} />
            </button>
          )}

          {/* ACTIVITY MARKERS */}
          {recommendations.map((activity, index) => {
            const isSelected = selectedId === activity.id

            return (
              <button
                key={activity.id}
                className={`activity-map-marker ${isSelected ? 'selected' : ''}`}
                style={{
                  left: `${activity.x}%`,
                  top: `${activity.y}%`,
                  animationDelay: `${index * 70}ms`,
                }}
                onClick={() => setSelectedId(activity.id)}
                aria-label={`Select ${activity.title}`}
              >
                <span className="marker-emoji">{getActivityEmoji(activity.category)}</span>

                {isSelected && <span className="marker-match">{activity.matchScore}%</span>}
              </button>
            )
          })}

          {/* USER LOCATION */}
          <div
            className="current-user-location"
            style={{
              left: '48%',
              top: '62%',
            }}
          >
            <div className="user-location-pulse" />
            <div className="user-location-dot" />
          </div>

          {/* AI PICKS */}
          <button
            className="map-round-button map-ai-button"
            onClick={() => navigate('/recommendations')}
            aria-label="Open recommendations"
          >
            <Sparkles size={24} strokeWidth={2.2} />
          </button>

          {/* LOCATION */}
          <button className="map-round-button map-location-button" aria-label="Center location">
            <LocateFixed size={24} strokeWidth={2.2} />
          </button>

          {/* LIST */}
          <button className="map-list-button" onClick={() => navigate('/home')}>
            <List size={19} />
            <span>List</span>
          </button>

          {/* ACTIVITY BOTTOM CARD */}
          {selectedActivity && (
            <div className="map-bottom-card">
              <div className="bottom-card-top">
                <div className="bottom-card-icon">
                  {getActivityEmoji(selectedActivity.category)}
                </div>

                <div className="bottom-card-title">
                  <span>{selectedActivity.category}</span>
                  <strong>{selectedActivity.title}</strong>
                </div>

                <div className="bottom-match">{selectedActivity.matchScore}%</div>
              </div>

              <div className="bottom-card-info">
                <span>
                  <Clock3 size={14} />
                  {selectedActivity.date} · {selectedActivity.time}
                </span>

                <span>
                  <Users size={14} />
                  {selectedActivity.participants}/{selectedActivity.capacity}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`

        /* =========================================
           SMARTSYNC MAP
           BUBBLEGUM BLISS PALETTE
           ========================================= */

        .smart-map-page {
          width: 100%;
          height: 100%;
          min-height: 650px;
          padding: 8px;
          background: #FFF0F1;
        }

        .smart-map {
          position: relative;
          width: 100%;
          height: calc(100vh - 190px);
          min-height: 610px;
          overflow: hidden;

          border-radius: 30px;

          background:
            linear-gradient(
              135deg,
              #CED1F8 0%,
              #FFF0F1 42%,
              #FFD6EE 100%
            );

          border: 1px solid rgba(167, 171, 222, 0.35);

          box-shadow:
            0 14px 34px rgba(167, 171, 222, 0.18);
        }


        /* -----------------------------------------
           MAP BACKGROUND
           ----------------------------------------- */

        .map-background-grid {
          position: absolute;
          inset: -60px;

          background-image:
            linear-gradient(
              rgba(255,255,255,0.65) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(255,255,255,0.65) 1px,
              transparent 1px
            );

          background-size: 55px 55px;

          transform:
            rotate(-8deg)
            scale(1.15);

          opacity: 0.55;
        }


        /* -----------------------------------------
           PASTEL LAND AREAS
           ----------------------------------------- */

        .map-pastel-area {
          position: absolute;
          border-radius: 40px;
          opacity: 0.62;
          filter: blur(0.2px);
        }

        .map-area-one {
          width: 210px;
          height: 270px;

          left: -45px;
          top: 180px;

          background: #FFD6EE;

          transform: rotate(12deg);
        }

        .map-area-two {
          width: 230px;
          height: 190px;

          right: -70px;
          top: 245px;

          background: #CED1F8;

          transform: rotate(-13deg);
        }

        .map-area-three {
          width: 200px;
          height: 220px;

          left: 110px;
          bottom: -85px;

          background: #ECD2E0;

          transform: rotate(18deg);
        }

        .map-area-four {
          width: 170px;
          height: 170px;

          left: 75px;
          top: 35px;

          background: #FFA5D6;

          opacity: 0.18;

          transform: rotate(-10deg);
        }


        /* -----------------------------------------
           ROADS
           ----------------------------------------- */

        .map-road {
          position: absolute;

          height: 10px;

          border-radius: 999px;

          background: rgba(255,255,255,0.9);

          box-shadow:
            0 0 0 2px
            rgba(236,210,224,0.52);
        }

        .road-one {
          width: 150%;
          left: -25%;
          top: 34%;

          transform: rotate(17deg);
        }

        .road-two {
          width: 145%;
          left: -22%;
          top: 67%;

          transform: rotate(-12deg);
        }

        .road-three {
          width: 130%;
          left: -15%;
          top: 48%;

          transform: rotate(4deg);
        }

        .road-four {
          width: 115%;
          left: 5%;
          top: 22%;

          transform: rotate(-23deg);
        }


        /* -----------------------------------------
           RIVERS
           ----------------------------------------- */

        .map-river {
          position: absolute;

          width: 24px;
          height: 135%;

          border-radius: 999px;

          background:
            linear-gradient(
              180deg,
              #A7ABDE,
              #CED1F8
            );

          opacity: 0.62;
        }

        .river-one {
          left: 31%;
          top: -14%;

          transform: rotate(16deg);
        }

        .river-two {
          right: 21%;
          top: -14%;

          width: 18px;

          transform: rotate(-13deg);

          opacity: 0.38;
        }


        /* -----------------------------------------
           ROUND MAP BUTTONS
           ----------------------------------------- */

        .map-round-button {
          position: absolute;

          z-index: 20;

          width: 58px;
          height: 58px;

          display: grid;
          place-items: center;

          border: none;
          border-radius: 50%;

          color: #262626;

          background:
            rgba(255,255,255,0.94);

          box-shadow:
            0 10px 25px
            rgba(167,171,222,0.25);

          transition:
            transform 180ms ease,
            box-shadow 180ms ease;
        }

        .map-round-button:hover {
          transform:
            translateY(-2px)
            scale(1.04);

          box-shadow:
            0 14px 30px
            rgba(167,171,222,0.30);
        }

        .map-search-button {
          left: 15px;
          top: 88px;
        }

        .map-ai-button {
          right: 15px;
          bottom: 175px;

          color: #777CC7;

          background: #FFF0F1;
        }

        .map-location-button {
          right: 15px;
          bottom: 105px;
        }


        /* -----------------------------------------
           FLOATING ACTIVITY PREVIEW
           ----------------------------------------- */

        .map-activity-preview {
          position: absolute;

          z-index: 22;

          top: 18px;
          right: 14px;

          width: min(
            270px,
            calc(100% - 90px)
          );

          display: grid;

          grid-template-columns:
            auto
            1fr
            auto;

          align-items: center;

          gap: 10px;

          padding: 10px 12px;

          text-align: left;

          border: 1px solid
            rgba(236,210,224,0.8);

          border-radius: 25px;

          background:
            rgba(255,240,241,0.94);

          color: #222;

          box-shadow:
            0 10px 25px
            rgba(167,171,222,0.20);

          backdrop-filter:
            blur(14px);

          transition:
            transform 180ms ease;
        }

        .map-activity-preview:hover {
          transform:
            translateY(-2px);
        }

        .preview-emoji {
          width: 46px;
          height: 46px;

          display: grid;
          place-items: center;

          border-radius: 50%;

          background: #FFD6EE;

          font-size: 24px;

          border: 2px solid white;
        }

        .preview-copy {
          min-width: 0;

          display: flex;
          flex-direction: column;

          gap: 2px;
        }

        .preview-copy strong {
          overflow: hidden;

          font-size: 14px;
          font-weight: 700;

          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .preview-copy small {
          color: #777;

          font-size: 11px;
        }

        .preview-match {
          width: fit-content;

          padding: 4px 7px;

          border-radius: 999px;

          background: #FFA5D6;

          color: white;

          font-size: 10px;
          font-weight: 700;
        }


        /* -----------------------------------------
           ACTIVITY MARKERS
           ----------------------------------------- */

        .activity-map-marker {
          position: absolute;

          z-index: 15;

          width: 48px;
          height: 48px;

          transform:
            translate(-50%, -50%);

          display: grid;
          place-items: center;

          padding: 0;

          border:
            3px solid white;

          border-radius: 50%;

          background:
            #FFD6EE;

          box-shadow:
            0 8px 20px
            rgba(122,126,184,0.25);

          animation:
            markerAppear
            460ms
            cubic-bezier(
              0.34,
              1.56,
              0.64,
              1
            )
            both;

          transition:
            transform 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
        }

        .activity-map-marker:nth-of-type(2n) {
          background: #CED1F8;
        }

        .activity-map-marker:nth-of-type(3n) {
          background: #ECD2E0;
        }

        .activity-map-marker:nth-of-type(4n) {
          background: #FFA5D6;
        }

        .activity-map-marker:hover {
          transform:
            translate(-50%, -54%)
            scale(1.08);
        }

        .activity-map-marker.selected {
          z-index: 18;

          transform:
            translate(-50%, -54%)
            scale(1.18);

          background:
            #FFA5D6;

          box-shadow:
            0 13px 28px
            rgba(255,165,214,0.40);
        }

        .marker-emoji {
          font-size: 23px;

          line-height: 1;

          filter:
            drop-shadow(
              0 2px 2px
              rgba(0,0,0,0.08)
            );
        }

        .marker-match {
          position: absolute;

          top: -10px;
          right: -15px;

          min-width: 32px;

          padding: 4px 6px;

          border-radius: 999px;

          background: #A7ABDE;

          color: white;

          font-size: 9px;
          font-weight: 800;

          border:
            2px solid white;

          animation:
            matchPop
            300ms ease;
        }


        /* -----------------------------------------
           USER LOCATION
           ----------------------------------------- */

        .current-user-location {
          position: absolute;

          z-index: 14;

          transform:
            translate(-50%, -50%);
        }

        .user-location-dot {
          position: relative;

          width: 19px;
          height: 19px;

          border-radius: 50%;

          background: #7278DB;

          border:
            4px solid white;

          box-shadow:
            0 4px 12px
            rgba(111,117,216,0.32);
        }

        .user-location-pulse {
          position: absolute;

          left: 50%;
          top: 50%;

          width: 42px;
          height: 42px;

          transform:
            translate(-50%, -50%);

          border-radius: 50%;

          background:
            rgba(167,171,222,0.30);

          animation:
            userPulse
            2s ease-out
            infinite;
        }


        /* -----------------------------------------
           LIST BUTTON
           ----------------------------------------- */

        .map-list-button {
          position: absolute;

          z-index: 25;

          left: 50%;
          bottom: 18px;

          transform:
            translateX(-50%);

          display: flex;
          align-items: center;

          gap: 8px;

          padding:
            13px 23px;

          border: none;

          border-radius: 999px;

          background:
            rgba(255,240,241,0.96);

          color: #222;

          font-weight: 700;

          box-shadow:
            0 10px 26px
            rgba(167,171,222,0.24);

          backdrop-filter:
            blur(14px);

          transition:
            transform 180ms ease;
        }

        .map-list-button:hover {
          transform:
            translateX(-50%)
            translateY(-2px);
        }


        /* -----------------------------------------
           BOTTOM ACTIVITY CARD
           ----------------------------------------- */

        .map-bottom-card {
          position: absolute;

          z-index: 21;

          left: 14px;
          right: 85px;
          bottom: 88px;

          padding: 13px;

          border-radius: 22px;

          background:
            rgba(255,255,255,0.91);

          border:
            1px solid
            rgba(236,210,224,0.82);

          box-shadow:
            0 12px 28px
            rgba(167,171,222,0.20);

          backdrop-filter:
            blur(16px);

          animation:
            cardSlideUp
            350ms ease;
        }

        .bottom-card-top {
          display: grid;

          grid-template-columns:
            auto
            1fr
            auto;

          align-items: center;

          gap: 10px;
        }

        .bottom-card-icon {
          width: 42px;
          height: 42px;

          display: grid;
          place-items: center;

          border-radius: 15px;

          background:
            #FFD6EE;

          font-size: 22px;
        }

        .bottom-card-title {
          min-width: 0;

          display: flex;
          flex-direction: column;

          gap: 1px;
        }

        .bottom-card-title span {
          color: #999;

          font-size: 10px;
        }

        .bottom-card-title strong {
          overflow: hidden;

          font-size: 13px;

          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .bottom-match {
          padding:
            7px 9px;

          border-radius: 999px;

          background:
            #CED1F8;

          color: #555B9B;

          font-size: 11px;
          font-weight: 800;
        }

        .bottom-card-info {
          display: flex;
          flex-wrap: wrap;

          gap: 10px;

          margin-top: 10px;

          color: #777;

          font-size: 11px;
        }

        .bottom-card-info span {
          display: flex;
          align-items: center;

          gap: 5px;
        }


        /* -----------------------------------------
           ANIMATIONS
           ----------------------------------------- */

        @keyframes markerAppear {

          0% {
            opacity: 0;

            transform:
              translate(-50%, -25%)
              scale(0.5);
          }

          100% {
            opacity: 1;

            transform:
              translate(-50%, -50%)
              scale(1);
          }
        }

        @keyframes matchPop {

          0% {
            opacity: 0;

            transform:
              scale(0.5);
          }

          100% {
            opacity: 1;

            transform:
              scale(1);
          }
        }

        @keyframes userPulse {

          0% {
            transform:
              translate(-50%, -50%)
              scale(0.5);

            opacity: 0.9;
          }

          100% {
            transform:
              translate(-50%, -50%)
              scale(1.7);

            opacity: 0;
          }
        }

        @keyframes cardSlideUp {

          from {
            opacity: 0;

            transform:
              translateY(15px);
          }

          to {
            opacity: 1;

            transform:
              translateY(0);
          }
        }


        /* -----------------------------------------
           MOBILE
           ----------------------------------------- */

        @media (max-width: 520px) {

          .smart-map-page {
            padding: 0;
          }

          .smart-map {
            height:
              calc(
                100vh - 150px
              );

            min-height: 560px;

            border-radius: 0;
            border-left: 0;
            border-right: 0;
          }

          .map-activity-preview {
            width:
              calc(100% - 105px);
          }

          .map-bottom-card {
            right: 82px;
          }
        }

      `}</style>
    </>
  )
}
