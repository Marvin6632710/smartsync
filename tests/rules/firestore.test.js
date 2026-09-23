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
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

let testEnv

const ALICE = 'alice'
const BOB = 'bob'
const CAROL = 'carol'
const ADMIN = 'admin'
// A second admin: the claim and the conflict-of-interest rules need two.
const ADMIN2 = 'admin2'

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
    await setDoc(doc(db, 'roles', ADMIN), { role: 'admin', suspended: false })
    await setDoc(doc(db, 'roles', ADMIN2), { role: 'admin', suspended: false })
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
const asAdmin = () => testEnv.authenticatedContext(ADMIN).firestore()
const asAdmin2 = () => testEnv.authenticatedContext(ADMIN2).firestore()

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

  test('a date of birth under fifteen is refused, whatever the form did', async () => {
    // The gate the app draws is a courtesy; this is the gate. A client
    // that skips the screen, or sends its own request, has to meet the
    // same minimum — otherwise the youngest account that can exist is
    // decided by whoever is willing to edit some JavaScript.
    const almost = new Date()
    almost.setFullYear(almost.getFullYear() - 15)
    almost.setDate(almost.getDate() + 1)
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await assertFails(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'private', 'profile'),
        { dateOfBirth: iso(almost) },
        { merge: true },
      ),
    )
  })

  test('a date of birth of exactly fifteen years ago is accepted', async () => {
    const exactly = new Date()
    exactly.setFullYear(exactly.getFullYear() - 15)
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await assertSucceeds(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'private', 'profile'),
        { dateOfBirth: iso(exactly) },
        { merge: true },
      ),
    )
  })

  test('a date of birth that is not a date is refused', async () => {
    for (const bad of ['tomorrow', '2011-9-1', 20110901, true]) {
      await assertFails(
        setDoc(
          doc(asAlice(), 'users', ALICE, 'private', 'profile'),
          { dateOfBirth: bad },
          { merge: true },
        ),
      )
    }
  })

  test('every other private setting is still the owner\'s alone to change', async () => {
    // The date of birth is the one field the database has an opinion
    // about; a write that does not mention it must be untouched by that.
    await assertSucceeds(
      setDoc(
        doc(asAlice(), 'users', ALICE, 'private', 'profile'),
        { privacy: { approximateLocation: false } },
        { merge: true },
      ),
    )
  })

  test('a public age must be a number in a human range, or absent', async () => {
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), { age: 26 }))
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), { age: null }))
    // Under the minimum it is not an age this app should be carrying,
    // and a string is not an age at all.
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { age: 12 }))
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { age: 900 }))
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { age: 'twenty' }))
  })

  test('two joins in quick succession both reach the history', async () => {
    // The history signal used to be written as a whole list from the client's
    // copy of the profile, so a second join before the first landed erased
    // it. A server-side union cannot, whatever order the writes arrive in.
    const db = asAlice()
    await assertSucceeds(
      updateDoc(doc(db, 'users', ALICE), { historyCategories: arrayUnion('Coffee') }),
    )
    await assertSucceeds(
      updateDoc(doc(db, 'users', ALICE), { historyCategories: arrayUnion('Gym') }),
    )
    // And once more for something already there, which must stay a no-op.
    await assertSucceeds(
      updateDoc(doc(db, 'users', ALICE), { historyCategories: arrayUnion('Coffee') }),
    )
    let after
    await testEnv.withSecurityRulesDisabled(async (context) => {
      after = (await getDoc(doc(context.firestore(), 'users', ALICE))).data()
    })
    expect(after.historyCategories).toEqual(['Coffee', 'Gym'])
  })

  test('a bio is up to 75 words, under a ceiling of 500 characters', async () => {
    // Five-letter words: 75 of them are 449 characters, under the ceiling.
    const words = (n) => Array.from({ length: n }, () => 'about').join(' ')
    // 75 words of English run well past the old 300-character limit.
    expect(words(75).length).toBeGreaterThan(300)
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), { bio: words(75) }))
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { bio: words(76) }))
    // Newlines and tabs separate words like spaces do.
    await assertFails(
      updateDoc(doc(asAlice(), 'users', ALICE), { bio: words(38) + '\n' + words(38) }),
    )
    // A script without spaces is bounded by characters alone.
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), { bio: '好'.repeat(500) }))
    await assertFails(updateDoc(doc(asAlice(), 'users', ALICE), { bio: '好'.repeat(501) }))
    await assertSucceeds(updateDoc(doc(asAlice(), 'users', ALICE), { bio: '' }))
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

  // The identity copy on an activity follows the profile, whatever state the
  // activity is in. A removed one is frozen to its host in every other way.
  const stamp = { hostName: 'Anonymous user', hostAvatar: 'AN' }

  test('the host can restamp their name on a removed activity', async () => {
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, { status: 'removed', moderation: { by: ADMIN2, reason: 'x' } }),
      ),
    )
    await assertSucceeds(updateDoc(doc(asAlice(), 'activities', 'act1'), stamp))
  })

  test('and on one pinned outside the box before the box existed', async () => {
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), 'activities', 'act1'), activityFixture(ALICE, { lat: 51.5 })),
    )
    await assertSucceeds(updateDoc(doc(asAlice(), 'activities', 'act1'), stamp))
  })

  test('but the stamp cannot carry anything else with it', async () => {
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, { status: 'removed', moderation: { by: ADMIN2, reason: 'x' } }),
      ),
    )
    const ref = doc(asAlice(), 'activities', 'act1')
    await assertFails(updateDoc(ref, { ...stamp, status: 'active' }))
    await assertFails(updateDoc(ref, { ...stamp, title: 'Renamed' }))
    await assertFails(updateDoc(ref, { ...stamp, participantUids: [ALICE, BOB] }))
    await assertFails(updateDoc(ref, { ...stamp, moderation: { by: ALICE, reason: '' } }))
    await assertFails(updateDoc(ref, { hostName: '', hostAvatar: 'AN' }))
  })

  test('nobody else can restamp it, an admin included', async () => {
    await assertFails(updateDoc(doc(asBob(), 'activities', 'act1'), stamp))
    await assertFails(updateDoc(doc(asAdmin2(), 'activities', 'act1'), stamp))
  })

  test('the profile and every hosted activity can change in one batch', async () => {
    // What anonymous mode actually writes: the public profile, the private
    // one, and the copy of the name on each activity — all or nothing.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(
        doc(db, 'activities', 'act2'),
        activityFixture(ALICE, { status: 'removed', moderation: { by: ADMIN2, reason: 'x' } }),
      )
    })
    const db = asAlice()
    const batch = writeBatch(db)
    batch.update(doc(db, 'activities', 'act1'), stamp)
    batch.update(doc(db, 'activities', 'act2'), stamp)
    batch.update(doc(db, 'users', ALICE), {
      name: 'Anonymous user',
      avatar: 'AN',
      anonymous: true,
    })
    batch.set(
      doc(db, 'users', ALICE, 'private', 'profile'),
      { privacy: { anonymousMode: true } },
      { merge: true },
    )
    await assertSucceeds(batch.commit())
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

