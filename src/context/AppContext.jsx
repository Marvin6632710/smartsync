import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from './AuthContext'
import {
  cancelActivity as cancelActivityDoc,
  createActivity as createActivityDoc,
  deleteActivity as deleteActivityDoc,
  joinActivity as joinActivityDoc,
  leaveActivity as leaveActivityDoc,
  updateActivity as updateActivityDoc,
  watchActivities,
  watchMyActivities,
} from '../firebase/activities'
import {
  isChatClosed,
  sendMessage as sendMessageDoc,
  watchLatestMessage,
} from '../firebase/messages'
import {
  ensureFollowerMirror,
  followUser,
  markAllNotificationsRead as markAllReadDoc,
  markNotificationRead as markReadDoc,
  watchUnreadCount,
  notifyFollowers,
  pushChatNotification,
  pushNotification,
  unfollowUser,
  watchFollowing,
  watchNotifications,
} from '../firebase/notifications'
import {
  blockUser as blockUserDoc,
  fileReport,
  unblockUser as unblockUserDoc,
  watchBlocked,
} from '../firebase/moderation'
import { drainQueue, EDIT_FIELDS, LANDED, outcomeOf, pick, SUPERSEDED } from '../firebase/pending'
import {
  permissionState,
  pushSupport,
  recentlyDeclined,
  registeredHere,
  syncPushDevice,
} from '../firebase/push'
import {
  completeIdentitySweep,
  recordCategoryHistory,
  saveReadingLocale,
  watchPeers,
} from '../firebase/users'
import { rankActivities, recommendationWeights } from '../services/recommendationService'
import { defaultFilters, matchesFilters, normaliseFilters } from '../utils/filters'
import { distanceBetween } from '../utils/geo'
import { useListenerRetry } from '../hooks/useListenerRetry'
import { DURABLE, loadDurable, loadStorage, saveDurable, saveStorage } from '../utils/storage'
import { personName } from '../i18n'
import { localizeNotification, storedText } from '../i18n/notificationText'
import { reportError } from '../utils/reportError'
import { awaitWrite, QUEUED } from '../utils/writes'

const AppContext = createContext(null)

/**
 * Whether an arriving notification is news worth a toast. A join is the
 * badge's to tell; a message in the thread on screen is already in front
 * of the reader.
 */
function worthAToast(notification) {
  if (notification.kind === 'someoneJoined') return false
  if (notification.type === 'chat' && notification.activityId) {
    if (window.location.pathname === `/activity/${notification.activityId}/chat`) return false
  }
  return true
}

/** How far ahead of the rules' thirty-day cut-off a chat preview is closed. */
const PREVIEW_CLOSE_MARGIN_MS = 60 * 60 * 1000

/** Where each account's unsent content is kept on this device. */
const UNSENT_KEY = (uid) => `smartsync:unsent:${uid}`

/** How long a drain of the write queue is waited for before it is left for next time. */
const RECONCILE_WAIT_MS = 30_000

/** This page load. Rows from another are settled by asking the database. */
const SESSION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** A failure, in the shape a screen can show and storage can hold. */
function describeError(error) {
  if (!error) return null
  const code = error?.code || null
  const message =
    code === 'permission-denied'
      ? 'It was refused — you may no longer be allowed to do this.'
      : code === 'refused' || code === 'superseded'
        ? error.message
        : String(error?.message || 'It could not be sent.')
  return { code, message }
}

/**
 * What a row is told when the document it set out to change was changed
 * by somebody else first — its version is not what the document shows, and
 * must not be written over theirs without the person choosing to.
 */
const SUPERSEDED_MESSAGE = {
  'activity-edit':
    'The activity was changed by somebody else after this edit, and shows their version now.',
  profile:
    'Your profile was changed from another device after this edit, and shows that version now.',
}

/**
 * How long the app waits for its first word from the server before treating
 * silence as being offline. Longer than the SDK's own first-connection
 * timeout, so a slow but working link is not called dead.
 */
export const SERVER_SILENCE_MS = 20_000

