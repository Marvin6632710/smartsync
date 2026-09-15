import React from 'react'
import { AlertTriangle } from 'lucide-react'

import i18n from '../i18n'
import { isChunkLoadError } from '../utils/lazyRoute'
import { reportError } from '../utils/reportError'

/**
 * Catches a render error in one screen without taking the app with it.
 *
 * There was one boundary, at the root, so any component that threw replaced
 * the entire application — shell, navigation and all — with a full-page error.
 * A person whose Profile screen failed lost their way back to Discover along
 * with it, and the only route out was reloading.
 *
 * Scoped here, the bar and the tabs keep working and the failure stays the
 * size it actually is. `resetKey` is the current path, so simply navigating
 * elsewhere clears it: the common case fixes itself without anybody pressing
 * anything.
 */
export default class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    // Navigating away is itself the retry.
    if (state.error && props.resetKey !== state.key) return { error: null, key: props.resetKey }
    return { key: props.resetKey }
  }

  componentDidCatch(error, info) {
    reportError('react.route', error, {
      route: this.props.resetKey,
      componentStack: info?.componentStack,
    })
  }

  render() {
    if (!this.state.error) return this.props.children
    // A chunk the server no longer has cannot be retried in place: React.lazy
    // keeps the rejection, so "Try again" threw the same error without a
    // network request. Only a reload — which fetches the new index.html and
    // the chunks it names — can help, so that is what is offered.
    const stale = isChunkLoadError(this.state.error)
    const t = i18n.t.bind(i18n)
    return (
      <div className="page-content">
        <div className="empty-state">
          <AlertTriangle size={28} />
          <h3>{t('errors.screenFailed')}</h3>
          <p>{stale ? t('errors.staleBody') : t('errors.routeBody')}</p>
          {stale ? (
            <button className="primary-button" onClick={() => window.location.reload()}>
              {t('common.reload')}
            </button>
          ) : (
            <button className="primary-button" onClick={() => this.setState({ error: null })}>
              {t('common.tryAgain')}
            </button>
          )}
        </div>
      </div>
    )
  }
}
