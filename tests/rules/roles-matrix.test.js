/**
 * The authority matrix.
 *
 * `firestore.test.js` tests the rules feature by feature. This file tests the
 * one thing that cuts across all of them: **who may do what to whom**, at
 * every combination of the caller's rank, the target's rank, and the
 * relationship between them.
 *
 * Two ranks and no more: an ordinary user, and an admin. The interesting
 * cases are the collisions — where one person wears two hats at once. An
 * admin who is also the host of the activity being reported. An admin who
 * is also the person reported. An admin acting on another admin. A
 * suspended account that is also a host with people already going. Each of
 * those is a place where two correct-looking rules can combine into
 * something nobody intended, and none of them is visible from reading a
 * single rule.
 *
 * Every test states the harm it is preventing, not just the mechanic.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

let testEnv

// Ranks
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

const report = (overrides = {}) => ({
  reporterId: OTHER,
  targetType: 'user',
  targetId: USER,
  subjectId: USER,
  reason: 'harassment',
  detail: 'Would not leave me alone.',
  context: '',
  status: 'open',
  ...overrides,
})

beforeAll(async () => {
  // Its own project id, not `demo-smartsync`. Vitest runs test files in
  // parallel workers, and both rule suites call clearFirestore() — pointed at
  // the same project they wipe each other's fixtures mid-run, which shows up
  // as a scatter of unrelated failures that pass when either file is run on
  // its own. Separate projects in the same emulator are free and make the
  // isolation real rather than a matter of timing.
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-smartsync-roles',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => testEnv?.cleanup())

/** Writes with the rules switched off, so setup is never the thing under test. */
const seed = (fn) => testEnv.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()))
/** What a document holds now, read with the rules off; undefined if absent. */
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
    // USER and OTHER deliberately have no role document: no row means an
    // ordinary user, which is the state most accounts are in.
    await setDoc(doc(db, 'activities', 'act_user'), activity(USER))
    await setDoc(doc(db, 'activities', 'act_other'), activity(OTHER))
    await setDoc(doc(db, 'activities', 'act_admin'), activity(ADMIN))
  })
})

const as = (uid) => testEnv.authenticatedContext(uid).firestore()
const setRole = (uid, data) =>
  seed((db) => setDoc(doc(db, 'roles', uid), { role: 'user', suspended: false, ...data }))

// The things a rank can do, each as one call, so the matrix below reads as
// a table rather than as a pile of Firestore calls.
const takeDown = (actor, activityId = 'act_user') =>
  updateDoc(doc(as(actor), 'activities', activityId), {
    status: 'removed',
    moderation: { by: actor, reason: 'Breaks the safety policy' },
    updatedAt: 1,
  })

const putBack = (actor, activityId = 'act_user') =>
  updateDoc(doc(as(actor), 'activities', activityId), {
    status: 'active',
    moderation: { by: actor, reason: 'Reviewed again — the report was mistaken' },
    updatedAt: 1,
  })

const suspend = (actor, target) =>
  setDoc(doc(as(actor), 'roles', target), { role: 'user', suspended: true })

const lift = (actor, target) =>
  setDoc(doc(as(actor), 'roles', target), { role: 'user', suspended: false })

const writeRole = (actor, target, role) =>
  setDoc(doc(as(actor), 'roles', target), { role, suspended: false })

// Working a report is claim, then decision — the rules refuse a decision
// without the claim, so "closing" here is both writes in order.
const claimReport = (actor, reportId = 'rep') =>
  updateDoc(doc(as(actor), 'reports', reportId), {
    claim: { by: actor, at: serverTimestamp() },
  })
const closeReport = async (actor, reportId = 'rep') => {
  await claimReport(actor, reportId)
  await updateDoc(doc(as(actor), 'reports', reportId), {
    status: 'dismissed',
    outcome: 'No action needed',
    reviewedBy: actor,
    reviewedAt: 1,
  })
}

// ---------------------------------------------------------------------------

describe('what each rank may do at all', () => {
  test('an ordinary user has no authority over anybody', async () => {
    await assertFails(takeDown(USER, 'act_other'))
    await assertFails(suspend(USER, OTHER))
    await assertFails(writeRole(USER, OTHER, 'admin'))
    await assertFails(getDoc(doc(as(USER), 'roles', ADMIN)))
  })

  test('an admin may take down, suspend, and reverse both', async () => {
    await assertSucceeds(takeDown(ADMIN))
    await assertSucceeds(putBack(ADMIN))
    await assertSucceeds(suspend(ADMIN, USER))
    await assertSucceeds(lift(ADMIN, USER))
  })

  test('nobody may create an admin from inside the app — not even an admin', async () => {
    // The whole point of the rank: compromising any account in the app,
    // including an admin's, cannot produce another admin.
    await assertFails(writeRole(ADMIN, USER, 'admin'))
    await assertFails(writeRole(USER, USER, 'admin'))
  })

  test('the only role the app may write is "user" — there is no lesser rank to hand out', async () => {
    await assertFails(writeRole(ADMIN, USER, 'moderator'))
    await assertFails(writeRole(ADMIN, USER, 'Admin'))
    await assertSucceeds(writeRole(ADMIN, USER, 'user'))
  })

  test('a row that still says "moderator" grants nothing', async () => {
    // The rank existed once. A row left over from then is an ordinary user
    // in every respect: it acts on nobody and reads nothing of the queue.
    await assertFails(takeDown(LEGACY))
    await assertFails(suspend(LEGACY, USER))
    await assertFails(getDoc(doc(as(LEGACY), 'roles', USER)))
    await seed((db) => setDoc(doc(db, 'reports', 'rep'), report()))
    await assertFails(getDoc(doc(as(LEGACY), 'reports', 'rep')))
  })

  test('and an admin may act on it like any other account, bringing the row into line', async () => {
    await assertSucceeds(suspend(ADMIN, LEGACY))
    expect(await stored('roles', LEGACY)).toEqual({ role: 'user', suspended: true })
  })
})

