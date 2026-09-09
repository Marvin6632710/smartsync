/**
 * Loads demo content into the LIVE project.
 *
 *   node scripts/seed-production.mjs --confirm
 *
 * Refuses to run without --confirm, because unlike scripts/seed.js this one
 * writes to real hosted data that other people can see.
 *
 * Safe to run more than once: an activity whose title and host already exist
 * is skipped rather than duplicated.
 *
 * Dates are spread across roughly five weeks with a deliberate cluster around
 * the SP1 defence. Past activities are hidden from discovery, so seeding only
 * "the next two weeks" would leave the app looking empty on the very day it
 * has to be demonstrated.
 */
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

if (!process.argv.includes('--confirm')) {
  console.error('\nThis writes to the LIVE project. Re-run with --confirm if that is intended.\n')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env.production', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('VITE_'))
    .map((line) => line.split('=')),
)

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
const auth = getAuth(app)
const db = getFirestore(app)
// Required, not defaulted. This file is in a public repository and the site
// it seeds is on the open internet, so a hardcoded fallback would be a
// published password for live accounts. It lives in
// demo-credentials.local.txt, which is gitignored.
//
//   SEED_PASSWORD='...' node scripts/seed-production.mjs --confirm
const PASSWORD = process.env.SEED_PASSWORD
if (!PASSWORD) {
  console.error(
    '\nSet SEED_PASSWORD before seeding the live project.' +
      '\nThe demo account password is in demo-credentials.local.txt.\n',
  )
  process.exit(1)
}

// ── people ──────────────────────────────────────────────────────────────────

const people = [
  {
    key: 'you',
    email: 'you@smartsync.demo',
    name: 'Min Khant Aung',
    username: '@hax_sync',
    bio: 'CS student in Bangkok looking for good activities and new people.',
    interests: ['Football', 'Gaming', 'Coffee'],
    preferredTime: 'Evening',
    history: ['Football', 'Gaming'],
  },
  {
    key: 'alex',
    email: 'alex@smartsync.demo',
    name: 'Alex Chen',
    username: '@alexc',
    bio: 'Football every week, gym the other days.',
    interests: ['Football', 'Gaming', 'Gym'],
    preferredTime: 'Evening',
    history: ['Football', 'Gym'],
  },
  {
    key: 'maya',
    email: 'maya@smartsync.demo',
    name: 'Maya Rahman',
    username: '@mayar',
    bio: 'Study sessions and good coffee.',
    interests: ['Coffee', 'Study', 'Movies'],
    preferredTime: 'Afternoon',
    history: ['Study', 'Coffee'],
  },
  {
    key: 'narin',
    email: 'narin@smartsync.demo',
    name: 'Narin Suksai',
    username: '@narin',
    bio: 'Runner and cyclist. Always hungry afterwards.',
    interests: ['Running', 'Cycling', 'Food'],
    preferredTime: 'Morning',
    history: ['Running', 'Cycling'],
  },
  {
    key: 'june',
    email: 'june@smartsync.demo',
    name: 'June Park',
    username: '@junep',
    bio: 'Games, films, and people who like both.',
    interests: ['Gaming', 'Movies', 'Hangouts'],
    preferredTime: 'Evening',
    history: ['Gaming', 'Movies'],
  },
  {
    key: 'pim',
    email: 'pim@smartsync.demo',
    name: 'Pim Charoen',
    username: '@pimc',
    bio: 'Basketball, street food, and anything happening after dark.',
    interests: ['Basketball', 'Food', 'Events'],
    preferredTime: 'Evening',
    history: ['Basketball', 'Food'],
  },
]

// ── activities: real places, real coordinates ───────────────────────────────
// `day` is days from today. Clustered so the fortnight around the defence is
// the busiest stretch rather than the emptiest.

