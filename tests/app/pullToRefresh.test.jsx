// @vitest-environment jsdom
/**
 * Pull down at the top of a list to read it again.
 *
 * The gesture has to be the one thing it is and nothing else, so most of
 * these pin what it must *not* do: not fire from the middle of a list, not
 * steal a sideways swipe, not fire from letting go short of the threshold,
 * not fire twice while it is already working, and not treat a wheel's
 * momentum tail as a deliberate scroll up. The last one is the reason the
 * wheel has its own, larger budget.
 */
import React, { useRef } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { PULL_THRESHOLD, usePullToRefresh } from '../../src/hooks/usePullToRefresh'

// Comfortably past PULL_THRESHOLD once damped, and short of it.
const FAR = 200
const SHORT = 40

function Harness({ onRefresh, enabled = true, scrollTop = 0 }) {
  const ref = useRef(null)
  const { phase } = usePullToRefresh({ targetRef: ref, onRefresh, enabled })
  return (
    <div ref={ref} data-testid="scroller" data-phase={phase} style={{ overflow: 'auto' }}>
      <p>a list</p>
    </div>
  )
}

const touch = (y, x = 0) => ({ touches: [{ clientY: y, clientX: x }] })

function setScrollTop(el, value) {
  Object.defineProperty(el, 'scrollTop', { value, writable: true, configurable: true })
}

let scroller
let onRefresh

/** Start the gesture at the top, drag to `y`, and let go unless told not to. */
function pull(y, { release = true, from = 0 } = {}) {
  act(() => {
    scroller.dispatchEvent(new TouchEvent('touchstart', touch(from)))
  })
  act(() => {
    scroller.dispatchEvent(new TouchEvent('touchmove', touch(y)))
  })
  if (release) act(() => scroller.dispatchEvent(new TouchEvent('touchend', {})))
}