describe('the activity has to be in Thailand', () => {
  // The map clamps to the country, so a coordinate outside it is not a
  // far-away activity — it is one the map can never show. If the rules did
  // not agree with the map, the REST API would be a way to put activities
  // into everybody's feed that nobody could ever navigate to.
  const rejects = (overrides) =>
    assertFails(addDoc(collection(asBob(), 'activities'), activityFixture(BOB, overrides)))
  const accepts = (overrides) =>
    assertSucceeds(addDoc(collection(asBob(), 'activities'), activityFixture(BOB, overrides)))

  test('accepts the cities the app is actually for', async () => {
    await accepts({ lat: 13.7563, lng: 100.5018 }) // Bangkok
    await accepts({ lat: 18.7883, lng: 98.9853 }) // Chiang Mai
    await accepts({ lat: 7.8804, lng: 98.3923 }) // Phuket
    await accepts({ lat: 16.4419, lng: 102.836 }) // Khon Kaen
    await accepts({ lat: 6.5408, lng: 101.2803 }) // Narathiwat, near the southern tip
  })

  test('accepts the corners of the box exactly', async () => {
    // Inclusive comparisons, so the boundary itself is inside. Somebody in
    // Mae Sai should not be told their town is not in the country.
    await accepts({ lat: 5.5, lng: 97.2 })
    await accepts({ lat: 20.6, lng: 105.7 })
  })

  test('rejects a hair outside each edge', async () => {
    await rejects({ lat: 5.49, lng: 100.5 })
    await rejects({ lat: 20.61, lng: 100.5 })
    await rejects({ lat: 13.75, lng: 97.19 })
    await rejects({ lat: 13.75, lng: 105.71 })
  })

  test('rejects places that are plainly somewhere else', async () => {
    await rejects({ lat: 1.3521, lng: 103.8198 }) // Singapore
    await rejects({ lat: 35.6762, lng: 139.6503 }) // Tokyo
    await rejects({ lat: 51.5072, lng: -0.1276 }) // London
    await rejects({ lat: -33.8688, lng: 151.2093 }) // Sydney
  })

  test('rejects null island, which is the shape a missing coordinate takes', async () => {
    // 0,0 is in the Gulf of Guinea and is what you get when two fields that
    // were never filled in are coerced to numbers.
    await rejects({ lat: 0, lng: 0 })
  })

  test('still rejects an impossible coordinate', async () => {
    // The narrower range has to remain a superset of the old sanity check,
    // not a replacement that accidentally lets a NaN-ish value through.
    await rejects({ lat: 991, lng: 100.5 })
    await rejects({ lat: 13.75, lng: -181 })
    await rejects({ lat: 'somewhere', lng: 100.5 })
  })

  test('a latitude inside the box with a longitude outside it is still rejected', async () => {
    // Both halves are tested independently; an `&&` written as an `||` would
    // pass this one and nothing else in the suite would notice.
    await rejects({ lat: 13.7563, lng: 139.6503 })
    await rejects({ lat: 35.6762, lng: 100.5018 })
  })
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
      setDoc(
        doc(asAlice(), 'activities', 'ok'),
        activityFixture(ALICE, {
          date: '2030-01-01',
          time: '19:00',
        }),
      ),
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

  // MODERATION BEFORE DELIVERY (ADR-033)
  //
  // No client writes a message any more — not a stranger, not a
  // participant, not the host, not an admin. The only way in is the
  // moderation Function, which writes with the Admin SDK past these
  // rules. These four tests are the whole enforcement: if any of them
  // starts passing, moderation has become optional.
  test('a non-participant cannot post', async () => {
    await assertFails(
      addDoc(collection(asBob(), 'activities', 'act1', 'messages'), {
        senderId: BOB,
        senderName: 'Bob',
        text: 'let me in',
      }),
    )
  })

  test('a participant cannot post directly either — moderation is not optional', async () => {
    await assertFails(
      addDoc(collection(asAlice(), 'activities', 'act1', 'messages'), {
        senderId: ALICE,
        senderName: 'Alice',
        text: 'on my way',
      }),
    )
  })

  test('a joined user can read, and still cannot post', async () => {
    await joinBob()
    await assertSucceeds(getDocs(collection(asBob(), 'activities', 'act1', 'messages')))
    await assertFails(
      addDoc(collection(asBob(), 'activities', 'act1', 'messages'), {
        senderId: BOB,
        senderName: 'Bob',
        text: 'coming',
      }),
    )
  })

  test('an admin cannot post one either', async () => {
    // There is no privileged way around the check: an approved message is
    // one the Function approved, whoever is asking.
    await assertFails(
      addDoc(collection(asAdmin(), 'activities', 'act1', 'messages'), {
        senderId: ADMIN,
        senderName: 'Admin',
        text: 'official notice',
      }),
    )
  })

  test('a thread closes thirty days after the activity', async () => {
    // Retention is enforced by the database rather than filtered in the
    // client, so it holds against someone querying Firestore directly.
    // (Reading is the half a client still does; writing is refused
    // everywhere now.)
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

  test('the badge may count the unread ones — for the owner, and nobody else', async () => {
    const unread = (db) =>
      query(collection(db, 'users', ALICE, 'notifications'), where('read', '==', false), limit(100))
    await assertSucceeds(getDocs(unread(asAlice())))
    await assertFails(getDocs(unread(asBob())))
  })

  // Puts Bob on Alice's roster, which is what every legitimate notification
  // between them is about: he joined, so he tells her; she cancels, so she
  // tells him; either of them writes in the chat.
  const bobJoins = () =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, { participantUids: [ALICE, BOB] }),
      )
    })

  // The shape the app writes, so every test below fails for exactly the
  // reason it names and not for a missing field.
  const note = (overrides = {}) => ({
    type: 'activity',
    title: 'Bob joined',
    body: 'Bob joined your football night',
    activityId: 'act1',
    read: false,
    ...overrides,
  })

  test('a participant can notify the host about the activity', async () => {
    await bobJoins()
    await assertSucceeds(addDoc(collection(asBob(), 'users', ALICE, 'notifications'), note()))
  })

  test('a participant can no longer announce a chat message', async () => {
    // It used to be theirs to write, and that was the hole moderation
    // had to close: a notification is a copy of a message in somebody
    // else's inbox, unread count and lock screen. Since ADR-033 only the
    // Function that approved the message writes the notice for it.
    await bobJoins()
    await assertFails(
      addDoc(
        collection(asAlice(), 'users', BOB, 'notifications'),
        note({ type: 'chat', title: 'New message in Football Night', body: 'Alice: hi' }),
      ),
    )
  })

  test('a host can tell a follower about something they are hosting', async () => {
    await assertSucceeds(
      addDoc(
        collection(asAlice(), 'users', BOB, 'notifications'),
        note({ type: 'follow', title: 'Alice posted an activity', body: 'Football Night' }),
      ),
    )
  })

  // The hole this closes: any account could write a notice that looked like
  // a moderation decision — "your account has been closed, email us to
  // appeal" — into anybody's inbox. It rendered under Safety.
  test('an ordinary user cannot forge a moderation notice', async () => {
    await bobJoins()
    await assertFails(
      addDoc(
        collection(asBob(), 'users', ALICE, 'notifications'),
        note({
          type: 'moderation',
          title: 'Your SmartSync account has been closed',
          body: 'To appeal, email admin@evil.example within 24 hours.',
        }),
      ),
    )
  })

  test('nor a notification of a type the app does not have', async () => {
    await bobJoins()
    await assertFails(
      addDoc(collection(asBob(), 'users', ALICE, 'notifications'), note({ type: 'system' })),
    )
  })

  test('nor one about an activity the sender is not part of', async () => {
    // Bob is not on act1's roster here.
    await assertFails(addDoc(collection(asBob(), 'users', ALICE, 'notifications'), note()))
  })

  test('nor one pointing at an activity that does not exist', async () => {
    await bobJoins()
    await assertFails(
      addDoc(collection(asBob(), 'users', ALICE, 'notifications'), note({ activityId: 'nowhere' })),
    )
  })

  test('nor one with no activity at all', async () => {
    await bobJoins()
    const { activityId: _dropped, ...withoutActivity } = note()
    await assertFails(addDoc(collection(asBob(), 'users', ALICE, 'notifications'), withoutActivity))
  })

  test('nor one carrying fields the app never writes', async () => {
    await bobJoins()
    await assertFails(
      addDoc(
        collection(asBob(), 'users', ALICE, 'notifications'),
        note({ link: 'https://evil.example' }),
      ),
    )
  })

  test('an admin can send a moderation notice, with or without an activity', async () => {
    await assertSucceeds(
      addDoc(collection(asAdmin2(), 'users', ALICE, 'notifications'), {
        type: 'moderation',
        title: 'Your activity was removed',
        body: 'SmartSync removed "Football Night": a safety concern.',
        activityId: 'act1',
        read: false,
      }),
    )
    await assertSucceeds(
      addDoc(collection(asAdmin2(), 'users', ALICE, 'notifications'), {
        type: 'moderation',
        title: 'A warning about your SmartSync account',
        body: 'Please read the community policy.',
        read: false,
      }),
    )
  })

  test('an admin is not exempt from the roster rule for ordinary notices', async () => {
    // The rank lets them write moderation notices. It does not let them
    // write "Bob joined" on behalf of a roster they are not on.
    await assertFails(
      addDoc(collection(asAdmin2(), 'users', ALICE, 'notifications'), note({ type: 'activity' })),
    )
  })

  test('a suspended admin cannot send a moderation notice', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'roles', ADMIN2), { role: 'admin', suspended: true })
    })
    await assertFails(
      addDoc(collection(asAdmin2(), 'users', ALICE, 'notifications'), {
        type: 'moderation',
        title: 'A warning about your SmartSync account',
        body: 'x',
        read: false,
      }),
    )
  })

  test('knowing the bucket id does not let a client write one', async () => {
    // The per-thread, per-window id is derivable by anybody — it is a
    // thread and a clock. What stops a forged chat notice is the type
    // itself being refused, not the id being hard to guess. (The
    // bucketing now lives in the Function; tests/unit/chatServer covers
    // that one notice is written per window.)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'users', CAROL), publicProfile(CAROL, 'Carol'))
      await setDoc(
        doc(db, 'activities', 'act1'),
        activityFixture(ALICE, { participantUids: [ALICE, BOB, CAROL] }),
      )
    })
    const chat = note({ type: 'chat', title: 'New message in Football Night' })
    await assertFails(setDoc(doc(asBob(), 'users', ALICE, 'notifications', 'chat-act1-2839'), chat))
    await assertFails(
      setDoc(doc(asCarol(), 'users', ALICE, 'notifications', 'chat-act1-2840'), chat),
    )
  })

  test('being on the roster does not get past a block', async () => {
    await bobJoins()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE, 'blocked', BOB), { name: 'Bob' })
    })
    await assertFails(addDoc(collection(asBob(), 'users', ALICE, 'notifications'), note()))
  })

  test('a user who turned notifications off cannot be notified', async () => {
    // Enforced by the rules, not by the sending client's good manners.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE), {
        ...publicProfile(ALICE, 'Alice'),
        notificationsEnabled: false,
      })
    })
    await bobJoins()
    await assertFails(addDoc(collection(asBob(), 'users', ALICE, 'notifications'), note()))
  })

  test('a forged pre-read notification is rejected', async () => {
    await bobJoins()
    await assertFails(
      addDoc(collection(asBob(), 'users', ALICE, 'notifications'), note({ read: true })),
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

  // The host-side half. This is what lets the host's own client find out who
  // is listening, which is the only way "you'll be alerted when they post"
  // can be true without a server.
  const mirror = (db, hostId, followerId) => doc(db, 'users', hostId, 'followers', followerId)

  test('a follower can write their own row on the host', async () => {
    await assertSucceeds(setDoc(mirror(asAlice(), BOB, ALICE), { createdAt: 1 }))
  })

  test('the host can read who follows them', async () => {
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(mirror(context.firestore(), BOB, ALICE), { createdAt: 1 }),
    )
    await assertSucceeds(getDocs(collection(asBob(), 'users', BOB, 'followers')))
  })

  test('the follower can read their own row, and nobody else can see the list', async () => {
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(mirror(context.firestore(), BOB, ALICE), { createdAt: 1 }),
    )
    await assertSucceeds(getDoc(mirror(asAlice(), BOB, ALICE)))
    await assertFails(getDocs(collection(asCarol(), 'users', BOB, 'followers')))
    await assertFails(getDoc(mirror(asCarol(), BOB, ALICE)))
  })

  test('nobody can sign somebody else up as a follower', async () => {
    await assertFails(setDoc(mirror(asCarol(), BOB, ALICE), { createdAt: 1 }))
    // Nor the host, on their own behalf.
    await assertFails(setDoc(mirror(asBob(), BOB, ALICE), { createdAt: 1 }))
  })

  test('nobody follows themselves', async () => {
    await assertFails(setDoc(mirror(asAlice(), ALICE, ALICE), { createdAt: 1 }))
  })

  test('a row carries a timestamp and nothing else', async () => {
    await assertFails(setDoc(mirror(asAlice(), BOB, ALICE), { createdAt: 1, note: 'hi' }))
  })

  test('a row cannot be edited, and only the follower removes it', async () => {
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(mirror(context.firestore(), BOB, ALICE), { createdAt: 1 }),
    )
    await assertFails(updateDoc(mirror(asAlice(), BOB, ALICE), { createdAt: 2 }))
    await assertFails(deleteDoc(mirror(asBob(), BOB, ALICE)))
    await assertFails(deleteDoc(mirror(asCarol(), BOB, ALICE)))
    await assertSucceeds(deleteDoc(mirror(asAlice(), BOB, ALICE)))
  })

  test('a closed account cannot follow anybody', async () => {
    await testEnv.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), 'roles', ALICE), {
        role: 'user',
        suspended: false,
        banned: true,
      }),
    )
    await assertFails(setDoc(mirror(asAlice(), BOB, ALICE), { createdAt: 1 }))
  })

  test('the two halves commit together', async () => {
    // The app writes both in one batch. Either side being refused refuses
    // the pair, so the button and the delivery cannot disagree.
    const db = asAlice()
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', ALICE, 'following', BOB), { createdAt: 1 })
    batch.set(mirror(db, BOB, ALICE), { createdAt: 1 })
    await assertSucceeds(batch.commit())

    const bad = writeBatch(db)
    bad.set(doc(db, 'users', ALICE, 'following', CAROL), { createdAt: 1 })
    bad.set(mirror(db, CAROL, BOB), { createdAt: 1 }) // naming Bob, not herself
    await assertFails(bad.commit())
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

  test('an admin can read anyone s role', async () => {
    await setRole(ALICE, {})
    await assertSucceeds(getDoc(doc(asAdmin2(), 'roles', ALICE)))
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

  test('there is no rank to hand out: the only role the app may write is "user"', async () => {
    // The moderator rank was retired. Nothing may bring it back by writing
    // the word, an admin included.
    await assertFails(
      setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'moderator', suspended: false }),
    )
    await assertSucceeds(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'user', suspended: false }))
  })

  test('an admin cannot create another admin', async () => {
    // There is no in-app path to admin at all, so a compromised admin cannot
    // mint more. It is set from the Firebase console or not at all.
    await assertFails(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'admin', suspended: false }))
  })

  test('an admin cannot edit their own row', async () => {
    // Somebody who can rewrite their own role can undo any limit placed on
    // them, and can strip their own admin by mistake and lock everyone out.
    await assertFails(setDoc(doc(asAdmin(), 'roles', ADMIN), { role: 'user', suspended: false }))
    await assertFails(deleteDoc(doc(asAdmin(), 'roles', ADMIN)))
  })

  test('an admin can suspend and restore somebody', async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'user', suspended: true }))
    await assertSucceeds(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'user', suspended: false }))
  })

  test('a role row must say whether the person is suspended', async () => {
    await assertFails(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'user' }))
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
  test('an admin can take an activity down', async () => {
    await assertSucceeds(
      updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by: ADMIN2, reason: 'Breaks the safety policy' },
        updatedAt: 1,
      }),
    )
  })

  test('taking one down has to say why', async () => {
    await assertFails(
      updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by: ADMIN2, reason: '' },
        updatedAt: 1,
      }),
    )
  })

  test('an admin cannot pin the decision on somebody else', async () => {
    await assertFails(
      updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by: ALICE, reason: 'Breaks the safety policy' },
        updatedAt: 1,
      }),
    )
  })

  test('an admin cannot edit an activity, only remove it', async () => {
    // Taking something down is a narrow power on purpose: not rewriting it,
    // not reassigning it, not deciding who else is going.
    await assertFails(updateDoc(doc(asAdmin2(), 'activities', 'act1'), { title: 'Rewritten' }))
    await assertFails(updateDoc(doc(asAdmin2(), 'activities', 'act1'), { capacity: 500 }))
    await assertFails(updateDoc(doc(asAdmin2(), 'activities', 'act1'), { hostId: ADMIN2 }))
    await assertFails(
      updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
        participantUids: [ALICE, CAROL],
        updatedAt: 1,
      }),
    )
    await assertFails(
      // And cannot quietly cancel instead of removing, which would hide that
      // an admin acted at all.
      updateDoc(doc(asAdmin2(), 'activities', 'act1'), { status: 'cancelled', updatedAt: 1 }),
    )
  })

  test('an admin may still join an activity like anybody else', async () => {
    // Moderating is a job, not a different kind of membership.
    await assertSucceeds(
      updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
        participantUids: [ALICE, ADMIN2],
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

  test('an admin can read a report they did not file', async () => {
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
    await assertSucceeds(getDoc(doc(asAdmin2(), 'reports', 'r1')))
    await assertFails(getDoc(doc(asCarol(), 'reports', 'r1')))
  })

  const openReport = (overrides = {}) => ({
    reporterId: BOB,
    targetType: 'user',
    targetId: ALICE,
    subjectId: ALICE,
    reason: 'harassment',
    detail: 'x',
    status: 'open',
    ...overrides,
  })
  const seedReport = (overrides = {}) =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), openReport(overrides))
      await setDoc(doc(context.firestore(), 'roles', ADMIN), { role: 'admin', suspended: false })
    })
  const claimAs = (dbFor, by) =>
    updateDoc(doc(dbFor(), 'reports', 'r1'), { claim: { by, at: serverTimestamp() } })
  const releaseAs = (dbFor) => updateDoc(doc(dbFor(), 'reports', 'r1'), { claim: deleteField() })
  const decision = (by, status = 'actioned', outcome = 'Account suspended') => ({
    status,
    reviewedBy: by,
    reviewedAt: 1,
    outcome,
  })
  const decideAs = (dbFor, by, status, outcome) =>
    updateDoc(doc(dbFor(), 'reports', 'r1'), decision(by, status, outcome))
  const staleClaim = (by) => ({ by, at: new Date(Date.now() - 10 * 60_000) })

  test('an admin can record a decision — on a report they have claimed', async () => {
    await seedReport()
    await assertSucceeds(claimAs(asAdmin2, ADMIN2))
    await assertSucceeds(decideAs(asAdmin2, ADMIN2))
  })

  test('a decision without a claim is refused, even from the right rank', async () => {
    await seedReport()
    await assertFails(decideAs(asAdmin2, ADMIN2))
    await assertFails(decideAs(asAdmin, ADMIN))
  })

  test('a report is closed once — a second decision is refused, whoever makes it', async () => {
    // Two admins ruling within seconds of each other both used to
    // succeed, and the record kept only whichever landed second. The first
    // decision stands; the app tells the second admin so.
    await seedReport()
    await assertSucceeds(claimAs(asAdmin2, ADMIN2))
    await assertSucceeds(decideAs(asAdmin2, ADMIN2))
    // The same admin again, and another: neither may reopen or overwrite.
    await assertFails(decideAs(asAdmin2, ADMIN2, 'dismissed', 'No action needed'))
    await assertFails(claimAs(asAdmin, ADMIN))
    await assertFails(decideAs(asAdmin, ADMIN, 'dismissed', 'No action needed'))
    await assertFails(decideAs(asAdmin, ADMIN, 'open', ''))
  })

  describe('claiming a report', () => {
    test('two admins claiming at once: exactly one wins', async () => {
      await seedReport()
      const results = await Promise.allSettled([claimAs(asAdmin2, ADMIN2), claimAs(asAdmin, ADMIN)])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    })

    test('another admin cannot claim, decide, or release while a fresh claim stands', async () => {
      await seedReport()
      await assertSucceeds(claimAs(asAdmin2, ADMIN2))
      await assertFails(claimAs(asAdmin, ADMIN))
      await assertFails(decideAs(asAdmin, ADMIN))
      await assertFails(releaseAs(asAdmin))
      // The holder may renew their own claim, and decide.
      await assertSucceeds(claimAs(asAdmin2, ADMIN2))
      await assertSucceeds(decideAs(asAdmin2, ADMIN2))
    })

    test('a claim that failed to finish is released, and the next person gets in', async () => {
      await seedReport()
      await assertSucceeds(claimAs(asAdmin2, ADMIN2))
      await assertSucceeds(releaseAs(asAdmin2))
      await assertSucceeds(claimAs(asAdmin, ADMIN))
      await assertSucceeds(decideAs(asAdmin, ADMIN))
    })

    test('a stale claim can be taken over, and its holder can no longer decide', async () => {
      await seedReport({ claim: staleClaim(ADMIN2) })
      await assertSucceeds(claimAs(asAdmin, ADMIN))
      await assertFails(decideAs(asAdmin2, ADMIN2))
      await assertSucceeds(decideAs(asAdmin, ADMIN))
    })

    test('a claim must be the caller’s own, stamped by the server, and nothing more', async () => {
      await seedReport()
      await assertFails(
        updateDoc(doc(asAdmin2(), 'reports', 'r1'), {
          claim: { by: ADMIN, at: serverTimestamp() },
        }),
      )
      await assertFails(
        updateDoc(doc(asAdmin2(), 'reports', 'r1'), { claim: { by: ADMIN2, at: new Date() } }),
      )
      await assertFails(
        updateDoc(doc(asAdmin2(), 'reports', 'r1'), {
          claim: { by: ADMIN2, at: serverTimestamp(), note: 'mine' },
        }),
      )
    })

    test('nobody claims a report that is already closed', async () => {
      await seedReport({ status: 'dismissed', reviewedBy: ADMIN, outcome: 'x' })
      await assertFails(claimAs(asAdmin2, ADMIN2))
    })

    test('the reporter, the subject and a plain user cannot claim', async () => {
      await seedReport({ reporterId: ADMIN2 })
      await assertFails(claimAs(asAdmin2, ADMIN2))
      await seedReport({ targetId: ADMIN2, subjectId: ADMIN2 })
      await assertFails(claimAs(asAdmin2, ADMIN2))
      await seedReport()
      await assertFails(claimAs(asBob, BOB))
      await assertFails(claimAs(asAlice, ALICE))
    })

    test('a suspended admin cannot claim', async () => {
      await seedReport()
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'roles', ADMIN2), { role: 'admin', suspended: true })
      })
      await assertFails(claimAs(asAdmin2, ADMIN2))
    })

    test('a report cannot be filed already claimed', async () => {
      await assertFails(
        addDoc(collection(asBob(), 'reports'), {
          ...openReport(),
          claim: { by: BOB, at: serverTimestamp() },
        }),
      )
    })
  })

  describe('a takedown that names its report', () => {
    const takeDown = (dbFor, by, extra = {}) =>
      updateDoc(doc(dbFor(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by, reason: 'spam', reportId: 'r1', ...extra },
        updatedAt: 1,
      })

    test('lands only while the claim is held and the report is open', async () => {
      await seedReport({ targetType: 'activity', targetId: 'act1', subjectId: ALICE })
      await assertFails(takeDown(asAdmin2, ADMIN2))
      await assertSucceeds(claimAs(asAdmin2, ADMIN2))
      await assertSucceeds(takeDown(asAdmin2, ADMIN2))
    })

    test('is refused under somebody else’s claim, and after the report is closed', async () => {
      await seedReport({ targetType: 'activity', targetId: 'act1', subjectId: ALICE })
      await assertSucceeds(claimAs(asAdmin, ADMIN))
      await assertFails(takeDown(asAdmin2, ADMIN2))
      await assertSucceeds(decideAs(asAdmin, ADMIN))
      await assertFails(takeDown(asAdmin, ADMIN))
    })

    test('a takedown that names no report is judged as before', async () => {
      await assertSucceeds(
        updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
          status: 'removed',
          moderation: { by: ADMIN2, reason: 'spam' },
          updatedAt: 1,
        }),
      )
    })

    test('a takedown naming a report that does not exist is refused', async () => {
      await assertFails(
        updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
          status: 'removed',
          moderation: { by: ADMIN2, reason: 'spam', reportId: 'nope' },
          updatedAt: 1,
        }),
      )
    })

    test('the moderation record carries nothing but who, why and which report', async () => {
      await seedReport({ targetType: 'activity', targetId: 'act1', subjectId: ALICE })
      await assertSucceeds(claimAs(asAdmin2, ADMIN2))
      await assertFails(takeDown(asAdmin2, ADMIN2, { extra: 'field' }))
    })
  })

  test('an admin cannot rewrite what was reported', async () => {
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
    await assertFails(updateDoc(doc(asAdmin2(), 'reports', 'r1'), { detail: 'nothing happened' }))
    await assertFails(updateDoc(doc(asAdmin2(), 'reports', 'r1'), { reason: 'spam' }))
    await assertFails(deleteDoc(doc(asAdmin2(), 'reports', 'r1')))
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

describe('a suspended admin', () => {
  // Suspension takes the powers, not the rank. Before this, suspending a
  // rank that was abusing the queue took nothing away from them — they kept
  // removing activities and suspending people while suspended. Only
  // reachable from the Firebase console — no admin can suspend another —
  // but if it happens the powers must go with it.

  beforeEach(() => setRole(ADMIN2, { role: 'admin', suspended: true }))

  test('cannot take an activity down', async () => {
    await assertFails(
      updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
        status: 'removed',
        moderation: { by: ADMIN2, reason: 'Breaks the safety policy' },
        updatedAt: 1,
      }),
    )
  })

  test('cannot suspend anybody', async () => {
    await assertFails(setDoc(doc(asAdmin2(), 'roles', ALICE), { role: 'user', suspended: true }))
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
    await assertFails(getDoc(doc(asAdmin2(), 'reports', 'r1')))
  })

  test('cannot lift their own suspension', async () => {
    await assertFails(setDoc(doc(asAdmin2(), 'roles', ADMIN2), { role: 'admin', suspended: false }))
  })

  test('keeps the rank, and only the console hands the powers back', async () => {
    // No admin may act on another, a suspended one included — so lifting
    // this is done where the rank was granted.
    await assertFails(setDoc(doc(asAdmin(), 'roles', ADMIN2), { role: 'admin', suspended: false }))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'roles', ADMIN2), { role: 'admin', suspended: false })
    })
    await assertSucceeds(setDoc(doc(asAdmin2(), 'roles', ALICE), { role: 'user', suspended: true }))
  })

  test('and can still read, which is the point of suspending rather than banning', async () => {
    await assertSucceeds(getDoc(doc(asAdmin2(), 'activities', 'act1')))
    await assertSucceeds(getDoc(doc(asAdmin2(), 'roles', ADMIN2)))
  })

  test('cannot restore a removed activity', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, {
          status: 'removed',
          moderation: { by: ADMIN, reason: 'A safety concern' },
        }),
      )
    })
    await assertFails(
      updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
        status: 'active',
        moderation: { by: ADMIN2, reason: 'Reviewed again' },
        updatedAt: 1,
      }),
    )
  })
})

