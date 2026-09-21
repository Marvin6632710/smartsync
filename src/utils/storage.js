const STORAGE_PREFIX = 'smartsync:'
const VERSION_KEY = `${STORAGE_PREFIX}schemaVersion`

// Since the move to Firestore this file holds exactly one thing: the user's
// discovery filters, which are a per-device view preference rather than
// account data. Everything that used to live here — the user, activities,
// messages, notifications — is now on the server.
//
// The version gate is kept because a stored filter shape that no longer
// matches is still enough to break a render, and wiping one key is cheaper
// than defending every read of it.
// 3 — filters lost their `date` field when weekday-name filtering was
//     replaced by real dates.
// (Not bumped when the filters' single category and time band became sets
//  on 2026-09-21: a bump takes the scoring weights with it, and the old
//  shape is worth keeping — utils/filters reads either and writes the new.)
const SCHEMA_VERSION = 3

function ensureSchemaVersion() {
  try {
    if (localStorage.getItem(VERSION_KEY) === String(SCHEMA_VERSION)) return
    Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => localStorage.removeItem(key))
    localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION))
  } catch {
    // Storage may be unavailable; nothing to migrate.
  }
}

ensureSchemaVersion()

/**
 * Does the stored value have the same broad shape as the fallback?
 *
 * The try/catch below only fires when the text fails to parse. Valid JSON of
 * the wrong shape — an object where an array is expected — parses fine and
 * then throws later during render. The fallback already describes the
 * expected shape, so compare against it rather than hand-writing a schema.
 *
 * This is deliberately coarse: it catches container mismatches, not missing
 * fields. Components guard their own field reads.
 */
function looksLike(value, fallback) {
  if (Array.isArray(fallback)) return Array.isArray(value)
  if (fallback === null) return true
  if (typeof fallback === 'object') {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
  return typeof value === typeof fallback
}

export function loadStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return looksLike(parsed, fallback) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Prototype should keep running if storage is unavailable.
  }
}

// ------------------------------------------------------------- durable ----
//
// What follows is for the one thing this file holds that is not a
// preference: the unsent registry (see `unsent` in AppContext) — content a
// person typed that the server has not accepted. A filter that fails to
// save costs a slider position; a registry that fails to save costs the
// message. So it does not simply swallow a storage failure the way
// loadStorage and saveStorage do.
//
// Browser storage is not a given. Accessing `localStorage` at all throws in
// a page that is blocking site data (Safari's private mode used to, and any
// embedded or sandboxed page does), and a store that opens can still refuse
// a write once it is full. So a value is kept in memory always — that is
// the copy the page runs on — and then in the best browser store that will
// take it: localStorage, so it survives the tab and is shared with other
// tabs; failing that sessionStorage, which survives a reload of this tab;
// failing that memory alone, which the registry is told, so it can warn
// before the page is left. The choice is made again on every write, since
// a store can fill up, or be emptied, in the meantime.

const memory = new Map()
const BROWSER_STORES = ['localStorage', 'sessionStorage']

/** Where a value ended up: 'local', 'session' or 'memory'. */
export const DURABLE = { local: 'local', session: 'session', memory: 'memory' }

function browserStore(name) {
  try {
    // The access itself is what throws when storage is blocked.
    const store = window[name]
    if (!store) return null
    return store
  } catch {
    return null
  }
}

function readFrom(name, key) {
  const store = browserStore(name)
  if (!store) return undefined
  try {
    const raw = store.getItem(key)
    if (raw === null) return undefined
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function removeFrom(name, key) {
  const store = browserStore(name)
  if (!store) return
  try {
    store.removeItem(key)
  } catch {
    // A copy that cannot be removed is one that could not have been
    // written either, so there is nothing stale to remove.
  }
}

/**
 * The stored value, from the most durable place that holds one: a copy
 * that made it to localStorage is preferred to this tab's, and both to
 * memory. A value of the wrong shape counts as absent.
 */
export function loadDurable(key, fallback) {
  for (const name of BROWSER_STORES) {
    const value = readFrom(name, key)
    if (value !== undefined && looksLike(value, fallback)) return value
  }
  if (memory.has(key)) return memory.get(key)
  return fallback
}

/**
 * Keeps the value, and returns where it ended up (see DURABLE). Memory
 * always has it; the browser stores are tried in order of durability, and
 * a store that refuses the write has any older copy of the key removed, so
 * a later read cannot prefer a stale copy over the one that was kept.
 */
export function saveDurable(key, value) {
  memory.set(key, value)
  const text = JSON.stringify(value)
  let kept = DURABLE.memory
  for (const name of BROWSER_STORES) {
    if (kept !== DURABLE.memory) {
      removeFrom(name, key)
      continue
    }
    const store = browserStore(name)
    if (!store) continue
    try {
      store.setItem(key, text)
      kept = name === 'localStorage' ? DURABLE.local : DURABLE.session
    } catch {
      removeFrom(name, key)
    }
  }
  return kept
}

/** For tests: forgets every value kept in memory. */
export function forgetDurable() {
  memory.clear()
}