describe('collision: the caller is also the target', () => {
  test('nobody may edit their own role row', async () => {
    // Somebody who can edit their own row can undo any limit placed on them.
    await assertFails(writeRole(ADMIN, ADMIN, 'user'))
    await assertFails(setDoc(doc(as(ADMIN), 'roles', ADMIN), { role: 'admin', suspended: false }))
    await assertFails(setDoc(doc(as(USER), 'roles', USER), { role: 'user', suspended: false }))
  })

  test('a suspended account may not lift its own suspension', async () => {
    await setRole(ADMIN, { role: 'admin', suspended: true })
    await assertFails(setDoc(doc(as(ADMIN), 'roles', ADMIN), { role: 'admin', suspended: false }))
    await setRole(USER, { suspended: true })
    await assertFails(lift(USER, USER))
  })

  test('an admin may not delete their own role row', async () => {
    // One mis-tap from locking every admin out of the project.
    await assertFails(deleteDoc(doc(as(ADMIN), 'roles', ADMIN)))
  })
})

describe('collision: peers of equal rank', () => {
  test('an admin may not suspend another admin', async () => {
    // Two admins able to disable each other is a race whose winner is
    // whoever moves first.
    await assertFails(suspend(ADMIN, ADMIN2))
  })

  test('an admin may not demote another admin', async () => {
    await assertFails(writeRole(ADMIN, ADMIN2, 'user'))
  })

  test('an admin may not delete another admin s role row', async () => {
    // Deleting the row is lifting every limit at once — a missing row means
    // an ordinary user in good standing. Without this, "an admin cannot
    // suspend another admin" would be true and pointless: they could erase
    // them instead, which is strictly worse.
    await assertFails(deleteDoc(doc(as(ADMIN), 'roles', ADMIN2)))
  })

  test('an admin may not warn another admin', async () => {
    await assertFails(
      setDoc(doc(as(ADMIN), 'warnings', 'w1'), {
        subjectId: ADMIN2,
        by: ADMIN,
        reason: 'Please read the policy.',
      }),
    )
  })
})

describe('collision: suspension against rank', () => {
  test('a suspended admin exercises no admin authority', async () => {
    await setRole(ADMIN, { role: 'admin', suspended: true })
    await assertFails(takeDown(ADMIN))
    await assertFails(suspend(ADMIN, USER))
    await assertFails(putBack(ADMIN))
    await seed((db) => setDoc(doc(db, 'reports', 'rep'), report()))
    await assertFails(getDoc(doc(as(ADMIN), 'reports', 'rep')))
  })

  test('a suspended account keeps its rank, so the suspension is reversible', async () => {
    // A suspended admin is lifted where they were made — in the console —
    // because no admin may touch another. A suspended user is lifted by
    // any admin, and their row survives the round trip.
    await setRole(ADMIN, { role: 'admin', suspended: true })
    await assertFails(setDoc(doc(as(ADMIN2), 'roles', ADMIN), { role: 'admin', suspended: false }))
    await setRole(USER, { suspended: true })
    await assertSucceeds(lift(ADMIN2, USER))
    expect(await stored('roles', USER)).toEqual({ role: 'user', suspended: false })
  })

  test('a suspended account can still read — that is the difference from a ban', async () => {
    await setRole(USER, { suspended: true })
    await assertSucceeds(getDoc(doc(as(USER), 'activities', 'act_other')))
    await assertSucceeds(getDoc(doc(as(USER), 'users', OTHER)))
    await assertSucceeds(getDoc(doc(as(USER), 'roles', USER)))
  })

  test('a suspended account cannot create, join or speak', async () => {
    await setRole(USER, { suspended: true })
    await assertFails(setDoc(doc(as(USER), 'activities', 'new'), activity(USER)))
    await assertFails(
      updateDoc(doc(as(USER), 'activities', 'act_other'), {
        participantUids: [OTHER, USER],
        updatedAt: 1,
      }),
    )
    await seed((db) =>
      setDoc(
        doc(db, 'activities', 'act_other'),
        activity(OTHER, { participantUids: [OTHER, USER] }),
      ),
    )
    await assertFails(
      setDoc(doc(as(USER), 'activities', 'act_other', 'messages', 'm1'), {
        senderId: USER,
        senderName: 'Person',
        text: 'hello',
      }),
    )
  })

  test('a suspended account can still leave something it joined', async () => {
    // Being suspended must not trap somebody in a plan they no longer want.
    await seed((db) =>
      setDoc(
        doc(db, 'activities', 'act_other'),
        activity(OTHER, { participantUids: [OTHER, USER] }),
      ),
    )
    await setRole(USER, { suspended: true })
    await assertSucceeds(
      updateDoc(doc(as(USER), 'activities', 'act_other'), {
        participantUids: [OTHER],
        updatedAt: 1,
      }),
    )
  })

  test('a suspended account cannot push notifications at people', async () => {
    // Notifications are writable by anyone, because "Bob joined your activity"
    // has to be written by Bob. That makes them the obvious way around a
    // suspension: no activity, no message, just a direct write to somebody's
    // notification list.
    await setRole(USER, { suspended: true })
    // Hosting act_user, so the roster check passes and the suspension is the
    // only thing standing in the way.
    await assertFails(
      setDoc(doc(as(USER), 'users', OTHER, 'notifications', 'n1'), {
        type: 'activity',
        title: 'Look at this',
        body: 'Reaching you anyway',
        activityId: 'act_user',
        read: false,
      }),
    )
  })

  test('a suspended host stops being joinable', async () => {
    // The sharpest collision in the system. Somebody is suspended precisely
    // because they may be a danger — and their existing activities stay live,
    // still in discovery, still accepting strangers. The suspension protects
    // nobody from the thing it was for.
    await setRole(USER, { suspended: true })
    await assertFails(
      updateDoc(doc(as(OTHER), 'activities', 'act_user'), {
        participantUids: [USER, OTHER],
        updatedAt: 1,
      }),
    )
  })
})

