import React, { useMemo, useState } from 'react'
import { CalendarX2, ImageOff, RotateCcw, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { DISCOVERY_LIMIT } from '../../firebase/activities'
import { fetchActivityHistory } from '../../firebase/moderation'
import { runAdminContentAction } from '../../firebase/admin'
import { categoryLabel, takedownReasonText } from '../../i18n'
import { formatActivityDate, formatClock } from '../../utils/time'
import { useConsole } from '../ConsoleContext'
import { historyEvents } from '../history'
import { useFetched, useFilterParams, useStickyState } from '../hooks'
import DataTable from '../ui/DataTable'
import AdminActionButton from '../AdminActionButton'
import DetailPanel from '../ui/DetailPanel'
import { FilterBar, SearchField, SelectFilter, matches } from '../ui/Filters'
import Timeline from '../ui/Timeline'
import { AppLink, Badge, Empty, Field, Fields, KeyHint, Section, When } from '../ui'

const STATUSES = ['all', 'active', 'upcoming', 'past', 'cancelled', 'removed']
const DEFAULT_FILTERS = { q: '', status: 'all', category: 'all' }

/**
 * Every activity the app holds, whatever its status — including the ones
 * discovery deliberately hides — with a takedown or a restore a click
 * away. What is loaded is the discovery window (DISCOVERY_LIMIT, soonest
 * first from yesterday) plus anything this account is on; the page says
 * so rather than presenting a window as the whole.
 */
export default function ActivitiesPage({ base }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { user, app, nameFor, desk } = useConsole()
  const { allActivities } = app
  const [filters, setFilters] = useStickyState('activities', DEFAULT_FILTERS)
  const set = (patch) => setFilters((current) => ({ ...current, ...patch }))
  const dirty = Object.keys(DEFAULT_FILTERS).some((key) => filters[key] !== DEFAULT_FILTERS[key])
  useFilterParams(Object.keys(DEFAULT_FILTERS), (patch) =>
    setFilters({ ...DEFAULT_FILTERS, ...patch }),
  )

  const categories = useMemo(
    () => [...new Set(allActivities.map((a) => a.category))].sort(),
    [allActivities],
  )
  const rows = useMemo(
    () =>
      allActivities
        .filter((activity) => {
          switch (filters.status) {
            case 'active':
              if (activity.status !== 'active') return false
              break
            case 'upcoming':
              if (activity.status !== 'active' || activity.isPast) return false
              break
            case 'past':
              if (!activity.isPast) return false
              break
            case 'cancelled':
            case 'removed':
              if (activity.status !== filters.status) return false
              break
            default:
          }
          if (filters.category !== 'all' && activity.category !== filters.category) return false
          return matches(
            filters.q,
            activity.title,
            activity.locationName,
            activity.hostName,
            nameFor(activity.hostId),
            activity.id,
          )
        })
        .sort((a, b) => {
          // Removed first — that is what an admin opens this for — then by time.
          const weight = (x) => (x.status === 'removed' ? 0 : x.status === 'cancelled' ? 2 : 1)
          return weight(a) - weight(b) || (a.startsAt || 0) - (b.startsAt || 0)
        }),
    [allActivities, filters, nameFor],
  )
  const selected = id ? allActivities.find((activity) => activity.id === id) || null : null

  const columns = [
    {
      key: 'title',
      label: t('console.activities.columns.activity'),
      className: 'con-col-main',
      render: (activity) => (
        <span className="con-cell-main">
          <strong>{activity.title}</strong>
          <small>
            {categoryLabel(activity.category)} · {activity.locationName}
          </small>
        </span>
      ),
    },
    {
      key: 'status',
      label: t('console.reports.columns.status'),
      render: (activity) => (
        <Badge tone={`activity-${activity.status}`}>
          {t(`console.activityStatus.${activity.status}`, { defaultValue: activity.status })}
          {activity.isPast && activity.status === 'active'
            ? ` · ${t('console.activityStatus.past')}`
            : ''}
        </Badge>
      ),
    },
    { key: 'host', label: t('common.host'), render: (activity) => nameFor(activity.hostId) },
    {
      key: 'when',
      label: t('console.activities.columns.when'),
      render: (activity) => `${formatActivityDate(activity.date)} ${formatClock(activity.time)}`,
    },
    {
      key: 'roster',
      label: t('console.activities.columns.roster'),
      align: 'right',
      render: (activity) => `${(activity.participantUids || []).length}/${activity.capacity}`,
    },
  ]

  return (
    <div className={`con-page con-split ${selected ? 'with-detail' : ''}`}>
      <div className="con-list">
        <p className="con-note">{t('console.activities.windowNote', { count: DISCOVERY_LIMIT })}</p>
        <FilterBar onClear={() => setFilters(DEFAULT_FILTERS)} dirty={dirty}>
          <SearchField
            value={filters.q}
            onChange={(q) => set({ q })}
            label={t('console.activities.search')}
            placeholder={t('console.activities.searchPlaceholder')}
          />
          <SelectFilter
            label={t('console.reports.columns.status')}
            value={filters.status}
            onChange={(status) => set({ status })}
            options={STATUSES.map((value) => ({
              value,
              label:
                value === 'all' ? t('console.filters.any') : t(`console.activityStatus.${value}`),
            }))}
          />
          <SelectFilter
            label={t('console.activities.columns.category')}
            value={filters.category}
            onChange={(category) => set({ category })}
            options={[
              { value: 'all', label: t('console.filters.any') },
              ...categories.map((value) => ({ value, label: categoryLabel(value) })),
            ]}
          />
        </FilterBar>
        <DataTable
          label={t('console.activities.title')}
          columns={columns}
          rows={rows}
          selectedId={id || null}
          onSelect={(activity) => navigate(`${base}/activities/${activity.id}`)}
          tone={(activity) => (activity.status === 'removed' ? 'removed' : undefined)}
          loading={app.loading}
          empty={
            <Empty
              icon={CalendarX2}
              title={t('console.activities.none')}
              body={t('console.activities.noneBody')}
            />
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
      {selected && (
        <ActivityDetails
          activity={selected}
          base={base}
          onClose={() => navigate(`${base}/activities`)}
          user={user}
          desk={desk}
        />
      )}
    </div>
  )
}

function ActivityDetails({ activity, base, onClose, user, desk }) {
  const { t } = useTranslation()
  const { nameFor, subjectOf, reasonLabel, rankOf } = useConsole()
  const history = useFetched(activity.id, fetchActivityHistory)
  const [restoreReason, setRestoreReason] = useState('')
  const events = useMemo(
    () =>
      history.data
        ? historyEvents({ log: history.data.log, reports: history.data.reports }, subjectOf)
        : [],
    [history.data, subjectOf],
  )
  const openReports = history.data?.reports.filter((r) => r.status === 'open') || []
  const removed = activity.status === 'removed'
  const pictureRemoved = activity.contentModeration?.picture?.active === true
  const cannotTouchHost = activity.hostId === user.uid || rankOf(activity.hostId) === 'admin'

  return (
    <DetailPanel
      eyebrow={t('console.activities.one')}
      title={activity.title}
      badges={
        <Badge tone={`activity-${activity.status}`}>
          {t(`console.activityStatus.${activity.status}`, { defaultValue: activity.status })}
        </Badge>
      }
      onClose={onClose}
      footer={
        <div className="con-actions">
          {removed && (
            <div className="con-restore">
              <label className="report-detail">
                <span className="field-label">
                  {t('moderation.removedPage.whyPutBack')}{' '}
                  <span className="optional">{t('moderation.removedPage.required')}</span>
                </span>
                <input
                  maxLength={300}
                  placeholder={t('moderation.removedPage.placeholder')}
                  value={restoreReason}
                  onChange={(event) => setRestoreReason(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                disabled={!restoreReason.trim() || desk.restoring === activity.id}
                title={
                  restoreReason.trim() ? undefined : t('moderation.removedPage.writeReasonFirst')
                }
                onClick={async () => {
                  if (await desk.restore(activity, restoreReason)) setRestoreReason('')
                }}
              >
                <RotateCcw size={15} />{' '}
                {desk.restoring === activity.id
                  ? t('moderation.removedPage.puttingBack')
                  : t('moderation.removedPage.putItBack')}
              </button>
            </div>
          )}
          {activity.status === 'active' && activity.hostId !== user.uid && (
            <button
              type="button"
              className="danger-button"
              disabled={desk.removing === activity.id}
              onClick={() => desk.askRemove(activity)}
            >
              <Trash2 size={15} />{' '}
              {desk.removing === activity.id ? t('common.working') : t('moderation.removeActivity')}
            </button>
          )}
          <AppLink to={`/activity/${activity.id}`}>{t('common.lookAtIt')}</AppLink>
        </div>
      }
    >
      <Section title={t('console.activities.details')} id="con-activity-details">
        <Fields>
          <Field label={t('common.host')}>{nameFor(activity.hostId)}</Field>
          <Field label={t('console.activities.columns.category')}>
            {categoryLabel(activity.category)}
          </Field>
          <Field label={t('console.activities.columns.when')}>
            {formatActivityDate(activity.date)} {formatClock(activity.time)}
          </Field>
          <Field label={t('console.activities.columns.place')}>{activity.locationName}</Field>
          <Field label={t('console.activities.columns.roster')}>
            {t('console.activities.roster', {
              count: (activity.participantUids || []).length,
              capacity: activity.capacity,
            })}
          </Field>
          <Field label={t('console.accounts.uid')}>
            <code>{activity.id}</code>
          </Field>
          {activity.description && (
            <Field label={t('console.activities.description')} wide>
              {activity.description}
            </Field>
          )}
        </Fields>
      </Section>

      {!cannotTouchHost && (
        <Section title={t('adminPowers.activityPicture')} id="con-activity-picture-moderation">
          <p className="con-muted">{t('adminPowers.activityPictureHint')}</p>
          <div className="con-action-row admin-power-grid">
            <AdminActionButton
              action={(reason) =>
                runAdminContentAction({
                  action: pictureRemoved ? 'restore-activity-picture' : 'remove-activity-picture',
                  activityId: activity.id,
                  reason,
                })
              }
              title={t(
                pictureRemoved
                  ? 'adminPowers.restoreActivityPictureTitle'
                  : 'adminPowers.removeActivityPictureTitle',
              )}
              body={t(
                pictureRemoved
                  ? 'adminPowers.restoreActivityPictureBody'
                  : 'adminPowers.removeActivityPictureBody',
              )}
              className={pictureRemoved ? 'secondary-button' : 'danger-button'}
              tone={pictureRemoved ? 'default' : 'danger'}
            >
              {pictureRemoved ? <RotateCcw size={15} /> : <ImageOff size={15} />}{' '}
              {t(
                pictureRemoved
                  ? 'adminPowers.restoreActivityPicture'
                  : 'adminPowers.removeActivityPicture',
              )}
            </AdminActionButton>
          </div>
        </Section>
      )}

      {activity.moderation && (
        <Section title={t('console.activities.moderationRecord')} id="con-activity-moderation">
          <Fields>
            <Field
              label={
                removed
                  ? t('moderation.removedPage.takenDownBy', {
                      name: nameFor(activity.moderation.by),
                    })
                  : t('console.activities.lastDecisionBy', {
                      name: nameFor(activity.moderation.by),
                    })
              }
              wide
            >
              “
              {takedownReasonText(activity.moderation.reason) ||
                t('moderation.removedPage.noReason')}
              ”
            </Field>
            <Field label={t('console.activities.updated')}>
              <When at={activity.updatedAt} exact />
            </Field>
          </Fields>
        </Section>
      )}

      {openReports.length > 0 && (
        <Section title={t('console.accounts.openReports')} id="con-activity-open">
          <ul className="con-links">
            {openReports.map((report) => (
              <li key={report.id}>
                <AppLink to={`${base}/reports/${report.id}`}>
                  {reasonLabel(report.reason)} · <When at={report.createdAt} />
                </AppLink>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t('console.accounts.record')} id="con-activity-record">
        {history.error ? (
          <p className="form-error" role="alert">
            {t('console.accounts.recordFailed')}
          </p>
        ) : history.loading ? (
          <p className="con-muted" role="status">
            {t('common.loading')}
          </p>
        ) : (
          <Timeline events={events} base={base} emptyTitle={t('console.activities.cleanRecord')} />
        )}
      </Section>
    </DetailPanel>
  )
}
