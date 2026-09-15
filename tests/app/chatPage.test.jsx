// @vitest-environment jsdom
/**
 * The chat screen under failure.
 *
 * Two things it used to get wrong. A refused thread listener rendered as
 * "No messages yet. Start the conversation." — over a conversation that
 * existed — and stayed dead, since nothing re-subscribed. And the composer
 * emptied itself before the send was known to have worked, so a refusal
 * cost the person their message as well as the round trip.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The thread listener, under our control: each subscription is recorded so a
// test can deliver rows or a refusal to the one currently open.
const subscriptions = []
vi.mock('../../src/firebase/messages', async (importActual) => ({
  ...(await importActual()),
  watchMessages: (id, onRows, onError) => {
    const sub = { id, onRows, onError, stopped: false }
    subscriptions.push(sub)
    return () => {
      sub.stopped = true
    }
  },
}))
const refreshCredential = vi.fn(() => Promise.resolve())
vi.mock('../../src/firebase/auth', () => ({ refreshCredential }))

let activities = []
let feedLoading = false
const sendMessage = vi.fn()
let unsent = []
const discardUnsent = vi.fn()
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    activities,
    // Derived from the feed, as in the real context: nothing is joined
    // before anything is known.
    joinedIds: activities.map((a) => a.id),
    sendMessage,
    blockedIds: new Set(),
    loading: feedLoading,
    unsent,
    discardUnsent,
  }),
}))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', name: 'Me', suspended: false } }),
}))
vi.mock('../../src/components/ReportDialog', () => ({ default: () => null }))

const { default: ChatPage } = await import('../../src/pages/ChatPage')

const thread = {
  id: 'a1',
  title: 'Football',
  hostId: 'h',
  status: 'active',
  startsAt: Date.now() + 86_400_000,
  participantUids: ['h', 'me'],
  participants: 2,
  capacity: 10,
}
const denial = { code: 'permission-denied', message: 'Missing or insufficient permissions.' }
const open = () => subscriptions.filter((s) => !s.stopped).at(-1)

const page = () => (
  <MemoryRouter initialEntries={['/activity/a1/chat']}>
    <Routes>
      <Route path="/activity/:id/chat" element={<ChatPage />} />
    </Routes>
  </MemoryRouter>
)
const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  })

beforeEach(() => {
  activities = [thread]
  feedLoading = false
  subscriptions.length = 0
  unsent = []
  discardUnsent.mockClear()
  sendMessage.mockReset()
  refreshCredential.mockClear()
  window.HTMLElement.prototype.scrollIntoView = () => {}
})
afterEach(cleanup)

describe('a thread that cannot be read', () => {
  test('a refusal buys one fresh credential and one more subscription', async () => {
    render(page())
    expect(subscriptions).toHaveLength(1)
    await act(async () => {
      open().onError(denial)
      await flush()
    })
    expect(refreshCredential).toHaveBeenCalledTimes(1)
    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[0].stopped).toBe(true)
    // The retry delivering rows is an ordinary thread again.
    act(() => open().onRows([{ id: 'm1', senderId: 'h', senderName: 'Host', text: 'hi' }]))
    expect(screen.getByText('hi')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('a second refusal is shown as what it is, never as an empty conversation', async () => {
    render(page())
    await act(async () => {
      open().onError(denial)
      await flush()
    })
    act(() => open().onError(denial))
    expect(screen.queryByText('No messages yet. Start the conversation.')).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(/can't read this chat/)
    expect(refreshCredential).toHaveBeenCalledTimes(1)
  })

  test('any other failure says "could not load", and Try again subscribes again', async () => {
    render(page())
    act(() => open().onError({ code: 'unavailable', message: 'offline' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load messages/)
    const before = subscriptions.length
    fireEvent.click(screen.getByText('Try again'))
    expect(screen.getByText('Loading messages…')).toBeTruthy()
    expect(subscriptions.length).toBe(before + 1)
    act(() => open().onRows([]))
    expect(screen.getByText('No messages yet. Start the conversation.')).toBeTruthy()
  })

  test('Try again after a spent budget gets a fresh budget', async () => {
    render(page())
    await act(async () => {
      open().onError(denial)
      await flush()
    })
    act(() => open().onError(denial))
    fireEvent.click(screen.getByText('Try again'))
    await act(async () => {
      open().onError(denial)
      await flush()
    })
    expect(refreshCredential).toHaveBeenCalledTimes(2)
  })
})

describe('the composer', () => {
  const type = (value) =>
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value } })
  const send = () => fireEvent.submit(screen.getByLabelText('Chat message').closest('form'))

  test('clears at once, and stays clear when the message lands', async () => {
    sendMessage.mockResolvedValue({ id: 'm1' })
    render(page())
    act(() => open().onRows([]))
    type('see you at 7')
    send()
    expect(screen.getByLabelText('Chat message').value).toBe('')
    await flush()
    expect(sendMessage).toHaveBeenCalledWith('a1', 'see you at 7')
    expect(screen.getByLabelText('Chat message').value).toBe('')
  })

  test('a refused message is never written back over the input', async () => {
    // The context records the refusal in `unsent`; the composer keeps
    // whatever has been typed since, untouched.
    sendMessage.mockResolvedValue(null)
    render(page())
    act(() => open().onRows([]))
    type('first')
    send()
    type('second')
    await flush()
    expect(screen.getByLabelText('Chat message').value).toBe('second')
  })

  test('a message the server refused is shown in the thread, with the reason, to retry or discard', async () => {
    sendMessage.mockResolvedValue({ id: 'm2' })
    const failed = {
      id: 'u1',
      kind: 'message',
      key: 'a1',
      status: 'failed',
      payload: { text: 'see you at 7', id: 'm1' },
      error: {
        code: 'permission-denied',
        message: 'It was refused — you may no longer be allowed to do this.',
      },
    }
    unsent = [
      failed,
      { ...failed, id: 'u2', key: 'other-thread' },
      { ...failed, id: 'u3', status: 'pending' },
    ]
    render(page())
    act(() => open().onRows([]))
    // Only this thread's failed rows; a pending one is still the optimistic bubble.
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('see you at 7')).toBeTruthy()
    expect(screen.getByText(/It was refused/)).toBeTruthy()

    fireEvent.click(screen.getByText('Retry'))
    expect(discardUnsent).toHaveBeenCalledWith('u1')
    expect(sendMessage).toHaveBeenCalledWith('a1', 'see you at 7')
    // The input was not touched by any of it.
    expect(screen.getByLabelText('Chat message').value).toBe('')
  })

  test('two taps on Retry send once', async () => {
    unsent = [
      {
        id: 'u1',
        kind: 'message',
        key: 'a1',
        status: 'failed',
        payload: { text: 'again' },
        error: { message: 'It was refused.' },
      },
    ]
    let settle
    sendMessage.mockReturnValue(new Promise((resolve) => (settle = resolve)))
    render(page())
    act(() => open().onRows([]))
    const retry = screen.getByText('Retry')
    fireEvent.click(retry)
    fireEvent.click(retry)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith('a1', 'again')
    await act(async () => {
      settle({ id: 'm2' })
      await flush()
    })
  })

  test('Discard drops a refused message without sending it', () => {
    unsent = [
      {
        id: 'u1',
        kind: 'message',
        key: 'a1',
        status: 'failed',
        payload: { text: 'never mind', id: 'm1' },
        error: null,
      },
    ]
    render(page())
    act(() => open().onRows([]))
    fireEvent.click(screen.getByText('Discard'))
    expect(discardUnsent).toHaveBeenCalledWith('u1')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  test('a message queued offline is treated as sent', async () => {
    sendMessage.mockResolvedValue(Symbol('queued'))
    render(page())
    act(() => open().onRows([]))
    type('later')
    send()
    await flush()
    expect(screen.getByLabelText('Chat message').value).toBe('')
  })
})

describe('before the feed has loaded', () => {
  test('the page waits rather than declaring the activity gone', () => {
    activities = []
    feedLoading = true
    render(page())
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByText('This activity no longer exists.')).toBeNull()
    expect(subscriptions).toHaveLength(0)
  })

  test('and once it has, a missing activity is missing', () => {
    activities = []
    feedLoading = false
    render(page())
    expect(screen.getByText('This activity no longer exists.')).toBeTruthy()
  })
})
