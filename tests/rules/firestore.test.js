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
const MOD = 'mod'
const ADMIN = 'admin'

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
  startsAt: new Date('2030-01-01T19:00:00Z'),
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
    await setDoc(doc(db, 'roles', MOD), { role: 'moderator', suspended: false })
    await setDoc(doc(db, 'roles', ADMIN), { role: 'admin', suspended: false })
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
const asMod = () => testEnv.authenticatedContext(MOD).firestore()
const asAdmin = () => testEnv.authenticatedContext(ADMIN).firestore()

/** Puts a role or a suspension on somebody, bypassing the rules under test. */
const setRole = (uid, data) =>
  testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'roles', uid), {
      role: 'user',
      suspended: false,
      ...data,
    })
  })

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

  test('a host can delete an activity nobody else joined', async () => {
    await assertSucceeds(deleteDoc(doc(asAlice(), 'activities', 'act1')))
  })

  test('a host cannot delete one that other people joined', async () => {
    // Their plans and their chat history are not the host's to erase.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, { participantUids: [ALICE, BOB] }),
      )
    })
    await assertFails(deleteDoc(doc(asAlice(), 'activities', 'act1')))
  })

  test('a non-host cannot delete an activity', async () => {
    await assertFails(deleteDoc(doc(asBob(), 'activities', 'act1')))
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
  test('rejects an activity with no start time', () => rejects({ startsAt: null }))
  test('rejects a start time that is not a timestamp', () => rejects({ startsAt: '2030-01-01' }))
  test('rejects a category carrying an HTML payload', () =>
    // This exact string escaped a Leaflet marker's data-category attribute.
    rejects({ category: '" onmouseover=alert(1) x="' }))
  test('rejects a roster the host is not on', () => rejects({ participantUids: [ALICE] }))
  test('rejects a roster larger than capacity', () =>
    rejects({ capacity: 2, participantUids: [BOB, ALICE, CAROL] }))
})

describe('the two ways an activity says when it is', () => {
  // `startsAt` is the instant, and every query filters on it. `date` and
  // `time` are the wall clock at the venue, which is what every card shows.
  // Both are deliberate — an activity at 19:00 in Bangkok should read as 19:00
  // to somebody looking from London, which deriving the display from the
  // timestamp would get wrong. But only `startsAt` was ever validated, so a
  // write through the API could leave a card showing whatever it liked.

  test('a well-formed date and time are accepted', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), 'activities', 'ok'), activityFixture(ALICE, {
        date: '2030-01-01',
        time: '19:00',
      })),
    )
  })

  test('a malformed date is refused', async () => {
    for (const date of ['tomorrow', '2030-1-1', '01-01-2030', '', '2030-01-01T19:00']) {
      await assertFails(
        setDoc(doc(asAlice(), 'activities', 'bad'), activityFixture(ALICE, { date })),
      )
    }
  })

  test('a malformed time is refused', async () => {
    for (const time of ['7pm', '19', '19:00:00', '::', '']) {
      await assertFails(
        setDoc(doc(asAlice(), 'activities', 'bad'), activityFixture(ALICE, { time })),
      )
    }
  })

  test('neither field may be missing altogether', async () => {
    const withoutDate = activityFixture(ALICE)
    delete withoutDate.date
    await assertFails(setDoc(doc(asAlice(), 'activities', 'bad'), withoutDate))

    const withoutTime = activityFixture(ALICE)
    delete withoutTime.time
    await assertFails(setDoc(doc(asAlice(), 'activities', 'bad'), withoutTime))
  })

  test('a host cannot edit one into nonsense either', async () => {
    await assertFails(updateDoc(doc(asAlice(), 'activities', 'act1'), { time: 'whenever' }))
    await assertFails(updateDoc(doc(asAlice(), 'activities', 'act1'), { date: 'soon' }))
  })
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

  test('a thread closes thirty days after the activity', async () => {
    // Retention is enforced by the database rather than filtered in the
    // client, so it holds against someone querying Firestore directly.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      await setDoc(doc(context.firestore(), 'activities', 'act1'), {
        ...activityFixture(ALICE),
        startsAt: longAgo,
      })
    })
    await assertFails(getDocs(collection(asAlice(), 'activities', 'act1', 'messages')))
    await assertFails(
      addDoc(collection(asAlice(), 'activities', 'act1', 'messages'), {
        senderId: ALICE,
        senderName: 'Alice',
        text: 'still here?',
      }),
    )
  })

  test('a thread inside the retention window is still open', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const recently = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      await setDoc(doc(context.firestore(), 'activities', 'act1'), {
        ...activityFixture(ALICE),
        startsAt: recently,
      })
    })
    await assertSucceeds(getDocs(collection(asAlice(), 'activities', 'act1', 'messages')))
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

