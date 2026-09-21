// @vitest-environment jsdom
/**
 * The filter page with sets: a checkbox per category and per time band,
 * an "all" control per group, a draft that reaches the feed only on Apply,
 * a Reset that clears the sets and puts the distance and the switch back —
 * and, reopened, the selections in force.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import i18n from '../../src/i18n'
import th from '../../src/i18n/locales/th.json'
import { defaultFilters } from '../../src/utils/filters'

let filters = defaultFilters
const setFilters = vi.fn((next) => {
  filters = next
})
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ filters, setFilters }),
}))

const { default: FilterPage } = await import('../../src/pages/FilterPage')

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/filters']}>
      <Routes>
        <Route path="/filters" element={<FilterPage />} />
        <Route path="/home" element={<p>the feed</p>} />
      </Routes>
    </MemoryRouter>,
  )
const group = (name) => screen.getByRole('group', { name: new RegExp(name) })
const box = (name) => screen.getByRole('checkbox', { name })
const pressed = (name) => screen.getByRole('button', { name, pressed: true })
const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
const checkedIn = (name) =>
  within(group(name))
    .getAllByRole('checkbox')
    .filter((el) => el.checked)
    .map((el) => el.parentElement.textContent.trim())

beforeEach(() => {
  filters = defaultFilters
  setFilters.mockClear()
})
afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

test('every category and every time band is a checkbox, in a labelled group, none checked by default', () => {
  mount()
  const categoryBoxes = within(group('Categories')).getAllByRole('checkbox')
  expect(categoryBoxes).toHaveLength(12)
  expect(categoryBoxes.every((el) => !el.checked)).toBe(true)
  expect(within(group('Time of day')).getAllByRole('checkbox')).toHaveLength(3)
  // With nothing chosen, "all" is the pressed control in each group.
  expect(pressed('All categories')).toBeTruthy()
  expect(pressed('Any time')).toBeTruthy()
})

test('choices toggle on their own — no modifier keys — and a chosen one shows its mark', () => {
  mount()
  fireEvent.click(box('Football'))
  fireEvent.click(box('Basketball'))
  expect(checkedIn('Categories')).toEqual(['Football', 'Basketball'])
  expect(box('Football').closest('.choice-chip').classList.contains('selected')).toBe(true)
  expect(box('Running').closest('.choice-chip').classList.contains('selected')).toBe(false)
  // "All" lets go once anything is chosen…
  expect(screen.getByRole('button', { name: 'All categories', pressed: false })).toBeTruthy()
  expect(group('Categories').textContent).toContain('2 selected')
  // …and a second click on a choice takes it back out.
  fireEvent.click(box('Football'))
  expect(checkedIn('Categories')).toEqual(['Basketball'])
  expect(group('Categories').textContent).toContain('1 selected')
})

test('"All categories" and "Any time" clear their own group and nothing else', () => {
  mount()
  fireEvent.click(box('Football'))
  fireEvent.click(box('Morning'))
  fireEvent.click(box('Evening'))
  fireEvent.click(screen.getByRole('button', { name: 'All categories' }))
  expect(checkedIn('Categories')).toEqual([])
  expect(checkedIn('Time of day')).toEqual(['Morning', 'Evening'])
  expect(pressed('All categories')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Any time' }))
  expect(checkedIn('Time of day')).toEqual([])
  expect(pressed('Any time')).toBeTruthy()
})

test('nothing reaches the feed until Apply, which sends the sets and goes home', () => {
  mount()
  fireEvent.click(box('Football'))
  fireEvent.click(box('Basketball'))
  fireEvent.click(box('Morning'))
  fireEvent.click(box('Evening'))
  fireEvent.click(screen.getByRole('switch'))
  expect(setFilters).not.toHaveBeenCalled()
  apply()
  expect(setFilters).toHaveBeenCalledTimes(1)
  expect(setFilters).toHaveBeenCalledWith({
    categories: ['Football', 'Basketball'],
    maxDistance: 10,
    timeBands: ['Morning', 'Evening'],
    availableOnly: false,
  })
  expect(screen.getByText('the feed')).toBeTruthy()
})

test('reopened, the page shows what is applied', () => {
  filters = {
    categories: ['Coffee', 'Study'],
    maxDistance: 4,
    timeBands: ['Afternoon'],
    availableOnly: false,
  }
  mount()
  // In the vocabulary's order, however they were stored.
  expect(checkedIn('Categories')).toEqual(['Study', 'Coffee'])
  expect(checkedIn('Time of day')).toEqual(['Afternoon'])
  expect(screen.getByRole('button', { name: 'All categories', pressed: false })).toBeTruthy()
  expect(screen.getByRole('slider').value).toBe('4')
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  expect(screen.getByText('4 km')).toBeTruthy()
})

test('Reset clears both sets, puts the distance and the switch back, and applies at once', () => {
  filters = {
    categories: ['Coffee', 'Study'],
    maxDistance: 4,
    timeBands: ['Afternoon'],
    availableOnly: false,
  }
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
  expect(setFilters).toHaveBeenCalledWith(defaultFilters)
  expect(checkedIn('Categories')).toEqual([])
  expect(checkedIn('Time of day')).toEqual([])
  expect(pressed('All categories')).toBeTruthy()
  expect(pressed('Any time')).toBeTruthy()
  expect(screen.getByRole('slider').value).toBe('10')
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
})

test('the choices keep their stored English values under a translated label', async () => {
  await act(() => i18n.changeLanguage('th'))
  mount()
  fireEvent.click(screen.getByRole('checkbox', { name: th.categories.football }))
  fireEvent.click(screen.getByRole('checkbox', { name: th.timeBands.morning }))
  expect(
    screen.getByRole('button', { name: th.filters.allCategories, pressed: false }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: th.filters.apply }))
  expect(setFilters).toHaveBeenCalledWith({
    ...defaultFilters,
    categories: ['Football'],
    timeBands: ['Morning'],
  })
})
