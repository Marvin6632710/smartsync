import { lazy } from 'react'

import { reportError } from './reportError'

/** Remembered across the reload, so a chunk that is genuinely gone reloads once, not for ever. */
const RELOADED_KEY = 'smartsync:chunk-reloaded'

/**
 * Does this look like a chunk the server no longer has, rather than a bug
 * in it?
 *
 * The wording is the browser's. Chrome says "Failed to fetch dynamically
 * imported module" for a 404 and for a hosting rewrite that answered with
 * index.html instead (verified against the built app); Firefox says "error
 * loading dynamically imported module"; Safari, "Importing a module script
 * failed". A wrong MIME type is called out by name.
 */
export function isChunkLoadError(error) {
  return /dynamically imported module|Loading chunk|Importing a module script failed|Expected a JavaScript.*module script/i.test(
    String(error?.message || error || ''),
  )
}

/**
 * React.lazy for route chunks, with the one recovery a stale chunk needs.
 *
 * Firebase Hosting serves `index.html` uncached and the hashed assets as
 * immutable, so after every deploy a tab that was already open points at
 * chunk names that no longer exist. The first lazy route it visits fails,
 * and React.lazy caches that rejection: every render thereafter throws the
 * same error, and no retry short of a reload can help. Reloading is exactly
 * right — the fresh index.html names the fresh chunks — so it is done here,
 * once, and only when the browser believes it is online. Offline, a reload
 * would replace a working app with the browser's own error page, so the
 * error goes to the boundary instead.
 */
export function lazyRoute(importer) {
  return lazy(() =>
    importer().then(
      (module) => {
        try {
          sessionStorage.removeItem(RELOADED_KEY)
        } catch {
          // Storage may be unavailable; nothing to clear.
        }
        return module
      },
      (error) => {
        let reloaded = false
        try {
          reloaded = sessionStorage.getItem(RELOADED_KEY) === '1'
        } catch {
          // Treat as already reloaded: never loop on a browser that will not remember.
          reloaded = true
        }
        if (isChunkLoadError(error) && !reloaded && navigator.onLine) {
          try {
            sessionStorage.setItem(RELOADED_KEY, '1')
          } catch {
            // Fall through to the boundary rather than risk a reload loop.
            throw error
          }
          reportError('route.chunk', error, { recovery: 'reload' })
          window.location.reload()
          // Keep the Suspense fallback up until the page goes away.
          return new Promise(() => {})
        }
        throw error
      },
    ),
  )
}
