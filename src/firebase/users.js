import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { hostedActivitiesFromServer, hostedActivityRefs, stampHostIdentity } from './activities'
import { db } from './config'
import { writePicture } from './pictures'
import { validPicture } from '../utils/pictures'

const ANONYMOUS_NAME = 'Anonymous user'
const ANONYMOUS_AVATAR = 'AN'

/**
 * The longest name the rules accept. Mirrored in firestore.rules
 * (`isString(data.name, 60)`); a name past it was refused at profile
 * creation, which left a brand-new account on "Can't load your profile"
 * with a Try again that could never help.
 */
export const MAX_NAME_LENGTH = 60

/** A name the rules will accept, or the fallback when there is none. */
export function acceptableName(name, fallback = 'New user') {
  return (
    String(name || '')
      .trim()
      .slice(0, MAX_NAME_LENGTH) || fallback
  )
}

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
 * Both halves of a new user's profile, as the documents to write. Written
 * together, always — see ensureUserProfile — so a half-registered account
 * can never exist.
 */
function newProfile(uid, { name, email, username }) {
  const realName = acceptableName(name)
  const publicData = {
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
  }
  const privateData = {
    email: email || '',
    realName,
    privacy: defaultPrivacy,
    location: null,
    onboarded: false,
    createdAt: serverTimestamp(),
  }
  return [
    [publicDoc(uid), publicData],
    [privateDoc(uid), privateData],
  ]
}

/**
 * Makes sure the profile documents exist. Returns whether this call made
 * them.
 *
 * Two things create a profile at sign-up — the sign-up itself, with the
 * name that was typed, and the auth observer, which covers accounts made
 * outside the form — and they run at the same time. This used to be a
 * read followed by a plain set: whichever wrote second overwrote the
 * first, and the observer, which knew no name at that instant, could put
 * "New user" over a profile that had just been created correctly. The
 * create is now a transaction that writes only if the document is still
 * missing at commit time, so two callers can both ask and only one can
 * make it; the other is told it already exists, whatever the order.
 *
 * The plain read stays in front of the transaction: an existing profile
 * is answered from the cache while offline, where a transaction — which
 * needs the server — would fail and leave a returning person on an error
 * screen for a profile they already have.
 */
export async function ensureUserProfile(uid, details) {
  const existing = await getDoc(publicDoc(uid))
  if (existing.exists()) return false
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(publicDoc(uid))
    if (snap.exists()) return false
    for (const [ref, data] of newProfile(uid, details)) tx.set(ref, data)
    return true
  })
}

/**
 * The three profile listeners report where each snapshot came from, as a
 * second argument: `{ fromCache }`. These documents are tiny and are the
 * first thing the app asks for, so the first one answered by the server is
 * the earliest proof there is a server — which is how a slow first load of
 * the activity feed is told apart from a connection that was never made
 * (see `serverSeen` in AuthContext). Metadata changes are delivered so the
 * cache-to-server transition is seen even when the data did not change.
 */
const meta = (snap) => ({ fromCache: snap.metadata?.fromCache === true })

export function watchUserProfile(uid, callback, onError) {
  return onSnapshot(
    publicDoc(uid),
    { includeMetadataChanges: true },
    (snap) => callback(snap.exists() ? snap.data() : null, meta(snap)),
    onError,
  )
}

