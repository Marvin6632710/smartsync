import i18n from './index'
import { extract, fill, recogniser } from './templates'

/**
 * The line of context a report carries — what was reported, in a sentence
 * — is stored in English, as it always was, and worded for the moderator
 * reading it. Writers render through `storedContext` so the stored wording
 * and the recogniser cannot drift apart; a context this table does not
 * recognise is shown as stored.
 */
const TEMPLATES = {
  activity: '{{title}} at {{place}}, hosted by {{host}}',
  participant: 'Participant in "{{title}}"',
  match: 'Suggested match, {{score}}% compatibility',
  message: '"{{text}}" — {{name}} in "{{title}}"',
}

// An activity called "Run at dawn" must keep its title: the title takes
// every " at " but the last before ", hosted by".
const GREEDY = { activity: ['title'] }

const RECOGNISERS = Object.entries(TEMPLATES).map(([kind, template]) => ({
  kind,
  recogniser: recogniser(template, GREEDY[kind] || []),
}))

/** The English context a writer stores for a report. */
export function storedContext(kind, params = {}) {
  const template = TEMPLATES[kind]
  if (!template) throw new Error(`Unknown report context: ${kind}`)
  return fill(template, params)
}

/** The context to show for a stored report, in the language in force. */
export function localizeReportContext(context) {
  const text = String(context ?? '')
  for (const { kind, recogniser: shape } of RECOGNISERS) {
    const params = extract(shape, text)
    if (params) return i18n.t(`report.context.${kind}`, params)
  }
  return text
}
