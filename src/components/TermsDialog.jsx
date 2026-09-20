import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BadgeDollarSign,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Flag,
  Gavel,
  HeartOff,
  LockKeyhole,
  MessageCircleOff,
  Swords,
  UserX,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import BrandMark from './BrandMark'
import LanguageMenu from './LanguageMenu'
import TermsText from './TermsText'
import { TERMS_RULES, TERMS_VERSION, acceptTerms } from '../terms'

/**
 * The Terms & Safety agreement, as a dialog over whatever the app would
 * show: the front door on a first visit, the app itself for somebody
 * signed in when the words change.
 *
 * Rendered by App until the current version has been accepted on this
 * device, above everything and with everything beneath it inert. Unlike
 * the confirm dialog there is no way out that is not the box and the
 * button: no backdrop tap, no Escape, no close. Continue stays disabled
 * until the box is ticked. The full text unfolds inside the dialog, so the
 * tick and the scroll position stay where they were.
 *
 * The language switch is repeated here because the one on the page behind
 * cannot be reached while this is up, and the person who needs it is the
 * one who cannot read the rest.
 */
const ICONS = {
  trafficking: UserX,
  sexual: HeartOff,
  violence: Swords,
  stalking: EyeOff,
  scams: BadgeDollarSign,
  illegal: Gavel,
  hate: MessageCircleOff,
  privateInfo: LockKeyhole,
}

export default function TermsDialog() {
  const { t } = useTranslation()
  const [agreed, setAgreed] = useState(false)
  const [reading, setReading] = useState(false)
  const dialogRef = useRef(null)
  const headingRef = useRef(null)
  const fullTextRef = useRef(null)

  // Focus moves in on open and stays in: Tab wraps within the dialog,
  // because the page behind it is still rendered. The document does not
  // scroll underneath either — the dialog scrolls its own body.
  useEffect(() => {
    const previouslyFocused = document.activeElement
    headingRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return
      const focusables = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input, select',
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [])

  // The full text opens with its first heading in view.
  useEffect(() => {
    if (reading) fullTextRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [reading])

  const submit = (event) => {
    event.preventDefault()
    if (!agreed) return
    acceptTerms()
  }

  return (
    <div className="dialog-backdrop terms-backdrop">
      <div
        className="dialog terms-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-dialog-title"
        aria-describedby="terms-dialog-lead"
        ref={dialogRef}
      >
        <div className="terms-dialog-head">
          <BrandMark tile size={40} />
          <div className="terms-dialog-titles">
            <span className="eyebrow">{t('common.appName')}</span>
            <h2 id="terms-dialog-title" ref={headingRef} tabIndex={-1}>
              {t('terms.title')}
            </h2>
          </div>
          <LanguageMenu compact />
        </div>

        <div className="terms-dialog-body">
          <p id="terms-dialog-lead" className="terms-dialog-lead">
            {t('terms.lead')}
          </p>

          <section className="terms-card" aria-labelledby="terms-never">
            <h3 id="terms-never">{t('terms.neverTitle')}</h3>
            <ul className="terms-rules">
              {TERMS_RULES.map((rule) => {
                const Icon = ICONS[rule]
                return (
                  <li key={rule}>
                    <span className="terms-rule-icon" aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <span>{t(`terms.rules.${rule}`)}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="terms-card terms-enforcement">
            <Flag size={18} aria-hidden="true" />
            <div>
              <p>{t('terms.report')}</p>
              <p>{t('terms.consequences')}</p>
            </div>
          </section>

          <button
            type="button"
            className="text-button terms-read-link"
            aria-expanded={reading}
            aria-controls="terms-full-text"
            onClick={() => setReading((open) => !open)}
          >
            {reading ? t('terms.hideFull') : t('terms.readFull')}
            {reading ? (
              <ChevronUp size={15} aria-hidden="true" />
            ) : (
              <ChevronDown size={15} aria-hidden="true" />
            )}
          </button>

          {reading && (
            <div id="terms-full-text" className="terms-full" ref={fullTextRef}>
              <h3>{t('terms.fullTitle')}</h3>
              <TermsText headingLevel={4} />
            </div>
          )}
        </div>

        <form className="terms-consent" onSubmit={submit}>
          <label className="terms-check">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>{t('terms.agree')}</span>
          </label>
          <button className="primary-button wide" type="submit" disabled={!agreed}>
            {t('common.continue')} <ArrowRight size={17} />
          </button>
          <small className="terms-version">{t('terms.version', { version: TERMS_VERSION })}</small>
        </form>
      </div>
    </div>
  )
}