export function watchPrivateProfile(uid, callback, onError) {
  return onSnapshot(
    privateDoc(uid),
    { includeMetadataChanges: true },
    (snap) => callback(snap.exists() ? snap.data() : null, meta(snap)),
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
 * PEER_LIMIT). Past that, somebody an admin needed to find could not be
 * found, and nothing on the screen said so. This asks Firestore instead: two
 * prefix queries, one per field, bounded, merged. Reads whatever the rules
 * let the caller read, which for public profiles is any signed-in account;
 * nothing here widens that.
 *
 * Prefix, and case-sensitive, because that is what a range on a string
 * field can do without an index per casing. Two spellings are tried where
 * they differ from what was typed — a capitalised first letter for names,
 * which are stored as typed and usually capitalised, and an "@" in front for
 * usernames — so "mar" finds Marvin and @marvin both. Four bounded reads at
 * most.
 */
export async function searchUsers(term) {
  const needle = String(term || '').trim()
  if (!needle) return []
  const prefix = (field, value) =>
    getDocs(
      query(
        collection(db, 'users'),
        where(field, '>=', value),
        where(field, '<', `${value}\uf8ff`),
        limit(SEARCH_LIMIT),
      ),
    )
  const capitalised = needle.charAt(0).toUpperCase() + needle.slice(1)
  const handle = needle.startsWith('@') ? needle : `@${needle.toLowerCase()}`
  const lookups = [
    prefix('name', needle),
    ...(capitalised !== needle ? [prefix('name', capitalised)] : []),
    prefix('username', needle),
    ...(handle !== needle ? [prefix('username', handle)] : []),
  ]
  const found = new Map()
  for (const snap of await Promise.all(lookups)) {
    snap.docs.forEach((d) => {
      const data = d.data()
      if (data?.uid) found.set(data.uid, data)
    })
  }
  return [...found.values()]
}

/** Public-profile fields the user is allowed to edit. */
/**
 * The public profiles of a handful of people by id, for the consoles.
 *
 * A report, a role row and a log entry all name people by uid, and the
 * directory in memory holds only the first five hundred accounts (see
 * PEER_LIMIT): past that, a name in the queue read "Unknown user". This
 * asks for exactly the ids that are missing, thirty per query — the limit
 * on an `in` filter — and reads only what the rules already let any
 * signed-in account read. A profile that does not exist is simply absent
 * from the answer.
 */
export const PROFILE_BATCH = 30

export async function fetchPublicProfiles(uids) {
  const wanted = [...new Set((uids || []).filter(Boolean))]
  const found = new Map()
  for (let start = 0; start < wanted.length; start += PROFILE_BATCH) {
    const chunk = wanted.slice(start, start + PROFILE_BATCH)
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)))
    snap.docs.forEach((d) => found.set(d.id, d.data()))
  }
  return found
}

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
async function writeIdentity(uid, identity, { publicPatch, privatePatch, picture }) {
  // Reject a damaged restored draft before any overflow batch can commit.
  if (picture && !validPicture(picture)) throw new Error('pictures.readError')
  const refs = await hostedActivityRefs(uid)
  // The final batch carries the profile's two writes, so it has that much
  // less room for activities. Everything before it is activities only.
  const room = BATCH_LIMIT - (picture ? 3 : 2)
  const overflow = Math.max(0, refs.length - room)
  for (let start = 0; start < overflow; start += BATCH_LIMIT) {
    const batch = writeBatch(db)
    stampHostIdentity(batch, refs.slice(start, Math.min(start + BATCH_LIMIT, overflow)), identity)
    await batch.commit()
  }
  const last = writeBatch(db)
  stampHostIdentity(last, refs.slice(overflow), identity)
  last.update(publicDoc(uid), { ...identity, ...publicPatch, updatedAt: serverTimestamp() })
  // Offline, the list of activities came from the cache and may be short;
  // the profile records that the sweep is unfinished, in the same batch, so
  // the note lands exactly when the partial sweep does. A list from the
  // server is complete, and clears any note a previous offline save left.
  last.set(
    privateDoc(uid),
    { ...privatePatch, identitySweepPending: refs.partial ? true : deleteField() },
    { merge: true },
  )
  if (picture) writePicture(last, 'profile', uid, picture)
  await last.commit()
}

/**
 * Finishes an identity sweep that was started from the cache.
 *
 * Reads the host's activities from the server — this runs only once the
 * connection is back — and stamps the ones whose copy of the name or avatar
 * disagrees with the profile's, which is by construction the ones the
 * offline sweep never saw. The pending note is cleared in the same batch as
 * the last of them, so a failure part-way leaves the note in place and the
 * next connection tries again. Returns how many were brought into line.
 */
