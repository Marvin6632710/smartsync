// @vitest-environment jsdom
/**
 * Editing an activity, including the cold load.
 *
 * The form used to seed itself on first render with whatever the listener had
 * delivered — on a reload of the edit URL, nothing — so the activity arriving
 * a moment later met a form with every field empty. These cover that, and
 * that ordinary editing, validation and saving are as they were.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let activities = []
const updateActivity = vi.fn()
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ activities, updateActivity }),
}))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'host' } }) }))
// The map is not what is under test, and Leaflet does not run in jsdom.
vi.mock('../../src/components/LocationPicker', () => ({
  default: () => <div data-testid="picker" />,
}))

const { default: EditActivityPage } = await import('../../src/pages/EditActivityPage')

const saturday = {
  id: 'a1',
  hostId: 'host',
  status: 'active',
  title: 'Saturday Football',
  description: 'Bring boots',
  category: 'Football',
  locationName: 'Lumpini',
  lat: 13.7,
  lng: 100.5,
  date: '2026-10-01',
  time: '19:00',
  capacity: 10,
  participants: 3,
  participantUids: ['host', 'b', 'c'],
}

const page = () => (
  <MemoryRouter initialEntries={['/activity/a1/edit']}>
    <Routes>
      <Route path="/activity/:id/edit" element={<EditActivityPage />} />
      <Route path="/activity/:id" element={<div>details page</div>} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => {
  activities = [saturday]
  updateActivity.mockReset()
})
afterEach(cleanup)

describe('cold load', () => {
  test('the form is filled in once the activity arrives', () => {
    activities = []
    const { rerender } = render(page())
    expect(screen.getByText('Activity not found')).toBeTruthy()

    activities = [saturday]
    rerender(page())
    expect(screen.getByLabelText('Activity name').value).toBe('Saturday Football')
    expect(screen.getByLabelText('Description').value).toBe('Bring boots')
    expect(screen.getByLabelText('Capacity').value).toBe('10')
  })
})

describe('editing', () => {
  test('typing changes the field and a later snapshot does not overwrite it', () => {
    const { rerender } = render(page())
    const title = screen.getByLabelText('Activity name')
    fireEvent.change(title, { target: { value: 'Sunday Football' } })

    activities = [{ ...saturday, participants: 4 }]
    rerender(page())
    expect(screen.getByLabelText('Activity name').value).toBe('Sunday Football')
    // The live roster still drives the floor.
    expect(screen.getByText(/Can't go below the 4 people/)).toBeTruthy()
  })

  test('an empty name is refused before anything is written', async () => {
    render(page())
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: '  ' } })
    fireEvent.click(screen.getByText('Save changes'))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Activity name and description are required.',
    )
    expect(updateActivity).not.toHaveBeenCalled()
  })

  test('capacity cannot drop below the people already in', async () => {
    render(page())
    const capacity = screen.getByLabelText('Capacity')
    // The input's own `min` stops this in a browser; submitting the form
    // directly exercises the check behind it.
    expect(capacity.min).toBe('3')
    fireEvent.change(capacity, { target: { value: '2' } })
    fireEvent.submit(capacity.closest('form'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/3 people already joined/)
    expect(updateActivity).not.toHaveBeenCalled()
  })

  test('a save that lands goes to the activity', async () => {
    updateActivity.mockResolvedValue(true)
    render(page())
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => expect(screen.getByText('details page')).toBeTruthy())
    expect(updateActivity).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ title: 'Renamed', date: '2026-10-01', time: '19:00' }),
    )
  })

  test('a save that is refused stays put with the typing intact', async () => {
    updateActivity.mockResolvedValue(false)
    render(page())
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => expect(updateActivity).toHaveBeenCalled())
    expect(screen.queryByText('details page')).toBeNull()
    expect(screen.getByLabelText('Activity name').value).toBe('Renamed')
  })
})

describe('who may edit', () => {
  test('somebody else is turned away', () => {
    activities = [{ ...saturday, hostId: 'other', hostName: 'Other' }]
    render(page())
    expect(screen.getByText('Only the host can edit this')).toBeTruthy()
  })

  test('a removed activity is frozen', () => {
    activities = [{ ...saturday, status: 'removed', moderation: { reason: 'spam' } }]
    render(page())
    expect(screen.getByText('This activity was removed')).toBeTruthy()
  })
})
