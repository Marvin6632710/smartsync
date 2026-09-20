import React, { useMemo } from 'react'
import { CheckCircle2, Flag, Inbox } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { REPORT_PAGE, RESOLVED_PAGE, fetchReport } from '../../firebase/moderation'
import { useConsole } from '../ConsoleContext'
import { useFetched, useFilterParams, useNow, useStickyState } from '../hooks'
import DataTable from '../ui/DataTable'
import { FilterBar, SearchField, SelectFilter, matches } from '../ui/Filters'
import { Empty, KeyHint, StatusBadge, TypeBadge, When } from '../ui'
import ReportDetails from './ReportDetails'

const STATUS_FILTERS = ['open', 'unclaimed', 'mine', 'held', 'resolved', 'everything']
const DEFAULT_FILTERS = { q: '', status: 'open', type: 'all' }

/**
 * The queue, and the report being looked at.
 *
 * The list is every open report the page holds and, on request, the
 * decided ones — filtered in memory, because both feeds are bounded on the
 * server already (REPORT_PAGE, RESOLVED_PAGE) and a filter changes faster
 * than a query could. Three controls and no more: a search, the report's
 * state, and what kind of thing was reported. Newest first, the open ones
 * before the decided. Selecting a row opens it in the panel beside the
 * list; the address carries the id, so a report can be linked to from the
 * overview, a timeline or a colleague's message.
 */
