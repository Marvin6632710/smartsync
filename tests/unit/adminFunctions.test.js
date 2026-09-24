import { describe, expect, test } from 'vitest'

import {
  performAnnouncementAction,
  performContentAction,
  performSecurityAction,
  resolveAppeal,
  submitAppeal,
  suspensionActive,
} from '../../functions/lib/admin.js'

const DELETE = Symbol('delete')
const FieldValue = {
  delete: () => DELETE,
  serverTimestamp: () => 1234,
}

const setPath = (target, path, value) => {
  const parts = path.split('.')
  let at = target
  for (const part of parts.slice(0, -1)) at = at[part] ||= {}
  if (value === DELETE) delete at[parts.at(-1)]
  else at[parts.at(-1)] = value
}

class MemoryDb {
  constructor(rows = {}) {
    this.rows = new Map(Object.entries(rows))
    this.serial = 0
  }
  doc(path) {
    return {
      path,
      id: path.split('/').at(-1),
      get: async () => this.snapshot(path),
      set: async (data, options) => this.write(path, data, options),
      update: async (data) => this.write(path, data, { merge: true }),
    }
  }
  collection(path) {
    return {
      doc: () => this.doc(`${path}/id${++this.serial}`),
      where: () => ({ get: async () => ({ docs: [] }) }),
    }
  }
  snapshot(path) {
    return {
      exists: this.rows.has(path),
      data: () => this.rows.get(path),
    }
  }
  write(path, data, options) {
    const next = options?.merge ? { ...(this.rows.get(path) || {}) } : {}
    for (const [key, value] of Object.entries(data)) setPath(next, key, value)
    this.rows.set(path, next)
  }
  batch() {
    const actions = []
    return {
      set: (ref, data, options) => actions.push(() => this.write(ref.path, data, options)),
      update: (ref, data) => actions.push(() => this.write(ref.path, data, { merge: true })),
      delete: (ref) => actions.push(() => this.rows.delete(ref.path)),
      commit: async () => actions.forEach((action) => action()),
    }
  }
  runTransaction(fn) {
    const batch = this.batch()
    return fn({ ...batch, get: async (ref) => this.snapshot(ref.path) }).then(async (result) => {
      await batch.commit()
      return result
    })
  }
}

describe('timed suspension state', () => {
  test('expires at its deadline while an indefinite suspension stays active', () => {
    expect(suspensionActive({ suspended: true }, 100)).toBe(true)
    expect(suspensionActive({ suspended: true, suspendedUntil: 101 }, 100)).toBe(true)
    expect(suspensionActive({ suspended: true, suspendedUntil: 100 }, 100)).toBe(false)
    expect(suspensionActive({ suspended: false, suspendedUntil: 999 }, 100)).toBe(false)
  })
})

