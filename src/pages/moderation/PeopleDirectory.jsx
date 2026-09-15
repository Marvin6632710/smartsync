import React from 'react'
import { Eye, MessageSquareWarning, ShieldOff, UserRoundCheck, UserRoundX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { categoryLabel } from '../../i18n'

/**
 * Everyone on SmartSync, with what each person has actually done attached.
 *
 * Split out of ModerationPage. This is the screen for looking without waiting
 * to be told — reports say where to look, this does not need them. Public
 * profile data only: the private half of a profile is readable by its owner
 * and by nobody else, an admin included.
 */
export default function PeopleDirectory({
  user,
  people,
  watched,
  watchSearch,
  setWatchSearch,
  suspending,
  recording,
  setSuspendTarget,
  setRecorded,
  setRecordedReason,
  searching = false,
  searchFailed = false,
  windowFull = false,
}) {
  const { t } = useTranslation()
  return (
    <>
      <section className="headline-block">
        <span className="eyebrow">{t('moderation.people.eyebrow')}</span>
        <h2>{t('moderation.people.title')}</h2>
        <p className="helper-text">
          {t('moderation.people.accounts', { count: people.length })}
          {windowFull ? t('moderation.people.loaded') : ''}
          {t('moderation.people.lead')}
        </p>
        {/* Past the window the list is partial, and silently partial is the
            worst kind. Say so, and say what still works. */}
        {windowFull && (
          <p className="form-error" role="status">
            {t('moderation.people.windowNote', { count: people.length })}
          </p>
        )}
      </section>

      <label className="report-detail watch-search">
        {t('moderation.people.searchLabel')}
        <input
          value={watchSearch}
          maxLength={60}
          placeholder={t('moderation.people.searchPlaceholder')}
          onChange={(event) => setWatchSearch(event.target.value)}
        />
      </label>
      {searching && (
        <p className="helper-text" role="status">
          {t('moderation.people.searching')}
        </p>
      )}
      {searchFailed && (
        <p className="form-error" role="alert">
          {t('moderation.people.searchFailed')}
        </p>
      )}

      <div className="stack list-stack">
        {watched.slice(0, 40).map((person) => {
          const isMe = person.uid === user.uid
          const cannotTouch =
            isMe || person.rank === 'admin' || (person.rank !== 'user' && !user.isAdmin)
          return (
            <article className="report-card" key={person.uid}>
              <header>
                <span className="report-kind">
                  <Eye size={13} />{' '}
                  {t(`moderation.role.${person.rank}`, { defaultValue: person.rank })}
                </span>
                {person.closed && (
                  <span className="report-repeat">{t('moderation.people.closed')}</span>
                )}
                {person.suspended && !person.closed && (
                  <span className="report-repeat">{t('moderation.people.suspended')}</span>
                )}
                {person.warnings > 0 && (
                  <span className="report-repeat">
                    {t('moderation.people.warnings', { count: person.warnings })}
                  </span>
                )}
                {person.removedCount > 0 && (
                  <span className="report-repeat">
                    {t('moderation.people.takenDown', { count: person.removedCount })}
                  </span>
                )}
              </header>

              <h3>
                {person.name}
                {isMe ? t('moderation.people.youSuffix') : ''}
              </h3>
              <p className="report-context">
                {person.username ? `${person.username} · ` : ''}
                {person.inWindow
                  ? t('moderation.people.counts', {
                      hosts: person.hosts,
                      joined: person.joinedCount,
                    })
                  : t('moderation.people.foundBySearch')}
                {person.anonymous ? t('moderation.people.anonymousOn') : ''}
              </p>
              {(person.interests || []).length > 0 && (
                <p className="report-meta">
                  {(person.interests || []).map(categoryLabel).join(' · ')}
                </p>
              )}

              <div className="report-actions">
                {!cannotTouch && !person.closed && (
                  <button
                    className="secondary-button"
                    disabled={recording === person.uid}
                    onClick={() => {
                      setRecordedReason('')
                      setRecorded({ uid: person.uid, kind: 'warn' })
                    }}
                  >
                    <MessageSquareWarning size={15} />{' '}
                    {recording === person.uid ? t('common.working') : t('moderation.people.warn')}
                  </button>
                )}
                {!cannotTouch && !person.suspended && !person.closed && (
                  <button
                    className="danger-button"
                    disabled={suspending === person.uid}
                    onClick={() => setSuspendTarget({ uid: person.uid, suspend: true })}
                  >
                    <UserRoundX size={15} />{' '}
                    {suspending === person.uid
                      ? t('moderation.people.suspending')
                      : t('moderation.people.suspendAccount')}
                  </button>
                )}
                {!cannotTouch && person.suspended && !person.closed && (
                  <button
                    className="secondary-button"
                    disabled={suspending === person.uid}
                    onClick={() => setSuspendTarget({ uid: person.uid, suspend: false })}
                  >
                    <UserRoundCheck size={15} />{' '}
                    {suspending === person.uid
                      ? t('moderation.people.lifting')
                      : t('moderation.people.liftSuspension')}
                  </button>
                )}
                {/* The end of the ladder, and an admin's alone. */}
                {!cannotTouch && user.isAdmin && !person.closed && (
                  <button
                    className="danger-button"
                    disabled={recording === person.uid}
                    onClick={() => {
                      setRecordedReason('')
                      setRecorded({ uid: person.uid, kind: 'close' })
                    }}
                  >
                    <ShieldOff size={15} /> {t('moderation.people.closeAccount')}
                  </button>
                )}
                {!cannotTouch && user.isAdmin && person.closed && (
                  <button
                    className="secondary-button"
                    disabled={recording === person.uid}
                    onClick={() => {
                      setRecordedReason('')
                      setRecorded({ uid: person.uid, kind: 'reopen' })
                    }}
                  >
                    <UserRoundCheck size={15} /> {t('moderation.people.reopenAccount')}
                  </button>
                )}
                {cannotTouch && !isMe && (
                  <span className="report-meta">
                    {person.rank === 'admin'
                      ? t('moderation.people.isAdmin')
                      : t('moderation.people.isModerator')}
                  </span>
                )}
              </div>
            </article>
          )
        })}

        {watched.length === 0 && (
          <div className="empty-state">
            <Eye size={28} />
            <h3>{t('moderation.people.nobody')}</h3>
            <p>{t('moderation.people.nobodyBody')}</p>
          </div>
        )}

        {watched.length > 40 && (
          <p className="helper-text">
            {t('moderation.people.showingFirst', { shown: 40, count: watched.length })}
          </p>
        )}
      </div>
    </>
  )
}
