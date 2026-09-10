import React, { useMemo, useState } from 'react'
import { Bell, Check, Clock3, Flag, Sparkles, UserRoundCheck, UsersRound } from 'lucide-react'
import BackButton from '../components/BackButton'
import ReportDialog from '../components/ReportDialog'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { calculateUserCompatibility } from '../services/recommendationService'

export default function UserMatchingPage() {
  const { peers, followedUserIds, toggleUserNotifications } = useApp()
  const { user } = useAuth()
  const [reporting, setReporting] = useState(null)

  // Real people who signed up, scored against the real profile.
  const matches = useMemo(
    () =>
      peers
        .map((peer) => ({ ...peer, ...calculateUserCompatibility(user, peer) }))
        .sort((a, b) => b.score - a.score),
    [peers, user],
  )

  return (
    <div className="page-content">
      <BackButton />

      <section className="headline-block">
        <span className="eyebrow">User matching</span>
        <h2>People for you</h2>
        <p className="helper-text">Follow people whose activities you want to hear about.</p>
      </section>

      {matches.length === 0 && (
        <div className="empty-state">
          <UsersRound size={30} />
          <h3>No one else yet</h3>
          <p>
            When other people join SmartSync they will show up here, ranked by how well you match.
          </p>
        </div>
      )}

      <div className="stack">
        {matches.map((matchedUser) => {
          const notificationsOn = followedUserIds.includes(matchedUser.uid)

          return (
            <section className="new-match-card" key={matchedUser.uid}>
              <div className="new-match-top">
                <div className="avatar match-avatar">{matchedUser.avatar}</div>
                <div className="match-user-copy">
                  <div className="match-name-row">
                    <h3>{matchedUser.name}</h3>
                    <button
                      className="icon-button slim person-report"
                      onClick={() =>
                        setReporting({
                          type: 'user',
                          id: matchedUser.uid,
                          name: matchedUser.name,
                          avatar: matchedUser.avatar,
                          label: 'this person',
                          context: `Suggested match, ${matchedUser.score}% compatibility`,
                        })
                      }
                      aria-label={`Report or block ${matchedUser.name}`}
                    >
                      <Flag size={15} />
                    </button>
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
                {(matchedUser.interests || []).map((interest) => (
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
                  {matchedUser.preferredTime || 'Any time'}
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
                      <Check size={15} /> Following
                    </>
                  ) : (
                    <>
                      <Bell size={15} /> Notify me
                    </>
                  )}
                </button>
              </div>
            </section>
          )
        })}
      </div>

      <ReportDialog
        open={Boolean(reporting)}
        subject={reporting}
        onClose={() => setReporting(null)}
      />
    </div>
  )
}
