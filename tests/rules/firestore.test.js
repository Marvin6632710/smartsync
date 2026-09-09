/**
 * Security rule tests.
 *
 * These run against the Firestore emulator with firestore.rules loaded, as an
 * unprivileged client. Everything here is an attack the UI would never make —
 * the point is that the rules stop it even when the client is hostile, which
 * is the only thing that actually matters once the data is shared.
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
  setDoc,
  updateDoc,
} from 'firebase/firestore'

let testEnv

const ALICE = 'alice'
const BOB = 'bob'
const CAROL = 'carol'

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

const activityFixture = (hostId, overrides = {}) => ({
  title: 'Football Night',
  description: 'Friendly game',
  category: 'Football',
  tags: ['Football'],
  locationName: 'Rama IX Park',
  lat: 13.6947,
  lng: 100.6597,
  date: '2030-01-01',
  time: '19:00',
  timeBand: 'Evening',
  capacity: 4,
  participantUids: [hostId],
  hostId,
  hostName: 'Alice',
  hostAvatar: 'AL',
  status: 'active',
  ...overrides,
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
  // Fixtures are written with rules bypassed so setup cannot be confused with
  // the behaviour under test.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', ALICE), publicProfile(ALICE, 'Alice'))
    await setDoc(doc(db, 'users', ALICE, 'private', 'profile'), {
      email: 'alice@example.com',
      realName: 'Alice Anderson',
      location: { lat: 13.7, lng: 100.5 },
    })
    await setDoc(doc(db, 'users', BOB), publicProfile(BOB, 'Bob'))
    await setDoc(doc(db, 'activities', 'act1'), activityFixture(ALICE))
    await setDoc(doc(db, 'activities', 'act1', 'messages', 'msg1'), {
      senderId: ALICE,
      senderName: 'Alice',
      text: 'See you there',
    })
    await setDoc(doc(db, 'users', ALICE, 'notifications', 'note1'), {
      type: 'activity',
      title: 'Someone joined',
      body: 'Bob joined your activity',
      read: false,
    })
  })
})

const asAlice = () => testEnv.authenticatedContext(ALICE).firestore()
const asBob = () => testEnv.authenticatedContext(BOB).firestore()
const asCarol = () => testEnv.authenticatedContext(CAROL).firestore()
const asGuest = () => testEnv.unauthenticatedContext().firestore()

// ---------------------------------------------------------------------------

describe('signed-out access', () => {
  test('cannot read activities', async () => {
    await assertFails(getDoc(doc(asGuest(), 'activities', 'act1')))
  })

  test('cannot read user profiles', async () => {
    await assertFails(getDoc(doc(asGuest(), 'users', ALICE)))
  })

  test('cannot create an activity', async () => {
    await assertFails(addDoc(collection(asGuest(), 'activities'), activityFixture(ALICE)))
  })
})

describe('profile privacy', () => {
  test('signed-in users can read each others public profiles', async () => {
    await assertSucceeds(getDoc(doc(asBob(), 'users', ALICE)))
  })

  test('the private profile is unreadable by anyone else', async () => {
    await assertFails(getDoc(doc(asBob(), 'users', ALICE, 'private', 'profile')))
  })

  test('the owner can read their own private profile', async () => {
    await assertSucceeds(getDoc(doc(asAlice(), 'users', ALICE, 'private', 'profile')))
  })

  test('a user cannot edit someone elses profile', async () => {
    await assertFails(updateDoc(doc(asBob(), 'users', ALICE), { bio: 'hacked' }))
  })

  test('a user cannot reassign their own uid', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { uid: BOB }))
  })

  test('the notification preference must stay a boolean', async () => {
    await assertFails(
      updateDoc(doc(asAlice(), 'users', ALICE), { notificationsEnabled: 'yes please' }),
    )
  })

  test('over-long bios are rejected', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { bio: 'x'.repeat(301) }))
  })
})

describe('activity ownership', () => {
  test('the host can edit their activity', async () => {
    await assertSucceeds(updateDoc(doc(asAlice(), 'activities', 'act1'), { title: 'New title' }))
  })

  test('a non-host cannot edit the activity', async () => {
    await assertFails(updateDoc(doc(asBob(), 'activities', 'act1'), { title: 'Hijacked' }))
  })

  test('nobody can hard-delete an activity, not even its host', async () => {
    // Deleting would strand the message subcollection and erase the chat
    // history of everyone who joined. Hosts cancel instead.
    await assertFails(deleteDoc(doc(asBob(), 'activities', 'act1')))
    await assertFails(deleteDoc(doc(asAlice(), 'activities', 'act1')))
  })

  test('the host can cancel their activity', async () => {
    await assertSucceeds(updateDoc(doc(asAlice(), 'activities', 'act1'), { status: 'cancelled' }))
  })

  test('a non-host cannot cancel it', async () => {
    await assertFails(updateDoc(doc(asBob(), 'activities', 'act1'), { status: 'cancelled' }))
  })

  test('a host cannot hand the activity to someone else', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'activities', 'act1'), { hostId: BOB }))
  })

  test('a host cannot add participants to their own activity', async () => {
    // Membership is earned by joining, not granted by the host.
    await assertFails(
      updateDoc(doc(asAlice(), 'activities', 'act1'), { participantUids: [ALICE, BOB, CAROL] }),
    )
  })

  test('capacity cannot be cut below the people already joined', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'activities', 'act1'), { capacity: 0 }))
  })

  test('creating an activity for someone else is rejected', async () => {
    await assertFails(addDoc(collection(asBob(), 'activities'), activityFixture(ALICE)))
  })

  test('a valid activity can be created by its host', async () => {
    await assertSucceeds(addDoc(collection(asBob(), 'activities'), activityFixture(BOB)))
  })
})

describe('activity field validation', () => {
  const rejects = (overrides) =>
    assertFails(addDoc(collection(asBob(), 'activities'), activityFixture(BOB, overrides)))

  test('rejects an empty title', () => rejects({ title: '' }))
  test('rejects an over-long title', () => rejects({ title: 'x'.repeat(101) }))
  test('rejects an impossible latitude', () => rejects({ lat: 991 }))
  test('rejects an impossible longitude', () => rejects({ lng: -181 }))
  test('rejects a non-numeric latitude', () => rejects({ lat: 'somewhere' }))
  test('rejects capacity below two', () => rejects({ capacity: 1 }))
  test('rejects absurd capacity', () => rejects({ capacity: 100000 }))
  test('rejects an unknown status', () => rejects({ status: 'promoted' }))
  test('rejects an off-vocabulary category', () => rejects({ category: 'Knitting' }))
  test('rejects a category carrying an HTML payload', () =>
    // This exact string escaped a Leaflet marker's data-category attribute.
    rejects({ category: '" onmouseover=alert(1) x="' }))
  test('rejects a roster the host is not on', () => rejects({ participantUids: [ALICE] }))
  test('rejects a roster larger than capacity', () =>
    rejects({ capacity: 2, participantUids: [BOB, ALICE, CAROL] }))
})

describe('joining and leaving', () => {
  const rosterAs = (db, uids) =>
    updateDoc(doc(db, 'activities', 'act1'), { participantUids: uids, updatedAt: 1 })

  const withRoster = (uids, overrides = {}) =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, { participantUids: uids, ...overrides }),
      )
    })

  test('a user can add themselves', async () => {
    await assertSucceeds(rosterAs(asBob(), [ALICE, BOB]))
  })

  test('a user cannot add somebody else', async () => {
    await assertFails(rosterAs(asBob(), [ALICE, CAROL]))
  })

  test('a user cannot add themselves and a friend at once', async () => {
    await assertFails(rosterAs(asBob(), [ALICE, BOB, CAROL]))
  })

  test('a user cannot pad the roster with duplicates of themselves', async () => {
    // Otherwise one person could consume every remaining seat.
    await assertFails(rosterAs(asBob(), [ALICE, BOB, BOB]))
  })

  test('a user cannot quietly drop someone else while joining', async () => {
    await assertFails(rosterAs(asBob(), [BOB]))
  })

  test('a full activity cannot be joined', async () => {
    await withRoster([ALICE, CAROL], { capacity: 2 })
    await assertFails(rosterAs(asBob(), [ALICE, CAROL, BOB]))
  })

  test('a cancelled activity cannot be joined', async () => {
    await withRoster([ALICE], { status: 'cancelled' })
    await assertFails(rosterAs(asBob(), [ALICE, BOB]))
  })

  test('a joined user can leave', async () => {
    await withRoster([ALICE, BOB])
    await assertSucceeds(rosterAs(asBob(), [ALICE]))
  })

  test('a user cannot remove another participant', async () => {
    // Bob is on the roster, so this is not a leave — he is dropping Carol.
    await withRoster([ALICE, BOB, CAROL])
    await assertFails(rosterAs(asBob(), [ALICE, BOB]))
  })

  test('the host cannot leave their own activity', async () => {
    // Leaving would orphan the activity; the host cancels instead.
    await withRoster([ALICE, BOB])
    await assertFails(rosterAs(asAlice(), [BOB]))
  })

  test('the host can remove a participant', async () => {
    await withRoster([ALICE, BOB])
    await assertSucceeds(rosterAs(asAlice(), [ALICE]))
  })

  test('a roster change cannot smuggle in other edits', async () => {
    await assertFails(
      updateDoc(doc(asBob(), 'activities', 'act1'), {
        participantUids: [ALICE, BOB],
        capacity: 500,
        updatedAt: 1,
      }),
    )
  })

  test('a stranger cannot empty the roster', async () => {
    await assertFails(rosterAs(asBob(), []))
  })
})

describe('activity chat', () => {
  const joinBob = () =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, { participantUids: [ALICE, BOB] }),
      )
    })

  test('a participant can read the thread', async () => {
    await assertSucceeds(getDocs(collection(asAlice(), 'activities', 'act1', 'messages')))
  })

  test('a non-participant cannot read the thread', async () => {
    await assertFails(getDocs(collection(asBob(), 'activities', 'act1', 'messages')))
  })

  test('a non-participant cannot post', async () => {
    await assertFails(
      addDoc(collection(asBob(), 'activities', 'act1', 'messages'), {
        senderId: BOB,
        senderName: 'Bob',
        text: 'let me in',
      }),
    )
  })

  test('a participant can post', async () => {
    await assertSucceeds(
      addDoc(collection(asAlice(), 'activities', 'act1', 'messages'), {
        senderId: ALICE,
        senderName: 'Alice',
        text: 'on my way',
      }),
    )
  })

  test('a joined user can read and post', async () => {
    await joinBob()
    await assertSucceeds(getDocs(collection(asBob(), 'activities', 'act1', 'messages')))
    await assertSucceeds(
      addDoc(collection(asBob(), 'activities', 'act1', 'messages'), {
        senderId: BOB,
        senderName: 'Bob',
        text: 'coming',
      }),
    )
  })

  test('a participant cannot post as someone else', async () => {
    await assertFails(
      addDoc(collection(asAlice(), 'activities', 'act1', 'messages'), {
        senderId: BOB,
        senderName: 'Bob',
        text: 'I am Bob',
      }),
    )
  })

  test('empty messages are rejected', async () => {
    await assertFails(
      addDoc(collection(asAlice(), 'activities', 'act1', 'messages'), {
        senderId: ALICE,
        senderName: 'Alice',
        text: '',
      }),
    )
  })

  test('messages cannot be edited after the fact', async () => {
    await assertFails(
      updateDoc(doc(asAlice(), 'activities', 'act1', 'messages', 'msg1'), { text: 'edited' }),
    )
  })

  test('messages cannot be deleted', async () => {
    await assertFails(deleteDoc(doc(asAlice(), 'activities', 'act1', 'messages', 'msg1')))
  })
})

describe('notifications', () => {
  test('the owner can read their inbox', async () => {
    await assertSucceeds(getDocs(collection(asAlice(), 'users', ALICE, 'notifications')))
  })

  test('nobody else can read it', async () => {
    await assertFails(getDocs(collection(asBob(), 'users', ALICE, 'notifications')))
  })

  test('another user can notify them', async () => {
    await assertSucceeds(
      addDoc(collection(asBob(), 'users', ALICE, 'notifications'), {
        type: 'activity',
        title: 'Bob joined',
        body: 'Bob joined your football night',
        read: false,
      }),
    )
  })

  test('a user who turned notifications off cannot be notified', async () => {
    // Enforced by the rules, not by the sending client's good manners.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE), {
        ...publicProfile(ALICE, 'Alice'),
        notificationsEnabled: false,
      })
    })
    await assertFails(
      addDoc(collection(asBob(), 'users', ALICE, 'notifications'), {
        type: 'activity',
        title: 'Bob joined',
        body: 'Bob joined your football night',
        read: false,
      }),
    )
  })

  test('a forged pre-read notification is rejected', async () => {
    await assertFails(
      addDoc(collection(asBob(), 'users', ALICE, 'notifications'), {
        type: 'activity',
        title: 'Nothing to see',
        body: 'x',
        read: true,
      }),
    )
  })

  test('the owner can mark one read', async () => {
    await assertSucceeds(
      updateDoc(doc(asAlice(), 'users', ALICE, 'notifications', 'note1'), { read: true }),
    )
  })

  test('someone else cannot mark it read', async () => {
    await assertFails(
      updateDoc(doc(asBob(), 'users', ALICE, 'notifications', 'note1'), { read: true }),
    )
  })

  test('marking read cannot smuggle in a body rewrite', async () => {
    await assertFails(
      updateDoc(doc(asAlice(), 'users', ALICE, 'notifications', 'note1'), {
        read: true,
        body: 'rewritten',
      }),
    )
  })
})

describe('following', () => {
  test('a user can follow someone', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), 'users', ALICE, 'following', BOB), { at: 1 }))
  })

  test('a follow list is private to its owner', async () => {
    await assertFails(getDocs(collection(asBob(), 'users', ALICE, 'following')))
  })
})

describe('unmatched paths', () => {
  test('writing to an undeclared collection is denied', async () => {
    await assertFails(addDoc(collection(asAlice(), 'anything'), { x: 1 }))
  })
})
