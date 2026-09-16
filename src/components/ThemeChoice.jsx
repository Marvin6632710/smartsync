import React from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { THEMES, useThemePreference } from '../theme'

const ICONS = { light: Sun, dark: Moon, system: Monitor }

/**
 * The appearance switch: three options side by side, one of them chosen.
 *
 * A radio group rather than a select, because there are only three and
 * seeing all of them is the point. The chosen one is filled *and* carries a
 * tick in place of its icon, so the choice reads without colour; the arrow
 * keys move between them the way a radio group expects.
 */
export default function ThemeChoice() {
  const { t } = useTranslation()
  const { preference, setThemePreference } = useThemePreference()

  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const index = THEMES.indexOf(preference)
    const next = THEMES[(index + step + THEMES.length) % THEMES.length]
    setThemePreference(next)
    event.currentTarget.querySelector(`[data-theme-option="${next}"]`)?.focus()
  }

  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={t('theme.select')}
      onKeyDown={onKeyDown}
    >
      {THEMES.map((theme) => {
        const Icon = ICONS[theme]
        const selected = theme === preference
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-theme-option={theme}
            className={`segment ${selected ? 'selected' : ''}`}
            onClick={() => setThemePreference(theme)}
          >
            {/* The tick takes the place of the option's own icon, so choosing
                a cell never changes its width — a label that fits unchosen
                fits chosen. */}
            {selected ? (
              <Check size={15} aria-hidden="true" className="segment-check" />
            ) : (
              <Icon size={15} aria-hidden="true" />
            )}
            <span>{t(`theme.${theme}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
