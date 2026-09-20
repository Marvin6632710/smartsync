import { AvatarContent } from '../../components/SavedPicture'
import React, { useMemo } from 'react'
import { Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { PEER_LIMIT } from '../../firebase/users'
import { usePeopleSearch } from '../../hooks/usePeopleSearch'
import { useConsole } from '../ConsoleContext'
import { useFilterParams, useStickyState } from '../hooks'
import DataTable from '../ui/DataTable'
import { FilterBar, SearchField, SelectFilter, matches } from '../ui/Filters'
import { AccountStateBadges, Empty, KeyHint, RankBadge } from '../ui'
import AccountDetails from './AccountDetails'

const STATES = ['all', 'suspended', 'closed', 'warned', 'takenDown']
const SHOWN = 40
const DEFAULT_FILTERS = { q: '', state: 'all' }

/**
 * Everyone on SmartSync, with what each person has actually done attached.
 *
 * Reports say where to look; this is for looking without being told. The
 * directory in memory is the peer window — complete up to PEER_LIMIT
 * accounts and silent beyond it — so a search term is also run on the
 * server, and somebody outside the window can still be found, warned or
 * suspended. In-memory rows win where both exist: they are live and carry
 * the counts.
 *
 * Public profile data only. The private half — email, real name behind
 * anonymous mode, stored position — is readable by its owner and by
 * nobody else, an admin included. Oversight here means seeing public
 * behaviour, not opening people's records.
 */
export default function AccountsPage({ base }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { uid } = useParams()
  const { user, app, rankOf, isSuspended, isClosed, warningCount, profileOf, loaded } = useConsole()
  const { directory, allActivities } = app
  const [filters, setFilters] = useStickyState('accounts', DEFAULT_FILTERS)
  const set = (patch) => setFilters((current) => ({ ...current, ...patch }))
  const dirty = filters.q !== '' || filters.state !== 'all'
  useFilterParams(['q', 'state'], (patch) => setFilters({ ...DEFAULT_FILTERS, ...patch }))

  const { found, searching, failed } = usePeopleSearch(filters.q, true)
  const windowFull = directory.size >= PEER_LIMIT

  const people = useMemo(() => {
    const hosted = new Map()
    const joined = new Map()
    for (const activity of allActivities) {
      const host = hosted.get(activity.hostId) || { total: 0, removed: 0 }
      host.total += 1
      if (activity.status === 'removed') host.removed += 1
      hosted.set(activity.hostId, host)
      for (const memberId of activity.participantUids || []) {
        if (memberId !== activity.hostId) joined.set(memberId, (joined.get(memberId) || 0) + 1)
      }
    }
    const everyone = new Map(directory)
    for (const person of found) {
      if (person?.uid && !everyone.has(person.uid)) {
        everyone.set(person.uid, { ...person, inWindow: false })
      }
    }
    return (
      [...everyone.values()]
        .map((person) => ({
          ...person,
          inWindow: person.inWindow !== false,
          rank: rankOf(person.uid),
          suspended: isSuspended(person.uid),
          closed: isClosed(person.uid),
          warnings: warningCount(person.uid),
          hosts: hosted.get(person.uid)?.total || 0,
          removedCount: hosted.get(person.uid)?.removed || 0,
          joinedCount: joined.get(person.uid) || 0,
        }))
        // Anything worth a second look floats up: closed, then suspended,
        // then anyone warned or with something taken down, then by name.
        .sort(
          (a, b) =>
            Number(b.closed) - Number(a.closed) ||
            Number(b.suspended) - Number(a.suspended) ||
            b.warnings - a.warnings ||
            b.removedCount - a.removedCount ||
            (a.name || '').localeCompare(b.name || ''),
        )
    )
  }, [allActivities, directory, found, rankOf, isSuspended, isClosed, warningCount])

  const rows = useMemo(
    () =>
      people.filter((person) => {
        switch (filters.state) {
          case 'suspended':
            if (!person.suspended || person.closed) return false
            break
          case 'closed':
            if (!person.closed) return false
            break
          case 'warned':
            if (person.warnings === 0) return false
            break
          case 'takenDown':
            if (person.removedCount === 0) return false
            break
          default:
        }
        return matches(filters.q, person.name, person.username)
      }),
    [people, filters],
  )

  const columns = [
    {
      key: 'name',
      label: t('console.accounts.columns.person'),
      className: 'con-col-main',
      render: (person) => (
        <span className="con-cell-person">
          <span className="avatar con-person-avatar" aria-hidden="true">
            <AvatarContent person={person} />
          </span>
          <span className="con-cell-main">
            <strong>
              {person.name}
              {person.uid === user.uid ? t('moderation.people.youSuffix') : ''}
            </strong>
            <small>
              {person.username ? `${person.username} · ` : ''}
              {person.inWindow
                ? t('moderation.people.counts', {
                    hosts: person.hosts,
                    joined: person.joinedCount,
                  })
                : t('moderation.people.foundBySearch')}
              {person.anonymous ? t('moderation.people.anonymousOn') : ''}
            </small>
          </span>
        </span>
      ),
    },
    {
      key: 'state',
      label: t('console.accounts.columns.state'),
      render: (person) => (
        <span className="con-badges">
          <RankBadge rank={person.rank} />
          <AccountStateBadges
            suspended={person.suspended}
            closed={person.closed}
            warnings={person.warnings}
          />
          {person.removedCount > 0 && (
            <span className="con-badge" data-tone="kind-remove">
              {t('moderation.people.takenDown', { count: person.removedCount })}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'hosts',
      label: t('console.accounts.columns.hosts'),
      align: 'right',
      render: (person) => (person.inWindow ? person.hosts : '—'),
    },
    {
      key: 'joined',
      label: t('console.accounts.columns.joined'),
      align: 'right',
      render: (person) => (person.inWindow ? person.joinedCount : '—'),
    },
  ]

  return (
    <div className={`con-page con-split ${uid ? 'with-detail' : ''}`}>
      <div className="con-list">
        <p className="con-lead">
          {t('moderation.people.accounts', { count: people.length })}
          {windowFull ? t('moderation.people.loaded') : ''}
          {t('moderation.people.lead')}
        </p>
        {/* Past the window the list is partial, and silently partial is the
            worst kind. Say so, and say what still works. */}
        {windowFull && (
          <p className="con-note" role="status">
            {t('moderation.people.windowNote', { count: people.length })}
          </p>
        )}
        <FilterBar onClear={() => setFilters(DEFAULT_FILTERS)} dirty={dirty}>
          <SearchField
            value={filters.q}
            onChange={(q) => set({ q })}
            label={t('moderation.people.searchLabel')}
            placeholder={t('moderation.people.searchPlaceholder')}
          />
          <SelectFilter
            label={t('console.accounts.columns.state')}
            value={filters.state}
            onChange={(state) => set({ state })}
            options={STATES.map((value) => ({
              value,
              label: t(`console.accounts.states.${value}`),
            }))}
          />
        </FilterBar>
        {searching && (
          <p className="con-note" role="status">
            {t('moderation.people.searching')}
          </p>
        )}
        {failed && (
          <p className="form-error con-note" role="alert">
            {t('moderation.people.searchFailed')}
          </p>
        )}

        <DataTable
          label={t('console.accounts.title')}
          columns={columns}
          rows={rows.slice(0, SHOWN)}
          rowKey={(person) => person.uid}
          selectedId={uid || null}
          onSelect={(person) => navigate(`${base}/accounts/${person.uid}`)}
          loading={!loaded.roles}
          empty={
            <Empty
              icon={Users}
              title={t('moderation.people.nobody')}
              body={t('moderation.people.nobodyBody')}
            />
          }
        />
        {rows.length > SHOWN && (
          <p className="con-note">
            {t('moderation.people.showingFirst', { shown: SHOWN, count: rows.length })}
          </p>
        )}
        <KeyHint
          items={[
            ['↑ ↓', t('console.keys.move')],
            ['⏎', t('console.keys.open')],
            ['/', t('console.keys.search')],
            ['esc', t('console.keys.close')],
          ]}
        />
      </div>

      {uid && (
        <AccountDetails
          uid={uid}
          person={people.find((person) => person.uid === uid) || null}
          profile={profileOf(uid)}
          base={base}
          onClose={() => navigate(`${base}/accounts`)}
        />
      )}
    </div>
  )
}
