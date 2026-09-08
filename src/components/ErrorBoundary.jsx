import React from 'react'

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
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    // Runs during render; swaps in the fallback UI.
    return { error }
  }

  componentDidCatch(error, info) {
    // Runs after render; the place to send errors to a logging service later.
    console.error('SmartSync caught a render error:', error, info)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  handleResetData = () => {
    // Escape hatch for corrupt persisted state, which is the most likely
    // cause of a crash that survives a retry.
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
    if (!this.state.error) return this.props.children

    return (
      <div className="standalone-page error-page">
        <div className="empty-state">
          <h2>Something went wrong</h2>
          <p>
            SmartSync hit an unexpected error on this screen. Your saved activities and messages are
            safe.
          </p>

          <div className="button-row wrap">
            <button className="primary-button" onClick={this.handleRetry}>
              Try again
            </button>
            <button className="secondary-button" onClick={this.handleResetData}>
              Reset demo data
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
