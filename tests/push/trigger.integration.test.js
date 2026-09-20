/**
 * The Function, live in the functions emulator: a record landing in an
 * inbox is claimed, worded and stamped — once — by the trigger, with the
 * log transport standing in for FCM.
 *
 * Run by `npm run test:push:trigger`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.PUSH_FUNCTIONS_EMULATOR) {
  throw new Error(
    'Run through `npm run test:push:trigger`: this test needs the functions emulator.',
  )
}

let app
let db
beforeAll(() => {
  app = initializeApp({ projectId: 'demo-smartsync' }, `trigger-test-${Date.now()}`)
  db = getFirestore(app)
})
afterAll(async () => {
  await deleteApp(app)
})

const uidFor = () => `trigger-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function seed(uid) {
  await db.doc(`users/${uid}`).set({ uid, name: 'Alice', notificationsEnabled: true })
  await db.doc(`users/${uid}/private/profile`).set({ language: 'th' })
  await db
    .doc(`users/${uid}/pushTokens/h0`)
    .set({ token: 'tok-a', lastSeenAt: Timestamp.now(), failures: 0 })
}

const chat = () => ({
  type: 'chat',
  kind: 'newMessage',
  params: { name: 'Mya', title: 'Run', text: 'secret' },
  title: 'New message in Run',
  body: 'Mya: secret',
  activityId: 'act1',
  read: false,
  createdAt: Timestamp.now(),
})

async function waitForStamp(uid, id) {
  let delivery = null
  for (let i = 0; i < 60 && !delivery?.state; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    delivery = (await db.doc(`users/${uid}/notifications/${id}`).get()).data()?.delivery?.push
  }
  return delivery
}

describe('onNotificationCreated', () => {
  test('stamps a record as it lands, worded in the recipient\u2019s language', async () => {
    const uid = uidFor()
    await seed(uid)
    await db.doc(`users/${uid}/notifications/live1`).set(chat())
    const delivery = await waitForStamp(uid, 'live1')
    expect(delivery).toMatchObject({
      state: 'sent',
      transport: 'log',
      lang: 'th',
      sent: 1,
      category: 'chat',
    })
    expect(delivery.eventId).toBeTruthy()
  })

  test('a record of a kind that never pushes is stamped as skipped', async () => {
    const uid = uidFor()
    await seed(uid)
    await db.doc(`users/${uid}/notifications/live2`).set({
      ...chat(),
      type: 'activity',
      kind: 'someoneJoined',
      params: { name: 'Bob', title: 'Run' },
    })
    // Joins are off by default: skipped on preference, not on policy.
    expect(await waitForStamp(uid, 'live2')).toMatchObject({
      state: 'skipped',
      reason: 'preference',
    })
  })

  test('a dead token is removed by the trigger', async () => {
    const uid = uidFor()
    await seed(uid)
    await db
      .doc(`users/${uid}/pushTokens/h1`)
      .set({ token: 'invalid-x', lastSeenAt: Timestamp.now() })
    await db.doc(`users/${uid}/notifications/live3`).set(chat())
    expect(await waitForStamp(uid, 'live3')).toMatchObject({ state: 'sent', sent: 1, removed: 1 })
    const left = await db.collection(`users/${uid}/pushTokens`).get()
    expect(left.docs.map((d) => d.data().token)).toEqual(['tok-a'])
  })
})
