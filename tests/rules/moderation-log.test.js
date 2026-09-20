/**
 * The moderation log: an append-only record of what an admin did, that the
 * rules can vouch for.
 *
 * Three things make an entry worth reading, and each is pinned here. It
 * names its writer as the caller and nobody else. It is stamped by the
 * server's clock. And it can only claim a state the subject is actually in
 * when the write lands — the rules read the role row or the activity *as it
 * will be after this batch* (getAfter), so "suspended" is refused unless
 * the row written alongside it, or already there, says so. Only an admin
 * writes; nobody edits or deletes; ordinary users read nothing.
 */
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

let testEnv

const ADMIN = 'admin_a'
const ADMIN2 = 'admin_b'
const USER = 'user_a'
const OTHER = 'user_b'
// A row left over from the rank that no longer exists.
const LEGACY = 'legacy_mod'

const profile = (uid) => ({
  uid,
  name: `Person ${uid}`,
  avatar: 'PP',
  username: `@${uid}`,
  bio: '',
  interests: ['Football'],
  historyCategories: [],
  preferredTime: 'Evening',
  anonymous: false,
  notificationsEnabled: true,
})

const activity = (hostId, overrides = {}) => ({
  title: 'Football Night',
  description: 'Friendly game',
  category: 'Football',
  tags: ['Football'],
  locationName: 'Rama IX Park',
  lat: 13.6947,
  lng: 100.6597,
  date: '2030-01-01',
  time: '19:00',
  startsAt: new Date('2030-01-01T19:00:00Z'),
  timeBand: 'Evening',
  capacity: 8,
  participantUids: [hostId],
  hostId,
  hostName: 'Host',
  hostAvatar: 'HO',
  status: 'active',
  ...overrides,
})

beforeAll(async () => {
  // Its own project id: the rule suites run in parallel workers and each
  // clears its own project between tests.
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-smartsync-log',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => testEnv?.cleanup())

const seed = (fn) => testEnv.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()))
const setRole = (uid, data) =>
  seed((db) => setDoc(doc(db, 'roles', uid), { role: 'user', suspended: false, ...data }))
const stored = async (...path) => {
  let data
  await seed(async (db) => {
    const snap = await getDoc(doc(db, ...path))
    data = snap.exists() ? snap.data() : undefined
  })
  return data
}

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seed(async (db) => {
    for (const uid of [ADMIN, ADMIN2, USER, OTHER, LEGACY]) {
      await setDoc(doc(db, 'users', uid), profile(uid))
    }
    await setDoc(doc(db, 'roles', ADMIN), { role: 'admin', suspended: false })
    await setDoc(doc(db, 'roles', ADMIN2), { role: 'admin', suspended: false })
    await setDoc(doc(db, 'roles', LEGACY), { role: 'moderator', suspended: false })
    await setDoc(doc(db, 'activities', 'act_user'), activity(USER))
  })
})

const as = (uid) => testEnv.authenticatedContext(uid).firestore()

/** A well-formed entry, as the app writes one. */
const entry = (by, overrides = {}) => ({
  kind: 'suspend',
  by,
  subjectId: USER,
  reason: 'Repeated reports after a warning',
  at: serverTimestamp(),
  ...overrides,
})

/** The action and its record, committed together — the way the app does it. */
const suspendWithEntry = (by, extra = {}) => {
  const db = as(by)
  const batch = writeBatch(db)
  batch.set(doc(db, 'roles', USER), { role: 'user', suspended: true }, { merge: true })
  batch.set(doc(collection(db, 'moderationLog')), entry(by, extra))
  return batch.commit()
}

const logAlone = (by, data) => setDoc(doc(collection(as(by), 'moderationLog')), data)

