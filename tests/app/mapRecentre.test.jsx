// @vitest-environment jsdom
/**
 * When the two maps move the view, and when they leave it alone.
 *
 * Both used to move it on every render: Discover's map re-fitted to the pins
 * each time the minute clock rebuilt the activity list, snapping the view
 * back while somebody was panning; the picker recentred on its pin on every
 * keystroke in the title field. The Google Maps component is replaced by a fake that
 * records what the map was told to do.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const projection = {
  fromLatLngToPoint: (point) => ({
    x: (point.lat() * 1000) / 4096,
    y: (point.lng() * 1000) / 4096,
  }),
  fromPointToLatLng: (point) => ({
    lat: () => (point.x * 4096) / 1000,
    lng: () => (point.y * 4096) / 1000,
  }),
}
const map = {
  setCenter: vi.fn(),
  setZoom: vi.fn(),
  fitBounds: vi.fn(),
  getZoom: () => 12,
  getProjection: () => projection,
}
const api = {
  LatLng: class {
    constructor(point) {
      this.point = point
    }
    lat() {
      return this.point.lat
    }
    lng() {
      return this.point.lng
    }
  },
  Point: class {
    constructor(x, y) {
      this.x = x
      this.y = y
    }
  },
  LatLngBounds: class {
    extend() {
      return this
    }
  },
  event: { addListenerOnce: () => ({ remove: vi.fn() }) },
}
let handlers = {}
vi.mock('../../src/components/GoogleMap', () => ({
  default: ({ children }) => <div>{children}</div>,
  GoogleMarker: ({ title, onClick }) => <button aria-label={title} onClick={onClick} />,
  useGoogleMap: () => ({ map, api }),
  useGoogleMapEvents: (events) => Object.assign(handlers, events),
}))

let app = {}
vi.mock('../../src/context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', location: null } }),
}))
let locationError = ''
vi.mock('../../src/hooks/useDeviceLocation', () => ({
  useDeviceLocation: () => ({ request: vi.fn(), busy: false, error: locationError }),
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
  locationName: 'x',
  ...extra,
})

beforeEach(() => {
  map.setCenter.mockClear()
  map.setZoom.mockClear()
  map.fitBounds.mockClear()
  handlers = {}
  Element.prototype.scrollIntoView = vi.fn()
  locationError = ''
})
afterEach(cleanup)

describe('the location button', () => {
  test('a request that failed is said in the toast rather than swallowed', () => {
    // The map has no form to print an error under; the hook's message used
    // to go nowhere, which made the button look broken.
    const pushCelebration = vi.fn()
    app = { filteredActivities: [], loading: false, pushCelebration }
    const view = () => (
      <MemoryRouter>
        <MapPage />
      </MemoryRouter>
    )
    const { rerender } = render(view())
    expect(pushCelebration).not.toHaveBeenCalled()
    locationError = 'Location is blocked for this site.'
    rerender(view())
    expect(pushCelebration).toHaveBeenCalledTimes(1)
    expect(pushCelebration.mock.calls[0][0]).toMatchObject({
      title: "Couldn't show your location",
      body: 'Location is blocked for this site.',
    })
    // The same error, re-rendered, is not said twice.
    rerender(view())
    expect(pushCelebration).toHaveBeenCalledTimes(1)
  })
})

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
    // One pin gets a centre and zoom rather than bounds fitting.
    expect(map.setCenter).toHaveBeenCalledWith({ lat: 13.7, lng: 100.5 })
    expect(map.setZoom).toHaveBeenCalledWith(14)
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
    expect(map.setCenter).toHaveBeenCalledTimes(1)

    // Typing the title: a new form object, same pin.
    rerender(<LocationPicker value={{ ...value, title: 'Satur' }} onChange={onChange} />)
    rerender(<LocationPicker value={{ ...value, title: 'Saturday' }} onChange={onChange} />)
    expect(map.setCenter).toHaveBeenCalledTimes(1)

    // Moving the pin.
    rerender(<LocationPicker value={{ ...value, lat: 13.75, lng: 100.52 }} onChange={onChange} />)
    expect(map.setCenter).toHaveBeenCalledTimes(2)
    expect(map.setCenter).toHaveBeenLastCalledWith({ lat: 13.75, lng: 100.52 })
  })

  test('does nothing until a pin exists', () => {
    render(<LocationPicker value={{ title: '', lat: null, lng: null }} onChange={vi.fn()} />)
    expect(map.setCenter).not.toHaveBeenCalled()
  })

  test('map clicks preserve form fields and reject coordinates outside Thailand', () => {
    const onChange = vi.fn()
    render(
      <LocationPicker value={{ title: 'Keep this', locationName: 'Park' }} onChange={onChange} />,
    )
    act(() => handlers.click({ latLng: { toJSON: () => ({ lat: 13.7, lng: 100.5 }) } }))
    expect(onChange).toHaveBeenCalledWith({
      title: 'Keep this',
      locationName: 'Park',
      lat: 13.7,
      lng: 100.5,
    })
    onChange.mockClear()
    act(() => handlers.click({ latLng: { toJSON: () => ({ lat: 0, lng: 0 }) } }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})

test('a cluster at one location cycles through every activity', () => {
  app = { filteredActivities: [place('a', 13.7, 100.5), place('b', 13.7, 100.5)], loading: false }
  render(
    <MemoryRouter>
      <MapPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: '2 activities' }))
  expect(document.querySelector('.map-activity-preview strong').textContent).toBe('a')
  fireEvent.click(screen.getByRole('button', { name: '2 activities' }))
  expect(document.querySelector('.map-activity-preview strong').textContent).toBe('b')
})
