import React from 'react'
import BackButton from '../components/BackButton'
import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'

export default function JoinedActivitiesPage() {
  // From `activities`: an activity you joined that the host later cancelled
  // still belongs in your history, and recommendations drops those.
  const { activities, joinedIds } = useApp()
  const joined = activities
    .filter((a) => joinedIds.includes(a.id))
    // Your own commitments read best soonest-first, not best-match-first.
    .sort((a, b) => (a.startsAt || 0) - (b.startsAt || 0))
  return (
    <div className="page-content">
      <BackButton />
      <span className="eyebrow">Your activity history</span>
      <h2>Joined activities</h2>
      <div className="stack">
        {joined.map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
        {joined.length === 0 && (
          <div className="empty-state">
            <h3>No joined activities</h3>
            <p>Join an activity from discovery to see it here.</p>
          </div>
        )}
      </div>
    </div>
  )
}
