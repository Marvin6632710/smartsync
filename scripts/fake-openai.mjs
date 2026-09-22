#!/usr/bin/env node
/**
 * A stand-in for OpenAI, for the emulator.
 *
 * Speaks the two endpoints the chat moderator uses — `/v1/moderations`
 * and `/v1/responses` — so the whole path (composer → callable →
 * moderation → Firestore → thread) runs without a key, a bill, or a
 * single real message going to anybody's API. It does not think: it
 * looks for marker words and answers with the documented shape.
 *
 * The markers are deliberately silly, so a test fixture can be plainly
 * safe to write down and read out at an exhibition. Put one of these in
 * a message and the stand-in flags the matching category:
 *
 *   xharassx   harassment          xthreatx     harassment/threatening
 *   xhatex     hate                xsexualx     sexual
 *   xviolentx  violence/graphic    xselfharmx   self-harm/instructions
 *   xminorsx   sexual/minors       xmildx       flagged but under the floor
 *
 * A picture is "read" by its own markers: the stand-in cannot see, so
 * OPENAI_FAKE_IMAGE_TEXT is what `/v1/responses` returns as the words
 * inside every picture, and OPENAI_FAKE_IMAGE_FLAG names a category to
 * flag on the picture itself.
 *
 *   node scripts/fake-openai.mjs             # listens on 127.0.0.1:5699
 *   FAKE_OPENAI_MODE=error node …            # every call fails with 503
 *   FAKE_OPENAI_MODE=quota node …            # every call fails with 429
 *   FAKE_OPENAI_MODE=slow node …             # answers after 30 s
 *   OPENAI_FAKE_IMAGE_TEXT='xhatex' node …   # every picture "contains" that
 *
 * Then, for the Function under the emulator (functions/.secret.local and
 * functions/.env.local, both ignored by git):
 *   OPENAI_API_KEY=fake            (any non-empty value)
 *   OPENAI_BASE_URL=http://127.0.0.1:5699/v1
 */
import http from 'node:http'

const PORT = Number(process.env.FAKE_OPENAI_PORT) || 5699
const MODE = process.env.FAKE_OPENAI_MODE || 'check'
const IMAGE_TEXT = process.env.OPENAI_FAKE_IMAGE_TEXT || ''
const IMAGE_FLAG = process.env.OPENAI_FAKE_IMAGE_FLAG || ''

const CATEGORIES = [
  'harassment',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'illicit',
  'illicit/violent',
  'self-harm',
  'self-harm/instructions',
  'self-harm/intent',
  'sexual',
  'sexual/minors',
  'violence',
  'violence/graphic',
]

const MARKERS = [
  ['xharassx', 'harassment', 0.92],
  ['xthreatx', 'harassment/threatening', 0.88],
  ['xhatex', 'hate', 0.9],
  ['xsexualx', 'sexual', 0.95],
  ['xviolentx', 'violence/graphic', 0.87],
  ['xselfharmx', 'self-harm/instructions', 0.84],
  ['xminorsx', 'sexual/minors', 0.99],
  // Flagged by the API but under SmartSync's floor: the case that proves
  // a low-confidence flag does not block a message on its own.
  ['xmildx', 'harassment', 0.12],
]

const blank = () => Object.fromEntries(CATEGORIES.map((name) => [name, false]))
const zeros = () => Object.fromEntries(CATEGORIES.map((name) => [name, 0]))

function moderationResult({ text, hasImage }) {
  const categories = blank()
  const scores = zeros()
  const applied = Object.fromEntries(CATEGORIES.map((name) => [name, []]))
  const haystack = String(text || '').toLowerCase()
  for (const [marker, name, score] of MARKERS) {
    if (!haystack.includes(marker)) continue
    categories[name] = true
    // The strongest marker wins, so a message carrying both a real one
    // and the deliberately-mild one still reads as the real one.
    scores[name] = Math.max(scores[name], score)
    applied[name] = ['text']
  }
  if (hasImage && IMAGE_FLAG && CATEGORIES.includes(IMAGE_FLAG)) {
    categories[IMAGE_FLAG] = true
    scores[IMAGE_FLAG] = 0.93
    applied[IMAGE_FLAG] = ['image']
  }
  return {
    flagged: Object.values(categories).some(Boolean),
    categories,
    category_scores: scores,
    category_applied_input_types: applied,
  }
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
  req.on('end', async () => {
    console.log(`${req.method} ${req.url} (${raw.length} bytes, mode ${MODE})`)
    if (req.method !== 'POST') return answer(res, 404, { error: { message: 'not here' } })
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return answer(res, 400, { error: { message: 'bad json' } })
    }
    if (MODE === 'error') return answer(res, 503, { error: { message: 'down' } })
    if (MODE === 'quota') return answer(res, 429, { error: { message: 'slow down' } })
    if (MODE === 'slow') await new Promise((done) => setTimeout(done, 30_000))

    if (req.url.includes('/moderations')) {
      const input = Array.isArray(body.input) ? body.input : [{ type: 'text', text: body.input }]
      const text = input
        .filter((part) => part?.type === 'text')
        .map((part) => part.text)
        .join(' ')
      const hasImage = input.some((part) => part?.type === 'image_url')
      return answer(res, 200, {
        id: 'modr-fake',
        model: body.model,
        results: [moderationResult({ text, hasImage })],
      })
    }

    if (req.url.includes('/responses')) {
      // The transcription of whatever picture it was handed.
      return answer(res, 200, {
        id: 'resp-fake',
        model: body.model,
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: IMAGE_TEXT }],
          },
        ],
        usage: { total_tokens: 42 },
      })
    }
    return answer(res, 404, { error: { message: 'not here' } })
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fake OpenAI on http://127.0.0.1:${PORT} (mode ${MODE})`)
  if (IMAGE_TEXT) console.log(`  every picture "reads" as: ${IMAGE_TEXT}`)
})
