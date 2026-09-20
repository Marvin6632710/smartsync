// @vitest-environment jsdom
/**
 * The Terms & Safety agreement: kept on the device as the version that was
 * accepted, so a change of wording asks everybody again, and holding for
 * the page even where the browser refuses to keep anything.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  TERMS_KEY,
  TERMS_RULES,
  TERMS_SECTIONS,
  TERMS_VERSION,
  acceptTerms,
  hasAcceptedTerms,
  resetTermsAcceptance,
  useTermsAcceptance,
} from '../../src/terms'

beforeEach(() => {
  localStorage.clear()
  resetTermsAcceptance()
})
afterEach(() => {
  resetTermsAcceptance()
  localStorage.clear()
})

describe('acceptance', () => {
  test('is not assumed on a first visit', () => {
    expect(hasAcceptedTerms()).toBe(false)
  })

  test('is kept on the device as the version that was accepted', () => {
    acceptTerms()
    expect(hasAcceptedTerms()).toBe(true)
    expect(localStorage.getItem(TERMS_KEY)).toBe(TERMS_VERSION)
  })

  test('holds on the next visit', () => {
    localStorage.setItem(TERMS_KEY, TERMS_VERSION)
    expect(hasAcceptedTerms()).toBe(true)
  })

  test('lapses when the terms change: an older version counts as not accepted', () => {
    localStorage.setItem(TERMS_KEY, '2025-01-01')
    expect(hasAcceptedTerms()).toBe(false)
    localStorage.setItem(TERMS_KEY, 'true')
    expect(hasAcceptedTerms()).toBe(false)
  })

  test('holds for the page when the browser will not keep it', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    try {
      acceptTerms()
      expect(hasAcceptedTerms()).toBe(true)
      expect(localStorage.getItem(TERMS_KEY)).toBeNull()
    } finally {
      Storage.prototype.setItem = original
    }
  })
})

describe('useTermsAcceptance', () => {
  test('re-renders when the agreement is accepted, here or in another tab', () => {
    const { result } = renderHook(() => useTermsAcceptance())
    expect(result.current).toBe(false)
    act(() => acceptTerms())
    expect(result.current).toBe(true)

    act(() => resetTermsAcceptance())
    expect(result.current).toBe(false)
    // Another tab wrote the acceptance: the browser tells this one.
    act(() => {
      localStorage.setItem(TERMS_KEY, TERMS_VERSION)
      window.dispatchEvent(new StorageEvent('storage', { key: TERMS_KEY, newValue: TERMS_VERSION }))
    })
    expect(result.current).toBe(true)
  })
})

describe('the agreement itself', () => {
  test('names the eight things the app must never be used for, and seven sections', () => {
    expect(TERMS_RULES).toEqual([
      'trafficking',
      'sexual',
      'violence',
      'stalking',
      'scams',
      'illegal',
      'hate',
      'privateInfo',
    ])
    expect(TERMS_SECTIONS).toHaveLength(7)
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