const activities = [
  {
    host: 'alex',
    day: 1,
    time: '19:00',
    category: 'Football',
    capacity: 12,
    joiners: ['narin', 'june'],
    title: 'Football Night at Rama IX',
    place: 'Rama IX Park',
    lat: 13.6947,
    lng: 100.6597,
    desc: 'Friendly 6-a-side football. Beginners welcome, teams balanced on arrival.',
  },
  {
    host: 'maya',
    day: 2,
    time: '14:00',
    category: 'Study',
    capacity: 10,
    joiners: ['you'],
    title: 'Focus Study Circle',
    place: 'Samyan Mitrtown',
    lat: 13.7333,
    lng: 100.529,
    desc: 'Quiet two-hour study session with Pomodoro blocks and a short coffee break.',
  },
  {
    host: 'narin',
    day: 3,
    time: '06:30',
    category: 'Running',
    capacity: 20,
    joiners: ['alex'],
    title: 'Benjakitti Sunrise Run',
    place: 'Benjakitti Park',
    lat: 13.723,
    lng: 100.56,
    desc: 'Relaxed 5 km social run on the elevated park loop. Pace groups available.',
  },
  {
    host: 'june',
    day: 4,
    time: '20:00',
    category: 'Gaming',
    capacity: 16,
    joiners: ['you', 'alex'],
    title: 'Bangkok Night Gamers',
    place: 'Siam Square',
    lat: 13.7456,
    lng: 100.534,
    desc: 'Casual multiplayer session. Bring a laptop or handheld; some devices available.',
  },
  {
    host: 'maya',
    day: 5,
    time: '16:30',
    category: 'Coffee',
    capacity: 10,
    joiners: ['june', 'pim'],
    title: 'Coffee & New Connections',
    place: 'Ari',
    lat: 13.7797,
    lng: 100.5445,
    desc: 'Low-pressure coffee meetup for students and young professionals.',
  },
  {
    host: 'pim',
    day: 6,
    time: '18:30',
    category: 'Basketball',
    capacity: 10,
    joiners: ['alex'],
    title: 'Evening Pickup Basketball',
    place: 'Chatuchak Park',
    lat: 13.806,
    lng: 100.553,
    desc: 'Half-court pickup games. Turn up and get put on a team.',
  },
  {
    host: 'narin',
    day: 7,
    time: '06:30',
    category: 'Cycling',
    capacity: 15,
    joiners: [],
    title: 'Bang Krachao Loop Ride',
    place: 'Bang Krachao',
    lat: 13.69,
    lng: 100.557,
    desc: "A beginner-friendly ride around Bangkok's green lung, with a cafe finish.",
  },
  {
    host: 'alex',
    day: 9,
    time: '19:30',
    category: 'Food',
    capacity: 18,
    joiners: ['maya', 'narin', 'pim'],
    title: 'Yaowarat Street Food Walk',
    place: 'Yaowarat',
    lat: 13.74,
    lng: 100.51,
    desc: 'Walk a few of the best-known stalls together and vote for the best dish.',
  },
  {
    host: 'june',
    day: 11,
    time: '18:30',
    category: 'Movies',
    capacity: 10,
    joiners: ['maya'],
    title: 'Indie Film Night',
    place: 'House Samyan',
    lat: 13.733,
    lng: 100.5285,
    desc: 'Watch a new independent release, then food and a proper argument about it.',
  },
  {
    host: 'alex',
    day: 13,
    time: '07:00',
    category: 'Gym',
    capacity: 8,
    joiners: ['pim'],
    title: 'Morning Lift Session',
    place: 'Phaya Thai',
    lat: 13.757,
    lng: 100.533,
    desc: 'Straightforward strength session. Happy to spot beginners.',
  },
  // ── the defence-week cluster ──
  {
    host: 'maya',
    day: 14,
    time: '15:00',
    category: 'Study',
    capacity: 12,
    joiners: ['you', 'june'],
    title: 'Exam Week Study Sprint',
    place: 'Central World',
    lat: 13.7466,
    lng: 100.5393,
    desc: 'Three hours of heads-down work with scheduled breaks. Bring your own deadline.',
  },
  {
    host: 'pim',
    day: 15,
    time: '19:00',
    category: 'Events',
    capacity: 25,
    joiners: ['june', 'maya'],
    title: 'Riverside Night Market',
    place: 'Icon Siam',
    lat: 13.7263,
    lng: 100.51,
    desc: 'Wander the market together, eat too much, watch the fountain show.',
  },
  {
    host: 'narin',
    day: 16,
    time: '06:45',
    category: 'Running',
    capacity: 20,
    joiners: ['alex', 'you'],
    title: 'Lumpini Easy 5K',
    place: 'Lumpini Park',
    lat: 13.731,
    lng: 100.5418,
    desc: 'Social pace, no pressure, coffee afterwards for anyone who wants it.',
  },
  {
    host: 'june',
    day: 17,
    time: '20:00',
    category: 'Hangouts',
    capacity: 12,
    joiners: ['pim'],
    title: 'Board Games at Ekkamai',
    place: 'Ekkamai',
    lat: 13.719,
    lng: 100.585,
    desc: 'Modern board games, all levels. We teach the rules, you bring snacks.',
  },
  {
    host: 'alex',
    day: 18,
    time: '19:00',
    category: 'Football',
    capacity: 12,
    joiners: ['narin'],
    title: 'Weekend Five-a-Side',
    place: 'Rama IX Park',
    lat: 13.6947,
    lng: 100.6597,
    desc: 'Smaller pitch, faster games. Same friendly rules as always.',
  },
  {
    host: 'maya',
    day: 21,
    time: '16:00',
    category: 'Coffee',
    capacity: 8,
    joiners: [],
    title: 'Talat Noi Cafe Crawl',
    place: 'Talat Noi',
    lat: 13.737,
    lng: 100.513,
    desc: 'Three small cafes in one afternoon, through one of the oldest parts of the city.',
  },
  {
    host: 'narin',
    day: 24,
    time: '07:00',
    category: 'Cycling',
    capacity: 15,
    joiners: ['pim'],
    title: 'Riverside Morning Ride',
    place: 'Wongwian Yai',
    lat: 13.721,
    lng: 100.494,
    desc: 'Flat, unhurried route along the river with a proper breakfast stop.',
  },
  {
    host: 'june',
    day: 28,
    time: '19:30',
    category: 'Movies',
    capacity: 10,
    joiners: ['you'],
    title: 'Classics on the Big Screen',
    place: 'Thonglor',
    lat: 13.724,
    lng: 100.581,
    desc: 'A restored classic, the way it was meant to be seen.',
  },
]

