/**
 * What a client is allowed to ask the chat Function to send, checked
 * field by field before anything else happens.
 *
 * The browser is not the only thing that can call a callable Function, so
 * nothing here trusts a shape, a size or a content type it was told. In
 * particular the picture is decoded and its first bytes are read: a
 * `data:image/png` header over a zip file is a lie the declared type
 * cannot catch, and "validate file types on the server" means the bytes,
 * not the label.
 *
 * Pure: no network, no database, no clock beyond what is passed in.
 */

/** The same ceilings the rules and the picture helper already use. */
export const MAX_TEXT = 2000
export const MAX_DATA_URL = 320_000
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const DATA_URL_PATTERN = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+=*)$/

export class BadRequest extends Error {
  constructor(message) {
    super(message)
    this.code = 'invalid-argument'
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Control characters out, whitespace folded, cut to length. */
export function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== 'string') return ''
  return (
    value
      // Deliberate: these are exactly the characters being removed, and
      // newline and tab are deliberately not among them.
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, max)
  )
}

/**
 * The type a picture's bytes actually are, or null.
 *
 * Three signatures, which is all `IMAGE_TYPES` allows: JPEG's FFD8FF,
 * PNG's eight-byte header, and WebP's RIFF container with WEBP at byte
 * eight.
 */
export function sniffImageType(bytes) {
  if (!bytes || bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((byte, index) => bytes[index] === byte)) return 'image/png'
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

/**
 * A picture as the client sent it, or a refusal. Returns the data URL
 * re-built from what was verified, so nothing but checked bytes and a
 * checked type can reach the thread.
 */
export function cleanImage(raw) {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') throw new BadRequest('image must be a data URL')
  if (raw.length > MAX_DATA_URL) throw new BadRequest('image is too large')
  const match = DATA_URL_PATTERN.exec(raw)
  if (!match) throw new BadRequest('image must be a base64 png, jpeg or webp data URL')
  const declared = `image/${match[1]}`
  let bytes
  try {
    bytes = Buffer.from(match[2], 'base64')
  } catch {
    throw new BadRequest('image is not valid base64')
  }
  if (bytes.length === 0) throw new BadRequest('image is empty')
  const actual = sniffImageType(bytes)
  if (!actual) throw new BadRequest('image is not a png, jpeg or webp')
  // Declared and actual must agree: a mismatch is either a broken client
  // or somebody trying to hide one kind of file inside another.
  if (actual !== declared) throw new BadRequest('image type does not match its content')
  return { dataUrl: raw, type: actual, bytes: bytes.length }
}

/**
 * The whole request. `clientMsgId` is the browser's own id for this
 * send: it becomes the message's document id, which is what makes a
 * retry after a timeout land on the same document instead of posting
 * the message twice.
 */
export function validateSend(data) {
  if (!isObject(data)) throw new BadRequest('the request must be an object')
  const activityId = typeof data.activityId === 'string' ? data.activityId : ''
  if (!ID_PATTERN.test(activityId)) throw new BadRequest('activityId is not an id')
  const clientMsgId = typeof data.clientMsgId === 'string' ? data.clientMsgId : ''
  if (!ID_PATTERN.test(clientMsgId)) throw new BadRequest('clientMsgId is not an id')
  const text = cleanText(data.text)
  const image = cleanImage(data.image)
  if (!text && !image) throw new BadRequest('a message needs text or a picture')
  return { activityId, clientMsgId, text, image }
}
