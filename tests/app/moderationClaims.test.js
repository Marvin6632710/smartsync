/**
 * Working a report is claim, act, record — and the action reads the claim
 * in the same transaction that writes its consequence.
 *
 * Firestore is faked with an in-memory store whose transactions read and
 * write it, so these pin the client's half of the contract: what is thrown
 * when, what is written under which claim, and that a lost claim aborts
 * before anything changes. The rules' half is in tests/rules.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const store = new Map()
const writes = []
const notices = []
let minted = 0
const apply = (path, data, merge = true) => {
  const next = merge ? { ...store.get(path) } : {}
  for (const [key, value] of Object.entries(data)) {
    if (value === 'DELETE') delete next[key]
    else next[key] = value
  }
  store.set(path, next)
}
// A transaction's writes are staged and applied together after the body
// returns — the way Firestore commits them — so a body that throws leaves
// nothing behind, and a test can see that two writes land as one.
let staged = []
const tx = {
  get: async (ref) => ({ exists: () => store.has(ref.path), data: () => store.get(ref.path) }),
  update: (ref, data) => staged.push({ path: ref.path, data, merge: true }),
  set: (ref, data, options) =>
    staged.push({ path: ref.path, data, merge: Boolean(options?.merge) }),
}
const runTransaction = vi.fn(async (_db, fn) => {
  staged = []
  const result = await fn(tx)
  for (const write of staged) {
    writes.push({ path: write.path, data: write.data })
    apply(write.path, write.data, write.merge)
  }
  staged = []
  return result
})
const updateDoc = vi.fn(async (ref, data) => {
  writes.push({ path: ref.path, data })
  apply(ref.path, data)
})
const addDoc = vi.fn(async (ref, data) => {
  if (ref.path === 'warnings') {
    store.set(`warnings/w${++minted}`, data)
    return { id: `w${minted}` }
  }
  notices.push({ path: ref.path, ...data })
  return { id: `n${notices.length}` }
})
vi.mock('firebase/firestore', () => ({
  addDoc,
  collection: (_db, ...path) => ({ path: path.join('/'), isCollection: true }),
  deleteDoc: vi.fn(),
  deleteField: () => 'DELETE',
  doc: (first, ...path) =>
    first?.isCollection ? { path: `${first.path}/m${++minted}` } : { path: path.join('/') },
  getDocs: vi.fn(async () => ({ docs: [] })),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction,
  serverTimestamp: () => 'server-time',
  setDoc: vi.fn(),
  updateDoc,
  where: vi.fn(),
}))
vi.mock('../../src/firebase/config', () => ({ db: {}, auth: { currentUser: null } }))
const reportError = vi.fn()
vi.mock('../../src/utils/reportError', () => ({ reportError }))

const {
  CLAIM_TTL_MS,
  claimReport,
  claimedByOther,
  issueWarning,
  releaseReport,
  removeActivity,
  suspendAccount,
} = await import('../../src/firebase/moderation')

const fresh = (by) => ({ by, at: { toMillis: () => Date.now() - 1000 } })
const stale = (by) => ({ by, at: { toMillis: () => Date.now() - CLAIM_TTL_MS - 1000 } })
const code = (promise) =>
  promise.then(
    () => 'ok',
    (error) => error.code,
  )

beforeEach(() => {
  store.clear()
  writes.length = 0
  notices.length = 0
  reportError.mockClear()
  runTransaction.mockClear()
  store.set('reports/r1', {
    status: 'open',
    reporterId: 'bob',
    targetId: 'alice',
    subjectId: 'alice',
  })
  store.set('activities/a1', {
    title: 'Football',
    status: 'active',
    hostId: 'alice',
    participantUids: ['alice', 'p1'],
  })
})

describe('claimReport', () => {
  test('takes an unclaimed open report', async () => {
    await claimReport('r1', 'mod')
    expect(store.get('reports/r1').claim).toEqual({ by: 'mod', at: 'server-time' })
  })

  test('renews your own claim, fresh or stale', async () => {
    store.get('reports/r1').claim = stale('mod')
    await expect(code(claimReport('r1', 'mod'))).resolves.toBe('ok')
  })

  test('is held while somebody else’s claim is fresh', async () => {
    store.get('reports/r1').claim = fresh('other')
    await expect(code(claimReport('r1', 'mod'))).resolves.toBe('claim-held')
    expect(writes).toHaveLength(0)
  })

  test('takes over a stale claim', async () => {
    store.get('reports/r1').claim = stale('other')
    await claimReport('r1', 'mod')
    expect(store.get('reports/r1').claim.by).toBe('mod')
  })

  test('a claim whose server time has not resolved counts as fresh', async () => {
    store.get('reports/r1').claim = { by: 'other', at: null }
    await expect(code(claimReport('r1', 'mod'))).resolves.toBe('claim-held')
  })

  test('a closed or missing report is already handled — and says by whom', async () => {
    store.get('reports/r1').status = 'dismissed'
    store.get('reports/r1').reviewedBy = 'other'
    await expect(code(claimReport('r1', 'mod'))).resolves.toBe('already-handled')
    await expect(claimReport('r1', 'mod')).rejects.toMatchObject({
      details: { reviewedBy: 'other' },
    })
    store.delete('reports/r1')
    await expect(claimReport('r1', 'mod')).rejects.toMatchObject({
      code: 'already-handled',
      details: { reviewedBy: null },
    })
  })
})

describe('the decision, recorded with the action', () => {
  const decision = { status: 'actioned', outcome: 'Account suspended' }

  test('a suspension from the queue writes the role row and the decision in one transaction', async () => {
    await claimReport('r1', 'mod')
    await suspendAccount('alice', { adminId: 'mod', reportId: 'r1', decision })
    expect(store.get('roles/alice')).toMatchObject({ suspended: true })
    expect(store.get('reports/r1')).toMatchObject({
      status: 'actioned',
      outcome: 'Account suspended',
      reviewedBy: 'mod',
      reviewedAt: 'server-time',
    })
    // All three writes came out of the same transaction call: the row, the
    // decision, and the log entry naming the report it was taken under.
    const roleWrite = writes.findIndex((w) => w.path === 'roles/alice')
    const decisionWrite = writes.findIndex((w) => w.path === 'reports/r1' && w.data.status)
    const logWrite = writes.findIndex((w) => w.path.startsWith('moderationLog/'))
    expect(roleWrite).toBeGreaterThanOrEqual(0)
    expect(decisionWrite).toBe(roleWrite + 1)
    expect(logWrite).toBe(roleWrite + 2)
    expect(writes[logWrite].data).toMatchObject({
      kind: 'suspend',
      by: 'mod',
      subjectId: 'alice',
      reportId: 'r1',
    })
    expect(runTransaction).toHaveBeenCalledTimes(2) // the claim, then act-and-record
  })

  test('a lost claim leaves neither the role row nor the decision behind', async () => {
    store.get('reports/r1').claim = fresh('other')
    await expect(
      code(suspendAccount('alice', { adminId: 'mod', reportId: 'r1', decision })),
    ).resolves.toBe('claim-lost')
    expect(store.has('roles/alice')).toBe(false)
    expect(store.get('reports/r1').status).toBe('open')
    expect(writes).toHaveLength(0)
  })

  test('a takedown from the queue records its decision, even when the activity was already down', async () => {
    await claimReport('r1', 'mod')
    store.get('activities/a1').status = 'removed'
    await removeActivity('a1', {
      adminId: 'mod',
      reason: 'spam',
      reportId: 'r1',
      decision: { status: 'actioned', outcome: 'Activity removed' },
    })
    expect(store.get('reports/r1')).toMatchObject({ status: 'actioned', reviewedBy: 'mod' })
    // Nothing was re-removed and nobody was told again.
    expect(writes.filter((w) => w.path === 'activities/a1')).toHaveLength(0)
    expect(notices).toHaveLength(0)
  })

  test('a takedown from the queue on a standing activity lands both halves together', async () => {
    await claimReport('r1', 'mod')
    await removeActivity('a1', {
      adminId: 'mod',
      reason: 'spam',
      reportId: 'r1',
      decision: { status: 'actioned', outcome: 'Activity removed' },
    })
    expect(store.get('activities/a1').status).toBe('removed')
    expect(store.get('reports/r1').status).toBe('actioned')
    expect(notices.map((n) => n.path)).toEqual([
      'users/alice/notifications',
      'users/p1/notifications',
    ])
    // And the record, in the same transaction, naming the report.
    const entry = writes.find((w) => w.path.startsWith('moderationLog/'))
    expect(entry.data).toMatchObject({
      kind: 'remove',
      by: 'mod',
      activityId: 'a1',
      reportId: 'r1',
    })
  })

  test('the outcome is capped, as the rules cap it', async () => {
    await claimReport('r1', 'mod')
    await suspendAccount('alice', {
      adminId: 'mod',
      reportId: 'r1',
      decision: { status: 'actioned', outcome: 'x'.repeat(400) },
    })
    expect(store.get('reports/r1').outcome).toHaveLength(300)
  })

  test('a warning from the queue lets the claim go in the same transaction', async () => {
    await claimReport('r1', 'mod')
    await issueWarning('alice', { adminId: 'mod', reason: 'be kind', reportId: 'r1' })
    expect(store.get('reports/r1').claim).toBeUndefined()
    expect(store.get('reports/r1').status).toBe('open')
    const warningWrite = writes.findIndex((w) => w.path.startsWith('warnings/'))
    const releaseWrite = writes.findIndex(
      (w) => w.path === 'reports/r1' && w.data.claim === 'DELETE',
    )
    expect(releaseWrite).toBe(warningWrite + 1)
  })

  test('without a decision, an action under the claim records nothing on the report', async () => {
    await claimReport('r1', 'mod')
    await suspendAccount('alice', { adminId: 'mod', reportId: 'r1' })
    expect(store.get('roles/alice')).toMatchObject({ suspended: true })
    expect(store.get('reports/r1').status).toBe('open')
  })
})

describe('an action under the claim', () => {
  test('removeActivity from the queue writes the takedown with the report named', async () => {
    await claimReport('r1', 'mod')
    await removeActivity('a1', { adminId: 'mod', reason: 'spam', reportId: 'r1' })
    expect(store.get('activities/a1')).toMatchObject({
      status: 'removed',
      moderation: { by: 'mod', reason: 'spam', reportId: 'r1' },
    })
    expect(notices.map((n) => n.path)).toEqual([
      'users/alice/notifications',
      'users/p1/notifications',
    ])
  })

  test('removeActivity aborts before writing when the claim is somebody else’s', async () => {
    store.get('reports/r1').claim = fresh('other')
    await expect(
      code(removeActivity('a1', { adminId: 'mod', reason: 'spam', reportId: 'r1' })),
    ).resolves.toBe('claim-lost')
    expect(store.get('activities/a1').status).toBe('active')
    expect(notices).toHaveLength(0)
  })

  test('removeActivity aborts when the report was closed meanwhile', async () => {
    await claimReport('r1', 'mod')
    store.get('reports/r1').status = 'dismissed'
    await expect(
      code(removeActivity('a1', { adminId: 'mod', reason: 'spam', reportId: 'r1' })),
    ).resolves.toBe('claim-lost')
    expect(store.get('activities/a1').status).toBe('active')
  })

  test('removeActivity with no report is unchanged — no claim is read', async () => {
    store.get('reports/r1').claim = fresh('other')
    await removeActivity('a1', { adminId: 'mod', reason: 'spam' })
    expect(store.get('activities/a1').moderation).toEqual({ by: 'mod', reason: 'spam' })
  })

  test('suspendAccount from the queue ties the role write to the claim', async () => {
    store.get('reports/r1').claim = fresh('other')
    await expect(
      code(suspendAccount('alice', { adminId: 'mod', reportId: 'r1' })),
    ).resolves.toBe('claim-lost')
    expect(store.has('roles/alice')).toBe(false)
    expect(notices).toHaveLength(0)

    // The other claim goes stale; ours takes over.
    store.get('reports/r1').claim = stale('other')
    await claimReport('r1', 'mod')
    await suspendAccount('alice', { adminId: 'mod', reportId: 'r1' })
    expect(store.get('roles/alice')).toMatchObject({ suspended: true })
    expect(notices.map((n) => n.title)).toEqual(['Your account is suspended'])
  })

  test('a repeat under a valid claim changes nothing and tells nobody twice', async () => {
    await claimReport('r1', 'mod')
    await suspendAccount('alice', { adminId: 'mod', reportId: 'r1' })
    await removeActivity('a1', { adminId: 'mod', reason: 'spam', reportId: 'r1' })
    const told = notices.length
    await suspendAccount('alice', { adminId: 'mod', reportId: 'r1' })
    await removeActivity('a1', { adminId: 'mod', reason: 'spam', reportId: 'r1' })
    expect(notices).toHaveLength(told)
  })

  test('a warning from the queue is written only under the claim', async () => {
    store.get('reports/r1').claim = fresh('other')
    await expect(
      code(issueWarning('alice', { adminId: 'mod', reason: 'be kind', reportId: 'r1' })),
    ).resolves.toBe('claim-lost')
    expect([...store.keys()].filter((k) => k.startsWith('warnings/'))).toHaveLength(0)

    store.get('reports/r1').claim = stale('other')
    await claimReport('r1', 'mod')
    await issueWarning('alice', { adminId: 'mod', reason: 'be kind', reportId: 'r1' })
    const written = [...store.entries()].filter(([k]) => k.startsWith('warnings/'))
    expect(written).toHaveLength(1)
    expect(written[0][1]).toMatchObject({ subjectId: 'alice', by: 'mod', reportId: 'r1' })
    expect(notices.at(-1).title).toBe('A warning about your SmartSync account')
  })

  test('a warning from a profile needs no claim', async () => {
    await issueWarning('alice', { adminId: 'mod', reason: 'be kind' })
    expect([...store.keys()].filter((k) => k.startsWith('warnings/'))).toHaveLength(1)
  })
})

describe('releaseReport', () => {
  test('removes the claim', async () => {
    await claimReport('r1', 'mod')
    await releaseReport('r1')
    expect(store.get('reports/r1').claim).toBeUndefined()
  })

  test('a refusal — it was not yours — is nothing to report; anything else is', async () => {
    updateDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await releaseReport('r1')
    expect(reportError).not.toHaveBeenCalled()
    updateDoc.mockRejectedValueOnce({ code: 'unavailable' })
    await releaseReport('r1')
    expect(reportError).toHaveBeenCalledTimes(1)
  })
})

describe('claimedByOther', () => {
  const now = 1_000_000
  test('somebody else’s fresh claim, and nothing else', () => {
    expect(claimedByOther({ claimedBy: 'other', claimedAt: now - 1000 }, 'me', now)).toBe(true)
    expect(claimedByOther({ claimedBy: 'me', claimedAt: now - 1000 }, 'me', now)).toBe(false)
    expect(claimedByOther({ claimedBy: 'other', claimedAt: now - CLAIM_TTL_MS }, 'me', now)).toBe(
      false,
    )
    expect(claimedByOther({ claimedBy: null, claimedAt: null }, 'me', now)).toBe(false)
    expect(claimedByOther({ claimedBy: 'other', claimedAt: null }, 'me', now)).toBe(true)
  })
})