describe('reviewing a report about yourself', () => {
  // An admin can never suspend themselves — /roles refuses that. But
  // until this was closed they could mark the complaint dismissed, which is
  // the same power exercised quietly. Found by looking at a reviewer's own
  // queue in the running app and seeing a report about them sitting in it
  // with a Dismiss button.

  const fileReport = (fields) =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reports', 'r1'), {
        reporterId: BOB,
        targetType: 'user',
        targetId: ADMIN2,
        reason: 'spam',
        detail: 'Posting the same thing over and over.',
        context: '',
        status: 'open',
        ...fields,
      })
    })

  // Claim, then decide: the decision needs the claim, and the claim is
  // refused for the same conflicts of interest, so "cannot decide" holds at
  // the first write and "can decide" needs both.
  const decide = async (db, outcome, by = ADMIN2) => {
    await updateDoc(doc(db, 'reports', 'r1'), { claim: { by, at: serverTimestamp() } })
    await updateDoc(doc(db, 'reports', 'r1'), {
      status: outcome,
      outcome: 'No action needed',
      reviewedBy: by,
      reviewedAt: 1,
    })
  }

  test('an admin cannot dismiss a report about themselves', async () => {
    await fileReport({})
    await assertFails(decide(asAdmin2(), 'dismissed'))
  })

  test('nor mark it actioned to make it look dealt with', async () => {
    await fileReport({})
    await assertFails(decide(asAdmin2(), 'actioned'))
  })

  test('an admin cannot dismiss a report about their own activity', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'activities', 'mine'), activityFixture(ADMIN2))
    })
    await fileReport({ targetType: 'activity', targetId: 'mine' })
    await assertFails(decide(asAdmin2(), 'dismissed'))
  })

  test('but somebody else can decide it', async () => {
    await fileReport({})
    await assertSucceeds(decide(asAdmin(), 'dismissed', ADMIN))
  })

  test('and a report about somebody else is still theirs to decide', async () => {
    await fileReport({ targetId: ALICE })
    await assertSucceeds(decide(asAdmin2(), 'actioned'))
  })

  test('a report naming an activity that no longer exists is still decidable', async () => {
    // aboutMe() reads the activity to find its host. A deleted target must
    // not make the report unresolvable.
    await fileReport({ targetType: 'activity', targetId: 'gone' })
    await assertSucceeds(decide(asAdmin2(), 'dismissed'))
  })
})

