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
const retryChatMessage = vi.fn()
const discardChatMessage = vi.fn()
const reviewChatMessage = vi.fn()
let chatPending = []
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    activities,
    // Derived from the feed, as in the real context: nothing is joined
    // before anything is known.
    joinedIds: activities.map((a) => a.id),
    sendMessage,
    chatPending,
    retryChatMessage,
    discardChatMessage,
    reviewChatMessage,
    blockedIds: new Set(),
    loading: feedLoading,
  }),
}))
// A picture is decoded on a canvas, which jsdom does not have; what is
// under test here is what the screen does with the result.
const preparePicture = vi.fn(async () => ({ dataUrl: 'data:image/webp;base64,AAAA' }))
vi.mock('../../src/utils/pictures', async (importActual) => ({
  ...(await importActual()),
  preparePicture: (...args) => preparePicture(...args),
}))
let storedPicture = null
vi.mock('../../src/hooks/usePicture', () => ({ usePicture: () => storedPicture }))
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
  chatPending = []
  storedPicture = null
  discardChatMessage.mockClear()
  retryChatMessage.mockClear()
  reviewChatMessage.mockClear()
  preparePicture.mockClear()
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
  const pending = (extra = {}) => ({
    id: 'p1',
    activityId: 'a1',
    text: 'see you at 7',
    image: null,
    status: 'checking',
    reason: null,
    ...extra,
  })

  test('hands the message to moderation and clears the composer', async () => {
    render(page())
    act(() => open().onRows([]))
    type('see you at 7')
    send()
    expect(sendMessage).toHaveBeenCalledWith('a1', 'see you at 7', null)
    expect(screen.getByLabelText('Chat message').value).toBe('')
  })

  test('while it is being checked it is on the author’s screen and nowhere else', () => {
    chatPending = [pending()]
    render(page())
    act(() => open().onRows([]))
    const bubble = document.querySelector('.pending-bubble')
    expect(bubble.className).toMatch(/checking/)
    expect(bubble.getAttribute('role')).toBe('status')
    expect(bubble.querySelector('strong').textContent).toBe('Me')
    expect(bubble.querySelector('.message-check-spinner')).toBeTruthy()
    expect(bubble.querySelector('.sr-only').textContent).toMatch(
      /Checking this message before anyone sees it/,
    )
    expect(screen.queryByText('Checking')).toBeNull()
    expect(bubble.textContent).toMatch(/Checking this message before anyone sees it/)
    // It is not a message in the thread: the thread has none.
    expect(document.querySelectorAll('.message-bubble:not(.pending-bubble)')).toHaveLength(0)
  })

  test('a refusal says why in general terms, and never rewrites the message', () => {
    chatPending = [pending({ status: 'blocked', reason: 'harassment' })]
    render(page())
    act(() => open().onRows([]))
    const bubble = document.querySelector('.pending-bubble.blocked')
    expect(bubble.getAttribute('role')).toBe('alert')
    expect(bubble.textContent).toMatch(/reads as targeting someone/)
    // The words are still there, exactly as written.
    expect(bubble.textContent).toMatch(/see you at 7/)
    // No category name, no score, nothing to tune the next attempt with.
    expect(bubble.textContent).not.toMatch(/harassment|0\.9/)
  })

  test('Edit puts it back in the composer to be rewritten', () => {
    chatPending = [pending({ status: 'blocked', reason: 'hate' })]
    render(page())
    act(() => open().onRows([]))
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByLabelText('Chat message').value).toBe('see you at 7')
    expect(discardChatMessage).toHaveBeenCalledWith('p1')
  })

  test('Discard drops it, and Ask for a review asks a person', () => {
    chatPending = [pending({ status: 'blocked', reason: 'hate' })]
    render(page())
    act(() => open().onRows([]))
    fireEvent.click(screen.getByText('Ask for a review'))
    expect(reviewChatMessage).toHaveBeenCalledWith('p1')
    fireEvent.click(screen.getByText('Discard'))
    expect(discardChatMessage).toHaveBeenCalledWith('p1')
  })

  test('a child-safety flag offers no appeal', () => {
    chatPending = [pending({ status: 'blocked', reason: 'sexual-minors', severe: true })]
    render(page())
    act(() => open().onRows([]))
    expect(screen.getByText(/a person has been alerted/)).toBeTruthy()
    expect(screen.queryByText('Ask for a review')).toBeNull()
  })

  test('a check that could not be completed offers Retry, not a sent message', () => {
    chatPending = [pending({ status: 'failed', reason: 'unavailable' })]
    render(page())
    act(() => open().onRows([]))
    expect(screen.getByText(/could not be completed/)).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(retryChatMessage).toHaveBeenCalledWith('p1')
  })

  test('offline says so, and being rate-limited says how long', () => {
    chatPending = [pending({ status: 'failed', reason: 'offline' })]
    const { unmount } = render(page())
    act(() => open().onRows([]))
    expect(screen.getByText(/You are offline/)).toBeTruthy()
    unmount()
    chatPending = [pending({ status: 'failed', reason: 'rate-limited', retryAfterSeconds: 300 })]
    render(page())
    act(() => open().onRows([]))
    expect(screen.getByText(/Try again in 5 minutes/)).toBeTruthy()
  })

  test('only this thread’s unsent messages are shown', () => {
    chatPending = [pending(), pending({ id: 'p2', activityId: 'other', text: 'elsewhere' })]
    render(page())
    act(() => open().onRows([]))
    expect(document.querySelectorAll('.pending-bubble')).toHaveLength(1)
    expect(screen.queryByText('elsewhere')).toBeNull()
  })

  test('a picture is prepared, previewed, and sent with the message', async () => {
    render(page())
    act(() => open().onRows([]))
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add a picture'), { target: { files: [file] } })
      await flush()
    })
    // Re-encoded for chat, which also strips the file's metadata.
    expect(preparePicture).toHaveBeenCalledWith(file, 'chat')
    expect(document.querySelector('.chat-attachment img').src).toContain('data:image/webp')
    type('look at this')
    send()
    expect(sendMessage).toHaveBeenCalledWith('a1', 'look at this', 'data:image/webp;base64,AAAA')
  })

  test('a picture can be taken off again before it goes anywhere', async () => {
    render(page())
    act(() => open().onRows([]))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add a picture'), {
        target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] },
      })
      await flush()
    })
    fireEvent.click(screen.getByLabelText('Remove this picture'))
    expect(document.querySelector('.chat-attachment')).toBeNull()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  test('a picture that cannot be read is said so, and nothing is sent', async () => {
    preparePicture.mockRejectedValueOnce(new Error('pictures.typeError'))
    render(page())
    act(() => open().onRows([]))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add a picture'), {
        target: { files: [new File(['x'], 'p.txt', { type: 'text/plain' })] },
      })
      await flush()
    })
    expect(screen.getByText(/Choose a JPG, PNG or WebP image/)).toBeTruthy()
    expect(document.querySelector('.chat-attachment')).toBeNull()
  })

  test('the composer stays compact without a permanent moderation sentence', () => {
    render(page())
    act(() => open().onRows([]))
    expect(document.querySelector('.chat-moderation-note')).toBeNull()
  })
})

describe('an approved message', () => {
  test('an own message has a compact sent mark beside its time', () => {
    render(page())
    act(() =>
      open().onRows([{ id: 'm1', senderId: 'me', senderName: 'Me', text: 'on my way' }]),
    )
    const bubble = screen.getByText('on my way').closest('.message-bubble')
    expect(bubble.querySelector('.message-sent-mark')).toBeTruthy()
    expect(bubble.querySelector('.sr-only').textContent).toBe('Sent')
  })

  test('a picture arrives with the message it was checked with', () => {
    storedPicture = 'data:image/webp;base64,BBBB'
    render(page())
    act(() =>
      open().onRows([
        { id: 'm1', senderId: 'h', senderName: 'Host', text: 'we are here', hasImage: true },
      ]),
    )
    const img = screen.getByAltText('Picture from Host')
    expect(img.src).toContain('BBBB')
    expect(screen.getByText('we are here')).toBeTruthy()
  })

  test('a message without one has no picture at all', () => {
    render(page())
    act(() => open().onRows([{ id: 'm1', senderId: 'h', senderName: 'Host', text: 'hi' }]))
    expect(document.querySelector('.message-picture')).toBeNull()
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
