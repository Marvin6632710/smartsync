import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { currentLocale } from '../../i18n'
import { formatRelativeTime } from '../../utils/time'

/**
 * The small parts the console is built from. Operational rather than
 * decorative: a badge encodes state in a word and a colour, a stat is a
 * figure and its label, a field is a label and a value. Nothing here knows
 * what a report is.
 */

/** A word with a tone: `data-tone` is what the stylesheet colours by. */
export function Badge({ tone = 'neutral', children, title, className = '' }) {
  return (
    <span className={`con-badge ${className}`} data-tone={tone} title={title}>
      {children}
    </span>
  )
}

const STATUS_TONE = {
  open: 'open',
  mine: 'mine',
  held: 'held',
  stale: 'stale',
  actioned: 'actioned',
  dismissed: 'dismissed',
}

/** A report's working state, as the queue shows it. */
export function StatusBadge({ status, name }) {
  const { t } = useTranslation()
  const label =
    status === 'held' && name
      ? t('console.status.heldBy', { name })
      : t(`console.status.${status}`, { defaultValue: status })
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{label}</Badge>
}

export function RankBadge({ rank }) {
  const { t } = useTranslation()
  if (!rank || rank === 'user') return null
  return <Badge tone={rank}>{t(`moderation.role.${rank}`, { defaultValue: rank })}</Badge>
}

export function TypeBadge({ type }) {
  const { t } = useTranslation()
  return <Badge tone="type">{t(`moderation.targetType.${type}`, { defaultValue: type })}</Badge>
}

/** What a log entry, a warning or a decision did. */
export function KindBadge({ kind }) {
  const { t } = useTranslation()
  return <Badge tone={`kind-${kind}`}>{t(`console.kinds.${kind}`, { defaultValue: kind })}</Badge>
}

/** An account's states, as many as apply. */
export function AccountStateBadges({ suspended, closed, warnings = 0 }) {
  const { t } = useTranslation()
  return (
    <>
      {closed && <Badge tone="closed">{t('console.state.closed')}</Badge>}
      {suspended && !closed && <Badge tone="suspended">{t('console.state.suspended')}</Badge>}
      {warnings > 0 && (
        <Badge tone="warned">{t('moderation.people.warnings', { count: warnings })}</Badge>
      )}
    </>
  )
}

/** A figure and its label. A `to` makes it a way into the list it counts. */
export function Stat({ label, value, hint, tone, to, onClick }) {
  const body = (
    <>
      <span className="con-stat-value">{value ?? '—'}</span>
      <span className="con-stat-label">{label}</span>
      {hint && <span className="con-stat-hint">{hint}</span>}
    </>
  )
  if (to) {
    return (
      <Link className="con-stat" data-tone={tone} to={to}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" className="con-stat" data-tone={tone} onClick={onClick}>
        {body}
      </button>
    )
  }
  return (
    <div className="con-stat" data-tone={tone}>
      {body}
    </div>
  )
}

/** A titled block of a page. */
export function Section({ title, eyebrow, actions, children, className = '', id }) {
  return (
    <section className={`con-section ${className}`} id={id} aria-labelledby={id && `${id}-title`}>
      {(title || actions) && (
        <header className="con-section-head">
          <div>
            {eyebrow && <span className="con-eyebrow">{eyebrow}</span>}
            {title && (
              <h2 className="con-section-title" id={id && `${id}-title`}>
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="con-section-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** A label and its value, in the details panel. */
export function Field({ label, children, wide = false }) {
  return (
    <div className={`con-field ${wide ? 'wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  )
}

export function Fields({ children }) {
  return <dl className="con-fields">{children}</dl>
}

/** Nothing here, said properly. */
export function Empty({ icon: Icon, title, body, action }) {
  return (
    <div className="con-empty">
      {Icon && <Icon size={22} aria-hidden="true" />}
      <strong>{title}</strong>
      {body && <p>{body}</p>}
      {action}
    </div>
  )
}

/**
 * When something happened: relative on the surface, exact underneath —
 * somebody scanning a queue wants "3 h ago", a record wants the date.
 */
export function When({ at, exact = false }) {
  const { i18n } = useTranslation()
  if (!at) return <span className="con-when">—</span>
  const date = new Date(at)
  const full = date.toLocaleString(currentLocale(), {
    numberingSystem: 'latn',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return (
    <time className="con-when" dateTime={date.toISOString()} title={full} lang={i18n.language}>
      {exact ? full : formatRelativeTime(at)}
    </time>
  )
}

/** The keyboard, spelled out at the foot of a list. */
export function KeyHint({ items }) {
  return (
    <p className="con-keys" aria-hidden="true">
      {items.map(([key, what]) => (
        <span key={key}>
          <kbd>{key}</kbd> {what}
        </span>
      ))}
    </p>
  )
}

/** A link into the consumer app, opened in place. */
export function AppLink({ to, children }) {
  return (
    <Link className="con-applink" to={to}>
      {children}
    </Link>
  )
}
