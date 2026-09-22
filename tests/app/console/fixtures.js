import { vi } from 'vitest'

/**
 * What every console test starts from. No vi.mock here — mocks are hoisted
 * per file — only the shapes the mocks are built from.
 */
export const CLAIM_TTL_MS = 5 * 60_000

export const admin = {
  uid: 'me',
  name: 'Admin',
  avatar: 'AD',
  email: 'admin@example.com',
  role: 'admin',
  suspended: false,
  isAdmin: true,
}
export const plain = { ...admin, name: 'User', role: 'user', isAdmin: false }
export const suspendedAdmin = { ...admin, suspended: true, isAdmin: false }

export const person = (uid, name, extra = {}) => [
  uid,
  { uid, name, avatar: name.slice(0, 2).toUpperCase(), username: `@${uid}`, ...extra },
]

export const directoryOf = (...people) =>
  new Map([person('me', 'Admin'), person('bob', 'Bob'), person('carol', 'Carol'), ...people])

export const report = (id, over = {}) => ({
  id,
  reporterId: 'carol',
  targetType: 'user',
  targetId: 'bob',
  subjectId: 'bob',
  reason: 'harassment',
  detail: 'x',
  context: '',
  status: 'open',
  createdAt: Date.now() - 60_000,
  claimedBy: null,
  claimedAt: null,
  ...over,
})

export const moderationError = (code, details = {}) =>
  Object.assign(new Error(code), { code, details })

/** A fake listener registry: tests push rows or errors into each feed by name. */
export function feedRegistry() {
  const feeds = {}
  const watcher = (name) => (onRows, onError) => {
    feeds[name] = { onRows, onError }
    return () => {}
  }
  const reset = () => {
    for (const key of Object.keys(feeds)) delete feeds[key]
  }
  return { feeds, watcher, reset }
}

/** The moderation module, faked: five feeds and every action a spy. */
export function moderationMock(registry) {
  const { watcher } = registry
  return {
    REPORT_PAGE: 100,
    RESOLVED_PAGE: 200,
    LOG_PAGE: 300,
    WARNING_PAGE: 200,
    CLAIM_TTL_MS,
    LOG_KINDS: ['suspend', 'lift', 'close', 'reopen', 'remove', 'restore'],
    REPORT_REASONS: [
      { key: 'harassment', label: 'Harassment or abuse' },
      { key: 'safety', label: 'A safety concern' },
      { key: 'spam', label: 'Spam or a scam' },
    ],
    watchOpenReports: (cb, onError) => watcher('open')(cb, onError),
    watchResolvedReports: (cb, onError) => watcher('resolved')(cb, onError),
    watchRoles: (cb, onError) => watcher('roles')(cb, onError),
    watchWarnings: (cb, onError) => watcher('warnings')(cb, onError),
    watchModerationLog: (cb, onError) => watcher('log')(cb, onError),
    watchModerationBlocks: (cb, onError) => watcher('blocks')(cb, onError),
    BLOCKS_PAGE: 100,
    claimedByOther: (row, me, now = Date.now()) =>
      Boolean(row?.claimedBy) &&
      row.claimedBy !== me &&
      now - (row.claimedAt ?? now) < CLAIM_TTL_MS,
    claimReport: vi.fn(async () => {}),
    releaseReport: vi.fn(async () => {}),
    closeAccount: vi.fn(async () => ({ stoodDown: 0, failed: 0 })),
    issueWarning: vi.fn(async () => {}),
    liftSuspension: vi.fn(async () => {}),
    removeActivity: vi.fn(async () => {}),
    resolveReport: vi.fn(async () => {}),
    restoreActivity: vi.fn(async () => {}),
    reopenAccount: vi.fn(async () => {}),
    suspendAccount: vi.fn(async () => ({ stoodDown: 0, failed: 0 })),
    fetchReport: vi.fn(async () => null),
    fetchAccountHistory: vi.fn(async () => ({
      log: [],
      warnings: [],
      reportsAbout: [],
      reportsFiled: [],
    })),
    fetchActivityHistory: vi.fn(async () => ({ log: [], reports: [] })),
    fetchCounts: vi.fn(async () => ({
      accounts: 1234,
      activitiesTotal: 80,
      activitiesActive: 60,
      activitiesUpcoming: 40,
      activitiesRemoved: 3,
      activitiesCancelled: 17,
      reportsOpen: 2,
      reportsActioned: 10,
      reportsDismissed: 5,
      warnings: 7,
      logEntries: 21,
      countedAt: Date.now(),
    })),
  }
}

/** Every feed answered with nothing, so a page renders settled. */
export function settle(feeds, over = {}) {
  feeds.open?.onRows(over.open || [])
  feeds.resolved?.onRows(over.resolved || [])
  feeds.roles?.onRows(over.roles || [])
  feeds.warnings?.onRows(over.warnings || [])
  feeds.log?.onRows(over.log || [])
}