describe('collision: the reviewer is involved in the report', () => {
  test('an admin cannot close a report about themselves', async () => {
    // Rank does not buy an exemption from the conflict of interest.
    await seed((db) =>
      setDoc(doc(db, 'reports', 'rep'), report({ targetId: ADMIN, subjectId: ADMIN })),
    )
    await assertFails(closeReport(ADMIN))
  })

  test('an admin cannot close a report about an activity they host', async () => {
    await seed((db) =>
      setDoc(
        doc(db, 'reports', 'rep'),
        report({ targetType: 'activity', targetId: 'act_admin', subjectId: ADMIN }),
      ),
    )
    await assertFails(closeReport(ADMIN))
  })

  test('an admin cannot close a report about their own message', async () => {
    // The one the design missed: a message report records the message id, so
    // nothing in the report said whose message it was.
    await seed(async (db) => {
      await setDoc(doc(db, 'activities', 'act_user', 'messages', 'm1'), {
        senderId: ADMIN,
        senderName: 'Person',
        text: 'something unpleasant',
      })
      await setDoc(
        doc(db, 'reports', 'rep'),
        report({
          targetType: 'message',
          targetId: 'm1',
          activityId: 'act_user',
          subjectId: ADMIN,
        }),
      )
    })
    await assertFails(closeReport(ADMIN))
  })

  test('somebody uninvolved can close it', async () => {
    await seed((db) =>
      setDoc(doc(db, 'reports', 'rep'), report({ targetId: ADMIN, subjectId: ADMIN })),
    )
    await assertSucceeds(closeReport(ADMIN2))
  })

  test('once closed, it stays closed — even to somebody uninvolved', async () => {
    await seed((db) => setDoc(doc(db, 'reports', 'rep'), report()))
    await assertSucceeds(closeReport(ADMIN))
    await assertFails(closeReport(ADMIN2))
  })

  test('the reporter cannot close their own report either', async () => {
    // An admin who reports somebody and then rules on it is both parties.
    await seed((db) =>
      setDoc(
        doc(db, 'reports', 'rep'),
        report({ reporterId: ADMIN, targetId: USER, subjectId: USER }),
      ),
    )
    await assertFails(closeReport(ADMIN))
    await assertSucceeds(closeReport(ADMIN2))
  })

  test('a report naming an activity that no longer exists is still closable', async () => {
    await seed((db) =>
      setDoc(
        doc(db, 'reports', 'rep'),
        report({ targetType: 'activity', targetId: 'deleted', subjectId: OTHER }),
      ),
    )
    await assertSucceeds(closeReport(ADMIN))
  })

  test('nobody can rewrite what was reported while recording a decision', async () => {
    await seed((db) => setDoc(doc(db, 'reports', 'rep'), report()))
    await assertFails(
      updateDoc(doc(as(ADMIN), 'reports', 'rep'), {
        reason: 'spam',
        status: 'dismissed',
        reviewedBy: ADMIN,
      }),
    )
    await assertFails(deleteDoc(doc(as(ADMIN), 'reports', 'rep')))
  })
})

describe('a report has to name a real culprit', () => {
  // `subjectId` decides who gets suspended, so a reporter must not be able to
  // point it at somebody who had nothing to do with it.

  test('a user report must name the person reported', async () => {
    await assertSucceeds(
      setDoc(doc(as(OTHER), 'reports', 'r1'), report({ targetId: USER, subjectId: USER })),
    )
    await assertFails(
      setDoc(doc(as(OTHER), 'reports', 'r2'), report({ targetId: USER, subjectId: ADMIN })),
    )
  })

  test('an activity report must name that activity s host', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(OTHER), 'reports', 'r1'),
        report({ targetType: 'activity', targetId: 'act_user', subjectId: USER }),
      ),
    )
    await assertFails(
      setDoc(
        doc(as(OTHER), 'reports', 'r2'),
        report({ targetType: 'activity', targetId: 'act_user', subjectId: ADMIN }),
      ),
    )
  })

  test('a message report must name whoever sent that message', async () => {
    await seed((db) =>
      setDoc(doc(db, 'activities', 'act_admin', 'messages', 'm1'), {
        senderId: ADMIN,
        senderName: 'Person',
        text: 'something unpleasant',
      }),
    )
    await assertSucceeds(
      setDoc(
        doc(as(OTHER), 'reports', 'r1'),
        report({
          targetType: 'message',
          targetId: 'm1',
          activityId: 'act_admin',
          subjectId: ADMIN,
        }),
      ),
    )
    await assertFails(
      setDoc(
        doc(as(OTHER), 'reports', 'r2'),
        report({
          targetType: 'message',
          targetId: 'm1',
          activityId: 'act_admin',
          subjectId: USER,
        }),
      ),
    )
  })

  test('a report cannot be filed in somebody else s name', async () => {
    await assertFails(
      setDoc(doc(as(OTHER), 'reports', 'r1'), report({ reporterId: USER, subjectId: ADMIN })),
    )
  })
})

