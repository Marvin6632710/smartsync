import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, RotateCcw, Scale } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { decideModerationAppeal, watchModerationAppeals } from '../../firebase/admin'
import AdminActionButton from '../AdminActionButton'
import { useConsole } from '../ConsoleContext'
import DataTable from '../ui/DataTable'
import DetailPanel from '../ui/DetailPanel'
import { Badge, Empty, Field, Fields, Section, When } from '../ui'

export default function AppealsPage({ base }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { nameFor, ensureProfile } = useConsole()
  const [appeals, setAppeals] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => watchModerationAppeals(setAppeals, setError), [])
  useEffect(() => {
    appeals.forEach((appeal) => ensureProfile(appeal.subjectId))
  }, [appeals, ensureProfile])

  const ordered = useMemo(
    () => [...appeals].sort((a, b) => (a.status === 'open' ? -1 : b.status === 'open' ? 1 : 0)),
    [appeals],
  )
  const selected = id ? appeals.find((row) => row.id === id) : null
  const columns = [
    {
      key: 'person',
      label: t('adminPowers.appeals.person'),
      render: (row) => (
        <span className="con-cell-main">
          <strong>{nameFor(row.subjectId)}</strong>
          <small>{t(`adminPowers.appealKind.${row.kind}`, { defaultValue: row.kind })}</small>
        </span>
      ),
    },
    {
      key: 'status',
      label: t('console.reports.columns.status'),
      render: (row) => (
        <Badge tone={row.status === 'open' ? 'open' : 'actioned'}>
          {t(`adminPowers.appealStatus.${row.status}`, { defaultValue: row.status })}
        </Badge>
      ),
    },
    {
      key: 'filed',
      label: t('console.reports.columns.filed'),
      render: (row) => <When at={row.createdAt?.toMillis?.() ?? row.createdAt} />,
    },
  ]

  return (
    <div className={`con-page con-split ${selected ? 'with-detail' : ''}`}>
      <div className="con-list">
        {error && <p className="form-error">{t('adminPowers.appeals.loadFailed')}</p>}
        <DataTable
          label={t('adminPowers.appeals.title')}
          columns={columns}
          rows={ordered}
          selectedId={id || null}
          onSelect={(row) => navigate(`${base}/appeals/${row.id}`)}
          empty={
            <Empty
              icon={Scale}
              title={t('adminPowers.appeals.empty')}
              body={t('adminPowers.appeals.emptyBody')}
            />
          }
        />
      </div>
      {selected && (
        <DetailPanel
          eyebrow={t('adminPowers.appeals.one')}
          title={nameFor(selected.subjectId)}
          badges={
            <Badge tone={selected.status === 'open' ? 'open' : 'actioned'}>
              {t(`adminPowers.appealStatus.${selected.status}`, {
                defaultValue: selected.status,
              })}
            </Badge>
          }
          onClose={() => navigate(`${base}/appeals`)}
          footer={
            selected.status === 'open' ? (
              <div className="con-actions">
                <div className="con-action-row">
                  <AdminActionButton
                    action={(reason) =>
                      decideModerationAppeal({
                        appealId: selected.id,
                        decision: 'reverse',
                        reason,
                      })
                    }
                    title={t('adminPowers.appeals.reverseTitle')}
                    body={t('adminPowers.appeals.reverseBody')}
                  >
                    <RotateCcw size={15} /> {t('adminPowers.appeals.reverse')}
                  </AdminActionButton>
                  <AdminActionButton
                    action={(reason) =>
                      decideModerationAppeal({
                        appealId: selected.id,
                        decision: 'uphold',
                        reason,
                      })
                    }
                    title={t('adminPowers.appeals.upholdTitle')}
                    body={t('adminPowers.appeals.upholdBody')}
                    className="danger-button"
                    tone="danger"
                  >
                    <CheckCircle2 size={15} /> {t('adminPowers.appeals.uphold')}
                  </AdminActionButton>
                </div>
              </div>
            ) : null
          }
        >
          <Section title={t('adminPowers.appeals.request')} id="con-appeal-request">
            <blockquote className="con-quote">“{selected.detail}”</blockquote>
            <Fields>
              <Field label={t('adminPowers.appeals.type')}>
                {t(`adminPowers.appealKind.${selected.kind}`, { defaultValue: selected.kind })}
              </Field>
              <Field label={t('console.reports.columns.filed')}>
                <When at={selected.createdAt?.toMillis?.() ?? selected.createdAt} exact />
              </Field>
              <Field label={t('console.accounts.uid')} wide>
                <code>{selected.targetId}</code>
              </Field>
              {selected.outcome && (
                <Field label={t('console.reports.outcome')} wide>
                  {selected.outcome}
                </Field>
              )}
            </Fields>
          </Section>
        </DetailPanel>
      )}
    </div>
  )
}
