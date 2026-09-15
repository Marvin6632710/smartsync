/**
 * Waits for a Firestore write the way the app can afford to.
 *
 * A write's promise settles only when the server has acknowledged it. Offline,
 * that is never — Firestore keeps the write queued and applies it locally at
 * once, which is exactly what makes the app usable on patchy wifi — so every
 * screen that awaited a write behind a busy flag sat on "Saving…" until the
 * connection came back, with nothing saying why. Joining had already solved
 * this by not waiting; this generalises that answer without changing what an
 * ordinary online save looks like.
 *
 * The write is raced against a budget: nothing at all when the app already
 * knows it is offline, and a generous few seconds otherwise, so a connection
 * that has quietly died (the browser can say "online" for a minute after the
 * wifi has gone) does not hold a button hostage either. When the budget wins
 * the caller gets `QUEUED` — the write is still in Firestore's queue and will
 * be sent when it can — and a later refusal is delivered to `onLater`, so a
 * write that eventually fails is still reported rather than lost.
 *
 * A write that rejects before the budget is up rejects here too; the caller's
 * existing failure handling is untouched.
 */
export const WRITE_WAIT_MS = 10_000

/** Returned in place of the write's value when the server has not answered yet. */
export const QUEUED = Symbol('queued')

export function awaitWrite(write, { offline = false, waitMs = WRITE_WAIT_MS, onLater } = {}) {
  let timer
  const budget = new Promise((resolve) => {
    timer = setTimeout(() => resolve(QUEUED), offline ? 0 : waitMs)
  })
  return Promise.race([write, budget]).then(
    (outcome) => {
      clearTimeout(timer)
      if (outcome === QUEUED) {
        // Handled here so a refusal that arrives after the screen has moved
        // on is neither an unhandled rejection nor silent.
        write.then(undefined, (error) => onLater?.(error))
      }
      return outcome
    },
    (error) => {
      clearTimeout(timer)
      throw error
    },
  )
}
