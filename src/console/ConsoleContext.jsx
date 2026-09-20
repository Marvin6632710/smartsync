import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
  CLAIM_TTL_MS,
  REPORT_REASONS,
  watchModerationLog,
  watchOpenReports,
  watchResolvedReports,
  watchRoles,
  watchWarnings,
} from '../firebase/moderation'
import { fetchPublicProfiles } from '../firebase/users'
import { personName, reportReasonLabel } from '../i18n'
import { reportError } from '../utils/reportError'
import { useDesk } from './useDesk'

const ConsoleContext = createContext(null)

/**
 * One live feed: subscribed while the rank holds, and its rows kept — a
 * listener that fails leaves what it last delivered on screen and marks
 * the feed as possibly stale, rather than silently emptying the list.
 */
function useFeed({ enabled, setLoaded, setErrors }, name, watch, set) {
  useEffect(() => {
    if (!enabled) return undefined
    return watch(
      (rows) => {
        set(rows)
        setLoaded((current) => (current[name] ? current : { ...current, [name]: true }))
        setErrors((current) => {
          if (!current[name]) return current
          const next = { ...current }
          delete next[name]
          return next
        })
      },
      (error) => {
        setLoaded((current) => (current[name] ? current : { ...current, [name]: true }))
        setErrors((current) => ({ ...current, [name]: error }))
      },
    )
  }, [enabled, name, watch, set, setLoaded, setErrors])
}

/**
 * Everything the console reads, opened once.
 *
 * Five listeners — roles, warnings, the open queue, the decided reports and
 * the log — plus the directory and the activities the app already holds.
 * Each listener that fails keeps what it last delivered and says so (see
 * `errors`): a suspended list that silently emptied because its listener
 * dropped is worse than one marked as possibly stale.
 *
 * Names are resolved past the peer window. A report, a role row and a log
 * entry name people by uid, and the directory in memory holds only the
 * first five hundred accounts; the ids that are missing are fetched once,
 * in batches, so a name in the queue never reads "Unknown user" merely
 * because the person is account five hundred and one.
 */
