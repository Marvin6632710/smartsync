import { useEffect, useState } from 'react'

import { searchUsers } from '../firebase/users'
import { reportError } from '../utils/reportError'

/** How long after the last keystroke before the server is asked. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * People matching a search term, from the server rather than from memory.
 *
 * The moderation screens search the directory the app already holds, which
 * is complete up to the peer window and silent beyond it. This runs the same
 * term against Firestore once typing pauses, so somebody outside the window
 * can still be found. Results are merged by the caller with the in-memory
 * rows, which win where both exist — they are live and carry counts.
 *
 * A stale answer never shows: every result is stored with the term it was
 * fetched for, and only the current term's result is returned. Unmounting or
 * changing the term discards whatever is in flight.
 */
export function usePeopleSearch(term, enabled = true) {
  const needle = enabled ? String(term || '').trim() : ''
  const [answer, setAnswer] = useState({ needle: '', rows: [] })

  useEffect(() => {
    if (!needle) return undefined
    let live = true
    const timer = setTimeout(async () => {
      try {
        const rows = await searchUsers(needle)
        if (live) setAnswer({ needle, rows })
      } catch (error) {
        if (live) setAnswer({ needle, rows: [] })
        reportError('users.search', error)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [needle])

  const current = needle && answer.needle === needle
  return { found: current ? answer.rows : [], searching: Boolean(needle) && !current }
}
