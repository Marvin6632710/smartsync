import { AvatarContent } from '../../components/SavedPicture'
import React, { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Hand,
  MessageSquareWarning,
  RotateCcw,
  Trash2,
  UserRoundX,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { CLAIM_TTL_MS } from '../../firebase/moderation'
import { runAdminContentAction } from '../../firebase/admin'
import { categoryLabel, personName } from '../../i18n'
import { localizeReportContext } from '../../i18n/reportContext'
import { formatActivityDate, formatClock } from '../../utils/time'
import { useConsole } from '../ConsoleContext'
import { historyEvents } from '../history'
import { useNow } from '../hooks'
import DetailPanel from '../ui/DetailPanel'
import AdminActionButton from '../AdminActionButton'
import Timeline from '../ui/Timeline'
import {
  AccountStateBadges,
  AppLink,
  Badge,
  Field,
  Fields,
  RankBadge,
  Section,
  StatusBadge,
  TypeBadge,
  When,
} from '../ui'

const mmss = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * One report, in full: the evidence, who it is about and what is already
 * on their record, who holds it, and the actions — in that order, because
 * that is the order a decision is made in.
 *
 * Two things it deliberately does not do. It does not let anyone act
 * without saying why — every action records a reason and who took it,
 * because a removal nobody can account for is indistinguishable from an
 * abuse of the power to remove. And it does not hide what was reported
 * behind a summary: the reporter's own words and the thing they were
 * looking at are shown in full, since a decision made on a category label
 * is not a decision.
 */
export default function ReportDetails({ report, base, onClose }) {
  const { t } = useTranslation()
  const now = useNow(1000)
  const {
    user,
    nameFor,
    profileOf,
    ensureProfile,
    subjectOf,
    timesReported,
    openAbout,
    involvesMe,
    statusOf,
    reasonLabel,
    rankOf,
    isSuspended,
    isClosed,
    warningsBySubject,
    resolvedReports,
    log,
    activityById,
    desk,
  } = useConsole()

  const subjectId = subjectOf(report)
  const subject = profileOf(subjectId)
  const reporter = profileOf(report.reporterId)
  useEffect(() => {
    ensureProfile(subjectId)
    ensureProfile(report.reporterId)
  }, [subjectId, report.reporterId, ensureProfile])

  const status = statusOf(report, now)
  const decided = report.status !== 'open'
  const mineToJudge = !involvesMe(report)
  const held = status === 'held'
  const busy = desk.actingOn === report.id || desk.claiming === report.id
  const waits = busy || held || !mineToJudge || decided
  const repeats = timesReported(report)
  const claimLeft = report.claimedAt ? CLAIM_TTL_MS - (now - report.claimedAt) : 0
  const [messageStatus, setMessageStatus] = useState('loading')

  useEffect(() => {
    if (report.targetType !== 'message' || !report.activityId) return undefined
    let live = true
    runAdminContentAction({
      action: 'message-status',
      activityId: report.activityId,
      messageId: report.targetId,
    })
      .then((result) => live && setMessageStatus(result.status))
      .catch(() => live && setMessageStatus('unavailable'))
    return () => {
      live = false
    }
  }, [report.activityId, report.targetId, report.targetType])

  const activity =
    report.targetType === 'activity'
      ? activityById.get(report.targetId)
      : report.activityId
        ? activityById.get(report.activityId)
        : null
  const activityId = report.targetType === 'activity' ? report.targetId : report.activityId

  // What is already on the subject's record, from the pages in memory: the
  // account page fetches the whole of it.
  const record = historyEvents(
    {
      log: log.filter((e) => e.subjectId === subjectId),
      warnings: warningsBySubject.get(subjectId) || [],
      reports: resolvedReports.filter((r) => subjectOf(r) === subjectId && r.id !== report.id),
    },
    subjectOf,
  ).slice(0, 6)
  const others = openAbout(subjectId).filter((r) => r.id !== report.id)

  const label = (working, idle) => (desk.actingOn === report.id ? working : idle)

  return (
    <DetailPanel
      eyebrow={t('console.reports.one', { id: report.id.slice(0, 6) })}
      title={reasonLabel(report.reason)}
      badges={
        <>
          <StatusBadge status={status} name={held ? nameFor(report.claimedBy) : undefined} />
          <TypeBadge type={report.targetType} />
          {repeats > 1 && (
            <Badge tone="repeat">{t('moderation.reportedTimes', { count: repeats })}</Badge>
          )}
        </>
      }
      onClose={onClose}
      footer={
        decided ? null : (
          <div className="con-actions">
            {!mineToJudge && (
              <p className="con-note" role="status">
                {t('console.reports.involvesYou')}
              </p>
            )}
            {held && (
              <p className="con-note" role="status">
                {t('moderation.inReviewBy', { name: nameFor(report.claimedBy) })} ·{' '}
                {t('console.claim.expiresIn', { time: mmss(claimLeft) })}
              </p>
            )}
            <div className="con-action-row">
              {report.targetType === 'activity' ? (
                <button
                  className="danger-button"
                  disabled={waits}
                  onClick={() => desk.setActing({ report, kind: 'remove' })}
                >
                  <Trash2 size={15} /> {label(t('common.working'), t('moderation.removeActivity'))}
                </button>
              ) : (
                <button
                  className="danger-button"
                  disabled={waits}
                  onClick={() => desk.setActing({ report, kind: 'suspend' })}
                >
                  <UserRoundX size={15} />{' '}
                  {label(t('common.working'), t('moderation.suspendAccount'))}
                </button>
              )}
              <button
                className="secondary-button"
                disabled={waits}
                onClick={() => desk.warnFromReport(report)}
              >
                <MessageSquareWarning size={15} /> {t('moderation.warn')}
              </button>
              <button
                className="secondary-button"
                disabled={waits}
                onClick={() => desk.setActing({ report, kind: 'dismiss' })}
              >
                <CheckCircle2 size={15} /> {t('moderation.dismiss')}
              </button>
            </div>
          </div>
        )
      }
    >
      {/* The claim: whose the report is while it is being looked at. */}
      {!decided && (
        <Section title={t('console.claim.title')} className="con-claim" id="con-claim">
          {status === 'mine' || status === 'stale' ? (
            <div className="con-claim-row">
              <span>
                {status === 'mine'
                  ? t('console.claim.yours', { time: mmss(claimLeft) })
                  : report.claimedBy === user.uid
                    ? t('console.claim.yoursExpired')
                    : t('console.claim.staleOther', { name: nameFor(report.claimedBy) })}
              </span>
              <div className="con-action-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || !mineToJudge}
                  onClick={() => desk.claim(report)}
                >
                  <RotateCcw size={14} />{' '}
                  {status === 'mine' ? t('console.claim.renew') : t('console.claim.take')}
                </button>
                {report.claimedBy === user.uid && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => desk.release(report)}
                  >
                    {t('console.claim.release')}
                  </button>
                )}
              </div>
            </div>
          ) : held ? (
            <p className="con-claim-held">
              {t('moderation.inReviewBy', { name: nameFor(report.claimedBy) })} ·{' '}
              {t('console.claim.expiresIn', { time: mmss(claimLeft) })}
            </p>
          ) : (
            <div className="con-claim-row">
              <span>{t('console.claim.nobody')}</span>
              <button
                type="button"
                className="primary-button"
                disabled={busy || !mineToJudge}
                onClick={() => desk.claim(report)}
              >
                <Hand size={14} /> {t('console.claim.take')}
              </button>
            </div>
          )}
        </Section>
      )}

      {decided && (
        <Section title={t('console.reports.decision')} id="con-decision">
          <Fields>
            <Field label={t('console.reports.decidedBy')}>{nameFor(report.reviewedBy)}</Field>
            <Field label={t('console.reports.decidedAt')}>
              <When at={report.reviewedAt} exact />
            </Field>
            <Field label={t('console.reports.outcome')} wide>
              {report.outcome || '—'}
            </Field>
          </Fields>
        </Section>
      )}

      <Section title={t('console.reports.evidence')} id="con-evidence">
        {report.context && <p className="con-context">{localizeReportContext(report.context)}</p>}
        {report.detail ? (
          <blockquote className="con-quote">“{report.detail}”</blockquote>
        ) : (
          <p className="con-muted">{t('console.reports.noDetail')}</p>
        )}
        {report.targetType === 'message' && (
          <p className="con-muted">{t('console.reports.messageNote')}</p>
        )}
        {activityId && (
          <div className="con-activity-card">
            {activity ? (
              <>
                <strong>{activity.title}</strong>
                <span>
                  {categoryLabel(activity.category)} · {formatActivityDate(activity.date)}{' '}
                  {formatClock(activity.time)} · {activity.locationName}
                </span>
                <span>
                  {t('console.activities.roster', {
                    count: (activity.participantUids || []).length,
                    capacity: activity.capacity,
                  })}{' '}
                  ·{' '}
                  {t(`console.activityStatus.${activity.status}`, {
                    defaultValue: activity.status,
                  })}
                </span>
              </>
            ) : (
              <span className="con-muted">{t('console.reports.activityNotLoaded')}</span>
            )}
            <AppLink to={`/activity/${activityId}`}>{t('common.lookAtIt')}</AppLink>
          </div>
        )}
      </Section>

      {report.targetType === 'message' && report.activityId && mineToJudge && (
        <Section title={t('adminPowers.messageModeration')} id="con-message-moderation">
          <p className="con-muted">{t('adminPowers.messageModerationHint')}</p>
          {messageStatus === 'not-found' ? (
            <p className="con-note">{t('adminPowers.messageUnavailable')}</p>
          ) : (
            <div className="con-action-row admin-power-grid">
              <AdminActionButton
                disabled={messageStatus === 'loading' || messageStatus === 'unavailable'}
                action={(reason) =>
                  runAdminContentAction({
                    action: messageStatus === 'removed' ? 'restore-message' : 'remove-message',
                    activityId: report.activityId,
                    messageId: report.targetId,
                    reason,
                  })
                }
                onDone={(result) =>
                  setMessageStatus(result.status === 'restored' ? 'available' : 'removed')
                }
                title={t(
                  messageStatus === 'removed'
                    ? 'adminPowers.restoreMessageTitle'
                    : 'adminPowers.removeMessageTitle',
                )}
                body={t(
                  messageStatus === 'removed'
                    ? 'adminPowers.restoreMessageBody'
                    : 'adminPowers.removeMessageBody',
                )}
                className={messageStatus === 'removed' ? 'secondary-button' : 'danger-button'}
                tone={messageStatus === 'removed' ? 'default' : 'danger'}
              >
                {messageStatus === 'removed' ? <RotateCcw size={15} /> : <Trash2 size={15} />}{' '}
                {t(
                  messageStatus === 'removed'
                    ? 'adminPowers.restoreMessage'
                    : 'adminPowers.removeMessage',
                )}
              </AdminActionButton>
            </div>
          )}
        </Section>
      )}

      <Section title={t('console.reports.subject')} id="con-subject">
        <div className="con-person">
          <span className="avatar con-person-avatar" aria-hidden="true">
            <AvatarContent person={subject} />
          </span>
          <div className="con-person-copy">
            <Link to={`${base}/accounts/${subjectId}`}>
              <strong>{nameFor(subjectId)}</strong>
            </Link>
            <small>
              {subject?.username || subjectId}
              {subject?.anonymous ? t('moderation.people.anonymousOn') : ''}
            </small>
            <div className="con-detail-badges">
              <RankBadge rank={rankOf(subjectId)} />
              <AccountStateBadges
                suspended={isSuspended(subjectId)}
                closed={isClosed(subjectId)}
                warnings={(warningsBySubject.get(subjectId) || []).length}
              />
              {others.length > 0 && (
                <Badge tone="repeat">
                  {t('console.reports.otherOpen', { count: others.length })}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {subject?.interests?.length > 0 && (
          <p className="con-muted">{subject.interests.map(categoryLabel).join(' · ')}</p>
        )}
        {others.length > 0 && (
          <ul className="con-links">
            {others.slice(0, 5).map((other) => (
              <li key={other.id}>
                <Link to={`${base}/reports/${other.id}`}>
                  {reasonLabel(other.reason)} · <When at={other.createdAt} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('console.reports.record')} id="con-record">
        <Timeline
          events={record}
          base={base}
          compact
          emptyTitle={t('console.reports.cleanRecord')}
        />
        <Link className="con-more" to={`${base}/accounts/${subjectId}`}>
          {t('console.reports.fullRecord')}
        </Link>
      </Section>

      <Section title={t('console.reports.reporter')} id="con-reporter">
        <Fields>
          <Field label={t('console.reports.reportedBy')}>
            <Link to={`${base}/accounts/${report.reporterId}`}>
              {personName(reporter?.name) || nameFor(report.reporterId)}
            </Link>
          </Field>
          <Field label={t('console.reports.columns.filed')}>
            <When at={report.createdAt} exact />
          </Field>
          <Field label={t('console.reports.reportId')} wide>
            <code>{report.id}</code>
          </Field>
        </Fields>
      </Section>
    </DetailPanel>
  )
}
