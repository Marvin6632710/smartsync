import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import {
  observeAuth,
  pendingSignUpDetails,
  refreshCredential,
  retryRefused,
  signIn,
  signOutUser,
  signUp,
} from '../firebase/auth'
import { watchRole } from '../firebase/moderation'
import { ageOn } from '../utils/age'
import { useListenerRetry } from '../hooks/useListenerRetry'
import {
  defaultPrivacy,
  ensureUserProfile,
  refreshPublicAge,
  watchPrivateProfile,
  watchUserProfile,
} from '../firebase/users'

const AuthContext = createContext(null)

/**
 * Makes sure the profile documents exist, tolerating a stale credential.
 *
 * The first read after signing up — or after signing out and straight back
 * in on the same page — can go out on a stream that is still carrying the
 * credential that was just revoked, and the rules refuse it. That is the
 * same race the listeners recover from with a fresh token; this one-shot
 * read had no such recovery, so a person who created an account was shown
 * "Can't load your profile" within half a second while their profile was,
 * in fact, being created. A refusal buys a fresh credential and another
 * try, a bounded number of times (see retryRefused); a refusal that
 * outlasts that is real and is surfaced.
 *
 * The name comes from the sign-up in progress when there is one — the Auth
 * record has no display name yet at the instant this runs — and is read
 * afresh on every try, so a later attempt sees a record the sign-up has
 * named meanwhile.
 */
