import React from 'react'
import { useTranslation } from 'react-i18next'

import { personName } from '../i18n'
import { useApp } from '../context/AppContext'

/**
 * The faces of the people already going.
 *
 * A count told you three people had joined. It did not tell you that this is
 * a thing other humans are doing — which, for an app whose entire purpose is
 * meeting people, is the fact that matters most on the card. Costs nothing:
 * these profiles are already loaded for matching, so nothing extra is read.
 *
 * Identity here is the public one. Anonymity is resolved where the profile is
 * written, not here, so somebody in anonymous mode is already carrying the
 * anonymous name and avatar by the time this sees them — there is no way for
 * this component to leak a real name by forgetting to check.
 */
export default function GoingStack({ uids = [], capacity = null, max = 3 }) {
  const { t } = useTranslation()
  const { directory } = useApp()
  const unknown = { name: t('common.unknownUser'), avatar: '?' }
  const list = Array.isArray(uids) ? uids : []
  const shown = list.slice(0, max).map((uid) => ({ uid, person: directory.get(uid) || unknown }))
  const extra = Math.max(0, list.length - shown.length)

  if (list.length === 0) {
    return <span className="going-line empty">{t('card.beFirst')}</span>
  }

  return (
    <span className="going-line">
      {/* The faces are the decoration; the sentence beside them is what a
          screen reader should read, so the stack itself is hidden from it. */}
      <span className="going-stack" aria-hidden="true">
        {shown.map(({ uid, person }) => (
          <span className="going-face" key={uid} title={personName(person.name)}>
            {person.avatar || '?'}
          </span>
        ))}
        {extra > 0 && <span className="going-face more">+{extra}</span>}
      </span>
      {/* "3 going" alone lost what the old "3/18" said: whether three means
          nearly full or barely started. The capacity comes back — and the
          whole sentence goes to assistive tech, which got nothing before,
          since the meter that encodes this visually is aria-hidden. */}
      <span
        className="going-count"
        aria-label={
          capacity
            ? t('card.ofCapacityGoing', { count: list.length, capacity })
            : t('card.going', { count: list.length })
        }
      >
        {capacity
          ? t('card.ofCapacity', { count: list.length, capacity })
          : t('card.going', { count: list.length })}
      </span>
    </span>
  )
}
