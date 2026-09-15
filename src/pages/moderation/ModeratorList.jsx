import React from 'react'
import { ShieldCheck, UserRoundCheck, UserRoundX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { personName } from '../../i18n'

/**
 * Who holds the moderator rank, and appointing somebody to it.
 *
 * Split out of ModerationPage. Admin-only, but it does not decide that: the
 * page above does, once, for every section — a guard reimplemented per screen
 * is a guard that will eventually disagree with itself.
 */
export default function ModeratorList({
  moderators,
  admins,
  appointable,
  personSearch,
  setPersonSearch,
  changingRole,
  suspendedIds,
  onChangeRole,
  nameFor,
}) {
  const { t } = useTranslation()
  return (
    <>
      <section className="headline-block">
        <span className="eyebrow">{t('moderation.moderatorsPage.eyebrow')}</span>
        <h2>{t('moderation.moderatorsPage.title')}</h2>
        <p className="helper-text">{t('moderation.moderatorsPage.lead')}</p>
      </section>

      <div className="stack list-stack">
        {moderators.map((account) => (
          <article className="report-card" key={account.uid}>
            <header>
              <span className="report-kind">
                <ShieldCheck size={13} /> {t('moderation.moderatorsPage.kind')}
              </span>
              {account.suspended && (
                <span className="report-repeat">{t('moderation.moderatorsPage.suspended')}</span>
              )}
            </header>
            <h3>{nameFor(account.uid)}</h3>
            {account.suspended && (
              <p className="report-context">{t('moderation.moderatorsPage.suspendedNote')}</p>
            )}
            <div className="report-actions">
              <button
                className="danger-button"
                disabled={changingRole === account.uid}
                onClick={() => onChangeRole({ uid: account.uid, role: 'user' })}
              >
                <UserRoundX size={15} />{' '}
                {changingRole === account.uid
                  ? t('moderation.moderatorsPage.dismissing')
                  : t('moderation.moderatorsPage.dismiss')}
              </button>
            </div>
          </article>
        ))}

        {moderators.length === 0 && (
          <div className="empty-state">
            <ShieldCheck size={28} />
            <h3>{t('moderation.moderatorsPage.none')}</h3>
            <p>{t('moderation.moderatorsPage.noneBody')}</p>
          </div>
        )}

        <article className="report-card">
          <h3>{t('moderation.moderatorsPage.appointTitle')}</h3>
          <label className="report-detail">
            {t('moderation.moderatorsPage.searchLabel')}
            <input
              value={personSearch}
              maxLength={60}
              placeholder={t('moderation.moderatorsPage.searchPlaceholder')}
              onChange={(event) => setPersonSearch(event.target.value)}
            />
          </label>

          {!personSearch.trim() ? (
            <p className="report-meta">{t('moderation.moderatorsPage.typeToFind')}</p>
          ) : appointable.length === 0 ? (
            <p className="report-meta">
              {t('moderation.moderatorsPage.noneMatch', { query: personSearch.trim() })}
            </p>
          ) : (
            appointable.map((person) => (
              <div className="report-actions appoint-row" key={person.uid}>
                <span>
                  {personName(person.name)}
                  {person.username ? ` · ${person.username}` : ''}
                  {/* A rank somebody cannot currently use is worth saying
                      out loud before it is handed to them, not after. */}
                  {suspendedIds.has(person.uid) && (
                    <em className="appoint-note">{t('moderation.moderatorsPage.suspendedTag')}</em>
                  )}
                </span>
                <button
                  className="secondary-button"
                  disabled={changingRole === person.uid}
                  onClick={() => onChangeRole({ uid: person.uid, role: 'moderator' })}
                >
                  <UserRoundCheck size={15} />{' '}
                  {changingRole === person.uid
                    ? t('moderation.moderatorsPage.appointing')
                    : t('moderation.moderatorsPage.appoint')}
                </button>
              </div>
            ))
          )}
        </article>
      </div>

      <p className="helper-text">
        {admins.length === 1
          ? t('moderation.moderatorsPage.adminOne', { name: nameFor(admins[0].uid) })
          : t('moderation.moderatorsPage.adminMany', {
              names: admins.map((a) => nameFor(a.uid)).join(', '),
            })}{' '}
        {t('moderation.moderatorsPage.adminNote')}
      </p>
    </>
  )
}