describe('an entry lands with the action it records', () => {
  test('an admin suspends and records it in one batch', async () => {
    await assertSucceeds(suspendWithEntry(ADMIN2))
    let rows
    await seed(async (db) => {
      rows = (await getDocs(collection(db, 'moderationLog'))).docs.map((d) => d.data())
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'suspend', by: ADMIN2, subjectId: USER })
    // Stamped by the server, not the client.
    expect(typeof rows[0].at?.toMillis).toBe('function')
    expect(await stored('roles', USER)).toMatchObject({ suspended: true })
  })

  test('the batch is one thing: a refused entry takes the action down with it', async () => {
    // `by` names a colleague — refused, and so the suspension never lands.
    await assertFails(suspendWithEntry(ADMIN2, { by: ADMIN }))
    expect(await stored('roles', USER)).toBeUndefined()
  })

  test('a takedown and its entry, together; the entry must name the host', async () => {
    const db = as(ADMIN2)
    const batch = writeBatch(db)
    batch.update(doc(db, 'activities', 'act_user'), {
      status: 'removed',
      moderation: { by: ADMIN2, reason: 'spam' },
    })
    batch.set(
      doc(collection(db, 'moderationLog')),
      entry(ADMIN2, { kind: 'remove', activityId: 'act_user', reason: 'spam' }),
    )
    await assertSucceeds(batch.commit())

    const wrongHost = writeBatch(db)
    wrongHost.set(
      doc(collection(db, 'moderationLog')),
      entry(ADMIN2, { kind: 'remove', activityId: 'act_user', subjectId: OTHER }),
    )
    await assertFails(wrongHost.commit())
  })

  test('a restore and its entry land together, from either admin', async () => {
    await seed((db) =>
      updateDoc(doc(db, 'activities', 'act_user'), {
        status: 'removed',
        moderation: { by: ADMIN2, reason: 'spam' },
      }),
    )
    const restoreBy = (uid) => {
      const db = as(uid)
      const batch = writeBatch(db)
      batch.update(doc(db, 'activities', 'act_user'), {
        status: 'active',
        moderation: { by: uid, reason: 'mistaken' },
      })
      batch.set(
        doc(collection(db, 'moderationLog')),
        entry(uid, { kind: 'restore', activityId: 'act_user', reason: 'mistaken' }),
      )
      return batch.commit()
    }
    await assertSucceeds(restoreBy(ADMIN2))
    await seed((db) =>
      updateDoc(doc(db, 'activities', 'act_user'), {
        status: 'removed',
        moderation: { by: ADMIN, reason: 'spam' },
      }),
    )
    await assertSucceeds(restoreBy(ADMIN))
  })
})

describe('an entry can only claim a state the subject is in', () => {
  test('"suspend" on somebody who is not suspended is refused; on somebody who is, allowed', async () => {
    await assertFails(logAlone(ADMIN2, entry(ADMIN2)))
    await setRole(USER, { suspended: true })
    await assertSucceeds(logAlone(ADMIN2, entry(ADMIN2)))
  })

  test('"lift" needs the suspension gone', async () => {
    await setRole(USER, { suspended: true })
    await assertFails(logAlone(ADMIN2, entry(ADMIN2, { kind: 'lift' })))
    const db = as(ADMIN2)
    const batch = writeBatch(db)
    batch.set(doc(db, 'roles', USER), { role: 'user', suspended: false }, { merge: true })
    batch.set(doc(collection(db, 'moderationLog')), entry(ADMIN2, { kind: 'lift' }))
    await assertSucceeds(batch.commit())
  })

  test('closed and reopened, each with its kind', async () => {
    await setRole(USER, { banned: true })
    await assertSucceeds(logAlone(ADMIN, entry(ADMIN, { kind: 'close' })))
    await assertFails(logAlone(ADMIN, entry(ADMIN, { kind: 'reopen' })))
    await setRole(USER, { banned: false })
    await assertSucceeds(logAlone(ADMIN, entry(ADMIN, { kind: 'reopen' })))
  })

  test('the retired kinds — appoint, dismiss — are refused whatever the row says', async () => {
    await assertFails(logAlone(ADMIN, entry(ADMIN, { kind: 'appoint', subjectId: LEGACY })))
    await assertFails(logAlone(ADMIN, entry(ADMIN, { kind: 'dismiss', subjectId: USER })))
  })

  test('"remove" needs the activity down, and "restore" needs it back up', async () => {
    await assertFails(
      logAlone(ADMIN2, entry(ADMIN2, { kind: 'remove', activityId: 'act_user', reason: 'x' })),
    )
    await seed((db) => updateDoc(doc(db, 'activities', 'act_user'), { status: 'removed' }))
    await assertSucceeds(
      logAlone(ADMIN2, entry(ADMIN2, { kind: 'remove', activityId: 'act_user', reason: 'x' })),
    )
    await assertFails(
      logAlone(ADMIN, entry(ADMIN, { kind: 'restore', activityId: 'act_user', reason: 'x' })),
    )
  })

  test('an activity kind names its activity; an account kind does not', async () => {
    await setRole(USER, { suspended: true })
    await assertFails(logAlone(ADMIN2, entry(ADMIN2, { activityId: 'act_user' })))
    await seed((db) => updateDoc(doc(db, 'activities', 'act_user'), { status: 'removed' }))
    await assertFails(logAlone(ADMIN2, entry(ADMIN2, { kind: 'remove', reason: 'x' })))
  })
})