describe('blocking', () => {
  const blockDoc = (db, ownerId, targetId) => doc(db, 'users', ownerId, 'blocked', targetId)

  test('a user can block somebody', async () => {
    await assertSucceeds(setDoc(blockDoc(asAlice(), ALICE, BOB), { name: 'Bob' }))
  })

  test('a user can read their own block list', async () => {
    await assertSucceeds(getDocs(collection(asAlice(), 'users', ALICE, 'blocked')))
  })

  test('nobody else can read it', async () => {
    // Publishing this would tell people they had been blocked and by whom,
    // which is its own kind of harm. The rules read it with exists(), which
    // sees past read permissions, so it is enforced without being exposed.
    await assertFails(getDocs(collection(asBob(), 'users', ALICE, 'blocked')))
  })

  test('a user cannot block themselves', async () => {
    // A self block would quietly make your own activities invisible to you.
    await assertFails(setDoc(blockDoc(asAlice(), ALICE, ALICE), { name: 'Alice' }))
  })

  test('a user cannot write into somebody else s block list', async () => {
    await assertFails(setDoc(blockDoc(asBob(), ALICE, CAROL), { name: 'Carol' }))
  })

  test('a block entry cannot be edited afterwards', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE, 'blocked', BOB), { name: 'Bob' })
    })
    await assertFails(updateDoc(blockDoc(asAlice(), ALICE, BOB), { name: 'Someone else' }))
  })

  test('a user can unblock', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE, 'blocked', BOB), { name: 'Bob' })
    })
    await assertSucceeds(deleteDoc(blockDoc(asAlice(), ALICE, BOB)))
  })

  test('a blocked user cannot join the blocker s activity', async () => {
    // The part that has to actually hold. Hiding the activity from them is a
    // client-side courtesy; this is the server refusing the interaction.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE, 'blocked', BOB), { name: 'Bob' })
    })
    await assertFails(
      updateDoc(doc(asBob(), 'activities', 'act1'), {
        participantUids: [ALICE, BOB],
        updatedAt: 1,
      }),
    )
  })

  test('somebody who was not blocked can still join', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE, 'blocked', CAROL), { name: 'Carol' })
    })
    await assertSucceeds(
      updateDoc(doc(asBob(), 'activities', 'act1'), {
        participantUids: [ALICE, BOB],
        updatedAt: 1,
      }),
    )
  })

  test('being blocked by one host does not block you everywhere', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', ALICE, 'blocked', BOB), { name: 'Bob' })
      await setDoc(doc(db, 'activities', 'act2'), activityFixture(CAROL))
    })
    await assertSucceeds(
      updateDoc(doc(asBob(), 'activities', 'act2'), {
        participantUids: [CAROL, BOB],
        updatedAt: 1,
      }),
    )
  })
})

