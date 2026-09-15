import React, { useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from '../components/ConfirmDialog'
import { useApp } from '../context/AppContext'
import { formatRelativeTime } from '../utils/time'

/**
 * The list of people you have blocked, and the only way back.
 *
 * A block that cannot be undone is a trap rather than a control, and one that
 * can only be undone by finding the person again is barely better — the whole
 * point is that you no longer see them anywhere.
 */
export default function BlockedPage() {
  const { t } = useTranslation()
  const { blocked, unblockPerson } = useApp()
  const [confirming, setConfirming] = useState(null)

  return (
    <div className="page-content">
      <section className="headline-block">
        <span className="eyebrow">{t('blocked.eyebrow')}</span>
        <h2>{t('blocked.title')}</h2>
        <p className="helper-text">{t('blocked.lead')}</p>
      </section>

      <div className="stack">
        {blocked.map((person) => (
          <div className="person-card" key={person.uid}>
            <div className="avatar">{person.avatar || '?'}</div>
            <div>
              <h3>{person.name}</h3>
              {/* The stored name is a snapshot from the moment of blocking, so
                  this list stays readable even if they rename themselves or
                  turn on anonymous mode afterwards. The timestamp is absent
                  for a moment while the write is still local. */}
              <p>
                {person.createdAt?.toMillis
                  ? t('blocked.blockedAt', {
                      when: formatRelativeTime(person.createdAt.toMillis()),
                    })
                  : t('blocked.blocked')}
              </p>
            </div>
            <button className="text-button" onClick={() => setConfirming(person)}>
              {t('blocked.unblock')}
            </button>
          </div>
        ))}

        {blocked.length === 0 && (
          <div className="empty-state">
            <ShieldOff size={28} />
            <h3>{t('blocked.nobody')}</h3>
            <p>{t('blocked.nobodyBody')}</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={t('blocked.dialogTitle', { name: confirming?.name })}
        body={t('blocked.dialogBody')}
        confirmLabel={t('blocked.unblock')}
        cancelLabel={t('blocked.keepBlocked')}
        onConfirm={() => {
          unblockPerson(confirming.uid)
          setConfirming(null)
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}
