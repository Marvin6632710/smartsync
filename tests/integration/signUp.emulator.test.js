/**
 * Signing up against the real thing: the Firebase SDK talking to the Auth
 * and Firestore emulators, through the app's own `signUp` and
 * `ensureUserProfile`, under the project's own rules.
 *
 * The unit tests pin what the retry does with a fake; this pins that the
 * second try really lands — a real transaction after a refused first one —
 * and that two writers making the same profile at once leave exactly one,
 * with the name that was typed. Run with `npm run test:integration`, which
 * starts an isolated emulator pair (see firebase.test.json).
 */
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

const projectId = 'demo-smartsync-signup'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199'
const [firestoreHost, firestorePort] = (
  process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8282'
).split(':')

// How many transactions to refuse, as a stream carrying a stale credential
// would. Counted down by the wrapper below; the retry's second attempt goes
// through to the emulator untouched.
let refuseTransactions = 0
vi.mock('firebase/firestore', async (importActual) => {
  const actual = await importActual()
  return {
    ...actual,
    runTransaction: async (...args) => {
      if (refuseTransactions > 0) {
        refuseTransactions -= 1
        throw Object.assign(new Error('Missing or insufficient permissions.'), {
          code: 'permission-denied',
        })
      }
      return actual.runTransaction(...args)
    },
  }
})

// The app's config module reads Vite's env and pins the dev ports; this
// suite talks to its own emulator pair instead.
vi.mock('../../src/firebase/config', async () => {
  const { initializeApp } = await import('firebase/app')
  const { connectAuthEmulator, getAuth } = await import('firebase/auth')
  const { connectFirestoreEmulator, getFirestore } = await import('firebase/firestore')
  const app = initializeApp(
    { apiKey: 'demo-api-key', authDomain: 'localhost', projectId, appId: 'demo-app-id' },
    'signup-integration',
  )
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, firestoreHost, Number(firestorePort))
  return { auth, db, default: app }
})

const reportError = vi.fn()
vi.mock('../../src/utils/reportError', () => ({ reportError }))

const { signOut } = await import('firebase/auth')
const { doc, getDoc } = await import('firebase/firestore')
const { auth, db } = await import('../../src/firebase/config')
const { signUp } = await import('../../src/firebase/auth')
const { ensureUserProfile } = await import('../../src/firebase/users')

let n = 0
const freshEmail = () => `person${Date.now().toString(36)}${(n += 1)}@example.test`
const password = 'correct-horse'

/** Both halves of a profile, read as the signed-in owner. */
const profileOf = async (uid) => {
  const pub = await getDoc(doc(db, 'users', uid))
  const priv = await getDoc(doc(db, 'users', uid, 'private', 'profile'))
  return {
    pub: pub.exists() ? pub.data() : null,
    priv: priv.exists() ? priv.data() : null,
  }
}

beforeAll(async () => {
  // Fail fast, with a message, if the emulators are not there.
  const ping = await fetch(`http://${firestoreHost}:${firestorePort}/`).catch(() => null)
  if (!ping?.ok) {
    throw new Error(
      `No Firestore emulator at ${firestoreHost}:${firestorePort}. Run: npm run test:integration`,
    )
  }
})

afterAll(async () => {
  await signOut(auth).catch(() => {})
})

describe('signing up against the emulators', () => {
  test('creates both halves of the profile, once, with the name that was typed', async () => {
    reportError.mockClear()
    const user = await signUp({ email: freshEmail(), password, name: '  Alice Emulator  ' })
    const { pub, priv } = await profileOf(user.uid)
    expect(pub).toMatchObject({ uid: user.uid, name: 'Alice Emulator', avatar: 'AE' })
    expect(priv).toMatchObject({ realName: 'Alice Emulator', onboarded: false })
    expect(auth.currentUser.displayName).toBe('Alice Emulator')
    expect(reportError).not.toHaveBeenCalled()
  })

  test('a refused first profile write is retried with a fresh credential, and the second lands', async () => {
    reportError.mockClear()
    refuseTransactions = 1
    const user = await signUp({ email: freshEmail(), password, name: 'Retry Lands' })
    expect(refuseTransactions).toBe(0)
    const { pub, priv } = await profileOf(user.uid)
    expect(pub).toMatchObject({ name: 'Retry Lands' })
    expect(priv).toMatchObject({ realName: 'Retry Lands' })
    expect(reportError).not.toHaveBeenCalled()
  })

  test('two refusals in a row are still recovered from within the retry budget', async () => {
    reportError.mockClear()
    refuseTransactions = 2
    const user = await signUp({ email: freshEmail(), password, name: 'Twice Refused' })
    expect((await profileOf(user.uid)).pub).toMatchObject({ name: 'Twice Refused' })
    expect(reportError).not.toHaveBeenCalled()
  })

  test('the observer and the sign-up making the same profile at once leave one profile, named', async () => {
    reportError.mockClear()
    const email = freshEmail()
    // The observer's write, exactly as AuthContext makes it: as soon as the
    // account exists, with whatever name it can find. Here it is started
    // the moment the account exists and races the sign-up's own write.
    const { onAuthStateChanged } = await import('firebase/auth')
    const { pendingSignUpDetails } = await import('../../src/firebase/auth')
    let observerWrite
    const stop = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser || firebaseUser.email !== email || observerWrite) return
      observerWrite = ensureUserProfile(firebaseUser.uid, {
        name: pendingSignUpDetails(firebaseUser.email)?.name ?? firebaseUser.displayName,
        email: firebaseUser.email,
      })
    })
    try {
      const user = await signUp({ email, password, name: 'Raced Name' })
      const made = await observerWrite
      const { pub, priv } = await profileOf(user.uid)
      expect(pub).toMatchObject({ name: 'Raced Name' })
      expect(priv).toMatchObject({ realName: 'Raced Name' })
      // One of the two made it; neither overwrote the other.
      expect(typeof made).toBe('boolean')
      expect(reportError).not.toHaveBeenCalled()
    } finally {
      stop()
    }
  })

  test('signing out and straight back up on the same client, three times over', async () => {
    // The sequence that produces the stale-credential refusal in the browser.
    // It does not reproduce on demand — which is why the refusal is forced
    // above — but the sequence itself must always end with a named profile.
    reportError.mockClear()
    for (let round = 0; round < 3; round += 1) {
      await signOut(auth)
      const name = `Round ${round}`
      const user = await signUp({ email: freshEmail(), password, name })
      expect((await profileOf(user.uid)).pub).toMatchObject({ name })
    }
    expect(reportError).not.toHaveBeenCalled()
  })

  test('a refusal that outlasts every retry is recorded, and the account still exists', async () => {
    reportError.mockClear()
    refuseTransactions = 3
    const user = await signUp({ email: freshEmail(), password, name: 'Never Lands' })
    expect(user.uid).toBeTruthy()
    expect((await profileOf(user.uid)).pub).toBeNull()
    expect(reportError).toHaveBeenCalledWith(
      'auth.signUp.profile',
      expect.objectContaining({ code: 'permission-denied' }),
      { uid: user.uid },
    )
    // The next sign-in heals it from the Auth record, which was named.
    refuseTransactions = 0
    await ensureUserProfile(user.uid, {
      name: auth.currentUser.displayName,
      email: auth.currentUser.email,
    })
    expect((await profileOf(user.uid)).pub).toMatchObject({ name: 'Never Lands' })
  })
})
