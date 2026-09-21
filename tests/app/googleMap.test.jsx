// @vitest-environment jsdom
import React, { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { loadGoogleMaps, watchMapAuthenticationFailure } = vi.hoisted(() => ({
  loadGoogleMaps: vi.fn(),
  watchMapAuthenticationFailure: vi.fn(),
}))
vi.mock('../../src/services/googleMaps', () => ({
  googleMapId: 'test-map-id',
  loadGoogleMaps,
  watchMapAuthenticationFailure,
}))
const { default: GoogleMap, GoogleMarker } = await import('../../src/components/GoogleMap')
const maps = []
const markers = []
const stopWatching = vi.fn()
let failAuthentication
const api = {
  Map: vi.fn(function (host, options) {
    const map = { host, options, addListener: vi.fn(() => ({ remove: vi.fn() })) }
    maps.push(map)
    return map
  }),
  AdvancedMarkerElement: vi.fn(function (options) {
    const marker = Object.assign(document.createElement('div'), options)
    options.map.host.append(marker)
    markers.push(marker)
    return marker
  }),
  ColorScheme: { LIGHT: 'LIGHT', DARK: 'DARK', FOLLOW_SYSTEM: 'FOLLOW_SYSTEM' },
  RenderingType: { RASTER: 'RASTER' },
  ControlPosition: { LEFT_BOTTOM: 'LEFT_BOTTOM' },
  event: { clearInstanceListeners: vi.fn() },
}
const center = [13.7, 100.5]

beforeEach(() => {
  maps.length = 0
  markers.length = 0
  vi.clearAllMocks()
  loadGoogleMaps.mockReset().mockResolvedValue(api)
  watchMapAuthenticationFailure.mockImplementation((callback) => {
    failAuthentication = callback
    return stopWatching
  })
})
afterEach(cleanup)

test('StrictMode creates one map, bounds it to Thailand and preserves it on parent rerenders', async () => {
  const view = (point) => (
    <StrictMode>
      <GoogleMap center={point} zoom={12}>
        <span>Map ready</span>
      </GoogleMap>
    </StrictMode>
  )
  const { rerender } = render(view(center))
  await screen.findByText('Map ready')
  expect(api.Map).toHaveBeenCalledTimes(1)
  expect(maps[0].options).toMatchObject({
    center: { lat: 13.7, lng: 100.5 },
    mapId: 'test-map-id',
    minZoom: 5,
    restriction: {
      strictBounds: true,
      latLngBounds: { north: 20.6, south: 5.5, east: 105.7, west: 97.2 },
    },
    renderingType: 'RASTER',
    clickableIcons: false,
  })
  rerender(view([13.8, 100.6]))
  expect(api.Map).toHaveBeenCalledTimes(1)
})

test('unmounting during SDK loading prevents a detached map from being created', async () => {
  let finish
  loadGoogleMaps.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { unmount } = render(<GoogleMap center={center} zoom={12} />)
  unmount()
  await act(async () => finish(api))
  expect(api.Map).not.toHaveBeenCalled()
  expect(stopWatching).toHaveBeenCalled()
})

test('a failed load shows a retry action and can recover without reloading the page', async () => {
  loadGoogleMaps.mockRejectedValueOnce(new Error('offline'))
  render(
    <GoogleMap center={center} zoom={12}>
      <span>Map ready</span>
    </GoogleMap>,
  )
  expect(await screen.findByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByText('Map ready')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('Google authentication failure after loading replaces the map with a useful error', async () => {
  render(
    <GoogleMap center={center} zoom={12}>
      <span>Map ready</span>
    </GoogleMap>,
  )
  await screen.findByText('Map ready')
  act(() => failAuthentication())
  expect(screen.getByText('Map unavailable')).toBeTruthy()
  expect(screen.queryByText('Map ready')).toBeNull()
})

test('advanced markers update without recreation, use text-safe content and clean up listeners', async () => {
  const onClick = vi.fn()
  const label = '<img src=x onerror=alert(1)>'
  const view = (lat) => (
    <GoogleMap center={center} zoom={12}>
      <GoogleMarker position={{ lat, lng: 100.5 }} title={label} onClick={onClick}>
        {label}
      </GoogleMarker>
    </GoogleMap>
  )
  const { rerender, unmount } = render(view(13.7))
  await waitFor(() => expect(markers).toHaveLength(1))
  const marker = markers[0]
  expect(marker.position).toEqual({ lat: 13.7, lng: 100.5 })
  expect(marker.textContent).toBe(label)
  expect(marker.querySelector('img')).toBeNull()
  fireEvent(marker, new Event('gmp-click'))
  expect(onClick).toHaveBeenCalledTimes(1)
  rerender(view(13.8))
  expect(markers).toHaveLength(1)
  expect(marker.position.lat).toBe(13.8)
  unmount()
  expect(marker.map).toBeNull()
  fireEvent(marker, new Event('gmp-click'))
  expect(onClick).toHaveBeenCalledTimes(1)
  expect(api.event.clearInstanceListeners).toHaveBeenCalledWith(maps[0])
})
