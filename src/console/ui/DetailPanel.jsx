import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * The details of the selected record, beside the list on a wide screen
 * and over it on a narrow one. Escape closes it; focus moves to its
 * heading when it opens so a keyboard user lands on what they chose.
 * Its header stays put while the body scrolls, so the actions in the
 * header are always to hand.
 */
export default function DetailPanel({ title, eyebrow, badges, onClose, children, footer }) {
  const { t } = useTranslation()
  const headingRef = useRef(null)
  const titleKey = typeof title === 'string' ? title : null

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [titleKey])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      // A confirm dialog above the panel owns Escape while it is open.
      if (document.querySelector('.dialog-backdrop')) return
      const target = event.target
      if (target instanceof HTMLInputElement && target.type === 'search' && target.value) return
      onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside className="con-detail" aria-labelledby="con-detail-title">
      <header className="con-detail-head">
        <div className="con-detail-titles">
          {eyebrow && <span className="con-eyebrow">{eyebrow}</span>}
          <h2 id="con-detail-title" ref={headingRef} tabIndex={-1}>
            {title}
          </h2>
          {badges && <div className="con-detail-badges">{badges}</div>}
        </div>
        <button
          type="button"
          className="icon-button con-detail-close"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <X size={18} />
        </button>
      </header>
      <div className="con-detail-body">{children}</div>
      {footer && <footer className="con-detail-foot">{footer}</footer>}
    </aside>
  )
}
