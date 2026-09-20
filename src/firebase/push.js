import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'

import app, { db, usingEmulators } from './config'
import { loadStorage, saveStorage } from '../utils/storage'
import { reportError } from '../utils/reportError'

/**
 * Browser push, from this device's side.
 *
 * A push is a courtesy copy of an inbox record, sent by the Cloud Function
 * to every device a person has registered. This module is the registering:
 * it asks the browser for permission (only ever when asked to, never on
 * load), turns the browser's subscription into an FCM token, and files the
 * token under the person as `users/{uid}/pushTokens/{hash}` — readable and
 * deletable by them alone. It also takes the token back: on sign-out, when
 * the browser turns out to have withdrawn permission, and when the token
 * is replaced.
 *
 * Under the emulator there is no FCM to talk to, so the token is a stand-in
 * that stays stable for this browser; everything else — the permission,
 * the service worker, the document, the Settings page, the Function's own
 * bookkeeping — runs exactly as it does in production.
 */

/** The service worker, at the root so its scope is the whole site. */
export const SERVICE_WORKER_URL = '/push-sw.js'

/** What this device registered, so it can be refreshed or taken back. */
const LOCAL_KEY = 'smartsync:push'
/** When the person last said "not now", so they are not asked again soon. */
const DECLINED_KEY = 'smartsync:pushDeclined'
/** How long "not now" holds. */
export const DECLINE_HOLD_MS = 30 * 24 * 60 * 60 * 1000
/** How often `lastSeenAt` is refreshed on a token that has not changed. */
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || ''

const tokensRef = (uid) => collection(db, 'users', uid, 'pushTokens')
const tokenDoc = (uid, hash) => doc(db, 'users', uid, 'pushTokens', hash)

// ------------------------------------------------------------ support ----

/**
 * Whether this browser can do push at all, and if not, the reason the
 * Settings page should give: 'ios' for Safari on an iPhone or iPad that has
 * not been added to the Home Screen (the one case with a remedy), otherwise
 * 'unsupported'.
 */
export function pushSupport() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported'
  const hasApis =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (hasApis) return usingEmulators || configured() ? 'ok' : 'unconfigured'
  const ua = navigator.userAgent || ''
  const iosLike =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return iosLike ? 'ios' : 'unsupported'
}

function configured() {
  return Boolean(VAPID_KEY && app.options?.messagingSenderId)
}

/** 'default' | 'granted' | 'denied', or 'unsupported'. */
export function permissionState() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

// --------------------------------------------------------- this device ----

function localRecord() {
  return loadStorage(LOCAL_KEY, null)
}

function rememberLocal(record) {
  saveStorage(LOCAL_KEY, record)
}

function forgetLocal() {
  try {
    localStorage.removeItem(LOCAL_KEY)
  } catch {
    // Nothing to forget.
  }
}

/** Whether this device is registered for the given person. */
export function registeredHere(uid) {
  const record = localRecord()
  return Boolean(record && record.uid === uid && record.hash)
}

/** The hash of this device's token, if any — what the Settings list marks as "this device". */
export function thisDeviceHash(uid) {
  const record = localRecord()
  return record && record.uid === uid ? record.hash : null
}

export function recentlyDeclined(now = Date.now()) {
  const at = loadStorage(DECLINED_KEY, 0)
  return typeof at === 'number' && now - at < DECLINE_HOLD_MS
}

export function rememberDeclined(now = Date.now()) {
  saveStorage(DECLINED_KEY, now)
}

/**
 * Asks the browser. Only ever from a click: a prompt on page load is the
 * fastest way to be refused for good.
 */
export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  const result = await Notification.requestPermission()
  if (result !== 'granted') rememberDeclined()
  return result
}

// ----------------------------------------------------- service worker ----

let registrationPromise = null

/**
 * The service worker, registered once per page. Registered lazily — from
 * the first push action, not at boot — so it never competes with the app
 * for the first paint.
 */
export function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.reject(new Error('no service worker'))
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SERVICE_WORKER_URL)
      .then((registration) => registration)
      .catch((error) => {
        registrationPromise = null
        throw error
      })
  }
  return registrationPromise
}

/**
 * Tells the service worker whose device this is now.
 *
 * A push names its recipient; the worker shows it only if that is the
 * person signed in on this device, so a token that outlived a sign-out
 * (the network was down when the token was being deleted) cannot show one
 * person's chat to the next person at the keyboard. Kept in the Cache
 * API because both the page and the worker can read it.
 */
export async function setPushOwner(uid) {
  if (typeof caches === 'undefined') return
  try {
    const cache = await caches.open('smartsync-push')
    if (uid) await cache.put('/__smartsync/push-owner', new Response(uid))
    else await cache.delete('/__smartsync/push-owner')
  } catch {
    // The guard is a belt over the braces of deleting the token.
  }
}

// ------------------------------------------------------------- tokens ----

