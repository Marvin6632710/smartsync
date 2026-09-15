/**
 * After a reload, did a queued write land? Firestore is faked; each kind's
 * question is answered from what the database now holds — and for an edit,
 * a third answer is possible: the document was changed by somebody else
 * meanwhile, which is not a refusal and must not be restored over.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const docs = new Map()
const getDoc = vi.fn(async (ref) => ({
  exists: () => docs.has(ref.path),
  data: () => docs.get(ref.path),
}))
const waitForPendingWrites = vi.fn(async () => {})
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDoc,
  waitForPendingWrites,
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))

const { drainQueue, LANDED, outcomeOf, REFUSED, SUPERSEDED } =
  await import('../../src/firebase/pending')

beforeEach(() => {
  docs.clear()
  getDoc.mockClear()
})

describe('outcomeOf', () => {
  test('a message: exists or not', async () => {
    const row = { kind: 'message', key: 'a1', payload: { id: 'm1', text: 'hi' } }
    expect(await outcomeOf(row)).toBe(REFUSED)
    docs.set('activities/a1/messages/m1', { text: 'hi' })
    expect(await outcomeOf(row)).toBe(LANDED)
  })

  test('a created activity and a report: exists or not', async () => {
    const create = { kind: 'activity-create', key: 'me', payload: { id: 'x' } }
    expect(await outcomeOf(create)).toBe(REFUSED)
    docs.set('activities/x', {})
    expect(await outcomeOf(create)).toBe(LANDED)
    const report = { kind: 'report', key: 'bob', payload: { id: 'r' } }
    expect(await outcomeOf(report)).toBe(REFUSED)
    docs.set('reports/r', {})
    expect(await outcomeOf(report)).toBe(LANDED)
  })

  const before = {
    title: 'Old',
    description: 'd',
    locationName: 'L',
    date: '2030-01-01',
    time: '19:00',
    category: 'Coffee',
    capacity: 5,
  }
  const after = { ...before, title: 'New' }
  const edit = { kind: 'activity-edit', key: 'a1', payload: after, before }

  test('an edit that landed: the document shows what it carried, field for field', async () => {
    expect(await outcomeOf(edit)).toBe(REFUSED) // no document at all
    docs.set('activities/a1', { ...after, capacity: 99 })
    // Capacity is rounded on the way in, so it is not compared.
    expect(await outcomeOf(edit)).toBe(LANDED)
  })

  test('an edit that was refused: the document still shows what the form was seeded with', async () => {
    docs.set('activities/a1', { ...before, capacity: 99 })
    expect(await outcomeOf(edit)).toBe(REFUSED)
  })

  test('an edit that landed and was then edited elsewhere is superseded, not refused', async () => {
    // Their title over ours; everything else as ours left it.
    docs.set('activities/a1', { ...after, title: 'Theirs' })
    expect(await outcomeOf(edit)).toBe(SUPERSEDED)
    // And so is a refused edit followed by somebody else's, which is the
    // same from where the person stands: the document shows a newer edit
    // that is not theirs.
    docs.set('activities/a1', { ...before, description: 'their description' })
    expect(await outcomeOf(edit)).toBe(SUPERSEDED)
  })

  test('an edit somebody else reverted to exactly what it was reads as refused — restoring is harmless', async () => {
    docs.set('activities/a1', before)
    expect(await outcomeOf(edit)).toBe(REFUSED)
  })

  test('a row from before `before` was kept is judged the old way: landed or refused', async () => {
    const legacy = { kind: 'activity-edit', key: 'a1', payload: after }
    docs.set('activities/a1', { ...after, title: 'Theirs' })
    expect(await outcomeOf(legacy)).toBe(REFUSED)
    docs.set('activities/a1', after)
    expect(await outcomeOf(legacy)).toBe(LANDED)
  })

  test('a profile: the public document shows the edit, or what it was, or another device’s', async () => {
    const seeded = { username: '@a', bio: 'old', preferredTime: '', interests: ['Coffee'] }
    const row = {
      kind: 'profile',
      key: 'me',
      payload: { name: 'A', ...seeded, bio: 'b' },
      before: seeded,
    }
    docs.set('users/me', seeded)
    expect(await outcomeOf(row)).toBe(REFUSED)
    docs.set('users/me', { ...seeded, bio: 'b' })
    expect(await outcomeOf(row)).toBe(LANDED)
    docs.set('users/me', { ...seeded, bio: 'from my phone' })
    expect(await outcomeOf(row)).toBe(SUPERSEDED)
    // The name is not judged: anonymous mode changes it in the public copy.
    docs.set('users/me', { ...seeded, bio: 'b', name: 'Anonymous user' })
    expect(await outcomeOf(row)).toBe(LANDED)
  })

  test('an unknown kind is treated as landed rather than resurrected for ever', async () => {
    expect(await outcomeOf({ kind: 'something-new', key: 'k', payload: {} })).toBe(LANDED)
  })

  test('drainQueue waits on the pending writes', async () => {
    await drainQueue()
    expect(waitForPendingWrites).toHaveBeenCalledTimes(1)
  })
})
