// @vitest-environment jsdom
/**
 * One screen failing must not take the app with it — and "Try again" must
 * actually try again.
 *
 * An audit suggested the retry re-rendered the tree that had just thrown and
 * needed a key bump to remount it. Measured, that is not so: a subtree that
 * threw was never committed, so clearing the error mounts it fresh, state
 * initialisers and all. The boundary is unchanged; these tests pin what it
 * already did.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

vi.mock('../../src/utils/reportError', () => ({ reportError: vi.fn() }))
const { default: RouteErrorBoundary } = await import('../../src/components/RouteErrorBoundary')

afterEach(cleanup)

test('a screen that failed transiently recovers on Try again', () => {
  // Broken until the world changes — the shape of a transient failure. The
  // flag flips before the retry, the way a network would have come back.
  let broken = true
  function Flaky() {
    if (broken) throw new Error('not yet')
    return <p>the screen</p>
  }
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <RouteErrorBoundary resetKey="/x">
      <Flaky />
    </RouteErrorBoundary>,
  )
  expect(screen.getByText('This screen could not load')).toBeTruthy()

  broken = false
  fireEvent.click(screen.getByText('Try again'))
  expect(screen.getByText('the screen')).toBeTruthy()
  quiet.mockRestore()
})

test('a screen that keeps failing keeps saying so, rather than blanking', () => {
  function Broken() {
    throw new Error('always')
  }
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <RouteErrorBoundary resetKey="/x">
      <Broken />
    </RouteErrorBoundary>,
  )
  fireEvent.click(screen.getByText('Try again'))
  expect(screen.getByText('This screen could not load')).toBeTruthy()
  quiet.mockRestore()
})

test('navigating away clears it without a click', () => {
  function Broken() {
    throw new Error('always')
  }
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { rerender } = render(
    <RouteErrorBoundary resetKey="/broken">
      <Broken />
    </RouteErrorBoundary>,
  )
  expect(screen.getByText('This screen could not load')).toBeTruthy()
  rerender(
    <RouteErrorBoundary resetKey="/fine">
      <p>fine</p>
    </RouteErrorBoundary>,
  )
  expect(screen.getByText('fine')).toBeTruthy()
  quiet.mockRestore()
})
