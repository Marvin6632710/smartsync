// @vitest-environment jsdom
/**
 * The warnings page must not say "nothing on your record" unless it is true.
 * A listener that failed used to fall through to exactly that.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const subscriptions = []
vi.mock('../../src/firebase/moderation', () => ({
  watchMyWarnings: (uid, onRows, onError) => {
    subscriptions.push({ onRows, onError })
    return () => {}
  },
}))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }))

const { default: WarningsPage } = await import('../../src/pages/WarningsPage')

beforeEach(() => {
  subscriptions.length = 0
})
afterEach(cleanup)

const latest = () => subscriptions.at(-1)

test('a clean record is a clean record', () => {
  render(
    <MemoryRouter>
      <WarningsPage />
    </MemoryRouter>,
  )
  act(() => latest().onRows([]))
  expect(screen.getByText('Nothing on your record')).toBeTruthy()
})

test('warnings are listed', () => {
  render(
    <MemoryRouter>
      <WarningsPage />
    </MemoryRouter>,
  )
  act(() => latest().onRows([{ id: 'w1', reason: 'Be kind', createdAt: null }]))
  expect(screen.getByText('“Be kind”')).toBeTruthy()
  expect(screen.queryByText('Nothing on your record')).toBeNull()
})

test('a read that failed says so, and Try again subscribes again', () => {
  render(
    <MemoryRouter>
      <WarningsPage />
    </MemoryRouter>,
  )
  act(() => latest().onError({ code: 'permission-denied' }))
  expect(screen.queryByText('Nothing on your record')).toBeNull()
  expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load your record/)

  expect(subscriptions).toHaveLength(1)
  fireEvent.click(screen.getByText('Try again'))
  expect(subscriptions).toHaveLength(2)
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => latest().onRows([]))
  expect(screen.getByText('Nothing on your record')).toBeTruthy()
})