describe('trusted content moderation', () => {
  test('removes and restores a bio while preserving the original in the server vault', async () => {
    const db = new MemoryDb({
      'roles/admin': { role: 'admin', suspended: false },
      'roles/alice': { role: 'user', suspended: false },
      'users/alice': { uid: 'alice', username: '@alice', bio: 'Original bio' },
    })
    await expect(
      performContentAction({
        db,
        FieldValue,
        adminId: 'admin',
        data: { action: 'remove-profile', targetId: 'alice', field: 'bio', reason: 'Unsafe' },
      }),
    ).resolves.toEqual({ status: 'removed' })
    expect(db.rows.get('users/alice').bio).toBe('')
    expect(db.rows.get('users/alice').contentModeration.bio.active).toBe(true)
    expect([...db.rows.keys()].some((path) => path.startsWith('moderationVault/'))).toBe(true)

    await expect(
      performContentAction({
        db,
        FieldValue,
        adminId: 'admin',
        data: {
          action: 'restore-profile',
          targetId: 'alice',
          field: 'bio',
          reason: 'Appeal accepted',
        },
      }),
    ).resolves.toEqual({ status: 'restored' })
    expect(db.rows.get('users/alice').bio).toBe('Original bio')
    expect(db.rows.get('users/alice').contentModeration.bio).toBeUndefined()
  })

  test('refuses self-action and an action without a reason', async () => {
    const db = new MemoryDb({ 'roles/admin': { role: 'admin', suspended: false } })
    await expect(
      performContentAction({
        db,
        FieldValue,
        adminId: 'admin',
        data: { action: 'remove-profile', targetId: 'admin', field: 'bio', reason: 'x' },
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(
      performContentAction({
        db,
        FieldValue,
        adminId: 'admin',
        data: { action: 'remove-profile' },
      }),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })
})

describe('official announcements', () => {
  test('publishes a bounded announcement and writes an audit entry', async () => {
    const db = new MemoryDb({ 'roles/admin': { role: 'admin', suspended: false } })
    const result = await performAnnouncementAction({
      db,
      FieldValue,
      adminId: 'admin',
      data: {
        action: 'publish',
        title: 'Campus update',
        body: 'The meetup point changed.',
        audience: 'participants',
        expiresAt: Date.now() + 60_000,
      },
    })
    expect(result.status).toBe('published')
    expect(db.rows.get(`announcements/${result.id}`).audience).toBe('participants')
    expect(
      [...db.rows.entries()].some(
        ([path, row]) => path.startsWith('moderationLog/') && row.kind === 'announcement-publish',
      ),
    ).toBe(true)
  })
})

describe('moderation appeals', () => {
  test('does not let another decision overlap an active review lease', async () => {
    const db = new MemoryDb({
      'roles/admin': { role: 'admin', suspended: false },
      'roles/alice': { role: 'user', suspended: true, suspendedAt: 111 },
      'moderationAppeals/appeal1': {
        subjectId: 'alice',
        kind: 'suspension',
        targetId: 'alice',
        actionToken: '111',
        status: 'reviewing',
        reviewingBy: 'another-admin',
        reviewingAt: Date.now(),
        reviewToken: 'active-review',
      },
    })

    await expect(
      resolveAppeal({
        db,
        FieldValue,
        adminId: 'admin',
        data: { appealId: 'appeal1', decision: 'reverse', reason: 'Reviewed' },
      }),
    ).resolves.toEqual({ status: 'reviewing' })

    expect(db.rows.get('roles/alice').suspended).toBe(true)
    expect(db.rows.get('moderationAppeals/appeal1').reviewToken).toBe('active-review')
  })

  test('an old appeal cannot reverse a later suspension on the same account', async () => {
    const db = new MemoryDb({
      'roles/admin': { role: 'admin', suspended: false },
      'roles/alice': { role: 'user', suspended: true, suspendedAt: 111 },
    })
    const submitted = await submitAppeal({
      db,
      FieldValue,
      uid: 'alice',
      data: {
        kind: 'suspension',
        targetId: 'alice',
        detail: 'This suspension should be reviewed.',
      },
    })
    expect(db.rows.get(`moderationAppeals/${submitted.id}`).actionToken).toBe('111')

    // The first suspension ended and a different decision followed before
    // the appeal was reviewed.
    db.rows.set('roles/alice', { role: 'user', suspended: true, suspendedAt: 222 })
    await expect(
      resolveAppeal({
        db,
        FieldValue,
        adminId: 'admin',
        data: { appealId: submitted.id, decision: 'reverse', reason: 'Reviewed' },
      }),
    ).resolves.toEqual({ status: 'reversed' })

    expect(db.rows.get('roles/alice').suspended).toBe(true)
    expect(db.rows.get('roles/alice').suspendedAt).toBe(222)
    expect(db.rows.get(`moderationAppeals/${submitted.id}`).status).toBe('reversed')
  })
})

describe('account security actions', () => {
  test('sends a password reset through the trusted identity endpoint without returning the email', async () => {
    const db = new MemoryDb({
      'roles/admin': { role: 'admin', suspended: false },
      'roles/alice': { role: 'user', suspended: false },
    })
    const calls = []
    const result = await performSecurityAction({
      db,
      FieldValue,
      adminId: 'admin',
      projectId: 'project',
      auth: { getUser: async () => ({ email: 'alice@example.com' }) },
      credential: { getAccessToken: async () => ({ access_token: 'server-token' }) },
      fetchImpl: async (url, options) => {
        calls.push({ url, options })
        return { ok: true }
      },
      data: { action: 'send-password-reset', targetId: 'alice', reason: 'Owner request' },
    })
    expect(result).toEqual({ status: 'sent' })
    expect(JSON.parse(calls[0].options.body).email).toBe('alice@example.com')
    expect(JSON.stringify(result)).not.toContain('alice@example.com')

    const emulatorCalls = []
    await expect(
      performSecurityAction({
        db,
        FieldValue,
        adminId: 'admin',
        projectId: 'demo-smartsync',
        auth: { getUser: async () => ({ email: 'alice@example.com' }) },
        credential: { getAccessToken: async () => Promise.reject(new Error('must not run')) },
        authEmulatorHost: '127.0.0.1:9099',
        fetchImpl: async (url, options) => {
          emulatorCalls.push({ url, options })
          return { ok: true }
        },
        data: { action: 'send-password-reset', targetId: 'alice', reason: 'Local review' },
      }),
    ).resolves.toEqual({ status: 'sent' })
    expect(emulatorCalls[0].url).toContain('127.0.0.1:9099/identitytoolkit.googleapis.com')
    expect(emulatorCalls[0].options.headers.Authorization).toBeUndefined()
  })
})
