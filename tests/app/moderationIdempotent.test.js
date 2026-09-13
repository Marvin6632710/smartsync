/**
 * Moderation actions, repeated.
 *
 * A moderator's first attempt can half-succeed — the takedown lands, the
 * report's resolution is refused — and the honest thing to do then is press
 * the button again. These pin that a repeat changes nothing and, above all,
 * tells nobody twice. Firestore is faked with an in-memory store whose
 * transactions read and write it.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const store = new Map()
const notices = [] // every notification written, in order
const addDoc = vi.fn((ref, data) => {
  notices.push({ path: ref.path, ...data })
  return Promise.resolve({ id: `n${notices.length}` })
})
const writes = []
const runTransaction = vi.fn(async (_db, fn) => {
  const tx = {
    get: async (ref) => ({
      exists: () => store.has(ref.path),
      data: () => store.get(ref.path),
    }),
    update: (ref, data) => {
      writes.push({ path: ref.path, data })
      store.set(ref.path, { ...store.get(ref.path), ...data })
    },
    set: (ref, data, options) => {
      writes.push({ path: ref.path, data })
      store.set(ref.path, options?.merge ? { ...store.get(ref.path), ...data } : data)
    },
  }
  return fn(tx)
})
const getDocs = vi.fn(async () => ({ docs: [] }))

vi.mock('firebase/firestore', () => ({
  addDoc,
  collection: (_db, ...path) => ({ path: path.join('/') }),
  deleteDoc: vi.fn(),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDocs,
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction,
  serverTimestamp: () => 'server-time',
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))
vi.mock('../../src/utils/reportError', () => ({ reportError: vi.fn() }))

const { closeAccount, removeActivity, reopenAccount, restoreActivity, setSuspended, setUserRole } =
  await import('../../src/firebase/moderation')

const removalNotices = () => notices.filter((n) => /removed/i.test(n.title))

beforeEach(() => {
  store.clear()
  notices.length = 0
  writes.length = 0
  store.set('activities/a1', {
    title: 'Football',
    status: 'active',
    hostId: 'host',
    participantUids: ['host', 'p1', 'p2'],
  })
})

describe('removeActivity', () => {
  test('the first time: the record is written and everyone is told', async () => {
    await removeActivity('a1', { moderatorId: 'mod', reason: 'spam' })
    expect(store.get('activities/a1').status).toBe('removed')
    expect(removalNotices().map((n) => n.path)).toEqual([
      'users/host/notifications',
      'users/p1/notifications',
      'users/p2/notifications',
    ])
  })

  test('a second time: nothing is written and nobody is told again', async () => {
    await removeActivity('a1', { moderatorId: 'mod', reason: 'spam' })
    const writesAfterFirst = writes.length
    await removeActivity('a1', { moderatorId: 'mod2', reason: 'again' })
    expect(writes.length).toBe(writesAfterFirst)
    expect(removalNotices()).toHaveLength(3)
    // The first decision's record stands.
    expect(store.get('activities/a1').moderation).toEqual({ by: 'mod', reason: 'spam' })
  })

  test('an activity that no longer exists is left alone', async () => {
    await removeActivity('gone', { moderatorId: 'mod', reason: 'x' })
    expect(writes).toHaveLength(0)
    expect(notices).toHaveLength(0)
  })
})

describe('restoreActivity', () => {
  test('puts a removed activity back and tells the host, once', async () => {
    store.set('activities/a1', { ...store.get('activities/a1'), status: 'removed' })
    await restoreActivity('a1', { adminId: 'admin', reason: 'mistake' })
    await restoreActivity('a1', { adminId: 'admin', reason: 'mistake' })
    expect(store.get('activities/a1').status).toBe('active')
    expect(notices.filter((n) => /back/i.test(n.title))).toHaveLength(1)
  })

  test('does nothing to an activity that was never removed', async () => {
    await restoreActivity('a1', { adminId: 'admin', reason: 'x' })
    expect(writes).toHaveLength(0)
    expect(notices).toHaveLength(0)
  })
})

describe('suspension', () => {
  test('suspending twice tells the person once, and lifting twice likewise', async () => {
    await setSuspended('u', true)
    await setSuspended('u', true)
    expect(store.get('roles/u')).toEqual({ role: 'user', suspended: true })
    expect(notices).toHaveLength(1)
    await setSuspended('u', false)
    await setSuspended('u', false)
    expect(notices).toHaveLength(2)
    expect(notices[1].title).toBe('Your account is active again')
  })

  test('suspending keeps the rank and the closure it found', async () => {
    store.set('roles/u', { role: 'moderator', suspended: false, banned: true })
    await setSuspended('u', true)
    expect(store.get('roles/u')).toEqual({ role: 'moderator', suspended: true, banned: true })
  })
})

describe('rank', () => {
  test('appointing twice tells them once; dismissing twice likewise', async () => {
    await setUserRole('u', 'moderator')
    await setUserRole('u', 'moderator')
    expect(notices).toHaveLength(1)
    expect(notices[0].title).toBe('You are now a moderator')
    await setUserRole('u', 'user')
    await setUserRole('u', 'user')
    expect(notices).toHaveLength(2)
  })

  test('a rank change leaves a suspension exactly as it was', async () => {
    store.set('roles/u', { role: 'user', suspended: true })
    await setUserRole('u', 'moderator')
    expect(store.get('roles/u')).toEqual({ role: 'moderator', suspended: true })
  })
})

describe('closing and reopening', () => {
  test('closing twice writes the notice once', async () => {
    await closeAccount('u', { adminId: 'admin', reason: 'Repeated reports.' })
    await closeAccount('u', { adminId: 'admin', reason: 'Repeated reports.' })
    expect(store.get('roles/u').banned).toBe(true)
    expect(notices.filter((n) => /closed/i.test(n.title))).toHaveLength(1)
  })

  test('a repeat still stands down anything left standing', async () => {
    // The half that may have failed last time.
    await closeAccount('u', { adminId: 'admin', reason: 'x' })
    getDocs.mockClear()
    await closeAccount('u', { adminId: 'admin', reason: 'x' })
    expect(getDocs).toHaveBeenCalledTimes(1)
  })

  test('reopening an open account says nothing', async () => {
    await reopenAccount('u', { reason: 'x' })
    expect(notices).toHaveLength(0)
    store.set('roles/u', { role: 'user', suspended: false, banned: true })
    await reopenAccount('u', { reason: 'Reviewed again.' })
    await reopenAccount('u', { reason: 'Reviewed again.' })
    expect(notices).toHaveLength(1)
    expect(store.get('roles/u').banned).toBe(false)
  })
})
