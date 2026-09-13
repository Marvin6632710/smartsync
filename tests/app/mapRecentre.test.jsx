// @vitest-environment jsdom
/**
 * When the two maps move the view, and when they leave it alone.
 *
 * Both used to move it on every render: Discover's map re-fitted to the pins
 * each time the minute clock rebuilt the activity list, snapping the view
 * back while somebody was panning; the picker recentred on its pin on every
 * keystroke in the title field. react-leaflet is replaced by a fake that
 * records what the map was told to do.
 */
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const map = {
  setView: vi.fn(),
  fitBounds: vi.fn(),
  getZoom: () => 12,
  project: (latlng) => ({ x: latlng[0] * 1000, y: latlng[1] * 1000 }),
  unproject: (p) => ({ lat: p[0] / 1000, lng: p[1] / 1000 }),
}
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => map,
  useMapEvents: () => map,
}))
vi.mock('leaflet/dist/leaflet.css', () => ({}))

let app = {}
vi.mock('../../src/context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', location: null } }),
}))
vi.mock('../../src/hooks/useDeviceLocation', () => ({
  useDeviceLocation: () => ({ request: vi.fn(), busy: false }),
}))

const { default: MapPage } = await import('../../src/pages/MapPage')
const { default: LocationPicker } = await import('../../src/components/LocationPicker')

const place = (id, lat, lng, extra = {}) => ({
  id,
  title: id,
  category: 'Coffee',
  status: 'active',
  lat,
  lng,
  participants: 1,
  capacity: 5,
  matchScore: 50,
  locationName: 'x',
  ...extra,
})

beforeEach(() => {
  map.setView.mockClear()
  map.fitBounds.mockClear()
})
afterEach(cleanup)

describe("Discover's map", () => {
  const view = () => (
    <MemoryRouter>
      <MapPage />
    </MemoryRouter>
  )

  test('fits the pins once, and not again when the same list is rebuilt', () => {
    app = { filteredActivities: [place('a', 13.7, 100.5), place('b', 13.8, 100.6)], loading: false }
    const { rerender } = render(view())
    expect(map.fitBounds).toHaveBeenCalledTimes(1)

    // The clock ticks: every object is new, nothing about the places is.
    app = { ...app, filteredActivities: app.filteredActivities.map((a) => ({ ...a })) }
    rerender(view())
    // Somebody joins: the roster changed, the places did not.
    app = {
      ...app,
      filteredActivities: app.filteredActivities.map((a) => ({ ...a, participants: 3 })),
    }
    rerender(view())
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
  })

  test('re-fits when the places on it change', () => {
    app = { filteredActivities: [place('a', 13.7, 100.5), place('b', 13.8, 100.6)], loading: false }
    const { rerender } = render(view())
    app = { ...app, filteredActivities: [place('a', 13.7, 100.5)] }
    rerender(view())
    // One pin gets a setView rather than a fit — that contract is unchanged.
    expect(map.setView).toHaveBeenCalledWith([13.7, 100.5], 14)
    app = { ...app, filteredActivities: [place('a', 13.7, 100.5), place('c', 18.7, 98.9)] }
    rerender(view())
    expect(map.fitBounds).toHaveBeenCalledTimes(2)
  })
})

describe('the location picker', () => {
  test('recentres when the pin moves, not when the rest of the form changes', () => {
    const onChange = vi.fn()
    const value = { title: '', locationName: 'Park', lat: 13.7, lng: 100.5 }
    const { rerender } = render(<LocationPicker value={value} onChange={onChange} />)
    expect(map.setView).toHaveBeenCalledTimes(1)

    // Typing the title: a new form object, same pin.
    rerender(<LocationPicker value={{ ...value, title: 'Satur' }} onChange={onChange} />)
    rerender(<LocationPicker value={{ ...value, title: 'Saturday' }} onChange={onChange} />)
    expect(map.setView).toHaveBeenCalledTimes(1)

    // Moving the pin.
    rerender(<LocationPicker value={{ ...value, lat: 13.75, lng: 100.52 }} onChange={onChange} />)
    expect(map.setView).toHaveBeenCalledTimes(2)
    expect(map.setView).toHaveBeenLastCalledWith([13.75, 100.52], 12)
  })

  test('does nothing until a pin exists', () => {
    render(<LocationPicker value={{ title: '', lat: null, lng: null }} onChange={vi.fn()} />)
    expect(map.setView).not.toHaveBeenCalled()
  })
})
