/**
 * The inbox's data layer, with Firestore faked.
 *
 * What it covers is what changed: chat notifications are bounded by a
 * per-thread bucket; mark-all-read survives more than one batch's worth;
 * and moderation notices stay in the inbox however busy the rest of it is.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const setDoc = vi.fn(() => Promise.resolve())
const getDocs = vi.fn()
const batches = []
const writeBatch = vi.fn(() => {
  const batch = {
    ops: [],
    update: (ref) => batch.ops.push(ref.path),
    commit: vi.fn(() => Promise.resolve()),
  }
  batches.push(batch)
  return batch
})
const listeners = []
const onSnapshot = vi.fn((q, cb, onError) => {
  listeners.push({ q, cb, onError })
  return () => {}
})
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: (_db, ...path) => ({ path: path.join('/') }),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDoc: vi.fn(),
  getDocs,
  limit: (n) => ({ limit: n }),
  onSnapshot,
  orderBy: (field, dir) => ({ orderBy: field, dir }),
  query: (ref, ...clauses) => ({ ref, clauses }),
  serverTimestamp: () => 'server-time',
  setDoc,
  updateDoc: vi.fn(),
  where: (field, op, value) => ({ where: field, op, value }),
  writeBatch,
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))
vi.mock('../../src/utils/reportError', () => ({ reportError: vi.fn() }))

const { markAllNotificationsRead, watchNotifications } =
  await import('../../src/firebase/notifications')

beforeEach(() => {
  setDoc.mockClear()
  getDocs.mockReset()
  writeBatch.mockClear()
  batches.length = 0
  listeners.length = 0
})

// Chat notifications are written by the moderation Function now, with the
// same ten-minute bucket in its own document id — a notice about a message
// may only exist once that message has been approved (ADR-033). Covered in
// tests/unit/chatServer.test.js.

describe('markAllNotificationsRead', () => {
  const unread = (n) => ({
    empty: n === 0,
    docs: Array.from({ length: n }, (_, i) => ({ ref: { path: `n${i}` } })),
  })

  test('asks only for what is unread', async () => {
    getDocs.mockResolvedValue(unread(0))
    await markAllNotificationsRead('u')
    const [built] = getDocs.mock.calls[0]
    expect(built.clauses).toContainEqual({ where: 'read', op: '==', value: false })
    expect(writeBatch).not.toHaveBeenCalled()
  })

  test('twelve hundred unread take three batches, none over five hundred', async () => {
    // One batch used to carry every row, and past five hundred it was
    // refused outright — for exactly the people who needed the button.
    getDocs.mockResolvedValue(unread(1200))
    await markAllNotificationsRead('u')
    expect(batches.map((b) => b.ops.length)).toEqual([500, 500, 200])
    expect(new Set(batches.flatMap((b) => b.ops)).size).toBe(1200)
    batches.forEach((b) => expect(b.commit).toHaveBeenCalledTimes(1))
  })

  test('a batch that fails stops there and says so', async () => {
    getDocs.mockResolvedValue(unread(700))
    writeBatch.mockImplementationOnce(() => {
      const batch = {
        ops: [],
        update: () => {},
        commit: () => Promise.reject(new Error('offline')),
      }
      batches.push(batch)
      return batch
    })
    await expect(markAllNotificationsRead('u')).rejects.toThrow('offline')
    expect(batches).toHaveLength(1)
  })
})

describe('watchNotifications', () => {
  const snap = (rows) => ({
    docs: rows.map(([id, createdAt, type]) => ({
      id,
      data: () => ({
        type,
        title: id,
        body: '',
        read: false,
        createdAt: { toMillis: () => createdAt },
      }),
    })),
  })

  test('opens two listeners: the newest of everything, and the newest moderation notices', () => {
    watchNotifications('u', () => {})
    expect(listeners).toHaveLength(2)
    const clauses = listeners.map((l) => l.q.clauses)
    expect(clauses.some((c) => c.some((x) => x.where === 'type' && x.value === 'moderation'))).toBe(
      true,
    )
  })

  test('a moderation notice pushed out of the newest fifty is still in the list', () => {
    const rows = []
    watchNotifications('u', (list) => rows.splice(0, rows.length, ...list))
    const [latest, safety] = listeners
    latest.cb(
      snap([
        ['chat-9', 900, 'chat'],
        ['chat-8', 800, 'chat'],
      ]),
    )
    safety.cb(snap([['suspended', 100, 'moderation']]))
    expect(rows.map((r) => r.id)).toEqual(['chat-9', 'chat-8', 'suspended'])
  })

  test('a notice present in both is listed once', () => {
    const rows = []
    watchNotifications('u', (list) => rows.splice(0, rows.length, ...list))
    const [latest, safety] = listeners
    latest.cb(
      snap([
        ['removed', 900, 'moderation'],
        ['chat-8', 800, 'chat'],
      ]),
    )
    safety.cb(snap([['removed', 900, 'moderation']]))
    expect(rows.map((r) => r.id)).toEqual(['removed', 'chat-8'])
  })

  test('a failure on the safety listener is recorded and the inbox carries on', async () => {
    const onError = vi.fn()
    const rows = []
    watchNotifications('u', (list) => rows.splice(0, rows.length, ...list), onError)
    const [latest, safety] = listeners
    safety.onError({ code: 'failed-precondition', message: 'needs an index' })
    latest.cb(snap([['chat-9', 900, 'chat']]))
    expect(onError).not.toHaveBeenCalled()
    expect(rows.map((r) => r.id)).toEqual(['chat-9'])
    const { reportError } = await import('../../src/utils/reportError')
    expect(reportError).toHaveBeenCalledWith(
      'notifications.safety',
      expect.objectContaining({ code: 'failed-precondition' }),
      { uid: 'u' },
    )
  })

  test('a denial on the safety listener is left to the main one', async () => {
    const onError = vi.fn()
    watchNotifications('u', () => {}, onError)
    const [, safety] = listeners
    const { reportError } = await import('../../src/utils/reportError')
    reportError.mockClear()
    safety.onError({ code: 'permission-denied' })
    expect(onError).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
  })

  test('stopping stops both', () => {
    const stops = [vi.fn(), vi.fn()]
    onSnapshot.mockImplementationOnce(() => stops[0]).mockImplementationOnce(() => stops[1])
    const stop = watchNotifications('u', () => {})
    stop()
    stops.forEach((s) => expect(s).toHaveBeenCalledTimes(1))
  })
})
