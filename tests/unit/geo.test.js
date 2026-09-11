/**
 * The geography.
 *
 * Distance is 20% of every match score and the thing the map is sorted by, so
 * an error here is not cosmetic — it quietly reorders what everybody is shown.
 * It is also the easiest code in the app to get subtly wrong: the poles, the
 * antimeridian, and the difference between "zero kilometres away" and "we do
 * not know where you are" all look the same if you are not careful.
 */
import { describe, expect, test } from 'vitest'
import { coarsen, distanceBetween, formatDistance } from '../../src/utils/geo'

const BANGKOK = { lat: 13.7563, lng: 100.5018 }
const CHIANG_MAI = { lat: 18.7883, lng: 98.9853 }
const SINGAPORE = { lat: 1.3521, lng: 103.8198 }

describe('distanceBetween', () => {
  test('agrees with reality on routes we can check', () => {
    // Bangkok to Chiang Mai is about 580 km great-circle; Bangkok to
    // Singapore about 1430 km. Two percent is plenty tight to catch a
    // radians/degrees slip or a wrong Earth radius.
    expect(distanceBetween(BANGKOK, CHIANG_MAI)).toBeGreaterThan(568)
    expect(distanceBetween(BANGKOK, CHIANG_MAI)).toBeLessThan(592)
    expect(distanceBetween(BANGKOK, SINGAPORE)).toBeGreaterThan(1400)
    expect(distanceBetween(BANGKOK, SINGAPORE)).toBeLessThan(1460)
  })

  test('is zero to yourself, and never negative', () => {
    expect(distanceBetween(BANGKOK, BANGKOK)).toBe(0)
    expect(distanceBetween(BANGKOK, CHIANG_MAI)).toBeGreaterThan(0)
  })

  test('measures the same distance in both directions', () => {
    const there = distanceBetween(BANGKOK, SINGAPORE)
    const back = distanceBetween(SINGAPORE, BANGKOK)
    expect(Math.abs(there - back)).toBeLessThan(1e-9)
  })

  test('unknown is null, which is not the same as zero', () => {
    // The scorer treats an unknown distance as neutral and a zero as "on top
    // of you". Collapsing the two would make every activity look adjacent to
    // anybody who has not shared a location.
    expect(distanceBetween(null, BANGKOK)).toBeNull()
    expect(distanceBetween(BANGKOK, undefined)).toBeNull()
    expect(distanceBetween({ lat: 13.7 }, BANGKOK)).toBeNull()
    expect(distanceBetween({ lat: 'here', lng: 'there' }, BANGKOK)).toBeNull()
    expect(distanceBetween({ lat: NaN, lng: 0 }, BANGKOK)).toBeNull()
  })

  test('survives the antimeridian without returning nonsense', () => {
    // Two points either side of the date line are close together on the
    // ground. A naive implementation reports most of the way round the world.
    const east = { lat: 0, lng: 179.9 }
    const west = { lat: 0, lng: -179.9 }
    const across = distanceBetween(east, west)
    expect(across).toBeGreaterThan(0)
    expect(across).toBeLessThan(30)
  })

  test('survives the poles', () => {
    const northPole = { lat: 90, lng: 0 }
    const southPole = { lat: -90, lng: 0 }
    const poleToPole = distanceBetween(northPole, southPole)
    // Half the circumference, about 20 015 km.
    expect(poleToPole).toBeGreaterThan(19_900)
    expect(poleToPole).toBeLessThan(20_100)
    // Longitude is meaningless at the pole; every meridian meets there.
    expect(distanceBetween({ lat: 90, lng: 0 }, { lat: 90, lng: 170 })).toBeLessThan(0.001)
  })

  test('the farthest two points on Earth are half a circumference apart', () => {
    // Guards the `Math.min(1, ...)` clamp: floating point can push the term
    // just past 1 for antipodal points, and Math.asin of that is NaN.
    const antipode = distanceBetween(
      { lat: 13.7563, lng: 100.5018 },
      { lat: -13.7563, lng: -79.4982 },
    )
    expect(Number.isNaN(antipode)).toBe(false)
    expect(antipode).toBeGreaterThan(19_900)
    expect(antipode).toBeLessThan(20_100)
  })
})

describe('coarsen', () => {
  test('rounds to about a kilometre, in both hemispheres', () => {
    expect(coarsen({ lat: 13.7563, lng: 100.5018 })).toEqual({ lat: 13.76, lng: 100.5 })
    expect(coarsen({ lat: -33.8688, lng: 151.2093 })).toEqual({ lat: -33.87, lng: 151.21 })
  })

  test('moves a real position by less than the grid it snaps to', () => {
    // The promise is "roughly a kilometre", so the error has to stay under
    // about 1.6 km — the diagonal of a 0.01-degree cell at the equator.
    const exact = { lat: 13.7563, lng: 100.5018 }
    expect(distanceBetween(exact, coarsen(exact))).toBeLessThan(1.6)
  })

  test('actually loses the precision it claims to', () => {
    // Two homes 300 m apart must be capable of snapping to the same cell,
    // or the setting is telling the user something untrue.
    const a = coarsen({ lat: 13.75611, lng: 100.50111 })
    const b = coarsen({ lat: 13.75633, lng: 100.50144 })
    expect(a).toEqual(b)
  })

  test('unknown stays unknown', () => {
    expect(coarsen(null)).toBeNull()
    expect(coarsen({ lat: 1 })).toBeNull()
    expect(coarsen({ lat: 'x', lng: 'y' })).toBeNull()
  })
})

describe('formatDistance', () => {
  test('switches units where a person would', () => {
    expect(formatDistance(0)).toBe('0 m')
    expect(formatDistance(0.45)).toBe('450 m')
    expect(formatDistance(0.999)).toBe('999 m')
    expect(formatDistance(1)).toBe('1.0 km')
    expect(formatDistance(2.44)).toBe('2.4 km')
    expect(formatDistance(9.99)).toBe('10.0 km')
    expect(formatDistance(10)).toBe('10 km')
    expect(formatDistance(12.6)).toBe('13 km')
  })

  test('unknown renders as nothing, never as "0 m" or "NaN km"', () => {
    expect(formatDistance(null)).toBe('')
    expect(formatDistance(undefined)).toBe('')
    expect(formatDistance(NaN)).toBe('')
    expect(formatDistance(Infinity)).toBe('')
  })
})
