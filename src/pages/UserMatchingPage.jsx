import React from 'react'

import { Bell, BellRing, Check, Clock3, Sparkles, UserRoundCheck } from 'lucide-react'

import BackButton from '../components/BackButton'

import { useApp } from '../context/AppContext'

import { mockUsers } from '../data/mockData'

import { calculateUserCompatibility } from '../services/recommendationService'

export default function UserMatchingPage() {
  const {
    user,

    followedUserIds,

    toggleUserNotifications,
  } = useApp()

  const matches = mockUsers
    .map((matchedUser) => ({
      ...matchedUser,

      ...calculateUserCompatibility(user, matchedUser),
    }))

    .sort((a, b) => b.score - a.score)

  return (
    <div className="page-content light-page">
      <BackButton />

      {/* HEADER */}

      <section className="headline-block">
        <span className="eyebrow">User Matching</span>

        <h2>People for you</h2>

        <p className="helper-text">Follow people you want to hear from.</p>
      </section>

      {/* USERS */}

      <div className="stack">
        {matches.map((matchedUser) => {
          const notificationsOn = followedUserIds.includes(matchedUser.id)

          return (
            <section className="new-match-card" key={matchedUser.id}>
              {/* USER TOP */}

              <div className="new-match-top">
                <div className="avatar match-avatar">{matchedUser.avatar}</div>

                <div className="match-user-copy">
                  <div className="match-name-row">
                    <h3>{matchedUser.name}</h3>

                    <span className="match-pill">
                      <UserRoundCheck size={14} />
                      {matchedUser.score}%
                    </span>
                  </div>

                  <p>
                    {matchedUser.shared.length > 0
                      ? `${matchedUser.shared.length} shared interests`
                      : 'Similar activity style'}
                  </p>
                </div>
              </div>

              {/* INTERESTS */}

              <div className="chip-row">
                {matchedUser.interests.map((interest) => (
                  <span className="tiny-chip" key={interest}>
                    {interest}
                  </span>
                ))}
              </div>

              {/* WHY MATCHED */}

              <div className="match-details">
                <span>
                  <Sparkles size={15} />

                  {matchedUser.shared.length > 0
                    ? matchedUser.shared
                        .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
                        .join(' · ')
                    : 'Similar interests'}
                </span>

                <span>
                  <Clock3 size={15} />

                  {matchedUser.preferredTime}
                </span>
              </div>

              {/* NOTIFICATION AREA */}

              <div className={notificationsOn ? 'notify-area enabled' : 'notify-area'}>
                <div className="notify-text">
                  <div className={notificationsOn ? 'notify-icon enabled' : 'notify-icon'}>
                    {notificationsOn ? <BellRing size={19} /> : <Bell size={19} />}
                  </div>

                  <div>
                    <strong>
                      {notificationsOn
                        ? 'Activity notifications ON'
                        : `Get notified from ${matchedUser.name}`}
                    </strong>

                    <p>
                      {notificationsOn
                        ? `We'll alert you when ${matchedUser.name} creates an activity.`
                        : `Get alerts when ${matchedUser.name} posts a new activity.`}
                    </p>
                  </div>
                </div>

                {/* ACTUAL CLICK BUTTON */}

                <button
                  className={notificationsOn ? 'notify-user-button enabled' : 'notify-user-button'}

                  onClick={() => toggleUserNotifications(matchedUser)}
                >
                  {notificationsOn ? (
                    <>
                      <Check size={17} />
                      Notifications ON
                    </>
                  ) : (
                    <>
                      <Bell size={17} />
                      Notify me
                    </>
                  )}
                </button>
              </div>
            </section>
          )
        })}
      </div>

      <style>{`

        .new-match-card {

          display: flex;
          flex-direction: column;

          gap: 14px;

          padding: 17px;

          border:
            1px solid
            #ECD2E0;

          border-radius:
            25px;

          background:
            #FFFFFF;

          box-shadow:
            0 7px 20px
            rgba(
              0,
              0,
              0,
              0.045
            );
        }



        /* USER */

        .new-match-top {

          display: flex;

          align-items: center;

          gap: 12px;
        }


        .match-avatar {

          width: 52px;

          height: 52px;

          min-width: 52px;

          background:
            #FFF0F1;

          color:
            #2A3723;

          border:
            1px solid
            #ECD2E0;
        }


        .match-user-copy {

          flex: 1;

          min-width: 0;
        }


        .match-name-row {

          display: flex;

          align-items: center;

          justify-content:
            space-between;

          gap: 10px;
        }


        .match-name-row h3 {

          margin: 0;

          font-size: 18px;
        }


        .match-user-copy p {

          margin:
            4px 0 0;

          color:
            #777;

          font-size:
            12px;
        }



        /* DETAILS */

        .match-details {

          display: flex;

          flex-wrap: wrap;

          gap: 8px;
        }


        .match-details span {

          display: flex;

          align-items: center;

          gap: 6px;

          padding:
            8px 11px;

          border-radius:
            999px;

          background:
            #FFF0F1;

          color:
            #666;

          font-size:
            11px;
        }


        .match-details svg {

          color:
            #A7ABDE;
        }



        /* ==================================
           NOTIFICATION BOX
           ================================== */

        .notify-area {

          padding: 13px;

          border:

            1px solid
            #ECD2E0;

          border-radius:
            20px;

          background:
            #FFF0F1;

          transition:
            180ms ease;
        }


        .notify-area.enabled {

          background:
            #FFD6EE;

          border-color:
            #FFA5D6;
        }



        .notify-text {

          display: flex;

          gap: 10px;

          align-items:
            center;

          margin-bottom:
            12px;
        }


        .notify-icon {

          width: 39px;
          height: 39px;

          min-width: 39px;

          display: grid;

          place-items:
            center;

          border-radius:
            14px;

          background:
            #FFFFFF;

          color:
            #FFA5D6;
        }


        .notify-icon.enabled {

          background:
            #A7ABDE;

          color:
            #FFFFFF;
        }


        .notify-text strong {

          display: block;

          font-size:
            13px;
        }


        .notify-text p {

          margin:
            3px 0 0;

          color:
            #777;

          font-size:
            11px;

          line-height:
            1.35;
        }



        /* ==================================
           BIG BUTTON
           ================================== */

        .notify-user-button {

          width: 100%;

          display: flex;

          align-items:
            center;

          justify-content:
            center;

          gap: 7px;

          padding:
            12px 15px;

          border:
            none;

          border-radius:
            999px;

          background:
            #FFA5D6;

          color:
            #FFFFFF;

          font-size:
            13px;

          font-weight:
            700;

          box-shadow:

            0 8px 18px

            rgba(
              255,
              165,
              214,
              0.30
            );

          transition:

            transform
            180ms ease,

            background
            180ms ease;
        }


        .notify-user-button:hover {

          transform:
            translateY(-1px);
        }


        .notify-user-button:active {

          transform:
            scale(0.98);
        }


        .notify-user-button.enabled {

          background:
            #A7ABDE;

          box-shadow:

            0 8px 18px

            rgba(
              167,
              171,
              222,
              0.28
            );
        }

      `}</style>
    </div>
  )
}