export async function completeIdentitySweep(uid, { name, avatar, pictureVersion }) {
  const hosted = await hostedActivitiesFromServer(uid)
  const stale = hosted
    .filter(
      (a) =>
        a.hostName !== name ||
        a.hostAvatar !== avatar ||
        (pictureVersion && a.hostPictureVersion !== pictureVersion),
    )
    .map((a) => a.ref)
  const room = BATCH_LIMIT - 1
  const overflow = Math.max(0, stale.length - room)
  for (let start = 0; start < overflow; start += BATCH_LIMIT) {
    const batch = writeBatch(db)
    stampHostIdentity(batch, stale.slice(start, Math.min(start + BATCH_LIMIT, overflow)), {
      name,
      avatar,
      pictureVersion,
    })
    await batch.commit()
  }
  const last = writeBatch(db)
  stampHostIdentity(last, stale.slice(overflow), { name, avatar, pictureVersion })
  last.set(privateDoc(uid), { identitySweepPending: deleteField() }, { merge: true })
  await last.commit()
  return stale.length
}

/**
 * Renaming has to land in both documents at once, or they disagree.
 *
 * `publicPatch` carries any other public fields being saved in the same
 * breath — the profile editor's bio, interests and username — so a profile
 * save is one batch rather than two writes that could half-land.
 */
export async function updateDisplayName(uid, realName, anonymous, publicPatch = {}) {
  const identity = publicIdentity({ realName, anonymous })
  const { picture, ...fields } = publicPatch
  delete fields.pictureVersion
  if (picture) identity.pictureVersion = picture.version
  // The activities carry their own copy of the name; without them a rename
  // is visible on the profile and nowhere else.
  await writeIdentity(uid, identity, { publicPatch: fields, privatePatch: { realName }, picture })
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

/**
 * What reaches this person's devices, category by category.
 *
 * Private: only the owner and the Cloud Function that sends a push read
 * it. `push.<category>` switches a category; `chatPreview` says whether a
 * message push may carry the message's text (off unless asked for — a
 * lock screen is not a private place). Merged field by field, so two
 * switches flipped in quick succession do not undo each other.
 */
export function savePushPreferences(uid, { push = {}, chatPreview } = {}) {
  const patch = {}
  for (const [category, enabled] of Object.entries(push)) {
    patch[`notifications.push.${category}`] = Boolean(enabled)
  }
  if (chatPreview !== undefined) patch['notifications.chatPreview'] = Boolean(chatPreview)
  if (Object.keys(patch).length === 0) return Promise.resolve()
  return updateDoc(privateDoc(uid), patch).catch((error) => {
    // A private profile that predates the field has no map to merge into
    // by path; setDoc with merge creates the shape.
    if (error?.code !== 'not-found') throw error
    const nested = { notifications: { push: {} } }
    for (const [category, enabled] of Object.entries(push))
      nested.notifications.push[category] = Boolean(enabled)
    if (chatPreview !== undefined) nested.notifications.chatPreview = Boolean(chatPreview)
    return setDoc(privateDoc(uid), nested, { merge: true })
  })
}

/**
 * The language and time zone this person reads in, kept on the server so a
 * push — worded by a Function that has never seen this device — is in the
 * same language as the screen. Written only when they change.
 */
export function saveReadingLocale(uid, { language, timeZone }) {
  const patch = {}
  if (language) patch.language = String(language).slice(0, 12)
  if (timeZone) patch.timeZone = String(timeZone).slice(0, 64)
  if (Object.keys(patch).length === 0) return Promise.resolve()
  return updatePrivateProfile(uid, patch)
}

export function saveLocation(uid, location) {
  return updatePrivateProfile(uid, { location })
}
