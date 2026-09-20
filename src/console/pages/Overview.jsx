import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { fetchCounts } from '../../firebase/moderation'
import { formatNumber } from '../../i18n'
import { useConsole } from '../ConsoleContext'
import { historyEvents } from '../history'
import { useNow } from '../hooks'
import Timeline from '../ui/Timeline'
import { Section, Stat, When } from '../ui'

/**
 * The first screen: the whole platform in figures, the queue in figures,
 * and what was done last.
 *
 * Two kinds of number, and the difference is said on the tile. Whole-
 * collection totals are counted on the server — the console otherwise
 * sees windows, and a total read off a window is not a total. Queue and
 * people figures come from the live listeners. Nothing here is estimated:
 * a count that could not be made shows as unknown, not as zero, and the
 * "active users" a dashboard usually leads with is not shown at all,
 * because nothing in the data says when somebody was last here.
 */
export default function Overview({ base }) {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const {
    openReports,
    resolvedReports,
    log,
    warnings,
    admins,
    suspended,
    closed,
    statusOf,
    subjectOf,
  } = useConsole()
  const [counts, setCounts] = useState(null)
  const [counting, setCounting] = useState(true)
  const [round, setRound] = useState(0)

  // Counted on arrival and on request; a count that comes back after the
  // page has gone is dropped.
  useEffect(() => {
    let live = true
    fetchCounts().then((next) => {
      if (!live) return
      setCounts(next)
      setCounting(false)
    })
    return () => {
      live = false
    }
  }, [round])
  const count = () => {
    setCounting(true)
    setRound((n) => n + 1)
  }

  const inReview = openReports.filter((r) => ['mine', 'held'].includes(statusOf(r, now))).length
  const waiting = openReports.length - inReview
  const recent = useMemo(
    () =>
      historyEvents(
        {
          log: log.slice(0, 12),
          warnings: warnings.slice(0, 12),
          reports: resolvedReports.slice(0, 12),
        },
        subjectOf,
      ).slice(0, 8),
    [log, warnings, resolvedReports, subjectOf],
  )
  const n = (value) => (value === null || value === undefined ? '—' : formatNumber(value))

  return (
    <div className="con-page">
      <Section
        title={t('console.overview.platform')}
        eyebrow={t('console.overview.counted')}
        id="con-platform"
        actions={
          <button type="button" className="secondary-button" onClick={count} disabled={counting}>
            <RefreshCw size={14} /> {counting ? t('common.working') : t('console.overview.recount')}
          </button>
        }
      >
        <div className="con-stat-row">
          <Stat
            label={t('console.overview.accounts')}
            value={n(counts?.accounts)}
            to={`${base}/accounts`}
          />
          <Stat
            label={t('console.overview.activitiesUpcoming')}
            value={n(counts?.activitiesUpcoming)}
            to={`${base}/activities`}
          />
          <Stat
            label={t('console.overview.activitiesRemoved')}
            value={n(counts?.activitiesRemoved)}
            to={`${base}/activities?status=removed`}
            tone="kind-remove"
          />
          <Stat
            label={t('console.overview.reportsTotal')}
            value={n(
              counts
                ? (counts.reportsOpen ?? 0) +
                    (counts.reportsActioned ?? 0) +
                    (counts.reportsDismissed ?? 0)
                : null,
            )}
            hint={t('console.overview.reportsBreakdown', {
              actioned: n(counts?.reportsActioned),
              dismissed: n(counts?.reportsDismissed),
            })}
          />
          <Stat label={t('console.overview.warnings')} value={n(counts?.warnings)} />
        </div>
        <p className="con-muted">
          {counts?.countedAt ? (
            <>
              {t('console.overview.countedAt')} <When at={counts.countedAt} exact />.{' '}
            </>
          ) : null}
          {t('console.overview.countNote')}
        </p>
      </Section>

      <Section
        title={t('console.overview.queue')}
        eyebrow={t('console.overview.live')}
        id="con-queue"
      >
        <div className="con-stat-row">
          <Stat
            label={t('console.overview.open')}
            value={openReports.length}
            to={`${base}/reports`}
            tone="open"
          />
          <Stat
            label={t('console.overview.waiting')}
            value={waiting}
            to={`${base}/reports?status=unclaimed`}
          />
          <Stat
            label={t('console.overview.inReview')}
            value={inReview}
            to={`${base}/reports?status=held`}
            tone="held"
          />
          <Stat
            label={t('console.overview.decided')}
            value={resolvedReports.length}
            to={`${base}/reports?status=resolved`}
            tone="actioned"
          />
        </div>
      </Section>

      <Section
        title={t('console.overview.people')}
        eyebrow={t('console.overview.live')}
        id="con-people"
      >
        <div className="con-stat-row">
          <Stat label={t('console.overview.admins')} value={admins.length} tone="admin" />
          <Stat
            label={t('console.overview.suspended')}
            value={suspended.length}
            to={`${base}/accounts?state=suspended`}
            tone="suspended"
          />
          <Stat
            label={t('console.overview.closed')}
            value={closed.length}
            to={`${base}/accounts?state=closed`}
            tone="closed"
          />
        </div>
      </Section>

      <Section
        title={t('console.overview.recent')}
        id="con-recent"
        actions={
          <Link className="con-more" to={`${base}/history`}>
            {t('console.overview.allHistory')}
          </Link>
        }
      >
        <Timeline events={recent} base={base} compact emptyTitle={t('console.history.none')} />
      </Section>
    </div>
  )
}
