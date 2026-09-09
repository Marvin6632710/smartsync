import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import BootScreen from './components/BootScreen'
import Shell from './components/Shell'
import { useAuth } from './context/AuthContext'

import SplashPage from './pages/SplashPage'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'
import PermissionPage from './pages/PermissionPage'
import InterestSelectionPage from './pages/InterestSelectionPage'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import MapPage from './pages/MapPage'
import ActivityDetailsPage from './pages/ActivityDetailsPage'
import CreateActivityPage from './pages/CreateActivityPage'
import EditActivityPage from './pages/EditActivityPage'
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
import PrivacyPage from './pages/PrivacyPage'
import JoinedActivitiesPage from './pages/JoinedActivitiesPage'
import NotFoundPage from './pages/NotFoundPage'

/**
 * Routing is gated on identity in three stages rather than protecting each
 * route individually: whole route tables swap, so there is no path through
 * the app where a signed-out visitor can reach a screen that assumes a user.
 */
export default function App() {
  const { status, user, profileReady } = useAuth()

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
        <Route path="/map" element={<MapPage />} />
        <Route path="/activity/:id" element={<ActivityDetailsPage />} />
        <Route path="/activity/:id/edit" element={<EditActivityPage />} />
        <Route path="/activity/:id/participants" element={<ParticipantsPage />} />
        <Route path="/activity/:id/chat" element={<ChatPage />} />
        <Route path="/create" element={<CreateActivityPage />} />
        <Route path="/filters" element={<FilterPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/recommendations/:id" element={<RecommendationDetailsPage />} />
        <Route path="/matching" element={<UserMatchingPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/edit" element={<EditProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
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
