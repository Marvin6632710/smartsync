import React from 'react'
import { AlertTriangle } from 'lucide-react'

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
    return (
      <div className="page-content">
        <div className="empty-state">
          <AlertTriangle size={28} />
          <h3>This screen could not load</h3>
          <p>
            Something went wrong here. The rest of SmartSync is still working — use the tabs below
            to go somewhere else, or try this screen again.
          </p>
          <button className="primary-button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    )
  }
}
