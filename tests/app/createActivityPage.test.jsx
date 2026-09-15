// @vitest-environment jsdom
/**
 * The create form's own checks, before anything reaches the database.
 *
 * A cleared date field used to pass: an invalid Date compares false to
 * everything, the rules refused the write, and the toast blamed permissions.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const createActivity = vi.fn(async () => 'new-id')
let unsent = []
const discardUnsent = vi.fn()
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ createActivity, unsent, discardUnsent }),
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', suspended: false } }),
}))
// The map does not run in jsdom; the picker reports a pin inside Thailand.
vi.mock('../../src/components/LocationPicker', () => ({
  default: ({ onChange }) => {
    React.useEffect(() => {
      onChange({ lat: 13.7, lng: 100.5, locationName: 'Lumpini' })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return null
  },
}))

const { default: CreateActivityPage } = await import('../../src/pages/CreateActivityPage')

beforeEach(() => createActivity.mockClear())
afterEach(cleanup)

const field = (type) => [...document.querySelectorAll('input')].find((i) => i.type === type)
const fill = () => {
  fireEvent.change(screen.getByPlaceholderText('e.g. Saturday Football'), {
    target: { value: 'Run' },
  })
  fireEvent.change(screen.getByPlaceholderText('Tell participants what to expect'), {
    target: { value: 'Easy pace' },
  })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Running' } })
}
const submit = () => fireEvent.submit(document.querySelector('form'))

test('a cleared date is asked for, not sent', async () => {
  render(
    <MemoryRouter>
      <CreateActivityPage />
    </MemoryRouter>,
  )
  fill()
  fireEvent.change(field('date'), { target: { value: '' } })
  submit()
  expect((await screen.findByRole('alert')).textContent).toBe('Pick a date and a time.')
  expect(createActivity).not.toHaveBeenCalled()
})

test('a cleared time is asked for too', async () => {
  render(
    <MemoryRouter>
      <CreateActivityPage />
    </MemoryRouter>,
  )
  fill()
  fireEvent.change(field('time'), { target: { value: '' } })
  submit()
  expect((await screen.findByRole('alert')).textContent).toBe('Pick a date and a time.')
  expect(createActivity).not.toHaveBeenCalled()
})

test('a date in the past is still refused as before', async () => {
  render(
    <MemoryRouter>
      <CreateActivityPage />
    </MemoryRouter>,
  )
  fill()
  fireEvent.change(field('date'), { target: { value: '2020-01-01' } })
  submit()
  expect((await screen.findByRole('alert')).textContent).toBe('Pick a date and time in the future.')
  expect(createActivity).not.toHaveBeenCalled()
})

test('a complete form is sent as typed', async () => {
  render(
    <MemoryRouter>
      <CreateActivityPage />
    </MemoryRouter>,
  )
  fill()
  fireEvent.change(field('date'), { target: { value: '2030-06-01' } })
  fireEvent.change(field('time'), { target: { value: '07:30' } })
  submit()
  await waitFor(() => expect(createActivity).toHaveBeenCalledTimes(1))
  expect(createActivity.mock.calls[0][0]).toMatchObject({
    title: 'Run',
    category: 'Running',
    date: '2030-06-01',
    time: '07:30',
    lat: 13.7,
    lng: 100.5,
  })
  expect(screen.queryByRole('alert')).toBeNull()
})
