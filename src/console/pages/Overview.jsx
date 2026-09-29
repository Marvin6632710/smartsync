import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
  LOG_PAGE,
  REPORT_REASONS,
  RESOLVED_PAGE,
  WARNING_PAGE,
  fetchCounts,
} from '../../firebase/moderation'
import { currentLocale, formatNumber, reportReasonLabel } from '../../i18n'
import { useConsole } from '../ConsoleContext'
import { historyEvents } from '../history'
import { useNow } from '../hooks'
import { countByReason, coverageFrom, dailyCounts } from '../stats'
import Timeline from '../ui/Timeline'
import { BarList, ColumnChart, SplitBar } from '../ui/Chart'
import { Section, Stat, When } from '../ui'

/** How far back the activity chart looks. Two weeks reads on one row. */
const CHART_DAYS = 14

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
 *
 * The charts answer what a figure cannot. A total says how many reports
 * there have been; it cannot say whether they are arriving faster than
 * they are being decided, or what people are actually reporting. Those
 * are a shape and a ranking, and they are what the two charts here are
 * for. The split bars are the same numbers as the tiles above them, drawn
 * as the proportions they are — the tiles keep the exact figures, because
 * a bar is for the ratio and a number is for the value.
 *
 * The same honesty applies: the charts are drawn from the windows, so a
 * day that fell out of one is marked unknown rather than counted as nought.
 * See `stats.js`.
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

  // How far back the three feeds still reach. Null means each of them holds
  // its whole collection, so every day in range is genuinely counted.
  const knownFrom = useMemo(
    () =>
      coverageFrom([
        { rows: log, page: LOG_PAGE, at: (row) => row.at },
        { rows: warnings, page: WARNING_PAGE, at: (row) => row.createdAt },
        {
          rows: resolvedReports,
          page: RESOLVED_PAGE,
          at: (row) => row.reviewedAt ?? row.createdAt,
        },
      ]),
    [log, warnings, resolvedReports],
  )
  // Everything an admin did, by the day it happened. One series — the title
  // names it — so one hue and no legend.
  const activity = useMemo(() => {
    const events = historyEvents({ log, warnings, reports: resolvedReports }, subjectOf)
    const days = dailyCounts(
      events.map((event) => event.at),
      { days: CHART_DAYS, now, knownFrom },
    )
    const day = new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short' })
    // Medium, not full: this is the tooltip's whole width, and "Wednesday, 23
    // September 2026" is three columns wide on a fourteen-column chart.
    const full = new Intl.DateTimeFormat(currentLocale(), { dateStyle: 'medium' })
    return days.map((point) => ({
      ...point,
      label: day.format(point.at),
      full: full.format(point.at),
    }))
  }, [log, warnings, resolvedReports, subjectOf, now, knownFrom])

  // What people report, across the queue and everything already decided.
  // Windowed like the rest, so it is the recent shape rather than all time —
  // which the section says in words rather than leaving to be assumed.
  const reasons = useMemo(() => {
    const keys = REPORT_REASONS.map((reason) => reason.key)
    return countByReason([...openReports, ...resolvedReports], keys).map((row) => ({
      ...row,
      label: row.key === 'unknown' ? t('console.charts.otherReason') : reportReasonLabel(row.key),
    }))
  }, [openReports, resolvedReports, t])

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
        {/* The same numbers as the tiles, as the proportions they are. The
            tiles keep the exact figures: a bar answers "what is the split",
            a number answers "how many", and neither does the other's job. */}
        <div className="con-split-row">
          <div className="con-split-block">
            <h3 className="con-chart-title">{t('console.charts.reportOutcomes')}</h3>
            <SplitBar
              caption={t('console.charts.reportOutcomes')}
              unknownText={t('console.charts.notCounted')}
              parts={[
                { key: 'open', label: t('console.status.open'), value: counts?.reportsOpen },
                {
                  key: 'actioned',
                  label: t('console.status.actioned'),
                  value: counts?.reportsActioned,
                },
                {
                  key: 'dismissed',
                  label: t('console.status.dismissed'),
                  value: counts?.reportsDismissed,
                },
              ]}
            />
          </div>
          <div className="con-split-block">
            <h3 className="con-chart-title">{t('console.charts.activitiesSplit')}</h3>
            <SplitBar
              caption={t('console.charts.activitiesSplit')}
              unknownText={t('console.charts.notCounted')}
              parts={[
                {
                  key: 'active',
                  label: t('console.activityStatus.active'),
                  value: counts?.activitiesActive,
                },
                {
                  key: 'cancelled',
                  label: t('console.activityStatus.cancelled'),
                  value: counts?.activitiesCancelled,
                },
                {
                  key: 'removed',
                  label: t('console.activityStatus.removed'),
                  value: counts?.activitiesRemoved,
                },
              ]}
            />
          </div>
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
        title={t('console.charts.workload')}
        eyebrow={t('console.overview.live')}
        id="con-charts"
      >
        <div className="con-chart-pair">
          <div className="con-chart-block">
            <h3 className="con-chart-title">{t('console.charts.perDay', { days: CHART_DAYS })}</h3>
            <ColumnChart
              points={activity}
              caption={t('console.charts.perDay', { days: CHART_DAYS })}
              emptyText={t('console.charts.nothingYet')}
              unknownText={t('console.charts.notKnown')}
            />
          </div>
          <div className="con-chart-block">
            <h3 className="con-chart-title">{t('console.charts.reasons')}</h3>
            <BarList
              rows={reasons}
              caption={t('console.charts.reasons')}
              emptyText={t('console.charts.noReports')}
            />
          </div>
        </div>
        <p className="con-muted">
          {knownFrom
            ? t('console.charts.windowed', {
                since: new Intl.DateTimeFormat(currentLocale(), { dateStyle: 'long' }).format(
                  knownFrom,
                ),
              })
            : t('console.charts.wholeRecord')}
        </p>
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
