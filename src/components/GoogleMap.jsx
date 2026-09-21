import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MIN_ZOOM, THAILAND_BOUNDS } from '../data/region'
import { getThemePreference, resolveTheme } from '../theme'
import { googleMapId, loadGoogleMaps, watchMapAuthenticationFailure } from '../services/googleMaps'
import { mapPoint } from '../utils/maps'

const MapContext = createContext(null)

export function useGoogleMap() {
  return useContext(MapContext)
}

export function useGoogleMapEvents(handlers) {
  const { map } = useGoogleMap()
  useEffect(() => {
    const listeners = Object.entries(handlers).map(([name, handler]) =>
      map.addListener(name, handler),
    )
    return () => listeners.forEach((listener) => listener.remove())
  }, [map, handlers])
}

/** Owns Google's imperative map, while marker content stays ordinary React. */
export default function GoogleMap({ center, zoom, gestureHandling = 'greedy', children }) {
  const { t } = useTranslation()
  const container = useRef(null)
  const initial = useRef({ center, zoom, gestureHandling })
  const [state, setState] = useState({ map: null, api: null, error: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    let authenticationFailed = false
    let map
    let api
    const host = container.current
    const stopWatching = watchMapAuthenticationFailure(() => {
      authenticationFailed = true
      if (active) setState({ map: null, api: null, error: true })
    })
    loadGoogleMaps()
      .then((loaded) => {
        if (!active) return
        api = loaded
        const theme =
          getThemePreference() === 'system' ? 'FOLLOW_SYSTEM' : resolveTheme().toUpperCase()
        map = new api.Map(host, {
          center: mapPoint(initial.current.center),
          zoom: initial.current.zoom,
          minZoom: MIN_ZOOM,
          restriction: { latLngBounds: THAILAND_BOUNDS, strictBounds: true },
          mapId: googleMapId,
          colorScheme: api.ColorScheme[theme],
          // Flat maps preserve the existing pixel-based clustering and avoid
          // camera rotation changing what "overlapping pins" means.
          renderingType: api.RenderingType.RASTER,
          tilt: 0,
          heading: 0,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: api.ControlPosition.LEFT_BOTTOM },
          clickableIcons: false,
          gestureHandling: initial.current.gestureHandling,
        })
        if (!authenticationFailed) setState({ map, api, error: false })
      })
      .catch(() => {
        if (active) setState({ map: null, api: null, error: true })
      })
    return () => {
      active = false
      stopWatching()
      if (map) api.event.clearInstanceListeners(map)
      host.replaceChildren()
    }
  }, [attempt])

  const retry = () => {
    setState({ map: null, api: null, error: false })
    setAttempt((value) => value + 1)
  }

  return (
    <div className="google-map-frame">
      <div ref={container} className="google-map-canvas" />
      {!state.map && (
        <div className="map-load-state" role={state.error ? 'alert' : 'status'}>
          <MapPin size={24} aria-hidden="true" />
          <strong>{t(state.error ? 'map.unavailable' : 'map.loading')}</strong>
          {state.error && (
            <>
              <p>{t('map.loadHelp')}</p>
              <button type="button" className="secondary-button" onClick={retry}>
                {t('common.tryAgain')}
              </button>
            </>
          )}
        </div>
      )}
      {state.map && <MapContext.Provider value={state}>{children}</MapContext.Provider>}
    </div>
  )
}

export function GoogleMarker({
  position,
  title,
  onClick,
  anchorTop = '-100%',
  selected = false,
  children,
}) {
  const { map, api } = useGoogleMap()
  const [content] = useState(() => document.createElement('div'))
  const marker = useRef(null)
  const { lat, lng } = mapPoint(position)

  useEffect(() => {
    const current = new api.AdvancedMarkerElement({ map, anchorTop })
    current.append(content)
    marker.current = current
    return () => {
      current.map = null
      current.remove()
      marker.current = null
    }
  }, [map, api, content, anchorTop])

  useEffect(() => {
    marker.current.position = { lat, lng }
    marker.current.title = title || ''
    marker.current.zIndex = selected ? 1000 : 1
    marker.current.gmpClickable = Boolean(onClick)
    if (!onClick) return
    const current = marker.current
    current.addEventListener('gmp-click', onClick)
    return () => current.removeEventListener('gmp-click', onClick)
  }, [map, api, anchorTop, lat, lng, title, selected, onClick])

  return createPortal(children, content)
}
