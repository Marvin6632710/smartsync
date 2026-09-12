import React from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'

import { formatRelativeTime } from '../../utils/time'

/**
 * Everything moderators have taken down, and the way to put one back.
 *
 * Split out of ModerationPage, which rendered four screens from one 1,179-line
 * component. Presentational: every decision it needs — who may see this, what
 * a restore does — is made by the page above and arrives as a prop, so the
 * guard stays in one place rather than being reimplemented per section.
 */
export default function RemovedActivities({
  removedActivities,
  restoreReasons,
  setRestoreReasons,
  restoring,
  onRestore,
  onOpen,
  nameFor,
}) {
  return (
    <>
      <section className="headline-block">
        <span className="eyebrow">Admin</span>
        <h2>Removed activities</h2>
        <p className="helper-text">
          Everything moderators have taken down. Putting one back is recorded against it, and the
          host is told.
        </p>
      </section>

      <div className="stack list-stack">
        {removedActivities.map((activity) => (
          <article className="report-card" key={activity.id}>
            <header>
              <span className="report-kind">
                <Trash2 size={13} /> removed
              </span>
              <time>{formatRelativeTime(activity.updatedAt)}</time>
            </header>
            <h3>{activity.title}</h3>
            <p className="report-context">
              Hosted by {activity.hostName} · {activity.locationName}
            </p>
            <p className="report-detail-text">
              “{activity.moderation?.reason || 'No reason recorded'}”
            </p>
            <p className="report-meta">Taken down by {nameFor(activity.moderation?.by)}</p>

            <label className="report-detail">
              {/* One element, so the question and its note stay on one
                  line — the label is a grid, and a bare text node beside
                  a span becomes two rows. */}
              <span className="field-label">
                Why are you putting this back? <span className="optional">Required</span>
              </span>
              <input
                maxLength={300}
                /* Measured at exactly the field width before, so it
                   clipped on the rounding and would clip badly on a
                   320px phone. This leaves real headroom. */
                placeholder="The report was mistaken"
                value={restoreReasons[activity.id] || ''}
                onChange={(event) =>
                  setRestoreReasons((current) => ({
                    ...current,
                    [activity.id]: event.target.value,
                  }))
                }
              />
            </label>
            <div className="report-actions">
              <button
                className="secondary-button"
                disabled={!(restoreReasons[activity.id] || '').trim() || restoring === activity.id}
                // Without this the control is simply grey, which reads as
                // broken rather than as waiting for the reason above it.
                title={
                  (restoreReasons[activity.id] || '').trim() ? undefined : 'Write a reason first'
                }
                onClick={() => onRestore(activity)}
              >
                <RotateCcw size={15} />{' '}
                {restoring === activity.id ? 'Putting it back…' : 'Put it back'}
              </button>
              <button className="text-button" onClick={() => onOpen(activity.id)}>
                Look at it
              </button>
            </div>
          </article>
        ))}
        {removedActivities.length === 0 && (
          <div className="empty-state">
            <Trash2 size={28} />
            <h3>Nothing has been taken down</h3>
            <p>Activities removed by a moderator will be listed here.</p>
          </div>
        )}
      </div>
    </>
  )
}