// ── helpers ─────────────────────────────────────────────────────────────────

const initials = (name) => {
  const parts = String(name).trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase()
}
const band = (time) => {
  const h = Number(time.split(':')[0])
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
}
const dateFor = (day) => {
  const d = new Date()
  d.setDate(d.getDate() + day)
  return d.toISOString().slice(0, 10)
}

const uids = {}
const signIn = async (key) => {
  const person = people.find((p) => p.key === key)
  await signInWithEmailAndPassword(auth, person.email, PASSWORD)
  return { uid: uids[key], name: person.name, avatar: initials(person.name) }
}

async function main() {
  console.log(`\nSeeding ${env.VITE_FIREBASE_PROJECT_ID} (LIVE)\n`)

  console.log('Accounts')
  for (const person of people) {
    let uid
    try {
      const cred = await createUserWithEmailAndPassword(auth, person.email, PASSWORD)
      await updateProfile(cred.user, { displayName: person.name })
      uid = cred.user.uid
      console.log(`  created  ${person.email}`)
    } catch (error) {
      if (error.code !== 'auth/email-already-in-use') throw error
      const cred = await signInWithEmailAndPassword(auth, person.email, PASSWORD)
      uid = cred.user.uid
      console.log(`  existing ${person.email}`)
    }
    uids[person.key] = uid

    const batch = writeBatch(db)
    batch.set(doc(db, 'users', uid), {
      uid,
      name: person.name,
      avatar: initials(person.name),
      username: person.username,
      bio: person.bio,
      interests: person.interests,
      preferredTime: person.preferredTime,
      historyCategories: person.history,
      anonymous: false,
      notificationsEnabled: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    batch.set(doc(db, 'users', uid, 'private', 'profile'), {
      email: person.email,
      realName: person.name,
      privacy: {
        anonymousMode: false,
        locationPermission: false,
        approximateLocation: true,
        notifications: true,
      },
      location: null,
      onboarded: true,
      createdAt: serverTimestamp(),
    })
    await batch.commit()
  }

  // What is already there, so a second run adds nothing twice.
  await signIn('alex')
  const existing = new Set(
    (await getDocs(query(collection(db, 'activities'), where('status', '==', 'active')))).docs.map(
      (d) => `${d.data().title}::${d.data().hostId}`,
    ),
  )

  console.log('\nActivities')
  const created = []
  for (const a of activities) {
    const host = await signIn(a.host)
    if (existing.has(`${a.title}::${host.uid}`)) {
      console.log(`  skipped  ${a.title} (already there)`)
      continue
    }
    const date = dateFor(a.day)
    const ref = await addDoc(collection(db, 'activities'), {
      title: a.title,
      description: a.desc,
      category: a.category,
      tags: [a.category, band(a.time)],
      locationName: a.place,
      lat: a.lat,
      lng: a.lng,
      date,
      time: a.time,
      startsAt: Timestamp.fromDate(new Date(`${date}T${a.time}`)),
      timeBand: band(a.time),
      capacity: a.capacity,
      participantUids: [host.uid],
      hostId: host.uid,
      hostName: host.name,
      hostAvatar: host.avatar,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    created.push({ id: ref.id, ...a })
    console.log(`  created  ${date}  ${a.title}`)
  }

  console.log('\nJoins')
  for (const a of created) {
    for (const key of a.joiners) {
      const joiner = await signIn(key)
      // The same single-field write the app makes.
      await updateDoc(doc(db, 'activities', a.id), {
        participantUids: arrayUnion(joiner.uid),
        updatedAt: serverTimestamp(),
      })
    }
    if (a.joiners.length) console.log(`  ${a.joiners.length} joined ${a.title}`)
  }

  // Look it up among everything active, not just what this run created — on a
  // second run the activity already exists, and an earlier version skipped the
  // conversation entirely because of it.
  await signIn('alex')
  const footballDoc = (
    await getDocs(
      query(collection(db, 'activities'), where('title', '==', 'Football Night at Rama IX')),
    )
  ).docs[0]
  const football = footballDoc ? { id: footballDoc.id, title: footballDoc.data().title } : null

  if (football) {
    // Do not re-post the same conversation on every run.
    const already = (await getDocs(collection(db, 'activities', football.id, 'messages'))).size
    console.log('\nChat')
    const lines =
      already >= 3
        ? []
        : [
            ['alex', 'Hey everyone. We meet near the north gate at 6:45.'],
            ['narin', 'Perfect, I can bring an extra ball.'],
            ['june', 'Might be five minutes late, start without me.'],
          ]
    for (const [key, text] of lines) {
      const sender = await signIn(key)
      // The rules only let participants post, correctly — so anyone speaking
      // in the thread has to have joined first, exactly as in the app.
      // arrayUnion makes this a no-op for someone already on the roster.
      await updateDoc(doc(db, 'activities', football.id), {
        participantUids: arrayUnion(sender.uid),
        updatedAt: serverTimestamp(),
      })
      await addDoc(collection(db, 'activities', football.id, 'messages'), {
        senderId: sender.uid,
        senderName: sender.name,
        senderAvatar: sender.avatar,
        text,
        createdAt: serverTimestamp(),
      })
    }
    console.log(lines.length ? `  ${lines.length} messages` : '  already populated, left alone')

    // One notification so the bell is not empty on first look.
    const narin = await signIn('narin')
    await addDoc(collection(db, 'users', uids.alex, 'notifications'), {
      type: 'activity',
      title: 'Someone joined',
      body: `${narin.name} joined ${football.title}.`,
      activityId: football.id,
      read: false,
      createdAt: serverTimestamp(),
    })
    console.log('  1 notification to the host')
  }

  console.log('\nDone. Demo accounts (password from SEED_PASSWORD):')
  people.forEach((p) => console.log(`  ${p.email}`))
  process.exit(0)
}

main().catch((error) => {
  console.error('\nFailed:', error.code || '', error.message)
  process.exit(1)
})
