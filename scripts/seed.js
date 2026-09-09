/**
 * Seeds the local Firebase emulators with demo accounts and activities.
 *
 * Runs through the ordinary client SDK while signed in as each demo user, so
 * every write is subject to the same security rules as production. If the
 * rules are wrong, seeding fails — which makes this a smoke test as well as
 * a fixture loader.
 *
 *   npm run emulators     (first, in another terminal)
 *   npm run seed
 */
import { initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  addDoc,
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-smartsync' })
const auth = getAuth(app)
const db = getFirestore(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFirestoreEmulator(db, '127.0.0.1', 8181)

const PASSWORD = 'demo1234'

const people = [
  {
    key: 'me',
    email: 'you@smartsync.demo',
    name: 'Min Khant Aung',
    username: '@hax_sync',
    bio: 'CS student in Bangkok looking for good activities and new people.',
    interests: ['Football', 'Gaming', 'Coffee'],
    preferredTime: 'Evening',
    historyCategories: ['Football', 'Gaming'],
  },
  {
    key: 'alex',
    email: 'alex@smartsync.demo',
    name: 'Alex Chen',
    username: '@alexc',
    bio: 'Football every week, gym the other days.',
    interests: ['Football', 'Gaming', 'Gym'],
    preferredTime: 'Evening',
    historyCategories: ['Football', 'Gym'],
  },
  {
    key: 'maya',
    email: 'maya@smartsync.demo',
    name: 'Maya Rahman',
    username: '@mayar',
    bio: 'Study sessions and good coffee.',
    interests: ['Coffee', 'Study', 'Movies'],
    preferredTime: 'Afternoon',
    historyCategories: ['Study', 'Coffee'],
  },
  {
    key: 'narin',
    email: 'narin@smartsync.demo',
    name: 'Narin Suksai',
    username: '@narin',
    bio: 'Runner and cyclist. Always hungry after.',
    interests: ['Running', 'Cycling', 'Food'],
    preferredTime: 'Morning',
    historyCategories: ['Running', 'Cycling'],
  },
  {
    key: 'june',
    email: 'june@smartsync.demo',
    name: 'June Park',
    username: '@junep',
    bio: 'Games, films, and people who like both.',
    interests: ['Gaming', 'Movies', 'Hangouts'],
    preferredTime: 'Evening',
    historyCategories: ['Gaming', 'Movies'],
  },
]

// Real coordinates, so distances computed from the user's actual GPS position
// are genuine rather than decorative.
const dayAfter = (offset) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

const activities = [
  {
    host: 'alex',
    title: 'Football Night at Rama IX',
    category: 'Football',
    description:
      'Friendly 6-a-side football. Beginners are welcome and teams will be balanced on arrival.',
    locationName: 'Rama IX Park',
    lat: 13.6947,
    lng: 100.6597,
    date: dayAfter(1),
    time: '19:00',
    capacity: 12,
    joiners: ['narin', 'june'],
  },
  {
    host: 'maya',
    title: 'Focus Study Circle',
    category: 'Study',
    description: 'Quiet two-hour study session with Pomodoro blocks and a short coffee break.',
    locationName: 'Samyan Mitrtown',
    lat: 13.7333,
    lng: 100.529,
    date: dayAfter(2),
    time: '14:00',
    capacity: 10,
    joiners: [],
  },
  {
    host: 'maya',
    title: 'Coffee & New Connections',
    category: 'Coffee',
    description:
      'Low-pressure coffee meetup for students and young professionals who want to meet new people.',
    locationName: 'Ari',
    lat: 13.7797,
    lng: 100.5445,
    date: dayAfter(3),
    time: '16:30',
    capacity: 10,
    joiners: ['june'],
  },
  {
    host: 'june',
    title: 'Bangkok Night Gamers',
    category: 'Gaming',
    description:
      'Casual multiplayer session. Bring your laptop or handheld console; some devices are available.',
    locationName: 'Siam Square',
    lat: 13.7456,
    lng: 100.534,
    date: dayAfter(4),
    time: '20:00',
    capacity: 16,
    joiners: ['alex'],
  },
  {
    host: 'narin',
    title: 'Benjakitti Easy Run',
    category: 'Running',
    description: 'Relaxed 5 km social run around Benjakitti Park. Pace groups available.',
    locationName: 'Benjakitti Park',
    lat: 13.723,
    lng: 100.56,
    date: dayAfter(5),
    time: '07:00',
    capacity: 20,
    joiners: [],
  },
  {
    host: 'june',
    title: 'Indie Movie Meetup',
    category: 'Movies',
    description: 'Watch a new indie release together, then grab food and discuss it afterward.',
    locationName: 'House Samyan',
    lat: 13.733,
    lng: 100.5285,
    date: dayAfter(5),
    time: '18:30',
    capacity: 10,
    joiners: ['maya'],
  },
  {
    host: 'narin',
    title: 'Weekend Cycling Loop',
    category: 'Cycling',
    description: 'A beginner-friendly city cycling loop with water stops and a cafe finish.',
    locationName: 'Lumpini Park',
    lat: 13.731,
    lng: 100.5418,
    date: dayAfter(6),
    time: '06:30',
    capacity: 15,
    joiners: [],
  },
  {
    host: 'alex',
    title: 'Street Food Walk',
    category: 'Food',
    description: 'Explore a few popular local food spots together and vote for the best dish.',
    locationName: 'Yaowarat',
    lat: 13.74,
    lng: 100.51,
    date: dayAfter(6),
    time: '19:30',
    capacity: 18,
    joiners: ['maya', 'narin'],
  },
]

const initialsOf = (name) => {
  const parts = String(name).trim().split(/\s+/)
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()
}

const bandOf = (time) => {
  const hour = Number(time.split(':')[0])
  return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
}

const uids = {}

async function signInAs(key) {
  const person = people.find((p) => p.key === key)
  await signInWithEmailAndPassword(auth, person.email, PASSWORD)
  return { uid: uids[key], name: person.name, avatar: initialsOf(person.name) }
}

async function main() {
  console.log('Creating accounts...')
  for (const person of people) {
    let uid
    try {
      const credential = await createUserWithEmailAndPassword(auth, person.email, PASSWORD)
      uid = credential.user.uid
    } catch (error) {
      if (error.code !== 'auth/email-already-in-use') throw error
      const credential = await signInWithEmailAndPassword(auth, person.email, PASSWORD)
      uid = credential.user.uid
    }
    uids[person.key] = uid

    const batch = writeBatch(db)
    batch.set(doc(db, 'users', uid), {
      uid,
      name: person.name,
      avatar: initialsOf(person.name),
      username: person.username,
      bio: person.bio,
      interests: person.interests,
      preferredTime: person.preferredTime,
      historyCategories: person.historyCategories,
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
    console.log(`  ${person.email}  ->  ${uid}`)
  }

  console.log('Creating activities...')
  const activityIds = []
  for (const activity of activities) {
    const host = await signInAs(activity.host)
    const created = await addDoc(collection(db, 'activities'), {
      title: activity.title,
      description: activity.description,
      category: activity.category,
      tags: [activity.category, bandOf(activity.time)],
      locationName: activity.locationName,
      lat: activity.lat,
      lng: activity.lng,
      date: activity.date,
      time: activity.time,
      startsAt: Timestamp.fromDate(new Date(`${activity.date}T${activity.time}`)),
      timeBand: bandOf(activity.time),
      capacity: activity.capacity,
      participantUids: [host.uid],
      hostId: host.uid,
      hostName: host.name,
      hostAvatar: host.avatar,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    activityIds.push({ id: created.id, ...activity })
    console.log(`  ${activity.title}`)
  }

  console.log('Joining participants...')
  for (const activity of activityIds) {
    for (const joinerKey of activity.joiners) {
      const joiner = await signInAs(joinerKey)
      // Exactly the write the app makes: one field, one atomic transform.
      await updateDoc(doc(db, 'activities', activity.id), {
        participantUids: arrayUnion(joiner.uid),
        updatedAt: serverTimestamp(),
      })
    }
  }

  console.log('Seeding chat...')
  const football = activityIds[0]
  const alex = await signInAs('alex')
  await addDoc(collection(db, 'activities', football.id, 'messages'), {
    senderId: alex.uid,
    senderName: alex.name,
    senderAvatar: alex.avatar,
    text: 'Hey everyone! We meet near the north gate at 6:45.',
    createdAt: serverTimestamp(),
  })
  const narin = await signInAs('narin')
  await addDoc(collection(db, 'activities', football.id, 'messages'), {
    senderId: narin.uid,
    senderName: narin.name,
    senderAvatar: narin.avatar,
    text: 'Perfect. I can bring an extra ball.',
    createdAt: serverTimestamp(),
  })

  await signOut(auth)
  console.log('\nSeed complete.')
  console.log('Sign in with any of these (password: demo1234):')
  people.forEach((p) => console.log(`  ${p.email}`))
  process.exit(0)
}

main().catch((error) => {
  console.error('\nSeed failed:', error.message)
  console.error('Are the emulators running?  npm run emulators')
  process.exit(1)
})