describe('collision: moderation against blocking', () => {
  test('blocking the admin does not put you beyond moderation', async () => {
    // Otherwise the way to become unmoderatable is to block the admin.
    await seed((db) => setDoc(doc(db, 'users', USER, 'blocked', ADMIN), { name: 'Admin' }))
    await assertSucceeds(takeDown(ADMIN))
    await assertSucceeds(suspend(ADMIN, USER))
  })

  test('an admin may still join and leave like anybody else', async () => {
    // Moderating is a job, not a different kind of membership.
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), 'activities', 'act_user'), {
        participantUids: [USER, ADMIN],
        updatedAt: 1,
      }),
    )
  })

  test('a host who blocked somebody still does not have to host them', async () => {
    await seed((db) => setDoc(doc(db, 'users', USER, 'blocked', OTHER), { name: 'Other' }))
    await assertFails(
      updateDoc(doc(as(OTHER), 'activities', 'act_user'), {
        participantUids: [USER, OTHER],
        updatedAt: 1,
      }),
    )
  })

  test('somebody you blocked cannot reach you through notifications', async () => {
    // Blocking is meant to stop them reaching you. A direct write to your
    // notification list is reaching you.
    await seed(async (db) => {
      await setDoc(doc(db, 'users', USER, 'blocked', OTHER), { name: 'Other' })
      // On the roster, so the block is the only reason this is refused.
      await setDoc(
        doc(db, 'activities', 'act_user'),
        activity(USER, { participantUids: [USER, OTHER] }),
      )
    })
    await assertFails(
      setDoc(doc(as(OTHER), 'users', USER, 'notifications', 'n1'), {
        type: 'activity',
        title: 'Hello again',
        body: 'Still here',
        activityId: 'act_user',
        read: false,
      }),
    )
  })
})

describe('collision: an admin acting on their own activity', () => {
  test('an admin may take down their own activity', async () => {
    // Allowed, and harmless: it is strictly worse for them than cancelling,
    // and every takedown is on the record.
    await assertSucceeds(takeDown(ADMIN, 'act_admin'))
  })

  test('and may put it back — a mistake has to be fixable, on the record', async () => {
    await takeDown(ADMIN, 'act_admin')
    await assertSucceeds(putBack(ADMIN2, 'act_admin'))
    await takeDown(ADMIN, 'act_admin')
    await assertSucceeds(putBack(ADMIN, 'act_admin'))
    expect((await stored('activities', 'act_admin')).moderation.by).toBe(ADMIN)
  })

  test('an admin cannot edit an activity under cover of moderating it', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), 'activities', 'act_user'), { title: 'Rewritten' }))
    await assertFails(updateDoc(doc(as(ADMIN), 'activities', 'act_user'), { hostId: ADMIN }))
    await assertFails(
      updateDoc(doc(as(ADMIN), 'activities', 'act_user'), {
        participantUids: [USER, OTHER],
        updatedAt: 1,
      }),
    )
  })

  test('an admin cannot quietly cancel instead of removing', async () => {
    // Cancelling reads as the host calling it off. Removing says SmartSync
    // took it down. An admin must not be able to choose the first.
    await assertFails(
      updateDoc(doc(as(ADMIN), 'activities', 'act_user'), { status: 'cancelled', updatedAt: 1 }),
    )
  })

  test('the host cannot put back what an admin took down', async () => {
    await takeDown(ADMIN, 'act_user')
    await assertFails(putBack(USER, 'act_user'))
    await assertFails(
      updateDoc(doc(as(USER), 'activities', 'act_user'), { status: 'active', updatedAt: 1 }),
    )
  })
})

describe('the role row, from inside the app', () => {
  // The rows the console writes: three fields, read first and merged, so
  // that a suspension and a closure never clobber each other.

  test('a suspension survives a closure, and a closure a suspension', async () => {
    await setRole(USER, { suspended: true })
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'roles', USER), { role: 'user', suspended: true, banned: true }),
    )
    expect(await stored('roles', USER)).toEqual({ role: 'user', suspended: true, banned: true })
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'roles', USER), { role: 'user', suspended: false, banned: true }),
    )
    expect(await stored('roles', USER)).toEqual({ role: 'user', suspended: false, banned: true })
  })

  test('an ordinary user cannot write a role row, their own included', async () => {
    await assertFails(writeRole(USER, USER, 'user'))
    await assertFails(writeRole(USER, OTHER, 'user'))
    await assertFails(suspend(USER, OTHER))
  })

  test('an admin can read every role row, which is what the accounts list needs', async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN), 'roles', ADMIN2)))
    await assertSucceeds(getDoc(doc(as(ADMIN), 'roles', LEGACY)))
    await assertFails(getDoc(doc(as(USER), 'roles', ADMIN)))
  })

  test('no write can smuggle in a fourth field', async () => {
    // The console writes exactly three fields. Anything else would be a way
    // to put state on a role document that nothing validates.
    await assertFails(
      setDoc(doc(as(ADMIN), 'roles', USER), {
        role: 'user',
        suspended: false,
        canDeleteEverything: true,
      }),
    )
  })

  test('the flags have to be booleans', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'roles', USER), { role: 'user', suspended: 'yes' }))
    await assertFails(
      setDoc(doc(as(ADMIN), 'roles', USER), { role: 'user', suspended: false, banned: 'yes' }),
    )
  })
})

