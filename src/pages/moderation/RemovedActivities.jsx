import React from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'

import { useTranslation } from 'react-i18next'

import { personName } from '../../i18n'
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
  const { t } = useTranslation()
  return (
    <>
      <section className="headline-block">
        <span className="eyebrow">{t('moderation.removedPage.eyebrow')}</span>
        <h2>{t('moderation.removedPage.title')}</h2>
        <p className="helper-text">{t('moderation.removedPage.lead')}</p>
      </section>

      <div className="stack list-stack">
        {removedActivities.map((activity) => (
          <article className="report-card" key={activity.id}>
            <header>
              <span className="report-kind">
                <Trash2 size={13} /> {t('moderation.removedPage.kind')}
              </span>
              <time>{formatRelativeTime(activity.updatedAt)}</time>
            </header>
            <h3>{activity.title}</h3>
            <p className="report-context">
              {t('moderation.removedPage.hostedBy', {
                name: personName(activity.hostName),
                place: activity.locationName,
              })}
            </p>
            <p className="report-detail-text">
              “{activity.moderation?.reason || t('moderation.removedPage.noReason')}”
            </p>
            <p className="report-meta">
              {t('moderation.removedPage.takenDownBy', { name: nameFor(activity.moderation?.by) })}
            </p>

            <label className="report-detail">
              {/* One element, so the question and its note stay on one
                  line — the label is a grid, and a bare text node beside
                  a span becomes two rows. */}
              <span className="field-label">
                {t('moderation.removedPage.whyPutBack')}{' '}
                <span className="optional">{t('moderation.removedPage.required')}</span>
              </span>
              <input
                maxLength={300}
                /* Measured at exactly the field width before, so it
                   clipped on the rounding and would clip badly on a
                   320px phone. This leaves real headroom. */
                placeholder={t('moderation.removedPage.placeholder')}
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
                  (restoreReasons[activity.id] || '').trim()
                    ? undefined
                    : t('moderation.removedPage.writeReasonFirst')
                }
                onClick={() => onRestore(activity)}
              >
                <RotateCcw size={15} />{' '}
                {restoring === activity.id
                  ? t('moderation.removedPage.puttingBack')
                  : t('moderation.removedPage.putItBack')}
              </button>
              <button className="text-button" onClick={() => onOpen(activity.id)}>
                {t('common.lookAtIt')}
              </button>
            </div>
          </article>
        ))}
        {removedActivities.length === 0 && (
          <div className="empty-state">
            <Trash2 size={28} />
            <h3>{t('moderation.removedPage.nothing')}</h3>
            <p>{t('moderation.removedPage.nothingBody')}</p>
          </div>
        )}
      </div>
    </>
  )
}
