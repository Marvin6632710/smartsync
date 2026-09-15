// @vitest-environment jsdom
/**
 * The durable store behind the unsent registry: a value is kept in memory
 * always, and in the best browser store that will take it — and the
 * choice is remade on every write, because storage can be blocked
 * outright, or fill up, or come back.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

const { DURABLE, forgetDurable, loadDurable, saveDurable } = await import('../../src/utils/storage')

const real = {
  local: Object.getOwnPropertyDescriptor(window, 'localStorage'),
  session: Object.getOwnPropertyDescriptor(window, 'sessionStorage'),
}
const restore = () => {
  Object.defineProperty(window, 'localStorage', real.local)
  Object.defineProperty(window, 'sessionStorage', real.session)
}
/** Makes the named store throw on access, as a page blocking site data does. */
const block = (name) =>
  Object.defineProperty(window, name, {
    configurable: true,
    get() {
      throw new DOMException('Storage is disabled', 'SecurityError')
    },
  })
/** A store that opens but refuses every write, as a full one does. */
const fill = (name) => {
  const store = window[name]
  Object.defineProperty(window, name, {
    configurable: true,
    get() {
      return {
        getItem: (key) => store.getItem(key),
        removeItem: (key) => store.removeItem(key),
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError')
        },
      }
    },
  })
}

beforeEach(() => {
  restore()
  localStorage.clear()
  sessionStorage.clear()
  forgetDurable()
})
afterEach(restore)

describe('with storage working', () => {
  test('lands in localStorage, and is read back from there', () => {
    expect(saveDurable('k', [1])).toBe(DURABLE.local)
    expect(JSON.parse(localStorage.getItem('k'))).toEqual([1])
    expect(loadDurable('k', [])).toEqual([1])
  })

  test('a missing or malformed value gives the fallback', () => {
    expect(loadDurable('nope', [])).toEqual([])
    localStorage.setItem('k', '{not json')
    expect(loadDurable('k', [])).toEqual([])
    localStorage.setItem('k', JSON.stringify({ wrong: 'shape' }))
    expect(loadDurable('k', [])).toEqual([])
  })

  test('a copy another tab wrote to localStorage is what is read, not this tab’s memory', () => {
    saveDurable('k', ['mine'])
    localStorage.setItem('k', JSON.stringify(['theirs']))
    expect(loadDurable('k', [])).toEqual(['theirs'])
  })
})

describe('with localStorage blocked', () => {
  beforeEach(() => block('localStorage'))

  test('nothing throws; the value lands in sessionStorage and reads back', () => {
    expect(() => saveDurable('k', [1])).not.toThrow()
    expect(saveDurable('k', [1])).toBe(DURABLE.session)
    expect(JSON.parse(sessionStorage.getItem('k'))).toEqual([1])
    expect(loadDurable('k', [])).toEqual([1])
  })
})

describe('with all browser storage blocked', () => {
  beforeEach(() => {
    block('localStorage')
    block('sessionStorage')
  })

  test('nothing throws; the value is kept in memory, and says so', () => {
    expect(saveDurable('k', [1, 2])).toBe(DURABLE.memory)
    expect(loadDurable('k', [])).toEqual([1, 2])
    expect(loadDurable('other', ['fallback'])).toEqual(['fallback'])
  })

  test('memory holds the latest write, not the first', () => {
    saveDurable('k', [1])
    saveDurable('k', [1, 2, 3])
    expect(loadDurable('k', [])).toEqual([1, 2, 3])
  })
})

describe('with localStorage full', () => {
  test('a write that is refused falls through to sessionStorage, and the stale copy is removed', () => {
    saveDurable('k', ['old'])
    expect(localStorage.getItem('k')).not.toBeNull()
    fill('localStorage')
    expect(saveDurable('k', ['new'])).toBe(DURABLE.session)
    // The copy localStorage still held would otherwise win the next read.
    expect(real.local.get.call(window).getItem('k')).toBeNull()
    expect(loadDurable('k', [])).toEqual(['new'])
  })

  test('both full: memory alone, nothing stale left in either store', () => {
    saveDurable('k', ['old'])
    fill('localStorage')
    fill('sessionStorage')
    expect(saveDurable('k', ['newer'])).toBe(DURABLE.memory)
    expect(real.local.get.call(window).getItem('k')).toBeNull()
    expect(real.session.get.call(window).getItem('k')).toBeNull()
    expect(loadDurable('k', [])).toEqual(['newer'])
  })

  test('storage that comes back is used again, and the lower copy is cleared', () => {
    fill('localStorage')
    expect(saveDurable('k', ['while full'])).toBe(DURABLE.session)
    restore()
    expect(saveDurable('k', ['after'])).toBe(DURABLE.local)
    expect(sessionStorage.getItem('k')).toBeNull()
    expect(JSON.parse(localStorage.getItem('k'))).toEqual(['after'])
  })
})
