import { doc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from './config'
import { validPicture } from '../utils/pictures'

export const pictureRef = (kind, id) =>
  doc(db, kind === 'profile' ? 'profilePictures' : 'activityPictures', id)

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
      callback(validPicture(picture) ? picture : null)
    },
    onError,
  )
}
