/**
 * Signing up: the account exists the moment it is created, and everything
 * after that happens to it whether or not it succeeds.
 *
 * Creating the account wakes the auth observer, which swaps the route table
 * and unmounts the sign-up form — so a failure in the writes that follow is
 * thrown at nobody, and the person used to arrive in the app as "New user".
 * Two things fix that here: the name is left where the observer can find it
 * before the account exists, and the profile write is retried with a fresh
 * credential, a bounded number of times, before a failure is recorded.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const authUser = { uid: 'u1', email: 'x@y.z', displayName: null }
const getIdToken = vi.fn(() => Promise.resolve('token'))
const createUserWithEmailAndPassword = vi.fn(() => Promise.resolve({ user: authUser }))
const updateProfile = vi.fn(() => Promise.resolve())
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword,
  onAuthStateChanged: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  updateProfile,
}))
vi.mock('../../src/firebase/config', () => ({
  auth: { currentUser: { uid: 'u1', getIdToken } },
  // users.js builds document references at import time.
  db: {},
}))
const ensureUserProfile = vi.fn(() => Promise.resolve(true))
vi.mock('../../src/firebase/users', async (importActual) => ({
  ...(await importActual()),
  ensureUserProfile,
}))
vi.mock('../../src/firebase/activities', () => ({
  hostedActivityRefs: vi.fn(),
  hostedActivitiesFromServer: vi.fn(),
  stampHostIdentity: vi.fn(),
}))
const reportError = vi.fn()
vi.mock('../../src/utils/reportError', () => ({ reportError }))

const { pendingSignUpName, retryRefused, RETRY_DELAYS_MS, signUp } =
  await import('../../src/firebase/auth')

const refused = { code: 'permission-denied' }

beforeEach(() => {
  vi.useFakeTimers()
  authUser.displayName = null
  createUserWithEmailAndPassword.mockReset()
  createUserWithEmailAndPassword.mockImplementation(() => Promise.resolve({ user: authUser }))
  updateProfile.mockReset()
  updateProfile.mockImplementation(() => Promise.resolve())
  ensureUserProfile.mockReset()
  ensureUserProfile.mockImplementation(() => Promise.resolve(true))
  getIdToken.mockClear()
  reportError.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

/** Runs a sign-up to completion, letting every retry delay elapse. */
const complete = async (promise) => {
  await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + 1000)
  return promise
}

