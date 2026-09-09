import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

// When true the app talks to the local Firebase Emulator Suite instead of a
// real project. The `demo-` project id prefix is special-cased by the
// emulators: it never reaches Google, so no credentials or billing account
// are needed to run or test the full backend locally.
export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

const emulatorConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'localhost',
  projectId: 'demo-smartsync',
  appId: 'demo-app-id',
}

const liveConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Fail loudly and early with an actionable message. A missing key otherwise
// surfaces much later as an opaque `auth/invalid-api-key` from deep inside
// the SDK, which is a miserable thing to debug the night before a deadline.
if (!usingEmulators) {
  const missing = Object.entries(liveConfig)
    .filter(([, value]) => !value)
    // storageBucket and messagingSenderId are not needed by the features that
    // currently ship, so their absence is not fatal.
    .filter(([key]) => !['storageBucket', 'messagingSenderId'].includes(key))
    .map(([key]) => key)

  if (missing.length) {
    throw new Error(
      `Firebase is not configured. Missing: ${missing.join(', ')}.\n` +
        'Copy .env.example to .env.local and fill in the values from your ' +
        'Firebase console (Project settings → Your apps → SDK setup). ' +
        'To develop without a Firebase project, set VITE_USE_EMULATORS=true ' +
        'and run: npm run emulators',
    )
  }
}

const app = initializeApp(usingEmulators ? emulatorConfig : liveConfig)

export const auth = getAuth(app)

// Persistent cache rather than the default in-memory one: reads are served
// from disk while offline and writes are queued until the connection is back,
// so the app stays usable on a phone with patchy campus wifi.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8181)
}

export default app
