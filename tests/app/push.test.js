// @vitest-environment jsdom
/**
 * This device's side of browser push: the registration written under the
 * person, keyed by the token's hash; the old registration removed when the
 * token changes; everything taken back on sign-out and when the browser
 * withdraws permission; "not now" remembered.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const store = new Map()
const setDoc = vi.fn(async (ref, data) => {
  store.set(ref.path, { ...(store.get(ref.path) || {}), ...data })
})
const deleteDoc = vi.fn(async (ref) => {
  store.delete(ref.path)
})
vi.mock('firebase/firestore', () => ({
  collection: (db, ...segments) => ({ path: segments.join('/') }),
  doc: (db, ...segments) => ({ path: segments.join('/') }),
  onSnapshot: vi.fn(),
  serverTimestamp: () => 'ts',
  setDoc,
  deleteDoc,
}))
vi.mock('../../src/firebase/config', () => ({
  default: { options: { messagingSenderId: '1' } },
  db: {},
  usingEmulators: true,
}))
const reportError = vi.fn()
vi.mock('../../src/utils/reportError', () => ({ reportError }))

const cacheStore = new Map()
const cache = {
  put: vi.fn(async (key, response) => {
    cacheStore.set(key, await response.text())
  }),
  delete: vi.fn(async (key) => cacheStore.delete(key)),
  match: vi.fn(async (key) =>
    cacheStore.has(key) ? new Response(cacheStore.get(key)) : undefined,
  ),
}
globalThis.caches = { open: vi.fn(async () => cache) }

let permission = 'granted'
class FakeNotification {
  static get permission() {
    return permission
  }
  static requestPermission = vi.fn(async () => permission)
}
globalThis.Notification = FakeNotification
globalThis.PushManager = function PushManager() {}
Object.defineProperty(navigator, 'serviceWorker', {
  configurable: true,
  value: { register: vi.fn(async () => ({ scope: '/' })) },
})

const push = await import('../../src/firebase/push')

beforeEach(() => {
  store.clear()
  cacheStore.clear()
  localStorage.clear()
  permission = 'granted'
  vi.clearAllMocks()
})
afterEach(() => {
  localStorage.clear()
})

const tokenDocs = () => [...store.keys()].filter((p) => p.includes('/pushTokens/'))

describe('registerPushDevice', () => {
  test('writes the token under the person, keyed by its hash, and remembers it here', async () => {
    const { hash, refreshed } = await push.registerPushDevice('alice', { language: 'th' })
    expect(refreshed).toBe(true)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenDocs()).toEqual([`users/alice/pushTokens/${hash}`])
    const written = store.get(`users/alice/pushTokens/${hash}`)
    expect(written).toMatchObject({
      language: 'th',
      lastSeenAt: 'ts',
      createdAt: 'ts',
      failures: 0,
    })
    expect(written.token).toMatch(/^emu-/)
    expect(written.token).not.toBe(hash)
    expect(push.registeredHere('alice')).toBe(true)
    expect(push.thisDeviceHash('alice')).toBe(hash)
    expect(cacheStore.get('/__smartsync/push-owner')).toBe('alice')
  })

  test('a second registration the same day is a no-op — two tabs, one document', async () => {
    await push.registerPushDevice('alice')
    setDoc.mockClear()
    const { refreshed } = await push.registerPushDevice('alice')
    expect(refreshed).toBe(false)
    expect(setDoc).not.toHaveBeenCalled()
  })

  test('the next day the registration is touched again, without a new createdAt', async () => {
    await push.registerPushDevice('alice', { now: 1_000_000 })
    setDoc.mockClear()
    await push.registerPushDevice('alice', { now: 1_000_000 + 25 * 60 * 60 * 1000 })
    expect(setDoc).toHaveBeenCalledTimes(1)
    expect(setDoc.mock.calls[0][1]).not.toHaveProperty('createdAt')
    expect(setDoc.mock.calls[0][1]).toHaveProperty('lastSeenAt')
  })

  test('a replaced token removes the old registration', async () => {
    const first = await push.registerPushDevice('alice')
    // The browser hands out a different token next time.
    localStorage.setItem('smartsync:pushEmulatorToken', JSON.stringify('emu-fresh'))
    const second = await push.registerPushDevice('alice', { now: Date.now() + 1 })
    expect(second.hash).not.toBe(first.hash)
    expect(tokenDocs()).toEqual([`users/alice/pushTokens/${second.hash}`])
  })
})

describe('unregisterPushDevice', () => {
  test('takes back the document, the local memory and the owner', async () => {
    await push.registerPushDevice('alice')
    await push.unregisterPushDevice('alice')
    expect(tokenDocs()).toEqual([])
    expect(push.registeredHere('alice')).toBe(false)
    expect(cacheStore.has('/__smartsync/push-owner')).toBe(false)
  })

  test('does nothing for a device registered to somebody else, but still forgets the owner', async () => {
    await push.registerPushDevice('alice')
    await push.unregisterPushDevice('bob')
    expect(tokenDocs()).toHaveLength(1)
    expect(cacheStore.has('/__smartsync/push-owner')).toBe(false)
  })

  test('never throws and never hangs: a refused delete is recorded', async () => {
    await push.registerPushDevice('alice')
    deleteDoc.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'permission-denied' }))
    await expect(push.unregisterPushDevice('alice')).resolves.toBeUndefined()
    expect(reportError).toHaveBeenCalledWith(
      'push.unregister',
      expect.any(Error),
      expect.any(Object),
    )
  })
})

describe('syncPushDevice', () => {
  test('refreshes a registered device on start', async () => {
    await push.registerPushDevice('alice', { now: 1 })
    setDoc.mockClear()
    await push.syncPushDevice('alice', { language: 'my' })
    expect(setDoc).toHaveBeenCalledTimes(1)
    expect(setDoc.mock.calls[0][1].language).toBe('my')
  })

  test('takes the registration back when the browser withdrew permission', async () => {
    await push.registerPushDevice('alice')
    permission = 'denied'
    await push.syncPushDevice('alice')
    expect(tokenDocs()).toEqual([])
    expect(push.registeredHere('alice')).toBe(false)
  })

  test('never asks, and follows the signed-in person as the owner', async () => {
    permission = 'default'
    await push.syncPushDevice('alice')
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
    expect(tokenDocs()).toEqual([])
    expect(cacheStore.get('/__smartsync/push-owner')).toBe('alice')
  })

  test('another account’s registration on this device is not touched, but the owner moves', async () => {
    await push.registerPushDevice('alice')
    await push.syncPushDevice('bob')
    expect(tokenDocs()).toHaveLength(1)
    expect(cacheStore.get('/__smartsync/push-owner')).toBe('bob')
  })
})

describe('permission', () => {
  test('"not now" is remembered for a month, and a refusal counts as one', async () => {
    expect(push.recentlyDeclined()).toBe(false)
    push.rememberDeclined(1000)
    expect(push.recentlyDeclined(1000 + push.DECLINE_HOLD_MS - 1)).toBe(true)
    expect(push.recentlyDeclined(1000 + push.DECLINE_HOLD_MS + 1)).toBe(false)
    localStorage.clear()
    permission = 'denied'
    expect(await push.requestPermission()).toBe('denied')
    expect(push.recentlyDeclined()).toBe(true)
  })

  test('a device can be removed from the list; this one is taken back in full', async () => {
    const { hash } = await push.registerPushDevice('alice')
    store.set('users/alice/pushTokens/other', { token: 'x' })
    await push.removePushDevice('alice', 'other')
    expect(tokenDocs()).toEqual([`users/alice/pushTokens/${hash}`])
    await push.removePushDevice('alice', hash)
    expect(tokenDocs()).toEqual([])
    expect(push.registeredHere('alice')).toBe(false)
  })
})

describe('deviceLabel', () => {
  test.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      'Chrome · macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
      'Edge · Windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox · Linux'],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
  ])('%s', (ua, label) => {
    expect(push.deviceLabel(ua)).toBe(label)
  })
})
