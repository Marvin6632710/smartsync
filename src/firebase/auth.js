import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'

import { auth } from './config'
import { unregisterPushDevice } from './push'
import { acceptableName, ensureUserProfile } from './users'
import { reportError } from '../utils/reportError'

/**
 * Firebase error codes are precise but unreadable ("auth/invalid-credential").
 * Surfacing them raw is a common way real apps leak internals and confuse
 * users, so every code the sign-in and sign-up flows can produce is mapped to
 * a sentence a person can act on — as a translation key, worded by the screen
 * in the language in force.
 *
 * Note that wrong-password and unknown-email deliberately share one message:
 * distinguishing them would let anyone test which email addresses have
 * accounts here (user enumeration).
 */
const AUTH_ERROR_KEYS = {
  'auth/email-already-in-use': 'auth.errors.emailInUse',
  'auth/invalid-email': 'auth.errors.invalidEmail',
  'auth/weak-password': 'auth.errors.weakPassword',
  'auth/invalid-credential': 'auth.errors.wrongCredentials',
  'auth/wrong-password': 'auth.errors.wrongCredentials',
  'auth/user-not-found': 'auth.errors.wrongCredentials',
  'auth/too-many-requests': 'auth.errors.tooManyRequests',
  'auth/network-request-failed': 'auth.errors.network',
  'auth/user-disabled': 'auth.errors.disabled',
  'auth/requires-recent-login': 'auth.errors.recentLogin',
}

export function authErrorKey(error) {
  return AUTH_ERROR_KEYS[error?.code] || 'auth.errors.generic'
}

/**
 * The name typed into a sign-up that is in progress on this page.
 *
 * Creating the account wakes the auth observer before the sign-up has had
 * a chance to write anything, and the observer makes a profile of its own
 * for any account that lacks one. It used to build that profile from the
 * Auth record's display name — still null at that instant — and the person
 * arrived as "New user". Now the sign-up leaves the name here first, and
 * the observer asks for it (see pendingSignUpDetails): whichever of the two
 * creates the profile, it carries what was typed.
 *
 * The date of birth travels the same way and for the same reason. The
 * observer winning the race used to be harmless; with an age gate it
 * would have made a profile with no date of birth, and its owner would
 * have been sent to the age screen straight after filling the field in.
 */
let pendingSignUp = null
const emailKey = (email) =>
  String(email || '')
    .trim()
    .toLowerCase()
export function pendingSignUpDetails(email) {
  if (!pendingSignUp || pendingSignUp.email !== emailKey(email)) return null
  return { name: pendingSignUp.name, dateOfBirth: pendingSignUp.dateOfBirth }
}

/**
 * How long is waited before each further try, after the first. Long enough,
 * in total, for a freshly minted credential to be the one every stream is
 * carrying; short enough that a person is not left looking at a spinner.
 */
export const RETRY_DELAYS_MS = [400, 1200]

/** Failures worth a fresh credential and another go, rather than a verdict. */
const RETRIABLE = new Set([
  // The first write after a sign-up — or a sign-in that followed a sign-out
  // on the same page — can go out on a stream still carrying the credential
  // that was just revoked, and is refused. The most common one, and the
  // reason this exists.
  'permission-denied',
  'unauthenticated',
  // The connection blinked. Firestore's transactions and one-shot reads do
  // not queue the way writes do; they fail, and a moment later would work.
  'unavailable',
  'aborted',
  'deadline-exceeded',
])

/**
 * Runs `run`, and on a retriable failure buys a fresh credential and runs
 * it again — up to the number of delays above, waiting each delay first.
 * Anything else, and the last failure of a run that never succeeded, is
 * thrown to the caller.
 */
export async function retryRefused(run, { delays = RETRY_DELAYS_MS } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      if (!RETRIABLE.has(error?.code) || attempt >= delays.length) throw error
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
      await refreshCredential()
    }
  }
}