describe('oversight: acting without a report', () => {
  // The moderation screens started report-driven, so every power was reached
  // through a report document. Oversight reaches the same powers directly —
  // browse everybody, take something down you noticed. The rules never
  // mentioned reports, so the same limits have to hold on this path, and
  // these tests are what says so rather than assuming it.

  test('an admin can take down an activity nobody reported', async () => {
    await assertSucceeds(takeDown(ADMIN, 'act_user'))
  })

  test('an admin can suspend somebody nobody reported', async () => {
    await assertSucceeds(suspend(ADMIN, USER))
  })

  test('the rank limits still hold with no report in sight', async () => {
    await assertFails(suspend(ADMIN, ADMIN2))
    await assertFails(takeDown(USER, 'act_other'))
    await assertFails(putBack(USER, 'act_user'))
  })

  test('browsing everybody is reading public profiles, and only those', async () => {
    // The directory an admin sees is the public half. The private half is
    // its owner's and nobody else's — an admin included. Oversight means
    // seeing public behaviour, not opening people's records.
    await seed((db) =>
      setDoc(doc(db, 'users', USER, 'private', 'profile'), {
        email: 'someone@example.com',
        realName: 'Their Real Name',
        location: { lat: 13.7, lng: 100.5 },
      }),
    )
    await assertSucceeds(getDoc(doc(as(ADMIN), 'users', USER)))
    await assertFails(getDoc(doc(as(ADMIN), 'users', USER, 'private', 'profile')))
  })

  test('an admin cannot read somebody else s block list either', async () => {
    // Who has blocked whom stays private. Publishing it would tell people
    // they had been blocked and by whom, which is its own kind of harm, and
    // rank does not change that.
    await seed((db) => setDoc(doc(db, 'users', USER, 'blocked', OTHER), { name: 'Other' }))
    await assertFails(getDoc(doc(as(ADMIN), 'users', USER, 'blocked', OTHER)))
  })

  test('an admin cannot read a chat they did not join', async () => {
    // The sharpest limit on oversight. Moderation reaches what is posted in
    // public and what somebody reports; it does not reach a private
    // conversation just because somebody has a rank.
    await seed((db) =>
      setDoc(doc(db, 'activities', 'act_user', 'messages', 'm1'), {
        senderId: USER,
        senderName: 'Person',
        text: 'something private',
      }),
    )
    await assertFails(getDoc(doc(as(ADMIN), 'activities', 'act_user', 'messages', 'm1')))
  })

  test('an admin who joined an activity can read its chat, like any member', async () => {
    await seed((db) =>
      setDoc(doc(db, 'activities', 'act_user'), activity(USER, { participantUids: [USER, ADMIN] })),
    )
    await seed((db) =>
      setDoc(doc(db, 'activities', 'act_user', 'messages', 'm1'), {
        senderId: USER,
        senderName: 'Person',
        text: 'hello',
      }),
    )
    await assertSucceeds(getDoc(doc(as(ADMIN), 'activities', 'act_user', 'messages', 'm1')))
  })

  test('taking something down still has to say why, however it was reached', async () => {
    await assertFails(
      updateDoc(doc(as(ADMIN), 'activities', 'act_user'), {
        status: 'removed',
        moderation: { by: ADMIN, reason: '' },
        updatedAt: 1,
      }),
    )
    await assertFails(
      updateDoc(doc(as(ADMIN), 'activities', 'act_user'), { status: 'removed', updatedAt: 1 }),
    )
  })

  test('an ordinary user browsing cannot act on anybody', async () => {
    // They can read public profiles — discovery needs that — and that is all.
    await assertSucceeds(getDoc(doc(as(USER), 'users', OTHER)))
    await assertFails(suspend(USER, OTHER))
    await assertFails(takeDown(USER, 'act_other'))
    await assertFails(getDoc(doc(as(USER), 'roles', OTHER)))
  })

  test('a suspended admin browsing can act on nobody', async () => {
    await setRole(ADMIN, { role: 'admin', suspended: true })
    await assertSucceeds(getDoc(doc(as(ADMIN), 'users', USER)))
    await assertFails(suspend(ADMIN, USER))
    await assertFails(takeDown(ADMIN, 'act_user'))
  })
})

describe('an admin cannot touch what a user wrote', () => {
  // The whole point of the rank is safety, not editorial control. An admin
  // can make an activity disappear and say why. They cannot change a word of
  // it — because an activity that has been quietly rewritten by somebody
  // other than its host is worse than one that was taken down, and the host
  // would have no way to tell.

  const FIELDS = {
    title: 'Rewritten by an admin',
    description: 'Different description',
    category: 'Gym',
    locationName: 'Somewhere else',
    lat: 0,
    lng: 0,
    date: '2031-01-01',
    time: '06:00',
    timeBand: 'Morning',
    capacity: 400,
    tags: ['Gym'],
    hostId: ADMIN,
    hostName: 'Not the host',
    // Not [USER, ADMIN] — an admin adding themselves is an ordinary join,
    // which they may do like anybody. Adding a third party is the thing a
    // rank must not let them do.
    participantUids: [USER, OTHER],
  }

  for (const [field, value] of Object.entries(FIELDS)) {
    test(`an admin cannot change ${field}`, async () => {
      await assertFails(updateDoc(doc(as(ADMIN), 'activities', 'act_user'), { [field]: value }))
    })
  }

  test('nor can they smuggle an edit in alongside a takedown', async () => {
    // The takedown itself is allowed. Attaching anything else to the same
    // write is not, because `touches` pins the whole key set and not just
    // the keys anybody thought to check.
    await assertFails(
      updateDoc(doc(as(ADMIN), 'activities', 'act_user'), {
        status: 'removed',
        moderation: { by: ADMIN, reason: 'Breaks the safety policy' },
        title: 'Rewritten by an admin',
        updatedAt: 1,
      }),
    )
  })

  test('and the host can still edit their own', async () => {
    // The limit is on the rank, not on the activity.
    await assertSucceeds(updateDoc(doc(as(USER), 'activities', 'act_user'), { title: 'New name' }))
  })
})

