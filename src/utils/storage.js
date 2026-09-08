const STORAGE_PREFIX = 'smartsync:'
const VERSION_KEY = `${STORAGE_PREFIX}schemaVersion`

// Bump this whenever a stored shape changes in a way older data can't
// satisfy (e.g. renamed/removed fields in mockData.js, a changed activity
// or user shape). A mismatch wipes all smartsync: keys so the app re-seeds
// from mockData.js instead of crashing or silently misbehaving on stale data.
const SCHEMA_VERSION = 1

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

export function loadStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
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
