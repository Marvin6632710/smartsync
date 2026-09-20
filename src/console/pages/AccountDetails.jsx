import React, { useEffect, useMemo } from 'react'
import { MessageSquareWarning, ShieldOff, UserRoundCheck, UserRoundX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { fetchAccountHistory } from '../../firebase/moderation'
import { categoryLabel } from '../../i18n'
import { useConsole } from '../ConsoleContext'
import { historyEvents } from '../history'
import { useFetched } from '../hooks'
import DetailPanel from '../ui/DetailPanel'
import Timeline from '../ui/Timeline'
import {
  AccountStateBadges,
  Badge,
  Empty,
  Field,
  Fields,
  RankBadge,
  Section,
  StatusBadge,
  When,
} from '../ui'

/**
 * One account: who they are in public, what state their account is in,
 * everything on their record, and the actions an admin may take on them —
 * the ladder, in order: warn, suspend (and lift), close (and reopen).
 *
 * The record is fetched whole — the log, the warnings, the reports about
 * them and the reports they filed — rather than read off the pages in
 * memory, because a person's history is the thing an admin most needs to
 * be complete. Nobody acts on an admin from inside the app, and nobody on
 * themselves; the rules refuse both, and the buttons are not drawn.
 */
export default function AccountDetails({ uid, person, profile, base, onClose }) {
  const { t } = useTranslation()
  const {
    user,
    app,
    nameFor,
    ensureProfile,
    rankOf,
    isSuspended,
    isClosed,
    warningCount,
    openAbout,
    subjectOf,
    statusOf,
    reasonLabel,
    desk,
  } = useConsole()
  useEffect(() => ensureProfile(uid), [uid, ensureProfile])

  const history = useFetched(uid, fetchAccountHistory)
  const rank = rankOf(uid)
  const suspended = isSuspended(uid)
  const closed = isClosed(uid)
  const isMe = uid === user.uid
  const cannotTouch = isMe || rank === 'admin'
  const busy = desk.recording === uid || desk.suspending === uid

  const events = useMemo(
    () =>
      history.data
        ? historyEvents(
            {
              log: history.data.log,
              warnings: history.data.warnings,
              reports: history.data.reportsAbout,
            },
            subjectOf,
          )
        : [],
    [history.data, subjectOf],
  )
  const open = openAbout(uid)
  const hosted = app.allActivities.filter((a) => a.hostId === uid)
  const name = profile?.name ? nameFor(uid) : nameFor(uid)

  return (
    <DetailPanel
      eyebrow={t('console.accounts.one')}
      title={name}
      badges={
        <>
          <RankBadge rank={rank} />
          <AccountStateBadges suspended={suspended} closed={closed} warnings={warningCount(uid)} />
          {open.length > 0 && (
            <Badge tone="repeat">{t('console.reports.otherOpen', { count: open.length })}</Badge>
          )}
        </>
      }
      onClose={onClose}
      footer={
        <div className="con-actions">
          {cannotTouch && !isMe && (
            <p className="con-note" role="status">
              {t('moderation.people.isAdmin')}
            </p>
          )}
          {isMe && (
            <p className="con-note" role="status">
              {t('console.accounts.yourself')}
            </p>
          )}
          <div className="con-action-row">
            {!cannotTouch && !closed && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => desk.askRecorded(uid, 'warn')}
              >
                <MessageSquareWarning size={15} />{' '}
                {desk.recording === uid ? t('common.working') : t('moderation.people.warn')}
              </button>
            )}
            {!cannotTouch && !suspended && !closed && (
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => desk.askSuspend(uid, true)}
              >
                <UserRoundX size={15} />{' '}
                {desk.suspending === uid
                  ? t('moderation.people.suspending')
                  : t('moderation.people.suspendAccount')}
              </button>
            )}
            {!cannotTouch && suspended && !closed && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => desk.askSuspend(uid, false)}
              >
                <UserRoundCheck size={15} />{' '}
                {desk.suspending === uid
                  ? t('moderation.people.lifting')
                  : t('moderation.people.liftSuspension')}
              </button>
            )}
            {/* The end of the ladder: the one rung with nothing after it. */}
            {!cannotTouch && !closed && (
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => desk.askRecorded(uid, 'close')}
              >
                <ShieldOff size={15} /> {t('moderation.people.closeAccount')}
              </button>
            )}
            {!cannotTouch && closed && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => desk.askRecorded(uid, 'reopen')}
              >
                <UserRoundCheck size={15} /> {t('moderation.people.reopenAccount')}
              </button>
            )}
          </div>
        </div>
      }
    >
      <Section title={t('console.accounts.profile')} id="con-profile">
        <div className="con-person">
          <span className="avatar con-person-avatar" aria-hidden="true">
            {profile?.avatar || '?'}
          </span>
          <div className="con-person-copy">
            <strong>{name}</strong>
            <small>
              {profile?.username || uid}
              {profile?.anonymous ? t('moderation.people.anonymousOn') : ''}
            </small>
          </div>
        </div>
        {profile ? (
          <Fields>
            <Field label={t('console.accounts.interests')} wide>
              {profile.interests?.length ? profile.interests.map(categoryLabel).join(' · ') : '—'}
            </Field>
            {profile.bio && (
              <Field label={t('console.accounts.bio')} wide>
                {profile.bio}
              </Field>
            )}
            <Field label={t('console.accounts.since')}>
              <When at={profile.createdAt?.toMillis?.() ?? null} exact />
            </Field>
            <Field label={t('console.accounts.uid')}>
              <code>{uid}</code>
            </Field>
          </Fields>
        ) : (
          <p className="con-muted">{t('console.accounts.profileUnknown')}</p>
        )}
        <p className="con-muted">{t('console.accounts.publicOnly')}</p>
      </Section>

      <Section title={t('console.accounts.activity')} id="con-activity">
        <Fields>
          <Field label={t('console.accounts.columns.hosts')}>
            {person?.inWindow ? person.hosts : '—'}
          </Field>
          <Field label={t('console.accounts.columns.joined')}>
            {person?.inWindow ? person.joinedCount : '—'}
          </Field>
          <Field label={t('console.accounts.takenDown')}>{person?.removedCount ?? '—'}</Field>
        </Fields>
        {hosted.length > 0 && (
          <ul className="con-links">
            {hosted.slice(0, 6).map((activity) => (
              <li key={activity.id}>
                <Link to={`/activity/${activity.id}`}>{activity.title}</Link>{' '}
                <span className="con-muted">
                  ·{' '}
                  {t(`console.activityStatus.${activity.status}`, {
                    defaultValue: activity.status,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="con-muted">{t('console.accounts.windowNote')}</p>
      </Section>

      {open.length > 0 && (
        <Section title={t('console.accounts.openReports')} id="con-open">
          <ul className="con-links">
            {open.map((report) => (
              <li key={report.id}>
                <Link to={`${base}/reports/${report.id}`}>
                  {reasonLabel(report.reason)} · <When at={report.createdAt} />
                </Link>{' '}
                <StatusBadge status={statusOf(report)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t('console.accounts.record')} id="con-account-record">
        {history.error ? (
          <p className="form-error" role="alert">
            {t('console.accounts.recordFailed')}
          </p>
        ) : history.loading ? (
          <p className="con-muted" role="status">
            {t('common.loading')}
          </p>
        ) : (
          <Timeline events={events} base={base} emptyTitle={t('console.reports.cleanRecord')} />
        )}
      </Section>

      <Section title={t('console.accounts.filed')} id="con-filed">
        {history.data?.reportsFiled?.length ? (
          <ul className="con-links">
            {history.data.reportsFiled.slice(0, 10).map((report) => (
              <li key={report.id}>
                <Link to={`${base}/reports/${report.id}`}>
                  {reasonLabel(report.reason)} · {nameFor(subjectOf(report))} ·{' '}
                  <When at={report.createdAt} />
                </Link>{' '}
                <StatusBadge status={statusOf(report)} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty title={t('console.accounts.filedNone')} />
        )}
      </Section>
    </DetailPanel>
  )
}
