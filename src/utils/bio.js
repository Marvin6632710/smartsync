// How much a bio may say. Two ceilings, because one is not enough for four
// languages: words for English, where 75 is a short paragraph, and
// characters for Thai, Burmese and Chinese, where a sentence has few or no
// spaces and a word count means little. The rules (`validBio`) hold the same
// two numbers and count words the same way; the bio is trimmed before it is
// written, so a leading space never costs a word.
export const BIO_MAX_WORDS = 75
export const BIO_MAX_CHARS = 500

// A word is a run of anything but whitespace — the same split the rules do.
export function countWords(text) {
  const words = String(text || '')
    .trim()
    .match(/\S+/g)
  return words ? words.length : 0
}

export function bioTooLong(text) {
  const value = String(text || '').trim()
  return value.length > BIO_MAX_CHARS || countWords(value) > BIO_MAX_WORDS
}