describe('the privilege ladder', () => {
  // Who may do what to whom. Two ranks: an admin acts on every ordinary
  // account and on no admin; an ordinary account acts on nobody. These pin
  // the boundary the rules are responsible for.

  test('an admin can suspend an ordinary user', async () => {
    // An admin who could take down one activity while the same account
    // posted ten more would be moderating nothing.
    await assertSucceeds(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'user', suspended: true }))
  })

  test('an admin can lift a suspension, whoever placed it', async () => {
    await setRole(ALICE, { role: 'user', suspended: true })
    await assertSucceeds(
      setDoc(doc(asAdmin2(), 'roles', ALICE), { role: 'user', suspended: false }),
    )
  })

  test('an admin cannot grant a rank while suspending somebody', async () => {
    await assertFails(
      setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'moderator', suspended: true }),
    )
    await assertFails(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'admin', suspended: true }))
  })

  test('an admin cannot suspend a fellow admin', async () => {
    // Otherwise two admins can disable each other, and whoever moves first
    // wins. Removing an admin is a console act, like creating one.
    await assertFails(setDoc(doc(asAdmin(), 'roles', ADMIN2), { role: 'user', suspended: true }))
    await assertFails(setDoc(doc(asAdmin(), 'roles', ADMIN2), { role: 'admin', suspended: true }))
  })

  test('an admin cannot demote a fellow admin', async () => {
    await assertFails(setDoc(doc(asAdmin(), 'roles', ADMIN2), { role: 'user', suspended: false }))
  })

  test('an admin cannot lift their own suspension', async () => {
    await setRole(ADMIN, { role: 'admin', suspended: true })
    await assertFails(setDoc(doc(asAdmin(), 'roles', ADMIN), { role: 'admin', suspended: false }))
  })

  test('a row still saying "moderator" is an ordinary account: an admin acts on it, it acts on nobody', async () => {
    await setRole(CAROL, { role: 'moderator', suspended: false })
    await assertFails(setDoc(doc(asCarol(), 'roles', ALICE), { role: 'user', suspended: true }))
    await assertSucceeds(setDoc(doc(asAdmin(), 'roles', CAROL), { role: 'user', suspended: true }))
  })

  test('a plain user cannot suspend anybody, including themselves', async () => {
    await assertFails(setDoc(doc(asBob(), 'roles', ALICE), { role: 'user', suspended: true }))
    await assertFails(setDoc(doc(asBob(), 'roles', BOB), { role: 'user', suspended: false }))
  })

  test('nobody can write a role with a missing suspended flag', async () => {
    await assertFails(setDoc(doc(asAdmin(), 'roles', ALICE), { role: 'user' }))
  })
})

