import React from 'react'

import { reportError } from '../utils/reportError'

/**
 * Catches render errors anywhere below it and shows a recoverable screen
 * instead of a blank page.
 *
 * Must be a class component: React has no hook equivalent of
 * componentDidCatch / getDerivedStateFromError.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    // `attempt` is part of the subtree's key, so retrying genuinely rebuilds
    // the children rather than re-rendering the same failed tree. Clearing
    // the error alone re-ran an identical render and threw again on the spot,
    // which made "Try again" look broken rather than unlucky.
    this.state = { error: null, attempt: 0 }
  }

  static getDerivedStateFromError(error) {
    // Runs during render; swaps in the fallback UI.
    return { error }
  }

  componentDidCatch(error, info) {
    // Runs after render. Goes through the one reporting funnel rather than
    // straight to the console, so it lands wherever everything else does.
    reportError('react.render', error, { componentStack: info?.componentStack })
  }

  handleRetry = () => {
    this.setState((current) => ({ error: null, attempt: current.attempt + 1 }))
  }

  handleReload = () => {
    window.location.reload()
  }

  handleResetData = () => {
    // Only device-local view preferences live here now — accounts, activities
    // and messages are in Firestore and are untouched by this. It stays as an
    // escape hatch because a corrupt saved filter is still enough to break a
    // render, and it is the only local state that can.
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('smartsync:'))
        .forEach((key) => localStorage.removeItem(key))
    } catch {
      // Storage may be unavailable; reloading is still worth attempting.
    }
    window.location.href = '/'
  }

  render() {
    if (!this.state.error) {
      return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>
    }

    return (
      <div className="standalone-page error-page">
        <div className="empty-state">
          <h2>Something went wrong</h2>
          <p>
            SmartSync hit an unexpected error on this screen. Your account, activities and messages
            are stored on the server and are not affected.
          </p>

          <div className="button-row wrap">
            <button className="primary-button" onClick={this.handleRetry}>
              Try again
            </button>
            <button className="secondary-button" onClick={this.handleReload}>
              Reload
            </button>
            <button className="secondary-button" onClick={this.handleResetData}>
              Reset local settings
            </button>
          </div>

          <details className="error-details">
            <summary>Technical details</summary>
            <pre>{String(this.state.error?.message || this.state.error)}</pre>
          </details>
        </div>
      </div>
    )
  }
}
