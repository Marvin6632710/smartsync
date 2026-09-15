/* global process */
/**
 * awaitWrite: the bounded wait every screen's save now goes through.
 *
 * A Firestore write settles only on the server's acknowledgement — never,
 * offline — so anything that awaited one sat on "Saving…" until the
 * connection returned. This races the write against a budget and hands
 * back QUEUED when the budget wins, with a later refusal still delivered.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { awaitWrite, QUEUED, WRITE_WAIT_MS } from '../../src/utils/writes'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const never = () => new Promise(() => {})

describe('awaitWrite', () => {
  test('a write that lands in time resolves with its value', async () => {
    await expect(awaitWrite(Promise.resolve('id-1'))).resolves.toBe('id-1')
  })

  test('a write that is refused in time rejects, so existing handling runs', async () => {
    await expect(awaitWrite(Promise.reject({ code: 'permission-denied' }))).rejects.toEqual({
      code: 'permission-denied',
    })
  })

  test('offline, it does not wait at all', async () => {
    const pending = awaitWrite(never(), { offline: true })
    await vi.advanceTimersByTimeAsync(0)
    await expect(pending).resolves.toBe(QUEUED)
  })

  test('online, a write that has not been acknowledged by the budget is queued', async () => {
    const pending = awaitWrite(never())
    await vi.advanceTimersByTimeAsync(WRITE_WAIT_MS - 1)
    let settled = false
    pending.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toBe(QUEUED)
  })

  test('a refusal that arrives after queueing is reported to onLater, not lost', async () => {
    let reject
    const write = new Promise((_, r) => (reject = r))
    const onLater = vi.fn()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const pending = awaitWrite(write, { offline: true, onLater })
    await vi.advanceTimersByTimeAsync(0)
    expect(await pending).toBe(QUEUED)
    reject({ code: 'permission-denied' })
    await vi.advanceTimersByTimeAsync(0)
    process.off('unhandledRejection', unhandled)
    expect(onLater).toHaveBeenCalledWith({ code: 'permission-denied' })
    expect(unhandled).not.toHaveBeenCalled()
  })

  test('a write that lands after queueing is simply done — onLater is not called', async () => {
    let resolve
    const write = new Promise((r) => (resolve = r))
    const onLater = vi.fn()
    const pending = awaitWrite(write, { offline: true, onLater })
    await vi.advanceTimersByTimeAsync(0)
    expect(await pending).toBe(QUEUED)
    resolve('late')
    await vi.advanceTimersByTimeAsync(0)
    expect(onLater).not.toHaveBeenCalled()
  })

  test('the budget timer is cleared once the write has settled', async () => {
    await awaitWrite(Promise.resolve(1))
    expect(vi.getTimerCount()).toBe(0)
    await awaitWrite(Promise.reject(new Error('no'))).catch(() => {})
    expect(vi.getTimerCount()).toBe(0)
  })
})