async function hashToken(token) {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A stand-in token under the emulator, stable for this browser. */
function emulatorToken() {
  const existing = loadStorage('smartsync:pushEmulatorToken', '')
  if (existing) return existing
  const fresh = `emu-${crypto.randomUUID()}`
  saveStorage('smartsync:pushEmulatorToken', fresh)
  return fresh
}

async function messagingModule() {
  return import('firebase/messaging')
}

/** The FCM token for this browser, minting or refreshing it. */
async function currentToken() {
  if (usingEmulators) {
    // The worker is still registered, so a push shown by hand (DevTools'
    // push simulator) exercises the same code as a real one.
    await ensureServiceWorker().catch(() => {})
    return emulatorToken()
  }
  const registration = await ensureServiceWorker()
  const { getMessaging, getToken, isSupported } = await messagingModule()
  if (!(await isSupported())) throw new Error('push unsupported')
  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  })
  if (!token) throw new Error('no token')
  return token
}

/** A short name for the device, for the Settings list. */
export function deviceLabel(ua = navigator.userAgent || '') {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser'
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} · ${os}` : browser
}

function platform(ua = navigator.userAgent || '') {
  return /iPhone|iPad|iPod|Android/.test(ua) ? 'mobile' : 'desktop'
}

/**
 * Registers this device for the person, or refreshes its registration.
 *
 * Idempotent: two tabs doing this at once write the same document. A token
 * that has changed since last time (the browser re-subscribed) replaces
 * the old document rather than sitting beside it. `lastSeenAt` is touched
 * at most once a day, so the token doc does not become a write per visit.
 */
export async function registerPushDevice(uid, { language, now = Date.now() } = {}) {
  const token = await currentToken()
  const hash = await hashToken(token)
  const previous = localRecord()
  const sameDevice = previous && previous.uid === uid && previous.hash === hash
  if (sameDevice && now - (previous.seenAt || 0) < TOUCH_INTERVAL_MS)
    return { hash, refreshed: false }

  const fields = {
    token,
    lastSeenAt: serverTimestamp(),
    label: deviceLabel(),
    platform: platform(),
    failures: 0,
  }
  if (language) fields.language = language
  try {
    fields.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    // Left out; the Function falls back to the profile's.
  }
  await setDoc(
    tokenDoc(uid, hash),
    sameDevice ? fields : { ...fields, createdAt: serverTimestamp() },
    {
      merge: true,
    },
  )
  // The token was replaced: the old document would otherwise be sent to
  // until the Function found it dead.
  if (previous && previous.uid === uid && previous.hash && previous.hash !== hash) {
    await deleteDoc(tokenDoc(uid, previous.hash)).catch(() => {})
  }
  rememberLocal({ uid, hash, seenAt: now })
  await setPushOwner(uid)
  return { hash, refreshed: true }
}

/**
 * On every start: keep a registered device registered, and notice when
 * the browser has withdrawn permission behind the app's back. Never asks.
 */
export async function syncPushDevice(uid, { language } = {}) {
  if (!uid || pushSupport() !== 'ok') return
  const record = localRecord()
  if (!record || record.uid !== uid) {
    // Somebody else's registration on this device, or none: the owner
    // guard follows the person signed in, whatever the token doc says.
    await setPushOwner(uid)
    return
  }
  if (permissionState() !== 'granted') {
    // Revoked in the browser's own settings. The document would otherwise
    // be sent to forever; take it back and forget the device.
    await unregisterPushDevice(uid, { reason: 'permission-revoked' })
    return
  }
  try {
    await registerPushDevice(uid, { language })
  } catch (error) {
    reportError('push.sync', error, { uid })
  }
}

/**
 * Takes this device back: the document, the browser's subscription, and
 * the local memory of both. Best-effort, bounded, never throws — it runs
 * on the way out of a sign-out, and a sign-out must not hang on the
 * network.
 */
export async function unregisterPushDevice(uid, { reason = 'user', timeoutMs = 4000 } = {}) {
  const record = localRecord()
  forgetLocal()
  await setPushOwner(null)
  if (!record || (uid && record.uid !== uid)) return
  const work = (async () => {
    await deleteDoc(tokenDoc(record.uid, record.hash))
    if (!usingEmulators) {
      const { getMessaging, deleteToken } = await messagingModule()
      await deleteToken(getMessaging(app))
    }
  })()
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, timeoutMs))]).catch(
    (error) => reportError('push.unregister', error, { uid: record.uid, reason }),
  )
}

/** Removes any registered device from the Settings list; this one too, if it is this one. */
export async function removePushDevice(uid, hash) {
  if (thisDeviceHash(uid) === hash) {
    await unregisterPushDevice(uid, { reason: 'removed' })
    return
  }
  await deleteDoc(tokenDoc(uid, hash))
}

/** The person's registered devices, live, newest first. */
export function watchPushDevices(uid, callback, onError) {
  return onSnapshot(
    tokensRef(uid),
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          label: data.label || 'Browser',
          platform: data.platform || 'desktop',
          language: data.language || null,
          createdAt: data.createdAt?.toMillis?.() ?? 0,
          lastSeenAt: data.lastSeenAt?.toMillis?.() ?? 0,
        }
      })
      callback(rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt))
    },
    onError,
  )
}
