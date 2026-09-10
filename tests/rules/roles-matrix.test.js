/**
 * The authority matrix.
 *
 * `firestore.test.js` tests the rules feature by feature. This file tests the
 * one thing that cuts across all of them: **who may do what to whom**, at
 * every combination of the caller's rank, the target's rank, and the
 * relationship between them.
 *
 * The interesting cases are the collisions — where one person wears two hats
 * at once. A moderator who is also the host of the activity being reported. A
 * moderator who is also the person reported. An admin acting on another admin.
 * A suspended account that is also a host with people already going. Each of
 * those is a place where two correct-looking rules can combine into something
 * nobody intended, and none of them is visible from reading a single rule.
 *
 * Every test states the harm it is preventing, not just the mechanic.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let testEnv

// Ranks
const ADMIN = 'admin_a'
const ADMIN2 = 'admin_b'
const MOD = 'mod_a'
const MOD2 = 'mod_b'
const USER = 'user_a'
const OTHER = 'user_b'

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

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seed(async (db) => {
    for (const uid of [ADMIN, ADMIN2, MOD, MOD2, USER, OTHER]) {
      await setDoc(doc(db, 'users', uid), profile(uid))
    }
    await setDoc(doc(db, 'roles', ADMIN), { role: 'admin', suspended: false })
    await setDoc(doc(db, 'roles', ADMIN2), { role: 'admin', suspended: false })
    await setDoc(doc(db, 'roles', MOD), { role: 'moderator', suspended: false })
    await setDoc(doc(db, 'roles', MOD2), { role: 'moderator', suspended: false })
    // USER and OTHER deliberately have no role document: no row means an
    // ordinary user, which is the state most accounts are in.
    await setDoc(doc(db, 'activities', 'act_user'), activity(USER))
    await setDoc(doc(db, 'activities', 'act_mod'), activity(MOD))
    await setDoc(doc(db, 'activities', 'act_admin'), activity(ADMIN))
  })
})

const as = (uid) => testEnv.authenticatedContext(uid).firestore()
const setRole = (uid, data) =>
  seed((db) => setDoc(doc(db, 'roles', uid), { role: 'user', suspended: false, ...data }))

// The four things a rank can do, each as one call, so the matrix below reads
// as a table rather than as a pile of Firestore calls.
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

const suspend = (actor, target, role = 'user') =>
  setDoc(doc(as(actor), 'roles', target), { role, suspended: true })

const appoint = (actor, target, role = 'moderator') =>
  setDoc(doc(as(actor), 'roles', target), { role, suspended: false })

const closeReport = (actor, reportId = 'rep') =>
  updateDoc(doc(as(actor), 'reports', reportId), {
    status: 'dismissed',
    outcome: 'No action needed',
    reviewedBy: actor,
    reviewedAt: 1,
  })

// ---------------------------------------------------------------------------

describe('what each rank may do at all', () => {
  test('an ordinary user has no authority over anybody', async () => {
    await assertFails(takeDown(USER, 'act_mod'))
    await assertFails(suspend(USER, OTHER))
    await assertFails(appoint(USER, OTHER))
    await assertFails(getDoc(doc(as(USER), 'roles', MOD)))
  })

  test('a moderator may take down and suspend, and nothing about roles', async () => {
    await assertSucceeds(takeDown(MOD))
    await assertSucceeds(suspend(MOD, USER))
    await assertFails(appoint(MOD, USER))
    await assertFails(appoint(MOD, MOD2, 'user'))
  })

  test('a moderator may not put back what was taken down', async () => {
    // Reversing a decision is a rank above making one — otherwise the person
    // who made a bad call is the person who decides it was fine.
    await seed((db) =>
      setDoc(
        doc(db, 'activities', 'act_user'),
        activity(USER, { status: 'removed', moderation: { by: MOD2, reason: 'Unsafe' } }),
      ),
    )
    await assertFails(putBack(MOD))
  })

  test('an admin may do everything a moderator can, and reverse it', async () => {
    await assertSucceeds(takeDown(ADMIN))
    await seed((db) =>
      setDoc(
        doc(db, 'activities', 'act_user'),
        activity(USER, { status: 'removed', moderation: { by: MOD, reason: 'Unsafe' } }),
      ),
    )
    await assertSucceeds(putBack(ADMIN))
    await assertSucceeds(appoint(ADMIN, USER))
  })

  test('nobody may create an admin from inside the app — not even an admin', async () => {
    // The whole point of the rank: compromising any account in the app,
    // including an admin's, cannot produce another admin.
    await assertFails(setDoc(doc(as(ADMIN), 'roles', USER), { role: 'admin', suspended: false }))
    await assertFails(setDoc(doc(as(MOD), 'roles', USER), { role: 'admin', suspended: false }))
    await assertFails(setDoc(doc(as(USER), 'roles', USER), { role: 'admin', suspended: false }))
  })
})

describe('collision: the caller is also the target', () => {
  test('nobody may edit their own role row', async () => {
    // Somebody who can edit their own row can undo any limit placed on them.
    await assertFails(appoint(MOD, MOD, 'admin'))
    await assertFails(appoint(ADMIN, ADMIN, 'admin'))
    await assertFails(setDoc(doc(as(USER), 'roles', USER), { role: 'user', suspended: false }))
  })

  test('a suspended account may not lift its own suspension', async () => {
    await setRole(MOD, { role: 'moderator', suspended: true })
    await assertFails(appoint(MOD, MOD, 'moderator'))
    await setRole(ADMIN, { role: 'admin', suspended: true })
    await assertFails(setDoc(doc(as(ADMIN), 'roles', ADMIN), { role: 'admin', suspended: false }))
  })

  test('an admin may not delete their own role row', async () => {
    // One mis-tap from locking every admin out of the project.
    await assertFails(deleteDoc(doc(as(ADMIN), 'roles', ADMIN)))
  })
})

describe('collision: peers of equal rank', () => {
  test('a moderator may not suspend a fellow moderator', async () => {
    // Two moderators able to disable each other is a race whose winner is
    // whoever moves first.
    await assertFails(suspend(MOD, MOD2))
  })

  test('a moderator may not demote a fellow moderator', async () => {
    await assertFails(appoint(MOD, MOD2, 'user'))
  })

  test('a moderator may not suspend an admin', async () => {
    await assertFails(suspend(MOD, ADMIN))
  })

  test('an admin may not suspend another admin', async () => {
    await assertFails(suspend(ADMIN, ADMIN2))
  })

  test('an admin may not demote another admin', async () => {
    await assertFails(appoint(ADMIN, ADMIN2, 'user'))
  })

  test('an admin may not delete another admin s role row', async () => {
    // Deleting the row is demotion by another name — a missing row means an
    // ordinary user. Without this, "an admin cannot suspend another admin"
    // would be true and pointless: they could erase them instead, which is
    // strictly worse than suspending them.
    await assertFails(deleteDoc(doc(as(ADMIN), 'roles', ADMIN2)))
  })

  test('but an admin may dismiss a moderator', async () => {
    await assertSucceeds(appoint(ADMIN, MOD2, 'user'))
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'roles', MOD2)))
  })

  test('an admin may suspend a moderator without demoting them', async () => {
    await assertSucceeds(suspend(ADMIN, MOD2, 'moderator'))
    let after
    await seed(async (db) => {
      after = (await getDoc(doc(db, 'roles', MOD2))).data()
    })
    expect(after).toEqual({ role: 'moderator', suspended: true })
  })
})

describe('collision: suspension against rank', () => {
  test('a suspended moderator exercises no moderator authority', async () => {
    await setRole(MOD, { role: 'moderator', suspended: true })
    await assertFails(takeDown(MOD))
    await assertFails(suspend(MOD, USER))
    await assertFails(getDoc(doc(as(MOD), 'reports', 'rep')))
  })

  test('a suspended admin exercises no admin authority', async () => {
    await setRole(ADMIN, { role: 'admin', suspended: true })
    await assertFails(appoint(ADMIN, USER))
    await assertFails(takeDown(ADMIN))
  })

  test('a suspended account keeps its rank, so the suspension is reversible', async () => {
    await setRole(MOD, { role: 'moderator', suspended: true })
    await assertSucceeds(setDoc(doc(as(ADMIN), 'roles', MOD), { role: 'moderator', suspended: false }))
  })

  test('a suspended account can still read — that is the difference from a ban', async () => {
    await setRole(USER, { suspended: true })
    await assertSucceeds(getDoc(doc(as(USER), 'activities', 'act_mod')))
    await assertSucceeds(getDoc(doc(as(USER), 'users', OTHER)))
    await assertSucceeds(getDoc(doc(as(USER), 'roles', USER)))
  })

  test('a suspended account cannot create, join or speak', async () => {
    await setRole(USER, { suspended: true })
    await assertFails(setDoc(doc(as(USER), 'activities', 'new'), activity(USER)))
    await assertFails(
      updateDoc(doc(as(USER), 'activities', 'act_mod'), {
        participantUids: [MOD, USER],
        updatedAt: 1,
      }),
    )
    await seed((db) =>
      setDoc(doc(db, 'activities', 'act_mod'), activity(MOD, { participantUids: [MOD, USER] })),
    )
    await assertFails(
      setDoc(doc(as(USER), 'activities', 'act_mod', 'messages', 'm1'), {
        senderId: USER,
        senderName: 'Person',
        text: 'hello',
      }),
    )
  })

  test('a suspended account can still leave something it joined', async () => {
    // Being suspended must not trap somebody in a plan they no longer want.
    await seed((db) =>
      setDoc(doc(db, 'activities', 'act_mod'), activity(MOD, { participantUids: [MOD, USER] })),
    )
    await setRole(USER, { suspended: true })
    await assertSucceeds(
      updateDoc(doc(as(USER), 'activities', 'act_mod'), {
        participantUids: [MOD],
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
    await assertFails(
      setDoc(doc(as(USER), 'users', OTHER, 'notifications', 'n1'), {
        type: 'activity',
        title: 'Look at this',
        body: 'Reaching you anyway',
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
  test('a moderator cannot close a report about themselves', async () => {
    await seed((db) => setDoc(doc(db, 'reports', 'rep'), report({ targetId: MOD, subjectId: MOD })))
    await assertFails(closeReport(MOD))
  })

  test('a moderator cannot close a report about an activity they host', async () => {
    await seed((db) =>
      setDoc(
        doc(db, 'reports', 'rep'),
        report({ targetType: 'activity', targetId: 'act_mod', subjectId: MOD }),
      ),
    )
    await assertFails(closeReport(MOD))
  })

  test('a moderator cannot close a report about their own message', async () => {
    // The one the design missed: a message report records the message id, so
    // nothing in the report said whose message it was.
    await seed(async (db) => {
      await setDoc(doc(db, 'activities', 'act_user', 'messages', 'm1'), {
        senderId: MOD,
        senderName: 'Person',
        text: 'something unpleasant',
      })
      await setDoc(
        doc(db, 'reports', 'rep'),
        report({
          targetType: 'message',
          targetId: 'm1',
          activityId: 'act_user',
          subjectId: MOD,
        }),
      )
    })
    await assertFails(closeReport(MOD))
  })

  test('an admin cannot close a report about themselves either', async () => {
    // Rank does not buy an exemption from the conflict of interest.
    await seed((db) =>
      setDoc(doc(db, 'reports', 'rep'), report({ targetId: ADMIN, subjectId: ADMIN })),
    )
    await assertFails(closeReport(ADMIN))
  })

  test('somebody uninvolved can close it', async () => {
    await seed((db) => setDoc(doc(db, 'reports', 'rep'), report({ targetId: MOD, subjectId: MOD })))
    await assertSucceeds(closeReport(ADMIN))
    await assertSucceeds(closeReport(MOD2))
  })

  test('the reporter cannot close their own report either', async () => {
    // A moderator who reports somebody and then rules on it is both parties.
    await seed((db) =>
      setDoc(doc(db, 'reports', 'rep'), report({ reporterId: MOD, targetId: USER, subjectId: USER })),
    )
    await assertFails(closeReport(MOD))
  })

  test('a report naming an activity that no longer exists is still closable', async () => {
    await seed((db) =>
      setDoc(
        doc(db, 'reports', 'rep'),
        report({ targetType: 'activity', targetId: 'deleted', subjectId: OTHER }),
      ),
    )
    await assertSucceeds(closeReport(MOD))
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
      setDoc(doc(as(OTHER), 'reports', 'r2'), report({ targetId: USER, subjectId: MOD })),
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
        report({ targetType: 'activity', targetId: 'act_user', subjectId: MOD }),
      ),
    )
  })

  test('a message report must name whoever sent that message', async () => {
    await seed((db) =>
      setDoc(doc(db, 'activities', 'act_mod', 'messages', 'm1'), {
        senderId: MOD,
        senderName: 'Person',
        text: 'something unpleasant',
      }),
    )
    await assertSucceeds(
      setDoc(
        doc(as(OTHER), 'reports', 'r1'),
        report({ targetType: 'message', targetId: 'm1', activityId: 'act_mod', subjectId: MOD }),
      ),
    )
    await assertFails(
      setDoc(
        doc(as(OTHER), 'reports', 'r2'),
        report({ targetType: 'message', targetId: 'm1', activityId: 'act_mod', subjectId: USER }),
      ),
    )
  })

  test('a report cannot be filed in somebody else s name', async () => {
    await assertFails(
      setDoc(doc(as(OTHER), 'reports', 'r1'), report({ reporterId: USER, subjectId: MOD })),
    )
  })
})

describe('collision: moderation against blocking', () => {
  test('blocking a moderator does not put you beyond moderation', async () => {
    // Otherwise the way to become unmoderatable is to block the moderators.
    await seed((db) => setDoc(doc(db, 'users', USER, 'blocked', MOD), { name: 'Mod' }))
    await assertSucceeds(takeDown(MOD))
    await assertSucceeds(suspend(MOD, USER))
  })

  test('a moderator may still join and leave like anybody else', async () => {
    // Moderating is a job, not a different kind of membership.
    await assertSucceeds(
      updateDoc(doc(as(MOD), 'activities', 'act_user'), {
        participantUids: [USER, MOD],
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
    await seed((db) => setDoc(doc(db, 'users', USER, 'blocked', OTHER), { name: 'Other' }))
    await assertFails(
      setDoc(doc(as(OTHER), 'users', USER, 'notifications', 'n1'), {
        type: 'activity',
        title: 'Hello again',
        body: 'Still here',
        read: false,
      }),
    )
  })
})

describe('collision: a moderator acting on their own activity', () => {
  test('a moderator may take down their own activity', async () => {
    // Allowed, and harmless: it is strictly worse for them than cancelling,
    // and they cannot put it back afterwards.
    await assertSucceeds(takeDown(MOD, 'act_mod'))
  })

  test('and then cannot restore it, because that is an admin s call', async () => {
    await takeDown(MOD, 'act_mod')
    await assertFails(putBack(MOD, 'act_mod'))
    await assertSucceeds(putBack(ADMIN, 'act_mod'))
  })

  test('a moderator cannot edit an activity under cover of moderating it', async () => {
    await assertFails(updateDoc(doc(as(MOD), 'activities', 'act_user'), { title: 'Rewritten' }))
    await assertFails(updateDoc(doc(as(MOD), 'activities', 'act_user'), { hostId: MOD }))
    await assertFails(
      updateDoc(doc(as(MOD), 'activities', 'act_user'), {
        participantUids: [USER, OTHER],
        updatedAt: 1,
      }),
    )
  })

  test('a moderator cannot quietly cancel instead of removing', async () => {
    // Cancelling reads as the host calling it off. Removing says SmartSync
    // took it down. A moderator must not be able to choose the first.
    await assertFails(
      updateDoc(doc(as(MOD), 'activities', 'act_user'), { status: 'cancelled', updatedAt: 1 }),
    )
  })
})

describe('appointing and dismissing, from inside the app', () => {
  // The screen an admin uses. The rules were already written for these, but
  // nothing exercised them the way the client now does — reading the row
  // first and merging, so that a rank change and a suspension never clobber
  // each other.

  test('an admin can appoint an ordinary user', async () => {
    await assertSucceeds(appoint(ADMIN, USER))
  })

  test('appointing somebody who is suspended does not lift the suspension', async () => {
    // Two separate decisions. The client reads the row and carries `suspended`
    // across; this checks the rules accept the write it makes.
    await setRole(USER, { role: 'user', suspended: true })
    await assertSucceeds(setDoc(doc(as(ADMIN), 'roles', USER), { role: 'moderator', suspended: true }))
    let after
    await seed(async (db) => {
      after = (await getDoc(doc(db, 'roles', USER))).data()
    })
    expect(after).toEqual({ role: 'moderator', suspended: true })
  })

  test('dismissing a suspended moderator leaves them suspended', async () => {
    await setRole(MOD, { role: 'moderator', suspended: true })
    await assertSucceeds(setDoc(doc(as(ADMIN), 'roles', MOD), { role: 'user', suspended: true }))
    let after
    await seed(async (db) => {
      after = (await getDoc(doc(db, 'roles', MOD))).data()
    })
    expect(after).toEqual({ role: 'user', suspended: true })
  })

  test('an admin cannot appoint themselves out of anything', async () => {
    await assertFails(appoint(ADMIN, ADMIN, 'moderator'))
    await assertFails(appoint(ADMIN, ADMIN, 'user'))
  })

  test('a moderator cannot appoint anybody, including themselves', async () => {
    await assertFails(appoint(MOD, USER))
    await assertFails(appoint(MOD, MOD, 'admin'))
  })

  test('an ordinary user cannot appoint themselves', async () => {
    await assertFails(appoint(USER, USER))
    await assertFails(appoint(USER, OTHER))
  })

  test('an admin can read every role row, which is what the screen lists', async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN), 'roles', MOD)))
    await assertSucceeds(getDoc(doc(as(ADMIN), 'roles', ADMIN2)))
  })

  test('a moderator can read them too, and an ordinary user cannot', async () => {
    await assertSucceeds(getDoc(doc(as(MOD), 'roles', MOD2)))
    await assertFails(getDoc(doc(as(USER), 'roles', MOD)))
  })

  test('no rank change can smuggle in a third field', async () => {
    // The screen writes exactly two fields. Anything else would be a way to
    // put state on a role document that nothing validates.
    await assertFails(
      setDoc(doc(as(ADMIN), 'roles', USER), {
        role: 'moderator',
        suspended: false,
        canDeleteEverything: true,
      }),
    )
  })
})

describe('a role document that was written by hand', () => {
  // Roles are bootstrapped in the Firebase console, so malformed rows are a
  // realistic input, not a hypothetical one. Every one of these must fail
  // closed — deny — rather than erroring into somebody having authority.

  test('a row with no role field grants nothing', async () => {
    await seed((db) => setDoc(doc(db, 'roles', MOD), { suspended: false }))
    await assertFails(takeDown(MOD))
    await assertFails(suspend(MOD, USER))
  })

  test('a row with no suspended field grants nothing', async () => {
    await seed((db) => setDoc(doc(db, 'roles', MOD), { role: 'moderator' }))
    await assertFails(takeDown(MOD))
  })

  test('a misspelled role grants nothing', async () => {
    await seed((db) => setDoc(doc(db, 'roles', MOD), { role: 'Moderator', suspended: false }))
    await assertFails(takeDown(MOD))
    await seed((db) => setDoc(doc(db, 'roles', MOD), { role: 'admin ', suspended: false }))
    await assertFails(takeDown(MOD))
  })

  test('suspended as a string is not suspended as a boolean', async () => {
    // 'false' is a truthy string in most languages and a non-boolean here.
    // It must not read as "not suspended" by accident.
    await seed((db) => setDoc(doc(db, 'roles', MOD), { role: 'moderator', suspended: 'false' }))
    await assertSucceeds(takeDown(MOD))
    await seed((db) => setDoc(doc(db, 'roles', MOD), { role: 'moderator', suspended: 'true' }))
    await assertSucceeds(takeDown(MOD))
  })

  test('an admin written by hand has full authority', async () => {
    // The bootstrap path itself — the one documented in the README.
    await seed((db) => setDoc(doc(db, 'roles', USER), { role: 'admin', suspended: false }))
    await assertSucceeds(appoint(USER, OTHER))
    await assertSucceeds(takeDown(USER, 'act_mod'))
  })
})

describe('who can see the queue', () => {
  beforeEach(() => seed((db) => setDoc(doc(db, 'reports', 'rep'), report())))

  test('a moderator and an admin can read a report they did not file', async () => {
    await assertSucceeds(getDoc(doc(as(MOD), 'reports', 'rep')))
    await assertSucceeds(getDoc(doc(as(ADMIN), 'reports', 'rep')))
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
    await assertFails(getDoc(doc(as(USER), 'roles', MOD)))
  })
})