describe('reports', () => {
  const report = (over = {}) => ({
    reporterId: BOB,
    targetType: 'user',
    targetId: ALICE,
    // Who is answerable for the thing reported. For a user report that is the
    // person themselves; for an activity it is the host; for a message, its
    // sender. The rules verify it rather than taking the reporter's word,
    // because this is the field the queue suspends. roles-matrix.test.js has
    // the forgery attempts.
    subjectId: ALICE,
    reason: 'harassment',
    detail: 'Sent me abusive messages in the chat.',
    status: 'open',
    ...over,
  })

  test('a report has to say who is answerable for it', async () => {
    // Built by deleting the key rather than setting it to undefined: the
    // Firestore SDK rejects undefined values client-side, which assertFails
    // does not count, so that version of this test proved nothing.
    const withoutSubject = report()
    delete withoutSubject.subjectId
    await assertFails(addDoc(collection(asBob(), 'reports'), withoutSubject))
    await assertFails(addDoc(collection(asBob(), 'reports'), report({ subjectId: '' })))
  })

  test('a signed-in user can file a report', async () => {
    await assertSucceeds(addDoc(collection(asBob(), 'reports'), report()))
  })

  test('a signed-out visitor cannot', async () => {
    await assertFails(addDoc(collection(asGuest(), 'reports'), report()))
  })

  test('a report cannot be filed in somebody else s name', async () => {
    await assertFails(addDoc(collection(asBob(), 'reports'), report({ reporterId: CAROL })))
  })

  test('rejects an unknown reason', async () => {
    await assertFails(
      addDoc(collection(asBob(), 'reports'), report({ reason: 'i just do not like them' })),
    )
  })

  test('rejects an unknown target type', async () => {
    await assertFails(addDoc(collection(asBob(), 'reports'), report({ targetType: 'everything' })))
  })

  test('rejects a report filed as already resolved', async () => {
    // Otherwise somebody could bury a report by filing it closed.
    await assertFails(addDoc(collection(asBob(), 'reports'), report({ status: 'resolved' })))
  })

  test('rejects an over-long description', async () => {
    await assertFails(addDoc(collection(asBob(), 'reports'), report({ detail: 'x'.repeat(1001) })))
  })

  test('a reporter can read back their own report', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), report())
    })
    await assertSucceeds(getDoc(doc(asBob(), 'reports', 'r1')))
  })

  test('the person reported cannot read it', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), report())
    })
    await assertFails(getDoc(doc(asAlice(), 'reports', 'r1')))
  })

  test('a report cannot be edited or deleted, by anyone', async () => {
    // Evidence the accused can alter or erase is not evidence — and neither
    // is evidence the reporter can quietly withdraw.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), report())
    })
    await assertFails(updateDoc(doc(asBob(), 'reports', 'r1'), { detail: 'never mind' }))
    await assertFails(deleteDoc(doc(asBob(), 'reports', 'r1')))
    await assertFails(updateDoc(doc(asAlice(), 'reports', 'r1'), { status: 'resolved' }))
    await assertFails(deleteDoc(doc(asAlice(), 'reports', 'r1')))
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

describe('roles — who can grant what', () => {
  test('a user can read their own role', async () => {
    await setRole(ALICE, {})
    await assertSucceeds(getDoc(doc(asAlice(), 'roles', ALICE)))
  })

  test('a user cannot read somebody else s role', async () => {
    await setRole(BOB, {})
    await assertFails(getDoc(doc(asAlice(), 'roles', BOB)))
  })

  test('a moderator can read anyone s role', async () => {
    await setRole(ALICE, {})
    await assertSucceeds(getDoc(doc(asMod(), 'roles', ALICE)))
  })

  test('a plain user cannot promote themselves', async () => {
    // The whole reason roles live outside the profile a user can edit.
    await assertFails(setDoc(doc(asAlice(), 'roles', ALICE), { role: 'admin', suspended: false }))
    await assertFails(
      setDoc(doc(asAlice(), 'roles', ALICE), { role: 'moderator', suspended: false }),
    )
  })

  test('a plain user cannot promote anybody else either', async () => {
    await assertFails(setDoc(doc(asAlice(), 'roles', BOB), { role: 'moderator', suspended: false }))
  })

  test('a moderator cannot hand out roles', async () => {
    // Moderating is reviewing reports, not deciding who moderates.
    await assertFails(setDoc(doc(asMod(), 'roles', ALICE), { role: 'moderator', suspended: false }))
  })

  test('an admin can appoint a moderator', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'moderator', suspended: false }),
    )
  })

  test('an admin cannot create another admin', async () => {
    // There is no in-app path to admin at all, so a compromised admin cannot
    // mint more. It is set from the Firebase console or not at all.
    await assertFails(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'admin', suspended: false }))
  })

  test('an admin cannot edit their own row', async () => {
    // Somebody who can rewrite their own role can undo any limit placed on
    // them, and can strip their own admin by mistake and lock everyone out.
    await assertFails(
      setDoc(doc(asAdmin(), 'roles', ADMIN), { role: 'moderator', suspended: false }),
    )
    await assertFails(deleteDoc(doc(asAdmin(), 'roles', ADMIN)))
  })

  test('an admin can suspend and restore somebody', async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'user', suspended: true }))
    await assertSucceeds(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'user', suspended: false }))
  })

  test('a role row must say whether the person is suspended', async () => {
    await assertFails(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'moderator' }))
  })

  test('an unknown role is refused', async () => {
    await assertFails(
      setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'superuser', suspended: false }),
    )
  })
})