describe('warnings — the rung below a suspension', () => {
  const warning = (over = {}) => ({
    subjectId: USER,
    by: ADMIN,
    reason: 'Several people reported the same behaviour. Please read the community policy.',
    ...over,
  })

  test('an admin can warn an ordinary user', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'warnings', 'w1'), warning()))
  })

  test('the person warned can read it — a warning nobody can review is a rumour', async () => {
    await seed((db) => setDoc(doc(db, 'warnings', 'w1'), warning()))
    await assertSucceeds(getDoc(doc(as(USER), 'warnings', 'w1')))
  })

  test('somebody else cannot read it', async () => {
    await seed((db) => setDoc(doc(db, 'warnings', 'w1'), warning()))
    await assertFails(getDoc(doc(as(OTHER), 'warnings', 'w1')))
  })

  test('a warning is a record: nobody can edit or delete one', async () => {
    await seed((db) => setDoc(doc(db, 'warnings', 'w1'), warning()))
    await assertFails(
      updateDoc(doc(as(ADMIN), 'warnings', 'w1'), { reason: 'Actually never mind' }),
    )
    await assertFails(updateDoc(doc(as(ADMIN2), 'warnings', 'w1'), { reason: 'Softer' }))
    await assertFails(deleteDoc(doc(as(ADMIN), 'warnings', 'w1')))
    await assertFails(deleteDoc(doc(as(USER), 'warnings', 'w1')))
  })

  test('a warning has to say something', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'warnings', 'w1'), warning({ reason: '' })))
  })

  test('an admin cannot pin a warning on somebody else', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'warnings', 'w1'), warning({ by: ADMIN2 })))
  })

  test('nobody warns themselves, and no admin warns another admin', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'warnings', 'w1'), warning({ subjectId: ADMIN })))
    await assertFails(setDoc(doc(as(ADMIN), 'warnings', 'w1'), warning({ subjectId: ADMIN2 })))
  })

  test('an ordinary user cannot warn anybody, and neither can a legacy row', async () => {
    await assertFails(setDoc(doc(as(USER), 'warnings', 'w1'), warning({ by: USER })))
    await assertFails(setDoc(doc(as(LEGACY), 'warnings', 'w1'), warning({ by: LEGACY })))
  })

  describe('a warning that names its report', () => {
    const seedReport = (over = {}) => seed((db) => setDoc(doc(db, 'reports', 'r1'), report(over)))
    const claim = (by) => ({ by, at: serverTimestamp() })
    const claimAs = (by) => updateDoc(doc(as(by), 'reports', 'r1'), { claim: claim(by) })
    const warnFrom = (by, over = {}) =>
      setDoc(doc(as(by), 'warnings', 'w1'), warning({ by, reportId: 'r1', ...over }))

    test('lands only while the claim is held', async () => {
      await seedReport()
      // Named a report it does not hold: refused.
      await assertFails(warnFrom(ADMIN))
      await assertSucceeds(claimAs(ADMIN))
      await assertSucceeds(warnFrom(ADMIN))
    })

    test('is refused under somebody else’s fresh claim', async () => {
      await seedReport()
      await assertSucceeds(claimAs(ADMIN2))
      await assertFails(warnFrom(ADMIN))
    })

    test('is refused once the report is closed, and when the report does not exist', async () => {
      await seedReport({ status: 'dismissed', claim: { by: ADMIN, at: new Date() } })
      await assertFails(warnFrom(ADMIN))
      await assertFails(
        setDoc(doc(as(ADMIN), 'warnings', 'w2'), warning({ by: ADMIN, reportId: 'nope' })),
      )
    })

    test('has to be about the person the report is about', async () => {
      await seedReport()
      await assertSucceeds(claimAs(ADMIN))
      // OTHER is the reporter, not the subject.
      await assertFails(warnFrom(ADMIN, { subjectId: OTHER }))
      await assertSucceeds(warnFrom(ADMIN, { subjectId: USER }))
    })

    test('a report filed before subjects were recorded still takes a warning under its claim', async () => {
      // eslint-disable-next-line no-unused-vars
      const { subjectId, ...legacy } = report()
      await seed((db) => setDoc(doc(db, 'reports', 'r1'), legacy))
      await assertSucceeds(claimAs(ADMIN))
      await assertSucceeds(warnFrom(ADMIN))
    })

    test('a warning from a profile names no report and is judged as before', async () => {
      await seedReport()
      await assertSucceeds(claimAs(ADMIN2))
      await assertSucceeds(setDoc(doc(as(ADMIN), 'warnings', 'w1'), warning()))
    })

    test('the warning and the release of the claim commit together', async () => {
      await seedReport()
      await assertSucceeds(claimAs(ADMIN))
      const db = as(ADMIN)
      const batch = writeBatch(db)
      batch.set(doc(db, 'warnings', 'w1'), warning({ by: ADMIN, reportId: 'r1' }))
      batch.update(doc(db, 'reports', 'r1'), { claim: deleteField() })
      await assertSucceeds(batch.commit())
      const after = await stored('reports', 'r1')
      expect(after.claim).toBeUndefined()
      expect(after.status).toBe('open')
    })
  })
})

