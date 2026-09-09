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

  useEffect(() => {
    return observeAuth(async (firebaseUser) => {
      setAuthUser(firebaseUser)
      if (!firebaseUser) {
        setPublicProfile(null)
        setPrivateProfile(null)
        return
      }
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
    const stopPublic = watchUserProfile(authUser.uid, setPublicProfile, setProfileError)
    const stopPrivate = watchPrivateProfile(authUser.uid, setPrivateProfile, setProfileError)
    return () => {
      stopPublic()
      stopPrivate()
    }
  }, [authUser])

  const user = useMemo(() => {
    if (!authUser || !publicProfile) return null
    return {
      uid: authUser.uid,
      email: authUser.email,
      ...publicProfile,
      // The private half wins where both exist: `realName` is the truth,
      // `name` is only what the world is allowed to see.
      realName: privateProfile?.realName || publicProfile.name,
      privacy: { ...defaultPrivacy, ...(privateProfile?.privacy || {}) },
      location: privateProfile?.location || null,
      onboarded: privateProfile?.onboarded ?? false,
    }
  }, [authUser, publicProfile, privateProfile])

  const status = authUser === undefined ? 'loading' : !authUser ? 'signed-out' : 'ready'

  const value = {
    status,
    authUser,
    user,
    // The profile documents can lag the auth state by a frame or two after
    // sign-up; screens should wait rather than render a half-built user.
    profileReady: Boolean(user),
    profileError,
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
