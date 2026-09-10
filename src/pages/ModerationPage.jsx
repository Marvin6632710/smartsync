import React, { useEffect, useState } from 'react'
import { CheckCircle2, Flag, RotateCcw, ShieldAlert, Trash2, UserRoundX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import ConfirmDialog from '../components/ConfirmDialog'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
  removeActivity,
  resolveReport,
  restoreActivity,
  setSuspended,
  watchOpenReports,
} from '../firebase/moderation'
import { REPORT_REASONS } from '../firebase/moderation'
import { formatRelativeTime } from '../utils/time'

const reasonLabel = (key) => REPORT_REASONS.find((r) => r.key === key)?.label || key

/**
 * The queue a moderator works from.
 *
 * Two things it deliberately does not do. It does not let anyone act without
 * saying why — every action records a reason and who took it, because a
 * removal nobody can account for is indistinguishable from an abuse of the
 * power to remove. And it does not hide what was reported behind a summary:
 * the reporter's own words and the thing they were looking at are shown in
 * full, since a decision made on a category label is not a decision.
 */
export default function ModerationPage() {
  const { user } = useAuth()
  const { pushCelebration, peers, activities, removedActivities } = useApp()
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [acting, setActing] = useState(null)
  // Keyed by activity id: an admin has to type why before they can put
  // something back, the same way a moderator has to say why they took it down.
  const [restoreReasons, setRestoreReasons] = useState({})
  const [restoring, setRestoring] = useState(null)

  useEffect(() => {
    if (!user.isModerator) return undefined
    return watchOpenReports(
      (rows) => {
        setReports(rows)
        setLoading(false)
      },
      (watchError) => {
        setError(watchError)
        setLoading(false)
      },
    )
  }, [user.isModerator])

  // Someone who is not a moderator should never have got here, but the route
  // is guessable and the screen must not depend on the menu hiding it.
  if (!user.isModerator)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <ShieldAlert size={28} />
          <h3>Not available</h3>
          <p>This screen is for moderators.</p>
        </div>
      </div>
    )

  const nameFor = (uid) => peers.find((p) => p.uid === uid)?.name || 'SmartSync user'

  // Repeats matter more than any single report: three people flagging the
  // same thing is a different signal from one person flagging it once. Counted
  // across every open report, including any hidden from this reviewer below —
  // the count is a signal about the target, not about who is looking.
  const timesReported = (report) => reports.filter((r) => r.targetId === report.targetId).length

  const hostOf = (activityId) =>
    [...activities, ...removedActivities].find((a) => a.id === activityId)?.hostId

  // A report about you is not yours to judge, and neither is one about
  // something you are hosting. It stays in the queue for everybody else — an
  // admin, another moderator — so nothing is buried by hiding it here. The
  // rules refuse the write as well, so this is the courtesy and not the
  // control.
  const aboutMe = (report) =>
    report.targetId === user.uid ||
    (report.targetType === 'activity' && hostOf(report.targetId) === user.uid)

  const queue = reports.filter((report) => !aboutMe(report))

  const act = async () => {
    const { report, kind } = acting
    setActing(null)
    try {
      if (kind === 'remove') {
        await removeActivity(report.targetId, {
          moderatorId: user.uid,
          reason: `${reasonLabel(report.reason)} — reported by a user`,
        })
      }
      if (kind === 'suspend') {
        await setSuspended(report.targetId, true)
      }
      await resolveReport(report.id, {
        status: kind === 'dismiss' ? 'dismissed' : 'actioned',
        outcome:
          kind === 'remove'
            ? 'Activity removed'
            : kind === 'suspend'
              ? 'Account suspended'
              : 'No action needed',
        moderatorId: user.uid,
      })
      pushCelebration({
        icon: 'check',
        tone: 'success',
        title: kind === 'dismiss' ? 'Report dismissed' : 'Action taken',
        body: 'The decision is recorded against the report.',
      })
    } catch (actionError) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: "Couldn't complete that",
        body:
          actionError?.code === 'permission-denied' ? 'You do not have permission.' : 'Try again.',
      })
    }
  }

  const restore = async (activity) => {
    const reason = (restoreReasons[activity.id] || '').trim()
    if (!reason) return
    setRestoring(activity.id)
    try {
      await restoreActivity(activity.id, { adminId: user.uid, reason })
      setRestoreReasons((current) => ({ ...current, [activity.id]: '' }))
      pushCelebration({
        icon: 'check',
        tone: 'success',
        title: 'Put back',
        body: `${activity.title} is visible again, and the host has been told.`,
      })
    } catch (restoreError) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: "Couldn't restore that",
        body:
          restoreError?.code === 'permission-denied'
            ? 'Only an admin can undo a removal.'
            : 'Try again.',
      })
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="page-content">
      <BackButton />
      <section className="headline-block">
        <span className="eyebrow">Moderation</span>
        <h2>Open reports</h2>
        <p className="helper-text">
          Every action records who took it and why. Nothing here can be deleted.
        </p>
      </section>

      {error && (
        <p className="form-error" role="alert">
          Could not load reports. {error.code === 'permission-denied' ? 'Check your role.' : ''}
        </p>
      )}

      <div className="stack list-stack">
        {queue.map((report) => {
          const repeats = timesReported(report)
          return (
            <article className="report-card" key={report.id}>
              <header>
                <span className="report-kind">
                  <Flag size={13} /> {report.targetType}
                </span>
                {repeats > 1 && <span className="report-repeat">Reported {repeats}×</span>}
                <time>{formatRelativeTime(report.createdAt)}</time>
              </header>

              <h3>{reasonLabel(report.reason)}</h3>
              {report.context && <p className="report-context">{report.context}</p>}
              {report.detail && <p className="report-detail-text">“{report.detail}”</p>}
              <p className="report-meta">Reported by {nameFor(report.reporterId)}</p>

              <div className="report-actions">
                {report.targetType === 'activity' && (
                  <button
                    className="danger-button"
                    onClick={() => setActing({ report, kind: 'remove' })}
                  >
                    <Trash2 size={15} /> Remove activity
                  </button>
                )}
                {report.targetType !== 'activity' && (
                  <button
                    className="danger-button"
                    onClick={() => setActing({ report, kind: 'suspend' })}
                  >
                    <UserRoundX size={15} /> Suspend account
                  </button>
                )}
                <button
                  className="secondary-button"
                  onClick={() => setActing({ report, kind: 'dismiss' })}
                >
                  <CheckCircle2 size={15} /> Dismiss
                </button>
                {report.targetType === 'activity' && (
                  <button
                    className="text-button"
                    onClick={() => navigate(`/activity/${report.targetId}`)}
                  >
                    Look at it
                  </button>
                )}
              </div>
            </article>
          )
        })}

        {!loading && queue.length === 0 && !error && (
          <div className="empty-state">
            <CheckCircle2 size={28} />
            <h3>Nothing waiting</h3>
            <p>Reports appear here as soon as someone files one.</p>
          </div>
        )}
      </div>

      {/* Undoing a takedown is an admin's job and nobody else's, so the list
          only appears for one. A moderator seeing a queue of decisions they
          cannot act on would be inviting them to try. */}
      {user.isAdmin && removedActivities.length > 0 && (
        <>
          <section className="headline-block">
            <span className="eyebrow">Admin</span>
            <h2>Removed activities</h2>
            <p className="helper-text">
              Everything moderators have taken down. Putting one back is recorded against it, and
              the host is told.
            </p>
          </section>

          <div className="stack list-stack">
            {removedActivities.map((activity) => (
              <article className="report-card" key={activity.id}>
                <header>
                  <span className="report-kind">
                    <Trash2 size={13} /> removed
                  </span>
                  <time>{formatRelativeTime(activity.updatedAt)}</time>
                </header>
                <h3>{activity.title}</h3>
                <p className="report-context">
                  Hosted by {activity.hostName} · {activity.locationName}
                </p>
                <p className="report-detail-text">
                  “{activity.moderation?.reason || 'No reason recorded'}”
                </p>
                <p className="report-meta">Taken down by {nameFor(activity.moderation?.by)}</p>

                <label className="report-detail">
                  Why are you putting this back?
                  <input
                    maxLength={300}
                    placeholder="Reviewed again — the report was mistaken"
                    value={restoreReasons[activity.id] || ''}
                    onChange={(event) =>
                      setRestoreReasons((current) => ({
                        ...current,
                        [activity.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="report-actions">
                  <button
                    className="secondary-button"
                    disabled={
                      !(restoreReasons[activity.id] || '').trim() || restoring === activity.id
                    }
                    onClick={() => restore(activity)}
                  >
                    <RotateCcw size={15} />{' '}
                    {restoring === activity.id ? 'Putting it back…' : 'Put it back'}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => navigate(`/activity/${activity.id}`)}
                  >
                    Look at it
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(acting)}
        title={
          acting?.kind === 'remove'
            ? 'Remove this activity?'
            : acting?.kind === 'suspend'
              ? 'Suspend this account?'
              : 'Dismiss this report?'
        }
        body={
          acting?.kind === 'remove'
            ? 'It disappears for everyone, including the people who joined, and they are all told. The host cannot undo this — only an admin can.'
            : acting?.kind === 'suspend'
              ? 'They can still sign in and read, but cannot create activities, join anything, or send messages.'
              : 'The report stays on record, marked as needing no action.'
        }
        confirmLabel={
          acting?.kind === 'remove' ? 'Remove' : acting?.kind === 'suspend' ? 'Suspend' : 'Dismiss'
        }
        cancelLabel="Cancel"
        tone={acting?.kind === 'dismiss' ? 'default' : 'danger'}
        onConfirm={act}
        onCancel={() => setActing(null)}
      />
    </div>
  )
}
