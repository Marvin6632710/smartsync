import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { LOG_PAGE, RESOLVED_PAGE } from '../../firebase/moderation'
import { useConsole } from '../ConsoleContext'
import { EVENT_KINDS, historyEvents } from '../history'
import { useStickyState } from '../hooks'
import { FilterBar, SearchField, SelectFilter, matches } from '../ui/Filters'
import Timeline from '../ui/Timeline'

const DEFAULT_FILTERS = { q: '', kind: 'all' }

/**
 * What has been done, in order: every action from the log, every warning,
 * every decided report — one timeline, searchable and filterable by what
 * was done. Each entry says who did it, to whom, when and why, with a way
 * to the account, the report or the activity it concerns.
 */
export default function HistoryPage({ base }) {
  const { t } = useTranslation()
  const { log, warnings, resolvedReports, subjectOf, nameFor, profileOf } = useConsole()
  const [filters, setFilters] = useStickyState('history', DEFAULT_FILTERS)
  const set = (patch) => setFilters((current) => ({ ...current, ...patch }))
  const dirty = Object.keys(DEFAULT_FILTERS).some((key) => filters[key] !== DEFAULT_FILTERS[key])

  const everything = useMemo(
    () => historyEvents({ log, warnings, reports: resolvedReports }, subjectOf),
    [log, warnings, resolvedReports, subjectOf],
  )

  const events = useMemo(
    () =>
      everything.filter((event) => {
        if (filters.kind !== 'all' && event.kind !== filters.kind) return false
        return matches(
          filters.q,
          event.reason,
          event.reportId,
          event.activityId,
          nameFor(event.subjectId),
          profileOf(event.subjectId)?.username,
          nameFor(event.by),
        )
      }),
    [everything, filters, nameFor, profileOf],
  )

  return (
    <div className="con-page">
      <FilterBar onClear={() => setFilters(DEFAULT_FILTERS)} dirty={dirty}>
        <SearchField
          value={filters.q}
          onChange={(q) => set({ q })}
          label={t('console.history.search')}
          placeholder={t('console.history.searchPlaceholder')}
        />
        <SelectFilter
          label={t('console.history.what')}
          value={filters.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: 'all', label: t('console.filters.any') },
            ...EVENT_KINDS.map((kind) => ({ value: kind, label: t(`console.kinds.${kind}`) })),
          ]}
        />
      </FilterBar>

      <p className="con-note">
        {t('console.history.scope', { log: LOG_PAGE, reports: RESOLVED_PAGE })}
      </p>

      <Timeline
        events={events}
        base={base}
        emptyTitle={t('console.history.none')}
        emptyBody={t('console.history.noneBody')}
      />
    </div>
  )
}
