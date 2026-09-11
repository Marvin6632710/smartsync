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

/**
 * '19:00' -> '7:00 PM', in whatever form the viewer's locale prefers.
 *
 * The shape is checked before the numbers are, because `Number('')` is 0 and
 * not NaN: `'::'` split and mapped gives [0, 0], both perfectly finite, and
 * the old guard waved it through as midnight. A malformed time rendering as a
 * confident "12:00 AM" is worse than rendering as itself — one is a wrong
 * answer, the other is visibly not an answer.
 */
export function formatClock(time) {
  if (!time) return ''
  const raw = String(time)
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim())
  if (!match) return raw
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return raw
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Short clock for chat bubbles, from a millisecond timestamp. */
export function formatMessageTime(timestamp) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * What part of the day it is, for copy that is not wrong half the time.
 *
 * "What are you doing tonight?" is a good question at six in the evening and
 * a strange one at nine in the morning. The app is about plans, so the hour
 * is not decoration here — it changes which plans are even possible, and a
 * greeting that ignores it is the tell that nobody was paying attention.
 */
export function partOfDay(now = new Date()) {
  const hour = now.getHours()
  if (hour < 5) return 'late'
  if (hour < 11) return 'morning'
  if (hour < 16) return 'afternoon'
  if (hour < 22) return 'evening'
  return 'late'
}

const GREETINGS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  late: 'Still up',
}

const QUESTIONS = {
  morning: 'What are you doing today?',
  afternoon: 'Anything on this evening?',
  evening: 'What are you doing tonight?',
  late: 'Planning something for tomorrow?',
}

export const greetingFor = (part) => GREETINGS[part] || 'Hello'
export const questionFor = (part) => QUESTIONS[part] || 'What are you doing next?'
