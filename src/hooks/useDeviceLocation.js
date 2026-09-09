import { useState } from 'react'

import { useAuth } from '../context/AuthContext'
import { saveLocation, updatePrivateProfile } from '../firebase/users'
import { coarsen, getCurrentPosition } from '../utils/geo'

const DENIED_MESSAGE =
  'Location is blocked for this site. Enable it in your browser settings, then try again.'

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
    try {
      const precise = await getCurrentPosition()
      const stored = user.privacy.approximateLocation ? coarsen(precise) : precise
      await saveLocation(user.uid, stored)
      await updatePrivateProfile(user.uid, {
        privacy: { ...user.privacy, locationPermission: true },
      })
      return true
    } catch (locationError) {
      setError(locationError?.code === 1 ? DENIED_MESSAGE : 'Could not get your location.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    await saveLocation(user.uid, null)
    await updatePrivateProfile(user.uid, {
      privacy: { ...user.privacy, locationPermission: false },
    })
  }

  return { request, clear, busy, error }
}
