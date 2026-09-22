import React, { useMemo, useState } from 'react'
import { MessageSquareWarning, ShieldAlert, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { resolveChatBlock } from '../../firebase/chat'
import { useConsole } from '../ConsoleContext'
import { useStickyState } from '../hooks'
import DataTable from '../ui/DataTable'
import DetailPanel from '../ui/DetailPanel'
import { FilterBar, SearchField, SelectFilter, matches } from '../ui/Filters'
import { AppLink, Badge, Empty, Field, Fields, KeyHint, Section, When } from '../ui'

const DEFAULT_FILTERS = { q: '', status: 'appealed' }
const STATUSES = ['appealed', 'blocked', 'resolved', 'severe', 'all']

/**
 * Messages the moderator refused, and the appeals against them.
 *
 * The queue opens on what somebody has actually asked a human to look at,
 * because that is the only part of this list with a person waiting at the
 * other end. Everything else is there to be looked through, not worked.
 *
 * Two answers. **Upheld** closes it. **Overturned** posts the message —
 * the one they wrote, from the copy the Function held — so putting right
 * a false positive is the message appearing in the thread rather than an
 * apology and a request to type it again. The held copy is deleted in the
 * same write.
 *
 * One kind of entry has no content and no buttons: a flag for sexual
 * content involving minors. Nothing was kept, deliberately (ADR-033), and
 * what to do about it is not a click in a console — it is the obligation
 * written down in README §11.
 */
export default function ChatBlocksPage({ base }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { blocks, nameFor, activityById } = useConsole()
  const [filters, setFilters] = useStickyState('chatBlocks', DEFAULT_FILTERS)
  const [busy, setBusy] = useState(null)
  const [answered, setAnswered] = useState({})
  const set = (patch) => setFilters((current) => ({ ...current, ...patch }))
  const dirty = Object.keys(DEFAULT_FILTERS).some((key) => filters[key] !== DEFAULT_FILTERS[key])

  const rows = useMemo(
    () =>
      blocks.filter((row) => {
        const status = answered[row.id] || row.status
        switch (filters.status) {
          case 'appealed':
            if (!row.appealed || status !== 'blocked') return false
            break
          case 'blocked':
            if (status !== 'blocked') return false
            break
          case 'resolved':
            if (status !== 'upheld' && status !== 'overturned') return false
            break
          case 'severe':
            if (status !== 'severe') return false
            break
          default:
            break
        }
        return matches(filters.q, row.text, nameFor(row.uid), row.reason, row.activityId)
      }),
    [blocks, filters, nameFor, answered],
  )

  const selected = rows.find((row) => row.id === id) || blocks.find((row) => row.id === id) || null
  const statusOf = (row) => answered[row.id] || row.status

  const answer = async (row, decision) => {
    setBusy(row.id)
    try {
      const result = await resolveChatBlock(row.id, decision)
      // The listener will catch up; this is so the buttons stop being
      // offered the moment they have been used.
      if (result?.status === 'overturned' || result?.status === 'upheld') {
        setAnswered((current) => ({ ...current, [row.id]: result.status }))
      }
    } finally {
      setBusy(null)
    }
  }

  const columns = [
    {
      key: 'who',
      label: t('console.blocks.who'),
      render: (row) => nameFor(row.uid),
    },
    {
      key: 'reason',
      label: t('console.blocks.reason'),
      render: (row) => (
        <Badge tone={row.severe ? 'danger' : 'warning'}>
          {t(`console.blocks.reasons.${row.reason}`, { defaultValue: row.reason })}
        </Badge>
      ),
    },
    {
      key: 'what',
      label: t('console.blocks.what'),
      render: (row) =>
        row.contentHeld === false ? (
          <span className="con-muted">{t('console.blocks.noContent')}</span>
        ) : (
          <span className="con-clip">
            {row.hasImage ? `🖼 ${row.text || ''}` : row.text || t('console.blocks.pictureOnly')}
          </span>
        ),
    },
    {
      key: 'status',
      label: t('console.blocks.status'),
      render: (row) => (
        <Badge tone={statusOf(row) === 'overturned' ? 'good' : 'neutral'}>
          {t(`console.blocks.statuses.${statusOf(row)}`, { defaultValue: statusOf(row) })}
          {row.appealed && statusOf(row) === 'blocked' ? ` · ${t('console.blocks.appealed')}` : ''}
        </Badge>
      ),
    },
    {
      key: 'when',
      label: t('console.blocks.when'),
      render: (row) => <When at={row.createdAt} />,
      align: 'right',
    },
  ]

  return (
    <div className={`con-page con-split ${selected ? 'with-detail' : ''}`}>
      <div className="con-list">
        <FilterBar onClear={() => setFilters(DEFAULT_FILTERS)} dirty={dirty}>
          <SearchField
            value={filters.q}
            onChange={(q) => set({ q })}
            label={t('console.blocks.search')}
            placeholder={t('console.blocks.searchPlaceholder')}
          />
          <SelectFilter
            label={t('console.blocks.status')}
            value={filters.status}
            onChange={(status) => set({ status })}
            options={STATUSES.map((value) => ({
              value,
              label: t(`console.blocks.filters.${value}`),
            }))}
          />
        </FilterBar>

        <DataTable
          label={t('console.nav.blocks')}
          columns={columns}
          rows={rows}
          selectedId={selected?.id || null}
          onSelect={(row) => navigate(`${base}/${row.id}`)}
          empty={
            <Empty
              icon={MessageSquareWarning}
              title={t('console.blocks.emptyTitle')}
              body={t('console.blocks.emptyBody')}
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
        <DetailPanel
          title={t('console.blocks.detailTitle')}
          eyebrow={t(`console.blocks.reasons.${selected.reason}`, {
            defaultValue: selected.reason,
          })}
          onClose={() => navigate(base)}
        >
          <Section title={t('console.blocks.about')}>
            <Fields>
              <Field label={t('console.blocks.who')}>
                <AppLink to={`/admin/accounts/${selected.uid}`}>{nameFor(selected.uid)}</AppLink>
              </Field>
              <Field label={t('console.blocks.activity')}>
                {activityById.get(selected.activityId)?.title || selected.activityId}
              </Field>
              <Field label={t('console.blocks.when')}>
                <When at={selected.createdAt} />
              </Field>
              <Field label={t('console.blocks.status')}>
                {t(`console.blocks.statuses.${statusOf(selected)}`, {
                  defaultValue: statusOf(selected),
                })}
              </Field>
              <Field label={t('console.blocks.categories')} wide>
                {(selected.categories || []).join(', ') || '—'}
              </Field>
            </Fields>
          </Section>

          {selected.severe ? (
            <Section title={t('console.blocks.severeTitle')}>
              <p className="con-note form-error">
                <ShieldAlert size={16} aria-hidden="true" />
                {t('console.blocks.severeBody')}
              </p>
            </Section>
          ) : (
            <>
              <Section title={t('console.blocks.content')}>
                {selected.contentHeld === false ? (
                  <p className="con-muted">{t('console.blocks.noContent')}</p>
                ) : (
                  <div className="con-blocked-content">
                    {selected.dataUrl && (
                      <img src={selected.dataUrl} alt={t('console.blocks.pictureAlt')} />
                    )}
                    {selected.text && <p>{selected.text}</p>}
                  </div>
                )}
              </Section>

              {statusOf(selected) === 'blocked' && selected.contentHeld !== false && (
                <Section title={t('console.blocks.decide')}>
                  <p className="con-muted">{t('console.blocks.decideHint')}</p>
                  <div className="con-actions">
                    <button
                      className="danger-button"
                      disabled={busy === selected.id}
                      onClick={() => answer(selected, 'uphold')}
                    >
                      <ThumbsDown size={15} aria-hidden="true" /> {t('console.blocks.uphold')}
                    </button>
                    <button
                      className="primary-button"
                      disabled={busy === selected.id}
                      onClick={() => answer(selected, 'overturn')}
                    >
                      <ThumbsUp size={15} aria-hidden="true" /> {t('console.blocks.overturn')}
                    </button>
                  </div>
                </Section>
              )}
            </>
          )}
        </DetailPanel>
      )}
    </div>
  )
}
