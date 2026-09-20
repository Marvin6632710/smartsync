import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  MAX_UPLOAD_BYTES,
  MAX_PICTURE_LENGTH,
  validatePictureFile,
  validPicture,
  preparePicture,
} from '../../src/utils/pictures'

describe('picture input validation', () => {
  test.each(['image/jpeg', 'image/png', 'image/webp'])(
    '%s is accepted through exactly 5 MB',
    (type) => {
      expect(() => validatePictureFile({ type, size: MAX_UPLOAD_BYTES })).not.toThrow()
      expect(() => validatePictureFile({ type, size: MAX_UPLOAD_BYTES + 1 })).toThrow(
        'pictures.sizeError',
      )
    },
  )
  test.each(['image/gif', 'image/svg+xml', 'text/html', '', 'application/pdf'])(
    '%s is refused',
    (type) => {
      expect(() => validatePictureFile({ type, size: 100 })).toThrow('pictures.typeError')
    },
  )
  test('empty files cannot be uploaded', () => {
    expect(() => validatePictureFile({ type: 'image/jpeg', size: 0 })).toThrow('pictures.readError')
  })
})

describe('preparing a picture for storage', () => {
  const dataUrl = 'data:image/webp;base64,aGVsbG8='
  const file = { type: 'image/png', size: 100 }
  const setup = ({ width = 2400, height = 1200, corrupt = false } = {}) => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = width
        naturalHeight = height
        set src(_) {
          queueMicrotask(() => (corrupt ? this.onerror() : this.onload()))
        }
      },
    )
    const drawImage = vi.fn()
    const canvas = { getContext: vi.fn(() => ({ drawImage })), toDataURL: vi.fn(() => dataUrl) }
    vi.stubGlobal('document', { createElement: () => canvas })
    return { canvas, drawImage, revoke }
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test.each([
    ['profile', 512, 256],
    ['activity', 1440, 720],
  ])('%s preserves proportions within its maximum edge', async (kind, width, height) => {
    const { canvas, drawImage, revoke } = setup()
    const picture = await preparePicture(file, kind)
    expect([canvas.width, canvas.height]).toEqual([width, height])
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, width, height)
    expect(validPicture(picture)).toBe(true)
    expect(revoke).toHaveBeenCalledWith('blob:test')
  })

  test('small portrait images are not enlarged', async () => {
    const { canvas } = setup({ width: 100, height: 200 })
    await preparePicture(file, 'profile')
    expect([canvas.width, canvas.height]).toEqual([100, 200])
  })

  test('an oversized encoded image is resized again before it can be stored', async () => {
    const { canvas } = setup()
    canvas.toDataURL.mockReturnValueOnce('data:image/webp;base64,' + 'A'.repeat(MAX_PICTURE_LENGTH))
    expect(await preparePicture(file)).toMatchObject({ dataUrl })
    expect(canvas.toDataURL).toHaveBeenCalledTimes(2)
    expect([canvas.width, canvas.height]).toEqual([1080, 540])
  })

  test('a corrupt file has a readable error and releases its temporary URL', async () => {
    const { revoke } = setup({ corrupt: true })
    await expect(preparePicture(file)).rejects.toThrow('pictures.readError')
    expect(revoke).toHaveBeenCalledWith('blob:test')
  })

  test('canvas failures have a readable error and release their temporary URL', async () => {
    const { canvas, revoke } = setup()
    canvas.toDataURL.mockImplementation(() => {
      throw new Error('Browser encoder error')
    })
    await expect(preparePicture(file)).rejects.toThrow('pictures.readError')
    expect(revoke).toHaveBeenCalledWith('blob:test')
  })
})

test('stored pictures must be bounded raster data with an opaque version', () => {
  const good = { version: '0001-a', dataUrl: 'data:image/png;base64,aGVsbG8=' }
  expect(validPicture(good)).toBe(true)
  expect(validPicture({ ...good, dataUrl: 'https://example.com/tracking.png' })).toBe(false)
  expect(validPicture({ ...good, dataUrl: 'data:image/svg+xml;base64,aGVsbG8=' })).toBe(false)
  expect(
    validPicture({ ...good, dataUrl: 'data:image/png;base64,' + 'A'.repeat(MAX_PICTURE_LENGTH) }),
  ).toBe(false)
  expect(validPicture({ ...good, version: '../other-user' })).toBe(false)
})
