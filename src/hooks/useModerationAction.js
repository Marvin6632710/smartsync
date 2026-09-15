import { useApp } from '../context/AppContext'

/** How long a moderation action is waited for before the screen is unblocked. */
export const MODERATION_WAIT_MS = 20_000

/** Returned by `perform` in place of the action's outcome when the budget ran out. */
export const STILL_TRYING = Symbol('still-trying')

const OFFLINE_TOAST = {
  icon: 'alert',
  tone: 'warning',
  title: "You're offline",
  body: 'Moderation needs a connection. Nothing was changed — try again when you are back online.',
}

const STILL_TRYING_TOAST = {
  icon: 'alert',
  tone: 'warning',
  title: 'Still trying',
  body: 'This needs a connection. It will finish if the connection comes back; you can also try again later — repeating it is safe.',
}

/**
 * Runs a moderation action the way one has to be run.
 *
 * Moderation writes are transactions, and a transaction needs the server:
 * offline, the SDK retries for a long time and the button said "Working…"
 * for as long as it did. So nothing is started while the app knows it is
 * offline — the person is told, and nothing changed, which is true. Online,
 * the action is given a budget; past it the screen is unblocked and told
 * the outcome is still unknown, and the real outcome is announced when it
 * arrives. Every action behind this is idempotent, so "try again" is always
 * safe advice. Nothing here ever reports success it has not seen.
 *
 * `start` is called only when the action is actually going to run; `done`
 * and `fail` turn its outcome into the toast to show.
 */
export function useModerationAction() {
  const { offline, pushCelebration } = useApp()

  const perform = async (start, { done, fail }) => {
    if (offline) {
      pushCelebration(OFFLINE_TOAST)
      return false
    }
    const job = start()
    let timer
    const budget = new Promise((resolve) => {
      timer = setTimeout(() => resolve(STILL_TRYING), MODERATION_WAIT_MS)
    })
    try {
      const outcome = await Promise.race([job, budget])
      if (outcome === STILL_TRYING) {
        pushCelebration(STILL_TRYING_TOAST)
        job.then(
          (late) => pushCelebration(done(late)),
          (error) => pushCelebration(fail(error)),
        )
        return true
      }
      pushCelebration(done(outcome))
      return true
    } catch (error) {
      pushCelebration(fail(error))
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  return { perform, offline }
}
