/**
 * The rules around browser push: a notification may say what it was
 * worded from, but never claim it was delivered; and a person's devices
 * are theirs alone to see and to end.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
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
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

let testEnv
const ALICE = 'alice'
const BOB = 'bob'

const publicProfile = (uid, name) => ({
  uid,
  name,
  avatar: 'XX',
  username: `@${uid}`,
  bio: '',
  interests: ['Football'],
  preferredTime: 'Evening',
  historyCategories: [],
  anonymous: false,
  notificationsEnabled: true,
})

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-smartsync',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => {
  await testEnv?.cleanup()
})
beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', ALICE), publicProfile(ALICE, 'Alice'))
    await setDoc(doc(db, 'users', BOB), publicProfile(BOB, 'Bob'))
    await setDoc(doc(db, 'activities', 'act1'), {
      title: 'Football Night',
      hostId: ALICE,
      participantUids: [ALICE, BOB],
      status: 'active',
    })
  })
})

const asAlice = () => testEnv.authenticatedContext(ALICE).firestore()
const asBob = () => testEnv.authenticatedContext(BOB).firestore()

describe('a notification record', () => {
  const note = (overrides = {}) => ({
    type: 'activity',
    title: 'Someone joined',
    body: 'Bob joined Football Night.',
    activityId: 'act1',
    read: false,
    ...overrides,
  })

  test('may carry the kind and parameters it was worded from', async () => {
    await assertSucceeds(
      addDoc(
        collection(asBob(), 'users', ALICE, 'notifications'),
        note({ kind: 'someoneJoined', params: { name: 'Bob', title: 'Football Night' } }),
      ),
    )
  })

  test('still works without them — an older app keeps writing', async () => {
    await assertSucceeds(addDoc(collection(asBob(), 'users', ALICE, 'notifications'), note()))
  })

  test('cannot claim a delivery: that field is the server’s', async () => {
    await assertFails(
      addDoc(
        collection(asBob(), 'users', ALICE, 'notifications'),
        note({ kind: 'someoneJoined', params: {}, delivery: { push: { state: 'sent' } } }),
      ),
    )
    // Nor may the owner mark their own record delivered.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE, 'notifications', 'n1'), note())
    })
    await assertFails(
      updateDoc(doc(asAlice(), 'users', ALICE, 'notifications', 'n1'), {
        delivery: { push: { state: 'sent' } },
      }),
    )
    await assertSucceeds(
      updateDoc(doc(asAlice(), 'users', ALICE, 'notifications', 'n1'), { read: true }),
    )
  })

  test('the kind is bounded and the parameters are a small map', async () => {
    await assertFails(
      addDoc(collection(asBob(), 'users', ALICE, 'notifications'), note({ kind: 'x'.repeat(41) })),
    )
    await assertFails(
      addDoc(
        collection(asBob(), 'users', ALICE, 'notifications'),
        note({ kind: 'someoneJoined', params: 'name=Bob' }),
      ),
    )
    const tooMany = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${i}`, 'x']))
    await assertFails(
      addDoc(
        collection(asBob(), 'users', ALICE, 'notifications'),
        note({ kind: 'someoneJoined', params: tooMany }),
      ),
    )
  })
})

describe('push tokens', () => {
  const token = (overrides = {}) => ({
    token: 'fcm-token-abc',
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    label: 'Chrome · macOS',
    language: 'th',
    timeZone: 'Asia/Bangkok',
    platform: 'desktop',
    failures: 0,
    ...overrides,
  })

  test('the owner can register, list, refresh and remove their devices', async () => {
    const ref = doc(asAlice(), 'users', ALICE, 'pushTokens', 'hash1')
    await assertSucceeds(setDoc(ref, token()))
    await assertSucceeds(getDocs(collection(asAlice(), 'users', ALICE, 'pushTokens')))
    await assertSucceeds(
      setDoc(ref, { token: 'fcm-token-abc', lastSeenAt: serverTimestamp() }, { merge: true }),
    )
    await assertSucceeds(deleteDoc(ref))
  })

  test('nobody else can read, write or remove them', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE, 'pushTokens', 'hash1'), token())
    })
    await assertFails(getDoc(doc(asBob(), 'users', ALICE, 'pushTokens', 'hash1')))
    await assertFails(getDocs(collection(asBob(), 'users', ALICE, 'pushTokens')))
    await assertFails(setDoc(doc(asBob(), 'users', ALICE, 'pushTokens', 'hash2'), token()))
    await assertFails(deleteDoc(doc(asBob(), 'users', ALICE, 'pushTokens', 'hash1')))
    await assertFails(
      getDocs(
        collection(testEnv.unauthenticatedContext().firestore(), 'users', ALICE, 'pushTokens'),
      ),
    )
  })

  test('a registration is a token and a time, and nothing the shape does not name', async () => {
    const ref = doc(asAlice(), 'users', ALICE, 'pushTokens', 'hash1')
    await assertFails(setDoc(ref, token({ token: '' })))
    await assertFails(setDoc(ref, token({ token: 'x'.repeat(4097) })))
    await assertFails(setDoc(ref, token({ lastSeenAt: 'yesterday' })))
    await assertFails(setDoc(ref, token({ label: 'x'.repeat(81) })))
    await assertFails(setDoc(ref, token({ owner: BOB })))
    await assertSucceeds(setDoc(ref, { token: 'fcm-token-abc', lastSeenAt: serverTimestamp() }))
  })
})
