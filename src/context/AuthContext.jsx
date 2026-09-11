import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { observeAuth, signIn, signOutUser, signUp } from '../firebase/auth'
import { watchRole } from '../firebase/moderation'
import { useListenerRetry } from '../hooks/useListenerRetry'
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
  const [loaded, setLoaded] = useState({ pub: false, priv: false, role: false })
  // Roles live in their own collection precisely so a user cannot edit their
  // own. A missing row means an ordinary user, so nothing is written at
  // sign-up and the listener answers immediately either way.
  const [access, setAccess] = useState({ role: 'user', suspended: false, banned: false })
  const { attempt: profileAttempt, guard, resetAttempts } = useListenerRetry(authUser?.uid || null)

  useEffect(() => {
    return observeAuth(async (firebaseUser) => {
      setAuthUser(firebaseUser)
      // Whatever went wrong belonged to whoever was signed in before. Signing
      // out tears down three listeners while the credential is already gone,
      // and at least one of them reports permission-denied on the way out —
      // so without this line, signing out and straight back in as somebody
      // else lands on "Can't load your profile" and stays there until the
      // page is reloaded. Found by switching accounts in the running app.
      setProfileError(null)
      resetAttempts()
      if (!firebaseUser) {
        setPublicProfile(null)
        setPrivateProfile(null)
        setLoaded({ pub: false, priv: false, role: false })
        setAccess({ role: 'user', suspended: false, banned: false })
        return
      }
      setLoaded({ pub: false, priv: false, role: false })
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
  }, [resetAttempts])

  useEffect(() => {
    if (!authUser) return undefined
    // Unsubscribing does not guarantee silence: a listener can deliver one
    // last error after its stop function has run, and that error would then
    // be attributed to whoever signed in next. This flag makes the teardown
    // final from the app's point of view.
    let live = true
    const report = guard((error) => {
      if (live) setProfileError(error)
    })
    const stopPublic = watchUserProfile(
      authUser.uid,
      (profile) => {
        if (!live) return
        setPublicProfile(profile)
        setLoaded((current) => ({ ...current, pub: true }))
      },
      report,
    )
    const stopPrivate = watchPrivateProfile(
      authUser.uid,
      (profile) => {
        if (!live) return
        setPrivateProfile(profile)
        setLoaded((current) => ({ ...current, priv: true }))
      },
      report,
    )
    const stopRole = watchRole(
      authUser.uid,
      (next) => {
        if (!live) return
        setAccess(next)
        setLoaded((current) => ({ ...current, role: true }))
      },
      report,
    )
    return () => {
      live = false
      stopPublic()
      stopPrivate()
      stopRole()
    }
  }, [authUser, profileAttempt, guard])

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
      role: access.role,
      suspended: access.suspended,
      // A closed account. Every rank and every action is off, and the app
      // renders one screen saying so — see App.jsx.
      banned: access.banned,
      // A suspended account keeps its rank and exercises none of it, matching
      // the rules exactly. Showing the moderation queue to somebody whose
      // every action there would be refused is worse than hiding it.
      isModerator: (access.role === 'moderator' || access.role === 'admin') && !access.suspended,
      isAdmin: access.role === 'admin' && !access.suspended,
    }
  }, [authUser, publicProfile, privateProfile, access])

  const status = authUser === undefined ? 'loading' : !authUser ? 'signed-out' : 'ready'

  const value = {
    status,
    authUser,
    user,
    // Both halves must have reported before any screen renders: the routing
    // decision depends on fields from each, and acting on half the profile
    // sends people to the wrong place.
    profileReady: Boolean(user) && loaded.pub && loaded.priv && loaded.role,
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
