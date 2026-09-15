/**
 * The two things that make a listing feel live rather than filed.
 *
 * A card already says when an activity is and how many people are on it. What
 * it did not say is whether either of those facts is *urgent* — that it starts
 * in forty minutes, or that there are two places left. Those are the details
 * that turn browsing into going, and they are the ones a person scanning a
 * list actually acts on.
 *
 * Both are deliberately quiet when there is nothing to say. A badge on every
 * card is not a signal, it is wallpaper: if "Filling up" appears on something
 * three-quarters empty, nobody believes the one that is genuinely nearly full.
 */

import i18n from '../i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * How long until it starts, when that is soon enough to matter.
 *
 * Returns null beyond six hours, because past that the date line on the card
 * already says everything useful and a countdown is just noise.
 */
export function timeUntilLabel(startsAt, now = Date.now()) {
  const at = startsAt instanceof Date ? startsAt.getTime() : Number(startsAt)
  if (!Number.isFinite(at) || !Number.isFinite(now)) return null

  const ms = at - now
  // Already running or finished. "Ended" and the live state are decided
  // elsewhere from the real status; this function only looks forward.
  if (ms <= -MINUTE) return null
  if (ms < 15 * MINUTE) return { label: i18n.t('urgency.startingNow'), tone: 'now' }
  if (ms < HOUR)
    return { label: i18n.t('urgency.inMinutes', { count: Math.round(ms / MINUTE) }), tone: 'now' }
  if (ms < 6 * HOUR) {
    const hours = Math.round(ms / HOUR)
    return { label: i18n.t('urgency.inHours', { count: hours }), tone: 'soon' }
  }
  return null
}

/**
 * Whether the roster is worth mentioning.
 *
 * The wording carries the meaning on its own — "Full", "2 spots left" — so
 * the colour that goes with the tone is reinforcement, never the only way to
 * read it.
 */
export function capacityNote(participants, capacity) {
  const taken = Number(participants)
  const total = Number(capacity)
  if (!Number.isFinite(taken) || !Number.isFinite(total) || total <= 0) return null
  if (taken < 0) return null

  const left = total - taken
  if (left <= 0) return { label: i18n.t('urgency.full'), tone: 'full', left: 0 }
  // A tiny activity is not "nearly full" at three of four — it is simply
  // small. Below six places the proportion says nothing, so only the literal
  // count does.
  if (left <= 2) return { label: i18n.t('urgency.spotsLeft', { count: left }), tone: 'last', left }
  if (total >= 6 && taken / total >= 0.8)
    return { label: i18n.t('urgency.fillingUp'), tone: 'filling', left }
  return null
}

/**
 * The single badge a card should wear, if any.
 *
 * One badge, not two. A card carrying "In 3 hours" *and* "2 spots left"
 * alongside a category and a match score has stopped ranking anything — it is
 * four competing claims on the same glance.
 *
 * The order is by what changes your decision. "Full" comes first because it
 * decides whether you can go at all. A start time inside a few hours comes
 * next, because it decides whether you can make it. "Filling up" is last: it
 * is the only one of the three that is merely persuasive, and persuasion
 * should never outrank fact.
 */
export function activityBadge(activity, now = Date.now()) {
  if (!activity) return null
  // A finished or cancelled activity is not urgent; the card says what it is
  // through its own status, and a countdown there would be nonsense.
  if (activity.isPast || (activity.status && activity.status !== 'active')) return null

  const capacity = capacityNote(activity.participants, activity.capacity)
  if (capacity && capacity.tone === 'full') return capacity

  const time = timeUntilLabel(activity.startsAtMs ?? activity.startsAt, now)
  if (time) return time

  return capacity
}
