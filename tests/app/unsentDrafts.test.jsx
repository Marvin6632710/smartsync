// @vitest-environment jsdom
/**
 * A form saved offline that the server refused later is offered back on the
 * screen it came from — restored by a tap, never over what is there already.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let unsent = []
const discardUnsent = vi.fn()
const createActivity = vi.fn(async () => 'id')
const updateActivity = vi.fn(async () => true)
const submitReport = vi.fn(async () => true)
let activities = []
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    unsent,
    discardUnsent,
    createActivity,
    updateActivity,
    submitReport,
    activities,
    loading: false,
    syncing: false,
    offline: false,
    pushCelebration: vi.fn(),
    keepUnsent: vi.fn(),
    settleUnsent: vi.fn(),
    failUnsent: vi.fn(),
    blockPerson: vi.fn(),
    isBlocked: () => false,
  }),
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'me',
      suspended: false,
      realName: 'Alice',
      username: '@alice',
      bio: '',
      preferredTime: '',
      interests: ['Football', 'Coffee', 'Study'],
      anonymous: false,
    },
  }),
}))
vi.mock('../../src/components/LocationPicker', () => ({
  default: ({ value }) => <div data-testid="place">{value?.locationName || ''}</div>,
}))
vi.mock('../../src/firebase/users', () => ({ updateDisplayName: vi.fn() }))

const { default: CreateActivityPage } = await import('../../src/pages/CreateActivityPage')
const { default: EditActivityPage } = await import('../../src/pages/EditActivityPage')
const { default: EditProfilePage } = await import('../../src/pages/EditProfilePage')
const { default: ReportDialog } = await import('../../src/components/ReportDialog')

beforeEach(() => {
  unsent = []
  discardUnsent.mockClear()
  activities = []
})
afterEach(cleanup)

const refused = {
  code: 'permission-denied',
  message: 'It was refused — you may no longer be allowed to do this.',
}

describe('creating an activity', () => {
  const draft = {
    id: 'u1',
    kind: 'activity-create',
    key: 'me',
    status: 'failed',
    error: refused,
    payload: {
      id: 'minted',
      title: 'Late run',
      description: 'Easy',
      category: 'Running',
      locationName: 'Park',
      lat: 13.7,
      lng: 100.5,
      date: '2030-01-01',
      time: '07:00',
      capacity: 6,
    },
  }

  test('a refused draft is offered, and Restore fills the form without the minted id', () => {
    unsent = [draft]
    render(
      <MemoryRouter>
        <CreateActivityPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert').textContent).toMatch(/"Late run" couldn't be saved/)
    fireEvent.click(screen.getByText('Restore'))
    expect(screen.getByPlaceholderText('e.g. Saturday Football').value).toBe('Late run')
    expect(screen.getByTestId('place').textContent).toBe('Park')
    expect(discardUnsent).toHaveBeenCalledWith('u1')
  })

  test('typing first, then restoring, is the person’s choice — nothing is restored on its own', () => {
    unsent = [draft]
    render(
      <MemoryRouter>
        <CreateActivityPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByPlaceholderText('e.g. Saturday Football'), {
      target: { value: 'Something new' },
    })
    expect(screen.getByPlaceholderText('e.g. Saturday Football').value).toBe('Something new')
    fireEvent.click(screen.getByText('Discard'))
    expect(screen.getByPlaceholderText('e.g. Saturday Football').value).toBe('Something new')
    expect(discardUnsent).toHaveBeenCalledWith('u1')
  })

  test('a pending draft, or another kind, is not offered', () => {
    unsent = [
      { ...draft, status: 'pending' },
      { ...draft, id: 'u2', kind: 'activity-edit' },
    ]
    render(
      <MemoryRouter>
        <CreateActivityPage />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('editing an activity', () => {
  const existing = {
    id: 'a1',
    hostId: 'me',
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
    participants: 1,
    participantUids: ['me'],
  }
  const page = () => (
    <MemoryRouter initialEntries={['/activity/a1/edit']}>
      <Routes>
        <Route path="/activity/:id/edit" element={<EditActivityPage />} />
      </Routes>
    </MemoryRouter>
  )

  test('a refused edit of this activity is offered; another activity’s is not', () => {
    activities = [existing]
    unsent = [
      {
        id: 'u1',
        kind: 'activity-edit',
        key: 'a1',
        status: 'failed',
        error: refused,
        payload: { title: 'Sunday Football', description: 'New boots' },
      },
      {
        id: 'u2',
        kind: 'activity-edit',
        key: 'zzz',
        status: 'failed',
        error: refused,
        payload: { title: 'Elsewhere' },
      },
    ]
    render(page())
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    fireEvent.click(screen.getByText('Restore'))
    expect(screen.getByDisplayValue('Sunday Football')).toBeTruthy()
    expect(screen.getByDisplayValue('New boots')).toBeTruthy()
    // Fields the draft did not carry keep their current value.
    expect(screen.getByDisplayValue('2026-10-01')).toBeTruthy()
  })

  test('an edit somebody else overtook is offered as a choice, not as a failed save', () => {
    activities = [existing]
    unsent = [
      {
        id: 'u1',
        kind: 'activity-edit',
        key: 'a1',
        status: 'failed',
        error: {
          code: 'superseded',
          message:
            'The activity was changed by somebody else after this edit, and shows their version now.',
        },
        payload: { title: 'Sunday Football' },
        before: { title: 'Saturday Football' },
      },
    ]
    render(page())
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/Your last edit is not what it shows now/)
    expect(alert.textContent).toMatch(/changed by somebody else/)
    expect(alert.textContent).toMatch(/put your version in the form/)
    expect(alert.textContent).not.toMatch(/couldn't be saved/)
    // Nothing is written over the form until Restore is tapped.
    expect(screen.getByDisplayValue('Saturday Football')).toBeTruthy()
    fireEvent.click(screen.getByText('Restore'))
    expect(screen.getByDisplayValue('Sunday Football')).toBeTruthy()
    expect(discardUnsent).toHaveBeenCalledWith('u1')
  })

  test('the newest failed edit of this activity is the one offered', () => {
    activities = [existing]
    const failed = (id, title) => ({
      id,
      kind: 'activity-edit',
      key: 'a1',
      status: 'failed',
      error: refused,
      payload: { title },
    })
    unsent = [failed('u1', 'First attempt'), failed('u2', 'Second attempt')]
    render(page())
    fireEvent.click(screen.getByText('Restore'))
    expect(screen.getByDisplayValue('Second attempt')).toBeTruthy()
    expect(discardUnsent).toHaveBeenCalledWith('u2')
  })
})

describe('editing the profile', () => {
  test('a refused profile edit is offered back', () => {
    unsent = [
      {
        id: 'u1',
        kind: 'profile',
        key: 'me',
        status: 'failed',
        error: refused,
        payload: {
          name: 'Alice B',
          username: '@aliceb',
          bio: 'Runs',
          preferredTime: 'Morning',
          interests: ['Running', 'Coffee', 'Study'],
        },
      },
    ]
    render(
      <MemoryRouter>
        <EditProfilePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert').textContent).toMatch(
      /Your last profile edit couldn't be saved/,
    )
    fireEvent.click(screen.getByText('Restore'))
    expect(screen.getByLabelText('Name').value).toBe('Alice B')
    expect(screen.getByLabelText('Bio').value).toBe('Runs')
  })

  test('a profile edit overtaken from another device is offered as a choice', () => {
    unsent = [
      {
        id: 'u1',
        kind: 'profile',
        key: 'me',
        status: 'failed',
        error: {
          code: 'superseded',
          message:
            'Your profile was changed from another device after this edit, and shows that version now.',
        },
        payload: { name: 'Alice B', username: '@aliceb', bio: 'Runs', interests: ['Running'] },
        before: { username: '@alice', bio: '', preferredTime: '', interests: [] },
      },
    ]
    render(
      <MemoryRouter>
        <EditProfilePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert').textContent).toMatch(
      /Your last profile edit is not what it shows now/,
    )
    expect(screen.getByLabelText('Bio').value).toBe('')
    fireEvent.click(screen.getByText('Restore'))
    expect(screen.getByLabelText('Bio').value).toBe('Runs')
  })
})

describe('reporting', () => {
  const subject = { type: 'user', id: 'bob', name: 'Bob', label: 'this person', context: '' }

  test('a refused report about the same person is filled back in, and dropped once one is sent', async () => {
    unsent = [
      {
        id: 'u1',
        kind: 'report',
        key: 'bob',
        status: 'failed',
        error: refused,
        payload: { reason: 'harassment', detail: 'Would not stop', targetId: 'bob' },
      },
    ]
    render(<ReportDialog open subject={subject} onClose={() => {}} />)
    expect(screen.getByRole('status').textContent).toMatch(/earlier report could not be sent/)
    expect(screen.getByDisplayValue('Would not stop')).toBeTruthy()
    fireEvent.click(screen.getByText('Send report'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(submitReport).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'harassment', detail: 'Would not stop' }),
    )
    expect(discardUnsent).toHaveBeenCalledWith('u1')
  })

  test('a refused report about somebody else is left alone', () => {
    unsent = [
      {
        id: 'u1',
        kind: 'report',
        key: 'carol',
        status: 'failed',
        error: refused,
        payload: { reason: 'spam', detail: 'x' },
      },
    ]
    render(<ReportDialog open subject={subject} onClose={() => {}} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
