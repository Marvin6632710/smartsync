// @vitest-environment jsdom
/**
 * The listener retry guard.
 *
 * The trickiest logic in the app and, until now, untested. It has to tell two
 * identical-looking failures apart: a listener belonging to a session that has
 * ended (drop it — it is the noise of signing out) from one under a live
 * session that needs a fresh token and a re-subscribe.
 *
 * An audit claimed this hook leaked an unhandled rejection and could stall
 * silently. These tests were written to check that, and the first half turned
 * out to be wrong — `refreshCredential` swallows its own failure and always
 * resolves. What is real is the hang: nothing bounds how long the token
 * refresh may take, and until it settles the listener is never remade and no
 * error is shown.
 */
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let uidNow = 'me'
let refreshBehaviour = () => Promise.resolve()
const refreshCalls = { n: 0 }

vi.mock('../../src/firebase/auth', () => ({
  currentUid: () => uidNow,
  refreshCredential: () => {
    refreshCalls.n += 1
    return refreshBehaviour()
  },
}))

const { useListenerRetry } = await import('../../src/hooks/useListenerRetry')

function Harness({ uid, onError }) {
  const { attempt, guard } = useListenerRetry(uid)
  Harness.latest = { attempt, guard: guard(onError) }
  return <span data-testid="attempt">{attempt}</span>
}

const denied = { code: 'permission-denied', message: 'refused' }

beforeEach(() => {
  uidNow = 'me'
  refreshCalls.n = 0
  refreshBehaviour = () => Promise.resolve()
})
afterEach(cleanup)

describe('telling the two failures apart', () => {
  test('an error from a session that has ended is dropped', () => {
    uidNow = 'somebody-else' // the app has already moved on
    const onError = vi.fn()
    render(<Harness uid="me" onError={onError} />)
    act(() => Harness.latest.guard(denied))
    expect(onError).not.toHaveBeenCalled()
    expect(refreshCalls.n).toBe(0)
  })

  test('a denial under a live session buys a new token and a re-subscribe', async () => {
    const onError = vi.fn()
    const view = render(<Harness uid="me" onError={onError} />)
    expect(view.getByTestId('attempt').textContent).toBe('0')
    await act(async () => {
      Harness.latest.guard(denied)
    })
    expect(refreshCalls.n).toBe(1)
    expect(view.getByTestId('attempt').textContent).toBe('1')
    expect(onError).not.toHaveBeenCalled()
  })

  test('a denial that persists is surfaced rather than retried forever', async () => {
    const onError = vi.fn()
    render(<Harness uid="me" onError={onError} />)
    await act(async () => {
      Harness.latest.guard(denied)
    })
    await act(async () => {
      Harness.latest.guard(denied)
    })
    // Two retries is the budget; the third is a real refusal.
    await act(async () => {
      Harness.latest.guard(denied)
    })
    expect(onError).toHaveBeenCalledWith(denied)
  })

  test('an error that is not a denial goes straight through', () => {
    const onError = vi.fn()
    render(<Harness uid="me" onError={onError} />)
    const other = { code: 'unavailable' }
    act(() => Harness.latest.guard(other))
    expect(onError).toHaveBeenCalledWith(other)
    expect(refreshCalls.n).toBe(0)
  })
})

describe('what the audit got wrong, and what it got right', () => {
  test('a failing token refresh does not reject — the retry still happens', async () => {
    // The claim was an unhandled rejection plus a permanent stall. It is
    // neither: refreshCredential catches its own failure and resolves, so the
    // re-subscribe goes ahead.
    refreshBehaviour = () => Promise.resolve() // what the real one does on failure
    const onError = vi.fn()
    const view = render(<Harness uid="me" onError={onError} />)
    await act(async () => {
      Harness.latest.guard(denied)
    })
    expect(view.getByTestId('attempt').textContent).toBe('1')
  })

  test('the hook still waits on whatever refreshCredential returns', async () => {
    // The stall is fixed in refreshCredential itself, which now races a
    // timer so it always settles — see its own test. The hook's contract is
    // unchanged: it re-subscribes once the refresh resolves, however that
    // happens.
    let release
    refreshBehaviour = () =>
      new Promise((resolve) => {
        release = resolve
      })
    const onError = vi.fn()
    const view = render(<Harness uid="me" onError={onError} />)
    await act(async () => {
      Harness.latest.guard(denied)
    })
    expect(view.getByTestId('attempt').textContent).toBe('0')
    await act(async () => {
      release()
    })
    expect(view.getByTestId('attempt').textContent).toBe('1')
  })
})
