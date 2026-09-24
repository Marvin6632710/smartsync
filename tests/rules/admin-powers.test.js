import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
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
const activity = (uid) => ({
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
  participantUids: [uid],
  hostId: uid,
  hostName: uid,
  hostAvatar: 'AA',
  status: 'active',
})
const as = (uid) => env.authenticatedContext(uid).firestore()
const seed = (path, data) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-smartsync-admin-powers',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => env?.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await seed('users/alice', profile('alice'))
  await seed('users/admin', profile('admin'))
  await seed('roles/admin', { role: 'admin', suspended: false })
})

describe('server-only moderation records', () => {
  test('the vault is invisible and unwritable to users and admins', async () => {
    await seed('moderationVault/v1', { kind: 'profile-bio', value: 'preserved' })
    await assertFails(getDoc(doc(as('alice'), 'moderationVault', 'v1')))
    await assertFails(getDoc(doc(as('admin'), 'moderationVault', 'v1')))
    await assertFails(setDoc(doc(as('admin'), 'moderationVault', 'v2'), { value: 'x' }))
  })

  test('a person reads only their appeals; an admin reads the queue; neither writes it', async () => {
    await seed('moderationAppeals/a1', {
      subjectId: 'alice',
      kind: 'suspension',
      targetId: 'alice',
      detail: 'Please review this decision.',
      status: 'open',
      createdAt: new Date(),
    })
    await assertSucceeds(getDoc(doc(as('alice'), 'moderationAppeals', 'a1')))
    await assertSucceeds(getDoc(doc(as('admin'), 'moderationAppeals', 'a1')))
    await assertFails(getDoc(doc(as('bob'), 'moderationAppeals', 'a1')))
    await assertFails(addDoc(collection(as('alice'), 'moderationAppeals'), { subjectId: 'alice' }))
  })
})

describe('official announcements', () => {
  test('signed-in active members can read, while publishing stays server-only', async () => {
    await seed('announcements/n1', {
      title: 'Campus notice',
      body: 'Meetup area changed.',
      audience: 'all',
      active: true,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    })
    await assertSucceeds(getDocs(collection(as('alice'), 'announcements')))
    await assertFails(addDoc(collection(as('admin'), 'announcements'), { title: 'Fake' }))
    await seed('roles/alice', { role: 'user', suspended: false, banned: true })
    await assertFails(getDoc(doc(as('alice'), 'announcements', 'n1')))
  })
})

describe('timed suspensions', () => {
  test('a future expiry blocks actions and a past expiry releases them immediately', async () => {
    await seed('roles/alice', {
      role: 'user',
      suspended: true,
      suspendedUntil: new Date(Date.now() + 60_000),
    })
    await assertFails(setDoc(doc(as('alice'), 'activities', 'blocked'), activity('alice')))
    await seed('roles/alice', {
      role: 'user',
      suspended: true,
      suspendedUntil: new Date(Date.now() - 60_000),
    })
    await assertSucceeds(setDoc(doc(as('alice'), 'activities', 'released'), activity('alice')))
  })
})

describe('content locks', () => {
  test('a user cannot rewrite a profile field while its moderation lock is active', async () => {
    await seed('users/alice', {
      ...profile('alice'),
      username: '@removed',
      bio: '',
      contentModeration: {
        username: { active: true, actionId: 'u1' },
        bio: { active: true, actionId: 'b1' },
      },
    })
    await assertFails(updateDoc(doc(as('alice'), 'users', 'alice'), { username: '@back' }))
    await assertFails(updateDoc(doc(as('alice'), 'users', 'alice'), { bio: 'back' }))
    await assertSucceeds(
      updateDoc(doc(as('alice'), 'users', 'alice'), { preferredTime: 'Evening' }),
    )
    await assertFails(deleteDoc(doc(as('alice'), 'users', 'alice')))
  })

  test('a host cannot delete and recreate an activity to escape a picture lock', async () => {
    await seed('activities/locked', {
      ...activity('alice'),
      contentModeration: { picture: { active: true, actionId: 'p1' } },
    })
    await assertFails(deleteDoc(doc(as('alice'), 'activities', 'locked')))
  })
})
