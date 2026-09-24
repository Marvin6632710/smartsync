import { AvatarContent } from '../components/SavedPicture'
import React, { useCallback, useMemo, useState } from 'react'
import {
  Bell,
  Check,
  ChevronDown,
  Clock3,
  Flag,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { storedContext } from '../i18n/reportContext'
import ReportDialog from '../components/ReportDialog'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { categoryLabel, timeBandLabel, personName } from '../i18n'
import { calculateUserCompatibility, SIMILAR_USER_THRESHOLD } from '../services/compatibility'

/**
 * People for you.
 *
 * A card says who somebody is and offers the one decision worth making
 * here — whether to hear about what they post. Everything that explains
 * the ranking (what you have in common, when they are usually free, what
 * they are into) is a drawer, opened by pressing the person.
 *
 * It used to show all of it at once: six interest chips, two fact pills
 * and a bordered notification block with its own heading and sentence, on
 * every card, for everybody. Ten people is then ten walls of text with
 * nothing to compare — the page is a list to skim, and a list you cannot
 * skim is not doing its job. Collapsed, the cards are roughly a third of
 * the height and the names line up down the column.
 *
 * Each card opens on its own rather than closing the others: comparing
 * two people means having both open, and an accordion makes that
 * impossible for no benefit.
 */
export default function UserMatchingPage() {
  const { t } = useTranslation()
  const { peers, followedUserIds, toggleUserNotifications } = useApp()
  const { user } = useAuth()
  const [reporting, setReporting] = useState(null)
  const [openIds, setOpenIds] = useState(() => new Set())

  const toggleDetails = useCallback((uid) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (!next.delete(uid)) next.add(uid)
      return next
    })
  }, [])

  // Real people who signed up, scored against the real profile.
  const matches = useMemo(
    () =>
      peers
        .map((peer) => ({ ...peer, ...calculateUserCompatibility(user, peer) }))
        .sort((a, b) => b.score - a.score),
    [peers, user],
  )

  return (
    <div className="page-content matching-page">
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
          const open = openIds.has(matchedUser.uid)
          const detailsId = `match-details-${matchedUser.uid}`
          // A profile with no name at all would leave the card's own label
          // empty, and an unlabelled region is not a region.
          const name = personName(matchedUser.name) || t('common.unknownUser')
          // The same threshold the AI Picks request uses to call somebody
          // similar, rather than a number picked to make the pill pretty.
          const strong = matchedUser.score >= SIMILAR_USER_THRESHOLD
          const interests = matchedUser.interests || []

          return (
            <section
              className="new-match-card"
              data-open={open ? 'yes' : 'no'}
              aria-label={name}
              key={matchedUser.uid}
            >
              <div className="match-head">
                {/* The person is the control. A chevron alone is a target
                    the size of a fingernail, and "what is this?" and "tell
                    me more" are the same question. */}
                <button
                  type="button"
                  className="match-toggle"
                  aria-expanded={open}
                  aria-controls={detailsId}
                  onClick={() => toggleDetails(matchedUser.uid)}
                >
                  <span className="avatar match-avatar">
                    <AvatarContent person={matchedUser} />
                  </span>
                  <span className="match-identity">
                    {/* The score reads as part of the name rather than out
                        at the card's edge, where it squeezed the name into a
                        column too narrow to hold one. */}
                    <span className="match-name-line">
                      <span className="match-name">{name}</span>
                      <span className="match-pill" data-strong={strong ? 'yes' : 'no'}>
                        <UserRoundCheck size={13} />
                        {t('common.percent', { value: matchedUser.score })}
                      </span>
                    </span>
                    <span className="match-sub">
                      {matchedUser.shared.length > 0
                        ? t('matching.sharedInterests', { count: matchedUser.shared.length })
                        : t('matching.similarStyle')}
                    </span>
                  </span>
                  <ChevronDown size={18} className="match-chevron" aria-hidden="true" />
                </button>
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
              </div>

              {open && (
                <div className="match-more" id={detailsId}>
                  <dl className="match-facts">
                    {matchedUser.shared.length > 0 && (
                      <div>
                        <dt>
                          <Sparkles size={14} aria-hidden="true" />
                          {t('matching.sharedLabel')}
                        </dt>
                        <dd>{matchedUser.shared.map(categoryLabel).join(' · ')}</dd>
                      </div>
                    )}
                    <div>
                      <dt>
                        <Clock3 size={14} aria-hidden="true" />
                        {t('matching.freeLabel')}
                      </dt>
                      <dd>
                        {matchedUser.preferredTime
                          ? timeBandLabel(matchedUser.preferredTime)
                          : t('matching.anyTime')}
                      </dd>
                    </div>
                  </dl>

                  {interests.length > 0 && (
                    <div className="match-interests">
                      <span className="match-more-label">{t('matching.interestsLabel')}</span>
                      <div className="chip-row">
                        {interests.map((interest) => (
                          <span className="tiny-chip" key={interest}>
                            {categoryLabel(interest)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="match-notify">
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
                {/* The sentence that used to sit above this button on every
                    card, all the time. It says what the button does, which
                    is worth one read and not ten. */}
                {open && (
                  <p className="match-notify-hint">
                    {notificationsOn
                      ? t('matching.alertedWhen', { name: matchedUser.name })
                      : t('matching.getAlerted', { name: matchedUser.name })}
                  </p>
                )}
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