describe('a removal the host cannot walk back', () => {
  // These tests exist because the rules failed all of them. `validActivity`
  // accepts every status, and the host-edit branch ran nothing but
  // `validActivity` — so a host whose activity had just been taken down could
  // write status back to 'active' and carry on. Found by driving the emulator
  // as the host after a real admin removal, not by reading the rules.

  /** Takes act1 down the way an admin would, bypassing the rules. */
  const removeAct1 = () =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'activities', 'act1'),
        activityFixture(ALICE, {
          status: 'removed',
          moderation: { by: ADMIN2, reason: 'A safety concern' },
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
    await assertFails(
      updateDoc(doc(asAlice(), 'activities', 'act1'), { title: 'Same thing again' }),
    )
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
        moderation: { by: ADMIN2, reason: 'Reviewed and fine' },
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
        activityFixture(ALICE, { moderation: { by: ADMIN2, reason: 'Fine' } }),
      ),
    )
  })

  test('an admin can put back what another admin took down, on the record', async () => {
    // Reversing a takedown is not a rank above making one — there is no
    // rank above — but it is never silent: the restore names who and why.
    await removeAct1()
    await assertSucceeds(
      updateDoc(doc(asAdmin2(), 'activities', 'act1'), {
        status: 'active',
        moderation: { by: ADMIN2, reason: 'Reviewed again — the report was mistaken' },
        updatedAt: 1,
      }),
    )
  })

  test('the admin who took it down can put it back too', async () => {
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
          moderation: { by: ADMIN2, reason: 'A safety concern' },
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

describe('chat moderation', () => {
  // Everything the moderation path writes, and what a client may do with
  // it. The message rules themselves are in the chat block above; these
  // are the collections that came with moderation (ADR-033).
  const seedBlock = (extra = {}) =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'moderationBlocks', 'b1'), {
        uid: ALICE,
        activityId: 'act1',
        reason: 'harassment',
        status: 'blocked',
        contentHeld: true,
        text: 'the refused message',
        createdAt: new Date(),
        ...extra,
      })
    })

  test('a refused message is readable by admins and by nobody else', async () => {
    await seedBlock()
    await assertSucceeds(getDoc(doc(asAdmin(), 'moderationBlocks', 'b1')))
    // Not even by the person who wrote it: the record carries the
    // categories that fired, and that is a recipe for the next attempt.
    await assertFails(getDoc(doc(asAlice(), 'moderationBlocks', 'b1')))
    await assertFails(getDoc(doc(asBob(), 'moderationBlocks', 'b1')))
  })

  test('nobody writes one — not the sender, not an admin', async () => {
    await seedBlock()
    await assertFails(
      setDoc(doc(asAlice(), 'moderationBlocks', 'mine'), { uid: ALICE, status: 'overturned' }),
    )
    // An admin's answer goes through the callable, which checks the rank
    // and holds the only path to the thread. Letting an admin edit the
    // record directly would let one mark a message approved without the
    // message ever being written, or the reverse.
    await assertFails(updateDoc(doc(asAdmin(), 'moderationBlocks', 'b1'), { status: 'upheld' }))
    await assertFails(deleteDoc(doc(asAdmin(), 'moderationBlocks', 'b1')))
  })

  test('a chat picture is readable by the thread, and by nobody else', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'chatPictures', 'msg1'), {
        activityId: 'act1',
        senderId: ALICE,
        dataUrl: 'data:image/png;base64,AAAA',
        createdAt: Date.now(),
      })
    })
    await assertSucceeds(getDoc(doc(asAlice(), 'chatPictures', 'msg1')))
    // Bob is not on the roster of act1 in this block's fixture.
    await assertFails(getDoc(doc(asBob(), 'chatPictures', 'msg1')))
  })

  test('nobody can attach a picture a moderator never saw', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'chatPictures', 'msg2'), {
        activityId: 'act1',
        senderId: ALICE,
        dataUrl: 'data:image/png;base64,AAAA',
        createdAt: Date.now(),
      }),
    )
    // Including over one that already exists — which is what "an approved
    // attachment cannot be swapped for an unchecked file" means in rules.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'chatPictures', 'msg3'), {
        activityId: 'act1',
        senderId: ALICE,
        dataUrl: 'data:image/png;base64,AAAA',
        createdAt: Date.now(),
      })
    })
    await assertFails(
      updateDoc(doc(asAlice(), 'chatPictures', 'msg3'), { dataUrl: 'data:image/png;base64,BBBB' }),
    )
    await assertFails(deleteDoc(doc(asAlice(), 'chatPictures', 'msg3')))
  })

  test('a chat notification cannot be written by a client any more', async () => {
    // The notice that a message exists may only be written by whatever
    // approved that message. Otherwise an unchecked message reaches an
    // inbox, an unread count and a lock screen.
    await assertFails(
      setDoc(doc(asAlice(), 'users', BOB, 'notifications', 'chat-act1-1'), {
        type: 'chat',
        title: 'Futsal',
        body: 'anything at all',
        activityId: 'act1',
        read: false,
        createdAt: new Date(),
      }),
    )
  })

  test('the other notification kinds still work', async () => {
    // The change is narrow on purpose: joining and following still
    // announce themselves from the client.
    await assertSucceeds(
      setDoc(doc(asAlice(), 'users', BOB, 'notifications', 'joined-1'), {
        type: 'activity',
        title: 'Futsal',
        body: 'Alice joined',
        activityId: 'act1',
        read: false,
        createdAt: new Date(),
      }),
    )
  })

  test('the send counters are the Function\'s alone', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'chatModeration', ALICE), {
        sends: { start: 1, count: 3 },
      })
      await setDoc(doc(context.firestore(), 'chatModerationUsage', '2026-09-22'), { count: 3 })
    })
    await assertFails(getDoc(doc(asAlice(), 'chatModeration', ALICE)))
    await assertFails(
      setDoc(doc(asAlice(), 'chatModeration', ALICE), { sends: { start: 1, count: 0 } }),
    )
    await assertFails(getDoc(doc(asAdmin(), 'chatModerationUsage', '2026-09-22')))
  })
})

