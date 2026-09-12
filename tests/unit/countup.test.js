/**
 * The match-score counter.
 *
 * It animates a number the user is meant to trust, so the interesting failure
 * is not a janky animation but a wrong number. The bug these tests were
 * written for: with no animation frames arriving — a background tab, a
 * throttling browser — the counter sat on the 0 it starts from, so Discover's
 * top pick read "0%" when the score handed to it was 58. A number that is
 * merely unanimated is fine. A number that is wrong is not.
 */
import { describe, expect, test } from 'vitest'
import { countUpValue, shouldAnimate } from '../../src/hooks/useCountUp'

describe('countUpValue', () => {
  test('starts at zero and arrives exactly on the target', () => {
    expect(countUpValue(58, 0, 900)).toBe(0)
    expect(countUpValue(58, 900, 900)).toBe(58)
  })

  test('never overshoots, even past the end', () => {
    // easeOutCubic can be written so it exceeds 1; the clamp is what stops a
    // score reading 61% for a frame.
    expect(countUpValue(58, 1500, 900)).toBe(58)
    expect(countUpValue(100, 99_999, 900)).toBe(100)
  })

  test('climbs, and never goes backwards', () => {
    let previous = -1
    for (let e = 0; e <= 1000; e += 50) {
      const v = countUpValue(58, e, 900)
      expect(v).toBeGreaterThanOrEqual(previous)
      previous = v
    }
    expect(previous).toBe(58)
  })

  test('eases out rather than running linearly', () => {
    // Past the half-way point in time it should be well past half-way in
    // value, or the "settling" is a straight line with extra steps.
    expect(countUpValue(100, 450, 900)).toBeGreaterThan(50)
  })

  test('a negative or impossible elapsed time is not a negative score', () => {
    expect(countUpValue(58, -200, 900)).toBe(0)
    expect(countUpValue(58, NaN, 900)).toBe(58)
  })

  test('a zero-length animation shows the value rather than dividing by zero', () => {
    expect(countUpValue(58, 0, 0)).toBe(58)
    expect(Number.isNaN(countUpValue(58, 0, 0))).toBe(false)
  })

  test('a missing score reads 0, never NaN', () => {
    expect(countUpValue(undefined, 450, 900)).toBe(0)
    expect(countUpValue(null, 450, 900)).toBe(0)
    expect(countUpValue('58', 450, 900)).toBe(0)
  })

  test('zero is a real score and stays zero throughout', () => {
    expect(countUpValue(0, 0, 900)).toBe(0)
    expect(countUpValue(0, 900, 900)).toBe(0)
  })
})

describe('shouldAnimate', () => {
  test('animates only when the page is visible and motion is welcome', () => {
    expect(shouldAnimate({ reducedMotion: false, pageHidden: false })).toBe(true)
  })

  test('a hidden page does not animate — this is the 0% bug', () => {
    // No frames are delivered to a hidden page, so animating there means
    // showing 0 forever. The caller returns the real value instead.
    expect(shouldAnimate({ reducedMotion: false, pageHidden: true })).toBe(false)
  })

  test('reduced motion does not animate', () => {
    expect(shouldAnimate({ reducedMotion: true, pageHidden: false })).toBe(false)
  })

  test('both at once still does not animate', () => {
    expect(shouldAnimate({ reducedMotion: true, pageHidden: true })).toBe(false)
  })
})
