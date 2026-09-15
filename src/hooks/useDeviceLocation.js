import { useState } from 'react'

import { useAuth } from '../context/AuthContext'
import { updatePrivateProfile } from '../firebase/users'
import { coarsen, getCurrentPosition } from '../utils/geo'

const DENIED_MESSAGE = 'location.denied'
const SAVE_MESSAGE = 'location.saveFailed'

/**
 * Requests the device's real position and stores it on the user's private
 * profile.
 *
 * Two things make this honest rather than decorative: the browser's own
 * permission prompt is what actually gates it, and when "approximate
 * location" is on the precise fix never leaves the device — only a value
 * rounded to about a kilometre is written.
 */
export function useDeviceLocation() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const request = async () => {
    setBusy(true)
    setError('')
    let precise
    try {
      precise = await getCurrentPosition()
    } catch (locationError) {
      setError(locationError?.code === 1 ? DENIED_MESSAGE : 'location.unavailable')
      setBusy(false)
      return false
    }
    try {
      const stored = user.privacy.approximateLocation ? coarsen(precise) : precise
      // One write, and only the field that changed. The merge keeps the
      // rest of the privacy map as it is; spreading the whole map back in
      // used to copy the notifications preference — which lives on the
      // public profile — into the private one, where nothing reads it.
      await updatePrivateProfile(user.uid, {
        location: stored,
        privacy: { locationPermission: true },
      })
      return true
    } catch {
      // A write that failed is not a device that failed, and the message
      // used to blame the device for it.
      setError(SAVE_MESSAGE)
      return false
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    setError('')
    try {
      await updatePrivateProfile(user.uid, {
        location: null,
        privacy: { locationPermission: false },
      })
      return true
    } catch {
      setError(SAVE_MESSAGE)
      return false
    } finally {
      setBusy(false)
    }
  }

  return { request, clear, busy, error }
}
