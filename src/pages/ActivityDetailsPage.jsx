import React, { useState } from 'react'
import {
  CalendarDays,
  Check,
  Clock3,
  Edit3,
  Flag,
  MapPin,
  MessageCircle,
  Users,
} from 'lucide-react'
import CategoryIcon from '../components/CategoryIcon'
import ConfirmDialog from '../components/ConfirmDialog'
import ReportDialog from '../components/ReportDialog'
import { removeActivity as removeAsModerator, restoreActivity } from '../firebase/moderation'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { formatDistance } from '../utils/geo'
import { formatActivityDate, formatClock } from '../utils/time'

export default function ActivityDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    activities,
    allActivities,
    joinedIds,
    joinActivity,
    leaveActivity,
    cancelActivity,
    removeActivity,
    pushCelebration,
  } = useApp()
  const { user } = useAuth()
  // Declared before the not-found early return: hooks must run
  // unconditionally on every render.
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reporting, setReporting] = useState(null)
  // Moderator tools on any activity, not only ones somebody reported. A queue
  // driven entirely by reports can only ever see what people bother to flag.
  const [moderationReason, setModerationReason] = useState('')
  const [moderating, setModerating] = useState(false)
  // Read from `activities`, not `recommendations`: a cancelled activity is
  // dropped from recommendations but the people who joined it still need to
  // be able to open it and see that it was called off.
  // Discovery's list first, then — for a moderator only — everything else the
  // listener holds. Without the fallback, following "Look at it" from a report
  // to something already taken down, or to a cancelled activity they never
  // joined, showed a moderator "Activity not found" for a document they are
  // explicitly allowed to read.
  const a =
    activities.find((item) => item.id === id) ||
    (user.isModerator ? allActivities.find((item) => item.id === id) : undefined)

  if (!a) {
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Activity not found</h3>
          <p>Please go back.</p>
          <button className="primary-button" onClick={() => navigate('/home')}>
            Back
          </button>
        </div>
      </div>
    )
  }

  const joined = joinedIds.includes(id)
  const isHost = a.hostId === user.uid
  const isCancelled = a.status === 'cancelled'
  const isRemoved = a.status === 'removed'
  const isPast = Boolean(a.isPast)
  // Nobody else has joined, so there is nobody to notify — this is a removal,
  // not a cancellation, and calling it "cancel" would overstate what happened.
  const isEmpty = (a.participantUids || []).length <= 1
  // A takedown that will not say what it was for reads as arbitrary, and the
  // host has no way to do better next time. The stored reason is one of a
  // fixed set and never names whoever reported it.
  const removalReason = a.moderation?.reason || 'it broke our safety policy'
  const fill = Math.max(
    0,
    Math.min(100, Math.round((a.participants / Math.max(a.capacity, 1)) * 100)),
  )

  const moderate = async (next) => {
    const reason = moderationReason.trim()
    if (!reason) return
    setModerating(true)
    try {
      if (next === 'removed') {
        await removeAsModerator(id, { moderatorId: user.uid, reason })
        pushCelebration({
          icon: 'check',
          tone: 'success',
          title: 'Activity removed',
          body: `${a.title} is gone from discovery. The host and everyone who joined have been told.`,
        })
      } else {
        await restoreActivity(id, { adminId: user.uid, reason })
        pushCelebration({
          icon: 'check',
          tone: 'success',
          title: 'Put back',
          body: `${a.title} is visible again, and the host has been told.`,
        })
      }
      setModerationReason('')
    } catch (moderationError) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: "Couldn't do that",
        body:
          moderationError?.code === 'permission-denied'
            ? 'Only an admin can put a removed activity back.'
            : 'Try again.',
      })
    } finally {
      setModerating(false)
    }
  }

  const confirmCancel = () => {
    setCancelOpen(false)
    if (isEmpty) removeActivity(id)
    else cancelActivity(id)
    navigate('/home')
  }

  return (
    <div className="page-content">
      <BackButton />

      <section className="detail-hero" data-category={(a.category || '').toLowerCase()}>
        <div className="card-topline">
          <span className="category-chip">
            <CategoryIcon category={a.category} size={12} />
            {a.category}
          </span>
          <span className="match-pill">{a.matchScore}% match</span>
        </div>
        <h2>{a.title}</h2>
        {isCancelled && (
          <p className="cancelled-banner">This activity was cancelled by the host.</p>
        )}
        {/* Removal is not cancellation and should not read like it: the people
            who joined are entitled to know it was taken down rather than
            called off, so they do not turn up expecting it. */}
        {isRemoved && (
          <p className="cancelled-banner removed-banner">
            {isHost
              ? `SmartSync removed this activity: ${removalReason}. It is no longer visible to anyone and cannot be put back from here.`
              : `SmartSync removed this activity: ${removalReason}. It is not going ahead.`}
          </p>
        )}
        {!isCancelled && isPast && (
          <p className="cancelled-banner past-banner">This activity has already taken place.</p>
        )}
        <p>{a.description}</p>
        <div className="detail-facts">
          <span>
            <MapPin size={14} />
            {a.locationName}
            {a.distanceKm != null && ` · ${formatDistance(a.distanceKm)}`}
          </span>
          <span>
            <CalendarDays size={14} />
            {formatActivityDate(a.date)}
          </span>
          <span>
            <Clock3 size={14} />
            {formatClock(a.time)}
          </span>
          <span>
            <Users size={14} />
            {a.participants}/{a.capacity} joined
          </span>
        </div>
        <div className="capacity-meter large-meter">
          <span style={{ width: `${fill}%` }} />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Why this?</span>
            <h2>Match reasons</h2>
          </div>
          <button className="text-button" onClick={() => navigate(`/recommendations/${id}`)}>
            More
          </button>
        </div>
        <ul className="reason-list">
          {(a.reasons || []).map((r) => (
            <li key={r}>
              <Check size={15} />
              {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Host</span>
            <h3>{a.hostName}</h3>
          </div>
        </div>
        <p className="helper-text">See who else is going.</p>
        <button
          className="secondary-button"
          onClick={() => navigate(`/activity/${id}/participants`)}
        >
          <Users size={17} /> View participants
        </button>
      </section>

      {/* No edit button on something that was taken down. The rules refuse the
          write, so offering it would only walk the host into a dead end. */}
      {isHost && !isRemoved && (
        <button className="secondary-button wide" onClick={() => navigate(`/activity/${id}/edit`)}>
          <Edit3 size={17} /> Edit activity
        </button>
      )}

      {isCancelled || isRemoved || isPast ? (
        <button className="secondary-button wide" onClick={() => navigate(`/activity/${id}/chat`)}>
          <MessageCircle size={18} /> Open chat
        </button>
      ) : isHost ? (
        <div className="action-stack">
          <button className="primary-button wide" onClick={() => navigate(`/activity/${id}/chat`)}>
            <MessageCircle size={18} /> Open chat
          </button>
          <button className="danger-button wide" onClick={() => setCancelOpen(true)}>
            {isEmpty ? 'Delete activity' : 'Cancel activity'}
          </button>
        </div>
      ) : joined ? (
        <div className="action-stack">
          <button className="primary-button wide" onClick={() => navigate(`/activity/${id}/chat`)}>
            <MessageCircle size={18} /> Open chat
          </button>
          <button className="danger-button wide" onClick={() => leaveActivity(id)}>
            Leave activity
          </button>
        </div>
      ) : (
        <button
          className="primary-button wide"
          disabled={a.participants >= a.capacity}
          onClick={() => joinActivity(id)}
        >
          {a.participants >= a.capacity ? 'Full' : 'Join activity'}
        </button>
      )}

      {/* Moderator tools sit on every activity, not only ones that were
          reported — otherwise the only things anybody can act on are the ones
          somebody bothered to flag. Shown to a moderator looking at somebody
          else's activity: their own has Cancel and Delete instead. */}
      {user.isModerator && !isHost && (isRemoved ? user.isAdmin : !isCancelled) && (
        <section className="panel moderator-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Moderator</span>
              <h3>{isRemoved ? 'Put this back?' : 'Take this down?'}</h3>
            </div>
          </div>
          <p className="helper-text">
            {isRemoved
              ? 'It was taken down by a moderator. Restoring it is recorded against the activity, and the host is told.'
              : 'It disappears for everyone, including the people who joined, and they are all told. The host cannot undo it — only an admin can.'}
          </p>
          <label className="report-detail">
            {isRemoved ? 'Why are you putting this back?' : 'Why is this coming down?'}
            <input
              maxLength={300}
              placeholder={
                isRemoved ? 'Reviewed again — the report was mistaken' : 'A safety concern'
              }
              value={moderationReason}
              onChange={(event) => setModerationReason(event.target.value)}
            />
          </label>
          <button
            className={isRemoved ? 'secondary-button wide' : 'danger-button wide'}
            disabled={!moderationReason.trim() || moderating}
            onClick={() => moderate(isRemoved ? 'active' : 'removed')}
          >
            {moderating ? 'Working…' : isRemoved ? 'Put it back' : 'Remove activity'}
          </button>
        </section>
      )}

      {/* Anyone can report an activity, including someone who has not joined
          it — a misleading or unsafe listing is visible before you commit. */}
      {!isHost && (
        <button
          className="text-button report-link"
          onClick={() =>
            setReporting({
              type: 'activity',
              id: a.id,
              // The host is the person answerable for an activity.
              subjectId: a.hostId,
              name: a.title,
              label: 'this activity',
              context: `${a.title} at ${a.locationName}, hosted by ${a.hostName}`,
            })
          }
        >
          <Flag size={15} /> Report this activity
        </button>
      )}

      <ReportDialog
        open={Boolean(reporting)}
        subject={reporting}
        onClose={() => setReporting(null)}
      />

      <ConfirmDialog
        open={cancelOpen}
        title={isEmpty ? 'Delete this activity?' : 'Cancel this activity?'}
        body={
          isEmpty
            ? `Nobody else has joined ${a.title}, so it will simply be removed.`
            : `Everyone who joined ${a.title} will be told it is off. The chat stays available to them.`
        }
        confirmLabel={isEmpty ? 'Delete' : 'Cancel activity'}
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={confirmCancel}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  )
}