export async function signUp({ email, password, name, dateOfBirth = '' }) {
  // Cut to what the rules accept: a longer one was refused at profile
  // creation, and the account it belonged to landed on an error screen.
  const displayName = acceptableName(name)
  // Left for the observer before the account exists, so there is no instant
  // at which the account is there and the name is not.
  pendingSignUp = { email: emailKey(email), name: displayName, dateOfBirth }
  let credential
  try {
    credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
  } catch (error) {
    pendingSignUp = null
    throw error
  }

  // Everything past this line happens to an account that already exists.
  // Creating it woke the auth observer, which has swapped the route table
  // and unmounted the sign-up form — so a failure here is thrown at nobody.
  // The profile is written with patience (retryRefused) rather than once,
  // because the first write after a sign-up can be refused by a stream
  // still carrying the previous credential; the observer is writing the
  // same profile with the same patience, and whichever lands first is the
  // profile — ensureUserProfile makes the second a no-op rather than an
  // overwrite. A failure that survives all of that is recorded rather than
  // lost, and the observer's own attempt, or the next sign-in, will make
  // the profile from the Auth record's name.
  const { uid } = credential.user
  try {
    // Kept in sync with the Firestore profile so the Auth record is not a
    // nameless row in the console — and so a profile made later, from the
    // record, carries the name.
    await updateProfile(credential.user, { displayName })
  } catch (error) {
    reportError('auth.signUp.displayName', error, { uid })
  }
  try {
    await retryRefused(() =>
      ensureUserProfile(uid, {
        name: displayName,
        email: credential.user.email,
        dateOfBirth,
      }),
    )
  } catch (error) {
    reportError('auth.signUp.profile', error, { uid })
  } finally {
    if (pendingSignUp?.email === emailKey(email)) pendingSignUp = null
  }

  return credential.user
}

export async function signIn({ email, password }) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
  return credential.user
}

/**
 * Signs out — after taking this device's push registration back, so a
 * shared computer does not keep receiving the last person's chat. The
 * clean-up is best-effort and bounded; the sign-out itself is not held
 * hostage by the network.
 */
export async function signOutUser() {
  await unregisterPushDevice(auth.currentUser?.uid || null, { reason: 'sign-out' })
  return signOut(auth)
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim())
}

/** Subscribe to sign-in state. Returns the unsubscribe function. */
/**
 * Who is signed in right now, straight from the SDK rather than from React
 * state.
 *
 * Needed because signing out revokes the credential before React hears about
 * it: every open listener fires permission-denied in that gap, while the
 * component still holds the old uid and still thinks its listeners are live.
 * Comparing against this tells a real denial from the noise of leaving.
 */
export function currentUid() {
  return auth.currentUser?.uid || null
}

/** How long to wait for a new token before giving up and retrying anyway. */
const TOKEN_REFRESH_TIMEOUT_MS = 8000

/**
 * Forces a fresh ID token from the auth service.
 *
 * The reason this exists: Firestore's watch stream can reattach carrying a
 * credential that has just been revoked — after a sign-out, or after a
 * sign-up that followed one — and every listener on it is refused. Waiting a
 * fixed number of milliseconds and hoping is not a fix; asking for a new
 * token and then re-subscribing addresses the actual cause.
 *
 * Always settles, and now always settles *in bounded time*. It already
 * swallowed a rejection, so a failed refresh let the retry proceed — but a
 * request that simply never came back, which is what a stalled connection
 * looks like rather than a broken one, left the caller waiting forever. The
 * listener was never remade and the user was shown neither data nor an
 * error. Racing a timer means the retry happens either way; a token that
 * arrives late is not worth more than a screen that never loads.
 */
export async function refreshCredential() {
  const user = auth.currentUser
  if (!user) return
  let timer
  try {
    await Promise.race([
      user.getIdToken(true),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          reportError('auth.refreshCredential', new Error('token refresh timed out'), {
            timeoutMs: TOKEN_REFRESH_TIMEOUT_MS,
          })
          resolve()
        }, TOKEN_REFRESH_TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    // The retry will surface anything that persists, but the failure itself
    // is worth knowing about rather than discarding.
    reportError('auth.refreshCredential', error)
  } finally {
    clearTimeout(timer)
  }
}

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback)
}
