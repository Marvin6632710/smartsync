import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import { installGlobalErrorReporting } from './utils/reportError'
// The interface's languages, initialised before the first render so nothing
// paints in one language and then switches.
import './i18n'
// The theme's listeners (device setting, other tabs) attach at startup; the
// document is already stamped by public/theme-boot.js before this runs.
import './theme'
import './styles.css'

// Before anything renders, so a failure during the first paint is caught too.
installGlobalErrorReporting()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        {/* Identity first: application data is scoped to whoever is signed in. */}
        <AuthProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