describe('suspension', () => {
  const newActivity = (db) => addDoc(collection(db, 'activities'), activityFixture(ALICE))

  test('a suspended user cannot create an activity', async () => {
    await setRole(ALICE, { suspended: true })
    await assertFails(newActivity(asAlice()))
  })

  test('a suspended user cannot join one', async () => {
    await setRole(BOB, { suspended: true })
    await assertFails(
      updateDoc(doc(asBob(), 'activities', 'act1'), {
        participantUids: [ALICE, BOB],
        updatedAt: 1,
      }),
    )
  })

  test('a suspended user cannot post a message', async () => {
    await setRole(ALICE, { suspended: true })
    await assertFails(
      addDoc(collection(asAlice(), 'activities', 'act1', 'messages'), {
        senderId: ALICE,
        senderName: 'Alice',
        text: 'still here',
      }),
    )
  })

  test('a suspended user can still read', async () => {
    // Being able to see why you cannot post is the point of not hiding it.
    await setRole(ALICE, { suspended: true })
    await assertSucceeds(getDoc(doc(asAlice(), 'activities', 'act1')))
    await assertSucceeds(getDoc(doc(asAlice(), 'roles', ALICE)))
  })

  test('lifting a suspension restores what it took away', async () => {
    await setRole(BOB, { suspended: true })
    await assertFails(
      updateDoc(doc(asBob(), 'activities', 'act1'), {
        participantUids: [ALICE, BOB],
        updatedAt: 1,
      }),
    )
    await setRole(BOB, { suspended: false })
    await assertSucceeds(
      updateDoc(doc(asBob(), 'activities', 'act1'), {
        participantUids: [ALICE, BOB],
        updatedAt: 1,
      }),
    )
  })
})

describe('moderation powers', () => {
  test('a moderator can take an activity down', async () => {
    await assertSucceeds(
      updateDoc(doc(asMod(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by: MOD, reason: 'Breaks the safety policy' },
        updatedAt: 1,
      }),
    )
  })

  test('taking one down has to say why', async () => {
    await assertFails(
      updateDoc(doc(asMod(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by: MOD, reason: '' },
        updatedAt: 1,
      }),
    )
  })

  test('a moderator cannot pin the decision on somebody else', async () => {
    await assertFails(
      updateDoc(doc(asMod(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by: ALICE, reason: 'Breaks the safety policy' },
        updatedAt: 1,
      }),
    )
  })

  test('a moderator cannot edit an activity, only remove it', async () => {
    // Taking something down is a narrow power on purpose: not rewriting it,
    // not reassigning it, not deciding who else is going.
    await assertFails(updateDoc(doc(asMod(), 'activities', 'act1'), { title: 'Rewritten' }))
    await assertFails(updateDoc(doc(asMod(), 'activities', 'act1'), { capacity: 500 }))
    await assertFails(updateDoc(doc(asMod(), 'activities', 'act1'), { hostId: MOD }))
    await assertFails(
      updateDoc(doc(asMod(), 'activities', 'act1'), {
        participantUids: [ALICE, CAROL],
        updatedAt: 1,
      }),
    )
    await assertFails(
      // And cannot quietly cancel instead of removing, which would hide that
      // a moderator acted at all.
      updateDoc(doc(asMod(), 'activities', 'act1'), { status: 'cancelled', updatedAt: 1 }),
    )
  })

  test('a moderator may still join an activity like anybody else', async () => {
    // Moderating is a job, not a different kind of membership.
    await assertSucceeds(
      updateDoc(doc(asMod(), 'activities', 'act1'), {
        participantUids: [ALICE, MOD],
        updatedAt: 1,
      }),
    )
  })

  test('a plain user cannot remove anything', async () => {
    await assertFails(
      updateDoc(doc(asBob(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by: BOB, reason: 'I do not like it' },
        updatedAt: 1,
      }),
    )
  })

  test('a moderator can read a report they did not file', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), {
        reporterId: BOB,
        targetType: 'user',
        targetId: ALICE,
        reason: 'harassment',
        detail: 'x',
        status: 'open',
      })
    })
    await assertSucceeds(getDoc(doc(asMod(), 'reports', 'r1')))
    await assertFails(getDoc(doc(asCarol(), 'reports', 'r1')))
  })

  test('a moderator can record a decision', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), {
        reporterId: BOB,
        targetType: 'user',
        targetId: ALICE,
        reason: 'harassment',
        detail: 'x',
        status: 'open',
      })
    })
    await assertSucceeds(
      updateDoc(doc(asMod(), 'reports', 'r1'), {
        status: 'actioned',
        reviewedBy: MOD,
        reviewedAt: 1,
        outcome: 'Account suspended',
      }),
    )
  })

  test('a moderator cannot rewrite what was reported', async () => {
    // Only the decision is writable. Letting a reviewer edit the reason or
    // the description would make the record worthless.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), {
        reporterId: BOB,
        targetType: 'user',
        targetId: ALICE,
        reason: 'harassment',
        detail: 'x',
        status: 'open',
      })
    })
    await assertFails(updateDoc(doc(asMod(), 'reports', 'r1'), { detail: 'nothing happened' }))
    await assertFails(updateDoc(doc(asMod(), 'reports', 'r1'), { reason: 'spam' }))
    await assertFails(deleteDoc(doc(asMod(), 'reports', 'r1')))
  })

  test('a plain user cannot resolve a report, even their own', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), {
        reporterId: BOB,
        targetType: 'user',
        targetId: ALICE,
        reason: 'harassment',
        detail: 'x',
        status: 'open',
      })
    })
    await assertFails(
      updateDoc(doc(asBob(), 'reports', 'r1'), {
        status: 'dismissed',
        reviewedBy: BOB,
        reviewedAt: 1,
        outcome: 'never mind',
      }),
    )
  })
})