export default function ReportsPage({ base }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const now = useNow(30_000)
  const {
    openReports,
    resolvedReports,
    loaded,
    nameFor,
    subjectOf,
    timesReported,
    statusOf,
    reasonLabel,
    profileOf,
  } = useConsole()
  const [filters, setFilters] = useStickyState('reports', DEFAULT_FILTERS)
  const set = (patch) => setFilters((current) => ({ ...current, ...patch }))
  const dirty = Object.keys(DEFAULT_FILTERS).some((key) => filters[key] !== DEFAULT_FILTERS[key])
  useFilterParams(Object.keys(DEFAULT_FILTERS), (patch) =>
    setFilters({ ...DEFAULT_FILTERS, ...patch }),
  )

  const rows = useMemo(() => {
    const wantsResolved = ['resolved', 'everything'].includes(filters.status)
    const wantsOpen = filters.status !== 'resolved'
    const pool = [...(wantsOpen ? openReports : []), ...(wantsResolved ? resolvedReports : [])]
    return pool
      .map((report) => ({
        report,
        status: statusOf(report, now),
        subjectId: subjectOf(report),
      }))
      .filter(({ report, status, subjectId }) => {
        switch (filters.status) {
          case 'unclaimed':
            if (!(status === 'open' || status === 'stale')) return false
            break
          case 'mine':
            if (status !== 'mine') return false
            break
          case 'held':
            if (status !== 'held') return false
            break
          default:
        }
        if (filters.type !== 'all' && report.targetType !== filters.type) return false
        const subject = profileOf(subjectId)
        const reporter = profileOf(report.reporterId)
        return matches(
          filters.q,
          report.id,
          report.detail,
          report.context,
          reasonLabel(report.reason),
          nameFor(subjectId),
          subject?.username,
          nameFor(report.reporterId),
          reporter?.username,
          report.outcome,
        )
      })
      .sort(
        (a, b) =>
          // Open before decided, then the most recent first.
          Number(b.report.status === 'open') - Number(a.report.status === 'open') ||
          (b.report.reviewedAt || b.report.createdAt || 0) -
            (a.report.reviewedAt || a.report.createdAt || 0),
      )
  }, [
    openReports,
    resolvedReports,
    filters,
    now,
    statusOf,
    subjectOf,
    profileOf,
    nameFor,
    reasonLabel,
  ])

  // The report in the address: from the pages in memory, else fetched on
  // its own — a link from a timeline can name one older than either page.
  const inMemory = id
    ? [...openReports, ...resolvedReports].find((report) => report.id === id) || null
    : null
  const fetched = useFetched(id && !inMemory ? id : null, fetchReport)
  const selected = inMemory || fetched.data

  const columns = [
    {
      key: 'status',
      label: t('console.reports.columns.status'),
      render: (row) => (
        <StatusBadge
          status={row.status}
          name={row.status === 'held' ? nameFor(row.report.claimedBy) : undefined}
        />
      ),
    },
    {
      key: 'type',
      label: t('console.reports.columns.type'),
      render: (row) => <TypeBadge type={row.report.targetType} />,
    },
    {
      key: 'reason',
      label: t('console.reports.columns.reason'),
      className: 'con-col-main',
      render: (row) => (
        <span className="con-cell-main">
          <strong>{reasonLabel(row.report.reason)}</strong>
          {row.report.detail && <small>{row.report.detail}</small>}
        </span>
      ),
    },
    {
      key: 'subject',
      label: t('console.reports.columns.subject'),
      render: (row) => nameFor(row.subjectId),
    },
    {
      key: 'reporter',
      label: t('console.reports.columns.reporter'),
      render: (row) => nameFor(row.report.reporterId),
    },
    {
      key: 'repeats',
      label: '×',
      align: 'right',
      render: (row) => {
        const n = timesReported(row.report)
        return n > 1 ? <strong>{n}</strong> : n || '—'
      },
    },
    {
      key: 'filed',
      label: t('console.reports.columns.filed'),
      render: (row) => <When at={row.report.createdAt} />,
    },
    {
      key: 'handler',
      label: t('console.reports.columns.handler'),
      render: (row) =>
        row.report.reviewedBy
          ? nameFor(row.report.reviewedBy)
          : row.report.claimedBy && row.status !== 'stale'
            ? nameFor(row.report.claimedBy)
            : '—',
    },
  ]

  return (
    <div className={`con-page con-split ${selected ? 'with-detail' : ''}`}>
      <div className="con-list">
        <FilterBar onClear={() => setFilters(DEFAULT_FILTERS)} dirty={dirty}>
          <SearchField
            value={filters.q}
            onChange={(q) => set({ q })}
            label={t('console.reports.search')}
            placeholder={t('console.reports.searchPlaceholder')}
          />
          <SelectFilter
            label={t('console.reports.columns.status')}
            value={filters.status}
            onChange={(status) => set({ status })}
            options={STATUS_FILTERS.map((value) => ({
              value,
              label: t(`console.reports.statusFilter.${value}`),
            }))}
          />
          <SelectFilter
            label={t('console.reports.columns.type')}
            value={filters.type}
            onChange={(type) => set({ type })}
            options={[
              { value: 'all', label: t('console.filters.any') },
              ...['user', 'activity', 'message'].map((value) => ({
                value,
                label: t(`moderation.targetType.${value}`),
              })),
            ]}
          />
        </FilterBar>

        {/* At the cap the view is partial, and silently partial is the worst
            kind: the reports that fall off the end are the oldest, which are
            the ones that have waited longest. */}
        {openReports.length >= REPORT_PAGE && (
          <p className="con-note" role="status">
            {t('moderation.capped', { count: REPORT_PAGE })}
          </p>
        )}
        {resolvedReports.length >= RESOLVED_PAGE &&
          ['resolved', 'everything'].includes(filters.status) && (
            <p className="con-note" role="status">
              {t('console.reports.resolvedCapped', { count: RESOLVED_PAGE })}
            </p>
          )}

        <DataTable
          label={t('console.reports.title')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.report.id}
          selectedId={selected?.id || null}
          onSelect={(row) => navigate(`${base}/reports/${row.report.id}`)}
          loading={!loaded.open}
          empty={
            filters.status === 'open' && !dirty ? (
              <Empty
                icon={CheckCircle2}
                title={t('moderation.nothingWaiting')}
                body={t('moderation.nothingWaitingBody')}
              />
            ) : (
              <Empty
                icon={Inbox}
                title={t('console.reports.noMatch')}
                body={t('console.reports.noMatchBody')}
              />
            )
          }
        />
        <KeyHint
          items={[
            ['↑ ↓', t('console.keys.move')],
            ['⏎', t('console.keys.open')],
            ['/', t('console.keys.search')],
            ['esc', t('console.keys.close')],
          ]}
        />
      </div>

      {selected ? (
        <ReportDetails report={selected} base={base} onClose={() => navigate(`${base}/reports`)} />
      ) : (
        id &&
        !fetched.loading && (
          <div className="con-detail con-detail-missing">
            <Empty
              icon={Flag}
              title={t('console.reports.notLoaded')}
              body={t('console.reports.notLoadedBody')}
            />
          </div>
        )
      )}
    </div>
  )
}
