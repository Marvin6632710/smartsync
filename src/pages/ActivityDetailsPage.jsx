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
import BootScreen from '../components/BootScreen'
import CategoryIcon from '../components/CategoryIcon'
import GoingStack from '../components/GoingStack'
import ConfirmDialog from '../components/ConfirmDialog'
import ReportDialog from '../components/ReportDialog'
import { MORPH } from '../hooks/useMorph'
import { removeActivity as removeAsModerator, restoreActivity } from '../firebase/moderation'
import { useModerationAction } from '../hooks/useModerationAction'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { storedContext } from '../i18n/reportContext'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { categoryLabel, distanceLabel, reasonLines, takedownReasonText, personName } from '../i18n'
import { formatActivityDate, formatClock } from '../utils/time'
import { activityBadge } from '../utils/urgency'

export default function ActivityDetailsPage() {
  const { t } = useTranslation()
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
    loading,
    syncing,
  } = useApp()
  const { user } = useAuth()
  const { perform } = useModerationAction()
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

  // Not loaded is not not found. Every deep link — a notification tap, a
  // shared URL, a reload on this page — arrives before the first snapshot,
  // and this used to say the activity did not exist for exactly as long as
  // the connection was slow.
  if (!a && (loading || syncing)) return <BootScreen label={t('app.loadingActivity')} />

  if (!a) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>{t('activity.notFound')}</h3>
          {/* Two facts look the same from here: deleted, and further ahead
              than the window of upcoming activities the app loads. */}
          <p>{t('activity.notFoundBody')}</p>
          <button className="primary-button" onClick={() => navigate('/home')}>
            {t('common.back')}
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
  const removalReason =
    takedownReasonText(a.moderation?.reason) || t('activity.defaultRemovalReason')
  const fill = Math.max(
    0,
    Math.min(100, Math.round((a.participants / Math.max(a.capacity, 1)) * 100)),
  )

  // Through the same door as the queue: nothing starts offline, nothing
  // waits for ever, and nothing is reported as done before it is.
  const moderate = async (next) => {
    const reason = moderationReason.trim()
    if (!reason) return
    setModerating(true)
    try {
      const done = await perform(
        () =>
          next === 'removed'
            ? removeAsModerator(id, { moderatorId: user.uid, reason })
            : restoreActivity(id, { adminId: user.uid, reason }),
        {
          done: () =>
            next === 'removed'
              ? {
                  icon: 'check',
                  tone: 'success',
                  title: t('activity.moderator.removedTitle'),
                  body: t('activity.moderator.removedBody', { title: a.title }),
                }
              : {
                  icon: 'check',
                  tone: 'success',
                  title: t('activity.moderator.restoredTitle'),
                  body: t('activity.moderator.restoredBody', { title: a.title }),
                },
          fail: (moderationError) => ({
            icon: 'alert',
            tone: 'warning',
            title: t('activity.moderator.failedTitle'),
            body:
              moderationError?.code === 'permission-denied'
                ? t('activity.moderator.adminOnlyRestore')
                : t('common.repeatingIsSafe'),
          }),
        },
      )
      if (done) setModerationReason('')
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

  const badge = activityBadge(a)

  // Three groups, invisible on a phone (they lay out as their contents) and
  // the columns of the page on a wide screen: what the activity is, the
  // actions on it, and what comes after.
  return (
    <div className="page-content detail-page">
      <div className="detail-main">
        <section
          className="detail-hero"
          data-category={(a.category || '').toLowerCase()}
          style={{ viewTransitionName: MORPH }}
        >
          <div className="card-topline">
            <span className="category-chip">
              <CategoryIcon category={a.category} size={12} />
              {categoryLabel(a.category)}
            </span>
            <span className="match-pill">{t('common.match', { value: a.matchScore })}</span>
          </div>
          <h2>{a.title}</h2>
          {/* The same badge the card carried, so opening it does not quietly
            drop the reason you tapped. */}
          {badge && (
            <span className={`urgency-pill tone-${badge.tone} detail-badge`}>{badge.label}</span>
          )}
          {isCancelled && <p className="cancelled-banner">{t('activity.cancelledByHost')}</p>}
          {/* Removal is not cancellation and should not read like it: the people
            who joined are entitled to know it was taken down rather than
            called off, so they do not turn up expecting it. */}
          {isRemoved && (
            <p className="cancelled-banner removed-banner">
              {isHost
                ? t('activity.removedForHost', { reason: removalReason })
                : t('activity.removedForOthers', { reason: removalReason })}
            </p>
          )}
          {!isCancelled && isPast && (
            <p className="cancelled-banner past-banner">{t('activity.alreadyTakenPlace')}</p>
          )}
          <p>{a.description}</p>
          <div className="detail-facts">
            <span>
              <MapPin size={14} />
              {a.locationName}
              {a.distanceKm != null && ` · ${distanceLabel(a.distanceKm)}`}
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
              {t('activity.joinedCount', { count: a.participants, capacity: a.capacity })}
            </span>
          </div>
          <div className="capacity-meter large-meter">
            <span style={{ width: `${fill}%` }} />
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t('activity.whyThis')}</span>
              <h2>{t('activity.matchReasons')}</h2>
            </div>
            <button className="text-button" onClick={() => navigate(`/recommendations/${id}`)}>
              {t('common.more')}
            </button>
          </div>
          <ul className="reason-list">
            {reasonLines(a).map((r) => (
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
              <span className="eyebrow">{t('activity.hostEyebrow')}</span>
              <h3>{personName(a.hostName)}</h3>
            </div>
          </div>
          {/* A name with no face is a database row. The avatar is already on
            the activity, so this costs nothing and makes the host a person
            you are deciding whether to spend an evening with. */}
          <div className="host-row">
            <span className="avatar" aria-hidden="true">
              {a.hostAvatar || '?'}
            </span>
            <span className="host-copy">
              <strong>{personName(a.hostName)}</strong>
              <small>{t('activity.hostingThis')}</small>
            </span>
          </div>

          <div className="going-row">
            <GoingStack uids={a.participantUids} capacity={a.capacity} max={5} />
            <button
              className="secondary-button"
              onClick={() => navigate(`/activity/${id}/participants`)}
            >
              <Users size={17} /> {t('activity.viewAll')}
            </button>
          </div>
        </section>
      </div>

      <div className="detail-rail">
        {/* The facts the decision rests on, beside the action on a wide screen
            where the rail keeps its place as the hero scrolls away. The hero
            above already reads them out, so this is for the eye only. */}
        <div className="rail-summary" aria-hidden="true">
          <span>
            <CalendarDays size={15} />
            <strong>
              {formatActivityDate(a.date)} · {formatClock(a.time)}
            </strong>
          </span>
          <span>
            <MapPin size={15} />
            {a.locationName}
            {a.distanceKm != null && ` · ${distanceLabel(a.distanceKm)}`}
          </span>
          <span>
            <Users size={15} />
            {t('activity.joinedCount', { count: a.participants, capacity: a.capacity })}
          </span>
        </div>
        {/* No edit button on something that was taken down. The rules refuse the
          write, so offering it would only walk the host into a dead end. */}
        {isHost && !isRemoved && (
          <button
            className="secondary-button wide"
            onClick={() => navigate(`/activity/${id}/edit`)}
          >
            <Edit3 size={17} /> {t('activity.editActivity')}
          </button>
        )}

        {/* The primary action sticks to the bottom of the scroller. Joining is
          the point of this screen and it used to sit below three panels, so
          on a phone you had to scroll past the reasons and the host before
          you could act on any of it. */}
        <div className="detail-actions">
          {isCancelled || isRemoved || isPast ? (
            <button
              className="secondary-button wide"
              onClick={() => navigate(`/activity/${id}/chat`)}
            >
              <MessageCircle size={18} /> {t('activity.openChat')}
            </button>
          ) : isHost ? (
            <div className="action-stack">
              <button
                className="primary-button wide"
                onClick={() => navigate(`/activity/${id}/chat`)}
              >
                <MessageCircle size={18} /> {t('activity.openChat')}
              </button>
              <button className="danger-button wide" onClick={() => setCancelOpen(true)}>
                {isEmpty ? t('activity.deleteActivity') : t('activity.cancelActivity')}
              </button>
            </div>
          ) : joined ? (
            <div className="action-stack">
              <button
                className="primary-button wide"
                onClick={() => navigate(`/activity/${id}/chat`)}
              >
                <MessageCircle size={18} /> {t('activity.openChat')}
              </button>
              <button className="danger-button wide" onClick={() => leaveActivity(id)}>
                {t('activity.leaveActivity')}
              </button>
            </div>
          ) : (
            <button
              className="primary-button wide"
              disabled={a.participants >= a.capacity}
              onClick={() => joinActivity(id)}
            >
              {a.participants >= a.capacity ? t('activity.full') : t('activity.joinActivity')}
            </button>
          )}
        </div>
      </div>

      <div className="detail-more">
        {/* Moderator tools sit on every activity, not only ones that were
          reported — otherwise the only things anybody can act on are the ones
          somebody bothered to flag. Shown to a moderator looking at somebody
          else's activity: their own has Cancel and Delete instead. */}
        {user.isModerator && !isHost && (isRemoved ? user.isAdmin : !isCancelled) && (
          <section className="panel moderator-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{t('activity.moderator.eyebrow')}</span>
                <h3>
                  {isRemoved ? t('activity.moderator.putBack') : t('activity.moderator.takeDown')}
                </h3>
              </div>
            </div>
            <p className="helper-text">
              {isRemoved
                ? t('activity.moderator.putBackHint')
                : t('activity.moderator.takeDownHint')}
            </p>
            <label className="report-detail">
              {isRemoved ? t('activity.moderator.whyPutBack') : t('activity.moderator.whyTakeDown')}
              <input
                maxLength={300}
                placeholder={
                  isRemoved
                    ? t('activity.moderator.putBackPlaceholder')
                    : t('activity.moderator.takeDownPlaceholder')
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
              {moderating
                ? t('common.working')
                : isRemoved
                  ? t('activity.moderator.putItBack')
                  : t('activity.moderator.removeActivity')}
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
                label: 'activity.reportLabel',
                context: storedContext('activity', {
                  title: a.title,
                  place: a.locationName,
                  host: a.hostName,
                }),
              })
            }
          >
            <Flag size={15} /> {t('activity.reportThis')}
          </button>
        )}
      </div>

      <ReportDialog
        open={Boolean(reporting)}
        subject={reporting}
        onClose={() => setReporting(null)}
      />

      <ConfirmDialog
        open={cancelOpen}
        title={isEmpty ? t('activity.deleteDialogTitle') : t('activity.cancelDialogTitle')}
        body={
          isEmpty
            ? t('activity.deleteDialogBody', { title: a.title })
            : t('activity.cancelDialogBody', { title: a.title })
        }
        confirmLabel={isEmpty ? t('common.delete') : t('activity.cancelActivity')}
        cancelLabel={t('common.keepIt')}
        tone="danger"
        onConfirm={confirmCancel}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  )
}
