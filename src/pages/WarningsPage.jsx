import React from 'react'
import { MessageSquareWarning } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useMyWarnings } from '../hooks/useMyWarnings'
import { formatRelativeTime } from '../utils/time'

/**
 * What you have been warned about.
 *
 * A warning nobody can go back and read is a rumour. The notification says it
 * once and scrolls away; this is the record, and it is the same record a
 * admin sees — there is no second, harsher version of it kept somewhere
 * else. Who issued it is deliberately not shown: the decision is SmartSync's,
 * and naming the individual admin to the person they acted on invites
 * exactly the retaliation the rank exists to prevent.
 */
export default function WarningsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  // A read that failed used to fall through to "Nothing on your record",
  // which on this page of all pages is the one thing it must not say unless
  // it is true; `error` keeps it honest, and Try again makes the listener
  // again. The same record feeds the row in Settings.
  const { warnings, loading, error, retry } = useMyWarnings(user?.uid)

  return (
    <div className="page-content">
      <section className="headline-block">
        <span className="eyebrow">{t('warnings.eyebrow')}</span>
        <h2>{t('warnings.title')}</h2>
        <p className="helper-text">{t('warnings.lead')}</p>
      </section>

      <div className="stack list-stack">
        {warnings.map((warning) => (
          <article className="report-card" key={warning.id}>
            <header>
              <span className="report-kind">
                <MessageSquareWarning size={13} /> {t('warnings.kind')}
              </span>
              <time>{formatRelativeTime(warning.createdAt?.toMillis?.())}</time>
            </header>
            <p className="report-detail-text">“{warning.reason}”</p>
          </article>
        ))}

        {!loading && error && (
          <div className="empty-state" role="alert">
            <MessageSquareWarning size={28} />
            <h3>{t('warnings.loadFailed')}</h3>
            <p>{t('warnings.loadFailedBody')}</p>
            <button className="primary-button" onClick={retry}>
              {t('common.tryAgain')}
            </button>
          </div>
        )}

        {!loading && !error && warnings.length === 0 && (
          <div className="empty-state">
            <MessageSquareWarning size={28} />
            <h3>{t('warnings.nothing')}</h3>
            <p>{t('warnings.nothingBody')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
