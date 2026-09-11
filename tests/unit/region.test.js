/**
 * The operating area.
 *
 * These numbers are the one thing the map, the two activity forms and the
 * security rules all have to agree on. They are duplicated in firestore.rules
 * because the rules language cannot import — so the last test here compares
 * the two copies by reading the rules file, which is the only way a drift
 * between them gets caught before it reaches a user.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  MIN_ZOOM,
  THAILAND,
  THAILAND_BOUNDS,
  THAILAND_CENTRE,
  withinThailand,
} from '../../src/data/region'

describe('the box itself', () => {
  test('is the right way round', () => {
    // south/north and west/east reversed is the classic way to get a box that
    // contains nothing at all, and every `withinThailand` call would then be
    // false while looking perfectly reasonable.
    expect(THAILAND.south).toBeLessThan(THAILAND.north)
    expect(THAILAND.west).toBeLessThan(THAILAND.east)
  })

  test('contains the real extremes of the country', () => {
    // The four furthest points, from the comment in region.js. If a later
    // edit tightens the box past one of these, a real Thai town falls out.
    const extremes = [
      { name: 'Mae Sai, the northern tip', lat: 20.4457, lng: 99.8792 },
      { name: 'Betong, the southern tip', lat: 5.7754, lng: 101.0722 },
      { name: 'Mae Hong Son, the west', lat: 19.3, lng: 97.9684 },
      { name: 'Khong Chiam, the east', lat: 15.3191, lng: 105.4986 },
    ]
    for (const place of extremes) {
      expect(withinThailand(place.lat, place.lng), place.name).toBe(true)
    }
  })

  test('Leaflet gets [[south, west], [north, east]]', () => {
    // Leaflet takes the corners in that order and silently misbehaves if you
    // hand it lng/lat pairs.
    expect(THAILAND_BOUNDS).toEqual([
      [THAILAND.south, THAILAND.west],
      [THAILAND.north, THAILAND.east],
    ])
  })

  test('the fallback centre is inside the box it centres', () => {
    const [lat, lng] = THAILAND_CENTRE
    expect(withinThailand(lat, lng)).toBe(true)
  })

  test('the minimum zoom is a zoom level, not a distance', () => {
    expect(Number.isInteger(MIN_ZOOM)).toBe(true)
    expect(MIN_ZOOM).toBeGreaterThanOrEqual(0)
    expect(MIN_ZOOM).toBeLessThanOrEqual(19)
  })
})

describe('withinThailand', () => {
  test('says yes to the cities the app is for', () => {
    expect(withinThailand(13.7563, 100.5018)).toBe(true) // Bangkok
    expect(withinThailand(18.7883, 98.9853)).toBe(true) // Chiang Mai
    expect(withinThailand(7.8804, 98.3923)).toBe(true) // Phuket
    expect(withinThailand(12.9236, 100.8825)).toBe(true) // Pattaya
  })

  test('says no to everywhere else', () => {
    expect(withinThailand(1.3521, 103.8198)).toBe(false) // Singapore
    expect(withinThailand(35.6762, 139.6503)).toBe(false) // Tokyo
    expect(withinThailand(51.5072, -0.1276)).toBe(false) // London
    expect(withinThailand(-33.8688, 151.2093)).toBe(false) // Sydney
  })

  test('the edges are inclusive', () => {
    expect(withinThailand(THAILAND.south, THAILAND.west)).toBe(true)
    expect(withinThailand(THAILAND.north, THAILAND.east)).toBe(true)
    expect(withinThailand(THAILAND.south - 0.0001, THAILAND.west)).toBe(false)
    expect(withinThailand(THAILAND.north + 0.0001, THAILAND.east)).toBe(false)
    expect(withinThailand(THAILAND.south, THAILAND.west - 0.0001)).toBe(false)
    expect(withinThailand(THAILAND.north, THAILAND.east + 0.0001)).toBe(false)
  })

  test('needs both halves to be inside', () => {
    // A Bangkok latitude with a Tokyo longitude is in the Pacific.
    expect(withinThailand(13.7563, 139.6503)).toBe(false)
    expect(withinThailand(35.6762, 100.5018)).toBe(false)
  })

  test('rejects a missing coordinate rather than treating it as zero', () => {
    // `0, 0` is in the Atlantic and is what two empty fields coerce to, so
    // the guard has to be on finiteness and not on truthiness.
    expect(withinThailand(0, 0)).toBe(false)
    expect(withinThailand(null, null)).toBe(false)
    expect(withinThailand(undefined, undefined)).toBe(false)
    expect(withinThailand(NaN, 100.5)).toBe(false)
    expect(withinThailand(13.75, NaN)).toBe(false)
    expect(withinThailand(Infinity, 100.5)).toBe(false)
  })

  test('rejects a coordinate that is a string, even a plausible one', () => {
    // `'13.7' >= 5.5` is true in JavaScript. Number.isFinite is what stops a
    // form value that was never parsed from passing as a real position.
    expect(withinThailand('13.7563', '100.5018')).toBe(false)
    expect(withinThailand('13.7563', 100.5018)).toBe(false)
  })
})

describe('the copy of the box that lives in firestore.rules', () => {
  test('is the same box', () => {
    // The rules cannot import this module, so the numbers are written out
    // there by hand. This test is the thing that makes that duplication safe:
    // change one and it fails, rather than the map and the database quietly
    // disagreeing about what a valid activity is.
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf-8')
    const lat = rules.match(/data\.lat is number && data\.lat >= ([\d.]+) && data\.lat <= ([\d.]+)/)
    const lng = rules.match(/data\.lng is number && data\.lng >= ([\d.]+) && data\.lng <= ([\d.]+)/)
    expect(lat, 'latitude bound not found in firestore.rules').not.toBeNull()
    expect(lng, 'longitude bound not found in firestore.rules').not.toBeNull()
    expect(Number(lat[1])).toBe(THAILAND.south)
    expect(Number(lat[2])).toBe(THAILAND.north)
    expect(Number(lng[1])).toBe(THAILAND.west)
    expect(Number(lng[2])).toBe(THAILAND.east)
  })
})
