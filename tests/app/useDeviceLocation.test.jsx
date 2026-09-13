// @vitest-environment jsdom
/**
 * Asking the device where it is, and storing the answer.
 */
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const getCurrentPosition = vi.fn()
const updatePrivateProfile = vi.fn(() => Promise.resolve())
vi.mock('../../src/utils/geo', async () => ({
  ...(await vi.importActual('../../src/utils/geo')),
  getCurrentPosition,
}))
vi.mock('../../src/firebase/users', () => ({ updatePrivateProfile }))
let user = {
  uid: 'me',
  privacy: { approximateLocation: true, locationPermission: false, notifications: true },
}
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user }) }))

const { useDeviceLocation } = await import('../../src/hooks/useDeviceLocation')

function Probe() {
  const { request, clear, error, busy } = useDeviceLocation()
  return (
    <div>
      <button onClick={request}>request</button>
      <button onClick={clear}>clear</button>
      <span data-testid="error">{error}</span>
      <span data-testid="busy">{String(busy)}</span>
    </div>
  )
}
const flush = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

beforeEach(() => {
  getCurrentPosition.mockReset()
  updatePrivateProfile.mockReset()
  updatePrivateProfile.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('request', () => {
  test('stores a coarsened position and the permission in one write', async () => {
    getCurrentPosition.mockResolvedValue({ lat: 13.7563, lng: 100.5018 })
    render(<Probe />)
    await act(async () => {
      screen.getByText('request').click()
      await flush()
    })
    expect(updatePrivateProfile).toHaveBeenCalledTimes(1)
    expect(updatePrivateProfile).toHaveBeenCalledWith('me', {
      location: { lat: 13.76, lng: 100.5 },
      // Only the field that changed. The notifications preference lives on
      // the public profile and must not be copied in here.
      privacy: { locationPermission: true },
    })
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  test('a device that refuses is reported as the device', async () => {
    getCurrentPosition.mockRejectedValue({ code: 1 })
    render(<Probe />)
    await act(async () => {
      screen.getByText('request').click()
      await flush()
    })
    expect(screen.getByTestId('error').textContent).toMatch(/blocked for this site/)
    expect(updatePrivateProfile).not.toHaveBeenCalled()
  })

  test('a write that fails is reported as the write, not the device', async () => {
    getCurrentPosition.mockResolvedValue({ lat: 13.7, lng: 100.5 })
    updatePrivateProfile.mockRejectedValue({ code: 'unavailable' })
    render(<Probe />)
    await act(async () => {
      screen.getByText('request').click()
      await flush()
    })
    expect(screen.getByTestId('error').textContent).toMatch(/Could not save your location/)
    expect(screen.getByTestId('busy').textContent).toBe('false')
  })
})

describe('clear', () => {
  test('removes the position and the permission together, and says if it could not', async () => {
    render(<Probe />)
    await act(async () => {
      screen.getByText('clear').click()
      await flush()
    })
    expect(updatePrivateProfile).toHaveBeenCalledWith('me', {
      location: null,
      privacy: { locationPermission: false },
    })

    updatePrivateProfile.mockRejectedValue(new Error('offline'))
    await act(async () => {
      screen.getByText('clear').click()
      await flush()
    })
    expect(screen.getByTestId('error').textContent).toMatch(/Could not save/)
  })
})
