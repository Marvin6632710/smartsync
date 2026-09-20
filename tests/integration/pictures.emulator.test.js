/** The real application save functions, Auth, Firestore and security rules. */
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'

const projectId = 'demo-smartsync-picture-saves'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199'
const [firestoreHost, firestorePort] = (
  process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8282'
).split(':')

vi.mock('../../src/firebase/config', async () => {
  const { initializeApp } = await import('firebase/app')
  const { connectAuthEmulator, getAuth } = await import('firebase/auth')
  const { connectFirestoreEmulator, getFirestore } = await import('firebase/firestore')
  const app = initializeApp(
    { apiKey: 'demo-api-key', authDomain: 'localhost', projectId, appId: 'demo-app-id' },
    'picture-saves-integration',
  )
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, firestoreHost, Number(firestorePort))
  return { auth, db, default: app }
})

const { signInWithEmailAndPassword, signOut } = await import('firebase/auth')
const { doc, getDocFromServer } = await import('firebase/firestore')
const { auth, db } = await import('../../src/firebase/config')
const { signUp } = await import('../../src/firebase/auth')
const { updateDisplayName } = await import('../../src/firebase/users')
const { createActivity, updateActivity, deleteActivity } =
  await import('../../src/firebase/activities')

let email
let accountNumber = 0
const password = 'emulator-only-test'
const dataUrl = `data:image/png;base64,${readFileSync('public/icons/icon-512.png').toString('base64')}`
const picture = (version) => ({ version, dataUrl })
const read = async (collection, id) => (await getDocFromServer(doc(db, collection, id))).data()
const draft = {
  title: 'Picture test',
  description: 'Emulator fixture',
  category: 'Coffee',
  locationName: 'Bangkok',
  lat: 13.7,
  lng: 100.5,
  date: '2030-01-01',
  time: '18:00',
  capacity: 5,
}
let env
let owner

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: firestoreHost,
      port: Number(firestorePort),
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
})
beforeEach(async () => {
  email = `pictures-${Date.now()}-${accountNumber++}@example.test`
  const account = await signUp({ email, password, name: 'Picture Owner' })
  owner = await read('users', account.uid)
})
afterAll(async () => {
  await signOut(auth).catch(() => {})
  await env?.cleanup()
})

test('profile upload and replacement survive signing in again, with host copies updated', async () => {
  const activityId = await createActivity(owner, draft)
  await updateDisplayName(owner.uid, owner.name, false, { picture: picture('profile-first') })
  expect((await read('users', owner.uid)).pictureVersion).toBe('profile-first')
  expect((await read('activities', activityId)).hostPictureVersion).toBe('profile-first')
  await updateDisplayName(owner.uid, owner.name, false, { bio: 'Edited without selecting a photo' })
  expect((await read('profilePictures', owner.uid)).version).toBe('profile-first')
  await updateDisplayName(owner.uid, owner.name, false, { picture: picture('profile-replaced') })
  await signOut(auth)
  await signInWithEmailAndPassword(auth, email, password)
  owner = await read('users', owner.uid)
  expect(owner.pictureVersion).toBe('profile-replaced')
  expect(await read('profilePictures', owner.uid)).toMatchObject(picture('profile-replaced'))
  expect((await read('activities', activityId)).hostPictureVersion).toBe('profile-replaced')
  // Deleting an activity that never had a photo also remains valid.
  await deleteActivity(activityId)
  expect(await read('activities', activityId)).toBeUndefined()
})

test('activity creation, replacement, no-photo edit and deletion use the real save batches', async () => {
  const pending = createActivity(owner, { ...draft, picture: picture('cover-first') })
  expect(pending.id).toBeTruthy()
  const id = await pending
  expect(await read('activities', id)).toMatchObject({
    pictureVersion: 'cover-first',
  })
  expect(await read('activityPictures', id)).toMatchObject(picture('cover-first'))
  await updateActivity(id, { title: 'Changed title' })
  expect((await read('activities', id)).pictureVersion).toBe('cover-first')
  await updateActivity(id, { picture: picture('cover-replaced') })
  expect(await read('activityPictures', id)).toMatchObject(picture('cover-replaced'))
  await signOut(auth)
  await signInWithEmailAndPassword(auth, email, password)
  expect((await read('activities', id)).pictureVersion).toBe('cover-replaced')
  expect(await read('activityPictures', id)).toMatchObject(picture('cover-replaced'))
  await deleteActivity(id)
  expect(await read('activities', id)).toBeUndefined()
  await env.withSecurityRulesDisabled(async (ctx) => {
    expect((await getDocFromServer(doc(ctx.firestore(), 'activityPictures', id))).exists()).toBe(
      false,
    )
  })
})