function ensureProfileWithRetry(firebaseUser) {
  return retryRefused(() => {
    const pending = pendingSignUpDetails(firebaseUser.email)
    return ensureUserProfile(firebaseUser.uid, {
      name: pending?.name ?? firebaseUser.displayName,
      email: firebaseUser.email,
      dateOfBirth: pending?.dateOfBirth || '',
    })
  })
}

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
  // Has any of the three profile listeners been answered by the server this
  // session? These documents are tiny and are asked for first, so this is
  // the earliest proof there is a server at all — which is what tells a
  // slow first load of the activity feed apart from a connection that was
  // never made. Reset with the session, like everything else here.
  const [serverSeen, setServerSeen] = useState(false)
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
      setServerSeen(false)
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
        await ensureProfileWithRetry(firebaseUser)
      } catch (error) {
        setProfileError(error)
      }
    })
  }, [resetAttempts])

  // A serial number for "subscribe again". Bumped by Try again, so the three
  // listeners are remade rather than left as they were: after a refusal
  // that spent the retry budget they are dead, and re-running only the
  // profile write — which is what Try again used to do — cleared the error
  // and then sat on "Loading your profile…" for good, because nothing was
  // listening any more. A reload fixed it, which is the tell.
  const [resubscribe, setResubscribe] = useState(0)

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
    // Where the snapshot came from. A server answer is proof of a server;
    // the first one this session is remembered. The listeners now report
    // metadata changes as well, so the cache-to-server transition arrives
    // even when the document itself did not change — and a snapshot that
    // changed nothing but its origin must not re-render the whole app.
    const seen = (meta) => {
      if (meta && meta.fromCache === false) setServerSeen(true)
    }
    const unchanged = (previous, next) => JSON.stringify(previous) === JSON.stringify(next)
    const stopPublic = watchUserProfile(
      authUser.uid,
      (profile, meta) => {
        if (!live) return
        seen(meta)
        setPublicProfile((previous) => (unchanged(previous, profile) ? previous : profile))
        setLoaded((current) => (current.pub ? current : { ...current, pub: true }))
      },
      report,
    )
    const stopPrivate = watchPrivateProfile(
      authUser.uid,
      (profile, meta) => {
        if (!live) return
        seen(meta)
        setPrivateProfile((previous) => (unchanged(previous, profile) ? previous : profile))
        setLoaded((current) => (current.priv ? current : { ...current, priv: true }))
      },
      report,
    )
    const stopRole = watchRole(
      authUser.uid,
      (next, meta) => {
        if (!live) return
        seen(meta)
        setAccess((previous) => (unchanged(previous, next) ? previous : next))
        setLoaded((current) => (current.role ? current : { ...current, role: true }))
      },
      report,
    )
    return () => {
      live = false
      stopPublic()
      stopPrivate()
      stopRole()
    }
  }, [authUser, profileAttempt, guard, resubscribe])

  /**
   * A birthday that passed while nobody was looking.
   *
   * The public profile carries an age, which is a number derived from a
   * date, so it is wrong from somebody's birthday until something
   * corrects it. This is that something — and it has to exist, or
   * consenting to show your age once would pin a number to your profile
   * that slowly stopped being true.
   *
   * Cheap: the helper compares before it writes, so the ordinary case is
   * an equality check and no request at all. The dependencies are the
   * three values that could change the answer rather than the profile
   * objects themselves, so an unrelated snapshot does not re-run it.
   */
  const dateOfBirth = privateProfile?.dateOfBirth || ''
  const showsAge = privateProfile?.privacy?.showAge === true
  const shownAge = publicProfile?.age ?? null
  useEffect(() => {
    if (!authUser?.uid || !dateOfBirth) return
    // A refusal here is not worth troubling anybody with: the age on the
    // profile is a day or so stale and the next load tries again.
    refreshPublicAge(authUser.uid, { dateOfBirth, showAge: showsAge, age: shownAge }).catch(
      () => {},
    )
  }, [authUser?.uid, dateOfBirth, showsAge, shownAge])

  /**
   * Re-attempts profile creation after a failure. Exposed so the UI can offer
   * a way out rather than stranding the user on a spinner.
   */
  const retryProfile = useCallback(async () => {
    if (!authUser) return
    setProfileError(null)
    // A fresh token first, then fresh listeners, then the profile write —
    // the same order a reload produces, which is the recovery that worked.
    await refreshCredential()
    resetAttempts()
    setResubscribe((current) => current + 1)
    try {
      await ensureProfileWithRetry(authUser)
    } catch (error) {
      setProfileError(error)
    }
  }, [authUser, resetAttempts])

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
        // Consent to show an age, not the age itself. Off unless it was
        // turned on: a default that reveals something is not a default.
        showAge: privateProfile?.privacy?.showAge === true,
        // Read from the public half — screens should not have to know that
        // this one setting lives somewhere different from its neighbours.
        notifications: publicProfile.notificationsEnabled ?? true,
      },
      location: privateProfile?.location || null,
      onboarded: privateProfile?.onboarded ?? false,
      // The date is private and the age is computed from it, so no screen
      // has to do date arithmetic and none of them can disagree about how
      // old somebody is. `age` here is *their own* age whether or not they
      // show it; what other people see is the `age` field on the public
      // profile, which is null until they consent (see utils/age.js).
      dateOfBirth: privateProfile?.dateOfBirth || '',
      age: ageOn(privateProfile?.dateOfBirth || ''),
      // What the server knows of how this person reads, and what may reach
      // their devices; both private, both read by the push Function.
      language: privateProfile?.language || null,
      timeZone: privateProfile?.timeZone || null,
      pushPrefs: privateProfile?.notifications || {},
      // A rename or anonymous-mode switch saved offline stamped only the
      // activities the cache held; the rest are brought into line by the
      // app once the connection is back (see AppContext).
      identitySweepPending: privateProfile?.identitySweepPending === true,
      role: access.role,
      suspended: access.suspended,
      // A closed account. Every rank and every action is off, and the app
      // renders one screen saying so — see App.jsx.
      banned: access.banned,
      // A suspended account keeps its rank and exercises none of it, matching
      // the rules exactly. Showing the admin console to somebody whose every
      // action there would be refused is worse than hiding it.
      isAdmin: access.role === 'admin' && !access.suspended,
    }
  }, [authUser, publicProfile, privateProfile, access])

  const status = authUser === undefined ? 'loading' : !authUser ? 'signed-out' : 'ready'

  // Memoised, so identity changes only when something in it actually did.
  // An object literal here handed every consumer in the app a new context
  // value on every render of this provider — and this provider sits above
  // everything. The actions are safe to depend on: three are module-level
  // imports, and `retryProfile` is now a useCallback.
  const value = useMemo(
    () => ({
      status,
      authUser,
      user,
      // Both halves must have reported before any screen renders: the routing
      // decision depends on fields from each, and acting on half the profile
      // sends people to the wrong place.
      profileReady: Boolean(user) && loaded.pub && loaded.priv && loaded.role,
      profileError,
      serverSeen,
      retryProfile,
      signUp,
      signIn,
      signOut: signOutUser,
    }),
    [status, authUser, user, loaded, profileError, serverSeen, retryProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
