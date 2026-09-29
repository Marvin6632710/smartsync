import React from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * The sheet revealed above the list while it is pulled down.
 *
 * It is `aria-hidden`: the gesture it belongs to needs a pointer, so nothing
 * a screen reader could act on is being described. What it does announce is
 * the outcome — that the list is reloading — through a live region that is
 * empty at every other moment, so the labels do not narrate the pull itself.
 *
 * The distance comes from the scroller as a custom property rather than from
 * a prop. See usePullToRefresh for why.
 *
 * The pill is a wrapper with nothing to show for itself while the sheet is
 * part of the page — the spinner has its own outline there, and it sits in a
 * gap with nothing behind it. Once the refresh starts the sheet is pinned to
 * the window instead, over whatever the reader has scrolled to, and the pill
 * is what separates it from that.
 */
export default function PullToRefresh({ phase }) {
  const { t } = useTranslation()
  const label =
    phase === 'busy'
      ? t('shell.refreshing')
      : phase === 'armed'
        ? t('shell.releaseToRefresh')
        : t('shell.pullToRefresh')
  return (
    <>
      <div className="pull-sheet" data-phase={phase} aria-hidden="true">
        <span className="pull-pill">
          <span className="pull-spinner">
            <RefreshCw size={17} />
          </span>
          <span className="pull-label">{label}</span>
        </span>
      </div>
      <span className="sr-only" role="status">
        {phase === 'busy' ? t('shell.refreshing') : ''}
      </span>
    </>
  )
}
