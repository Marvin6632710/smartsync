/**
 * The delivery pipeline against the Firestore emulator, through the Admin
 * SDK the Function itself uses: the claim that makes a push happen once,
 * the preferences, the hourly budget, the token bookkeeping, the wording
 * in the recipient's language. The trigger itself is exercised separately
 * (trigger.integration.test.js) with the functions emulator, since with it
 * running every record written here would be claimed by the real Function
 * before the test's own call could be.
 *
 * Run by `npm run test:push` (emulators:exec sets FIRESTORE_EMULATOR_HOST,
 * which is what points the Admin SDK at the emulator).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { createRequire } from 'node:module'

import { deliverPush } from '../../functions/lib/deliver.js'
import { removeStaleTokens } from '../../functions/lib/housekeeping.js'
import { logTransport } from '../../functions/lib/transport.js'

// The functions package's own copy of the Admin SDK, as deployed.
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Run through `npm run test:push`: this test needs the Firestore emulator.')
}

let app
let db
const quietLog = { info: () => {}, error: () => {} }

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-smartsync' }, `push-test-${Date.now()}`)
  db = getFirestore(app)
})
afterAll(async () => {
  await deleteApp(app)
})

let counter = 0
const uidFor = () => `push-user-${Date.now()}-${(counter += 1)}`

async function seed(uid, { tokens = ['tok-a'], profile = {} } = {}) {
  await db.doc(`users/${uid}`).set({ uid, name: 'Alice', notificationsEnabled: true })
  await db.doc(`users/${uid}/private/profile`).set({ language: 'th', ...profile })
  for (const [index, token] of tokens.entries()) {
    await db.doc(`users/${uid}/pushTokens/h${index}`).set({
      token,
      lastSeenAt: Timestamp.now(),
      language: 'my',
      failures: 0,
    })
  }
}

async function write(uid, id, record) {
  await db
    .doc(`users/${uid}/notifications/${id}`)
    .set({ read: false, createdAt: Timestamp.now(), ...record })
}

const chat = (over = {}) => ({
  type: 'chat',
  kind: 'newMessage',
  params: { name: 'Mya', title: 'Run', text: 'secret' },
  title: 'New message in Run',
  body: 'Mya: secret',
  activityId: 'act1',
  ...over,
})

const deliver = (uid, id, record, extra = {}) =>
  deliverPush({
    db,
    FieldValue,
    transport: logTransport(quietLog),
    uid,
    id,
    record,
    eventId: `evt-${id}`,
    origin: 'https://smartsync.test',
    log: quietLog,
    ...extra,
  })

const stamp = async (uid, id) =>
  (await db.doc(`users/${uid}/notifications/${id}`).get()).data().delivery.push

describe('deliverPush', () => {
  let uid
  beforeEach(async () => {
    uid = uidFor()
    await seed(uid)
  })

  test('sends once, in the recipient’s language, without the message text', async () => {
    const sent = []
    const transport = {
      name: 'spy',
      send: async (tokens, message) => {
        sent.push({ tokens, message })
        return tokens.map((token) => ({ token, ok: true, code: null }))
      },
    }
    await write(uid, 'n1', chat())
    const outcome = await deliver(uid, 'n1', chat(), { transport })
    expect(outcome).toMatchObject({
      state: 'sent',
      sent: 1,
      failed: 0,
      lang: 'th',
      category: 'chat',
    })
    expect(sent).toHaveLength(1)
    const { message } = sent[0]
    expect(message.data).toMatchObject({
      id: 'n1',
      uid,
      kind: 'newMessage',
      tag: 'chat-act1',
      lang: 'th',
      url: '/n/n1',
    })
    expect(message.data.body).not.toContain('secret')
    expect(message.data.title).toContain('Run')
    expect(message.webpush.headers).toEqual({ TTL: '900', Urgency: 'high' })
    expect(message.webpush.fcmOptions.link).toBe('https://smartsync.test/n/n1')
    // Every value is a string: FCM data maps allow nothing else.
    for (const value of Object.values(message.data)) expect(typeof value).toBe('string')
    expect(await stamp(uid, 'n1')).toMatchObject({ state: 'sent', sent: 1 })
  })

  test('a second delivery of the same record is a duplicate and sends nothing', async () => {
    await write(uid, 'n2', chat())
    await deliver(uid, 'n2', chat())
    const again = await deliver(uid, 'n2', chat(), { eventId: 'evt-retry' })
    expect(again).toEqual({ state: 'duplicate' })
    expect((await stamp(uid, 'n2')).eventId).toBe('evt-n2')
  })

  test('a kind that never pushes is skipped and says so', async () => {
    const record = {
      type: 'activity',
      kind: 'activityBack',
      params: { title: 'Run' },
      title: 'x',
      body: 'y',
      activityId: 'act1',
    }
    await write(uid, 'n3', record)
    expect(await deliver(uid, 'n3', record)).toEqual({ state: 'skipped', reason: 'policy' })
    expect((await stamp(uid, 'n3')).reason).toBe('policy')
  })

  test('a record with no kind — an older writer — is never pushed', async () => {
    const record = {
      type: 'chat',
      title: 'New message in Run',
      body: 'Mya: hi',
      activityId: 'act1',
    }
    await write(uid, 'n4', record)
    expect((await deliver(uid, 'n4', record)).reason).toBe('policy')
  })

  test('a category switched off is skipped; a safety notice is not', async () => {
    await db
      .doc(`users/${uid}/private/profile`)
      .set({ notifications: { push: { chat: false } } }, { merge: true })
    await write(uid, 'n5', chat())
    expect(await deliver(uid, 'n5', chat())).toEqual({ state: 'skipped', reason: 'preference' })
    const warning = {
      type: 'moderation',
      kind: 'warning',
      params: { reason: 'Be kind.' },
      title: 'w',
      body: 'b',
    }
    await db
      .doc(`users/${uid}/private/profile`)
      .set({ notifications: { push: { activity: false } } }, { merge: true })
    await write(uid, 'n6', warning)
    expect((await deliver(uid, 'n6', warning)).state).toBe('sent')
  })

  test('message previews, when asked for, carry the text', async () => {
    await db
      .doc(`users/${uid}/private/profile`)
      .set({ notifications: { chatPreview: true } }, { merge: true })
    const sent = []
    const transport = {
      name: 'spy',
      send: async (tokens, message) => {
        sent.push(message)
        return tokens.map((token) => ({ token, ok: true }))
      },
    }
    await write(uid, 'n7', chat())
    await deliver(uid, 'n7', chat(), { transport })
    expect(sent[0].data.body).toContain('secret')
  })

  test('nobody registered: skipped, and nothing claimed against the budget', async () => {
    const lonely = uidFor()
    await seed(lonely, { tokens: [] })
    await write(lonely, 'n8', chat())
    expect(await deliver(lonely, 'n8', chat())).toEqual({ state: 'skipped', reason: 'no-tokens' })
  })

  test('a dead token is removed; a live one beside it is still sent to', async () => {
    const two = uidFor()
    await seed(two, { tokens: ['invalid-old', 'tok-live'] })
    await write(two, 'n9', chat())
    const outcome = await deliver(two, 'n9', chat())
    expect(outcome).toMatchObject({ state: 'sent', sent: 1, failed: 1, removed: 1 })
    const left = await db.collection(`users/${two}/pushTokens`).get()
    expect(left.docs.map((d) => d.data().token)).toEqual(['tok-live'])
  })

  test('the language falls back from the profile to the device to English', async () => {
    const sent = []
    const transport = {
      name: 'spy',
      send: async (tokens, message) => {
        sent.push(message)
        return tokens.map((token) => ({ token, ok: true }))
      },
    }
    const quiet = uidFor()
    await seed(quiet)
    await db.doc(`users/${quiet}/private/profile`).set({})
    await write(quiet, 'n10', chat())
    await deliver(quiet, 'n10', chat(), { transport })
    expect(sent[0].data.lang).toBe('my')
    const bare = uidFor()
    await db.doc(`users/${bare}/pushTokens/h0`).set({ token: 'tok', lastSeenAt: Timestamp.now() })
    await write(bare, 'n11', chat())
    await deliver(bare, 'n11', chat(), { transport })
    expect(sent[1].data.lang).toBe('en')
  })

  test('over the hourly budget the record still lands and the push is skipped', async () => {
    const busy = uidFor()
    await seed(busy)
    const now = Date.now()
    await db
      .doc(`users/${busy}/private/pushMeter`)
      .set({ hour: Math.floor(now / 3_600_000), count: 30 })
    await write(busy, 'n12', chat())
    expect(await deliver(busy, 'n12', chat(), { now })).toEqual({
      state: 'skipped',
      reason: 'budget',
    })
    // Safety notices are not budgeted.
    const warning = { type: 'moderation', kind: 'suspended', params: {}, title: 'w', body: 'b' }
    await write(busy, 'n13', warning)
    expect((await deliver(busy, 'n13', warning, { now })).state).toBe('sent')
  })
})

describe('housekeeping', () => {
  test('tokens unseen for two months are removed; fresh ones stay', async () => {
    const uid = uidFor()
    const old = Timestamp.fromMillis(Date.now() - 61 * 24 * 60 * 60 * 1000)
    await db.doc(`users/${uid}/pushTokens/old`).set({ token: 'old', lastSeenAt: old })
    await db
      .doc(`users/${uid}/pushTokens/fresh`)
      .set({ token: 'fresh', lastSeenAt: Timestamp.now() })
    const removed = await removeStaleTokens({ db, Timestamp })
    expect(removed).toBeGreaterThanOrEqual(1)
    const left = await db.collection(`users/${uid}/pushTokens`).get()
    expect(left.docs.map((d) => d.id)).toEqual(['fresh'])
  })
})
