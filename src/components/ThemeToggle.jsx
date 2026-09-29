import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useThemePreference } from '../theme'

/**
 * Light or dark, from wherever you are.
 *
 * The full choice is three options — light, dark, and whatever the device
 * says — and it stays in Settings, because "follow my device" is a decision
 * somebody makes once. This is the other one: the reader is looking at a
 * screen that is too bright or too dark *now*, and that is not a trip
 * through a settings page, it is one press.
 *
 * So this toggles between the two explicit choices. From `system` it takes
 * the opposite of whatever is currently on screen, which is what pressing
 * it means at that moment — and stops following the device, which is the
 * honest reading of somebody overriding it by hand. Settings is where they
 * hand that back.
 *
 * The label says what the press will do rather than what the icon is, so a
 * screen reader hears an action instead of a state.
 */
export default function ThemeToggle({ className = '' }) {
  const { t } = useTranslation()
  const { resolved, setThemePreference } = useThemePreference()
  const next = resolved === 'dark' ? 'light' : 'dark'
  const Icon = resolved === 'dark' ? Sun : Moon
  return (
    <button
      type="button"
      className={`icon-button theme-toggle ${className}`}
      onClick={() => setThemePreference(next)}
      aria-label={t(`theme.switchTo.${next}`)}
      title={t(`theme.switchTo.${next}`)}
    >
      <Icon size={19} />
    </button>
  )
}
