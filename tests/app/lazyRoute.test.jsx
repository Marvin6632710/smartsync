// @vitest-environment jsdom
/**
 * A route chunk the server no longer has.
 *
 * After every deploy an already-open tab names chunks that no longer exist.
 * React.lazy remembers the rejection, so "Try again" threw the same error
 * without a network request; only a reload — which fetches the new
 * index.html — can help. A stale tab now reloads itself once, and the
 * boundary offers the reload when it cannot.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const reportError = vi.fn()
vi.mock('../../src/utils/reportError', () => ({ reportError }))
const { lazyRoute, isChunkLoadError } = await import('../../src/utils/lazyRoute')
const { default: RouteErrorBoundary } = await import('../../src/components/RouteErrorBoundary')

const chunkError = () =>
  new Error('Failed to fetch dynamically imported module: /assets/MapPage-abc.js')
let reload
let online = true
beforeEach(() => {
  sessionStorage.clear()
  reportError.mockClear()
  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
  online = true
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
})
afterEach(cleanup)

const mount = (Lazy) =>
  render(
    <RouteErrorBoundary resetKey="/map">
      <React.Suspense fallback={<p>loading</p>}>
        <Lazy />
      </React.Suspense>
    </RouteErrorBoundary>,
  )

describe('lazyRoute', () => {
  test('a stale chunk reloads the page once and keeps the fallback up', async () => {
    const importer = vi.fn(() => Promise.reject(chunkError()))
    mount(lazyRoute(importer))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.getByText('loading')).toBeTruthy()
    expect(sessionStorage.getItem('smartsync:chunk-reloaded')).toBe('1')
  })

  test('after a reload that did not help, the error reaches the boundary with a Reload button', async () => {
    sessionStorage.setItem('smartsync:chunk-reloaded', '1')
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(lazyRoute(() => Promise.reject(chunkError())))
    await screen.findByText('This screen could not load')
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByText(/SmartSync has been updated/)).toBeTruthy()
    fireEvent.click(screen.getByText('Reload'))
    expect(reload).toHaveBeenCalledTimes(1)
    quiet.mockRestore()
  })

  test('offline, a missing chunk is not a reason to leave a working app', async () => {
    online = false
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(lazyRoute(() => Promise.reject(chunkError())))
    await screen.findByText('This screen could not load')
    expect(reload).not.toHaveBeenCalled()
    quiet.mockRestore()
  })

  test('a chunk that loads clears the reload marker for next time', async () => {
    sessionStorage.setItem('smartsync:chunk-reloaded', '1')
    mount(lazyRoute(() => Promise.resolve({ default: () => <p>the map</p> })))
    await screen.findByText('the map')
    expect(sessionStorage.getItem('smartsync:chunk-reloaded')).toBeNull()
  })

  test('an ordinary error in a lazy module is not mistaken for a stale chunk', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(lazyRoute(() => Promise.reject(new Error('boom'))))
    await screen.findByText('This screen could not load')
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByText('Try again')).toBeTruthy()
    expect(screen.queryByText('Reload')).toBeNull()
    quiet.mockRestore()
  })

  test('isChunkLoadError recognises the browsers’ wordings', () => {
    expect(isChunkLoadError(chunkError())).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Loading chunk 3 failed'))).toBe(true)
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(
      isChunkLoadError(
        new Error(
          'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
        ),
      ),
    ).toBe(true)
    expect(isChunkLoadError(new Error('x is not a function'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})
