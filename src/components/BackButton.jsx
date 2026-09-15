import React from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * The way out of a subpage.
 *
 * It lives in the top bar rather than in the page, which is the whole point:
 * the bar sits outside the scroller, so leaving a long settings list or a
 * chat no longer means scrolling back to the top first. That was the
 * behaviour before — the control was the first child of the page content and
 * scrolled away with it, which on a long page hid the only way back.
 *
 * `navigate(-1)` where there is history, so it returns to wherever you
 * actually came from; the fallback is for a subpage opened cold from a link,
 * where going "back" would leave the app.
 */
export default function BackButton({ fallback = '/home' }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <button
      className="topbar-back"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(fallback))}
    >
      <ChevronLeft size={20} aria-hidden="true" />
      {t('common.back')}
    </button>
  )
}
