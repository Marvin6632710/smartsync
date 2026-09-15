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
// Whether the fake read answered from the cache (an offline save) — see
// `partial` on hostedActivityRefs.
let fromCache = false
// What the server holds, for completing a sweep: id → the copy of the name
// and avatar on that activity.
let onServer = []
vi.mock('firebase/firestore', () => ({
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteField: () => 'DELETE',
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
    hostedActivityRefs: vi.fn(async () => {
      const refs = hosted.map((id) => ({ path: `activities/${id}` }))
      refs.partial = fromCache
      return refs
    }),
    hostedActivitiesFromServer: vi.fn(async () =>
      onServer.map(({ id, hostName, hostAvatar }) => ({
        ref: { path: `activities/${id}` },
        hostName,
        hostAvatar,
      })),
    ),
  }
})

const { completeIdentitySweep, setAnonymousMode, updateDisplayName } =
  await import('../../src/firebase/users')

const activities = (n) => Array.from({ length: n }, (_, i) => `a${i}`)
const paths = (batch) => batch.ops.map((o) => o.path)

beforeEach(() => {
  batches.length = 0
  fromCache = false
  onServer = []
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
    // A list from the server is complete, so any note a previous offline
    // save left is cleared in the same batch.
    expect(only.ops[4].data).toEqual({
      privacy: { anonymousMode: true },
      identitySweepPending: 'DELETE',
    })
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
    expect(ops[3].data).toEqual({ realName: 'Bea Smith', identitySweepPending: 'DELETE' })
  })

  test('while anonymous, the real name goes only to the private record', async () => {
    hosted = activities(1)
    await updateDisplayName('u1', 'Bea Smith', true)
    const ops = batches[0].ops
    expect(ops[0].data).toMatchObject({ hostName: 'Anonymous user' })
    expect(ops[1].data).toMatchObject({ name: 'Anonymous user' })
    expect(ops[2].data).toEqual({ realName: 'Bea Smith', identitySweepPending: 'DELETE' })
  })
})

describe('an identity written from the cache', () => {
  // Offline, Firestore answers the "what do I host" query from whatever it
  // holds, which can be a subset. The sweep still goes out — the profile
  // must not wait for a server that is not there — but the profile records
  // that it is unfinished, in the same batch, so the note lands exactly
  // when the partial sweep does and never without it.
  test('stamps what the cache had and notes that the sweep is unfinished', async () => {
    hosted = activities(2)
    fromCache = true
    await setAnonymousMode('u1', true, 'Alice Anderson')
    expect(batches).toHaveLength(1)
    const [only] = batches
    expect(paths(only)).toEqual([
      'activities/a0',
      'activities/a1',
      'users/u1',
      'users/u1/private/profile',
    ])
    expect(only.ops[3].data).toEqual({
      privacy: { anonymousMode: true },
      identitySweepPending: true,
    })
  })

  test('a rename from the cache carries the same note', async () => {
    hosted = []
    fromCache = true
    await updateDisplayName('u1', 'Bea Smith', false)
    expect(batches[0].ops.at(-1).data).toEqual({
      realName: 'Bea Smith',
      identitySweepPending: true,
    })
  })
})

describe('completeIdentitySweep', () => {
  // Once the connection is back, the server's own list is read and only the
  // activities whose copy disagrees with the profile — by construction, the
  // ones the offline sweep never saw — are stamped, with the note cleared in
  // the same batch as the last of them.
  test('stamps only the activities the offline sweep missed, and clears the note with them', async () => {
    onServer = [
      { id: 'a0', hostName: 'Anonymous user', hostAvatar: 'AN' },
      { id: 'a1', hostName: 'Alice Anderson', hostAvatar: 'AA' },
      { id: 'a2', hostName: 'Alice Anderson', hostAvatar: 'AA' },
    ]
    const count = await completeIdentitySweep('u1', { name: 'Anonymous user', avatar: 'AN' })
    expect(count).toBe(2)
    expect(batches).toHaveLength(1)
    expect(paths(batches[0])).toEqual([
      'activities/a1',
      'activities/a2',
      'users/u1/private/profile',
    ])
    expect(batches[0].ops[0].data).toMatchObject({ hostName: 'Anonymous user', hostAvatar: 'AN' })
    expect(batches[0].ops[2].data).toEqual({ identitySweepPending: 'DELETE' })
  })

  test('with nothing stale it only clears the note', async () => {
    onServer = [{ id: 'a0', hostName: 'Bea Smith', hostAvatar: 'BS' }]
    const count = await completeIdentitySweep('u1', { name: 'Bea Smith', avatar: 'BS' })
    expect(count).toBe(0)
    expect(paths(batches[0])).toEqual(['users/u1/private/profile'])
  })

  test('a failure part-way leaves the note in place for the next connection', async () => {
    onServer = Array.from({ length: 700 }, (_, i) => ({
      id: `a${i}`,
      hostName: 'Old',
      hostAvatar: 'OL',
    }))
    writeBatch.mockImplementationOnce(() => {
      const batch = {
        ops: [],
        update: () => {},
        set: () => {},
        commit: () => Promise.reject(new Error('unavailable')),
      }
      batches.push(batch)
      return batch
    })
    await expect(completeIdentitySweep('u1', { name: 'New', avatar: 'NE' })).rejects.toThrow(
      'unavailable',
    )
    expect(batches.some((b) => paths(b).includes('users/u1/private/profile'))).toBe(false)
  })

  test('a server that cannot be reached writes nothing', async () => {
    const { hostedActivitiesFromServer } = await import('../../src/firebase/activities')
    hostedActivitiesFromServer.mockRejectedValueOnce(new Error('unavailable'))
    await expect(completeIdentitySweep('u1', { name: 'New', avatar: 'NE' })).rejects.toThrow(
      'unavailable',
    )
    expect(batches).toHaveLength(0)
  })
})
