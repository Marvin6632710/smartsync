import React, { createContext, useContext, useEffect, useRef } from 'react'

/**
 * How a screen joins in the pull-to-refresh the shell owns.
 *
 * The gesture belongs to the shell, because the scroller does: there is one
 * scrolling element in the whole app and it lives there. But what a refresh
 * *means* belongs to the screen. Re-reading the live data covers most of
 * them, and the shell does that itself; AI Picks additionally has to ask the
 * model again, which the shell has no business knowing about.
 *
 * So a screen calls `usePageRefresh` with its own work, and the shell runs
 * whatever is registered alongside its own. Registering is by mount, so a
 * screen's work is never run after it has been navigated away from.
 */
const RefreshContext = createContext(null)

/** Provided by the shell. `register(action)` returns its own undo. */
export function RefreshProvider({ register, children }) {
  return <RefreshContext.Provider value={register}>{children}</RefreshContext.Provider>
}

/**
 * Adds `action` to the next pull-to-refresh on this screen, for as long as
 * the screen is mounted. The action may return a promise; the spinner waits
 * for it. Called through a ref, so a screen passing a freshly-made function
 * on every render registers once rather than on every render.
 */
export function usePageRefresh(action) {
  const register = useContext(RefreshContext)
  const actionRef = useRef(action)
  useEffect(() => {
    actionRef.current = action
  }, [action])
  useEffect(() => {
    if (!register) return undefined
    return register(() => actionRef.current?.())
  }, [register])
}
