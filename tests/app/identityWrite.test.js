/**
 * Anonymous mode and renaming write one change across three kinds of
 * document. These pin how that change is batched, with Firestore faked:
 * the common case is one atomic batch, and the only case that needs more
 * puts the profile last so a failure part-way never claims success.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const batches = []
const writeBatch = vi.fn(() => {
  const ops = []
  const batch = {
    ops,
    update: (ref, data) => ops.push({ op: 'update', path: ref.path, data }),
    set: (ref, data) => ops.push({ op: 'set', path: ref.path, data }),
    commit: vi.fn(() => Promise.resolve()),
  }
  batches.push(batch)
  return batch
})
let hosted = []
vi.mock('firebase/firestore', () => ({
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDoc: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => 'server-time',
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch,
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))
vi.mock('../../src/firebase/activities', async () => {
  const actual = await vi.importActual('../../src/firebase/activities')
  return {
    ...actual,
    hostedActivityRefs: vi.fn(async () => hosted.map((id) => ({ path: `activities/${id}` }))),
  }
})

const { setAnonymousMode, updateDisplayName } = await import('../../src/firebase/users')

const activities = (n) => Array.from({ length: n }, (_, i) => `a${i}`)
const paths = (batch) => batch.ops.map((o) => o.path)

beforeEach(() => {
  batches.length = 0
  writeBatch.mockClear()
})

describe('setAnonymousMode', () => {
  test('profile and activities land in one batch', async () => {
    hosted = activities(3)
    await setAnonymousMode('u1', true, 'Alice Anderson')

    expect(batches).toHaveLength(1)
    const [only] = batches
    expect(paths(only)).toEqual([
      'activities/a0',
      'activities/a1',
      'activities/a2',
      'users/u1',
      'users/u1/private/profile',
    ])
    const stamp = only.ops[0].data
    expect(stamp).toMatchObject({ hostName: 'Anonymous user', hostAvatar: 'AN' })
    expect(only.ops[3].data).toMatchObject({
      name: 'Anonymous user',
      avatar: 'AN',
      anonymous: true,
    })
    expect(only.ops[4].data).toEqual({ privacy: { anonymousMode: true } })
  })

  test('with nothing hosted it is still one batch', async () => {
    hosted = []
    await setAnonymousMode('u1', false, 'Alice Anderson')
    expect(batches).toHaveLength(1)
    expect(paths(batches[0])).toEqual(['users/u1', 'users/u1/private/profile'])
    expect(batches[0].ops[0].data).toMatchObject({ name: 'Alice Anderson', avatar: 'AA' })
  })

  test('the profile shares a batch with up to 498 activities', async () => {
    hosted = activities(498)
    await setAnonymousMode('u1', true, 'A B')
    expect(batches).toHaveLength(1)
    expect(batches[0].ops).toHaveLength(500)
  })

  test('past one batch, activities go first and the profile last', async () => {
    hosted = activities(1000)
    await setAnonymousMode('u1', true, 'A B')

    expect(batches.map((b) => b.ops.length)).toEqual([500, 2, 500])
    // The profile is in the final batch and nowhere else.
    const withProfile = batches.filter((b) => paths(b).includes('users/u1'))
    expect(withProfile).toEqual([batches[batches.length - 1]])
    // Every activity is stamped exactly once.
    const stamped = batches.flatMap(paths).filter((p) => p.startsWith('activities/'))
    expect(new Set(stamped).size).toBe(1000)
  })

  test('a failure before the last batch leaves the profile untouched', async () => {
    hosted = activities(1000)
    writeBatch.mockImplementationOnce(() => {
      const batch = {
        ops: [],
        update: () => {},
        set: () => {},
        commit: () => Promise.reject(new Error('offline')),
      }
      batches.push(batch)
      return batch
    })
    await expect(setAnonymousMode('u1', true, 'A B')).rejects.toThrow('offline')
    expect(batches.some((b) => paths(b).includes('users/u1'))).toBe(false)
  })

  test('a failure reading the activities writes nothing at all', async () => {
    const { hostedActivityRefs } = await import('../../src/firebase/activities')
    hostedActivityRefs.mockRejectedValueOnce(new Error('unavailable'))
    await expect(setAnonymousMode('u1', true, 'A B')).rejects.toThrow('unavailable')
    expect(batches).toHaveLength(0)
  })
})

describe('updateDisplayName', () => {
  test('renames the profile, the private record and every activity together', async () => {
    hosted = activities(2)
    await updateDisplayName('u1', 'Bea Smith', false)
    expect(batches).toHaveLength(1)
    const ops = batches[0].ops
    expect(ops[0].data).toMatchObject({ hostName: 'Bea Smith', hostAvatar: 'BS' })
    expect(ops[2].data).toMatchObject({ name: 'Bea Smith', avatar: 'BS' })
    expect(ops[2].data.anonymous).toBeUndefined()
    expect(ops[3].data).toEqual({ realName: 'Bea Smith' })
  })

  test('while anonymous, the real name goes only to the private record', async () => {
    hosted = activities(1)
    await updateDisplayName('u1', 'Bea Smith', true)
    const ops = batches[0].ops
    expect(ops[0].data).toMatchObject({ hostName: 'Anonymous user' })
    expect(ops[1].data).toMatchObject({ name: 'Anonymous user' })
    expect(ops[2].data).toEqual({ realName: 'Bea Smith' })
  })
})
