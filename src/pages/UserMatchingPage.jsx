import React, { useMemo, useState } from 'react'
import { Bell, Check, Clock3, Flag, Sparkles, UserRoundCheck, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { storedContext } from '../i18n/reportContext'
import ReportDialog from '../components/ReportDialog'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { categoryLabel, timeBandLabel, personName } from '../i18n'
import { calculateUserCompatibility } from '../services/recommendationService'

export default function UserMatchingPage() {
  const { t } = useTranslation()
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
      <section className="headline-block">
        <span className="eyebrow">{t('matching.eyebrow')}</span>
        <h2>{t('matching.title')}</h2>
        <p className="helper-text">{t('matching.lead')}</p>
      </section>

      {matches.length === 0 && (
        <div className="empty-state">
          <UsersRound size={30} />
          <h3>{t('matching.noneTitle')}</h3>
          <p>{t('matching.noneBody')}</p>
        </div>
      )}

      <div className="stack people-grid">
        {matches.map((matchedUser) => {
          const notificationsOn = followedUserIds.includes(matchedUser.uid)

          return (
            <section className="new-match-card" key={matchedUser.uid}>
              <div className="new-match-top">
                <div className="avatar match-avatar">{matchedUser.avatar}</div>
                <div className="match-user-copy">
                  <div className="match-name-row">
                    <h3>{personName(matchedUser.name)}</h3>
                    <button
                      className="icon-button slim person-report"
                      onClick={() =>
                        setReporting({
                          type: 'user',
                          id: matchedUser.uid,
                          name: matchedUser.name,
                          avatar: matchedUser.avatar,
                          label: 'matching.reportLabel',
                          context: storedContext('match', { score: matchedUser.score }),
                        })
                      }
                      aria-label={t('matching.reportOrBlock', { name: matchedUser.name })}
                    >
                      <Flag size={15} />
                    </button>
                    <span className="match-pill">
                      <UserRoundCheck size={13} />
                      {t('common.percent', { value: matchedUser.score })}
                    </span>
                  </div>
                  <p>
                    {matchedUser.shared.length > 0
                      ? t('matching.sharedInterests', { count: matchedUser.shared.length })
                      : t('matching.similarStyle')}
                  </p>
                </div>
              </div>

              <div className="chip-row">
                {(matchedUser.interests || []).map((interest) => (
                  <span className="tiny-chip" key={interest}>
                    {categoryLabel(interest)}
                  </span>
                ))}
              </div>

              <div className="match-details">
                <span>
                  <Sparkles size={13} />
                  {matchedUser.shared.length > 0
                    ? matchedUser.shared.map(categoryLabel).join(' · ')
                    : t('matching.similarInterests')}
                </span>
                <span>
                  <Clock3 size={13} />
                  {matchedUser.preferredTime
                    ? timeBandLabel(matchedUser.preferredTime)
                    : t('matching.anyTime')}
                </span>
              </div>

              <div className="notify-row">
                <div className="notify-text">
                  <strong>
                    {notificationsOn
                      ? t('matching.notificationsOn')
                      : t('matching.activityNotifications')}
                  </strong>
                  <p>
                    {notificationsOn
                      ? t('matching.alertedWhen', { name: matchedUser.name })
                      : t('matching.getAlerted', { name: matchedUser.name })}
                  </p>
                </div>
                <button
                  className={notificationsOn ? 'notify-user-button enabled' : 'notify-user-button'}
                  onClick={() => toggleUserNotifications(matchedUser)}
                  aria-pressed={notificationsOn}
                >
                  {notificationsOn ? (
                    <>
                      <Check size={15} /> {t('matching.following')}
                    </>
                  ) : (
                    <>
                      <Bell size={15} /> {t('matching.notifyMe')}
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
