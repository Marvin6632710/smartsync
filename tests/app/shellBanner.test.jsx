// @vitest-environment jsdom
/**
 * The connection banner says what is known. The device having no
 * connection is the browser's own word; the server having said nothing for
 * long enough is silence — which, measured against a server that merely
 * answered slowly, turned out to be the connection being slow rather than
 * gone. Calling that "offline" was untrue, so the two are worded apart.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

let connection = { offline: false, browserOffline: false, serverSilent: false }
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    notifications: [],
    celebration: null,
    dataError: null,
    ...connection,
  }),
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', name: 'Uma', avatar: 'UM' } }),
}))
vi.mock('../../src/components/CelebrationToast', () => ({ default: () => null }))
vi.mock('../../src/components/JoinBurst', () => ({ default: () => null }))

// jsdom has no ResizeObserver; the shell measures its header with one.
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

const { default: Shell } = await import('../../src/components/Shell')

const mount = (state) => {
  connection = { offline: false, browserOffline: false, serverSilent: false, ...state }
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Shell />
    </MemoryRouter>,
  )
}
const banner = () => document.querySelector('.offline-banner')?.textContent ?? null

afterEach(cleanup)

test('no banner while the connection is fine', () => {
  mount({})
  expect(banner()).toBeNull()
})

test('silence from the server is said as silence, with what is on screen explained', () => {
  mount({ offline: true, serverSilent: true })
  expect(banner()).toMatch(/No answer from the server yet/)
  expect(banner()).toMatch(/showing what was last loaded/)
  expect(banner()).toMatch(/Changes will sync when it answers/)
  expect(banner()).not.toMatch(/Offline/)
})

test('a connection the feed lost is offline, not silence', () => {
  mount({ offline: true, serverSilent: false })
  expect(banner()).toMatch(/^Offline — changes will sync when you reconnect\./)
})

test('the device having no connection is offline, even during a silence', () => {
  mount({ offline: true, browserOffline: true, serverSilent: true })
  expect(banner()).toMatch(/^Offline — changes will sync when you reconnect\./)
})
