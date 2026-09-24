import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BootScreen from '../components/BootScreen'
import LocationPicker from '../components/LocationPicker'
import UnsentDraft from '../components/UnsentDraft'
import PicturePicker from '../components/PicturePicker'
import { ActivityPicture } from '../components/SavedPicture'
import CategoryIcon from '../components/CategoryIcon'
import ActivitySchedulePicker from '../components/ActivitySchedulePicker'
import { categories } from '../data/categories'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { deriveTimeBand } from '../firebase/activities'
import { categoryLabel, takedownReasonText, timeBandLabel, personName } from '../i18n'
import { formatClock } from '../utils/time'
import { withinThailand } from '../data/region'

export default function EditActivityPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { activities, loading, syncing } = useApp()
  const { user } = useAuth()
  const existing = useMemo(() => activities.find((item) => item.id === id), [activities, id])

  // A reload of this URL lands before the listener has delivered anything;
  // that is loading, not missing.
  if (!existing && (loading || syncing)) return <BootScreen />

  if (!existing)
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>{t('activity.notFound')}</h3>
        </div>
      </div>
    )

  // The rules reject a non-host edit anyway; this keeps the user from filling
  // in a form that was always going to be refused.
  if (existing.hostId !== user.uid)
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>{t('edit.onlyHost')}</h3>
          <p>{t('edit.askHost', { name: personName(existing.hostName) })}</p>
        </div>
      </div>
    )

  // A removed activity is frozen: the rules refuse every edit to it, so the
  // form would only ever be a way to lose your typing. The details page no
  // longer offers the button, but this route is guessable.
  if (existing.status === 'removed')
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>{t('edit.removedTitle')}</h3>
          <p>
            {existing.moderation?.reason
              ? t('edit.removedWithReason', {
                  reason: takedownReasonText(existing.moderation.reason),
                })
              : t('edit.removedNoReason')}
          </p>
        </div>
      </div>
    )

  return <EditActivityForm existing={existing} />
}

/**
 * The form itself, mounted only once the activity is known.
 *
 * It used to live in the component above, seeded with `existing || {}` on
 * first render. On a cold load of this URL the listener has not delivered
 * anything yet, so the seed was `{}` — and when the activity arrived a moment
 * later the screen showed an edit form with every field empty. Seeding here
 * means the first render this form ever does already has the data; a later
 * snapshot updates `existing` without touching what is being typed, exactly
 * as before.
 */
function EditActivityForm({ existing }) {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { updateActivity, unsent } = useApp()
  const [form, setForm] = useState(existing)
  // A key and its values, so a change of language re-words the error.
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [picture, setPicture] = useState(null)
  const [pictureBusy, setPictureBusy] = useState(false)

  // An edit saved offline that the server refused later. The screen had
  // moved on; the typing is offered back here.
  const draft = unsent
    .filter((row) => row.kind === 'activity-edit' && row.key === id && row.status === 'failed')
    .at(-1)
  const restore = (payload) => {
    setForm((current) => ({ ...current, ...payload }))
    setPicture(payload.picture || null)
    setError(null)
  }

  const minCapacity = Math.max(2, existing.participants)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    if (busy || pictureBusy) return
    if (!form.title?.trim() || !form.description?.trim()) {
      setError({ key: 'edit.errors.nameAndDescription' })
      return
    }
    if (!form.locationName?.trim() || form.lat == null || form.lng == null) {
      setError({ key: 'edit.errors.placeAndPin' })
      return
    }
    // Editing is also the path by which an older activity outside the box
    // would be saved again, so it has to pass the same test as a new one.
    if (!withinThailand(form.lat, form.lng)) {
      setError({ key: 'location.outsideThailand' })
      return
    }
    if (Number(form.capacity) < minCapacity) {
      setError({ key: 'edit.errors.capacity', count: existing.participants })
      return
    }
    // Both halves of the instant, always: the data layer refuses one without
    // the other, and the rules refuse an empty time, so say so here.
    if (!form.date || !form.time) {
      setError({ key: 'create.errors.dateTime' })
      return
    }
    // Only when the time is being moved: a host fixing the description of
    // something that has already happened must not be told to reschedule it.
    const moved = form.date !== existing.date || form.time !== existing.time
    if (moved && new Date(`${form.date}T${form.time}`) < new Date()) {
      setError({ key: 'create.errors.future' })
      return
    }
    setError(null)
    setBusy(true)
    const saved = await updateActivity(
      id,
      {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        locationName: form.locationName.trim(),
        lat: Number(form.lat),
        lng: Number(form.lng),
        date: form.date,
        time: form.time,
        capacity: form.capacity,
        tags: [form.category, deriveTimeBand(form.time)].filter(Boolean),
        ...(picture ? { picture } : {}),
      },
      // What the form was seeded with, so a save queued offline can later
      // be told apart from an edit somebody else made meanwhile.
      { before: existing },
    )
    setBusy(false)
    // Stay put if it did not save. The toast has already said why, and the
    // typing is still on screen to try again with.
    if (saved) navigate(`/activity/${id}`)
  }

  return (
    <div className="page-content">
      <h2>{t('edit.title')}</h2>
      <UnsentDraft row={draft} what={t('edit.draftWhat')} onRestore={restore} />
      <form className="form-card" onSubmit={submit}>
        <PicturePicker
          kind="activity"
          value={picture}
          onChange={setPicture}
          onBusyChange={setPictureBusy}
          disabled={busy || existing.contentModeration?.picture?.active === true}
        >
          <div className="picture-placeholder" data-category={(form.category || '').toLowerCase()}>
            <CategoryIcon category={form.category} size={36} />
            <ActivityPicture activity={existing} className="picture-current" />
          </div>
        </PicturePicker>
        {existing.contentModeration?.picture?.active && (
          <p className="form-error">{t('appeals.fieldLocked')}</p>
        )}
        <label>
          {t('create.activityName')}
          <input
            value={form.title || ''}
            onChange={(e) => set('title', e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          {t('create.category')}
          <select
            value={form.category || 'Football'}
            onChange={(e) => set('category', e.target.value)}
          >
            {categories.map((option) => (
              <option key={option} value={option}>
                {categoryLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('create.description')}
          <textarea
            rows="4"
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
            maxLength={1000}
          />
        </label>
        <ActivitySchedulePicker
          date={form.date || ''}
          time={form.time || ''}
          onDateChange={(value) => set('date', value)}
          onTimeChange={(value) => set('time', value)}
        />
        <p className="helper-text">
          {t('create.countsAs', {
            time: formatClock(form.time),
            band: timeBandLabel(deriveTimeBand(form.time)).toLowerCase(),
          })}
        </p>

        <LocationPicker
          value={form}
          onChange={(next) => setForm((current) => ({ ...current, ...next }))}
        />

        <label>
          {t('create.capacity')}
          <input
            type="number"
            min={minCapacity}
            max="500"
            value={form.capacity || minCapacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </label>
        <p className="helper-text">{t('edit.minCapacity', { count: existing.participants })}</p>

        {error && (
          <p className="form-error" role="alert">
            {t(error.key, error)}
          </p>
        )}
        <button className="primary-button wide" disabled={busy || pictureBusy}>
          {busy ? t('common.saving') : t('edit.submit')}
        </button>
      </form>
    </div>
  )
}
