import React, { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Eye,
  Flag,
  MessageSquareWarning,
  ShieldOff,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UserRoundX,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
  closeAccount,
  issueWarning,
  REPORT_PAGE,
  liftSuspension,
  removeActivity,
  resolveReport,
  restoreActivity,
  setUserRole,
  reopenAccount,
  suspendAccount,
  watchOpenReports,
  watchRoles,
  watchWarnings,
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
  const { pushCelebration, directory, activities, allActivities, removedActivities } = useApp()
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [acting, setActing] = useState(null)
  // Keyed by activity id: an admin has to type why before they can put
  // something back, the same way a moderator has to say why they took it down.
  const [restoreReasons, setRestoreReasons] = useState({})
  const [restoring, setRestoring] = useState(null)
  const [roles, setRoles] = useState([])
  const [lifting, setLifting] = useState(null)
  // Appointing a moderator: who is being searched for, who is being confirmed,
  // and who is mid-write.
  const [personSearch, setPersonSearch] = useState('')
  const [roleChange, setRoleChange] = useState(null)
  const [changingRole, setChangingRole] = useState(null)
  // The oversight directory: reports tell you where to look, this is for
  // looking without being told.
  const [watchSearch, setWatchSearch] = useState('')
  const [suspending, setSuspending] = useState(null)
  const [suspendTarget, setSuspendTarget] = useState(null)
  const [warnings, setWarnings] = useState([])
  // The two actions that put something on somebody's record and so have to be
  // justified before they can be taken: a warning, and closing an account.
  const [recorded, setRecorded] = useState(null)
  const [recordedReason, setRecordedReason] = useState('')
  const [recording, setRecording] = useState(null)

  useEffect(() => {
    if (!user.isModerator) return undefined
    return watchRoles(setRoles, () => setRoles([]))
  }, [user.isModerator])

  useEffect(() => {
    if (!user.isModerator) return undefined
    return watchWarnings(setWarnings, () => setWarnings([]))
  }, [user.isModerator])

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

  // Three views of one listener. A missing row means an ordinary user, so
  // `roles` only ever holds people who have been given a rank or had a
  // suspension placed on them.
  const suspended = useMemo(() => roles.filter((r) => r.suspended === true), [roles])
  const moderators = useMemo(() => roles.filter((r) => r.role === 'moderator'), [roles])
  const admins = useMemo(() => roles.filter((r) => r.role === 'admin'), [roles])

  // Who an admin may still appoint: everyone with a profile who is not
  // already a moderator, not an admin, and not themselves. Admins are
  // excluded because no in-app write may touch that rank in either direction,
  // so offering the button would only walk into a refusal.
  const ranked = useMemo(
    () => new Set([...moderators, ...admins].map((r) => r.uid)),
    [moderators, admins],
  )
  const suspendedIds = useMemo(() => new Set(suspended.map((r) => r.uid)), [suspended])
  const bannedIds = useMemo(
    () => new Set(roles.filter((r) => r.banned === true).map((r) => r.uid)),
    [roles],
  )
  const warningCount = useMemo(() => {
    const counts = new Map()
    for (const w of warnings) counts.set(w.subjectId, (counts.get(w.subjectId) || 0) + 1)
    return (uid) => counts.get(uid) || 0
  }, [warnings])
  const rankOf = useMemo(() => {
    const map = new Map(roles.map((r) => [r.uid, r.role]))
    return (uid) => map.get(uid) || 'user'
  }, [roles])

  // Everyone on the server, with what they have actually done attached.
  //
  // Only ever the public half of a profile. The private document — email,
  // real name behind anonymous mode, stored position — is readable by its
  // owner and by nobody else, and that is true of an admin too. Oversight
  // here means seeing public behaviour, not opening people's records.
  const people = useMemo(() => {
    const hosted = new Map()
    const joined = new Map()
    for (const activity of allActivities) {
      const host = hosted.get(activity.hostId) || { total: 0, removed: 0 }
      host.total += 1
      if (activity.status === 'removed') host.removed += 1
      hosted.set(activity.hostId, host)
      for (const memberId of activity.participantUids || []) {
        if (memberId !== activity.hostId) joined.set(memberId, (joined.get(memberId) || 0) + 1)
      }
    }
    return (
      [...directory.values()]
        .map((person) => ({
          ...person,
          rank: rankOf(person.uid),
          suspended: suspendedIds.has(person.uid),
          closed: bannedIds.has(person.uid),
          warnings: warningCount(person.uid),
          hosts: hosted.get(person.uid)?.total || 0,
          removedCount: hosted.get(person.uid)?.removed || 0,
          joinedCount: joined.get(person.uid) || 0,
        }))
        // Anything worth a second look floats up: suspended first, then anyone
        // who has had something taken down, then the rest by name. A directory
        // sorted alphabetically buries exactly what you opened it to find.
        .sort(
          (a, b) =>
            Number(b.closed) - Number(a.closed) ||
            Number(b.suspended) - Number(a.suspended) ||
            b.warnings - a.warnings ||
            b.removedCount - a.removedCount ||
            (a.name || '').localeCompare(b.name || ''),
        )
    )
  }, [allActivities, bannedIds, directory, rankOf, suspendedIds, warningCount])

  const watched = useMemo(() => {
    const term = watchSearch.trim().toLowerCase()
    if (!term) return people
    return people.filter((person) =>
      `${person.name} ${person.username || ''}`.toLowerCase().includes(term),
    )
  }, [people, watchSearch])
  const appointable = useMemo(() => {
    const term = personSearch.trim().toLowerCase()
    if (!term) return []
    return [...directory.values()]
      .filter(
        (person) =>
          person.uid !== user.uid &&
          !ranked.has(person.uid) &&
          `${person.name} ${person.username || ''}`.toLowerCase().includes(term),
      )
      .slice(0, 6)
  }, [directory, personSearch, ranked, user.uid])

  // Someone who is not a moderator should never have got here, but the route
  // is guessable and the screen must not depend on the menu hiding it.
  if (!user.isModerator)
    return (
      <div className="page-content">
        <div className="empty-state">
          <ShieldAlert size={28} />
          <h3>Not available</h3>
          <p>This screen is for moderators.</p>
        </div>
      </div>
    )

  // Two things this has to get right. Yourself, because "Taken down by
  // SmartSync user" when it was you is worse than no attribution — and you are
  // never in your own peer list. And people you have blocked, which is why it
  // reads the full directory rather than the filtered peer list: blocking
  // somebody must not blank out the queue entry about them, or blocking the
  // reviewers would be a way to become unreviewable.
  const nameFor = (uid) => (uid === user.uid ? 'you' : directory.get(uid)?.name || 'SmartSync user')

  // Repeats matter more than any single report: three people flagging the
  // same thing is a different signal from one person flagging it once. Counted
  // across every open report, including any hidden from this reviewer below —
  // the count is a signal about the target, not about who is looking.
  const timesReported = (report) => reports.filter((r) => r.targetId === report.targetId).length

  const hostOf = (activityId) =>
    [...activities, ...removedActivities].find((a) => a.id === activityId)?.hostId

  // Who a report is about. Reports filed before this field existed fall back
  // to what the rules fall back to, so an old report still resolves.
  const subjectOf = (report) =>
    report.subjectId ||
    (report.targetType === 'activity' ? hostOf(report.targetId) : report.targetId)

  // A report about you is not yours to judge, and neither is one about
  // something you are hosting. It stays in the queue for everybody else — an
  // admin, another moderator — so nothing is buried by hiding it here. The
  // rules refuse the write as well, so this is the courtesy and not the
  // control.
  const aboutMe = (report) => subjectOf(report) === user.uid

  // Nor one you filed yourself: reporting somebody and then ruling on it makes
  // you both parties, and the rules refuse that write too.
  const queue = reports.filter((report) => !aboutMe(report) && report.reporterId !== user.uid)

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
      let stoodDown = 0
      if (kind === 'suspend') {
        // The person answerable, never the thing reported. For a message
        // report `targetId` is a message id, and this used to write a roles
        // document against it — suspending nobody and quietly littering the
        // roles collection with rows keyed by message.
        const outcome = await suspendAccount(subjectOf(report), { moderatorId: user.uid })
        stoodDown = outcome.stoodDown
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
        body:
          stoodDown > 0
            ? `Recorded against the report. ${stoodDown} ${stoodDown === 1 ? 'activity' : 'activities'} they were hosting stood down, and everyone who joined has been told.`
            : 'The decision is recorded against the report.',
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

  const lift = async (account) => {
    setLifting(account.uid)
    try {
      await liftSuspension(account.uid)
      pushCelebration({
        icon: 'check',
        tone: 'success',
        title: 'Suspension lifted',
        body: `${nameFor(account.uid)} can post again, and has been told. Anything taken down while they were suspended stays down.`,
      })
    } catch (liftError) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: "Couldn't lift that",
        body:
          liftError?.code === 'permission-denied'
            ? 'Only an admin can act on a moderator.'
            : 'Try again.',
      })
    } finally {
      setLifting(null)
    }
  }

  // Suspending somebody you noticed, rather than somebody you were told
  // about. Same call the report queue makes, so a suspension from here also
  // stands down everything they are hosting and tells the people who joined.
  const actOnPerson = async () => {
    const { uid, suspend } = suspendTarget
    setSuspendTarget(null)
    setSuspending(uid)
    try {
      if (suspend) {
        const { stoodDown } = await suspendAccount(uid, { moderatorId: user.uid })
        pushCelebration({
          icon: 'check',
          tone: 'success',
          title: 'Account suspended',
          body:
            stoodDown > 0
              ? `${nameFor(uid)} cannot create, join or message. ${stoodDown} ${stoodDown === 1 ? 'activity' : 'activities'} stood down, and everyone who joined has been told.`
              : `${nameFor(uid)} cannot create, join or message.`,
        })
      } else {
        await liftSuspension(uid)
        pushCelebration({
          icon: 'check',
          tone: 'success',
          title: 'Suspension lifted',
          body: `${nameFor(uid)} can post again, and has been told. Anything taken down stays down.`,
        })
      }
    } catch (personError) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: "Couldn't do that",
        body:
          personError?.code === 'permission-denied'
            ? 'Only an admin can act on a moderator, and nobody can act on an admin.'
            : 'Try again.',
      })
    } finally {
      setSuspending(null)
    }
  }

  // A warning and a closure both leave a permanent record, so both go through
  // one path that will not run without a reason typed into the dialog.
  const applyRecorded = async () => {
    const { uid, kind, reportId } = recorded
    const reason = recordedReason.trim()
    if (!reason) return
    setRecorded(null)
    setRecording(uid)
    try {
      if (kind === 'warn') {
        await issueWarning(uid, { moderatorId: user.uid, reason, reportId })
        pushCelebration({
          icon: 'check',
          tone: 'success',
          title: 'Warning issued',
          body: `${nameFor(uid)} has been told, and it is on their record. Nothing was taken away.`,
        })
      } else if (kind === 'close') {
        const { stoodDown } = await closeAccount(uid, { adminId: user.uid, reason })
        pushCelebration({
          icon: 'alert',
          tone: 'warning',
          title: 'Account closed',
          body:
            stoodDown > 0
              ? `${nameFor(uid)} can no longer use SmartSync. ${stoodDown} ${stoodDown === 1 ? 'activity' : 'activities'} stood down, and everyone who joined has been told.`
              : `${nameFor(uid)} can no longer use SmartSync.`,
        })
      } else {
        await reopenAccount(uid, { reason })
        pushCelebration({
          icon: 'check',
          tone: 'success',
          title: 'Account reopened',
          body: `${nameFor(uid)} can use SmartSync again, and has been told.`,
        })
      }
      setRecordedReason('')
    } catch (recordError) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: "Couldn't do that",
        body:
          recordError?.code === 'permission-denied'
            ? 'Closing and reopening an account is an admin decision, and no rank can act on an admin.'
            : 'Try again.',
      })
    } finally {
      setRecording(null)
    }
  }

  const changeRole = async () => {
    const { uid, role } = roleChange
    setRoleChange(null)
    setChangingRole(uid)
    try {
      await setUserRole(uid, role)
      pushCelebration({
        icon: 'check',
        tone: 'success',
        title: role === 'moderator' ? 'Moderator appointed' : 'Moderator dismissed',
        body:
          role === 'moderator'
            ? `${nameFor(uid)} can work this queue now, and has been told.`
            : `${nameFor(uid)} can no longer review reports. Their account is otherwise unchanged.`,
      })
      setPersonSearch('')
    } catch (roleError) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: "Couldn't change that",
        body:
          roleError?.code === 'permission-denied'
            ? 'Only an admin can appoint or dismiss a moderator.'
            : 'Try again.',
      })
    } finally {
      setChangingRole(null)
    }
  }

  return (
    <div className="page-content">
      <section className="headline-block">
        <span className="eyebrow">Moderation</span>
        <h2>Open reports</h2>
        <p className="helper-text">
          Every action records who took it and why. Nothing here can be deleted.
        </p>
        {/* At the cap the view is partial, and silently partial is the worst
            kind: the reports that fall off the end are the oldest, which are
            the ones that have waited longest. Say so, and say that the repeat
            counts below are counting only what is loaded. */}
        {reports.length >= REPORT_PAGE && (
          <p className="form-error" role="status">
            Showing the newest {REPORT_PAGE} open reports. Older ones are not listed, and the
            “reported N×” counts below only count what is shown. Work the queue down to see them.
          </p>
        )}
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
              <p className="report-meta">
                Reported by {nameFor(report.reporterId)}
                {report.targetType !== 'user' && ` · about ${nameFor(subjectOf(report))}`}
                {warningCount(subjectOf(report)) > 0 &&
                  ` · already warned ${warningCount(subjectOf(report))}×`}
              </p>

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
                {/* The rung between doing nothing and taking something away.
                    Seeded with what was actually reported, so the person is
                    told the substance rather than a category name. */}
                <button
                  className="secondary-button"
                  onClick={() => {
                    setRecordedReason(
                      `${reasonLabel(report.reason)}${repeats > 1 ? `, reported by ${repeats} people` : ''}. Please read the community policy.`,
                    )
                    setRecorded({ uid: subjectOf(report), kind: 'warn', reportId: report.id })
                  }}
                >
                  <MessageSquareWarning size={15} /> Warn
                </button>
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

      {/* Suspensions have to be reversible from here. A moderator who could
          only ever apply one would be sending every mistake to whoever has
          Firebase console access. Ranks apply as everywhere else: a moderator
          may lift an ordinary user, only an admin may act on a moderator. */}
      {suspended.length > 0 && (
        <>
          <section className="headline-block">
            <span className="eyebrow">Suspended</span>
            <h2>Accounts on hold</h2>
            <p className="helper-text">
              They can still read SmartSync. They cannot create, join or message, and nothing they
              host accepts new people.
            </p>
          </section>

          <div className="stack list-stack">
            {suspended.map((account) => {
              const outranksMe = account.role !== 'user' && !user.isAdmin
              return (
                <article className="report-card" key={account.uid}>
                  <header>
                    <span className="report-kind">
                      <UserRoundX size={13} /> {account.role}
                    </span>
                  </header>
                  <h3>{nameFor(account.uid)}</h3>
                  {outranksMe && (
                    <p className="report-context">
                      A moderator. Only an admin can lift this suspension.
                    </p>
                  )}
                  <div className="report-actions">
                    <button
                      className="secondary-button"
                      disabled={outranksMe || lifting === account.uid}
                      onClick={() => lift(account)}
                    >
                      <UserRoundCheck size={15} />{' '}
                      {lifting === account.uid ? 'Lifting…' : 'Lift suspension'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

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
                  {/* One element, so the question and its note stay on one
                      line — the label is a grid, and a bare text node beside
                      a span becomes two rows. */}
                  <span className="field-label">
                    Why are you putting this back? <span className="optional">Required</span>
                  </span>
                  <input
                    maxLength={300}
                    /* Measured at exactly the field width before, so it
                       clipped on the rounding and would clip badly on a
                       320px phone. This leaves real headroom. */
                    placeholder="The report was mistaken"
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
                    // Without this the control is simply grey, which reads as
                    // broken rather than as waiting for the reason above it.
                    title={
                      (restoreReasons[activity.id] || '').trim()
                        ? undefined
                        : 'Write a reason first'
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

      {/* Reports tell you where to look. This is for looking without being
          told — the whole server, with what each person has actually done
          attached, and the same powers applied from here as from the queue.
          Public profile data only: the private half of a profile is readable
          by its owner and by nobody else, an admin included. */}
      <section className="headline-block">
        <span className="eyebrow">Oversight</span>
        <h2>Everyone on SmartSync</h2>
        <p className="helper-text">
          {people.length} {people.length === 1 ? 'account' : 'accounts'}. Anyone suspended, or with
          something taken down, is listed first. You are seeing public profiles — emails, real names
          behind anonymous mode and stored locations are not readable by anybody but their owner.
        </p>
      </section>

      <label className="report-detail watch-search">
        Search everyone
        <input
          value={watchSearch}
          maxLength={60}
          placeholder="Name or @username"
          onChange={(event) => setWatchSearch(event.target.value)}
        />
      </label>

      <div className="stack list-stack">
        {watched.slice(0, 40).map((person) => {
          const isMe = person.uid === user.uid
          const cannotTouch =
            isMe || person.rank === 'admin' || (person.rank !== 'user' && !user.isAdmin)
          return (
            <article className="report-card" key={person.uid}>
              <header>
                <span className="report-kind">
                  <Eye size={13} /> {person.rank}
                </span>
                {person.closed && <span className="report-repeat">closed</span>}
                {person.suspended && !person.closed && (
                  <span className="report-repeat">suspended</span>
                )}
                {person.warnings > 0 && (
                  <span className="report-repeat">
                    {person.warnings} warning{person.warnings === 1 ? '' : 's'}
                  </span>
                )}
                {person.removedCount > 0 && (
                  <span className="report-repeat">{person.removedCount} taken down</span>
                )}
              </header>

              <h3>
                {person.name}
                {isMe ? ' (you)' : ''}
              </h3>
              <p className="report-context">
                {person.username ? `${person.username} · ` : ''}
                hosts {person.hosts}, joined {person.joinedCount}
                {person.anonymous ? ' · anonymous mode on' : ''}
              </p>
              {(person.interests || []).length > 0 && (
                <p className="report-meta">{(person.interests || []).join(' · ')}</p>
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
                    {recording === person.uid ? 'Working…' : 'Warn'}
                  </button>
                )}
                {!cannotTouch && !person.suspended && !person.closed && (
                  <button
                    className="danger-button"
                    disabled={suspending === person.uid}
                    onClick={() => setSuspendTarget({ uid: person.uid, suspend: true })}
                  >
                    <UserRoundX size={15} />{' '}
                    {suspending === person.uid ? 'Suspending…' : 'Suspend account'}
                  </button>
                )}
                {!cannotTouch && person.suspended && !person.closed && (
                  <button
                    className="secondary-button"
                    disabled={suspending === person.uid}
                    onClick={() => setSuspendTarget({ uid: person.uid, suspend: false })}
                  >
                    <UserRoundCheck size={15} />{' '}
                    {suspending === person.uid ? 'Lifting…' : 'Lift suspension'}
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
                    <ShieldOff size={15} /> Close account
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
                    <UserRoundCheck size={15} /> Reopen account
                  </button>
                )}
                {cannotTouch && !isMe && (
                  <span className="report-meta">
                    {person.rank === 'admin'
                      ? 'An admin. No rank can act on this account from inside the app.'
                      : 'A moderator. Only an admin can act on this account.'}
                  </span>
                )}
              </div>
            </article>
          )
        })}

        {watched.length === 0 && (
          <div className="empty-state">
            <Eye size={28} />
            <h3>Nobody matches that</h3>
            <p>Try part of a name, or clear the search to see everyone.</p>
          </div>
        )}

        {watched.length > 40 && (
          <p className="helper-text">
            Showing the first 40 of {watched.length}. Search to narrow it down.
          </p>
        )}
      </div>

      {/* Appointing is the one rank change that belongs in the app. It is
          routine work an admin should not need Firebase console access for —
          unlike `admin` itself, which has no button here and none anywhere,
          so that compromising any account in the app cannot mint another. */}
      {user.isAdmin && (
        <>
          <section className="headline-block">
            <span className="eyebrow">Admin</span>
            <h2>Moderators</h2>
            <p className="helper-text">
              Who can work this queue. From the moment they are appointed they can take activities
              down and suspend ordinary users, and they are told so.
            </p>
          </section>

          <div className="stack list-stack">
            {moderators.map((account) => (
              <article className="report-card" key={account.uid}>
                <header>
                  <span className="report-kind">
                    <ShieldCheck size={13} /> moderator
                  </span>
                  {account.suspended && <span className="report-repeat">suspended</span>}
                </header>
                <h3>{nameFor(account.uid)}</h3>
                {account.suspended && (
                  <p className="report-context">
                    Suspended, so they hold the rank and use none of it. Lift it above to give the
                    powers back.
                  </p>
                )}
                <div className="report-actions">
                  <button
                    className="danger-button"
                    disabled={changingRole === account.uid}
                    onClick={() => setRoleChange({ uid: account.uid, role: 'user' })}
                  >
                    <UserRoundX size={15} />{' '}
                    {changingRole === account.uid ? 'Dismissing…' : 'Dismiss as moderator'}
                  </button>
                </div>
              </article>
            ))}

            {moderators.length === 0 && (
              <div className="empty-state">
                <ShieldCheck size={28} />
                <h3>No moderators yet</h3>
                <p>Every report is yours alone until you appoint somebody.</p>
              </div>
            )}

            <article className="report-card">
              <h3>Appoint someone</h3>
              <label className="report-detail">
                Search people by name
                <input
                  value={personSearch}
                  maxLength={60}
                  placeholder="Start typing a name"
                  onChange={(event) => setPersonSearch(event.target.value)}
                />
              </label>

              {!personSearch.trim() ? (
                <p className="report-meta">
                  Type a name to find somebody. Current moderators and admins are not listed here.
                </p>
              ) : appointable.length === 0 ? (
                <p className="report-meta">
                  Nobody else matches “{personSearch.trim()}”. Anyone already holding a rank is left
                  out of this list.
                </p>
              ) : (
                appointable.map((person) => (
                  <div className="report-actions appoint-row" key={person.uid}>
                    <span>
                      {person.name}
                      {person.username ? ` · ${person.username}` : ''}
                      {/* A rank somebody cannot currently use is worth saying
                          out loud before it is handed to them, not after. */}
                      {suspendedIds.has(person.uid) && (
                        <em className="appoint-note"> · suspended</em>
                      )}
                    </span>
                    <button
                      className="secondary-button"
                      disabled={changingRole === person.uid}
                      onClick={() => setRoleChange({ uid: person.uid, role: 'moderator' })}
                    >
                      <UserRoundCheck size={15} />{' '}
                      {changingRole === person.uid ? 'Appointing…' : 'Appoint'}
                    </button>
                  </div>
                ))
              )}
            </article>
          </div>

          <p className="helper-text">
            {admins.length === 1
              ? `Admin: ${nameFor(admins[0].uid)}.`
              : `Admins: ${admins.map((a) => nameFor(a.uid)).join(', ')}.`}{' '}
            That rank is granted in the Firebase console and nowhere else — there is no button for
            it here, on purpose.
          </p>
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
              ? `${nameFor(subjectOf(acting.report))} can still sign in and read, but cannot create activities, join anything, or send messages. Anything they are hosting is taken down and everyone who joined is told — lifting the suspension later does not bring those back.`
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

      <ConfirmDialog
        open={Boolean(roleChange)}
        title={
          roleChange?.role === 'moderator' ? 'Appoint as moderator?' : 'Dismiss this moderator?'
        }
        body={
          roleChange?.role === 'moderator'
            ? `${nameFor(roleChange.uid)} will be able to read every report, take activities down and suspend ordinary users. They cannot appoint anybody, undo a takedown, or act on a report about themselves.${
                suspendedIds.has(roleChange.uid)
                  ? ' Their account is suspended, so they will hold the rank and use none of it until that is lifted.'
                  : ''
              }`
            : `${nameFor(roleChange?.uid)} loses access to this queue. Nothing else about their account changes — a suspension, if they have one, stays exactly as it is.`
        }
        confirmLabel={roleChange?.role === 'moderator' ? 'Appoint' : 'Dismiss'}
        cancelLabel="Cancel"
        tone={roleChange?.role === 'moderator' ? 'default' : 'danger'}
        onConfirm={changeRole}
        onCancel={() => setRoleChange(null)}
      />

      <ConfirmDialog
        open={Boolean(suspendTarget)}
        title={suspendTarget?.suspend ? 'Suspend this account?' : 'Lift this suspension?'}
        body={
          suspendTarget?.suspend
            ? `${nameFor(suspendTarget.uid)} can still sign in and read, but cannot create activities, join anything, or send messages. Anything they are hosting is taken down and everyone who joined is told — lifting the suspension later does not bring those back.`
            : `${nameFor(suspendTarget?.uid)} can create, join and message again, and will be told. Anything taken down while they were suspended stays down.`
        }
        confirmLabel={suspendTarget?.suspend ? 'Suspend' : 'Lift suspension'}
        cancelLabel="Cancel"
        tone={suspendTarget?.suspend ? 'danger' : 'default'}
        onConfirm={actOnPerson}
        onCancel={() => setSuspendTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(recorded)}
        title={
          recorded?.kind === 'warn'
            ? 'Warn this account?'
            : recorded?.kind === 'close'
              ? 'Close this account for good?'
              : 'Reopen this account?'
        }
        body={
          recorded?.kind === 'warn'
            ? `${nameFor(recorded.uid)} is told what the problem is and it goes on their record. Nothing is taken away — this is the step before anything is.`
            : recorded?.kind === 'close'
              ? `${nameFor(recorded?.uid)} will not be able to use SmartSync again. Everything they are hosting is taken down and everyone who joined is told. Only an admin can reverse this.`
              : `${nameFor(recorded?.uid)} can use SmartSync again. Anything taken down while the account was closed stays down.`
        }
        promptLabel={
          recorded?.kind === 'warn'
            ? 'What are you warning them about?'
            : recorded?.kind === 'close'
              ? 'Why is this account being closed?'
              : 'Why are you reopening it?'
        }
        promptPlaceholder={
          recorded?.kind === 'warn'
            ? 'Several people reported the same behaviour'
            : 'Repeated safety reports after a warning'
        }
        promptValue={recordedReason}
        onPromptChange={setRecordedReason}
        confirmLabel={
          recorded?.kind === 'warn'
            ? 'Send warning'
            : recorded?.kind === 'close'
              ? 'Close account'
              : 'Reopen'
        }
        cancelLabel="Cancel"
        tone={recorded?.kind === 'reopen' ? 'default' : 'danger'}
        onConfirm={applyRecorded}
        onCancel={() => setRecorded(null)}
      />
    </div>
  )
}