export function ConsoleProvider({ children }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const app = useApp()
  const { directory, allActivities } = app

  const [roles, setRoles] = useState([])
  const [warnings, setWarnings] = useState([])
  const [openReports, setOpenReports] = useState([])
  const [resolvedReports, setResolvedReports] = useState([])
  const [log, setLog] = useState([])
  const [loaded, setLoaded] = useState({})
  const [errors, setErrors] = useState({})
  const [fetched, setFetched] = useState(() => new Map())

  // One effect per feed, each keyed on the rank so a suspension mid-session
  // closes the listeners rather than leaving them to be refused.
  const feed = { enabled: user.isAdmin, setLoaded, setErrors }
  useFeed(feed, 'roles', watchRoles, setRoles)
  useFeed(feed, 'warnings', watchWarnings, setWarnings)
  useFeed(feed, 'open', watchOpenReports, setOpenReports)
  useFeed(feed, 'resolved', watchResolvedReports, setResolvedReports)
  useFeed(feed, 'log', watchModerationLog, setLog)

  // ---------------------------------------------------------------- names

  // Every uid the loaded records mention, so the ones the directory lacks
  // can be fetched. Asked for once each; a profile that does not exist is
  // remembered as missing rather than asked for again on every render.
  const requested = useRef(new Set())
  const mentioned = useMemo(() => {
    const ids = new Set()
    for (const r of roles) ids.add(r.uid)
    for (const w of warnings) {
      ids.add(w.subjectId)
      ids.add(w.by)
    }
    for (const r of [...openReports, ...resolvedReports]) {
      ids.add(r.reporterId)
      ids.add(r.subjectId)
      ids.add(r.targetType === 'user' ? r.targetId : null)
      ids.add(r.claimedBy)
      ids.add(r.reviewedBy)
    }
    for (const e of log) {
      ids.add(e.by)
      ids.add(e.subjectId)
    }
    ids.delete(null)
    ids.delete(undefined)
    return [...ids]
  }, [roles, warnings, openReports, resolvedReports, log])

  useEffect(() => {
    const missing = mentioned.filter(
      (uid) => !directory.has(uid) && !fetched.has(uid) && !requested.current.has(uid),
    )
    if (missing.length === 0) return undefined
    missing.forEach((uid) => requested.current.add(uid))
    let live = true
    fetchPublicProfiles(missing)
      .then((found) => {
        if (!live) return
        setFetched((current) => {
          const next = new Map(current)
          for (const uid of missing) next.set(uid, found.get(uid) || null)
          return next
        })
      })
      .catch((error) => {
        // Asked again next time something changes; the names read as
        // unknown until then, which is true.
        missing.forEach((uid) => requested.current.delete(uid))
        reportError('console.profiles', error)
      })
    return () => {
      live = false
    }
  }, [mentioned, directory, fetched])

  /** Somebody else's profile is only ever the public half; asked for by profile pages too. */
  const ensureProfile = (uid) => {
    if (!uid || directory.has(uid) || fetched.has(uid) || requested.current.has(uid)) return
    requested.current.add(uid)
    fetchPublicProfiles([uid])
      .then((found) => setFetched((current) => new Map(current).set(uid, found.get(uid) || null)))
      .catch((error) => {
        requested.current.delete(uid)
        reportError('console.profiles', error)
      })
  }

  const profileOf = (uid) => (uid ? directory.get(uid) || fetched.get(uid) || null : null)

  // Yourself by name, not "you": on a desk the record has to read the same
  // for whoever is looking at it, and "Suspended by you" in a log another
  // admin reads is wrong. Blocked people are still named, from the full
  // directory — blocking the reviewers must not blank out the queue.
  const nameFor = (uid) => {
    if (!uid) return t('common.unknownUser')
    return personName(profileOf(uid)?.name) || t('common.unknownUser')
  }

  // ---------------------------------------------------------------- ranks

  const rolesByUid = useMemo(() => new Map(roles.map((r) => [r.uid, r])), [roles])
  // Two ranks: admin, and everybody else. A row still saying `moderator`
  // from before that rank was retired grants nothing, and reads as a user.
  const rankOf = (uid) => (rolesByUid.get(uid)?.role === 'admin' ? 'admin' : 'user')
  const isSuspended = (uid) => rolesByUid.get(uid)?.suspended === true
  const isClosed = (uid) => rolesByUid.get(uid)?.banned === true
  const admins = useMemo(() => roles.filter((r) => r.role === 'admin'), [roles])
  const suspended = useMemo(() => roles.filter((r) => r.suspended === true), [roles])
  const closed = useMemo(() => roles.filter((r) => r.banned === true), [roles])

  const warningsBySubject = useMemo(() => {
    const map = new Map()
    for (const w of warnings) map.set(w.subjectId, [...(map.get(w.subjectId) || []), w])
    return map
  }, [warnings])
  const warningCount = (uid) => warningsBySubject.get(uid)?.length || 0

  // -------------------------------------------------------------- reports

  const activityById = useMemo(() => new Map(allActivities.map((a) => [a.id, a])), [allActivities])

  // Who a report is about. Reports filed before `subjectId` existed fall
  // back to what the rules fall back to, so an old report still resolves.
  const subjectOf = (report) =>
    report?.subjectId ||
    (report?.targetType === 'activity'
      ? activityById.get(report.targetId)?.hostId
      : report?.targetId)

  // Repeats matter more than any single report: three people flagging the
  // same thing is a different signal from one person flagging it once.
  // Counted across every open report, including the ones hidden from this
  // reviewer — the count is about the target, not about who is looking.
  const openByTarget = useMemo(() => {
    const map = new Map()
    for (const r of openReports) map.set(r.targetId, (map.get(r.targetId) || 0) + 1)
    return map
  }, [openReports])
  const timesReported = (report) => openByTarget.get(report.targetId) || 0

  const openAbout = (uid) => openReports.filter((r) => subjectOf(r) === uid)

  // A report about you is not yours to judge, and neither is one you
  // filed: the rules refuse both writes. They stay listed — a queue that
  // hid them would be a queue where reporting the admin buries a case —
  // but marked as not yours.
  const involvesMe = (report) => subjectOf(report) === user.uid || report.reporterId === user.uid

  /**
   * A report's working state, as the queue shows it.
   *
   *   open      — nobody's
   *   mine      — this admin's fresh claim
   *   held      — a colleague's fresh claim; every write under it is refused
   *   stale     — a claim past five minutes: the next person may take it
   *   actioned / dismissed — decided
   */
  const statusOf = (report, now = Date.now()) => {
    if (report.status === 'actioned' || report.status === 'dismissed') return report.status
    if (!report.claimedBy) return 'open'
    const fresh = now - (report.claimedAt ?? now) < CLAIM_TTL_MS
    if (report.claimedBy === user.uid) return fresh ? 'mine' : 'stale'
    return fresh ? 'held' : 'stale'
  }

  const reasonLabel = (key) =>
    REPORT_REASONS.some((r) => r.key === key) ? reportReasonLabel(key) : key

  const referenceError = errors.roles || errors.warnings || null

  const data = {
    user,
    app,
    roles,
    rolesByUid,
    rankOf,
    isSuspended,
    isClosed,
    admins,
    suspended,
    closed,
    warnings,
    warningsBySubject,
    warningCount,
    openReports,
    resolvedReports,
    log,
    loaded,
    errors,
    referenceError,
    profileOf,
    ensureProfile,
    nameFor,
    activityById,
    subjectOf,
    timesReported,
    openAbout,
    involvesMe,
    statusOf,
    reasonLabel,
  }
  const desk = useDesk(data)

  return <ConsoleContext.Provider value={{ ...data, desk }}>{children}</ConsoleContext.Provider>
}

export function useConsole() {
  const context = useContext(ConsoleContext)
  if (!context) throw new Error('useConsole must be used inside ConsoleProvider')
  return context
}
