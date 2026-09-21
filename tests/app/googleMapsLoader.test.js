// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { importLibrary, setOptions } = vi.hoisted(() => ({
  importLibrary: vi.fn(),
  setOptions: vi.fn(),
}))
vi.mock('@googlemaps/js-api-loader', () => ({ importLibrary, setOptions }))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-browser-key')
  vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', 'test-map-id')
  importLibrary.mockReset().mockResolvedValue({})
  setOptions.mockClear()
  delete window.gm_authFailure
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  delete window.gm_authFailure
})

test.each(['VITE_GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_MAP_ID'])(
  'missing %s makes no external SDK request',
  async (key) => {
    vi.stubEnv(key, '')
    const { loadGoogleMaps } = await import('../../src/services/googleMaps')
    await expect(loadGoogleMaps()).rejects.toThrow('maps/not-configured')
    expect(setOptions).not.toHaveBeenCalled()
    expect(importLibrary).not.toHaveBeenCalled()
  },
)

test('concurrent map screens share one SDK load and configuration', async () => {
  const { loadGoogleMaps } = await import('../../src/services/googleMaps')
  const first = loadGoogleMaps()
  expect(loadGoogleMaps()).toBe(first)
  await first
  await loadGoogleMaps()
  expect(setOptions).toHaveBeenCalledTimes(1)
  expect(setOptions).toHaveBeenCalledWith({
    key: 'test-browser-key',
    v: 'quarterly',
    region: 'TH',
    mapIds: ['test-map-id'],
  })
  expect(importLibrary.mock.calls.map(([name]) => name)).toEqual(['maps', 'core', 'marker'])
})

test('a network failure can be retried without reconfiguring the loader', async () => {
  importLibrary.mockRejectedValueOnce(new Error('offline'))
  const { loadGoogleMaps } = await import('../../src/services/googleMaps')
  await expect(loadGoogleMaps()).rejects.toThrow('offline')
  await expect(loadGoogleMaps()).resolves.toEqual({})
  expect(setOptions).toHaveBeenCalledTimes(1)
  expect(importLibrary).toHaveBeenCalledTimes(6)
})

test('an unanswered SDK request times out instead of leaving a permanent spinner', async () => {
  vi.useFakeTimers()
  importLibrary.mockImplementation(() => new Promise(() => {}))
  const { loadGoogleMaps } = await import('../../src/services/googleMaps')
  const failure = expect(loadGoogleMaps()).rejects.toThrow('maps/load-timeout')
  await vi.advanceTimersByTimeAsync(15000)
  await failure
})

test('late authentication failures notify mounted maps and refuse further loads', async () => {
  const { loadGoogleMaps, watchMapAuthenticationFailure } =
    await import('../../src/services/googleMaps')
  const current = vi.fn()
  const unmounted = vi.fn()
  watchMapAuthenticationFailure(current)
  const stop = watchMapAuthenticationFailure(unmounted)
  stop()
  await loadGoogleMaps()
  window.gm_authFailure()
  expect(current).toHaveBeenCalledTimes(1)
  expect(unmounted).not.toHaveBeenCalled()
  await expect(loadGoogleMaps()).rejects.toThrow('maps/authentication-failed')
})
