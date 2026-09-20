import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePicture } from '../hooks/usePicture'

export default function SavedPicture({ kind, id, version, className, alt = '', fallback = null }) {
  const { user } = useAuth()
  const src = usePicture(user?.uid, kind, id, version)
  const [failed, setFailed] = useState(null)
  if (!src || src === failed) return fallback
  return <img src={src} alt={alt} className={className} onError={() => setFailed(src)} />
}

/** Keep initials and anonymous identities exactly as they were. */
export function AvatarContent({ person, showPrivate = false }) {
  const fallback = person?.avatar || '?'
  if (!person?.uid || !person.pictureVersion || (person.anonymous && !showPrivate)) return fallback
  return (
    <SavedPicture
      kind="profile"
      id={person.uid}
      version={person.pictureVersion}
      className="avatar-picture"
      fallback={fallback}
    />
  )
}

export function ActivityPicture({ activity, className = 'activity-picture' }) {
  if (!activity?.pictureVersion) return null
  return (
    <SavedPicture
      kind="activity"
      id={activity.id}
      version={activity.pictureVersion}
      className={className}
      alt={activity.title || ''}
    />
  )
}
