import React from 'react'
import { Bell, Check, Clock3, Sparkles, UserRoundCheck } from 'lucide-react'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'
import { mockUsers } from '../data/mockData'
import { calculateUserCompatibility } from '../services/recommendationService'

export default function UserMatchingPage() {
  const { user, followedUserIds, toggleUserNotifications } = useApp()

  const matches = mockUsers
    .map((matchedUser) => ({
      ...matchedUser,
      ...calculateUserCompatibility(user, matchedUser),
    }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="page-content">
      <BackButton />

      <section className="headline-block">
        <span className="eyebrow">User matching</span>
        <h2>People for you</h2>
        <p className="helper-text">Follow people whose activities you want to hear about.</p>
      </section>

      <div className="stack">
        {matches.map((matchedUser) => {
          const notificationsOn = followedUserIds.includes(matchedUser.id)

          return (
            <section className="new-match-card" key={matchedUser.id}>
              <div className="new-match-top">
                <div className="avatar match-avatar">{matchedUser.avatar}</div>

                <div className="match-user-copy">
                  <div className="match-name-row">
                    <h3>{matchedUser.name}</h3>

                    <span className="match-pill">
                      <UserRoundCheck size={13} />
                      {matchedUser.score}%
                    </span>
                  </div>

                  <p>
                    {matchedUser.shared.length > 0
                      ? `${matchedUser.shared.length} shared ${
                          matchedUser.shared.length === 1 ? 'interest' : 'interests'
                        }`
                      : 'Similar activity style'}
                  </p>
                </div>
              </div>

              <div className="chip-row">
                {matchedUser.interests.map((interest) => (
                  <span className="tiny-chip" key={interest}>
                    {interest}
                  </span>
                ))}
              </div>

              <div className="match-details">
                <span>
                  <Sparkles size={13} />
                  {matchedUser.shared.length > 0
                    ? matchedUser.shared
                        .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
                        .join(' · ')
                    : 'Similar interests'}
                </span>

                <span>
                  <Clock3 size={13} />
                  {matchedUser.preferredTime}
                </span>
              </div>

              <div className="notify-row">
                <div className="notify-text">
                  <strong>{notificationsOn ? 'Notifications on' : 'Activity notifications'}</strong>
                  <p>
                    {notificationsOn
                      ? `You'll be alerted when ${matchedUser.name} posts an activity.`
                      : `Get alerted when ${matchedUser.name} posts an activity.`}
                  </p>
                </div>

                <button
                  className={notificationsOn ? 'notify-user-button enabled' : 'notify-user-button'}
                  onClick={() => toggleUserNotifications(matchedUser)}
                  aria-pressed={notificationsOn}
                >
                  {notificationsOn ? (
                    <>
                      <Check size={15} />
                      Following
                    </>
                  ) : (
                    <>
                      <Bell size={15} />
                      Notify me
                    </>
                  )}
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
