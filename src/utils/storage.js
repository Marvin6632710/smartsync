const STORAGE_PREFIX = 'smartsync:'
const VERSION_KEY = `${STORAGE_PREFIX}schemaVersion`

// Bump this whenever a stored shape changes in a way older data can't
// satisfy (e.g. renamed/removed fields in mockData.js, a changed activity
// or user shape). A mismatch wipes all smartsync: keys so the app re-seeds
// from mockData.js instead of crashing or silently misbehaving on stale data.
// 2 — notifications moved from a hardcoded `time` string to a `createdAt`
//     timestamp, so stored notifications from v1 have no age to render.
const SCHEMA_VERSION = 2

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
