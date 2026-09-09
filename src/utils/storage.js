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