describe('signUp', () => {
  test('names the account and writes the profile once when everything works', async () => {
    const user = await complete(signUp({ email: ' x@y.z ', password: 'secret1', name: ' Alice ' }))
    expect(user).toBe(authUser)
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'x@y.z',
      'secret1',
    )
    expect(updateProfile).toHaveBeenCalledWith(authUser, { displayName: 'Alice' })
    expect(ensureUserProfile).toHaveBeenCalledTimes(1)
    expect(ensureUserProfile).toHaveBeenCalledWith('u1', { name: 'Alice', email: 'x@y.z' })
    expect(getIdToken).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
  })

  test('leaves the name for the observer before the account exists, and clears it after', async () => {
    let duringCreation
    createUserWithEmailAndPassword.mockImplementationOnce(async () => {
      duringCreation = pendingSignUpName('X@Y.Z ')
      return { user: authUser }
    })
    let duringProfile
    ensureUserProfile.mockImplementationOnce(async () => {
      duringProfile = pendingSignUpName('x@y.z')
      return true
    })
    await complete(signUp({ email: 'x@y.z', password: 'secret1', name: 'Alice' }))
    expect(duringCreation).toBe('Alice')
    expect(duringProfile).toBe('Alice')
    expect(pendingSignUpName('x@y.z')).toBeNull()
    // Another address never sees it.
    expect(pendingSignUpName('other@y.z')).toBeNull()
  })

  test('a refused profile write buys a fresh credential and lands on the second try', async () => {
    ensureUserProfile.mockRejectedValueOnce(refused).mockResolvedValueOnce(true)
    const user = await complete(signUp({ email: 'x@y.z', password: 'secret1', name: 'Alice' }))
    expect(user).toBe(authUser)
    expect(getIdToken).toHaveBeenCalledTimes(1)
    expect(getIdToken).toHaveBeenCalledWith(true)
    expect(ensureUserProfile).toHaveBeenCalledTimes(2)
    expect(reportError).not.toHaveBeenCalled()
  })

  test('a profile write refused every time is recorded once, and the account is still returned', async () => {
    ensureUserProfile.mockRejectedValue(refused)
    const user = await complete(signUp({ email: 'x@y.z', password: 'secret1', name: 'Alice' }))
    expect(user).toBe(authUser)
    expect(ensureUserProfile).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1)
    expect(getIdToken).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length)
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith('auth.signUp.profile', refused, { uid: 'u1' })
    // Nothing is left behind for a later sign-up to pick up.
    expect(pendingSignUpName('x@y.z')).toBeNull()
  })

  test('any other failure after the account exists is recorded once, not retried', async () => {
    ensureUserProfile.mockImplementation(() => Promise.reject(new Error('malformed')))
    const user = await complete(signUp({ email: 'x@y.z', password: 'secret1', name: 'Alice' }))
    expect(user).toBe(authUser)
    expect(ensureUserProfile).toHaveBeenCalledTimes(1)
    expect(getIdToken).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  test('a display name that could not be set is recorded, and the profile is still written', async () => {
    updateProfile.mockRejectedValueOnce({ code: 'auth/network-request-failed' })
    await complete(signUp({ email: 'x@y.z', password: 'secret1', name: 'Alice' }))
    expect(reportError).toHaveBeenCalledWith(
      'auth.signUp.displayName',
      { code: 'auth/network-request-failed' },
      { uid: 'u1' },
    )
    expect(ensureUserProfile).toHaveBeenCalledWith('u1', { name: 'Alice', email: 'x@y.z' })
  })

  test('a failure to create the account itself is still the caller’s to show, and leaves no name behind', async () => {
    createUserWithEmailAndPassword.mockImplementationOnce(() =>
      Promise.reject({ code: 'auth/email-already-in-use' }),
    )
    await expect(signUp({ email: 'x@y.z', password: 'secret1', name: 'Alice' })).rejects.toEqual({
      code: 'auth/email-already-in-use',
    })
    expect(updateProfile).not.toHaveBeenCalled()
    expect(ensureUserProfile).not.toHaveBeenCalled()
    expect(pendingSignUpName('x@y.z')).toBeNull()
  })
})

describe('retryRefused', () => {
  test('returns the first success without waiting', async () => {
    const run = vi.fn(async () => 'value')
    await expect(retryRefused(run)).resolves.toBe('value')
    expect(run).toHaveBeenCalledTimes(1)
    expect(getIdToken).not.toHaveBeenCalled()
  })

  test('waits each delay, then refreshes, then tries again — and gives up after the last', async () => {
    const run = vi.fn(async () => {
      throw refused
    })
    const outcome = retryRefused(run, { delays: [400, 1200] })
    outcome.catch(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(399)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getIdToken).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1200)
    expect(run).toHaveBeenCalledTimes(3)
    expect(getIdToken).toHaveBeenCalledTimes(2)
    await expect(outcome).rejects.toBe(refused)
  })

  test('a blink of the connection is retried too; a verdict is not', async () => {
    const blink = vi.fn().mockRejectedValueOnce({ code: 'unavailable' }).mockResolvedValueOnce('ok')
    const settled = retryRefused(blink)
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
    await expect(settled).resolves.toBe('ok')
    expect(blink).toHaveBeenCalledTimes(2)

    const verdict = vi.fn().mockRejectedValue({ code: 'invalid-argument' })
    await expect(retryRefused(verdict)).rejects.toEqual({ code: 'invalid-argument' })
    expect(verdict).toHaveBeenCalledTimes(1)
  })

  test('the delays are what the sign-up runs into in practice: under two seconds in all', () => {
    expect(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThan(2000)
  })
})

describe('the name', () => {
  test('is cut to what the rules accept, so the profile it creates cannot be refused', async () => {
    // A sixty-first character used to refuse the profile write and leave a
    // brand-new account on "Can't load your profile".
    const long = 'A'.repeat(75)
    await complete(signUp({ email: 'x@y.z', password: 'secret1', name: long }))
    expect(ensureUserProfile).toHaveBeenCalledWith('u1', { name: 'A'.repeat(60), email: 'x@y.z' })
    expect(updateProfile).toHaveBeenCalledWith(authUser, { displayName: 'A'.repeat(60) })
  })

  test('an empty name becomes the placeholder, as before', async () => {
    await complete(signUp({ email: 'x@y.z', password: 'secret1', name: '   ' }))
    expect(updateProfile).toHaveBeenCalledWith(authUser, { displayName: 'New user' })
  })
})
