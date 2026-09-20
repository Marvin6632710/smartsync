import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** The clock, re-read every `everyMs` — for countdowns and ages that must move. */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(timer)
  }, [everyMs])
  return now
}

/**
 * Filters that survive leaving the page and coming back — the state of a
 * queue is part of working it, and losing it to a glance at a report is
 * the small friction that makes a tool tiring. Kept for the tab, not the
 * device: tomorrow's shift starts clean.
 */
export function useStickyState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(`smartsync:console:${key}`)
      if (raw) return { ...initial, ...JSON.parse(raw) }
    } catch {
      // Storage unavailable or corrupt: start from the defaults.
    }
    return initial
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(`smartsync:console:${key}`, JSON.stringify(value))
    } catch {
      // The choice still holds for this page.
    }
  }, [key, value])
  return [value, setValue]
}

/** A one-shot fetch tied to a key, with its loading and failure states. */
export function useFetched(key, fetcher) {
  const [state, setState] = useState({ key: null, data: null, error: null })
  useEffect(() => {
    if (!key) return undefined
    let live = true
    fetcher(key).then(
      (data) => live && setState({ key, data, error: null }),
      (error) => live && setState({ key, data: null, error }),
    )
    return () => {
      live = false
    }
  }, [key, fetcher])
  const current = state.key === key
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: Boolean(key) && !current,
  }
}

/**
 * Filters carried in the address — `?status=mine` from a dashboard tile —
 * are applied once and then dropped from the address, so the sticky
 * filters own the state from there and a reload does not re-apply them
 * over whatever the admin changed since.
 */
export function useFilterParams(keys, apply) {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (!location.search) return
    const params = new URLSearchParams(location.search)
    const patch = {}
    for (const key of keys) if (params.has(key)) patch[key] = params.get(key)
    if (Object.keys(patch).length > 0) apply(patch)
    navigate(location.pathname, { replace: true })
    // Runs for the address as it was; `apply` and `keys` are stable per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])
}
