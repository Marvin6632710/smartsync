import React, { useState } from 'react'
import { ArrowRight, CalendarDays, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import BrandMark from '../components/BrandMark'
import TooYoungScreen from '../components/TooYoungScreen'
import { useAuth } from '../context/AuthContext'
import { saveDateOfBirth } from '../firebase/users'
import {
  ageOn,
  earliestEligibleDob,
  isValidDob,
  latestEligibleDob,
  meetsMinimumAge,
  MIN_AGE,
} from '../utils/age'

/**
 * The date of birth, asked of an account that has none.
 *
 * Every account made from the sign-up form carries one. This screen is
 * for the ones made before the gate existed — and for any path that
 * created a profile without asking — because a minimum that only applies
 * to accounts made after a certain Tuesday is not a minimum.
 *
 * It offers no way past itself. There is no skip, no "later", and the
 * router puts it above every other route for an account in this state
 * (App.jsx), so the answer cannot be avoided by typing a different URL.
 *
 * Signing out is the one other thing on the screen, deliberately. The
 * alternative — a screen with a single field and no exit — is a trap,
 * and somebody who does not want to say should be able to leave rather
 * than be held here.
 */
export default function AgeCheckPage() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (!isValidDob(dateOfBirth)) {
      setError('age.invalidDate')
      return
    }
    // Too young is answered here rather than by trying to save it. The
    // rules refuse a date of birth under the minimum, so sending one
    // would come back as a failed write and be shown as "that could not
    // be saved" — the wrong answer to the right question, and the one
    // thing this screen must never be vague about.
    if (!meetsMinimumAge(dateOfBirth)) {
      setError('')
      setRefused(true)
      return
    }
    setError('')
    setBusy(true)
    try {
      await saveDateOfBirth(user.uid, dateOfBirth, false)
    } catch {
      setError('age.saveFailed')
    } finally {
      setBusy(false)
    }
  }

  // Nothing was written and nothing was told to anybody; this is the
  // same screen an account already below the minimum gets from App.jsx,
  // so the answer looks the same however somebody arrives at it.
  if (refused) return <TooYoungScreen age={ageOn(dateOfBirth)} />

  return (
    <div className="standalone-page auth-page">
      <div className="brand-orb">
        <BrandMark tile size={72} className="orb-mark" />
      </div>
      <div className="entry-copy">
        <span className="eyebrow">{t('age.eyebrow')}</span>
        <h1>{t('age.title')}</h1>
        <p>{t('age.lead', { count: MIN_AGE })}</p>
      </div>

      <form className="form-card auth-card" onSubmit={submit} noValidate>
        <label htmlFor="age-dob">{t('auth.dateOfBirth')}</label>
        <input
          id="age-dob"
          type="date"
          autoComplete="bday"
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
          min={earliestEligibleDob()}
          max={latestEligibleDob()}
          required
        />
        <small className="field-hint">
          <CalendarDays size={14} aria-hidden="true" /> {t('age.privateHint')}
        </small>

        {/* Said before they answer, not after. Somebody who is fourteen
            should know what happens next before typing it, rather than
            finding out by being locked out. */}
        {dateOfBirth && isValidDob(dateOfBirth) && !meetsMinimumAge(dateOfBirth) && (
          <p className="form-error" role="status">
            <ShieldAlert size={15} aria-hidden="true" />{' '}
            {t('age.willBeTooYoung', { count: MIN_AGE })}
          </p>
        )}

        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}

        <button className="primary-button wide" type="submit" disabled={busy}>
          {busy ? t('age.saving') : t('age.submit')} <ArrowRight size={17} />
        </button>
      </form>

      <button className="text-button" type="button" onClick={signOut}>
        {t('age.signOutInstead')}
      </button>
    </div>
  )
}
