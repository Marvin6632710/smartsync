import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LocationPicker from '../components/LocationPicker'
import UnsentDraft from '../components/UnsentDraft'
import PicturePicker from '../components/PicturePicker'
import CategoryIcon from '../components/CategoryIcon'
import { categories } from '../data/categories'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { deriveTimeBand } from '../firebase/activities'
import { categoryLabel, timeBandLabel } from '../i18n'
import { formatClock } from '../utils/time'
import { withinThailand } from '../data/region'

const today = () => new Date().toISOString().slice(0, 10)

const initial = {
  title: '',
  // Deliberately empty rather than defaulting to the first category. A
  // default here is not a convenience: category is what matching runs on, so
  // a study session published as Football by somebody who never opened the
  // dropdown is wrong for them, wrong for everybody it is then recommended
  // to, and teaches their own history the wrong thing.
  category: '',
  description: '',
  date: today(),
  time: '19:00',
  locationName: '',
  lat: null,
  lng: null,
  capacity: 10,
}

export default function CreateActivityPage() {
  const { t } = useTranslation()
  const [form, setForm] = useState(initial)
  // Kept as a translation key, so a change of language re-words it.
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picture, setPicture] = useState(null)
  const [pictureBusy, setPictureBusy] = useState(false)
  const { createActivity, unsent } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  // An activity created offline that the server refused once the connection
  // came back. Its form was long gone by then; this is where it comes back.
  const draft = unsent.find((row) => row.kind === 'activity-create' && row.status === 'failed')
  const restore = (payload) => {
    const fields = { ...payload }
    delete fields.id
    delete fields.picture
    setPicture(payload.picture || null)
    setForm({ ...initial, ...fields })
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    if (busy || pictureBusy) return
    if (!form.title.trim() || !form.description.trim()) {
      setError('create.errors.nameAndDescription')
      return
    }
    if (!form.category) {
      setError('create.errors.category')
      return
    }
    if (!form.locationName.trim()) {
      setError('create.errors.placeName')
      return
    }
    // A coordinate is required, and there is no sensible default: guessing one
    // would put a real activity somewhere nobody agreed to meet.
    if (form.lat == null || form.lng == null) {
      setError('create.errors.pin')
      return
    }
    // The picker will not let you place a pin outside the country, but the
    // form state can also arrive from a draft, so the check is repeated where
    // the save happens rather than trusted to the component that set it.
    if (!withinThailand(form.lat, form.lng)) {
      setError('location.outsideThailand')
      return
    }
    if (Number(form.capacity) < 2) {
      setError('create.errors.capacity')
      return
    }
    // A date field can be cleared, and an empty one sailed through the
    // check below: an invalid Date compares false to everything, the rules
    // then refused the write, and the toast blamed permissions. The edit
    // form already asks for both; so does this one now.
    const startsAt = new Date(`${form.date}T${form.time}`)
    if (!form.date || !form.time || Number.isNaN(startsAt.getTime())) {
      setError('create.errors.dateTime')
      return
    }
    if (startsAt < new Date()) {
      setError('create.errors.future')
      return
    }
    setError('')
    setBusy(true)
    const id = await createActivity({ ...form, ...(picture ? { picture } : {}) })
    setBusy(false)
    if (id) navigate(`/activity/${id}`)
  }

  // The button that leads here is disabled while suspended, but the route is
  // guessable — and a form somebody can fill in and never submit is worse
  // than being told plainly at the top.
  if (user.suspended)
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>{t('create.suspendedTitle')}</h3>
          <p>{t('create.suspendedBody')}</p>
        </div>
      </div>
    )

  return (
    <div className="page-content">
      <section>
        <span className="eyebrow">{t('create.eyebrow')}</span>
        <h2>{t('create.title')}</h2>
        <p className="helper-text">{t('create.lead')}</p>
      </section>

      <UnsentDraft
        row={draft}
        what={t('create.draftWhat', {
          title: draft?.payload?.title || t('create.draftFallback'),
        })}
        onRestore={restore}
      />

      <form className="form-card" onSubmit={submit}>
        <PicturePicker
          kind="activity"
          value={picture}
          onChange={setPicture}
          onBusyChange={setPictureBusy}
          disabled={busy}
        >
          <div className="picture-placeholder" data-category={form.category.toLowerCase()}>
            <CategoryIcon category={form.category} size={36} />
          </div>
        </PicturePicker>
        <label>
          {t('create.activityName')}
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={t('create.namePlaceholder')}
            maxLength={100}
          />
        </label>
        <label>
          {t('create.category')}
          {/* Stored values stay English; only the labels are translated. */}
          <select value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">{t('create.chooseCategory')}</option>
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
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={t('create.descriptionPlaceholder')}
            maxLength={1000}
          />
        </label>

        <div className="form-row">
          <label>
            {t('create.date')}
            <input
              type="date"
              min={today()}
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </label>
          <label>
            {t('create.time')}
            <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </label>
        </div>
        {/* Time band used to be a separate dropdown that could contradict the
            time. It is derived now, so it is shown rather than asked. */}
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
          {t('create.maxParticipants')}
          <input
            type="number"
            min="2"
            max="500"
            value={form.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <button className="primary-button wide" type="submit" disabled={busy || pictureBusy}>
          {busy ? t('create.busy') : t('create.submit')}
        </button>
      </form>
    </div>
  )
}