describe('a suspended moderator', () => {
  // Suspension takes the powers, not the rank. Before this, suspending a
  // moderator who was abusing the queue took nothing away from them — they
  // kept removing activities and suspending people while suspended.

  beforeEach(() => setRole(MOD, { role: 'moderator', suspended: true }))

  test('cannot take an activity down', async () => {
    await assertFails(
      updateDoc(doc(asMod(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by: MOD, reason: 'Breaks the safety policy' },
        updatedAt: 1,
      }),
    )
  })

  test('cannot suspend anybody', async () => {
    await assertFails(setDoc(doc(asMod(), 'roles', ALICE), { role: 'user', suspended: true }))
  })

  test('cannot read somebody else s report', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), {
        reporterId: BOB,
        targetType: 'user',
        targetId: ALICE,
        reason: 'spam',
        detail: '',
        context: '',
        status: 'open',
      })
    })
    await assertFails(getDoc(doc(asMod(), 'reports', 'r1')))
  })

  test('cannot lift their own suspension', async () => {
    await assertFails(setDoc(doc(asMod(), 'roles', MOD), { role: 'moderator', suspended: false }))
  })

  test('keeps the rank, so an admin can hand it back', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), 'roles', MOD), { role: 'moderator', suspended: false }),
    )
  })

  test('and can still read, which is the point of suspending rather than banning', async () => {
    await assertSucceeds(getDoc(doc(asMod(), 'activities', 'act1')))
    await assertSucceeds(getDoc(doc(asMod(), 'roles', MOD)))
  })
})

describe('a suspended admin', () => {
  // Only reachable from the Firebase console — no admin can suspend another —
  // but if it happens the powers must go with it.
  beforeEach(() => setRole(ADMIN, { role: 'admin', suspended: true }))

  test('cannot appoint moderators', async () => {
    await assertFails(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'moderator', suspended: false }))
  })

  test('cannot restore a removed activity', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, {
          status: 'removed',
          moderation: { by: MOD, reason: 'A safety concern' },
        }),
      )
    })
    await assertFails(
      updateDoc(doc(asAdmin(), 'activities', 'act1'), {
        status: 'active',
        moderation: { by: ADMIN, reason: 'Reviewed again' },
        updatedAt: 1,
      }),
    )
  })
})

