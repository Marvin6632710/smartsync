/**
 * A new profile is made by whichever of two callers gets there first — the
 * sign-up and the auth observer — and never twice. Firestore is faked with
 * a store whose transactions read and write it the way the real ones do:
 * the writes are staged, and a body that finds the document already there
 * writes nothing.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const store = new Map()
// A version per path, so a transaction can tell whether what it read has
// moved by the time it commits — which is what makes two concurrent bodies
// behave the way Firestore's do: the second to commit is re-run and sees
// the first's write.
const versions = new Map()
const versionOf = (path) => versions.get(path) || 0
const write = (path, data) => {
  store.set(path, data)
  versions.set(path, versionOf(path) + 1)
}
const getDoc = vi.fn(async (ref) => ({
  exists: () => store.has(ref.path),
  data: () => store.get(ref.path),
}))
let transactions = 0
const runTransaction = vi.fn(async (_db, body) => {
  transactions += 1
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const staged = []
    const read = new Map()
    const tx = {
      get: async (ref) => {
        read.set(ref.path, versionOf(ref.path))
        // Yield, so two bodies interleave the way two clients' reads do.
        await new Promise((resolve) => setTimeout(resolve, 0))
        return { exists: () => store.has(ref.path), data: () => store.get(ref.path) }
      },
      set: (ref, data) => staged.push([ref.path, data]),
    }
    const result = await body(tx)
    const moved = [...read].some(([path, version]) => versionOf(path) !== version)
    if (moved) continue
    for (const [path, data] of staged) write(path, data)
    return result
  }
  throw new Error('too much contention')
})
vi.mock('firebase/firestore', () => ({
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteField: () => 'DELETE',
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDoc,
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  runTransaction,
  serverTimestamp: () => 'server-time',
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))
vi.mock('../../src/firebase/activities', () => ({
  hostedActivityRefs: vi.fn(),
  hostedActivitiesFromServer: vi.fn(),
  stampHostIdentity: vi.fn(),
}))

const { ensureUserProfile } = await import('../../src/firebase/users')

beforeEach(() => {
  store.clear()
  versions.clear()
  transactions = 0
  getDoc.mockClear()
  runTransaction.mockClear()
})

describe('ensureUserProfile', () => {
  test('makes both halves of a missing profile, with the name, and says it did', async () => {
    await expect(ensureUserProfile('u1', { name: 'Alice', email: 'a@x.y' })).resolves.toBe(true)
    expect(store.get('users/u1')).toMatchObject({
      uid: 'u1',
      name: 'Alice',
      avatar: 'AL',
      username: '@a',
      anonymous: false,
      notificationsEnabled: true,
    })
    expect(store.get('users/u1/private/profile')).toMatchObject({
      email: 'a@x.y',
      realName: 'Alice',
      onboarded: false,
    })
  })

  test('leaves an existing profile alone without a transaction — the cache can answer', async () => {
    write('users/u1', { uid: 'u1', name: 'Kept' })
    await expect(ensureUserProfile('u1', { name: 'Other', email: 'a@x.y' })).resolves.toBe(false)
    expect(runTransaction).not.toHaveBeenCalled()
    expect(store.get('users/u1').name).toBe('Kept')
  })

  test('two callers at once: one makes it, the other finds it, nothing is overwritten', async () => {
    // Both read "missing" before either has written — the interleaving the
    // sign-up and the observer produce — but the transaction re-reads at
    // commit, so the second body finds the first's profile and writes none.
    const [first, second] = await Promise.all([
      ensureUserProfile('u1', { name: 'Typed', email: 'a@x.y' }),
      ensureUserProfile('u1', { name: null, email: 'a@x.y' }),
    ])
    expect([first, second].filter(Boolean)).toHaveLength(1)
    expect(store.get('users/u1').name).toBe('Typed')
    expect(transactions).toBe(2)
  })

  test('a missing name becomes the placeholder, and a long one is cut to what the rules accept', async () => {
    await ensureUserProfile('u1', { name: null, email: 'a@x.y' })
    expect(store.get('users/u1').name).toBe('New user')
    await ensureUserProfile('u2', { name: 'B'.repeat(80), email: 'b@x.y' })
    expect(store.get('users/u2').name).toBe('B'.repeat(60))
  })

  test('a refused transaction is the caller’s to retry — nothing half-written', async () => {
    runTransaction.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(ensureUserProfile('u1', { name: 'A', email: 'a@x.y' })).rejects.toEqual({
      code: 'permission-denied',
    })
    expect(store.has('users/u1')).toBe(false)
    expect(store.has('users/u1/private/profile')).toBe(false)
  })
})
