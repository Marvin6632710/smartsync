import React, { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import BootScreen from './components/BootScreen'
import ProfileErrorScreen from './components/ProfileErrorScreen'
import Shell from './components/Shell'
import { useAuth } from './context/AuthContext'

import SplashPage from './pages/SplashPage'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'
import PermissionPage from './pages/PermissionPage'
import InterestSelectionPage from './pages/InterestSelectionPage'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import ActivityDetailsPage from './pages/ActivityDetailsPage'
import FilterPage from './pages/FilterPage'
import RecommendationsPage from './pages/RecommendationsPage'
import RecommendationDetailsPage from './pages/RecommendationDetailsPage'
import UserMatchingPage from './pages/UserMatchingPage'
import ParticipantsPage from './pages/ParticipantsPage'
import ChatPage from './pages/ChatPage'
import MessagesPage from './pages/MessagesPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import EditProfilePage from './pages/EditProfilePage'
import SettingsPage from './pages/SettingsPage'
import WeightsPage from './pages/WeightsPage'
import PrivacyPage from './pages/PrivacyPage'
import JoinedActivitiesPage from './pages/JoinedActivitiesPage'
import NotFoundPage from './pages/NotFoundPage'

// The three map-bearing screens are loaded on demand. Leaflet plus its CSS is
// a large dependency that most sessions never touch, and making everyone pay
// for it on first paint is the wrong trade on a phone.
const MapPage = lazy(() => import('./pages/MapPage'))
const CreateActivityPage = lazy(() => import('./pages/CreateActivityPage'))
const EditActivityPage = lazy(() => import('./pages/EditActivityPage'))

/**
 * Routing is gated on identity in three stages rather than protecting each
 * route individually: whole route tables swap, so there is no path through
 * the app where a signed-out visitor can reach a screen that assumes a user.
 */
export default function App() {
  const { status, user, profileReady, profileError, retryProfile, signOut } = useAuth()

  // Stage 1 — session still resolving from disk.
  if (status === 'loading') return <BootScreen label="Starting SmartSync…" />

  // Stage 2 — signed out. Only the public routes exist at all.
  if (status === 'signed-out') {
    return (
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    )
  }

  // Signed in, but the profile could not be built. Checked before the loading
  // state, or a failure is indistinguishable from a slow network and the user
  // waits on a spinner that will never resolve.
  if (profileError && !profileReady)
    return <ProfileErrorScreen error={profileError} onRetry={retryProfile} onSignOut={signOut} />

  // Signed in, but the profile documents have not arrived yet.
  if (!profileReady) return <BootScreen label="Loading your profile…" />

  // Stage 3 — signed in but not set up. The recommendation engine has nothing
  // to work with until interests exist, so setup is not skippable.
  if (!user.onboarded) {
    return (
      <Routes>
        <Route path="/interests" element={<InterestSelectionPage />} />
        <Route path="/permissions" element={<PermissionPage />} />
        <Route path="*" element={<Navigate to="/interests" replace />} />
      </Routes>
    )
  }

  // Stage 4 — the app proper.
  return (
    <Routes>
      <Route path="/permissions" element={<PermissionPage />} />
      <Route path="/interests" element={<InterestSelectionPage />} />

      <Route element={<Shell />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route
          path="/map"
          element={
            <Suspense fallback={<BootScreen label="Loading map…" />}>
              <MapPage />
            </Suspense>
          }
        />
        <Route path="/activity/:id" element={<ActivityDetailsPage />} />
        <Route
          path="/activity/:id/edit"
          element={
            <Suspense fallback={<BootScreen label="Loading…" />}>
              <EditActivityPage />
            </Suspense>
          }
        />
        <Route path="/activity/:id/participants" element={<ParticipantsPage />} />
        <Route path="/activity/:id/chat" element={<ChatPage />} />
        <Route
          path="/create"
          element={
            <Suspense fallback={<BootScreen label="Loading…" />}>
              <CreateActivityPage />
            </Suspense>
          }
        />
        <Route path="/filters" element={<FilterPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/recommendations/:id" element={<RecommendationDetailsPage />} />
        <Route path="/matching" element={<UserMatchingPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/edit" element={<EditProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/weights" element={<WeightsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/joined" element={<JoinedActivitiesPage />} />
        <Route path="/404" element={<NotFoundPage />} />
      </Route>

      {/* Signed-in users have no reason to see the splash or auth screens. */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/signin" element={<Navigate to="/home" replace />} />
      <Route path="/signup" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
