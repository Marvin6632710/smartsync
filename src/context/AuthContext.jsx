import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { observeAuth, signIn, signOutUser, signUp } from '../firebase/auth'
import {
  defaultPrivacy,
  ensureUserProfile,
  watchPrivateProfile,
  watchUserProfile,
} from '../firebase/users'

const AuthContext = createContext(null)

/**
 * Identity, kept separate from application data.
 *
 * The rest of the app reads one merged `user` object rather than two
 * documents, because the public/private split is a storage concern — screens
 * should not have to know which half a field lives in. The split still holds
 * where it matters: the private half simply is not readable by anyone else.
 */
export function AuthProvider({ children }) {
  // undefined while Firebase is still restoring the session from disk. That
  // is deliberately distinct from null (definitely signed out), otherwise
  // every reload flashes the sign-in screen before the session resolves.
  const [authUser, setAuthUser] = useState(undefined)
  const [publicProfile, setPublicProfile] = useState(null)
  const [privateProfile, setPrivateProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  // Whether each listener has reported back at least once. Tracked separately
  // from the data itself because the two documents arrive independently, and
  // routing that reads `onboarded` before the private half lands would send
  // an established user back through setup — with a replace navigation, so
  // the mistake would stick rather than correct itself a frame later.
  const [loaded, setLoaded] = useState({ pub: false, priv: false })

  useEffect(() => {
    return observeAuth(async (firebaseUser) => {
      setAuthUser(firebaseUser)
      if (!firebaseUser) {
        setPublicProfile(null)
        setPrivateProfile(null)
        setLoaded({ pub: false, priv: false })
        return
      }
      setLoaded({ pub: false, priv: false })
      try {
        // Covers accounts created before the profile write landed, and any
        // account created outside the sign-up form.
        await ensureUserProfile(firebaseUser.uid, {
          name: firebaseUser.displayName,
          email: firebaseUser.email,
        })
      } catch (error) {
        setProfileError(error)
      }
    })
  }, [])

  useEffect(() => {
    if (!authUser) return undefined
    const stopPublic = watchUserProfile(
      authUser.uid,
      (profile) => {
        setPublicProfile(profile)
        setLoaded((current) => ({ ...current, pub: true }))
      },
      setProfileError,
    )
    const stopPrivate = watchPrivateProfile(
      authUser.uid,
      (profile) => {
        setPrivateProfile(profile)
        setLoaded((current) => ({ ...current, priv: true }))
      },
      setProfileError,
    )
    return () => {
      stopPublic()
      stopPrivate()
    }
  }, [authUser])

  /**
   * Re-attempts profile creation after a failure. Exposed so the UI can offer
   * a way out rather than stranding the user on a spinner.
   */
  const retryProfile = async () => {
    if (!authUser) return
    setProfileError(null)
    try {
      await ensureUserProfile(authUser.uid, {
        name: authUser.displayName,
        email: authUser.email,
      })
    } catch (error) {
      setProfileError(error)
    }
  }

  const user = useMemo(() => {
    if (!authUser || !publicProfile) return null
    return {
      uid: authUser.uid,
      email: authUser.email,
      ...publicProfile,
      // The private half wins where both exist: `realName` is the truth,
      // `name` is only what the world is allowed to see.
      realName: privateProfile?.realName || publicProfile.name,
      privacy: {
        ...defaultPrivacy,
        ...(privateProfile?.privacy || {}),
        // Read from the public half — screens should not have to know that
        // this one setting lives somewhere different from its neighbours.
        notifications: publicProfile.notificationsEnabled ?? true,
      },
      location: privateProfile?.location || null,
      onboarded: privateProfile?.onboarded ?? false,
    }
  }, [authUser, publicProfile, privateProfile])

  const status = authUser === undefined ? 'loading' : !authUser ? 'signed-out' : 'ready'

  const value = {
    status,
    authUser,
    user,
    // Both halves must have reported before any screen renders: the routing
    // decision depends on fields from each, and acting on half the profile
    // sends people to the wrong place.
    profileReady: Boolean(user) && loaded.pub && loaded.priv,
    profileError,
    retryProfile,
    signUp,
    signIn,
    signOut: signOutUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
