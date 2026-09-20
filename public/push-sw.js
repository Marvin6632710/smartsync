/*
 * SmartSync's service worker: shows a push, and opens the app when it is
 * tapped. Nothing else — no caching, no Firestore, no Auth, no imports.
 *
 * A push is a data-only message from the Cloud Function: the record's id,
 * the words already in the reader's language, a tag to collapse repeats
 * under, and the path to open. This worker draws it — unless a SmartSync
 * window is on screen, in which case the app is already showing the same
 * record and one banner is enough. A tap focuses that window if there is
 * one and opens the record's path, where the app marks it read the way
 * it marks any notification read.
 *
 * Served as-is from /public, so it is the same file in development and in
 * production, and the site's script policy has nothing to allow.
 */

const OWNER_KEY = '/__smartsync/push-owner'
const CACHE = 'smartsync-push'
const ICON = '/icons/notification-192.png'
const BADGE = '/icons/badge-96.png'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(readPayload(event)))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openFor(event.notification.data || {}, event.notification.tag))
})

/** The data map, whatever envelope FCM wrapped it in. */
function readPayload(event) {
  try {
    const raw = event.data ? event.data.json() : null
    if (!raw) return null
    return raw.data && typeof raw.data === 'object' ? raw.data : raw
  } catch {
    return null
  }
}

/** Whose device this is, as the app last said; null if nobody signed in. */
async function currentOwner() {
  try {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(OWNER_KEY)
    return hit ? (await hit.text()) || null : null
  } catch {
    return null
  }
}

/** Whether any SmartSync window is on screen right now. */
async function appOnScreen() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  return windows.some((client) => client.visibilityState === 'visible')
}

async function handlePush(data) {
  if (!data || !data.title) return
  // A push for somebody who is no longer the person on this device is
  // dropped: a token that outlived a sign-out must not show the next
  // person the last one's chat.
  if (data.uid) {
    const owner = await currentOwner()
    if (owner && owner !== data.uid) return
  }
  if (await appOnScreen()) return
  const tag = data.tag || data.id || 'smartsync'
  await self.registration.showNotification(data.title, {
    body: data.body || '',
    icon: ICON,
    badge: BADGE,
    tag,
    renotify: false,
    lang: data.lang || 'en',
    data: { url: data.url || '/notifications', id: data.id || null, tag },
  })
}

async function openFor(data, tag) {
  const url = new URL(data.url || '/notifications', self.location.origin).href
  // Everything else under the same tag is the same thread or activity, and
  // the person is about to see it.
  if (tag) {
    const open = await self.registration.getNotifications({ tag })
    open.forEach((notification) => notification.close())
  }
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const existing =
    windows.find((client) => client.focused) ||
    windows.find((client) => client.visibilityState === 'visible') ||
    windows[0]
  if (existing) {
    try {
      const focused = 'focus' in existing ? await existing.focus() : existing
      if (focused && 'navigate' in focused) {
        await focused.navigate(url)
        return
      }
      existing.postMessage({ type: 'smartsync:navigate', url })
      return
    } catch {
      // Fall through to a new window.
    }
  }
  await self.clients.openWindow(url)
}
