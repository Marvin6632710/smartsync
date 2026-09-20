/**
 * The activity data layer's pure corners, with Firestore faked.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const updateDoc = vi.fn(() => Promise.resolve())
const setDoc = vi.fn(() => Promise.resolve())
const onSnapshot = vi.fn(() => () => {})
const batches = []
const writeBatch = () => {
  const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) }
  batches.push(batch)
  return batch
}
let minted = 0
vi.mock('firebase/firestore', () => ({
  arrayRemove: vi.fn(),
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  // A path when given one; a freshly minted id when asked for a new document
  // in a collection, the way `doc(collectionRef)` mints one.
  doc: (_db, ...path) => (path.length ? { path: path.join('/') } : { id: `minted-${++minted}` }),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot,
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => 'server-time',
  setDoc,
  Timestamp: { fromDate: (d) => ({ ms: d.getTime() }), fromMillis: (ms) => ({ ms }) },
  updateDoc,
  where: vi.fn(),
  writeBatch,
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))

const { createActivity, deriveTimeBand, updateActivity, watchActivities, watchMyActivities } =
  await import('../../src/firebase/activities')

beforeEach(() => {
  batches.length = 0
  updateDoc.mockClear()
  setDoc.mockReset()
  setDoc.mockImplementation(() => Promise.resolve())
})

describe('createActivity', () => {
  const host = { uid: 'h', name: 'Host', avatar: 'HO' }
  const draft = {
    title: 'Run',
    description: 'x',
    category: 'Running',
    locationName: 'Park',
    lat: 13.7,
    lng: 100.5,
    date: '2030-01-01',
    time: '07:00',
    capacity: 6,
  }

  test('the id is known before the server answers, and is what the promise resolves with', async () => {
    let ack
    setDoc.mockImplementation(() => new Promise((resolve) => (ack = resolve)))
    const pending = createActivity(host, draft)
    // Minted locally: available while the write is still in flight.
    expect(pending.id).toMatch(/^minted-/)
    let resolved = null
    pending.then((id) => (resolved = id))
    await Promise.resolve()
    expect(resolved).toBeNull()
    ack()
    expect(await pending).toBe(pending.id)
  })

  test('it is a create of the whole document, host first on the roster', async () => {
    await createActivity(host, draft)
    const [, payload] = setDoc.mock.calls[0]
    expect(payload).toMatchObject({
      hostId: 'h',
      participantUids: ['h'],
      status: 'active',
      timeBand: 'Morning',
      capacity: 6,
    })
    expect(payload.startsAt).toEqual({ ms: new Date('2030-01-01T07:00').getTime() })
  })

  test('a refusal rejects the promise the caller holds', async () => {
    setDoc.mockImplementation(() => Promise.reject({ code: 'permission-denied' }))
    await expect(createActivity(host, draft)).rejects.toEqual({ code: 'permission-denied' })
  })
})

describe('deriveTimeBand', () => {
  test('the three bands, at their edges', () => {
    expect(deriveTimeBand('00:00')).toBe('Morning')
    expect(deriveTimeBand('11:59')).toBe('Morning')
    expect(deriveTimeBand('12:00')).toBe('Afternoon')
    expect(deriveTimeBand('16:59')).toBe('Afternoon')
    expect(deriveTimeBand('17:00')).toBe('Evening')
    expect(deriveTimeBand('23:59')).toBe('Evening')
    expect(deriveTimeBand('9:05')).toBe('Morning')
  })

  test('nothing, or nonsense, is the evening default — never "Morning" by accident', () => {
    // `Number('')` is 0, so an emptied time field used to parse as midnight.
    expect(deriveTimeBand('')).toBe('Evening')
    expect(deriveTimeBand(undefined)).toBe('Evening')
    expect(deriveTimeBand('::')).toBe('Evening')
    expect(deriveTimeBand('abc')).toBe('Evening')
    expect(deriveTimeBand('25:00')).toBe('Evening')
  })
})

describe('updateActivity', () => {
  test('moving date and time together recomputes the instant', async () => {
    await updateActivity('a1', { date: '2030-05-05', time: '09:30' })
    const [, patch] = updateDoc.mock.calls[0]
    expect(patch.timeBand).toBe('Morning')
    expect(patch.startsAt).toEqual({ ms: new Date('2030-05-05T09:30').getTime() })
  })

  test('an edit that touches neither leaves the instant alone', async () => {
    await updateActivity('a1', { title: 'Renamed', capacity: '12' })
    const [, patch] = updateDoc.mock.calls[0]
    expect(patch.startsAt).toBeUndefined()
    expect(patch.capacity).toBe(12)
  })

  test('moving one without the other is refused, loudly', async () => {
    // It used to leave `startsAt` where it was — silently — so the feed kept
    // showing the old day. The one caller sends both; a future one that does
    // not should find out here.
    await expect(updateActivity('a1', { date: '2030-05-05' })).rejects.toThrow(/together/)
    await expect(updateActivity('a1', { time: '' })).rejects.toThrow(/together/)
    expect(updateDoc).not.toHaveBeenCalled()
  })
})

describe('the two activity feeds', () => {
  // `pendingWrite` comes from snapshot metadata, and a write being accepted
  // is a metadata-only change. A feed that does not ask for those would leave
  // an activity marked pending forever — and its chat gated behind it.
  const optionsOf = (call) =>
    call.find((arg) => arg && typeof arg === 'object' && 'includeMetadataChanges' in arg)

  test('both ask to be told when a pending write lands', () => {
    onSnapshot.mockClear()
    watchActivities(
      () => {},
      () => {},
    )
    watchMyActivities(
      'me',
      () => {},
      () => {},
    )
    expect(onSnapshot).toHaveBeenCalledTimes(2)
    for (const call of onSnapshot.mock.calls) {
      expect(optionsOf(call)).toEqual({ includeMetadataChanges: true })
    }
  })

  test('a row carries whether its write is still in flight', () => {
    onSnapshot.mockClear()
    const rows = []
    watchMyActivities(
      'me',
      (list) => rows.push(...list),
      () => {},
    )
    const [, , handler] = onSnapshot.mock.calls[0]
    const doc = (pending) => ({
      id: 'a1',
      metadata: { hasPendingWrites: pending },
      data: () => ({ title: 'x', participantUids: ['me'], startsAt: null }),
    })
    handler({ docs: [doc(true)] })
    handler({ docs: [doc(false)] })
    expect(rows.map((r) => r.pendingWrite)).toEqual([true, false])
  })
})

const photo = { version: 'photo-v1', dataUrl: 'data:image/png;base64,aGVsbG8=' }

test('an activity picture and its parent are created in one batch with the local id preserved', async () => {
  const pending = createActivity(
    { uid: 'host', name: 'Host', avatar: 'HO' },
    {
      title: 'Photo activity',
      date: '2030-01-01',
      time: '07:00',
      picture: photo,
    },
  )
  expect(pending.id).toMatch(/^minted-/)
  expect(await pending).toBe(pending.id)
  expect(setDoc).not.toHaveBeenCalled()
  expect(batches[0].set.mock.calls[0][1]).toMatchObject({ pictureVersion: photo.version })
  expect(batches[0].set.mock.calls[0][1].picture).toBeUndefined()
  expect(batches[0].set.mock.calls[1][0].path).toBe(`activityPictures/${pending.id}`)
  expect(batches[0].set.mock.calls[1][1]).toMatchObject(photo)
})

test('a replacement is atomic, and an edit without a selection never changes the picture marker', async () => {
  await updateActivity('a1', { title: 'New title', picture: photo })
  expect(batches[0].update.mock.calls[0][1]).toMatchObject({
    title: 'New title',
    pictureVersion: photo.version,
  })
  expect(batches[0].update.mock.calls[0][1].picture).toBeUndefined()
  expect(batches[0].set.mock.calls[0][0].path).toBe('activityPictures/a1')
  await updateActivity('a1', { title: 'Later title', pictureVersion: 'stale-form-version' })
  expect(updateDoc.mock.calls[0][1]).toEqual({ title: 'Later title', updatedAt: 'server-time' })
})
