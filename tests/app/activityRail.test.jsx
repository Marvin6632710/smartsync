// @vitest-environment jsdom
/**
 * A rail's arrows, which are the part with state.
 *
 * The row itself is a scroll container and needs no help. The arrows do:
 * each has to appear only when there is something that way, and disappear
 * when there is not — an arrow that never goes away is worse than one that
 * never appears, because it promises more and delivers nothing.
 *
 * jsdom has no layout, so the measurements a browser would make are stubbed
 * here. That is the whole reason this is worth a test: the arithmetic on
 * those three numbers is the part that goes wrong, not the drawing.
 */
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../src/hooks/useMorph', () => ({ useMorph: () => () => {} }))
vi.mock('../../src/components/SavedPicture', () => ({
  ActivityPicture: () => null,
  AvatarContent: () => null,
}))
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ directory: new Map(), joinedIds: [], blockedIds: new Set() }),
}))
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

let ActivityRail
beforeEach(async () => {
  ActivityRail = (await import('../../src/components/ActivityRail')).default
})
afterEach(cleanup)

const activities = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    title: `Activity ${i}`,
    category: 'Coffee',
    date: '2026-10-01',
    time: '18:00',
    startsAt: 2_000_000_000_000,
    locationName: 'Somewhere',
    participants: 1,
    capacity: 10,
    participantUids: [],
  }))

/** What a browser would have measured, since jsdom measures nothing. */
function layout(track, { scrollWidth, clientWidth, scrollLeft = 0 }) {
  Object.defineProperty(track, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(track, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(track, 'scrollLeft', {
    value: scrollLeft,
    writable: true,
    configurable: true,
  })
}

const mount = (n = 6) => {
  const view = render(<ActivityRail title="Happening soon" activities={activities(n)} count={n} />)
  return {
    view,
    track: document.querySelector('.rail-track'),
    vp: document.querySelector('.rail-viewport'),
  }
}

describe('a rail', () => {
  test('draws its cards and says how many', () => {
    const { vp } = mount(4)
    expect(vp.querySelectorAll('.activity-card')).toHaveLength(4)
    expect(document.querySelector('.count-chip').textContent).toBe('4')
  })

  test('an empty rail is not a heading over nothing', () => {
    render(<ActivityRail title="Nothing" activities={[]} />)
    expect(document.querySelector('.rail')).toBeNull()
  })

  test('neither arrow shows when everything already fits', () => {
    const { track, vp } = mount(2)
    layout(track, { scrollWidth: 400, clientWidth: 400 })
    act(() => track.dispatchEvent(new Event('scroll')))
    expect(vp.dataset.start).toBe('no')
    expect(vp.dataset.end).toBe('no')
  })

  test('at the start, only the arrow pointing on', () => {
    const { track, vp } = mount()
    layout(track, { scrollWidth: 1600, clientWidth: 400, scrollLeft: 0 })
    act(() => track.dispatchEvent(new Event('scroll')))
    expect(vp.dataset.start).toBe('no')
    expect(vp.dataset.end).toBe('yes')
  })

  test('in the middle, both', () => {
    const { track, vp } = mount()
    layout(track, { scrollWidth: 1600, clientWidth: 400, scrollLeft: 600 })
    act(() => track.dispatchEvent(new Event('scroll')))
    expect(vp.dataset.start).toBe('yes')
    expect(vp.dataset.end).toBe('yes')
  })

  test('at the end, only the arrow pointing back', () => {
    const { track, vp } = mount()
    layout(track, { scrollWidth: 1600, clientWidth: 400, scrollLeft: 1200 })
    act(() => track.dispatchEvent(new Event('scroll')))
    expect(vp.dataset.start).toBe('yes')
    expect(vp.dataset.end).toBe('no')
  })

  test('a fraction of a pixel short of the end still counts as the end', () => {
    // Card widths are fractional, so scrollLeft rarely lands exactly on its
    // maximum — and without the slack the far arrow never goes away.
    const { track, vp } = mount()
    layout(track, { scrollWidth: 1600.6, clientWidth: 400, scrollLeft: 1200.2 })
    act(() => track.dispatchEvent(new Event('scroll')))
    expect(vp.dataset.end).toBe('no')
  })

  test('pressing an arrow scrolls by about a screenful, not by a card', () => {
    const { track, vp } = mount()
    layout(track, { scrollWidth: 1600, clientWidth: 400, scrollLeft: 0 })
    const scrollBy = vi.fn()
    track.scrollBy = scrollBy
    act(() => vp.querySelector('.rail-arrow[data-side="end"]').click())
    expect(scrollBy).toHaveBeenCalledTimes(1)
    const { left, behavior } = scrollBy.mock.calls[0][0]
    // A screenful less a peek, so the card at the edge stays half in view.
    expect(left).toBeGreaterThan(0)
    expect(left).toBeLessThan(400)
    expect(behavior).toBe('smooth')
    act(() => vp.querySelector('.rail-arrow[data-side="start"]').click())
    expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0)
  })

  test('the arrows are for the mouse, and stay out of the keyboard’s way', () => {
    // Tabbing reaches the cards themselves and the browser scrolls each into
    // view, so two arrow stops per rail would be two stops to the same place.
    const { vp } = mount()
    for (const arrow of vp.querySelectorAll('.rail-arrow')) {
      expect(arrow.getAttribute('aria-hidden')).toBe('true')
      expect(arrow.getAttribute('tabindex')).toBe('-1')
    }
  })

  test('the row is named for whoever cannot see the heading', () => {
    const { vp } = mount()
    const section = vp.closest('.rail')
    const labelledBy = section.getAttribute('aria-labelledby')
    expect(document.getElementById(labelledBy).textContent).toBe('Happening soon')
  })
})
