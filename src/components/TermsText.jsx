import React from 'react'
import { useTranslation } from 'react-i18next'

import { TERMS_RULES, TERMS_SECTIONS, TERMS_VERSION } from '../terms'

/**
 * The full Terms & Conditions and Safety Guidelines, as a document.
 *
 * Shown from the agreement screen's "read the full text" link and at
 * /terms afterwards, so the same words are what was agreed to and what
 * can be looked up later. Every section is a heading and one or more
 * paragraphs from the translations; the rules section repeats the list
 * the agreement screen shows, so the short form and the long form can
 * never disagree about what is banned.
 */
export default function TermsText({ headingLevel = 2 }) {
  const { t } = useTranslation()
  const Heading = `h${headingLevel}`
  return (
    <div className="terms-text">
      {TERMS_SECTIONS.map((section) => (
        <section key={section} className="terms-section">
          <Heading>{t(`terms.doc.${section}.title`)}</Heading>
          {t(`terms.doc.${section}.body`)
            .split('\n')
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          {section === 'rules' && (
            <ul className="terms-text-rules">
              {TERMS_RULES.map((rule) => (
                <li key={rule}>{t(`terms.rules.${rule}`)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="terms-version">{t('terms.version', { version: TERMS_VERSION })}</p>
    </div>
  )
}