describe('reviewing a report about yourself', () => {
  // A moderator can never suspend themselves — /roles refuses that. But
  // until this was closed they could mark the complaint dismissed, which is
  // the same power exercised quietly. Found by looking at a moderator's own
  // queue in the running app and seeing a report about them sitting in it
  // with a Dismiss button.

  const fileReport = (fields) =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), {
        reporterId: BOB,
        targetType: 'user',
        targetId: MOD,
        reason: 'spam',
        detail: 'Posting the same thing over and over.',
        context: '',
        status: 'open',
        ...fields,
      })
    })

  const decide = (db, outcome) =>
    updateDoc(doc(db, 'reports', 'r1'), {
      status: outcome,
      outcome: 'No action needed',
      reviewedBy: MOD,
      reviewedAt: 1,
    })

  test('a moderator cannot dismiss a report about themselves', async () => {
    await fileReport({})
    await assertFails(decide(asMod(), 'dismissed'))
  })

  test('nor mark it actioned to make it look dealt with', async () => {
    await fileReport({})
    await assertFails(decide(asMod(), 'actioned'))
  })

  test('a moderator cannot dismiss a report about their own activity', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'activities', 'mine'), activityFixture(MOD))
    })
    await fileReport({ targetType: 'activity', targetId: 'mine' })
    await assertFails(decide(asMod(), 'dismissed'))
  })

  test('but somebody else can decide it', async () => {
    await fileReport({})
    await assertSucceeds(
      updateDoc(doc(asAdmin(), 'reports', 'r1'), {
        status: 'dismissed',
        outcome: 'No action needed',
        reviewedBy: ADMIN,
        reviewedAt: 1,
      }),
    )
  })

  test('and a report about somebody else is still theirs to decide', async () => {
    await fileReport({ targetId: ALICE })
    await assertSucceeds(decide(asMod(), 'actioned'))
  })

  test('a report naming an activity that no longer exists is still decidable', async () => {
    // aboutMe() reads the activity to find its host. A deleted target must
    // not make the report unresolvable.
    await fileReport({ targetType: 'activity', targetId: 'gone' })
    await assertSucceeds(decide(asMod(), 'dismissed'))
  })
})

describe('the privilege ladder', () => {
  // Who may do what to whom. The client had a matching bug — setSuspended()
  // wrote role:'user' next to the flag, so suspending a moderator demoted
  // them and un-suspending left them demoted. These tests pin the boundary
  // the rules are responsible for; the client fix is in moderation.js.

  test('a moderator can suspend an ordinary user', async () => {
    // The whole point of the rank. A moderator who could take down one
    // activity while the same account posted ten more moderates nothing.
    await assertSucceeds(
      setDoc(doc(asMod(), 'roles', ALICE), { role: 'user', suspended: true }),
    )
  })

  test('a moderator can lift a suspension they placed', async () => {
    await setRole(ALICE, { role: 'user', suspended: true })
    await assertSucceeds(
      setDoc(doc(asMod(), 'roles', ALICE), { role: 'user', suspended: false }),
    )
  })

  test('a moderator cannot promote anyone while suspending them', async () => {
    await assertFails(
      setDoc(doc(asMod(), 'roles', ALICE), { role: 'moderator', suspended: true }),
    )
  })

  test('a moderator cannot suspend a fellow moderator', async () => {
    // Otherwise two moderators can disable each other, and whoever moves
    // first wins. Acting on a peer is an admin's call.
    await setRole(ALICE, { role: 'moderator', suspended: false })
    await assertFails(
      setDoc(doc(asMod(), 'roles', ALICE), { role: 'user', suspended: true }),
    )
  })

  test('a moderator cannot suspend an admin', async () => {
    await assertFails(
      setDoc(doc(asMod(), 'roles', ADMIN), { role: 'user', suspended: true }),
    )
  })

  test('a moderator cannot demote a moderator', async () => {
    await setRole(ALICE, { role: 'moderator', suspended: false })
    await assertFails(
      setDoc(doc(asMod(), 'roles', ALICE), { role: 'user', suspended: false }),
    )
  })

  test('a moderator cannot lift their own suspension', async () => {
    await setRole(MOD, { role: 'moderator', suspended: true })
    await assertFails(setDoc(doc(asMod(), 'roles', MOD), { role: 'moderator', suspended: false }))
  })

  test('an admin can suspend a moderator without demoting them', async () => {
    await setRole(ALICE, { role: 'moderator', suspended: false })
    await assertSucceeds(
      setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'moderator', suspended: true }),
    )
  })

  test('an admin cannot suspend another admin', async () => {
    // Two admins able to disable each other is a race with no good outcome.
    // Removing an admin is a console act, like creating one.
    await setRole(CAROL, { role: 'admin', suspended: false })
    await assertFails(
      setDoc(doc(asAdmin(), 'roles', CAROL), { role: 'user', suspended: true }),
    )
  })

  test('a plain user cannot suspend anybody, including themselves', async () => {
    await assertFails(setDoc(doc(asBob(), 'roles', ALICE), { role: 'user', suspended: true }))
    await assertFails(setDoc(doc(asBob(), 'roles', BOB), { role: 'user', suspended: false }))
  })

  test('nobody can write a role with a missing suspended flag', async () => {
    await assertFails(setDoc(doc(asMod(), 'roles', ALICE), { role: 'user' }))
  })
})