describe('the shape of an entry', () => {
  beforeEach(() => setRole(USER, { suspended: true }))

  test('by is the caller, at is the server’s clock, and nothing else rides along', async () => {
    await assertFails(logAlone(ADMIN2, entry(ADMIN2, { by: ADMIN })))
    await assertFails(logAlone(ADMIN2, entry(ADMIN2, { at: new Date() })))
    await assertFails(logAlone(ADMIN2, { ...entry(ADMIN2), note: 'extra' }))
    await assertFails(logAlone(ADMIN2, entry(ADMIN2, { kind: 'shout' })))
  })

  test('the reason is a bounded string, and a report id is a bounded string', async () => {
    await assertFails(logAlone(ADMIN2, entry(ADMIN2, { reason: 7 })))
    await assertFails(logAlone(ADMIN2, entry(ADMIN2, { reason: 'x'.repeat(501) })))
    await assertSucceeds(logAlone(ADMIN2, entry(ADMIN2, { reason: '' })))
    await assertSucceeds(logAlone(ADMIN2, entry(ADMIN2, { reportId: 'r1' })))
    await assertFails(logAlone(ADMIN2, entry(ADMIN2, { reportId: '' })))
  })

  test('every kind is refused to a row that still says "moderator", even when the state is true', async () => {
    await setRole(USER, { suspended: true, banned: true })
    await assertFails(logAlone(LEGACY, entry(LEGACY)))
    await assertFails(logAlone(LEGACY, entry(LEGACY, { kind: 'close' })))
    await assertSucceeds(logAlone(ADMIN, entry(ADMIN, { kind: 'close' })))
    await assertSucceeds(logAlone(ADMIN, entry(ADMIN)))
  })
})

describe('who may read and who may write', () => {
  beforeEach(async () => {
    await setRole(USER, { suspended: true })
    await seed((db) => setDoc(doc(db, 'moderationLog', 'e1'), { ...entry(ADMIN2), at: new Date() }))
  })

  test('admins read the log; ordinary users do not, not even about themselves', async () => {
    await assertSucceeds(getDocs(collection(as(ADMIN), 'moderationLog')))
    await assertSucceeds(getDocs(collection(as(ADMIN2), 'moderationLog')))
    await assertFails(getDocs(collection(as(OTHER), 'moderationLog')))
    await assertFails(getDocs(collection(as(LEGACY), 'moderationLog')))
    await assertFails(getDoc(doc(as(USER), 'moderationLog', 'e1')))
  })

  test('a suspended admin neither reads nor writes', async () => {
    await setRole(ADMIN2, { role: 'admin', suspended: true })
    await assertFails(getDocs(collection(as(ADMIN2), 'moderationLog')))
    await assertFails(logAlone(ADMIN2, entry(ADMIN2)))
  })

  test('a plain user cannot write an entry, whatever it says', async () => {
    await assertFails(logAlone(OTHER, entry(OTHER)))
  })

  test('nothing is ever edited or deleted, by anybody', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), 'moderationLog', 'e1'), { reason: 'changed' }))
    await assertFails(deleteDoc(doc(as(ADMIN), 'moderationLog', 'e1')))
    await assertFails(deleteDoc(doc(as(ADMIN2), 'moderationLog', 'e1')))
  })
})
