import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { categories, MIN_INTERESTS, timeBands } from '../data/categories'
import UnsentDraft from '../components/UnsentDraft'
import PicturePicker from '../components/PicturePicker'
import { AvatarContent } from '../components/SavedPicture'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { updateDisplayName } from '../firebase/users'
import { categoryLabel, timeBandLabel } from '../i18n'
import { BIO_MAX_CHARS, BIO_MAX_WORDS, bioTooLong, countWords } from '../utils/bio'
import { awaitWrite, QUEUED } from '../utils/writes'

export default function EditProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { offline, pushCelebration, unsent, keepUnsent, settleUnsent, failUnsent } = useApp()
  const navigate = useNavigate()
  // Seeded from realName, not the public name: while anonymous mode is on the
  // public document says "Anonymous user", and loading that into the field
  // would let a save overwrite the real name with the placeholder.
  const [form, setForm] = useState({
    name: user.realName,
    username: user.username,
    bio: user.bio || '',
    preferredTime: user.preferredTime || '',
    interests: user.interests || [],
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picture, setPicture] = useState(null)
  const [pictureBusy, setPictureBusy] = useState(false)
  const locks = user.contentModeration || {}

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  // A profile saved offline that the server refused once the connection
  // came back — offered back here rather than lost with the toast.
  const draft = unsent.filter((row) => row.kind === 'profile' && row.status === 'failed').at(-1)
  const restore = (payload) => {
    setForm((current) => ({ ...current, ...payload }))
    setPicture(payload.picture || null)
    setError('')
  }

  const toggle = (interest) =>
    setForm((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((item) => item !== interest)
        : [...current.interests, interest],
    }))

  const submit = async (event) => {
    event.preventDefault()
    if (busy || pictureBusy) return
    if (form.name.trim().length < 2) {
      setError('editProfile.nameRequired')
      return
    }
    if (form.interests.length < MIN_INTERESTS) {
      setError('editProfile.interestsRequired')
      return
    }
    // The rules refuse an empty username; saying so here beats a generic
    // "could not save" after a round trip.
    if (!form.username.trim()) {
      setError('editProfile.usernameRequired')
      return
    }
    // The rules count the same way; refusing here saves the round trip and
    // says which limit it is, instead of a "could not save" afterwards.
    if (bioTooLong(form.bio)) {
      setError('editProfile.bioTooLong')
      return
    }
    setError('')
    setBusy(true)
    const describe = (saveError) =>
      saveError?.code === 'permission-denied' ? 'editProfile.refused' : 'editProfile.failed'
    try {
      // One batch: the name lives in both documents and has to move in both
      // at once, and the rest of the profile goes with it rather than in a
      // second write that could land without the first.
      //
      // Offline, the batch is applied locally and queued; the profile screen
      // already shows the new name, so this does not wait on "Saving…" for
      // a server that is not there. A refusal that arrives later is shown
      // as a toast wherever the person is by then.
      const payload = {
        name: form.name.trim(),
        username: form.username.trim(),
        bio: form.bio.trim(),
        preferredTime: form.preferredTime,
        interests: form.interests,
        ...(picture ? { picture } : {}),
      }
      const write = updateDisplayName(user.uid, payload.name, user.anonymous, {
        username: payload.username,
        bio: payload.bio,
        preferredTime: payload.preferredTime,
        interests: payload.interests,
        ...(picture ? { picture } : {}),
      })
      const outcome = await awaitWrite(write, {
        offline,
        onLater: (saveError) =>
          pushCelebration({
            icon: 'alert',
            tone: 'warning',
            title: t('editProfile.toastTitle'),
            body: t(describe(saveError)),
          }),
      })
      if (outcome === QUEUED) {
        // Kept until the server answers: a refusal later brings it back to
        // this screen, a success removes it. `before` is the profile as this
        // form was seeded, so that after a reload a refusal can be told from
        // a change made on another device meanwhile.
        const kept = keepUnsent({
          kind: 'profile',
          key: user.uid,
          payload,
          before: {
            username: user.username,
            bio: user.bio || '',
            preferredTime: user.preferredTime || '',
            interests: user.interests || [],
            ...(picture ? { pictureVersion: user.pictureVersion || null } : {}),
          },
        })
        write.then(
          () => settleUnsent(kept),
          (saveError) => failUnsent(kept, saveError),
        )
        pushCelebration({
          icon: 'check',
          title: t('editProfile.queuedTitle'),
          body: t('editProfile.queuedBody'),
        })
      }
      navigate('/profile')
    } catch (saveError) {
      setError(picture ? 'pictures.saveError' : describe(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content">
      <h2>{t('editProfile.title')}</h2>
      <UnsentDraft row={draft} what={t('editProfile.draftWhat')} onRestore={restore} />
      <form className="form-card" onSubmit={submit}>
        <PicturePicker
          kind="profile"
          value={picture}
          onChange={setPicture}
          onBusyChange={setPictureBusy}
          disabled={busy || locks.picture?.active === true}
        >
          <div className="avatar xl">
            <AvatarContent person={user} showPrivate />
          </div>
        </PicturePicker>
        {locks.picture?.active && <p className="form-error">{t('appeals.fieldLocked')}</p>}
        {user.anonymous && <p className="field-hint">{t('pictures.anonymousHint')}</p>}
        <label>
          {t('editProfile.name')}
          <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} />
        </label>
        {user.anonymous && <small className="field-hint">{t('editProfile.anonymousNote')}</small>}
        <label>
          {t('editProfile.username')}
          <input
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            maxLength={40}
            disabled={locks.username?.active === true}
          />
        </label>
        {locks.username?.active && <small className="field-hint">{t('appeals.fieldLocked')}</small>}
        <label>
          {t('editProfile.bio')}
          <textarea
            rows="5"
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            maxLength={BIO_MAX_CHARS}
            aria-describedby="bio-count"
            disabled={locks.bio?.active === true}
          />
        </label>
        {locks.bio?.active && <small className="field-hint">{t('appeals.fieldLocked')}</small>}
        {/* Counted live, in words, the unit the limit is written in. The
            character ceiling is the textarea's own maxLength, so it can never
            be crossed; the word count can, and turns the counter red. */}
        <small
          id="bio-count"
          className={`field-hint bio-count${bioTooLong(form.bio) ? ' over' : ''}`}
        >
          {t('editProfile.bioCount', { words: countWords(form.bio), max: BIO_MAX_WORDS })}
          {' · '}
          {t('editProfile.bioHint', { chars: BIO_MAX_CHARS })}
        </small>
        <label>
          {t('editProfile.preferredTime')}
          <select value={form.preferredTime} onChange={(e) => set('preferredTime', e.target.value)}>
            <option value="">{t('editProfile.noPreference')}</option>
            {timeBands.map((band) => (
              <option key={band} value={band}>
                {timeBandLabel(band)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="label-like">{t('editProfile.interests')}</span>
          <div className="selection-summary">
            <span className="tiny-chip">
              {t('onboarding.interests.selected', { count: form.interests.length })}
            </span>
            <span className="helper-text">
              {t('editProfile.minimum', { count: MIN_INTERESTS })}
            </span>
          </div>
          <div className="interest-grid small-grid">
            {categories.map((interest) => (
              <button
                type="button"
                key={interest}
                className={`interest-chip ${form.interests.includes(interest) ? 'selected' : ''}`}
                onClick={() => toggle(interest)}
                aria-pressed={form.interests.includes(interest)}
              >
                {categoryLabel(interest)}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {t(error, { count: MIN_INTERESTS, words: BIO_MAX_WORDS, chars: BIO_MAX_CHARS })}
          </p>
        )}
        <button
          className="primary-button wide"
          disabled={busy || pictureBusy || form.interests.length < MIN_INTERESTS}
        >
          {busy ? t('common.saving') : t('editProfile.submit')}
        </button>
      </form>
    </div>
  )
}
