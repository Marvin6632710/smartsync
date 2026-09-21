import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

export const googleMapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || ''
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || ''
let configured = false
let pending
let authenticationFailed = false
const failures = new Set()

export function watchMapAuthenticationFailure(callback) {
  failures.add(callback)
  if (authenticationFailed) callback()
  return () => failures.delete(callback)
}

/** Load Google's SDK only when a map is mounted, once across all map routes. */
export function loadGoogleMaps() {
  if (!apiKey || !googleMapId) return Promise.reject(new Error('maps/not-configured'))
  if (authenticationFailed) return Promise.reject(new Error('maps/authentication-failed'))
  if (pending) return pending
  if (!configured) {
    setOptions({ key: apiKey, v: 'quarterly', region: 'TH', mapIds: [googleMapId] })
    // Key restrictions, API activation and billing failures can arrive after
    // the script loaded successfully. Do not leave a grey map in that case.
    const previous = window.gm_authFailure
    window.gm_authFailure = () => {
      authenticationFailed = true
      failures.forEach((callback) => callback())
      previous?.()
    }
    configured = true
  }
  pending = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('maps/load-timeout')), 15000)
    Promise.all([importLibrary('maps'), importLibrary('core'), importLibrary('marker')]).then(
      ([maps, core, marker]) => {
        clearTimeout(timeout)
        if (authenticationFailed) reject(new Error('maps/authentication-failed'))
        else resolve({ ...core, ...maps, ...marker })
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  }).catch((error) => {
    pending = null
    throw error
  })
  return pending
}
