// @vitest-environment jsdom
/**
 * The server-side people search and the hook that debounces it.
 */
import React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const getDocs = vi.fn()
vi.mock('firebase/firestore', () => ({
  arrayUnion: vi.fn(),
  collection: (_db, ...path) => ({ path: path.join('/') }),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  getDoc: vi.fn(),
  getDocs,
  limit: (n) => ({ limit: n }),
  onSnapshot: vi.fn(),
  query: (ref, ...clauses) => ({ ref, clauses }),
  serverTimestamp: () => 'server-time',
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: (field, op, value) => ({ where: field, op, value }),
  writeBatch: vi.fn(),
}))
vi.mock('../../src/firebase/config', () => ({ db: {} }))
vi.mock('../../src/firebase/activities', () => ({
  hostedActivityRefs: vi.fn(),
  stampHostIdentity: vi.fn(),
}))
vi.mock('../../src/utils/reportError', () => ({ reportError: vi.fn() }))

const { searchUsers, SEARCH_LIMIT } = await import('../../src/firebase/users')
const { usePeopleSearch } = await import('../../src/hooks/usePeopleSearch')

const snap = (...people) => ({ docs: people.map((p) => ({ data: () => p })) })

// Braces matter: a hook that returns the mock hands vitest a "cleanup"
// function, and vitest then calls the mock itself after every test.
beforeEach(() => {
  getDocs.mockReset()
})
afterEach(cleanup)

describe('searchUsers', () => {
  test('nothing for nothing, without a read', async () => {
    expect(await searchUsers('')).toEqual([])
    expect(await searchUsers('   ')).toEqual([])
    expect(getDocs).not.toHaveBeenCalled()
  })

  test('asks by name prefix and by username prefix, bounded, and merges by uid', async () => {
    getDocs
      .mockResolvedValueOnce(snap({ uid: 'a', name: 'Marvin' }, { uid: 'b', name: 'Mary' }))
      .mockResolvedValueOnce(snap({ uid: 'a', name: 'Marvin' }, { uid: 'c', name: 'Zed' }))
      .mockResolvedValueOnce(snap())
    const found = await searchUsers('Mar')

    expect(found.map((p) => p.uid).sort()).toEqual(['a', 'b', 'c'])
    const built = getDocs.mock.calls.map(([q]) => q.clauses)
    expect(built[0]).toEqual([
      { where: 'name', op: '>=', value: 'Mar' },
      { where: 'name', op: '<', value: 'Mar\uf8ff' },
      { limit: SEARCH_LIMIT },
    ])
    // "Mar" is already capitalised, so no second spelling; the handle gets one.
    expect(built.map((c) => [c[0].where, c[0].value])).toEqual([
      ['name', 'Mar'],
      ['username', 'Mar'],
      ['username', '@mar'],
    ])
  })

  test('a lower-case fragment also tries the capitalised name', async () => {
    getDocs.mockResolvedValue(snap())
    await searchUsers('mar')
    expect(getDocs.mock.calls.map(([q]) => [q.clauses[0].where, q.clauses[0].value])).toEqual([
      ['name', 'mar'],
      ['name', 'Mar'],
      ['username', 'mar'],
      ['username', '@mar'],
    ])
  })

  test('a handle as typed is searched as typed, once', async () => {
    getDocs.mockResolvedValue(snap())
    await searchUsers('@marvin')
    expect(getDocs.mock.calls.map(([q]) => [q.clauses[0].where, q.clauses[0].value])).toEqual([
      ['name', '@marvin'],
      ['username', '@marvin'],
    ])
  })

  test('a row with no uid is dropped rather than crashing the list', async () => {
    getDocs.mockResolvedValue(snap({ name: 'Ghost' }))
    expect(await searchUsers('G')).toEqual([])
  })
})

describe('usePeopleSearch', () => {
  function Probe({ term, enabled }) {
    const { found, searching } = usePeopleSearch(term, enabled)
    return (
      <div>
        <span data-testid="found">{found.map((p) => p.uid).join(',')}</span>
        <span data-testid="searching">{String(searching)}</span>
      </div>
    )
  }
  const found = () => screen.getByTestId('found').textContent
  const searching = () => screen.getByTestId('searching').textContent
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  test('waits for typing to pause, then answers', async () => {
    getDocs.mockResolvedValue(snap({ uid: 'z' }))
    const { rerender } = render(<Probe term="Z" enabled />)
    await pause(150)
    rerender(<Probe term="Ze" enabled />)
    await pause(150)
    rerender(<Probe term="Zed" enabled />)
    expect(searching()).toBe('true')
    // Three hundred milliseconds have passed in total, but never uninterrupted.
    expect(getDocs).not.toHaveBeenCalled()
    await waitFor(() => expect(found()).toBe('z'))
    expect(getDocs).toHaveBeenCalledTimes(3) // one search: name, username, @username
    expect(searching()).toBe('false')
  })

  test('an answer for an old term never shows', async () => {
    const pending = []
    getDocs.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
    const { rerender } = render(<Probe term="Ann" enabled />)
    await waitFor(() => expect(pending).toHaveLength(3))
    // The user keeps typing before the first answer arrives.
    rerender(<Probe term="Anna" enabled />)
    await act(async () => {
      pending.forEach((resolve) => resolve(snap({ uid: 'ann' })))
      await pause(10)
    })
    expect(found()).toBe('')
    expect(searching()).toBe('true')
    // The second search answers, and that one shows.
    await waitFor(() => expect(pending).toHaveLength(6))
    await act(async () => {
      pending.slice(3).forEach((resolve) => resolve(snap({ uid: 'anna' })))
      await pause(10)
    })
    expect(found()).toBe('anna')
    expect(searching()).toBe('false')
  })

  test('disabled, or empty, it asks nothing and holds nothing', async () => {
    getDocs.mockResolvedValue(snap({ uid: 'z' }))
    const { rerender } = render(<Probe term="Zed" enabled={false} />)
    await pause(350)
    expect(getDocs).not.toHaveBeenCalled()
    expect(searching()).toBe('false')

    rerender(<Probe term="Zed" enabled />)
    await waitFor(() => expect(found()).toBe('z'))
    rerender(<Probe term="" enabled />)
    expect(found()).toBe('')
    expect(searching()).toBe('false')
  })

  test('a failed search is an empty answer, not a stuck spinner', async () => {
    getDocs.mockImplementation(() => Promise.reject(new Error('offline')))
    render(<Probe term="Zed" enabled />)
    await waitFor(() => expect(searching()).toBe('false'))
    expect(found()).toBe('')
  })
})
