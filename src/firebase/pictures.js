import { doc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from './config'
import { validPicture, validPictureDataUrl } from '../utils/pictures'

const COLLECTIONS = {
  profile: 'profilePictures',
  activity: 'activityPictures',
  // Written by the moderation Function alone, and named by the message it
  // belongs to — so a picture cannot outlive, or arrive without, the
  // message that was checked with it (ADR-033).
  chat: 'chatPictures',
}

export const pictureRef = (kind, id) => doc(db, COLLECTIONS[kind] || COLLECTIONS.activity, id)

/** Called inside the same batch that saves the profile or activity. */
export function writePicture(batch, kind, id, picture) {
  if (!validPicture(picture)) throw new Error('pictures.readError')
  batch.set(pictureRef(kind, id), { ...picture, updatedAt: serverTimestamp() })
}

export function watchPicture(kind, id, callback, onError) {
  return onSnapshot(
    pictureRef(kind, id),
    (snap) => {
      const picture = snap.exists() ? snap.data() : null
      // A chat picture has no version: it is bound to its message by its
      // id, and the server is the only thing that can write it. What is
      // still checked is the bytes' shape, because rendering whatever a
      // document happens to hold into a src attribute is not something
      // to do on trust.
      if (kind === 'chat') {
        callback(validPictureDataUrl(picture?.dataUrl) ? { dataUrl: picture.dataUrl } : null)
        return
      }
      callback(validPicture(picture) ? picture : null)
    },
    onError,
  )
}
