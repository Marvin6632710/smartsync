/**
 * The follower fan-out, with Firestore replaced by a fake.
 *
 * This is the write that keeps the Follow button's promise, and it runs on
 * the host's phone against other people's inboxes — so what matters is what
 * it does when some of those writes are refused, when the follower list
 * cannot be read at all, and whether running it twice can tell anybody twice.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const setDoc = vi.fn()
const getDocs = vi.fn()
const reportError = vi.fn()

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: (_db, ...path) => ({ path: path.join('/') }),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDoc: vi.fn(),
  getDocs,
  limit: (n) => ({ limit: n }),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: (ref, ...clauses) => ({ ref, clauses }),
  serverTimestamp: () => 'server-time',
  setDoc,
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))
vi.mock('../../src/utils/reportError', () => ({ reportError }))

const { notifyFollowers, FOLLOWER_FANOUT_LIMIT } = await import('../../src/firebase/notifications')

const followers = (...ids) => ({ docs: ids.map((id) => ({ id })) })
const denied = { code: 'permission-denied' }

beforeEach(() => {
  setDoc.mockReset()
  getDocs.mockReset()
  reportError.mockReset()
  setDoc.mockResolvedValue(undefined)
})

describe('notifyFollowers', () => {
  test('writes one notification per follower, addressed by activity', async () => {
    getDocs.mockResolvedValue(followers('f1', 'f2'))
    const outcome = await notifyFollowers('host', 'act9', { title: 'T', body: 'B' })

    expect(outcome).toEqual({ told: 2, declined: 0, failed: 0 })
    expect(setDoc.mock.calls.map(([ref]) => ref.path).sort()).toEqual([
      'users/f1/notifications/follow-act9',
      'users/f2/notifications/follow-act9',
    ])
    const [, data] = setDoc.mock.calls[0]
    expect(data).toMatchObject({ type: 'follow', activityId: 'act9', read: false })
  })

  test('the document id is the activity, so a second run cannot tell anyone twice', async () => {
    // Idempotency is by construction: the rules refuse a `set` on a
    // notification that already exists, and the id is the same each time.
    getDocs.mockResolvedValue(followers('f1'))
    await notifyFollowers('host', 'act9', { title: 'T', body: 'B' })
    await notifyFollowers('host', 'act9', { title: 'T', body: 'B' })
    const ids = setDoc.mock.calls.map(([ref]) => ref.path)
    expect(new Set(ids).size).toBe(1)
  })

  test('a refusal is counted as a decline, not an error', async () => {
    // Notifications off, or the host is blocked — both look like
    // permission-denied from here, and neither is worth a report.
    getDocs.mockResolvedValue(followers('f1', 'f2', 'f3'))
    setDoc
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(denied)
      .mockRejectedValueOnce(new Error('unavailable'))
    const outcome = await notifyFollowers('host', 'a', { title: 'T', body: 'B' })

    expect(outcome).toEqual({ told: 1, declined: 1, failed: 1 })
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError.mock.calls[0][0]).toBe('notifications.followers')
  })

  test('skips the host themselves and anybody they asked to skip', async () => {
    getDocs.mockResolvedValue(followers('host', 'blocked', 'ok'))
    await notifyFollowers('host', 'a', { title: 'T', body: 'B', skip: new Set(['blocked']) })
    expect(setDoc.mock.calls.map(([ref]) => ref.path)).toEqual(['users/ok/notifications/follow-a'])
  })

  test('never throws, even when the follower list cannot be read', async () => {
    getDocs.mockRejectedValue(new Error('offline'))
    await expect(notifyFollowers('host', 'a', { title: 'T', body: 'B' })).resolves.toEqual({
      told: 0,
      declined: 0,
      failed: 0,
    })
    expect(setDoc).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  test('asks for a bounded number of followers', async () => {
    getDocs.mockResolvedValue(followers())
    await notifyFollowers('host', 'a', { title: 'T', body: 'B' })
    const [built] = getDocs.mock.calls[0]
    expect(built.clauses).toContainEqual({ limit: FOLLOWER_FANOUT_LIMIT })
  })

  test('keeps the title and body inside what the rules accept', async () => {
    getDocs.mockResolvedValue(followers('f1'))
    await notifyFollowers('host', 'a', { title: 'x'.repeat(500), body: 'y'.repeat(500) })
    const [, data] = setDoc.mock.calls[0]
    expect(data.title.length).toBe(120)
    expect(data.body.length).toBe(300)
  })
})