/** One notch of a wheel, upwards by default. */
function wheel(deltaY) {
  act(() => {
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  onRefresh = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function mount(props = {}) {
  render(<Harness onRefresh={onRefresh} {...props} />)
  scroller = document.querySelector('[data-testid="scroller"]')
  setScrollTop(scroller, 0)
  return scroller
}

describe('pulling with a finger', () => {
  test('a pull past the threshold, released, refreshes', () => {
    mount()
    pull(FAR)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  test('the page is held down while the finger is, and the sheet is armed', () => {
    mount()
    pull(FAR, { release: false })
    expect(scroller.dataset.pulling).toBe('yes')
    expect(Number.parseFloat(scroller.style.getPropertyValue('--pull'))).toBeGreaterThanOrEqual(
      PULL_THRESHOLD,
    )
    expect(scroller.dataset.phase).toBe('armed')
  })

  test('letting go short of the threshold springs back and refreshes nothing', () => {
    mount()
    pull(SHORT, { release: false })
    expect(scroller.dataset.phase).toBe('pull')
    act(() => scroller.dispatchEvent(new TouchEvent('touchend', {})))
    expect(onRefresh).not.toHaveBeenCalled()
    expect(scroller.style.getPropertyValue('--pull')).toBe('0px')
  })

  test('a pull from the middle of a list is a scroll, not a refresh', () => {
    mount()
    setScrollTop(scroller, 400)
    pull(FAR)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  test('a sideways swipe belongs to something else', () => {
    mount()
    // Further across than down: a carousel, or the browser's gesture back.
    pull(60, { release: false })
    act(() => {
      scroller.dispatchEvent(new TouchEvent('touchstart', touch(0)))
    })
    act(() => {
      scroller.dispatchEvent(new TouchEvent('touchmove', touch(30, 200)))
    })
    act(() => scroller.dispatchEvent(new TouchEvent('touchend', {})))
    expect(onRefresh).not.toHaveBeenCalled()
  })

  test('dragging back up hands the scroller back mid-gesture', () => {
    mount()
    pull(FAR, { release: false })
    expect(scroller.dataset.phase).toBe('armed')
    act(() => {
      scroller.dispatchEvent(new TouchEvent('touchmove', touch(-10)))
    })
    expect(scroller.dataset.phase).toBe('idle')
    act(() => scroller.dispatchEvent(new TouchEvent('touchend', {})))
    expect(onRefresh).not.toHaveBeenCalled()
  })

  test('a second pull while the first is still working is ignored', () => {
    mount()
    pull(FAR)
    expect(scroller.dataset.phase).toBe('busy')
    pull(FAR)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  test('the spinner outlasts an instant answer, then puts itself away', async () => {
    mount()
    pull(FAR)
    expect(scroller.dataset.phase).toBe('busy')
    // Resolved already, but a spinner that flashes reads as a glitch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(scroller.dataset.phase).toBe('busy')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(scroller.dataset.phase).toBe('idle')
  })

  test('a refresh that never answers still ends the gesture', async () => {
    onRefresh = vi.fn(() => new Promise(() => {}))
    mount()
    pull(FAR)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(scroller.dataset.phase).toBe('idle')
  })

  test('a refresh that throws is still an ended gesture, not a stuck one', async () => {
    onRefresh = vi.fn(() => Promise.reject(new Error('offline')))
    mount()
    pull(FAR)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(scroller.dataset.phase).toBe('idle')
  })

  test('nothing is transformed once the gesture is over', async () => {
    mount()
    pull(FAR)
    // Just past the spinner's minimum, so the spring back has started and not
    // yet finished: 'easing' is what keeps the transform alive for it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(scroller.dataset.pulling).toBe('easing')
    act(() => {
      vi.advanceTimersByTime(400)
    })
    // Then gone: a transform left in place makes every page a containing
    // block, and each `position: fixed` dialog inside one breaks.
    expect(scroller.dataset.pulling).toBe('no')
    expect(scroller.style.getPropertyValue('--pull')).toBe('0px')
  })

  test('the refreshing message is pinned to the window, not to the page', () => {
    mount()
    // A refresh runs for up to nine seconds and the reader is free to scroll
    // away while it does. Pinned to the page, the message went with the
    // content and the refresh finished unannounced — which is what the owner
    // reported. The sheet leaves the page for the duration, and this is the
    // measurement that tells it where the scroller's top is.
    expect(scroller.style.getPropertyValue('--pull-pin')).toBe('')
    pull(FAR)
    expect(scroller.dataset.phase).toBe('busy')
    expect(scroller.style.getPropertyValue('--pull-pin')).not.toBe('')
  })

  test('a screen the gesture is off for does not answer it', () => {
    mount({ enabled: false })
    pull(FAR)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  test('a pull is ignored while a dialog owns the screen', () => {
    mount()
    const dialog = document.createElement('div')
    dialog.className = 'dialog-backdrop'
    document.body.append(dialog)
    try {
      pull(FAR)
      expect(onRefresh).not.toHaveBeenCalled()
    } finally {
      dialog.remove()
    }
  })
})

describe('scrolling up with a wheel', () => {
  test('enough upward scrolling at the top refreshes', () => {
    mount()
    // Three notches of a mouse wheel.
    wheel(-100)
    expect(onRefresh).not.toHaveBeenCalled()
    wheel(-100)
    wheel(-100)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  test('the wheel never says "release" — there is nothing to release', () => {
    mount()
    wheel(-100)
    expect(scroller.dataset.phase).toBe('pull')
  })

  test('scrolling up from the middle of a list does not refresh', () => {
    mount()
    setScrollTop(scroller, 400)
    for (let i = 0; i < 6; i += 1) wheel(-100)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  test('a downward turn empties the pile', () => {
    mount()
    wheel(-100)
    wheel(-100)
    wheel(60)
    wheel(-100)
    wheel(-100)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  test('a pause empties the pile, so two idle scrolls never add up', () => {
    mount()
    wheel(-100)
    wheel(-100)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    wheel(-100)
    wheel(-100)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  test('the sheet puts itself away when the deltas stop short', () => {
    mount()
    wheel(-100)
    expect(scroller.dataset.phase).toBe('pull')
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(scroller.dataset.phase).toBe('idle')
  })
})
