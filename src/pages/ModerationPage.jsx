import React, { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  Flag,
  MessageSquareWarning,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UserRoundX,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import ModeratorList from './moderation/ModeratorList'
import PeopleDirectory from './moderation/PeopleDirectory'
import RemovedActivities from './moderation/RemovedActivities'
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
import { PEER_LIMIT } from '../firebase/users'
import { usePeopleSearch } from '../hooks/usePeopleSearch'
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
  // undefined on /moderation, otherwise the section being looked at.
  const { section } = useParams()
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

  // The directory in memory is the peer window — complete up to PEER_LIMIT
  // accounts and silent beyond it. A search term is also run on the server,
  // so somebody outside the window can still be found, warned, suspended or
  // appointed. In-memory rows win where both exist: they are live and carry
  // the counts.
  const onPeople = section === 'people'
  const onModerators = section === 'moderators'
  const { found: watchFound, searching: watchSearching } = usePeopleSearch(
    watchSearch,
    user.isModerator && onPeople,
  )
  const { found: appointFound } = usePeopleSearch(personSearch, user.isAdmin && onModerators)
  const windowFull = directory.size >= PEER_LIMIT

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
    const everyone = new Map(directory)
    // Only the counts are window-bound: rank, suspension, closure and
    // warnings come from listeners that cover everybody.
    for (const person of watchFound) {
      if (person?.uid && !everyone.has(person.uid)) {
        everyone.set(person.uid, { ...person, inWindow: false })
      }
    }
    return (
      [...everyone.values()]
        .map((person) => ({
          ...person,
          inWindow: person.inWindow !== false,
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
  }, [allActivities, bannedIds, directory, rankOf, suspendedIds, warningCount, watchFound])

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
    const everyone = new Map(directory)
    for (const person of appointFound) {
      if (person?.uid && !everyone.has(person.uid)) everyone.set(person.uid, person)
    }
    return [...everyone.values()]
      .filter(
        (person) =>
          person.uid !== user.uid &&
          !ranked.has(person.uid) &&
          `${person.name} ${person.username || ''}`.toLowerCase().includes(term),
      )
      .slice(0, 6)
  }, [appointFound, directory, personSearch, ranked, user.uid])

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

  // The section routes are as guessable as the page itself. Two of the three
  // are an admin's alone, and a moderator who typed the URL should be told
  // so rather than handed a blank screen.
  const ADMIN_ONLY = ['removed', 'moderators']
  const KNOWN = ['removed', 'people', 'moderators']
  if (section && !KNOWN.includes(section))
    return (
      <div className="page-content">
        <div className="empty-state">
          <ShieldAlert size={28} />
          <h3>No such section</h3>
          <p>Go back to Moderation to pick one.</p>
        </div>
      </div>
    )
  if (section && ADMIN_ONLY.includes(section) && !user.isAdmin)
    return (
      <div className="page-content">
        <div className="empty-state">
          <ShieldAlert size={28} />
          <h3>Admins only</h3>
          <p>This section is for admins. The report queue is open to you.</p>
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

  /**
   * One component, four screens.
   *
   * Everything moderators can do used to sit on a single page: the report
   * queue, suspended accounts, removed activities, every person on the
   * server and the moderator list, stacked one after another with nothing
   * but a heading between them. Finding anything meant scrolling past all of
   * it, and the page grew with the server.
   *
   * The work queue stays on the front page, because that is the job. The
   * three reference sections became their own screens, reached from the rows
   * below — kept in this component rather than split into three files
   * because they share every handler, every dialog and the same live data,
   * and duplicating that across four files is how the four drift apart.
   */
  const onHub = !section
  const showing = (name) => section === name

  return (
    <div className="page-content">
      {onHub && (
        <>
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
                “reported N×” counts below only count what is shown. Work the queue down to see
                them.
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
                  They can still read SmartSync. They cannot create, join or message, and nothing
                  they host accepts new people.
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

          <nav className="mod-sections" aria-label="Moderation sections">
            {user.isAdmin && (
              <button className="mod-section-row" onClick={() => navigate('/moderation/removed')}>
                <Trash2 size={17} />
                <span>
                  <strong>Removed activities</strong>
                  <small>Everything moderators have taken down</small>
                </span>
                <span className="mod-section-count">{removedActivities.length}</span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            )}
            <button className="mod-section-row" onClick={() => navigate('/moderation/people')}>
              <Eye size={17} />
              <span>
                <strong>Everyone on SmartSync</strong>
                <small>Look without waiting to be told</small>
              </span>
              <span className="mod-section-count">{watched.length}</span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
            {user.isAdmin && (
              <button
                className="mod-section-row"
                onClick={() => navigate('/moderation/moderators')}
              >
                <ShieldCheck size={17} />
                <span>
                  <strong>Moderators</strong>
                  <small>Who holds the rank, and appointing</small>
                </span>
                <span className="mod-section-count">{moderators.length}</span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            )}
          </nav>
        </>
      )}

      {/* Undoing a takedown is an admin's job and nobody else's, so the list
          only appears for one. A moderator seeing a queue of decisions they
          cannot act on would be inviting them to try. */}
      {showing('removed') && user.isAdmin && (
        <RemovedActivities
          removedActivities={removedActivities}
          restoreReasons={restoreReasons}
          setRestoreReasons={setRestoreReasons}
          restoring={restoring}
          onRestore={restore}
          onOpen={(id) => navigate(`/activity/${id}`)}
          nameFor={nameFor}
        />
      )}

      {/* Reports tell you where to look. This is for looking without being
          told — the whole server, with what each person has actually done
          attached, and the same powers applied from here as from the queue.
          Public profile data only: the private half of a profile is readable
          by its owner and by nobody else, an admin included. */}
      {showing('people') && (
        <PeopleDirectory
          user={user}
          people={people}
          watched={watched}
          watchSearch={watchSearch}
          setWatchSearch={setWatchSearch}
          searching={watchSearching}
          windowFull={windowFull}
          suspending={suspending}
          recording={recording}
          setSuspendTarget={setSuspendTarget}
          setRecorded={setRecorded}
          setRecordedReason={setRecordedReason}
        />
      )}

      {/* Appointing is the one rank change that belongs in the app. It is
          routine work an admin should not need Firebase console access for —
          unlike `admin` itself, which has no button here and none anywhere,
          so that compromising any account in the app cannot mint another. */}
      {showing('moderators') && user.isAdmin && (
        <ModeratorList
          moderators={moderators}
          admins={admins}
          appointable={appointable}
          personSearch={personSearch}
          setPersonSearch={setPersonSearch}
          changingRole={changingRole}
          suspendedIds={suspendedIds}
          onChangeRole={setRoleChange}
          nameFor={nameFor}
        />
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
