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
