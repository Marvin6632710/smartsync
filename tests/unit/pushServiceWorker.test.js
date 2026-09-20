/**
 * The service worker, run against a stand-in for the worker's globals:
 * shows a push unless a SmartSync window is on screen or the push names
 * somebody else, collapses by tag, and a tap goes to the right place —
 * an existing window if there is one, a new one if not.
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const source = readFileSync('public/push-sw.js', 'utf8')

function boot({ windows = [], owner = null, shown = [] } = {}) {
  const listeners = {}
  const cache = {
    match: vi.fn(async (key) =>
      key === '/__smartsync/push-owner' && owner ? { text: async () => owner } : undefined,
    ),
  }
  const self = {
    addEventListener: (type, fn) => {
      listeners[type] = fn
    },
    skipWaiting: vi.fn(),
    location: { origin: 'https://smartsync.test' },
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
    registration: {
      showNotification: vi.fn(async () => {}),
      getNotifications: vi.fn(async () => shown),
    },
  }
  const caches = { open: vi.fn(async () => cache) }
  new Function('self', 'caches', source)(self, caches)
  const push = (data) =>
    new Promise((resolve) => {
      listeners.push({ data: { json: () => ({ data }) }, waitUntil: (p) => resolve(p) })
    })
  const click = (notification) =>
    new Promise((resolve) => {
      listeners.notificationclick({ notification, waitUntil: (p) => resolve(p) })
    })
  return { self, listeners, push, click }
}

const payload = {
  id: 'n1',
  uid: 'alice',
  title: 'New message in Run',
  body: 'Mya sent a message.',
  tag: 'chat-act1',
  lang: 'th',
  url: '/n/n1',
}

describe('push', () => {
  test('is shown, with the tag, the language and the path to open', async () => {
    const { self, push } = boot()
    await push(payload)
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      'New message in Run',
      expect.objectContaining({
        body: 'Mya sent a message.',
        tag: 'chat-act1',
        lang: 'th',
        renotify: false,
        icon: '/icons/notification-192.png',
        data: { url: '/n/n1', id: 'n1', tag: 'chat-act1' },
      }),
    )
  })

  test('is not shown while a SmartSync window is on screen', async () => {
    const { self, push } = boot({ windows: [{ visibilityState: 'visible' }] })
    await push(payload)
    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })

  test('is shown when every window is hidden', async () => {
    const { self, push } = boot({ windows: [{ visibilityState: 'hidden' }] })
    await push(payload)
    expect(self.registration.showNotification).toHaveBeenCalled()
  })

  test('for somebody who is no longer signed in on this device is dropped', async () => {
    const { self, push } = boot({ owner: 'bob' })
    await push(payload)
    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })

  test('with nobody recorded as the owner is still shown', async () => {
    const { self, push } = boot({ owner: null })
    await push(payload)
    expect(self.registration.showNotification).toHaveBeenCalled()
  })

  test('without a title, or unreadable, is ignored', async () => {
    const { self, push, listeners } = boot()
    await push({ body: 'no title' })
    await new Promise((resolve) =>
      listeners.push({
        data: {
          json: () => {
            throw new Error('bad')
          },
        },
        waitUntil: (p) => resolve(p),
      }),
    )
    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })

  test('the envelope FCM wraps it in is unwrapped', async () => {
    const { self, listeners } = boot()
    await new Promise((resolve) =>
      listeners.push({
        data: { json: () => ({ data: payload, from: '123', fcmMessageId: 'm' }) },
        waitUntil: (p) => resolve(p),
      }),
    )
    expect(self.registration.showNotification).toHaveBeenCalled()
  })
})

describe('a tap', () => {
  let notification
  beforeEach(() => {
    notification = { close: vi.fn(), tag: 'chat-act1', data: { url: '/n/n1', id: 'n1' } }
  })

  test('focuses an open window and steers it to the record', async () => {
    const focused = { focused: true, visibilityState: 'visible', focus: vi.fn(), navigate: vi.fn() }
    focused.focus.mockResolvedValue(focused)
    const { self, click } = boot({ windows: [focused] })
    await click(notification)
    expect(notification.close).toHaveBeenCalled()
    expect(focused.navigate).toHaveBeenCalledWith('https://smartsync.test/n/n1')
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  test('prefers the focused window over a merely visible one', async () => {
    const hidden = { visibilityState: 'hidden', focus: vi.fn(), navigate: vi.fn() }
    const focused = { focused: true, visibilityState: 'visible', focus: vi.fn(), navigate: vi.fn() }
    hidden.focus.mockResolvedValue(hidden)
    focused.focus.mockResolvedValue(focused)
    const { click } = boot({ windows: [hidden, focused] })
    await click(notification)
    expect(focused.navigate).toHaveBeenCalled()
    expect(hidden.navigate).not.toHaveBeenCalled()
  })

  test('asks a window it cannot steer to go there itself', async () => {
    const client = { visibilityState: 'hidden', focus: vi.fn(), postMessage: vi.fn() }
    client.focus.mockResolvedValue(client)
    const { click } = boot({ windows: [client] })
    await click(notification)
    expect(client.postMessage).toHaveBeenCalledWith({
      type: 'smartsync:navigate',
      url: 'https://smartsync.test/n/n1',
    })
  })

  test('opens a new window when the app is closed', async () => {
    const { self, click } = boot({ windows: [] })
    await click(notification)
    expect(self.clients.openWindow).toHaveBeenCalledWith('https://smartsync.test/n/n1')
  })

  test('closes every notification under the same tag — the person is about to see them', async () => {
    const sibling = { close: vi.fn() }
    const { self, click } = boot({ windows: [], shown: [sibling] })
    await click(notification)
    expect(self.registration.getNotifications).toHaveBeenCalledWith({ tag: 'chat-act1' })
    expect(sibling.close).toHaveBeenCalled()
  })

  test('with no path goes to the inbox', async () => {
    const { self, click } = boot({ windows: [] })
    await click({ close: vi.fn(), tag: 'x', data: {} })
    expect(self.clients.openWindow).toHaveBeenCalledWith('https://smartsync.test/notifications')
  })
})
