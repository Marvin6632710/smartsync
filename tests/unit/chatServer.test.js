/**
 * The path a chat message takes on the server, over a Firestore small
 * enough to hold in a Map.
 *
 * The claim these tests exist to check is a single sentence: **nothing
 * that has not been approved is ever written anywhere another person can
 * read it** — not the thread, not a picture document, not a notification,
 * and so not an unread count or a push either. Most of what follows is
 * that sentence, from a different angle each time.
 */
import { describe, expect, test, vi } from 'vitest'

import {
  checkParts,
  DEFAULT_USER_CAP,
  gate,
  rateWindow,
  RETENTION_DAYS,
  resolveBlock,
  sendChatMessage,
} from '../../functions/lib/sendChat'
import { ModerationError } from '../../functions/lib/openai'
import { CATEGORIES } from '../../functions/lib/moderation'

const NOW = Date.UTC(2026, 8, 22, 12, 0, 0)
const DAY = 86_400_000
const PNG = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]).toString('base64')}`

const clean = () => {
  const categories = {}
  const scores = {}
  for (const name of Object.keys(CATEGORIES)) {
    categories[name] = false
    scores[name] = 0
  }
  return { flagged: false, categories, category_scores: scores }
}
const flagged = (name, score = 0.9) => {
  const out = clean()
  out.flagged = true
  out.categories[name] = true
  out.category_scores[name] = score
  return out
}

/** Firestore, as much of it as this code touches. */
function fakeDb(initial = {}) {
  const docs = new Map(Object.entries(initial))
  const write = (path, data, opts) => {
    const next = opts?.merge ? { ...(docs.get(path) || {}), ...data } : { ...data }
    for (const [key, value] of Object.entries(next)) {
      if (value === DELETE) delete next[key]
    }
    docs.set(path, next)
  }
  const doc = (path) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data, opts) => write(path, data, opts),
  })
  const snapshot = (path) => ({ exists: docs.has(path), data: () => docs.get(path) })
  return {
    docs,
    doc,
    getAll: vi.fn(async (...refs) => refs.map((ref) => snapshot(ref.path))),
    batch: () => {
      const queued = []
      return {
        set: (ref, data, opts) => queued.push([ref.path, data, opts]),
        commit: async () => queued.forEach(([path, data, opts]) => write(path, data, opts)),
      }
    },
    runTransaction: async (fn) =>
      fn({
        getAll: async (...refs) => refs.map((ref) => ({ data: () => docs.get(ref.path) })),
        set: (ref, data, opts) => write(ref.path, data, opts),
      }),
  }
}
const DELETE = Symbol('delete')
const FieldValue = { serverTimestamp: () => 'ts', delete: () => DELETE }
const quiet = { info: () => {}, warn: () => {} }

const world = (extra = {}) =>
  fakeDb({
    'activities/a1': { participantUids: ['me', 'you', 'third'], startsAt: NOW + DAY, title: 'Futsal' },
    'users/me': { name: 'Maya', avatar: 'MR' },
    ...extra,
  })
const base = (db, openai, request = {}) => ({
  db,
  FieldValue,
  uid: 'me',
  openai,
  now: NOW,
  log: quiet,
  request: { activityId: 'a1', clientMsgId: 'm1', text: 'see you at 7', image: null, ...request },
})
const passing = () => ({ moderate: vi.fn(async () => clean()), readImageText: vi.fn(async () => '') })

describe('the gate, which is now the rule', () => {
  test('a participant inside the window may write', async () => {
    const out = await gate({ db: world(), uid: 'me', activityId: 'a1', now: NOW })
    expect(out.ok).toBe(true)
    expect(out.participants).toEqual(['me', 'you', 'third'])
  })

  test('everything the old rule refused is refused here', async () => {
    const db = world()
    expect((await gate({ db, uid: 'stranger', activityId: 'a1', now: NOW })).status).toBe(
      'not-allowed',
    )
    expect((await gate({ db, uid: 'me', activityId: 'gone', now: NOW })).status).toBe('not-found')
    const late = NOW + (RETENTION_DAYS + 2) * DAY
    expect((await gate({ db, uid: 'me', activityId: 'a1', now: late })).status).toBe('closed')
    const suspended = world({ 'roles/me': { role: 'user', suspended: true } })
    expect((await gate({ db: suspended, uid: 'me', activityId: 'a1', now: NOW })).status).toBe(
      'not-allowed',
    )
    const closed = world({ 'roles/me': { role: 'user', banned: true } })
    expect((await gate({ db: closed, uid: 'me', activityId: 'a1', now: NOW })).status).toBe(
      'not-allowed',
    )
  })
})

describe('sending', () => {
  test('an approved message is written once, with its notifications', async () => {
    const db = world()
    const openai = passing()
    const out = await sendChatMessage(base(db, openai))
    expect(out).toEqual({ status: 'sent', id: 'm1' })
    expect(openai.moderate).toHaveBeenCalledWith({ text: 'see you at 7' })
    expect(db.getAll).toHaveBeenCalledTimes(1)
    expect(db.getAll.mock.calls[0].map((ref) => ref.path)).toEqual([
      'activities/a1/messages/m1',
      'activities/a1',
      'roles/me',
      'users/me',
    ])
    expect(db.docs.get('activities/a1/messages/m1')).toMatchObject({
      senderId: 'me',
      senderName: 'Maya',
      text: 'see you at 7',
      hasImage: false,
    })
    // Everybody on the roster but the sender, in the ten-minute bucket.
    const notes = [...db.docs.keys()].filter((path) => path.includes('/notifications/'))
    expect(notes).toHaveLength(2)
    expect(notes[0]).toMatch(/^users\/(you|third)\/notifications\/chat-a1-\d+$/)
    expect(db.docs.get(notes[0])).toMatchObject({ type: 'chat', read: false, activityId: 'a1' })
  })

  test('a picture is checked as a picture and as the words inside it', async () => {
    const db = world()
    const openai = {
      moderate: vi.fn(async () => clean()),
      readImageText: vi.fn(async () => 'FREE PIZZA FRIDAY'),
    }
    const out = await sendChatMessage(base(db, openai, { text: 'look', image: { dataUrl: PNG } }))
    expect(out.status).toBe('sent')
    // Three calls: the text, the picture, and the picture's words — the
    // last because hate and harassment are text-only categories.
    expect(openai.moderate.mock.calls.map(([arg]) => Object.keys(arg)[0])).toEqual([
      'text',
      'imageDataUrl',
      'text',
    ])
    expect(openai.moderate.mock.calls[2][0].text).toBe('FREE PIZZA FRIDAY')
    expect(db.docs.get('activities/a1/messages/m1')).toMatchObject({ hasImage: true })
    expect(db.docs.get('chatPictures/m1')).toMatchObject({ activityId: 'a1', senderId: 'me' })
  })

  test('independent picture checks start together, then keep their source order', async () => {
    const deferred = () => {
      let resolve
      const promise = new Promise((done) => {
        resolve = done
      })
      return { promise, resolve }
    }
    const typed = deferred()
    const picture = deferred()
    const transcription = deferred()
    const transcribedText = deferred()
    const openai = {
      moderate: vi.fn((input) => {
        if (input.imageDataUrl) return picture.promise
        if (input.text === 'FREE PIZZA FRIDAY') return transcribedText.promise
        return typed.promise
      }),
      readImageText: vi.fn(() => transcription.promise),
    }

    const checking = checkParts({
      openai,
      text: 'look',
      image: { dataUrl: PNG },
      ocr: true,
      log: quiet,
    })

    await Promise.resolve()
    expect(openai.moderate).toHaveBeenCalledTimes(2)
    expect(openai.readImageText).toHaveBeenCalledTimes(1)

    typed.resolve(clean())
    picture.resolve(clean())
    transcription.resolve('FREE PIZZA FRIDAY')
    await vi.waitFor(() => expect(openai.moderate).toHaveBeenCalledTimes(3))
    transcribedText.resolve(clean())

    await expect(checking).resolves.toEqual([
      { source: 'text', result: clean() },
      { source: 'image', result: clean() },
      { source: 'image-text', result: clean() },
    ])
  })

  test('a refused message reaches nobody, anywhere', async () => {
    const db = world()
    const openai = { moderate: vi.fn(async () => flagged('harassment')), readImageText: vi.fn() }
    const out = await sendChatMessage(base(db, openai, { text: 'nasty thing' }))
    expect(out).toMatchObject({ status: 'blocked', reason: 'harassment', source: 'text' })
    // The whole claim, in four lines.
    expect(db.docs.has('activities/a1/messages/m1')).toBe(false)
    expect(db.docs.has('chatPictures/m1')).toBe(false)
    expect([...db.docs.keys()].some((path) => path.includes('/notifications/'))).toBe(false)
    // Held for review, where only an admin can read it.
    expect(db.docs.get('moderationBlocks/m1')).toMatchObject({
      uid: 'me',
      reason: 'harassment',
      status: 'blocked',
      contentHeld: true,
      text: 'nasty thing',
    })
  })

  test('a picture blocked by its own content is not kept in the thread', async () => {
    const db = world()
    const openai = {
      moderate: vi.fn(async (arg) => ('imageDataUrl' in arg ? flagged('sexual') : clean())),
      readImageText: vi.fn(async () => ''),
    }
    const out = await sendChatMessage(base(db, openai, { text: 'look', image: { dataUrl: PNG } }))
    expect(out).toMatchObject({ status: 'blocked', reason: 'sexual', source: 'image' })
    expect(db.docs.has('chatPictures/m1')).toBe(false)
    expect(db.docs.get('moderationBlocks/m1').hasImage).toBe(true)
  })

  test('a child-safety flag keeps nothing at all', async () => {
    const db = world()
    const openai = {
      moderate: vi.fn(async () => flagged('sexual/minors')),
      readImageText: vi.fn(async () => ''),
    }
    const out = await sendChatMessage(base(db, openai, { text: 'x', image: { dataUrl: PNG } }))
    expect(out).toMatchObject({ status: 'blocked', severe: true })
    const record = db.docs.get('moderationBlocks/m1')
    expect(record).toMatchObject({ severe: true, status: 'severe', contentHeld: false })
    // No copy of the message, and no copy of the picture. The provider is
    // explicit that its API is not a detector for this, and this code
    // makes no claim to be one either: it raises a flag and keeps
    // nothing.
    expect(record.text).toBeUndefined()
    expect(record.dataUrl).toBeUndefined()
  })

  test('the same send twice is one message', async () => {
    const db = world()
    const openai = passing()
    await sendChatMessage(base(db, openai))
    const again = await sendChatMessage(base(db, openai))
    expect(again).toEqual({ status: 'sent', id: 'm1', duplicate: true })
    // The second attempt costs nothing: no second call, no second write.
    expect(openai.moderate).toHaveBeenCalledTimes(1)
    expect([...db.docs.keys()].filter((p) => p.startsWith('activities/a1/messages/'))).toHaveLength(
      1,
    )
  })

  test('a landed retry is confirmed before a missing activity or blocked role is judged', async () => {
    const db = fakeDb({
      'activities/a1/messages/m1': { senderId: 'me', text: 'already there' },
      'roles/me': { suspended: true },
    })
    const openai = passing()
    const out = await sendChatMessage(base(db, openai))

    expect(out).toEqual({ status: 'sent', id: 'm1', duplicate: true })
    expect(openai.moderate).not.toHaveBeenCalled()
    expect(db.docs.has('chatModeration/me')).toBe(false)
    expect(db.docs.has('chatModerationUsage/2026-09-22')).toBe(false)
  })

  test('the preflight falls back to parallel document reads without getAll', async () => {
    const db = world()
    delete db.getAll

    const out = await sendChatMessage(base(db, passing()))

    expect(out).toEqual({ status: 'sent', id: 'm1' })
    expect(db.docs.get('activities/a1/messages/m1')).toMatchObject({ senderName: 'Maya' })
  })

  test('a moderation failure keeps the message with its author', async () => {
    const db = world()
    const openai = {
      moderate: vi.fn(async () => {
        throw new ModerationError('unavailable', 'down', 503)
      }),
      readImageText: vi.fn(),
    }
    const out = await sendChatMessage(base(db, openai))
    expect(out).toEqual({ status: 'unavailable', reason: 'unavailable' })
    expect(db.docs.has('activities/a1/messages/m1')).toBe(false)
    expect(db.docs.has('moderationBlocks/m1')).toBe(false)
  })

  test('no key configured is not permission to deliver', async () => {
    const db = world()
    const out = await sendChatMessage({ ...base(db, null) })
    expect(out).toEqual({ status: 'unavailable', reason: 'not-configured' })
    expect(db.docs.has('activities/a1/messages/m1')).toBe(false)
  })

  test('a picture whose words cannot be read still goes, and says so in the log', async () => {
    const db = world()
    const warn = vi.fn()
    const openai = {
      moderate: vi.fn(async () => clean()),
      readImageText: vi.fn(async () => {
        throw new ModerationError('unavailable', 'vision down')
      }),
    }
    const out = await sendChatMessage({
      ...base(db, openai, { image: { dataUrl: PNG } }),
      log: { info: () => {}, warn },
    })
    // The picture itself was moderated; only the transcription failed.
    expect(out.status).toBe('sent')
    expect(warn).toHaveBeenCalledWith('chat image text unread', expect.any(Object))
  })

  test('the hour has a limit, and it is not a reason to skip the check', async () => {
    const db = world()
    const openai = passing()
    for (let i = 0; i < DEFAULT_USER_CAP; i += 1) {
      const out = await sendChatMessage(base(db, openai, { clientMsgId: `m${i}` }))
      expect(out.status).toBe('sent')
    }
    const refused = await sendChatMessage(base(db, openai, { clientMsgId: 'one-too-many' }))
    expect(refused.status).toBe('rate-limited')
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
    expect(db.docs.has('activities/a1/messages/one-too-many')).toBe(false)
  })

  test('the day has a limit too', async () => {
    const db = world()
    const out = await sendChatMessage({ ...base(db, passing()), caps: { daily: 0 } })
    expect(out.status).toBe('rate-limited')
  })

  test('a window that is missing or nonsense starts a new one', () => {
    expect(rateWindow(undefined, NOW, { perWindow: 2 }).allowed).toBe(true)
    expect(rateWindow({ start: 'nonsense', count: 99 }, NOW, { perWindow: 2 }).allowed).toBe(true)
    expect(rateWindow({ start: NOW, count: 2 }, NOW, { perWindow: 2 }).allowed).toBe(false)
  })

  test('nobody may write into a thread they are not in', async () => {
    const db = world()
    const openai = passing()
    const out = await sendChatMessage({ ...base(db, openai), uid: 'stranger' })
    expect(out).toEqual({ status: 'not-allowed' })
    // Refused before a single token was spent on it.
    expect(openai.moderate).not.toHaveBeenCalled()
  })
})

describe('appeals', () => {
  const blocked = (extra = {}) => ({
    uid: 'me',
    senderName: 'Maya',
    activityId: 'a1',
    reason: 'harassment',
    status: 'blocked',
    contentHeld: true,
    text: 'the message',
    hasImage: false,
    ...extra,
  })

  test('overturning posts the message and deletes the held copy', async () => {
    const db = world({ 'moderationBlocks/b1': blocked() })
    const out = await resolveBlock({
      db,
      FieldValue,
      adminId: 'admin',
      blockId: 'b1',
      decision: 'overturn',
      now: NOW,
    })
    expect(out).toEqual({ status: 'overturned' })
    expect(db.docs.get('activities/a1/messages/b1')).toMatchObject({
      senderId: 'me',
      text: 'the message',
      releasedBy: 'admin',
    })
    const record = db.docs.get('moderationBlocks/b1')
    expect(record).toMatchObject({ status: 'overturned', reviewedBy: 'admin', contentHeld: false })
    expect(record.text).toBeUndefined()
  })

  test('a picture comes back with it', async () => {
    const db = world({
      'moderationBlocks/b1': blocked({ hasImage: true, dataUrl: PNG, text: '' }),
    })
    await resolveBlock({ db, FieldValue, adminId: 'admin', blockId: 'b1', decision: 'overturn' })
    expect(db.docs.get('chatPictures/b1')).toMatchObject({ activityId: 'a1', senderId: 'me' })
    expect(db.docs.get('moderationBlocks/b1').dataUrl).toBeUndefined()
  })

  test('upholding sends nothing', async () => {
    const db = world({ 'moderationBlocks/b1': blocked() })
    const out = await resolveBlock({
      db,
      FieldValue,
      adminId: 'admin',
      blockId: 'b1',
      decision: 'uphold',
      now: NOW,
    })
    expect(out).toEqual({ status: 'upheld' })
    expect(db.docs.has('activities/a1/messages/b1')).toBe(false)
    expect(db.docs.get('moderationBlocks/b1')).toMatchObject({ status: 'upheld' })
  })

  test('a child-safety flag cannot be posted by anybody, admin included', async () => {
    const db = world({
      'moderationBlocks/b1': blocked({ severe: true, status: 'severe', contentHeld: false }),
    })
    const out = await resolveBlock({
      db,
      FieldValue,
      adminId: 'admin',
      blockId: 'b1',
      decision: 'overturn',
    })
    expect(out).toEqual({ status: 'no-content' })
    expect(db.docs.has('activities/a1/messages/b1')).toBe(false)
  })

  test('answering twice does not post twice', async () => {
    const db = world({ 'moderationBlocks/b1': blocked() })
    await resolveBlock({ db, FieldValue, adminId: 'a', blockId: 'b1', decision: 'overturn' })
    const again = await resolveBlock({
      db,
      FieldValue,
      adminId: 'a',
      blockId: 'b1',
      decision: 'overturn',
    })
    expect(again).toEqual({ status: 'already-resolved' })
  })

  test('a message cannot be released into a thread that has since closed', async () => {
    const db = world({ 'moderationBlocks/b1': blocked() })
    const out = await resolveBlock({
      db,
      FieldValue,
      adminId: 'a',
      blockId: 'b1',
      decision: 'overturn',
      now: NOW + (RETENTION_DAYS + 2) * DAY,
    })
    expect(out).toEqual({ status: 'closed' })
    expect(db.docs.has('activities/a1/messages/b1')).toBe(false)
  })

  test('an appeal about nothing is nothing', async () => {
    const db = world()
    expect(
      await resolveBlock({ db, FieldValue, adminId: 'a', blockId: 'nope', decision: 'uphold' }),
    ).toEqual({ status: 'not-found' })
  })
})
