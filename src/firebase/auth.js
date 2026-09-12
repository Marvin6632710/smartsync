import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'

import { auth } from './config'
import { ensureUserProfile, updateDisplayName } from './users'
import { reportError } from '../utils/reportError'

/**
 * Firebase error codes are precise but unreadable ("auth/invalid-credential").
 * Surfacing them raw is a common way real apps leak internals and confuse
 * users, so every code the sign-in and sign-up flows can produce is mapped to
 * a sentence a person can act on.
 *
 * Note that wrong-password and unknown-email deliberately share one message:
 * distinguishing them would let anyone test which email addresses have
 * accounts here (user enumeration).
 */
const AUTH_MESSAGES = {
  'auth/email-already-in-use': 'An account already exists with this email. Try signing in.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'Cannot reach the server. Check your connection.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/requires-recent-login': 'Please sign in again to make this change.',
}

export function authErrorMessage(error) {
  return AUTH_MESSAGES[error?.code] || 'Something went wrong. Please try again.'
}

export async function signUp({ email, password, name }) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
  const displayName = String(name || '').trim() || 'New user'

  // Kept in sync with the Firestore profile so the Auth record is not a
  // nameless row in the console.
  await updateProfile(credential.user, { displayName })

  // Creating the account immediately wakes the auth observer, which builds a
  // profile from `displayName` — still null at that instant, so it produced a
  // user literally called "New user". Rather than depend on which of the two
  // wins the race, write the real name here explicitly: ensure the documents
  // exist, then set the name over whatever the observer may have created.
  await ensureUserProfile(credential.user.uid, { name: displayName, email: credential.user.email })
  await updateDisplayName(credential.user.uid, displayName, false)

  return credential.user
}

export async function signIn({ email, password }) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
  return credential.user
}

export function signOutUser() {
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
