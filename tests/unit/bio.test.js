/**
 * The bio's two ceilings, counted the way the rules count.
 */
import { expect, test } from 'vitest'
import { BIO_MAX_CHARS, BIO_MAX_WORDS, bioTooLong, countWords } from '../../src/utils/bio'

test('a word is a run of anything but whitespace', () => {
  expect(countWords('')).toBe(0)
  expect(countWords('   ')).toBe(0)
  expect(countWords('hello')).toBe(1)
  expect(countWords('  hello   world ')).toBe(2)
  expect(countWords('one\ntwo\tthree\r\nfour')).toBe(4)
  expect(countWords('ตัวอย่างภาษาไทย')).toBe(1)
  expect(countWords('你好 世界')).toBe(2)
})

test('too long is more than 75 words or more than 500 characters, after trimming', () => {
  const words = (n) => Array.from({ length: n }, () => 'about').join(' ')
  expect(BIO_MAX_WORDS).toBe(75)
  expect(BIO_MAX_CHARS).toBe(500)
  expect(bioTooLong(words(75))).toBe(false)
  expect(bioTooLong(words(76))).toBe(true)
  expect(bioTooLong('好'.repeat(500))).toBe(false)
  expect(bioTooLong('好'.repeat(501))).toBe(true)
  expect(bioTooLong('  ' + 'x'.repeat(500) + '  ')).toBe(false)
  expect(bioTooLong(null)).toBe(false)
})
