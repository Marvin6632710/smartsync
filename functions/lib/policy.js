/**
 * Which inbox records become a browser push, and how.
 *
 * The inbox is the record; a push is a courtesy for the ones that matter
 * when the app is not in front of you. Everything routine stays in-app.
 * The table is the one in the architecture note, as code.
 */

/** Push categories a person can switch off, and their defaults. */
export const DEFAULT_PUSH_PREFS = Object.freeze({
  chat: true,
  joins: false,
  activity: true,
  follows: true,
})

/** Notification kind → push category. Absent means "never a push". */
const CATEGORY_OF = {
  newMessage: 'chat',
  someoneJoined: 'joins',
  activityCancelled: 'activity',
  joinedRemoved: 'activity',
  activityPosted: 'follows',
  activityRemoved: 'moderation',
  warning: 'moderation',
  suspended: 'moderation',
  activeAgain: 'moderation',
  closed: 'moderation',
  reopened: 'moderation',
}

/** Seconds a push waits at FCM for a device that is off, per category. */
const TTL_OF = {
  chat: 15 * 60,
  joins: 60 * 60,
  activity: 24 * 60 * 60,
  follows: 4 * 60 * 60,
  moderation: 7 * 24 * 60 * 60,
}

const URGENCY_OF = {
  chat: 'high',
  joins: 'normal',
  activity: 'high',
  follows: 'normal',
  moderation: 'high',
}

/** Pushes one person may receive in an hour; safety notices are exempt. */
export const HOURLY_BUDGET = 30

/**
 * The delivery plan for a record, or null when it is never pushed.
 *
 * The tag is what makes repeats collapse rather than stack: the OS shows one
 * notification per tag, so six chat buckets in a row are one banner that
 * updates, and two joins are "somebody joined" once.
 */
export function decidePush(record, id) {
  const kind = record?.kind
  const category = CATEGORY_OF[kind]
  if (!category) return null
  const activityId = record.activityId || 'none'
  const hostId = record.params?.hostId
  const tag =
    category === 'chat'
      ? `chat-${activityId}`
      : category === 'joins'
        ? `roster-${activityId}`
        : category === 'activity'
          ? `activity-${activityId}`
          : category === 'follows'
            ? `follow-${hostId || activityId}`
            : `moderation-${id || activityId}`
  return {
    category,
    tag,
    ttl: TTL_OF[category],
    urgency: URGENCY_OF[category],
    // Safety and account notices cannot be switched off and are not budgeted.
    mandatory: category === 'moderation',
  }
}

/** Whether the recipient wants this category, with the defaults applied. */
export function categoryEnabled(category, prefs) {
  if (category === 'moderation') return true
  const value = prefs?.push?.[category]
  return typeof value === 'boolean' ? value : (DEFAULT_PUSH_PREFS[category] ?? false)
}
