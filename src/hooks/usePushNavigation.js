import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * A tap on a browser notification when the app is already open in a tab
 * the service worker cannot steer directly: the worker asks, the app goes.
 * Only paths of our own are followed.
 */
export function usePushNavigation() {
  const navigate = useNavigate()
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined
    const onMessage = (event) => {
      if (event.data?.type !== 'smartsync:navigate' || !event.data.url) return
      try {
        const url = new URL(event.data.url, window.location.origin)
        if (url.origin === window.location.origin) navigate(url.pathname + url.search)
      } catch {
        // Not a path of ours.
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}
