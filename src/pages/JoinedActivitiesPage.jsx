import React from 'react'
import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'

export default function JoinedActivitiesPage() {
  // Already in the order commitments are kept: upcoming soonest first, then
  // what has been. An activity you joined that the host later cancelled is
  // still in it — this is your history, and recommendations drops those.
  const { joinedActivities: joined } = useApp()
  return (
    <div className="page-content">
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
