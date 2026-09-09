const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Renders a stored timestamp as relative text ("12 min ago").
 *
 * Notifications used to carry a hardcoded string, so one created at
 * launch still read "Now" hours later. Storing the instant and deriving
 * the label at render keeps it honest as time passes.
 *
 * `now` is injectable so this is testable without mocking the clock.
 */
export function formatRelativeTime(timestamp, now = Date.now()) {
  if (!timestamp) return ''

  const elapsed = now - timestamp
  // A clock skew or a timestamp written slightly ahead shouldn't render
  // as a negative age.
  if (elapsed < MINUTE) return 'Just now'

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE)
    return `${minutes} min ago`
  }

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR)
    return `${hours} hr${hours === 1 ? '' : 's'} ago`
  }

  const days = Math.floor(elapsed / DAY)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`

  const weeks = Math.floor(days / 7)
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Activity dates are stored as 'YYYY-MM-DD' so they sort and compare
 * correctly. People do not read dates that way, so near dates become
 * "Today"/"Tomorrow" and the rest get a short weekday form.
 */
export function formatActivityDate(date, now = new Date()) {
  if (!date) return ''
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return String(date)

  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((parsed - midnight) / DAY_MS)

  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 1 && days < 7) return parsed.toLocaleDateString([], { weekday: 'long' })
  return parsed.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

/** '19:00' -> '7:00 PM', in whatever form the viewer's locale prefers. */
export function formatClock(time) {
  if (!time) return ''
  const [hours, minutes] = String(time).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(time)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Short clock for chat bubbles, from a millisecond timestamp. */
export function formatMessageTime(timestamp) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
