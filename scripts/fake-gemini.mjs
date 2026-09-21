#!/usr/bin/env node
/**
 * A stand-in for the Gemini API, for the emulator.
 *
 * Speaks just enough of the Interactions API for the AI Picks Function:
 * it takes the request the real SDK sends, reads the candidate activities
 * out of the prompt, and answers with a schema-shaped ranking — the
 * standard match score, best first, with the reasons the facts support —
 * so the whole path (browser → Function → SDK → parsing → cache → screen)
 * runs without a key or a bill. It does not think; that is the point.
 *
 *   node scripts/fake-gemini.mjs            # listens on 127.0.0.1:5599
 *   FAKE_GEMINI_MODE=error node …           # every call fails with 503
 *   FAKE_GEMINI_MODE=quota node …           # every call fails with 429
 *   FAKE_GEMINI_MODE=garbage node …         # answers with unusable JSON
 *   FAKE_GEMINI_MODE=slow node …            # answers after 25 s (past the timeout)
 *
 * Then, for the Function under the emulator (functions/.secret.local and
 * functions/.env, both ignored by git):
 *   GEMINI_API_KEY=fake            (any non-empty value)
 *   GEMINI_BASE_URL=http://127.0.0.1:5599
 */
import http from 'node:http'

const PORT = Number(process.env.FAKE_GEMINI_PORT) || 5599
const MODE = process.env.FAKE_GEMINI_MODE || 'rank'

const reasonsFor = (activity, person) => {
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
  const codes = []
  if ((person.interests || []).some((i) => same(i, activity.category))) codes.push('interest')
  if ((person.joinedBefore || []).some((h) => same(h.category, activity.category)))
    codes.push('history')
  if (person.preferredTime && same(person.preferredTime, activity.timeBand)) codes.push('time')
  if (Number.isFinite(activity.distanceKm) && activity.distanceKm <= 3) codes.push('distance')
  if (activity.similar) codes.push('behavior')
  if (activity.participants / Math.max(activity.capacity, 1) >= 0.6) codes.push('popularity')
  if (activity.daysAhead <= 1) codes.push('soon')
  if (activity.spotsLeft >= 1 && activity.spotsLeft <= 3) codes.push('spots')
  return codes.slice(0, 3)
}

function rank(body) {
  const input = typeof body.input === 'string' ? body.input : ''
  const person = JSON.parse(/PERSON: (\{.*\})\nACTIVITIES:/s.exec(input)?.[1] || '{}')
  const activities = JSON.parse(/ACTIVITIES: (\[.*\])\s*$/s.exec(input)?.[1] || '[]')
  const picks = [...activities]
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
    .slice(0, 8)
    .map((a) => ({ id: a.id, reasons: reasonsFor(a, person) }))
  return JSON.stringify({ picks })
}

const answer = (res, status, payload) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
  })
  req.on('end', () => {
    console.log(`${req.method} ${req.url} (${raw.length} bytes, mode ${MODE})`)
    if (req.method !== 'POST' || !req.url.includes('/interactions')) {
      return answer(res, 404, { error: { code: 404, message: 'not here' } })
    }
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return answer(res, 400, { error: { code: 400, message: 'bad json' } })
    }
    if (MODE === 'error') return answer(res, 503, { error: { code: 503, message: 'down' } })
    if (MODE === 'quota')
      return answer(res, 429, { error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED' } })
    const text = MODE === 'garbage' ? '{"picks": "nope"' : rank(body)
    const reply = () =>
      answer(res, 200, {
        id: `fake-${Date.now()}`,
        object: 'interaction',
        status: 'completed',
        model: body.model,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
        usage: { total_input_tokens: 1, total_output_tokens: 1, total_tokens: 2 },
      })
    if (MODE === 'slow') setTimeout(reply, 25_000)
    else reply()
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fake gemini listening on http://127.0.0.1:${PORT} (mode ${MODE})`)
})
