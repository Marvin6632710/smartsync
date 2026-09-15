import React from 'react'
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LANGUAGES, languageOf, setLanguage } from '../i18n'

/**
 * The language switch.
 *
 * A native select, styled as one of the app's pills: it opens the platform's
 * own picker on a phone, is reachable from the keyboard, and reads its
 * options to a screen reader without any help — and every option is the
 * language's own name for itself, because the one person who needs this
 * control is the one who cannot read the others.
 *
 * `compact` is the form for the entry screens, where it sits in a corner
 * before anybody has signed in; the settings screen gives it a row.
 */
export default function LanguageMenu({ compact = false }) {
  const { t, i18n } = useTranslation()
  const current = languageOf(i18n.language).code
  return (
    <label className={`language-menu ${compact ? 'compact' : ''}`}>
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{t('language.select')}</span>
      <select value={current} onChange={(event) => setLanguage(event.target.value)}>
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code} lang={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  )
}
