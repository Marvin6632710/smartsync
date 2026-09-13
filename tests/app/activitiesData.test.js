/**
 * The activity data layer's pure corners, with Firestore faked.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const updateDoc = vi.fn(() => Promise.resolve())
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  arrayRemove: vi.fn(),
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => 'server-time',
  Timestamp: { fromDate: (d) => ({ ms: d.getTime() }), fromMillis: (ms) => ({ ms }) },
  updateDoc,
  where: vi.fn(),
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))

const { deriveTimeBand, updateActivity } = await import('../../src/firebase/activities')

beforeEach(() => {
  updateDoc.mockClear()
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
