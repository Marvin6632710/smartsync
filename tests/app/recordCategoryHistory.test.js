/**
 * The history signal is appended with a server-side union, never rewritten
 * from the client's copy of the list. See the note on recordCategoryHistory.
 */
import { beforeEach, expect, test, vi } from 'vitest'

const updateDoc = vi.fn(() => Promise.resolve())
const arrayUnion = vi.fn((...items) => ({ __union: items }))
vi.mock('firebase/firestore', () => ({
  arrayUnion,
  collection: vi.fn(),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDoc: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => 'server-time',
  setDoc: vi.fn(),
  updateDoc,
  writeBatch: vi.fn(),
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))
vi.mock('../../src/firebase/activities', () => ({
  hostedActivityRefs: vi.fn(),
  stampHostIdentity: vi.fn(),
}))

const { recordCategoryHistory } = await import('../../src/firebase/users')

// Braces matter: a hook that returns the mock hands vitest a "cleanup"
// function, and vitest then calls the mock itself after every test.
beforeEach(() => {
  updateDoc.mockClear()
})

test('appends with a union rather than replacing the list', async () => {
  await recordCategoryHistory('u1', ['Football'], 'Coffee')
  expect(updateDoc).toHaveBeenCalledTimes(1)
  const [ref, patch] = updateDoc.mock.calls[0]
  expect(ref.path).toBe('users/u1')
  expect(patch.historyCategories).toEqual({ __union: ['Coffee'] })
  expect(patch.updatedAt).toBe('server-time')
})

test('two joins before the profile refreshes both append — neither rewrites', async () => {
  const stale = ['Football']
  await recordCategoryHistory('u1', stale, 'Coffee')
  await recordCategoryHistory('u1', stale, 'Gym')
  const patches = updateDoc.mock.calls.map(([, p]) => p.historyCategories)
  expect(patches).toEqual([{ __union: ['Coffee'] }, { __union: ['Gym'] }])
})

test('a category already recorded is not written again', async () => {
  await recordCategoryHistory('u1', ['Coffee'], 'Coffee')
  await recordCategoryHistory('u1', undefined, '')
  expect(updateDoc).not.toHaveBeenCalled()
})
