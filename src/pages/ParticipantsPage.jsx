import React from 'react'
import { useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export default function ParticipantsPage() {
  const { id } = useParams()
  const { activities, peers } = useApp()
  const { user } = useAuth()
  const activity = activities.find((item) => item.id === id)

  if (!activity)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Activity not found</h3>
        </div>
      </div>
    )

  // Real people, resolved from the roster on the activity itself. A uid with
  // no matching profile is still shown — someone is on the roster, and
  // silently dropping them would make the count disagree with the list.
  const directory = [user, ...peers]
  const participants = (activity.participantUids || []).map((uid) => {
    const person = directory.find((entry) => entry?.uid === uid)
    return person || { uid, name: 'SmartSync user', avatar: '?', interests: [] }
  })

  return (
    <div className="page-content">
      <BackButton />
      <span className="eyebrow">{activity.title}</span>
      <h2>Participants</h2>
      <p className="helper-text">
        {activity.participants} of {activity.capacity} spots taken.
      </p>
      <div className="stack">
        {participants.map((person) => (
          <div className="person-card" key={person.uid}>
            <div className="avatar">{person.avatar || '?'}</div>
            <div>
              <h3>
                {person.name}
                {person.uid === activity.hostId && (
                  <span className="tiny-chip host-chip">Host</span>
                )}
                {person.uid === user.uid && <span className="tiny-chip">You</span>}
              </h3>
              <p>{(person.interests || []).slice(0, 3).join(' · ') || 'Activity participant'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
