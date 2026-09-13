import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

import { syncHostIdentity } from './activities'
import { db } from './config'

const ANONYMOUS_NAME = 'Anonymous user'
const ANONYMOUS_AVATAR = 'AN'

export const defaultPrivacy = {
  anonymousMode: false,
  locationPermission: false,
  approximateLocation: true,
  notifications: true,
}

/** Two-letter monogram used as the avatar throughout the UI. */
export function initialsOf(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const publicDoc = (uid) => doc(db, 'users', uid)
const privateDoc = (uid) => doc(db, 'users', uid, 'private', 'profile')

/**
 * The public/private split is the whole privacy story, so it lives in one
 * place: given the real name and the anonymous flag, what should the world
 * see? Anonymous mode replaces the name in the *public* document rather than
 * hiding it in the UI, so it holds even against someone reading Firestore
 * directly.
 */
function publicIdentity({ realName, anonymous }) {
  return anonymous
    ? { name: ANONYMOUS_NAME, avatar: ANONYMOUS_AVATAR }
    : { name: realName, avatar: initialsOf(realName) }
}

/**
 * Creates both halves of a new user's profile in one atomic batch, so a
 * half-registered account can never exist.
 */
async function createUserProfile(uid, { name, email, username }) {
  const batch = writeBatch(db)
  const realName = String(name || '').trim() || 'New user'

  batch.set(publicDoc(uid), {
    uid,
    ...publicIdentity({ realName, anonymous: false }),
    username: username || `@${(email || 'user').split('@')[0].slice(0, 20)}`,
    bio: '',
    interests: [],
    preferredTime: '',
    historyCategories: [],
    anonymous: false,
    // Deliberately on the PUBLIC profile, unlike every other privacy setting.
    // A notification is written into the recipient's inbox by the sender, so
    // the sender — and the security rules — must be able to read whether the
    // recipient wants one. Kept in the private half it could not be honoured
    // by anybody except its owner, which is how it quietly became decorative
    // again after the move to Firestore.
    notificationsEnabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  batch.set(privateDoc(uid), {
    email: email || '',
    realName,
    privacy: defaultPrivacy,
    location: null,
    onboarded: false,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
}

export async function ensureUserProfile(uid, details) {
  const existing = await getDoc(publicDoc(uid))
  if (!existing.exists()) await createUserProfile(uid, details)
}

export function watchUserProfile(uid, callback, onError) {
  return onSnapshot(publicDoc(uid), (snap) => callback(snap.exists() ? snap.data() : null), onError)
}

export function watchPrivateProfile(uid, callback, onError) {
  return onSnapshot(
    privateDoc(uid),
    (snap) => callback(snap.exists() ? snap.data() : null),
    onError,
  )
}

/**
 * How many peers the directory holds.
 *
 * This query had no bound: every signed-in client opened a live listener on
 * the whole `users` collection and held it open. Two things made that the
 * worst-scaling call in the app. Reads are O(N) per person per session, so
 * the platform pays O(N-squared) as it grows. And because it is live, one
 * person editing their profile pushes an update to every other connected
 * client — write amplification that also grows with N.
 *
 * Five hundred keeps both bounded.
 *
 * Deliberately *not* ordered. The obvious version sorts by `updatedAt` so the
 * most recently active people win the window, and it was written that way
 * first — then measured against the emulator, where two of seven user
 * documents turned out to have no `updatedAt` at all. Firestore drops
 * documents missing the ordering field from the result silently, so those two
 * people would simply have stopped existing for matching, with nothing
 * anywhere saying so. Every account the app creates does set the field; the
 * ones that did not came from another path entirely, which is precisely the
 * case an invariant like that has to survive.
 *
 * Unordered means the window is the first five hundred by document id:
 * arbitrary, stable, and complete. Arbitrary-but-complete beats
 * relevant-but-lossy when the loss is invisible.
 *
 * Somebody outside the window is not invisible in the app — activities carry
 * their host's name and avatar, so cards still render — they just do not take
 * part in compatibility scoring, which is the honest consequence of scoring
 * on the client at all (ADR-012).
 */
export const PEER_LIMIT = 500

/** Every other signed-up user — the peer directory behind matching. */
export function watchPeers(uid, callback, onError) {
  return onSnapshot(
    query(collection(db, 'users'), limit(PEER_LIMIT)),
    (snap) => callback(snap.docs.map((d) => d.data()).filter((peer) => peer.uid !== uid)),
    onError,
  )
}

/** Public-profile fields the user is allowed to edit. */
export function updatePublicProfile(uid, patch) {
  return updateDoc(publicDoc(uid), { ...patch, updatedAt: serverTimestamp() })
}

export function updatePrivateProfile(uid, patch) {
  return setDoc(privateDoc(uid), patch, { merge: true })
}

/** Renaming has to land in both documents at once, or they disagree. */
export async function updateDisplayName(uid, realName, anonymous) {
  const identity = publicIdentity({ realName, anonymous })
  const batch = writeBatch(db)
  batch.update(publicDoc(uid), { ...identity, updatedAt: serverTimestamp() })
  batch.set(privateDoc(uid), { realName }, { merge: true })
  await batch.commit()
  // The activities carry their own copy of the name; without this a rename
  // is visible on the profile and nowhere else.
  await syncHostIdentity(uid, identity)
}

/**
 * Toggling anonymous mode rewrites the public identity, which is what makes
 * the setting real: the name genuinely leaves the readable document.
 */
export async function setAnonymousMode(uid, anonymous, realName) {
  const identity = publicIdentity({ realName, anonymous })
  const batch = writeBatch(db)
  batch.update(publicDoc(uid), { ...identity, anonymous, updatedAt: serverTimestamp() })
  batch.set(privateDoc(uid), { privacy: { anonymousMode: anonymous } }, { merge: true })
  await batch.commit()
  // Without this the setting is cosmetic: the profile says "Anonymous user"
  // while every activity the person hosts still carries their real name.
  await syncHostIdentity(uid, identity)
}

/**
 * Records a category the user engaged with, feeding the history signal.
 *
 * `arrayUnion`, not a rewrite of the list. The old version wrote back
 * `[...existing, category]` from the client's copy of the profile — and two
 * joins in quick succession both read the copy from before either landed, so
 * the second write erased what the first had added. A server-side union
 * cannot lose an element whatever order the writes arrive in. `existing` is
 * still consulted, only to skip a write that would change nothing.
 */
export function recordCategoryHistory(uid, existing, category) {
  if (!category || (existing || []).includes(category)) return Promise.resolve()
  return updatePublicProfile(uid, { historyCategories: arrayUnion(category) })
}

/** See the note on the field in createUserProfile for why this is public. */
export function setNotificationsEnabled(uid, enabled) {
  return updatePublicProfile(uid, { notificationsEnabled: Boolean(enabled) })
}

export function saveLocation(uid, location) {
  return updatePrivateProfile(uid, { location })
}
