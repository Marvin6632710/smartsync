import i18n, { personName } from './index'
import kinds from './notificationKinds.json'
import { extract, fill, recogniser } from './templates'

/**
 * The notifications SmartSync writes, and how they are read back.
 *
 * A notification is a document another client writes into your inbox, and
 * the rules fix its shape to a title and a body — text, with no room for a
 * template key. So the text is written in one language, English, the way it
 * always was, and this module is the other half: it knows every wording the
 * app writes, recognises it in a stored notification, pulls the names and
 * titles back out, and words it afresh in the language the reader chose.
 *
 * Writers render through `storedText` so the stored wording and the
 * recogniser can never drift apart: both come from the `en` column below.
 * A notification this table does not recognise — written by an older
 * version, or by hand — is shown as it was stored.
 */
const TEMPLATES = {
  someoneJoined: {
    title: 'Someone joined',
    body: '{{name}} joined {{title}}.',
  },
  activityCancelled: {
    title: 'Activity cancelled',
    body: '{{title}} was cancelled by the host.',
  },
  activityPosted: {
    title: '{{name}} posted an activity',
    body: '{{title}} at {{place}}',
  },
  newMessage: {
    title: 'New message in {{title}}',
    body: '{{name}}: {{text}}',
  },
  suspended: {
    title: 'Your account is suspended',
    body: 'You can still read SmartSync, but cannot create, join or message.',
  },
  activeAgain: {
    title: 'Your account is active again',
    body: 'The suspension on your account is lifted.',
  },
  activityRemoved: {
    title: 'Your activity was removed',
    body: 'SmartSync removed "{{title}}": {{reason}}.',
  },
  joinedRemoved: {
    title: 'An activity you joined was removed',
    body: '"{{title}}" is not going ahead. SmartSync removed it.',
  },
  nowModerator: {
    title: 'You are now a moderator',
    body: 'You can review reports from Settings → Moderation. Every action you take is recorded against the report.',
  },
  noLongerModerator: {
    title: 'You are no longer a moderator',
    body: 'Your SmartSync account is otherwise unchanged.',
  },
  closed: {
    title: 'Your SmartSync account has been closed',
    body: '{{reason}} You can still sign in, but the account can no longer host, join, or message anybody. If you believe this is wrong, reply to the email address in our policy.',
  },
  reopened: {
    title: 'Your account is open again',
    body: '{{reason}} Anything taken down while it was closed stays down.',
  },
  warning: {
    title: 'A warning about your SmartSync account',
    body: '{{reason}} Nothing has been taken away. Repeated problems can lead to a suspension.',
  },
  activityBack: {
    title: 'Your activity is back',
    body: '"{{title}}" was reviewed again and restored.',
  },
}

/**
 * The translation key each template is worded from. Shared with the Cloud
 * Function that words a push, so the two can never disagree about a kind.
 */
const KEY_OF = kinds.kinds

/** How many parameters a record may carry, and how long each may be. */
const MAX_PARAMS = 8
const MAX_PARAM_LENGTH = 300

/**
 * The parameters as they are stored: strings only, bounded, and never more
 * of them than the rules accept.
 */
function storedParams(params) {
  const clean = {}
  for (const [name, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue
    if (Object.keys(clean).length >= MAX_PARAMS) break
    clean[name] = String(value).slice(0, MAX_PARAM_LENGTH)
  }
  return clean
}

/**
 * What a writer stores for a template: the English wording, as always, and
 * beside it the kind and the parameters it was filled from. The wording is
 * what an older app shows; the kind and parameters are what a newer one —
 * and the push that reaches a closed one — word afresh without parsing.
 */
export function storedText(kind, params = {}) {
  const template = TEMPLATES[kind]
  if (!template) throw new Error(`Unknown notification template: ${kind}`)
  const clean = storedParams(params)
  return {
    title: fill(template.title, clean),
    body: fill(template.body, clean),
    kind,
    params: clean,
  }
}

const RECOGNISERS = Object.entries(TEMPLATES).map(([kind, template]) => ({
  kind,
  title: recogniser(template.title),
  body: recogniser(template.body),
}))

/**
 * The title and body to show for a stored notification, in the language in
 * force. Names, activity titles, message text and moderators' reasons are
 * carried across as they were written; only the app's own words change.
 */
export function localizeNotification(notification) {
  const title = String(notification?.title ?? '')
  const body = String(notification?.body ?? '')
  // A record that says what it is needs no recognising.
  const key = KEY_OF[notification?.kind]
  if (key && notification.params && typeof notification.params === 'object') {
    const params = { ...notification.params }
    if ('name' in params) params.name = personName(params.name)
    return {
      title: i18n.t(`notifications.templates.${key}Title`, params),
      body: i18n.t(`notifications.templates.${key}Body`, params),
    }
  }
  for (const candidate of RECOGNISERS) {
    const titleParams = extract(candidate.title, title)
    if (!titleParams) continue
    const bodyParams = extract(candidate.body, body)
    const params = { ...titleParams, ...(bodyParams || {}) }
    // The person named may have been anonymous at the time.
    if ('name' in params) params.name = personName(params.name)
    const key = KEY_OF[candidate.kind]
    return {
      title: i18n.t(`notifications.templates.${key}Title`, params),
      // A body the recogniser does not know (an older wording) is shown as
      // stored rather than reworded from guesses.
      body: bodyParams ? i18n.t(`notifications.templates.${key}Body`, params) : body,
    }
  }
  return { title, body }
}
