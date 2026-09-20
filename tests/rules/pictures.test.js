import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

let env
const profile = (uid) => ({
  uid,
  name: uid,
  avatar: 'AA',
  username: `@${uid}`,
  bio: '',
  interests: ['Coffee'],
  historyCategories: [],
  preferredTime: '',
  anonymous: false,
  notificationsEnabled: true,
})
const activity = {
  title: 'Coffee',
  description: 'Meet up',
  category: 'Coffee',
  tags: [],
  locationName: 'Bangkok',
  lat: 13.7,
  lng: 100.5,
  date: '2030-01-01',
  time: '12:00',
  startsAt: new Date('2030-01-01T05:00:00Z'),
  timeBand: 'Afternoon',
  capacity: 4,
  participantUids: ['alice'],
  hostId: 'alice',
  hostName: 'Alice',
  hostAvatar: 'AA',
  status: 'active',
}
const picture = (version = 'v1', overrides = {}) => ({
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  version,
  updatedAt: serverTimestamp(),
  ...overrides,
})
const dbFor = (uid = 'alice') => env.authenticatedContext(uid).firestore()
const save = (db, kind, id, data = picture()) => {
  const batch = writeBatch(db)
  batch.update(doc(db, kind === 'profile' ? 'users' : 'activities', id), {
    pictureVersion: data.version,
  })
  batch.set(doc(db, kind === 'profile' ? 'profilePictures' : 'activityPictures', id), data)
  return batch.commit()
}
const seed = (path, data) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data, { merge: true }))

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-smartsync-pictures',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => env?.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await seed('users/alice', profile('alice'))
  await seed('users/bob', profile('bob'))
  await seed('activities/a1', activity)
  await seed('roles/admin', { role: 'admin', suspended: false })
})

describe.each([
  ['profile', 'alice', 'profilePictures', 'users'],
  ['activity', 'a1', 'activityPictures', 'activities'],
])('%s pictures', (kind, id, pictures, parents) => {
  test('owner uploads and replaces; a fresh signed-in client reads the saved picture', async () => {
    await assertSucceeds(save(dbFor(), kind, id))
    await assertSucceeds(save(dbFor(), kind, id, picture('v2')))
    const snap = await assertSucceeds(getDoc(doc(dbFor('bob'), pictures, id)))
    expect(snap.data().version).toBe('v2')
  })
  test('saving other fields preserves the original picture', async () => {
    const db = dbFor()
    await save(db, kind, id)
    await assertSucceeds(
      updateDoc(
        doc(db, parents, id),
        kind === 'profile' ? { bio: 'New bio' } : { title: 'New title' },
      ),
    )
    expect((await getDoc(doc(db, pictures, id))).data().version).toBe('v1')
    expect((await getDoc(doc(db, parents, id))).data().pictureVersion).toBe('v1')
  })
  test.each(['bob', 'admin'])(
    '%s cannot upload, replace or delete another owner’s picture',
    async (actor) => {
      await assertFails(save(dbFor(actor), kind, id))
      await save(dbFor(), kind, id)
      await assertFails(setDoc(doc(dbFor(actor), pictures, id), picture()))
      await assertFails(deleteDoc(doc(dbFor(actor), pictures, id)))
    },
  )
  test('signed-out reads and collection scans are refused', async () => {
    await save(dbFor(), kind, id)
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), pictures, id)))
    await assertFails(getDocs(collection(dbFor('bob'), pictures)))
  })
  test('a new version cannot be saved without the parent changing with it', async () => {
    await save(dbFor(), kind, id)
    await assertFails(setDoc(doc(dbFor(), pictures, id), picture('unattached')))
  })
  test.each(
    [
      { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
      { dataUrl: 'https://example.com/picture.jpg' },
      { dataUrl: 'data:image/png;base64,' + 'A'.repeat(320000) },
      { dataUrl: 'data:image/png;base64,' },
      { dataUrl: 'data:image/png;base64,<script>' },
      { version: '../another-user' },
      { extra: true },
      { updatedAt: new Date('2000-01-01') },
    ].map((bad, i) => [i + 1, bad]),
  )(
    'invalid picture case %i is refused and preserves the previous picture',
    async (_index, bad) => {
      const db = dbFor()
      await save(db, kind, id)
      await assertFails(save(db, kind, id, picture('v2', bad)))
      expect((await getDoc(doc(db, pictures, id))).data().version).toBe('v1')
      expect((await getDoc(doc(db, parents, id))).data().pictureVersion).toBe('v1')
    },
  )
  test('closed accounts cannot upload', async () => {
    await seed('roles/alice', { role: 'user', suspended: false, banned: true })
    await assertFails(save(dbFor(), kind, id))
  })
})

test('activity and cover are created together, with ownership enforced', async () => {
  const db = dbFor()
  const batch = writeBatch(db)
  batch.set(doc(db, 'activities', 'new'), { ...activity, pictureVersion: 'v1' })
  batch.set(doc(db, 'activityPictures', 'new'), picture())
  await assertSucceeds(batch.commit())
  await assertFails(setDoc(doc(db, 'activityPictures', 'orphan'), picture()))
})

test('anonymous photos are private even when someone knows the path and version', async () => {
  await save(dbFor(), 'profile', 'alice')
  await assertSucceeds(
    updateDoc(doc(dbFor(), 'users', 'alice'), {
      anonymous: true,
      name: 'Anonymous user',
      avatar: 'AN',
    }),
  )
  await assertSucceeds(getDoc(doc(dbFor(), 'profilePictures', 'alice')))
  await assertFails(getDoc(doc(dbFor('bob'), 'profilePictures', 'alice')))
  await assertFails(getDoc(doc(dbFor('admin'), 'profilePictures', 'alice')))
  await assertSucceeds(save(dbFor(), 'profile', 'alice', picture('v2')))
  await assertSucceeds(updateDoc(doc(dbFor(), 'users', 'alice'), { anonymous: false }))
  expect(
    (await assertSucceeds(getDoc(doc(dbFor('bob'), 'profilePictures', 'alice')))).data().version,
  ).toBe('v2')
})

test('a taken-down activity’s picture cannot be replaced or deleted by its host', async () => {
  await save(dbFor(), 'activity', 'a1')
  await seed('activities/a1', { status: 'removed' })
  await assertFails(save(dbFor(), 'activity', 'a1', picture('v2')))
  await assertFails(setDoc(doc(dbFor(), 'activityPictures', 'a1'), picture()))
  await assertFails(deleteDoc(doc(dbFor(), 'activityPictures', 'a1')))
})

test('deleting an unused activity deletes its picture in the same batch', async () => {
  const db = dbFor()
  await save(db, 'activity', 'a1')
  const batch = writeBatch(db)
  batch.delete(doc(db, 'activityPictures', 'a1'))
  batch.delete(doc(db, 'activities', 'a1'))
  await assertSucceeds(batch.commit())
  await env.withSecurityRulesDisabled(async (ctx) => {
    expect((await getDoc(doc(ctx.firestore(), 'activityPictures', 'a1'))).exists()).toBe(false)
  })
})
