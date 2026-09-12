/**
 * One place every failure passes through.
 *
 * Until now a failure could end up in three different places: an
 * `console.error` in the error boundary, a `.catch(() => {})` that discarded
 * it entirely, or a `try {} catch {}` that decided the operation did not
 * matter. The third kind is the dangerous one — a notification telling
 * somebody their activity was removed could fail and leave no trace anywhere,
 * on any device, so nobody would ever know it had not been delivered.
 *
 * This does not change what the user sees. What it changes is that every
 * failure is now *recorded* in one shape, in one place, so wiring up a real
 * monitoring service later is a change to this file and to nothing else. That
 * is the whole point: the app currently has no way of knowing what is failing
 * in production, and the first step is having somewhere for it to be said.
 */

/** Kept small and bounded — this is a breadcrumb trail, not a log file. */
const RECENT_LIMIT = 25
const recent = []

/** Swapped for a real reporter (Sentry and friends) in one place. */
let sink = null

export function setErrorSink(fn) {
  sink = typeof fn === 'function' ? fn : null
}

/**
 * @param scope   where it happened, e.g. 'moderation.tell'
 * @param error   the thrown value — not assumed to be an Error
 * @param context anything that helps identify it later. Must not carry
 *                personal data: ids are fine, names and messages are not.
 */
export function reportError(scope, error, context = {}) {
  const entry = {
    scope,
    message: String(error?.message || error || 'unknown'),
    code: error?.code,
    at: new Date().toISOString(),
    ...context,
  }

  recent.push(entry)
  if (recent.length > RECENT_LIMIT) recent.shift()

  // Still the console today, but through one door rather than five.
  console.error(`[smartsync:${scope}]`, error, context)

  try {
    sink?.(entry)
  } catch {
    // A broken reporter must never break the thing it was reporting on.
  }
}

/** The last few failures, for a support screen or a bug report. */
export function recentErrors() {
  return [...recent]
}

/**
 * Catches what never reaches a try/catch: a promise nobody handled, and an
 * error thrown outside React's render path. Both are currently invisible.
 */
export function installGlobalErrorReporting() {
  if (typeof window === 'undefined') return
  if (window.__smartsyncErrorsInstalled) return
  window.__smartsyncErrorsInstalled = true

  window.addEventListener('unhandledrejection', (event) => {
    reportError('unhandled.rejection', event.reason)
  })
  window.addEventListener('error', (event) => {
    // Resource load failures (a missing chunk, a dead image) arrive here with
    // no `error` object; they are worth knowing about and must not be
    // reported as though they were exceptions.
    if (!event.error) {
      reportError('resource.error', new Error(event.message || 'resource failed'), {
        source: event.filename || undefined,
      })
      return
    }
    reportError('window.error', event.error)
  })
}