describe('the decision commits with the action, or neither does', () => {
  // A role row cannot name a report, so the rules cannot tie a suspension
  // to a claim on that write. The app commits the decision in the same
  // transaction instead; these pin the rules' half of that: the decision
  // needs the claim, and a batch is all or nothing — so a suspension
  // recorded against a report cannot land without holding its claim.
  const seedReport = (over = {}) => seed((db) => setDoc(doc(db, 'reports', 'r1'), report(over)))
  const claimAs = (by) =>
    updateDoc(doc(as(by), 'reports', 'r1'), { claim: { by, at: serverTimestamp() } })
  const decision = (by) => ({
    status: 'actioned',
    outcome: 'Account suspended',
    reviewedBy: by,
    reviewedAt: serverTimestamp(),
  })
  const suspendAndRecord = (by) => {
    const db = as(by)
    const batch = writeBatch(db)
    batch.set(doc(db, 'roles', USER), { role: 'user', suspended: true }, { merge: true })
    batch.update(doc(db, 'reports', 'r1'), decision(by))
    return batch.commit()
  }
  const roleOf = (uid) => stored('roles', uid)

  test('under the admin’s own claim, both land', async () => {
    await seedReport()
    await assertSucceeds(claimAs(ADMIN))
    await assertSucceeds(suspendAndRecord(ADMIN))
    expect(await roleOf(USER)).toMatchObject({ suspended: true })
    expect(await stored('reports', 'r1')).toMatchObject({ status: 'actioned', reviewedBy: ADMIN })
  })

  test('without a claim, the suspension does not land either', async () => {
    await seedReport()
    await assertFails(suspendAndRecord(ADMIN))
    expect(await roleOf(USER)).toBeUndefined()
  })

  test('under a colleague’s fresh claim, nothing lands', async () => {
    await seedReport()
    await assertSucceeds(claimAs(ADMIN2))
    await assertFails(suspendAndRecord(ADMIN))
    expect(await roleOf(USER)).toBeUndefined()
    expect((await stored('reports', 'r1')).status).toBe('open')
  })

  test('on a report already closed, nothing lands — the first decision stands', async () => {
    await seedReport({
      status: 'dismissed',
      reviewedBy: ADMIN2,
      claim: { by: ADMIN, at: new Date() },
    })
    await assertFails(suspendAndRecord(ADMIN))
    expect(await roleOf(USER)).toBeUndefined()
  })

  test('a suspension that names no report is judged by the role rules alone', async () => {
    await seedReport()
    await assertSucceeds(claimAs(ADMIN2))
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'roles', USER), { role: 'user', suspended: true }, { merge: true }),
    )
  })

  test('a takedown and its decision commit together, and not at all under another’s claim', async () => {
    await seedReport({ targetType: 'activity', targetId: 'act_user' })
    await assertSucceeds(claimAs(ADMIN2))
    const admin = as(ADMIN)
    const refused = writeBatch(admin)
    refused.update(doc(admin, 'activities', 'act_user'), {
      status: 'removed',
      moderation: { by: ADMIN, reason: 'spam', reportId: 'r1' },
      updatedAt: 1,
    })
    refused.update(doc(admin, 'reports', 'r1'), decision(ADMIN))
    await assertFails(refused.commit())
    expect((await stored('activities', 'act_user')).status).toBe('active')

    // Over after five minutes; the taker's batch lands whole.
    await seed((db) =>
      updateDoc(doc(db, 'reports', 'r1'), {
        claim: { by: ADMIN2, at: new Date(Date.now() - 10 * 60_000) },
      }),
    )
    await assertSucceeds(claimAs(ADMIN))
    const allowed = writeBatch(admin)
    allowed.update(doc(admin, 'activities', 'act_user'), {
      status: 'removed',
      moderation: { by: ADMIN, reason: 'spam', reportId: 'r1' },
      updatedAt: 1,
    })
    allowed.update(doc(admin, 'reports', 'r1'), decision(ADMIN))
    await assertSucceeds(allowed.commit())
    expect((await stored('activities', 'act_user')).status).toBe('removed')
    expect((await stored('reports', 'r1')).status).toBe('actioned')
  })
})

describe('closing an account', () => {
  const close = (actor, target) =>
    setDoc(doc(as(actor), 'roles', target), { role: 'user', suspended: false, banned: true })

  test('an admin can close an ordinary account', async () => {
    await assertSucceeds(close(ADMIN, USER))
  })

  test('an ordinary user cannot close anybody', async () => {
    await assertFails(close(USER, OTHER))
    await assertFails(close(LEGACY, OTHER))
  })

  test('an admin can reopen one, because a mistake has to be fixable', async () => {
    await seed((db) =>
      setDoc(doc(db, 'roles', USER), { role: 'user', suspended: false, banned: true }),
    )
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'roles', USER), { role: 'user', suspended: false, banned: false }),
    )
  })

  test('nobody can close an admin, and no admin can close themselves', async () => {
    await assertFails(close(ADMIN, ADMIN2))
    await assertFails(close(ADMIN, ADMIN))
    await assertFails(close(USER, ADMIN))
  })

  test('a legacy moderator row can be closed like any other account', async () => {
    await assertSucceeds(close(ADMIN, LEGACY))
  })
})

