export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
// Keep each picture comfortably below Firestore's document limit. Pictures
// live separately from the lists of profiles and activities.
export const MAX_PICTURE_LENGTH = 320000
export const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function validatePictureFile(file) {
  if (!file || !PICTURE_TYPES.includes(file.type)) throw new Error('pictures.typeError')
  if (!file.size) throw new Error('pictures.readError')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('pictures.sizeError')
}

/** The bytes half of the check, shared with chat pictures, which have no version. */
export function validPictureDataUrl(dataUrl) {
  return (
    typeof dataUrl === 'string' &&
    dataUrl.length <= MAX_PICTURE_LENGTH &&
    /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(dataUrl)
  )
}

export function validPicture(picture) {
  return (
    typeof picture?.version === 'string' &&
    /^[a-zA-Z0-9-]{1,64}$/.test(picture.version) &&
    validPictureDataUrl(picture?.dataUrl)
  )
}

/** Decode and re-encode a static picture, removing original file metadata. */
export async function preparePicture(file, kind = 'activity') {
  validatePictureFile(file)
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image()
      candidate.onload = () => resolve(candidate)
      candidate.onerror = () => reject(new Error('pictures.readError'))
      candidate.src = url
    })
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('pictures.readError')
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('pictures.readError')
    // A chat photo is looked at in a bubble, not full-bleed, and it has
    // to survive a moderation call and a Firestore document — 1024 is
    // the size where all three are comfortable.
    let edge = kind === 'profile' ? 512 : kind === 'chat' ? 1024 : 1440
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/webp', Math.max(0.6, 0.86 - attempt * 0.05))
      const picture = { dataUrl, version: crypto.randomUUID() }
      if (validPicture(picture)) return picture
      edge = Math.floor(edge * 0.75)
    }
    throw new Error('pictures.readError')
  } catch (error) {
    if (error.message?.startsWith('pictures.')) throw error
    throw new Error('pictures.readError')
  } finally {
    URL.revokeObjectURL(url)
  }
}
