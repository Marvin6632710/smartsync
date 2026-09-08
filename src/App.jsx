import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import SplashPage from './pages/SplashPage'
import OnboardingPage from './pages/OnboardingPage'
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SplashPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
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
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