describe('what a closed account can still do', () => {
  beforeEach(() =>
    seed((db) => setDoc(doc(db, 'roles', USER), { role: 'user', suspended: false, banned: true })),
  )

  test('read its own profile, so the app can say what happened', async () => {
    // Without this the app cannot boot far enough to explain itself, and a
    // blank error screen is not an explanation.
    await assertSucceeds(getDoc(doc(as(USER), 'users', USER)))
    await assertSucceeds(getDoc(doc(as(USER), 'users', USER, 'private', 'profile')))
    await assertSucceeds(getDoc(doc(as(USER), 'roles', USER)))
  })

  test('and nothing else at all', async () => {
    await assertFails(getDoc(doc(as(USER), 'activities', 'act_other')))
    await assertFails(getDoc(doc(as(USER), 'users', OTHER)))
  })

  test('cannot host, join, message, report or warn', async () => {
    await assertFails(setDoc(doc(as(USER), 'activities', 'new'), activity(USER)))
    await assertFails(
      updateDoc(doc(as(USER), 'activities', 'act_other'), {
        participantUids: [OTHER, USER],
        updatedAt: 1,
      }),
    )
    // Shaped so the ONLY thing that can refuse it is the closure. The first
    // version of this passed for the wrong reason — its subjectId did not
    // match its targetId, so `namesTheRightPerson` refused it and the ban was
    // never exercised. A test that passes for the wrong reason is worse than
    // no test, and this one was hiding a real hole: a closed account could
    // file reports, which a live probe then found.
    await assertFails(
      setDoc(
        doc(as(USER), 'reports', 'r1'),
        report({ reporterId: USER, targetType: 'user', targetId: OTHER, subjectId: OTHER }),
      ),
    )
  })

  test('and a suspended account still can, which is the difference', async () => {
    // The limit is on what they can do to other people, not on their ability
    // to say somebody is a danger.
    await setRole(OTHER, { role: 'user', suspended: true })
    await assertSucceeds(
      setDoc(
        doc(as(OTHER), 'reports', 'r2'),
        report({ reporterId: OTHER, targetType: 'user', targetId: USER, subjectId: USER }),
      ),
    )
  })

  test('cannot reach anybody through a notification', async () => {
    await assertFails(
      setDoc(doc(as(USER), 'users', OTHER, 'notifications', 'n1'), {
        type: 'activity',
        title: 'Still here',
        body: 'Reaching you anyway',
        activityId: 'act_user',
        read: false,
      }),
    )
  })

  test('cannot edit its own profile to slip the name recognition', async () => {
    await assertFails(setDoc(doc(as(USER), 'users', USER), profile(USER)))
  })

  test('a closed admin exercises nothing', async () => {
    await seed((db) =>
      setDoc(doc(db, 'roles', ADMIN), { role: 'admin', suspended: false, banned: true }),
    )
    await assertFails(takeDown(ADMIN, 'act_user'))
    await assertFails(suspend(ADMIN, OTHER))
    await seed((db) => setDoc(doc(db, 'reports', 'rep'), report()))
    await assertFails(getDoc(doc(as(ADMIN), 'reports', 'rep')))
  })
})

describe('a role document that was written by hand', () => {
  // Roles are bootstrapped in the Firebase console, so malformed rows are a
  // realistic input, not a hypothetical one. Every one of these must fail
  // closed — deny — rather than erroring into somebody having authority.

  test('a row with no role field grants nothing', async () => {
    await seed((db) => setDoc(doc(db, 'roles', ADMIN), { suspended: false }))
    await assertFails(takeDown(ADMIN))
    await assertFails(suspend(ADMIN, USER))
  })

  test('a row with no suspended field grants nothing', async () => {
    // Reading a missing key errors the rule, and an error is a denial. The
    // bootstrap row in the README has both fields for exactly this reason.
    await seed((db) => setDoc(doc(db, 'roles', ADMIN), { role: 'admin' }))
    await assertFails(takeDown(ADMIN))
  })

  test('a misspelled role grants nothing', async () => {
    await seed((db) => setDoc(doc(db, 'roles', ADMIN), { role: 'Admin', suspended: false }))
    await assertFails(takeDown(ADMIN))
    await seed((db) => setDoc(doc(db, 'roles', ADMIN), { role: 'admin ', suspended: false }))
    await assertFails(takeDown(ADMIN))
  })

  test('suspended as a string is not suspended as a boolean', async () => {
    // 'false' is a truthy string in most languages and a non-boolean here.
    // It must not read as "not suspended" by accident.
    await seed((db) => setDoc(doc(db, 'roles', ADMIN), { role: 'admin', suspended: 'false' }))
    await assertSucceeds(takeDown(ADMIN))
    await seed((db) => setDoc(doc(db, 'roles', ADMIN), { role: 'admin', suspended: 'true' }))
    await assertSucceeds(takeDown(ADMIN))
  })

  test('an admin written by hand has full authority', async () => {
    // The bootstrap path itself — the one documented in the README.
    await seed((db) => setDoc(doc(db, 'roles', USER), { role: 'admin', suspended: false }))
    await assertSucceeds(suspend(USER, OTHER))
    await assertSucceeds(takeDown(USER, 'act_other'))
  })

  test('a "moderator" written by hand has none', async () => {
    await seed((db) => setDoc(doc(db, 'roles', USER), { role: 'moderator', suspended: false }))
    await assertFails(suspend(USER, OTHER))
    await assertFails(takeDown(USER, 'act_other'))
  })
})

describe('who can see the queue', () => {
  beforeEach(() => seed((db) => setDoc(doc(db, 'reports', 'rep'), report())))

  test('an admin can read a report they did not file', async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN), 'reports', 'rep')))
    await assertSucceeds(getDoc(doc(as(ADMIN2), 'reports', 'rep')))
  })

  test('an ordinary user cannot read somebody else s report', async () => {
    await assertFails(getDoc(doc(as(USER), 'reports', 'rep')))
  })

  test('the person reported cannot read the report about them', async () => {
    // USER is the subject here, and has no rank.
    await assertFails(getDoc(doc(as(USER), 'reports', 'rep')))
  })

  test('a reporter can read back their own', async () => {
    await assertSucceeds(getDoc(doc(as(OTHER), 'reports', 'rep')))
  })

  test('an ordinary user cannot read anybody s role but their own', async () => {
    await assertSucceeds(getDoc(doc(as(USER), 'roles', USER)))
    await assertFails(getDoc(doc(as(USER), 'roles', ADMIN)))
  })
})
