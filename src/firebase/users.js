import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

import { db } from './config'

export const ANONYMOUS_NAME = 'Anonymous user'
export const ANONYMOUS_AVATAR = 'AN'

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
export async function createUserProfile(uid, { name, email, username }) {
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

/** Every other signed-up user — the peer directory behind matching. */
export function watchPeers(uid, callback, onError) {
  return onSnapshot(
    collection(db, 'users'),
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
  const batch = writeBatch(db)
  batch.update(publicDoc(uid), {
    ...publicIdentity({ realName, anonymous }),
    updatedAt: serverTimestamp(),
  })
  batch.set(privateDoc(uid), { realName }, { merge: true })
  await batch.commit()
}

/**
 * Toggling anonymous mode rewrites the public identity, which is what makes
 * the setting real: the name genuinely leaves the readable document.
 */
export async function setAnonymousMode(uid, anonymous, realName) {
  const batch = writeBatch(db)
  batch.update(publicDoc(uid), {
    ...publicIdentity({ realName, anonymous }),
    anonymous,
    updatedAt: serverTimestamp(),
  })
  batch.set(privateDoc(uid), { privacy: { anonymousMode: anonymous } }, { merge: true })
  await batch.commit()
}

/** Records a category the user engaged with, feeding the history signal. */
export function recordCategoryHistory(uid, existing, category) {
  if (!category || (existing || []).includes(category)) return Promise.resolve()
  return updatePublicProfile(uid, {
    historyCategories: [...new Set([...(existing || []), category])],
  })
}

/** See the note on the field in createUserProfile for why this is public. */
export function setNotificationsEnabled(uid, enabled) {
  return updatePublicProfile(uid, { notificationsEnabled: Boolean(enabled) })
}

export function saveLocation(uid, location) {
  return updatePrivateProfile(uid, { location })
}
