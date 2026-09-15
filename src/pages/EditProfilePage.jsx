import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { categories, MIN_INTERESTS, timeBands } from '../data/categories'
import UnsentDraft from '../components/UnsentDraft'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { updateDisplayName } from '../firebase/users'
import { awaitWrite, QUEUED } from '../utils/writes'

export default function EditProfilePage() {
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

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  // A profile saved offline that the server refused once the connection
  // came back — offered back here rather than lost with the toast.
  const draft = unsent.filter((row) => row.kind === 'profile' && row.status === 'failed').at(-1)
  const restore = (payload) => {
    setForm((current) => ({ ...current, ...payload }))
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
    if (form.name.trim().length < 2) {
      setError('Please enter your name.')
      return
    }
    if (form.interests.length < MIN_INTERESTS) {
      setError(`Pick at least ${MIN_INTERESTS} interests.`)
      return
    }
    // The rules refuse an empty username; saying so here beats a generic
    // "could not save" after a round trip.
    if (!form.username.trim()) {
      setError('Please enter a username.')
      return
    }
    setError('')
    setBusy(true)
    const describe = (saveError) =>
      saveError?.code === 'permission-denied'
        ? 'Could not save: the change was refused. Check the username and try again.'
        : 'Could not save. Check your connection and try again.'
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
      }
      const write = updateDisplayName(user.uid, payload.name, user.anonymous, {
        username: payload.username,
        bio: payload.bio,
        preferredTime: payload.preferredTime,
        interests: payload.interests,
      })
      const outcome = await awaitWrite(write, {
        offline,
        onLater: (saveError) =>
          pushCelebration({
            icon: 'alert',
            tone: 'warning',
            title: "Couldn't save your profile",
            body: describe(saveError),
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
          },
        })
        write.then(
          () => settleUnsent(kept),
          (saveError) => failUnsent(kept, saveError),
        )
        pushCelebration({
          icon: 'check',
          title: 'Profile saved — will sync',
          body: 'This will finish when you are back online.',
        })
      }
      navigate('/profile')
    } catch (saveError) {
      setError(describe(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content">
      <h2>Edit profile</h2>
      <UnsentDraft row={draft} what="Your last profile edit" onRestore={restore} />
      <form className="form-card" onSubmit={submit}>
        <label>
          Name
          <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} />
        </label>
        {user.anonymous && (
          <small className="field-hint">
            Anonymous mode is on, so others still see “Anonymous user”.
          </small>
        )}
        <label>
          Username
          <input
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            maxLength={40}
          />
        </label>
        <label>
          Bio
          <textarea
            rows="3"
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            maxLength={300}
          />
        </label>
        <label>
          Preferred time
          <select value={form.preferredTime} onChange={(e) => set('preferredTime', e.target.value)}>
            <option value="">No preference</option>
            {timeBands.map((band) => (
              <option key={band}>{band}</option>
            ))}
          </select>
        </label>
        <div>
          <span className="label-like">Interests</span>
          <div className="selection-summary">
            <span className="tiny-chip">{form.interests.length} selected</span>
            <span className="helper-text">Minimum {MIN_INTERESTS}</span>
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
                {interest}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button wide"
          disabled={busy || form.interests.length < MIN_INTERESTS}
        >
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}