describe('AI Picks', () => {
  // The Function's own records: the last answer a person got and their
  // hour's call count, and the day's total. Only the Admin SDK touches
  // them; a browser reading its own would learn nothing it was not told
  // through the callable, and writing would be a way round the limits.
  test('nobody reads or writes the answer kept for them, not even its owner', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'aiPicks', ALICE), {
        uid: ALICE,
        signature: 'x',
        picks: [],
        createdAt: 1,
        calls: { start: 1, count: 1 },
      })
      await setDoc(doc(context.firestore(), 'aiPicksUsage', '2026-09-21'), { count: 1 })
    })
    await assertFails(getDoc(doc(asAlice(), 'aiPicks', ALICE)))
    await assertFails(setDoc(doc(asAlice(), 'aiPicks', ALICE), { calls: { start: 1, count: 0 } }))
    await assertFails(updateDoc(doc(asAlice(), 'aiPicks', ALICE), { 'calls.count': 0 }))
    await assertFails(deleteDoc(doc(asAlice(), 'aiPicks', ALICE)))
    await assertFails(getDoc(doc(asAdmin(), 'aiPicks', ALICE)))
    await assertFails(getDoc(doc(asAlice(), 'aiPicksUsage', '2026-09-21')))
    await assertFails(setDoc(doc(asAdmin(), 'aiPicksUsage', '2026-09-21'), { count: 0 }))
  })
})
