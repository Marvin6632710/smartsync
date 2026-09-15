/**
 * English text the app stores, and how it is recognised again.
 *
 * Some text is written into the database in the app's own words — a
 * notification, the line of context on a report — because the document has
 * room for text and not for a template key. It is always written in
 * English, from a template with `{{placeholders}}`, and read back by
 * matching the same template, so the names and titles inside can be lifted
 * out and the sentence worded afresh in the reader's language.
 */
const PLACEHOLDER = /\{\{(\w+)\}\}/g

/** The template with its placeholders filled: what a writer stores. */
export function fill(template, params) {
  return template.replace(PLACEHOLDER, (_, name) => String(params?.[name] ?? ''))
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A regular expression that recognises a template's text and captures its
 * parameters. Every placeholder is matched lazily except the last, which
 * takes the rest — so "{{name}}: {{text}}" gives the colon to the name and
 * everything after it to the text, whatever the text contains. A template
 * can name placeholders that should be greedy instead, for the one case
 * where the words between two placeholders can also occur inside the
 * first: "{{title}} at {{place}}" wants "Run at dawn at the park" to keep
 * its title whole.
 */
export function recogniser(template, greedy = []) {
  const names = []
  let pattern = ''
  let last = 0
  for (const match of template.matchAll(PLACEHOLDER)) {
    pattern += escape(template.slice(last, match.index))
    names.push(match[1])
    pattern += greedy.includes(match[1]) ? '(.+)' : '(.+?)'
    last = match.index + match[0].length
  }
  pattern += escape(template.slice(last))
  // The final placeholder is greedy: the text after it is fixed, and a lazy
  // match would stop at the first place that text could also appear.
  const lastLazy = pattern.lastIndexOf('(.+?)')
  if (lastLazy >= 0) pattern = `${pattern.slice(0, lastLazy)}(.+)${pattern.slice(lastLazy + 5)}`
  return { names, regex: new RegExp(`^${pattern}$`, 's') }
}

/** The parameters a recogniser finds in a text, or null if it is not that text. */
export function extract({ names, regex }, text) {
  const match = regex.exec(String(text ?? ''))
  if (!match) return null
  const params = {}
  names.forEach((name, index) => {
    params[name] = match[index + 1]
  })
  return params
}
