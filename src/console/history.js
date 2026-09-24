/**
 * One timeline out of three records.
 *
 * What happened to somebody is kept in three places, each the record of
 * its own kind: the log (what an admin did to an account or an activity),
 * the warnings (a record the person can read too), and the reports (each
 * carrying its decision). A history view wants them in one order, so
 * each becomes an event of the same shape here.
 *
 *   { id, at, kind, by, subjectId, reason, reportId, activityId, source }
 *
 * `kind` for a decision is the report's status — 'actioned' or
 * 'dismissed' — so a decision reads as what it was, not as a generic
 * "report closed".
 */
export const EVENT_KINDS = [
  'suspend',
  'lift',
  'close',
  'reopen',
  'remove',
  'restore',
  'warn',
  'actioned',
  'dismissed',
  'profile-picture-remove',
  'profile-picture-restore',
  'profile-bio-remove',
  'profile-bio-restore',
  'profile-username-remove',
  'profile-username-restore',
  'activity-picture-remove',
  'activity-picture-restore',
  'message-remove',
  'message-restore',
  'revoke-sessions',
  'send-password-reset',
  'appeal-reverse',
  'appeal-uphold',
  'announcement-publish',
  'announcement-expire',
]

export function logEvent(entry) {
  return {
    id: `log:${entry.id}`,
    at: entry.at ?? null,
    kind: entry.kind,
    by: entry.by,
    subjectId: entry.subjectId,
    reason: entry.reason || '',
    reportId: entry.reportId || null,
    activityId: entry.activityId || null,
    messageId: entry.messageId || null,
    announcementId: entry.announcementId || null,
    source: 'log',
  }
}

export function warningEvent(warning) {
  return {
    id: `warning:${warning.id}`,
    at: warning.createdAt?.toMillis?.() ?? warning.createdAt ?? null,
    kind: 'warn',
    by: warning.by,
    subjectId: warning.subjectId,
    reason: warning.reason || '',
    reportId: warning.reportId || null,
    activityId: null,
    source: 'warning',
  }
}

/** A decided report as an event; an open one is not an event yet. */
export function decisionEvent(report, subjectOf = (r) => r.subjectId) {
  if (report.status !== 'actioned' && report.status !== 'dismissed') return null
  return {
    id: `report:${report.id}`,
    at: report.reviewedAt ?? null,
    kind: report.status,
    by: report.reviewedBy,
    subjectId: subjectOf(report),
    reason: report.outcome || '',
    reportId: report.id,
    activityId: report.targetType === 'activity' ? report.targetId : report.activityId || null,
    source: 'report',
  }
}

/** Everything, newest first. Duplicates (the same report from two lists) collapse. */
export function historyEvents({ log = [], warnings = [], reports = [] }, subjectOf) {
  const events = new Map()
  for (const entry of log) events.set(`log:${entry.id}`, logEvent(entry))
  for (const warning of warnings) events.set(`warning:${warning.id}`, warningEvent(warning))
  for (const report of reports) {
    const event = decisionEvent(report, subjectOf)
    if (event) events.set(event.id, event)
  }
  return [...events.values()].sort((a, b) => (b.at || 0) - (a.at || 0))
}