export function AppProvider({ children }) {
  // The words every toast is made of, in the language in force. Toasts are
  // built in event handlers, so they read `t` at the moment they are shown.
  const { t, i18n } = useTranslation()
  const { user, serverSeen } = useAuth()
  const uid = user?.uid || null

  const [activities, setActivities] = useState([])
  // The discovery feed is capped by start time; this is not. Without it a
  // commitment far enough ahead would fall outside the window and vanish from
  // the list of things you had joined.
  const [myActivities, setMyActivities] = useState([])
  const [peers, setPeers] = useState([])
  const [notifications, setNotifications] = useState([])
  // For the badge on the bell — its own listener, see `watchUnreadCount`.
  const [unreadCount, setUnreadCount] = useState(0)
  const [followedUserIds, setFollowedUserIds] = useState([])
  const [blocked, setBlocked] = useState([])
  const [threadPreviews, setThreadPreviews] = useState({})
  const [activitiesLoaded, setActivitiesLoaded] = useState(false)
  const [dataError, setDataError] = useState(null)

  // Filters are a per-device view preference, not shared account data, so
  // they stay in localStorage rather than costing a Firestore write on every
  // slider drag. Normalised on the way in: a set saved by an older version
  // as one choice comes back as a set of one (see utils/filters).
  const [filters, setFilters] = useState(() =>
    normaliseFilters(loadStorage('smartsync:filters', defaultFilters)),
  )

  // Scoring weights are adjustable and kept per device, for the same reason
  // filters are: they change how *you* see the list, not what anyone else
  // sees. Any missing key falls back to the shipped default, so a stored set
  // written by an older version cannot silently zero a signal.
  const [weights, setWeights] = useState(() =>
    loadStorage('smartsync:weights', recommendationWeights),
  )
  const [celebration, setCelebration] = useState(null)
  // An offer to turn browser notifications on, made once per session at
  // the moment it makes sense: right after joining something.
  const [pushInvite, setPushInvite] = useState(null)
  // Joins this client has sent that the server has not yet answered. See
  // `rosterPending` below for why that has to be known.
  const [pendingJoins, setPendingJoins] = useState(() => new Set())

  // ---------------------------------------------------------------- unsent
  //
  // What the person typed into a write that the server has not accepted.
  //
  // A write queued offline is applied locally and sent later; if the server
  // then refuses it, Firestore rolls the local copy back and the content is
  // simply gone — the chat message, the activity, the profile edit — with a
  // toast that says so and nothing to retry with. So every queued write
  // that carries what somebody typed is noted here, per account and on
  // disk: `pending` while the server has not answered, `failed` once it
  // refuses, gone once it lands. A failed row is offered back on the screen
  // it came from — a retry for a message, a "restore" for a form — and is
  // never written over anything typed since. Rows from an earlier session
  // are settled by asking the database once the queue has drained (see
  // firebase/pending.js), because their promises died with the page.
  //
  // On disk means the most durable place the browser allows (see
  // saveDurable): localStorage, or this tab's sessionStorage when that is
  // blocked or full, or memory alone when both are. Rows are never lost to
  // a storage failure while the page is open; what memory alone cannot do
  // is survive the page, so in that case leaving it is put to the person
  // first (the `beforeunload` guard below).
  const [unsentState, setUnsentState] = useState({ uid: null, rows: [] })
  if (unsentState.uid !== uid) {
    setUnsentState({ uid, rows: uid ? loadDurable(UNSENT_KEY(uid), []) : [] })
  }
  const unsent = unsentState.uid === uid ? unsentState.rows : []
  // Rows this page load has let go of — landed, or discarded by the person.
  // Another tab of the same account writes the same key, so saving merges
  // with what is stored rather than overwriting it: this tab's rows win
  // where both know a row, rows only the other tab knows are kept, and
  // rows this tab deliberately removed stay removed.
  const releasedRef = React.useRef(new Set())
  useEffect(() => {
    releasedRef.current = new Set()
  }, [uid])
  // Where the last save of the rows ended up (see DURABLE).
  const [unsentKept, setUnsentKept] = useState(DURABLE.local)
  useEffect(() => {
    if (!unsentState.uid) return
    const key = UNSENT_KEY(unsentState.uid)
    const mine = new Map(unsentState.rows.map((row) => [row.id, row]))
    const theirs = loadDurable(key, []).filter(
      (row) => !mine.has(row.id) && row.session !== SESSION && !releasedRef.current.has(row.id),
    )
    setUnsentKept(saveDurable(key, [...unsentState.rows, ...theirs]))
  }, [unsentState])
  // Memory is the only copy: a reload would lose the rows — and, since a
  // browser that blocks this storage blocks Firestore's queue too, the
  // queued writes with them. Leaving is the person's call, but not one to
  // make without knowing; the browser shows its own "leave this page?".
  const guardUnload = unsent.length > 0 && unsentKept === DURABLE.memory
  useEffect(() => {
    if (!guardUnload) return undefined
    const warn = (event) => {
      event.preventDefault()
      // Older browsers need a value set; the text itself is never shown.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [guardUnload])
  const editUnsent = (owner, change) =>
    setUnsentState((current) =>
      current.uid === owner ? { ...current, rows: change(current.rows) } : current,
    )
  /**
   * Notes a queued write. Returns the row's id.
   *
   * A second edit of the same document while the first is still pending
   * replaces it: the form was seeded from the document as the first edit
   * left it locally, so the newer row carries everything the older one
   * did — and judging the older one afterwards would find the document
   * showing neither its before nor its after, and call it superseded by a
   * stranger when it was superseded by its author.
   */
  function keepUnsent(entry, status = 'pending', error = null) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const row = {
      id,
      at: Date.now(),
      session: SESSION,
      status,
      error: describeError(error),
      ...entry,
    }
    const replaces = (other) =>
      other.status === 'pending' &&
      other.kind === entry.kind &&
      other.key === entry.key &&
      Boolean(EDIT_FIELDS[entry.kind])
    editUnsent(uid, (rows) => {
      for (const other of rows) if (replaces(other)) releasedRef.current.add(other.id)
      return [...rows.filter((other) => !replaces(other)), row]
    })
    return id
  }
  const settleUnsent = (id) => {
    releasedRef.current.add(id)
    editUnsent(uid, (rows) => rows.filter((row) => row.id !== id))
  }
  const failUnsent = (id, error) =>
    editUnsent(uid, (rows) =>
      rows.map((row) =>
        row.id === id ? { ...row, status: 'failed', error: describeError(error) } : row,
      ),
    )
  const discardUnsent = settleUnsent
  const recordFailed = (entry, error) => keepUnsent(entry, 'failed', error)

  // A minute-resolution clock. Whether an activity has started is a fact about
  // the current time, not about the data, so it has to be re-evaluated while
  // the screen sits open — otherwise a football match that kicked off ten
  // minutes ago stays advertised as joinable until someone reloads.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(tick)
  }, [])

  // Firestore keeps working without a connection: reads come from its local
  // cache and writes queue until it can reach the server. That is genuinely
  // useful on patchy campus wifi, but it is invisible — a join looks exactly
  // like a confirmed one — so the state has to be said out loud.
  const [browserOffline, setBrowserOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  )
  // Firestore's own answer to "can I reach the server right now". More
  // trustworthy than navigator.onLine, which only knows whether a network
  // interface exists and says nothing about whether the backend is up.
  // Stays null until the first server response, because before that
  // `fromCache` only means "we have not heard back yet" — loading, not
  // offline — and treating it as offline flashes the banner on every start.
  //
  // The two signals cover different failures, and their speed differs:
  // losing the device's connection fires the browser event immediately, while
  // a server that stops responding on a live network takes about a minute to
  // surface, since Firestore has to let its connection time out first.
  // Measured, not assumed.
  const [serverReachable, setServerReachable] = useState(null)
  // Whether the activity feed itself has been answered by the server this
  // session. Distinct from reachability: the profile documents are tiny and
  // arrive first, the feed is four hundred documents and can take a while
  // on a slow link — and until it has arrived, an activity the cache lacks
  // is not known to be missing (see `syncing`).
  const [feedSynced, setFeedSynced] = useState(false)
  // The feed was waited for as long as the app is willing to wait; past
  // this the screens stop saying "loading" for something that may simply
  // not be there.
  const [feedWaited, setFeedWaited] = useState(false)
  const offline = browserOffline || serverReachable === false
  // The latest word from the profile listeners, readable inside a timer.
  const serverSeenRef = React.useRef(serverSeen)
  useEffect(() => {
    serverSeenRef.current = serverSeen
  }, [serverSeen])
  // Reachability that was declared by the silence probe rather than heard
  // from the server. A later proof of a server undoes it; a real
  // disconnection, which the feed reports itself, is not touched.
  const probeDeclaredRef = React.useRef(false)
  // The same fact, for the screen: the banner is up because nothing has
  // been heard, not because anything said the connection is gone. Measured
  // against a server that merely answers slowly — every reply held for
  // five seconds — the banner came up at the threshold and went down
  // thirteen seconds later, when the first answer arrived; calling that
  // "offline" would have been untrue, so the banner says what is known.
  const [serverSilent, setServerSilent] = useState(false)
  useEffect(() => {
    if (!serverSeen) return
    setServerReachable((previous) => {
      if (previous === null) return true
      if (previous === false && probeDeclaredRef.current) {
        probeDeclaredRef.current = false
        return true
      }
      return previous
    })
    setServerSilent(false)
  }, [serverSeen])
  useEffect(() => {
    const goOffline = () => setBrowserOffline(true)
    const goOnline = () => setBrowserOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // Rows from an earlier session: once the server is known to be reachable
  // and the queue has drained, each is either in the database or was
  // refused. Gated on a server that has actually answered, not merely on
  // the browser saying it is online: draining the queue needs the server,
  // and "online" from the browser says nothing about that. Bounded, so a
  // drain that never finishes — the link died again — does not hold the
  // door shut for good; the next time the server is heard from, it is
  // tried again.
  const reconcilingRef = React.useRef(false)
  useEffect(() => {
    if (!uid || serverReachable !== true || reconcilingRef.current) return undefined
    const stale = unsent.filter((row) => row.status === 'pending' && row.session !== SESSION)
    if (stale.length === 0) return undefined
    reconcilingRef.current = true
    let live = true
    ;(async () => {
      try {
        const drained = await Promise.race([
          drainQueue().then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), RECONCILE_WAIT_MS)),
        ])
        if (!drained || !live) return
        for (const row of stale) {
          if (!live) return
          let outcome
          try {
            outcome = await outcomeOf(row)
          } catch (error) {
            reportError('unsent.reconcile', error, { kind: row.kind })
            continue
          }
          if (outcome === LANDED) settleUnsent(row.id)
          else if (outcome === SUPERSEDED)
            failUnsent(row.id, { code: 'superseded', message: SUPERSEDED_MESSAGE[row.kind] })
          else
            failUnsent(row.id, {
              code: 'refused',
              message: 'It was refused when the connection came back.',
            })
        }
      } finally {
        reconcilingRef.current = false
      }
    })()
    return () => {
      live = false
    }
    // `unsent` is read once per transition on purpose; re-running on every
    // row change would restart the drain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, serverReachable])

  // A rename or anonymous-mode switch made offline could only stamp the
  // hosted activities the cache held. The profile carries a note that the
  // sweep is unfinished; once the server can be reached, the rest are
  // brought into line from the server's own list, and the note is cleared
  // with the last of them. One run at a time; a failure leaves the note for
  // the next connection.
  // Run once the server has actually answered — the sweep reads from the
  // server and rejects offline — and again each time it answers after a
  // gap, until the note is gone.
  const sweepingRef = React.useRef(false)
  useEffect(() => {
    if (!uid || serverReachable !== true || !user?.identitySweepPending || sweepingRef.current) {
      return undefined
    }
    sweepingRef.current = true
    let live = true
    completeIdentitySweep(uid, {
      name: user.name,
      avatar: user.avatar,
      ...(user.pictureVersion ? { pictureVersion: user.pictureVersion } : {}),
    })
      .catch((error) => {
        if (live) reportError('users.identitySweep', error, { uid })
      })
      .finally(() => {
        sweepingRef.current = false
      })
    return () => {
      live = false
    }
  }, [
    uid,
    serverReachable,
    user?.identitySweepPending,
    user?.name,
    user?.avatar,
    user?.pictureVersion,
  ])

  useEffect(() => {
    saveStorage('smartsync:filters', filters)
  }, [filters])

  useEffect(() => {
    saveStorage('smartsync:weights', weights)
  }, [weights])

  // ---------------------------------------------------------------- live data

  // Signing out must not leave the previous account's activities on screen
  // for a frame. Clearing during render rather than in an effect is React's
  // recommended way to reset state when the thing it describes changes —
  // an effect would render the stale data once before wiping it.
  const { attempt: listenerAttempt, guard, resetAttempts } = useListenerRetry(uid)
  const [loadedFor, setLoadedFor] = useState(uid)
  if (loadedFor !== uid) {
    setLoadedFor(uid)
    setActivities([])
    setMyActivities([])
    setPeers([])
    setNotifications([])
    setUnreadCount(0)
    setFollowedUserIds([])
    setThreadPreviews({})
    setBlocked([])
    setDataError(null)
    setActivitiesLoaded(false)
    setServerReachable(null)
    setServerSilent(false)
    setFeedSynced(false)
    setFeedWaited(false)
    setPushInvite(null)
    resetAttempts()
  }

  useEffect(() => {
    if (!uid) return undefined
    // A closed account is refused every one of these by the rules, and sees
    // one screen that needs none of them. Opening them anyway meant six
    // denials on every boot, each spending the retry budget and a token
    // refresh on listeners that were never going to be allowed.
    if (user?.banned) return undefined
    // Same teardown race as AuthContext: a listener belonging to the account
    // that just signed out can deliver a permission-denied after its stop
    // function has run, which would otherwise be shown to whoever signed in
    // next as their own data failing to load.
    let live = true
    const onlyWhileLive =
      (set) =>
      (...args) => {
        if (live) set(...args)
      }
    const report = guard((error) => {
      if (live) setDataError(error)
    })
    // "Not heard from the server yet" cannot stay the answer for ever. A
    // connection that was never made — a network that blocks the stream, a
    // tab that cannot get the persistence lease — produced cached data with
    // no banner, because the state above only ever left null on a server
    // response, and none was coming. Past this long with nothing but cache
    // from *anyone* — the feed, and the profile listeners that are answered
    // first on any link that works at all — it is offline for every purpose
    // the banner serves; the first server snapshot still clears it. A feed
    // that is merely slow, on a link the profile came down, is left alone:
    // that was a false banner on a working connection, and the wait for the
    // feed simply ends instead.
    const probe = window.setTimeout(() => {
      if (!live) return
      setFeedWaited(true)
      if (serverSeenRef.current) return
      setServerReachable((previous) => {
        if (previous !== null) return previous
        probeDeclaredRef.current = true
        return false
      })
      setServerSilent(true)
    }, SERVER_SILENCE_MS)
    // Whether this subscription of the feed has been answered by the server.
    // A cached snapshot before that is the feed starting up, not a
    // disconnection — the profile listeners may already have proved the
    // server is there — and only a cached snapshot *after* a server one is
    // the connection going away.
    let feedSeenServer = false
    const stops = [
      watchActivities((next, meta) => {
        if (!live) return
        setActivities(next)
        setActivitiesLoaded(true)
        if (!meta.fromCache) {
          feedSeenServer = true
          setFeedSynced(true)
          probeDeclaredRef.current = false
          setServerSilent(false)
          setServerReachable(true)
        } else if (feedSeenServer) {
          setServerReachable(false)
        }
      }, report),
      // Every one of these goes through `live`, not just the first. Four of
      // the five used to hand their setter straight to the SDK, so the guard
      // that exists precisely to stop a departing session writing into the
      // arriving one's state was protecting a fifth of the data it was
      // written for.
      watchMyActivities(uid, onlyWhileLive(setMyActivities), report),
      watchPeers(uid, onlyWhileLive(setPeers), report),
      watchNotifications(uid, onlyWhileLive(setNotifications), report),
      // A denial here is never new information — the inbox listener above
      // reads the same collection under the same rule and reports it — so
      // this one stays quiet about it and records only anything else.
      watchUnreadCount(uid, onlyWhileLive(setUnreadCount), (error) => {
        if (error?.code === 'permission-denied') return
        reportError('notifications.unread', error, { uid })
      }),
      watchFollowing(uid, onlyWhileLive(setFollowedUserIds), report),
      watchBlocked(uid, onlyWhileLive(setBlocked), report),
    ]
    return () => {
      live = false
      window.clearTimeout(probe)
      stops.forEach((stop) => stop())
    }
  }, [uid, user?.banned, listenerAttempt, guard])

  // Follows made before the host-side mirror existed have only the private
  // half, so the host has never heard of them and could not tell them
  // anything. Written once per followed person per session, only where the
  // mirror is missing, and never for a session that has ended.
  const mirroredRef = React.useRef(new Set())
  useEffect(() => {
    mirroredRef.current = new Set()
  }, [uid])
  useEffect(() => {
    if (!uid) return
    const done = mirroredRef.current
    for (const targetId of followedUserIds) {
      if (done.has(targetId)) continue
      done.add(targetId)
      ensureFollowerMirror(uid, targetId).catch((error) => {
        // Not marked done: a later snapshot, or the next session, tries again.
        done.delete(targetId)
        reportError('notifications.followerMirror', error, { uid, targetId })
      })
    }
  }, [uid, followedUserIds])

  // ---------------------------------------------------------------- toasts

  useEffect(() => {
    if (!celebration) return undefined
    const timer = window.setTimeout(() => setCelebration(null), 2800)
    return () => window.clearTimeout(timer)
  }, [celebration])

  function pushCelebration(payload) {
    if (payload === null) {
      setCelebration(null)
      return
    }
    setCelebration({
      id: Date.now(),
      icon: 'sparkles',
      tone: 'default',
      title: '',
      body: '',
      ...payload,
    })
  }

  // ----------------------------------------------------------------- push

  // The language this person reads in, kept on the server: a push is
  // worded by a Function that has never seen this device, and it has to
  // say the same thing the screen would. Written only when it differs from
  // what the profile already says, so a visit costs nothing.
  useEffect(() => {
    if (!uid || !user) return
    const language = i18n.language
    let timeZone = null
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      // Left as the profile has it.
    }
    const patch = {}
    if (language && language !== user.language) patch.language = language
    if (timeZone && timeZone !== user.timeZone) patch.timeZone = timeZone
    if (Object.keys(patch).length === 0) return
    saveReadingLocale(uid, patch).catch((error) =>
      reportError('users.readingLocale', error, { uid }),
    )
  }, [uid, user, i18n.language])

  // A registered device stays registered: the token is refreshed on each
  // start, and a permission the browser withdrew behind the app's back is
  // noticed and the registration taken back. Never asks.
  useEffect(() => {
    if (!uid) return
    syncPushDevice(uid, { language: i18n.language })
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // A notification that arrives while the app is on screen is shown as a
  // toast, since the browser notification is deliberately not drawn while
  // a SmartSync window is visible. Only arrivals: the first snapshot, and a
  // reconnect replaying the cache, are the inbox catching up, not news.
  // Chat for the thread on screen is not news either — the message is
  // already in front of the reader — and a join is the badge's to tell.
  const seenNotificationsRef = React.useRef({ uid: undefined, ids: null })
  useEffect(() => {
    const tracked = seenNotificationsRef.current
    if (tracked.uid !== uid) {
      // Mounted, or another account: what is held is the empty initial
      // state, not the inbox. The first snapshot is the baseline.
      seenNotificationsRef.current = { uid, ids: null }
      return
    }
    if (!tracked.ids) {
      tracked.ids = new Set(notifications.map((n) => n.id))
      return
    }
    const seen = tracked.ids
    const attachedAgo = Date.now() - 60_000
    const fresh = notifications.filter((n) => !seen.has(n.id))
    fresh.forEach((n) => seen.add(n.id))
    const news = fresh.find((n) => !n.read && n.createdAt >= attachedAgo && worthAToast(n))
    if (!news) return
    const text = localizeNotification(news)
    pushCelebration({
      icon: news.type === 'moderation' ? 'alert' : 'bell',
      tone: news.type === 'moderation' ? 'warning' : 'default',
      title: text.title,
      body: text.body,
      to: `/n/${news.id}`,
    })
  }, [notifications, uid])

  // Offered once per session, after a join, to somebody who has never been
  // asked here and did not recently say "not now" — the one moment when
  // "be told when this changes" is an answer to a question they have.
  const pushInvitedRef = React.useRef({ uid: null, done: false })
  function maybeInvitePush(activity) {
    if (!uid) return
    const invited = pushInvitedRef.current
    if (invited.uid === uid && invited.done) return
    if (pushSupport() !== 'ok') return
    if (permissionState() !== 'default') return
    if (registeredHere(uid) || recentlyDeclined()) return
    pushInvitedRef.current = { uid, done: true }
    setPushInvite({ title: activity?.title || '' })
  }

  /**
   * Every write goes through here. A Firestore write can be rejected by the
   * security rules — that is the point of them — and a rejected write that
   * fails silently looks exactly like a broken button, so failures surface as
   * a toast rather than an unhandled promise rejection in the console.
   *
   * It also decides how long to wait. Offline, a write's promise never
   * settles — Firestore has applied it locally and queued it, which is the
   * behaviour the app wants — so every screen that awaited one sat on
   * "Saving…" until the connection returned. Now the wait is bounded (see
   * awaitWrite): the write is still queued, the screen moves on, the toast
   * says "will sync", and a refusal that arrives later is still shown.
   *
   * `success` is the toast for a write that landed; when the write is only
   * queued, the same toast is shown with "— will sync" after its title, the
   * way joining already does. Pass `queued: null` to say nothing in that
   * case. Returns the write's value, `QUEUED`, or `null` when it failed.
   */
  function failureToast(failure, error) {
    pushCelebration({
      icon: 'alert',
      tone: 'warning',
      title: failure,
      body:
        error?.code === 'permission-denied' ? t('common.noPermission') : t('common.pleaseTryAgain'),
    })
  }
  async function attempt(action, { failure, success, queued, keep }) {
    const write = action()
    // What the write carried, for the unsent registry — computed once the
    // write exists, since the row may need the id it minted.
    const kept = typeof keep === 'function' ? keep(write) : keep
    let outcome
    try {
      outcome = await awaitWrite(write, {
        offline,
        onLater: (error) => failureToast(failure, error),
      })
    } catch (error) {
      failureToast(failure, error)
      // An immediate refusal of content the screen has already let go of.
      if (kept?.onRefusal) recordFailed(kept, error)
      return null
    }
    if (outcome === QUEUED) {
      if (kept) {
        // Attached after the row exists, so a rejection that has already
        // happened still marks it — a rejected promise runs a handler added
        // late — and a write that lands removes it.
        const id = keepUnsent(kept)
        write.then(
          () => settleUnsent(id),
          (error) => failUnsent(id, error),
        )
      }
      if (queued !== null) {
        pushCelebration(
          queued ||
            (success
              ? { ...success, title: t('common.willSync', { title: success.title }) }
              : {
                  icon: 'check',
                  title: t('toasts.savedWillSync'),
                  body: t('toasts.finishWhenOnline'),
                }),
        )
      }
    } else if (success) {
      pushCelebration(success)
    }
    return outcome
  }

  // ------------------------------------------------------------ derived data

  // Membership lives on the activity itself, so "what have I joined" is a
  // question about the current data rather than a second list that has to be
  // kept in step with it. The two can no longer disagree.
  // One list, deduplicated. Discovery wins where both hold the same activity:
  // both come from the same documents, and preferring one keeps the identity
  // stable so memoised derivations downstream do not churn.
  const allKnownActivities = useMemo(() => {
    if (myActivities.length === 0) return activities
    const byId = new Map(activities.map((a) => [a.id, a]))
    for (const mine of myActivities) if (!byId.has(mine.id)) byId.set(mine.id, mine)
    return [...byId.values()]
  }, [activities, myActivities])

  const joinedIds = useMemo(
    () =>
      allKnownActivities.filter((a) => (a.participantUids || []).includes(uid)).map((a) => a.id),
    [allKnownActivities, uid],
  )

  // Distance is computed from where the user actually is, not typed into a
  // form. Unknown location leaves distanceKm null, which the scorer treats as
  // "no information" rather than "zero kilometres away".
  // Blocking is applied on the way out of the context, so no screen has to
  // remember to do it. What it hides is a deliberate list rather than
  // "everything": you keep activities you had already joined, because leaving
  // is your decision to make and a commitment should not evaporate — but you
  // stop being shown their activities, their profile and their messages.
  const blockedIds = useMemo(() => new Set(blocked.map((b) => b.uid)), [blocked])

  // The directory the matching screen ranks, and the one the scorer measures
  // similarity against. Blocked people are removed once, here, so everything
  // built on `peers` inherits the rule without having to know about it.
  const visiblePeers = useMemo(
    () => peers.filter((peer) => !blockedIds.has(peer.uid)),
    [peers, blockedIds],
  )

  // Everyone whose profile we hold, including ourselves.
  const directory = useMemo(() => {
    const map = new Map()
    if (user) map.set(user.uid, user)
    peers.forEach((peer) => map.set(peer.uid, peer))
    return map
  }, [user, peers])

  const located = useMemo(() => {
    const from = user?.location || null
    return allKnownActivities.map((activity) => {
      const host = directory.get(activity.hostId)
      return {
        ...activity,
        // The host's name and avatar are copied onto the activity so a list
        // renders without resolving every host. The copy is swept when
        // someone renames or goes anonymous, but preferring the live profile
        // here means the screen is right even in the window before that sweep
        // lands — and right anyway if it ever fails.
        hostName: host?.name || activity.hostName,
        hostAvatar: host?.avatar || activity.hostAvatar,
        hostPictureVersion: host ? host.pictureVersion : activity.hostPictureVersion,
        distanceKm: from ? distanceBetween(from, { lat: activity.lat, lng: activity.lng }) : null,
      }
    })
  }, [allKnownActivities, directory, user?.location])

  // Scored once, over everything. Previously only active activities were
  // ranked, so an activity you had joined and the host then cancelled lost its
  // match score and rendered as "--%" in your own list.
  const scored = useMemo(
    () => rankActivities(user, located, visiblePeers, weights),
    [user, located, visiblePeers, weights],
  )

  // Activities are fetched from a day ago onwards so that ones you joined stay
  // reachable after they happen. That window is a storage decision, not a
  // product one: something that already started must not be offered as a plan.
  // `rosterPending`: this client put itself on the roster and the server has
  // not confirmed it yet. Creating or joining updates the local copy at once;
  // the messages rule reads the activity *on the server*, where the activity
  // does not exist yet or you are not yet a participant, so a thread listener
  // opened in that window is refused — and a refusal is what the retry guard
  // spends a token refresh and a full rebuild on. Every creation and every
  // join used to cost one of the two retries.
  //
  // Precisely that, and not every pending write: a host editing a title has
  // a pending write too, and gating on it would close and reopen their chat
  // for nothing — or, offline, hide the messages they had cached. A create
  // in flight is a pending write whose server timestamp has not resolved
  // (`createdAt` is null until the server sets it); a join in flight is one
  // this client sent and is still waiting on.
  const timed = useMemo(
    () =>
      scored.map((a) => ({
        ...a,
        isPast: Number.isFinite(a.startsAt) && a.startsAt < now,
        rosterPending: (a.pendingWrite && a.createdAt === null) || pendingJoins.has(a.id),
      })),
    [scored, now, pendingJoins],
  )

  const visibleActivities = useMemo(
    () => timed.filter((a) => a.status === 'active' || joinedIds.includes(a.id)),
    [timed, joinedIds],
  )

  // Your commitments, in the order a person keeps them: what is coming,
  // soonest first; then what has been, most recent first. One ascending sort
  // was right while the feed stopped at yesterday — once the personal feed
  // carried real history, "soonest first" put something from months ago at
  // the top of the list and the thing tonight at the bottom.
  const joinedActivities = useMemo(() => {
    const mine = visibleActivities.filter((a) => joinedIds.includes(a.id))
    const at = (a) => (Number.isFinite(a.startsAt) ? a.startsAt : 0)
    const upcoming = mine.filter((a) => !a.isPast).sort((a, b) => at(a) - at(b))
    const past = mine.filter((a) => a.isPast).sort((a, b) => at(b) - at(a))
    return [...upcoming, ...past]
  }, [visibleActivities, joinedIds])

  // Everything an admin has taken down, for the console's activities list. Derived
  // from the listener that is already open, so seeing it costs no extra read —
  // and the rules, not this line, are what keep the list to admins: anyone can
  // already read activities, which is why removal is a status and not a secret.
  const removedActivities = useMemo(() => timed.filter((a) => a.status === 'removed'), [timed])

  // Discovery is upcoming activities only. Past and cancelled ones remain in
  // `visibleActivities`, so your own history still renders.
  const recommendations = useMemo(
    () =>
      visibleActivities.filter(
        (a) =>
          a.status === 'active' &&
          !a.isPast &&
          // Nothing hosted by somebody you blocked is ever suggested to you,
          // including things you had already joined. Those stay reachable
          // through your own joined list and their own page — a commitment
          // should not evaporate, and leaving is your decision to make — but
          // being shown them again alongside fresh suggestions is exactly what
          // blocking was meant to stop.
          !blockedIds.has(a.hostId),
      ),
    [visibleActivities, blockedIds],
  )

  // One predicate for the feed, the search and the map, so they cannot
  // disagree about what the filters mean.
  const filteredActivities = useMemo(
    () => recommendations.filter((activity) => matchesFilters(activity, filters)),
    [recommendations, filters],
  )

  // -------------------------------------------------------- message previews

  // One listener per joined activity, each limited to the newest message, so
  // the inbox can show a preview without downloading whole threads.
  //
  // Keyed on a joined-id string rather than the array: the array is rebuilt on
  // every activities snapshot, and re-subscribing on each one would churn
  // listeners constantly. One effect owns both subscribing and unsubscribing —
  // an earlier version split them across two effects and a ref, which
  // StrictMode's mount/unmount/remount cycle tore down without ever rebuilding,
  // leaving every thread stuck on "No messages yet".
  // Sorted, so the key describes the *set* of joined activities rather than
  // the order the activities snapshot happened to arrive in. The snapshot is
  // ordered by start time, so editing one activity's time reordered the whole
  // array and, with the old key, churned every listener for no reason.
  //
  // Only threads that can still be read. The personal feed has no time floor,
  // so it holds everything you ever joined — and the rules close a chat thirty
  // days after the activity. Opening a preview on a closed thread is refused,
  // and a refusal is exactly what the retry guard treats as "the token has
  // just been revoked, ask for a new one and rebuild everything": one old
  // activity cost two token refreshes and two full rebuilds of every listener
  // on each launch, and then left no retry for a denial that was real. Found
  // by test after the personal feed shipped; it could not happen while the
  // feed stopped at yesterday.
  //
  // An hour early, deliberately. The rules decide with the server's clock and
  // this decides with the phone's; a phone running behind would open a
  // listener the server had already closed, which is the same denial again.
  // A preview missing from a thread in its last hour costs nothing.
  //
  // And not while the write that put you on the roster is still in flight —
  // see `rosterPending`. The snapshot fires again when the server accepts
  // the write, and the listener opens then.
  const previewIds = useMemo(
    () =>
      timed
        .filter(
          (a) =>
            (a.participantUids || []).includes(uid) &&
            !a.rosterPending &&
            !isChatClosed(a, now + PREVIEW_CLOSE_MARGIN_MS),
        )
        .map((a) => a.id),
    [timed, uid, now],
  )
  const joinedKey = [...previewIds].sort().join(',')
  const threadStopsRef = React.useRef(new Map())
  const threadOwnerRef = React.useRef(null)

  // Lifetime. One effect owns closing these, and it fires only when the
  // account changes, on unmount, or when a retry deliberately rebuilds
  // everything — never merely because the set of joined activities changed.
  // Keeping teardown here is what lets the reconcile below hold listeners
  // across renders; an earlier attempt put both in one effect, whose cleanup
  // closed everything before the next run could reuse any of it, so the
  // reconciliation was elaborate and did nothing.
  useEffect(() => {
    threadOwnerRef.current = uid
    const open = threadStopsRef.current
    return () => {
      open.forEach((stop) => stop())
      open.clear()
    }
  }, [uid, listenerAttempt])

  // Reconcile: open what is new, close what has gone, leave the rest alone.
  useEffect(() => {
    if (!uid) return undefined
    const ids = joinedKey ? joinedKey.split(',') : []
    const open = threadStopsRef.current
    // Which session these belong to. A listener that somehow outlives its
    // account must not write into the next one's previews — the same hazard
    // the `live` flag covers for the data listeners.
    const owner = uid

    for (const id of ids) {
      if (open.has(id)) continue
      open.set(
        id,
        watchLatestMessage(
          id,
          (message) => {
            if (threadOwnerRef.current === owner) {
              setThreadPreviews((previous) => ({ ...previous, [id]: message }))
            }
          },
          // A thread that genuinely cannot be read any more — the thirty-day
          // retention window has closed on it — drops its preview rather than
          // offering a line nobody can open. The guard keeps an account
          // switch from counting as that: without it, signing back in
          // silently emptied every chat preview. Passing no handler at all,
          // which is where this started, let the SDK log "Uncaught Error in
          // snapshot listener" on every sign-out and told the app nothing.
          guard(() => {
            if (threadOwnerRef.current === owner) {
              setThreadPreviews((previous) => ({ ...previous, [id]: null }))
            }
          }),
        ),
      )
    }

    for (const [id, stop] of [...open]) {
      if (ids.includes(id)) continue
      stop()
      open.delete(id)
    }
    // No cleanup: the effect above owns the lifetime.
    return undefined
  }, [joinedKey, uid, guard, listenerAttempt])

  // ------------------------------------------------------------------ actions

  /**
   * Sends a notification to somebody else, honouring their choice not to
   * receive them.
   *
   * The rules enforce this too, but checking here matters: without it the
   * write is rejected, `attempt` reports a failure, and the user is told
   * their join did not work when it did. Never let a notification failure
   * surface as a failure of the thing that triggered it.
   */
  /**
   * Refuses an action that a suspension forbids, and says so.
   *
   * The rules stop these writes anyway, but a refusal that does not name the
   * reason is worse than useless: joining while suspended used to produce
   * "this activity is no longer open to join", which blames the activity for
   * a limit on the account — with the banner saying otherwise directly above
   * it. Returns true when the caller should stop.
   */
  function blockedBySuspension(what) {
    if (!user?.suspended) return false
    pushCelebration({
      icon: 'alert',
      tone: 'warning',
      title: t('toasts.suspendedTitle'),
      body: t('toasts.suspendedBody', { what: t(what) }),
    })
    return true
  }

  function notifyUser(recipientId, payload) {
    if (!recipientId || recipientId === uid) return
    const recipient = peers.find((peer) => peer.uid === recipientId)
    if (recipient?.notificationsEnabled === false) return
    // Best-effort by design — a join must not fail because the other person
    // could not be told — but it is no longer *silent*. A notification that
    // never arrives used to leave no trace on any device.
    pushNotification(recipientId, payload).catch((error) =>
      reportError('notifications.push', error, { recipientId }),
    )
  }

  /**
   * Tells the host's followers about a new activity — once the app can.
   *
   * `notifyFollowers` reads the follower list first, and a read made offline
   * is answered from the cache, which for somebody else's subcollection is
   * almost always empty: an activity created offline told nobody, its
   * outcome said so to nobody, and nothing ever tried again. Held here until
   * the connection is back instead. Lost on a reload, which is the honest
   * limit of a client with no server of its own.
   */
  const fanoutRef = React.useRef([])
  useEffect(() => {
    fanoutRef.current = []
  }, [uid])
  function announceToFollowers(activityId, payload) {
    if (offline) {
      fanoutRef.current.push({ activityId, payload })
      return
    }
    notifyFollowers(uid, activityId, { ...payload, skip: blockedIds })
  }
  useEffect(() => {
    if (offline || !uid) return undefined
    const held = fanoutRef.current.splice(0)
    for (const { activityId, payload } of held) {
      notifyFollowers(uid, activityId, { ...payload, skip: blockedIds })
    }
    return undefined
  }, [offline, uid, blockedIds])
  // A join already in flight for this activity, checked synchronously: the
  // state below drives rendering, but a second tap in the same tick would
  // read the state from before the first, and send the host a second
  // "Someone joined". The write itself was always idempotent; the notice
  // was not.
  const joinBusyRef = React.useRef(new Set())
  async function joinActivity(id) {
    const activity = visibleActivities.find((item) => item.id === id)
    if (!activity || joinedIds.includes(id)) return
    if (joinBusyRef.current.has(id)) return
    if (blockedBySuspension('toasts.whatJoin')) return
    if (activity.isPast) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: t('toasts.alreadyHappenedTitle'),
        body: t('toasts.alreadyHappenedBody', { title: activity.title }),
      })
      return
    }

    // Not awaited. Firestore applies the write to its local cache immediately,
    // so the roster on screen has already changed; waiting for the server
    // means an offline user gets no confirmation at all and then a stale toast
    // minutes later when the connection returns. Confirm what they can already
    // see, and correct it if the server disagrees.
    const pending = joinActivityDoc(id, uid)
    joinBusyRef.current.add(id)
    setPendingJoins((current) => new Set(current).add(id))
    const settled = () => {
      joinBusyRef.current.delete(id)
      setPendingJoins((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
    pending.then(settled, settled)

    // Not awaited, and failure is swallowed on purpose: learning that you
    // like football is a side effect of joining, not part of it. A rejection
    // here must not become an unhandled promise, and must not tell the user
    // their join went wrong when it did not.
    // Feeds 15% of the ranking. Failing quietly meant recommendations could
    // degrade for a user with nothing anywhere to say why.
    recordCategoryHistory(uid, user.historyCategories, activity.category).catch((error) =>
      reportError('users.recordCategoryHistory', error, { uid }),
    )
    // Written in English, the language notifications are stored in; the
    // reader's screen words it for them (see i18n/notificationText).
    notifyUser(activity.hostId, {
      type: 'activity',
      ...storedText('someoneJoined', { name: user.name, title: activity.title }),
      activityId: id,
    })
    pushCelebration({
      icon: 'check',
      tone: 'success',
      title: offline ? t('toasts.joinedWillSync') : t('toasts.youAreIn'),
      body: offline
        ? t('toasts.joinedQueuedBody', { title: activity.title })
        : t('toasts.joinedBody', { title: activity.title }),
      // Carried so the celebration can be thrown in the activity's own colour.
      // A join to a football match and a join to a coffee should not look
      // identical, and the colour is already the thing that tells them apart
      // everywhere else in the app.
      burst: (activity.category || '').toLowerCase(),
    })

    try {
      await pending
      maybeInvitePush(activity)
    } catch (error) {
      // Not routed through `attempt`, because its generic "you do not have
      // permission" is actively misleading here. The rules refuse a join for
      // two reasons a user can understand and act on: somebody took the last
      // place first (a real race — verified to happen), or the host cancelled
      // it underneath them.
      if (error?.code === 'permission-denied') {
        const fresh = allKnownActivities.find((item) => item.id === id) || activity
        const full = (fresh.participants || 0) >= (fresh.capacity || 0)
        const gone = fresh.status === 'removed'
        const off = fresh.status === 'cancelled'
        pushCelebration({
          icon: 'alert',
          tone: 'warning',
          title: full ? t('toasts.lastPlaceTitle') : t('toasts.cannotJoinTitle'),
          // The last case is deliberately vague. The remaining reason a join
          // is refused is that the host has blocked you, and telling someone
          // that is exactly the harm the block list is private to avoid.
          body: full
            ? t('toasts.filledUp', { title: activity.title })
            : gone
              ? t('toasts.removedBySmartSync', { title: activity.title })
              : off
                ? t('toasts.cancelledByHost', { title: activity.title })
                : t('toasts.notOpenToYou', { title: activity.title }),
        })
      } else {
        pushCelebration({
          icon: 'alert',
          tone: 'warning',
          title: t('toasts.joinFailed'),
          body: t('common.pleaseTryAgain'),
        })
      }
      return
    }
  }

  async function leaveActivity(id) {
    const activity = allKnownActivities.find((item) => item.id === id)
    if (!activity || !joinedIds.includes(id)) return
    await attempt(() => leaveActivityDoc(id, uid), {
      failure: t('toasts.leaveFailed'),
      success: {
        icon: 'log-out',
        title: t('toasts.leftTitle'),
        body: t('toasts.leftBody', { title: activity.title }),
      },
    })
  }

  async function cancelActivity(id) {
    const activity = allKnownActivities.find((item) => item.id === id)
    if (!activity || activity.hostId !== uid) return
    const ok = await attempt(() => cancelActivityDoc(id), {
      failure: t('toasts.cancelFailed'),
      success: {
        icon: 'trash',
        tone: 'danger',
        title: t('toasts.cancelledTitle'),
        body: t('toasts.cancelledBody', { title: activity.title }),
      },
    })
    if (ok === null) return

    // Everyone who was going deserves to be told. Queued behind the
    // cancellation if we are offline — Firestore sends a client's writes in
    // order, so the roster the rules check is the one the cancel left.
    ;(activity.participantUids || []).forEach((participantId) =>
      notifyUser(participantId, {
        type: 'activity',
        ...storedText('activityCancelled', { title: activity.title }),
        activityId: id,
      }),
    )
  }

  /**
   * Removes an activity nobody else joined. Cancelling is for activities with
   * other people in them, where the point is that they are told; here there
   * is nobody to tell, so a cancelled tombstone would just be clutter in the
   * host's own history.
   */
  async function removeActivity(id) {
    const activity = allKnownActivities.find((item) => item.id === id)
    if (!activity || activity.hostId !== uid) return
    await attempt(() => deleteActivityDoc(id), {
      failure: t('toasts.deleteFailed'),
      success: {
        icon: 'trash',
        tone: 'danger',
        title: t('toasts.deletedTitle'),
        body: t('toasts.deletedBody', { title: activity.title }),
      },
    })
  }

  async function createActivity(data) {
    if (blockedBySuspension('toasts.whatCreate')) return null
    // The id is minted locally and is on the promise before the server has
    // answered (see createActivity in firebase/activities), which is what
    // lets an offline host reach their new activity's page instead of
    // waiting on "Creating…" for the connection to return.
    let pending
    const outcome = await attempt(
      () => {
        pending = createActivityDoc(user, data)
        return pending
      },
      {
        failure: t(data.picture ? 'pictures.saveError' : 'toasts.createFailed'),
        success: {
          icon: 'check',
          tone: 'success',
          title: t('toasts.createdTitle'),
          body: t('toasts.createdBody', { title: data.title }),
        },
        queued: {
          icon: 'check',
          tone: 'success',
          title: t('toasts.createdQueuedTitle'),
          body: t('toasts.createdQueuedBody', { title: data.title }),
        },
        keep: (write) => ({
          kind: 'activity-create',
          key: uid,
          payload: { ...data, id: write.id },
        }),
      },
    )
    if (outcome === null) return null
    const id = outcome === QUEUED ? pending?.id : outcome
    if (!id) return null
    recordCategoryHistory(uid, user.historyCategories, data.category).catch((error) =>
      reportError('users.recordCategoryHistory', error, { uid }),
    )
    // The promise the Follow button makes, kept from the only place that can
    // keep it: the host's client, which is the one that knows something was
    // posted. Not awaited — the activity exists whether or not anybody could
    // be told — and it never throws. Somebody the host has blocked is not
    // told; the rules would refuse the write anyway, but a refusal is not a
    // thing to attempt on purpose.
    announceToFollowers(
      id,
      storedText('activityPosted', {
        name: user.name,
        title: String(data.title || '').trim(),
        place: String(data.locationName || '').trim(),
        // Who posted, so a push about it can collapse per host rather than
        // stack: public already, on every activity.
        hostId: uid,
      }),
    )
    return id
  }

  // Returns whether the change actually landed, so the caller can decide
  // whether to navigate away. It used to return nothing, and the edit screen
  // navigated regardless — a refused save flashed a toast on the way out and
  // left the page showing the unchanged activity, which reads as the app
  // losing the edit rather than declining it.
  //
  // `before` is the activity as the form was seeded — what the edit set out
  // to change. Kept with the queued write so that, after a reload, a
  // refusal can be told from a newer edit made elsewhere (see
  // firebase/pending.js).
  async function updateActivity(id, updates, { before = null } = {}) {
    const ok = await attempt(() => updateActivityDoc(id, updates), {
      failure: t(updates.picture ? 'pictures.saveError' : 'toasts.editFailed'),
      success: {
        icon: 'check',
        tone: 'success',
        title: t('toasts.savedTitle'),
        body: t('toasts.savedBody'),
      },
      keep: {
        kind: 'activity-edit',
        key: id,
        payload: updates,
        before: before
          ? {
              ...pick(before, EDIT_FIELDS['activity-edit']),
              ...(updates.picture ? { pictureVersion: before.pictureVersion || null } : {}),
            }
          : null,
      },
    })
    return ok !== null
  }

  /**
   * Returns what the write returned, `QUEUED` while offline, or `null` when
   * it was refused — the chat screen restores the text on `null` so a
   * message the rules turned away is not simply gone.
   */
  async function sendMessage(activityId, text) {
    // Nothing to send is nothing to announce: the data layer resolves an
    // empty message without writing, and that used to look like a success
    // here and notify the whole thread about a message that did not exist.
    if (!String(text || '').trim()) return null
    const activity = allKnownActivities.find((item) => item.id === activityId)
    if (blockedBySuspension('toasts.whatMessage')) return null
    const ok = await attempt(() => sendMessageDoc(activityId, user, text), {
      failure: t('toasts.sendFailed'),
      // The bubble is already on screen; a toast per message would be noise.
      queued: null,
      // The composer has already let the text go, so a refusal — now or
      // later — keeps it in the thread's unsent list to retry from.
      keep: (write) => ({
        kind: 'message',
        key: activityId,
        payload: { text: String(text).trim(), id: write?.id ?? null },
        onRefusal: true,
      }),
    })
    if (ok === null || !activity) return ok
    // Bounded: one notification per person per thread per ten minutes,
    // however many messages there are and whoever sends them. See
    // pushChatNotification for how the bucket makes that hold across
    // senders without anybody coordinating.
    for (const participantId of activity.participantUids || []) {
      if (!participantId || participantId === uid) continue
      const recipient = peers.find((peer) => peer.uid === participantId)
      if (recipient?.notificationsEnabled === false) continue
      pushChatNotification(participantId, {
        activityId,
        ...storedText('newMessage', {
          title: activity.title,
          name: user.name,
          text: String(text).slice(0, 80),
        }),
      }).catch((error) => {
        // A refusal is expected: the bucket already has a notification, or
        // they turned notifications off, or they blocked the sender. None of
        // those is a failure of anything.
        if (error?.code === 'permission-denied') return
        reportError('notifications.chat', error, { recipientId: participantId })
      })
    }
    return ok
  }

  // Awaited through `attempt`, like every other write. This one was fired
  // and forgotten, so a refused follow was an unhandled rejection in the
  // console and a "Notifications on" toast on the screen.
  //
  // One write in flight per person. A second tap before the first lands would
  // read the same "not following" and write the same follow again — and the
  // host-side half of a follow may not be rewritten once it exists, so the
  // repeat would be refused and announce a failure for something that worked.
  const followBusyRef = React.useRef(new Set())
  async function toggleUserNotifications(targetUser) {
    if (!targetUser?.uid) return
    if (followBusyRef.current.has(targetUser.uid)) return
    followBusyRef.current.add(targetUser.uid)
    try {
      const alreadyOn = followedUserIds.includes(targetUser.uid)
      if (alreadyOn) {
        await attempt(() => unfollowUser(uid, targetUser.uid), {
          failure: t('toasts.notificationsOffFailed'),
          success: {
            icon: 'bell-off',
            title: t('toasts.notificationsOffTitle'),
            body: t('toasts.notificationsOffBody', { name: targetUser.name }),
          },
        })
        return
      }
      await attempt(() => followUser(uid, targetUser.uid), {
        failure: t('toasts.notificationsOnFailed'),
        success: {
          icon: 'bell',
          title: t('toasts.notificationsOnTitle'),
          body: t('toasts.notificationsOnBody', { name: targetUser.name }),
        },
      })
    } finally {
      followBusyRef.current.delete(targetUser.uid)
    }
  }

  const isFollowingUser = (userId) => followedUserIds.includes(userId)

  // ------------------------------------------------------------- moderation

  async function blockPerson(target) {
    if (!target?.uid || target.uid === uid) return
    await attempt(() => blockUserDoc(uid, target), {
      failure: t('toasts.blockFailed'),
      success: {
        icon: 'alert',
        title: t('toasts.blockedTitle', { name: target.name }),
        body: t('toasts.blockedBody'),
      },
    })
  }

  async function unblockPerson(targetId) {
    const person = blocked.find((b) => b.uid === targetId)
    await attempt(() => unblockUserDoc(uid, targetId), {
      failure: t('toasts.unblockFailed'),
      success: {
        icon: 'check',
        title: t('toasts.unblockedTitle', { name: personName(person?.name) || t('toasts.they') }),
      },
    })
  }

  async function submitReport(report) {
    const ok = await attempt(() => fileReport({ ...report, reporterId: uid }), {
      failure: t('toasts.reportFailed'),
      success: {
        icon: 'check',
        tone: 'success',
        title: t('toasts.reportSentTitle'),
        body: t('toasts.reportSentBody'),
      },
      keep: (write) => ({
        kind: 'report',
        key: report.targetId,
        payload: { ...report, id: write.id },
      }),
    })
    return ok !== null
  }

  /**
   * The context value, rebuilt on every render — deliberately.
   *
   * Every action above is redefined each render, so this object is new each
   * time and every consumer re-renders with the provider. A stable-identity
   * version was built (the actions behind a ref, the exported wrappers
   * dispatching to it) and then reverted: it tripped the hooks lint twenty
   * times over, and measuring consumer renders showed no reduction, because
   * every consumer also reads data that changes on the same renders. The
   * sixteen actions are not wrapped in useCallback for the reason that still
   * holds — they call each other, and one wrong dependency there is a stale
   * closure, which is a far worse bug than a spare render. The trade is
   * recorded in tests/app/appContext.listeners.test.jsx.
   */
  const value = {
    // Signed out is not "still loading" — it is a settled state with no data.
    loading: Boolean(uid) && !activitiesLoaded,
    // The first snapshot usually comes from the cache, which ends `loading`
    // but says nothing about what the server holds. Until the feed has been
    // answered by the server once this session — or the app has stopped
    // waiting for it — an activity the cache does not have is not known to
    // be missing. A notification's link to something posted since the last
    // visit is exactly that case.
    syncing: Boolean(uid) && !feedSynced && !feedWaited && !offline,
    offline,
    // Why, when it is: the device has no connection, or the server has
    // said nothing for long enough (see `serverSilent`). The banner words
    // the two differently, because they are different.
    browserOffline,
    serverSilent,
    dataError,

    activities: visibleActivities,
    recommendations,
    filteredActivities,
    removedActivities,
    // Every activity the listener holds, whatever its status and whoever
    // hosts it — for the moderation screens, which have to be able to see
    // what discovery deliberately hides. Not a new capability: the client
    // already downloaded these, and `visibleActivities` is a product
    // decision about what to surface, never a security boundary. What is
    // private stays private in the rules, not in this filter.
    allActivities: timed,
    peers: visiblePeers,
    // Unfiltered, for the moderation queue only. Blocking must not hide
    // somebody from the person reviewing a report about them — that would be
    // the same hole as blocking the admin to escape moderation, just
    // wearing a name instead of a rule.
    directory,

    joinedIds,
    joinedActivities,
    joinActivity,
    leaveActivity,
    cancelActivity,
    removeActivity,
    createActivity,
    updateActivity,

    threadPreviews,
    sendMessage,

    // Content the server has not accepted — see the note by `unsentState`.
    unsent,
    keepUnsent,
    settleUnsent,
    failUnsent,
    discardUnsent,
    recordFailed,

    notifications,
    unreadCount,
    markNotificationRead: (id) => markReadDoc(uid, id),
    markAllNotificationsRead: () => markAllReadDoc(uid),

    followedUserIds,
    toggleUserNotifications,
    isFollowingUser,

    blocked,
    blockedIds,
    isBlocked: (userId) => blockedIds.has(userId),
    blockPerson,
    unblockPerson,
    submitReport,

    filters,
    setFilters,
    resetFilters: () => setFilters(defaultFilters),

    weights,
    setWeights,
    resetWeights: () => setWeights(recommendationWeights),

    celebration,
    pushCelebration,

    pushInvite,
    dismissPushInvite: () => setPushInvite(null),
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
