import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { hostedActivityRefs, stampHostIdentity } from './activities'
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

/** How many matches one search brings back, per field it searches. */
export const SEARCH_LIMIT = 20

/**
 * Finds people by the start of their name or username, on the server.
 *
 * The moderation screens list "everyone" from the directory the app already
 * holds — which is the first five hundred accounts, and no more (see
 * PEER_LIMIT). Past that, somebody a moderator needed to find could not be
 * found, and nothing on the screen said so. This asks Firestore instead: two
 * prefix queries, one per field, bounded, merged. Reads whatever the rules
 * let the caller read, which for public profiles is any signed-in account;
 * nothing here widens that.
 *
 * Prefix, and case-sensitive, because that is what a range on a string
 * field can do without an index per casing. Names are stored as typed and
 * usernames as typed, so "Ma" finds Marvin and "@ma" finds @marvin.
 */
export async function searchUsers(term) {
  const needle = String(term || '').trim()
  if (!needle) return []
  const prefix = (field) =>
    getDocs(
      query(
        collection(db, 'users'),
        where(field, '>=', needle),
        where(field, '<', `${needle}\uf8ff`),
        limit(SEARCH_LIMIT),
      ),
    )
  const [byName, byUsername] = await Promise.all([prefix('name'), prefix('username')])
  const found = new Map()
  for (const snap of [byName, byUsername]) {
    snap.docs.forEach((d) => {
      const data = d.data()
      if (data?.uid) found.set(data.uid, data)
    })
  }
  return [...found.values()]
}

/** Public-profile fields the user is allowed to edit. */
export function updatePublicProfile(uid, patch) {
  return updateDoc(publicDoc(uid), { ...patch, updatedAt: serverTimestamp() })
}

export function updatePrivateProfile(uid, patch) {
  return setDoc(privateDoc(uid), patch, { merge: true })
}

/** Firestore's ceiling on operations in one batch. */
const BATCH_LIMIT = 500

/**
 * Writes a new public identity everywhere it is copied, as one change.
 *
 * Three documents have to agree — the public profile, the private one, and
 * the copy of the name on every activity the person hosts — and they used
 * to be written as two separate operations: the profile batch first, the
 * activities after. A connection that dropped between them left the profile
 * saying "Anonymous user" while every hosted activity still carried the real
 * name, readable by anyone; and because the second step had thrown, the
 * screen reported the change as failed while the switch showed it on.
 *
 * Now the activities are read first, and the profile goes into the same
 * batch as the activities: either all of it lands or none of it does. A
 * host with more activities than one batch holds is the one case that needs
 * several, and there the activities go *first* and the profile last — so a
 * failure part-way leaves the switch showing the old state, which is true,
 * and a retry simply stamps the same activities again and finishes.
 */
async function writeIdentity(uid, identity, { publicPatch, privatePatch }) {
  const refs = await hostedActivityRefs(uid)
  // The final batch carries the profile's two writes, so it has that much
  // less room for activities. Everything before it is activities only.
  const room = BATCH_LIMIT - 2
  const overflow = Math.max(0, refs.length - room)
  for (let start = 0; start < overflow; start += BATCH_LIMIT) {
    const batch = writeBatch(db)
    stampHostIdentity(batch, refs.slice(start, Math.min(start + BATCH_LIMIT, overflow)), identity)
    await batch.commit()
  }
  const last = writeBatch(db)
  stampHostIdentity(last, refs.slice(overflow), identity)
  last.update(publicDoc(uid), { ...identity, ...publicPatch, updatedAt: serverTimestamp() })
  last.set(privateDoc(uid), privatePatch, { merge: true })
  await last.commit()
}

/** Renaming has to land in both documents at once, or they disagree. */
export async function updateDisplayName(uid, realName, anonymous) {
  const identity = publicIdentity({ realName, anonymous })
  // The activities carry their own copy of the name; without them a rename
  // is visible on the profile and nowhere else.
  await writeIdentity(uid, identity, { publicPatch: {}, privatePatch: { realName } })
}

/**
 * Toggling anonymous mode rewrites the public identity, which is what makes
 * the setting real: the name genuinely leaves the readable document — and
 * leaves every activity the person hosts in the same write.
 */
export async function setAnonymousMode(uid, anonymous, realName) {
  const identity = publicIdentity({ realName, anonymous })
  await writeIdentity(uid, identity, {
    publicPatch: { anonymous },
    privatePatch: { privacy: { anonymousMode: anonymous } },
  })
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
