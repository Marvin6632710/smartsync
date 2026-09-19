// @vitest-environment jsdom
/**
 * The mark: two hooks making an S. On a page it borrows the page's own ink
 * and accent, so it follows the theme without knowing about it; on the tile
 * it is fixed colours on ink, the same everywhere. It is decorative, so
 * whatever carries it says the name.
 */
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import BrandMark from '../../src/components/BrandMark'

afterEach(cleanup)

test('drawn on a page, the hooks take the text colour and the accent', () => {
  const { container } = render(<BrandMark size={40} />)
  const svg = container.querySelector('svg')
  expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(svg.getAttribute('width')).toBe('40')
  expect(svg.querySelector('rect')).toBeNull()
  const [top, bottom] = svg.querySelectorAll('path')
  expect(top.getAttribute('stroke')).toBe('currentColor')
  expect(bottom.getAttribute('stroke')).toBe('var(--accent)')
  // Each hook ends in a head of its own colour.
  const heads = [...svg.querySelectorAll('circle')].map((c) => c.getAttribute('fill'))
  expect(heads).toEqual(['currentColor', 'var(--accent)'])
})

test('the tile is ink with fixed colours, so an icon is the same on every ground', () => {
  const { container } = render(<BrandMark tile size={72} className="orb-mark" />)
  const svg = container.querySelector('svg.orb-mark')
  expect(svg.querySelector('rect').getAttribute('fill')).toBe('#17130c')
  const strokes = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('stroke'))
  expect(strokes).toEqual(['#f3ede4', '#8b84f3'])
  expect(strokes).not.toContain('currentColor')
})