describe('a removal the host cannot walk back', () => {
  // These tests exist because the rules failed all of them. `validActivity`
  // accepts every status, and the host-edit branch ran nothing but
  // `validActivity` — so a host whose activity had just been taken down could
  // write status back to 'active' and carry on. Found by driving the emulator
  // as the host after a real moderator removal, not by reading the rules.

  /** Takes act1 down the way a moderator would, bypassing the rules. */
  const removeAct1 = () =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, {
          status: 'removed',
          moderation: { by: MOD, reason: 'A safety concern' },
        }),
      )
    })

  test('the host cannot put it back', async () => {
    await removeAct1()
    await assertFails(updateDoc(doc(asAlice(), 'activities', 'act1'), { status: 'active' }))
  })

  test('the host cannot relabel it as their own cancellation', async () => {
    // Which would hide that it was taken down rather than called off.
    await removeAct1()
    await assertFails(updateDoc(doc(asAlice(), 'activities', 'act1'), { status: 'cancelled' }))
  })

  test('the host cannot keep editing it', async () => {
    await removeAct1()
    await assertFails(updateDoc(doc(asAlice(), 'activities', 'act1'), { title: 'Same thing again' }))
    await assertFails(
      updateDoc(doc(asAlice(), 'activities', 'act1'), { locationName: 'Somewhere else' }),
    )
  })

  test('the host cannot delete it, even alone on the roster', async () => {
    // Deleting it would take the moderation record with it.
    await removeAct1()
    await assertFails(deleteDoc(doc(asAlice(), 'activities', 'act1')))
  })

  test('the host cannot erase the record of the decision', async () => {
    await removeAct1()
    await assertFails(
      updateDoc(doc(asAlice(), 'activities', 'act1'), {
        status: 'active',
        moderation: { by: ALICE, reason: 'Nothing happened' },
      }),
    )
  })

  test('a host cannot forge a moderation record on a live activity', async () => {
    await assertFails(
      updateDoc(doc(asAlice(), 'activities', 'act1'), {
        moderation: { by: MOD, reason: 'Reviewed and fine' },
      }),
    )
  })

  test('a host cannot post something already marked removed', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'activities', 'act2'), activityFixture(ALICE, { status: 'removed' })),
    )
    await assertFails(
      setDoc(
        doc(asAlice(), 'activities', 'act3'),
        activityFixture(ALICE, { moderation: { by: MOD, reason: 'Fine' } }),
      ),
    )
  })

  test('a moderator cannot put back what a moderator took down', async () => {
    // Reversing a takedown is a rank above making one.
    await removeAct1()
    await assertFails(
      updateDoc(doc(asMod(), 'activities', 'act1'), {
        status: 'active',
        moderation: { by: MOD, reason: 'Changed my mind' },
        updatedAt: 1,
      }),
    )
  })

  test('an admin can put it back, on the record', async () => {
    await removeAct1()
    await assertSucceeds(
      updateDoc(doc(asAdmin(), 'activities', 'act1'), {
        status: 'active',
        moderation: { by: ADMIN, reason: 'Reviewed — the report was mistaken' },
        updatedAt: 1,
      }),
    )
  })

  test('an admin putting it back still has to say why', async () => {
    await removeAct1()
    await assertFails(
      updateDoc(doc(asAdmin(), 'activities', 'act1'), {
        status: 'active',
        moderation: { by: ADMIN, reason: '' },
        updatedAt: 1,
      }),
    )
  })

  test('nobody can join a removed activity', async () => {
    await removeAct1()
    await assertFails(
      updateDoc(doc(asBob(), 'activities', 'act1'), {
        participantUids: [ALICE, BOB],
        updatedAt: 1,
      }),
    )
  })

  test('but somebody already in it can still get out', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, {
          participantUids: [ALICE, BOB],
          status: 'removed',
          moderation: { by: MOD, reason: 'A safety concern' },
        }),
      )
    })
    await assertSucceeds(
      updateDoc(doc(asBob(), 'activities', 'act1'), {
        participantUids: [ALICE],
        updatedAt: 1,
      }),
    )
  })
})

describe('unmatched paths', () => {
  test('writing to an undeclared collection is denied', async () => {
    await assertFails(addDoc(collection(asAlice(), 'anything'), { x: 1 }))
  })
})
