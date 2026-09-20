// @vitest-environment jsdom
/**
 * Settings → Notifications: the inbox switch, this browser's own state and
 * buttons, the category switches, and the devices with a way to end each.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const pushCelebration = vi.fn()
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({ offline: false, pushCelebration, celebration: null }),
}))
let user
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user, signOut: vi.fn() }),
}))
const savePushPreferences = vi.fn(() => Promise.resolve())
const setNotificationsEnabled = vi.fn(() => Promise.resolve())
vi.mock('../../src/firebase/users', () => ({ savePushPreferences, setNotificationsEnabled }))

const pushState = { support: 'ok', permission: 'default', here: false, devices: [] }
const registerPushDevice = vi.fn(async () => {
  pushState.here = true
  return { hash: 'h1', refreshed: true }
})
const unregisterPushDevice = vi.fn(async () => {
  pushState.here = false
})
const removePushDevice = vi.fn(async () => {})
const requestPermission = vi.fn(async () => {
  pushState.permission = 'granted'
  return 'granted'
})
vi.mock('../../src/firebase/push', () => ({
  pushSupport: () => pushState.support,
  permissionState: () => pushState.permission,
  registeredHere: () => pushState.here,
  thisDeviceHash: () => (pushState.here ? 'h1' : null),
  registerPushDevice,
  unregisterPushDevice,
  removePushDevice,
  requestPermission,
  watchPushDevices: (uid, cb) => {
    cb(pushState.devices)
    return () => {}
  },
}))

const { default: NotificationSettingsPage } =
  await import('../../src/pages/NotificationSettingsPage')

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  })

const mount = () =>
  render(
    <MemoryRouter>
      <NotificationSettingsPage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(pushState, { support: 'ok', permission: 'default', here: false, devices: [] })
  user = { uid: 'me', privacy: { notifications: true }, pushPrefs: {} }
})
afterEach(cleanup)

describe('this browser', () => {
  test('off by default, with Turn on; on after the permission is granted and the device registered', async () => {
    mount()
    expect(screen.getByText('Off on this device')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    await flush()
    expect(requestPermission).toHaveBeenCalled()
    expect(registerPushDevice).toHaveBeenCalledWith('me', { language: 'en' })
    expect(screen.getByText('On for this device')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn off on this device' })).toBeTruthy()
    expect(pushCelebration).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Notifications on' }),
    )
  })

  test('a refusal is said, and nothing is registered', async () => {
    requestPermission.mockImplementationOnce(async () => {
      pushState.permission = 'denied'
      return 'denied'
    })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    await flush()
    expect(registerPushDevice).not.toHaveBeenCalled()
    expect(pushCelebration).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Notifications blocked' }),
    )
    expect(screen.getByText(/Blocked in your browser settings/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
  })

  test('turning off takes the registration back', async () => {
    pushState.here = true
    pushState.permission = 'granted'
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off on this device' }))
    await flush()
    expect(unregisterPushDevice).toHaveBeenCalledWith('me', { reason: 'user' })
    expect(screen.getByText('Off on this device')).toBeTruthy()
  })

  test.each([
    ['unsupported', 'This browser cannot show notifications.'],
    ['ios', /add SmartSync to your Home Screen/],
  ])('%s browsers are told why, with no button', (support, text) => {
    pushState.support = support
    mount()
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
  })
})

describe('what is sent', () => {
  test('the defaults show, and a switch writes just that category', async () => {
    mount()
    const chat = screen.getByRole('switch', { name: /^Messages/ })
    const joins = screen.getByRole('switch', { name: /^People joining/ })
    expect(chat.getAttribute('aria-checked')).toBe('true')
    expect(joins.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(joins)
    await flush()
    expect(savePushPreferences).toHaveBeenCalledWith('me', { push: { joins: true } })
    fireEvent.click(chat)
    await flush()
    expect(savePushPreferences).toHaveBeenCalledWith('me', { push: { chat: false } })
  })

  test('a stored choice shows over the default', () => {
    user = { ...user, pushPrefs: { push: { chat: false, joins: true }, chatPreview: true } }
    mount()
    expect(screen.getByRole('switch', { name: /^Messages/ }).getAttribute('aria-checked')).toBe(
      'false',
    )
    expect(
      screen.getByRole('switch', { name: /^People joining/ }).getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      screen.getByRole('switch', { name: /^Show message text/ }).getAttribute('aria-checked'),
    ).toBe('true')
  })

  test('message previews are off unless asked for, and the switch says what off means', async () => {
    mount()
    const preview = screen.getByRole('switch', { name: /^Show message text/ })
    expect(preview.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/says who wrote, not what/)).toBeTruthy()
    fireEvent.click(preview)
    await flush()
    expect(savePushPreferences).toHaveBeenCalledWith('me', { chatPreview: true })
  })

  test('the inbox switch is still here and still writes the public flag', async () => {
    mount()
    fireEvent.click(screen.getByRole('switch', { name: /^In-app notifications/ }))
    await flush()
    expect(setNotificationsEnabled).toHaveBeenCalledWith('me', false)
  })

  test('safety notices are said to be always on', () => {
    mount()
    expect(screen.getByText('Safety and account notices are always sent.')).toBeTruthy()
  })
})

describe('devices', () => {
  test('lists them, marks this one, and can remove any', async () => {
    pushState.here = true
    pushState.devices = [
      { id: 'h1', label: 'Chrome · macOS', platform: 'desktop', lastSeenAt: Date.now() },
      { id: 'h2', label: 'Safari · iOS', platform: 'mobile', lastSeenAt: Date.now() - 86_400_000 },
    ]
    mount()
    const rows = screen.getAllByRole('button', { name: 'Remove' })
    expect(rows).toHaveLength(2)
    expect(screen.getByText('This device')).toBeTruthy()
    expect(screen.getByText('Safari · iOS')).toBeTruthy()
    fireEvent.click(rows[1])
    await flush()
    expect(removePushDevice).toHaveBeenCalledWith('me', 'h2')
  })

  test('says so when there are none', () => {
    mount()
    expect(screen.getByText('No devices yet.')).toBeTruthy()
  })
})
