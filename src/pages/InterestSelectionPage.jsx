import React, { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import CelebrationToast from '../components/CelebrationToast'
import SignOutLink from '../components/SignOutLink'
import { categories, MIN_INTERESTS, timeBands } from '../data/categories'
import { useAuth } from '../context/AuthContext'
import { updatePublicProfile } from '../firebase/users'
import { useSaveProfile } from '../hooks/useSaveProfile'
import { categoryLabel, timeBandLabel } from '../i18n'

export default function InterestSelectionPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selected, setSelected] = useState(user.interests || [])
  const [preferredTime, setPreferredTime] = useState(user.preferredTime || '')
  const [busy, setBusy] = useState(false)
  const { save } = useSaveProfile()

  const toggle = (interest) =>
    setSelected((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    )

  const submit = async () => {
    setBusy(true)
    const ok = await save(
      () => updatePublicProfile(user.uid, { interests: selected, preferredTime }),
      { failure: t('onboarding.interests.saveFailed') },
    )
    setBusy(false)
    // Only move on if it saved. Advancing regardless would drop the answers
    // silently and leave AI Picks with nothing to rank on.
    if (ok) navigate(user.onboarded ? '/profile' : '/permissions', { replace: true })
  }

  return (
    <div className="standalone-page onboarding-page">
      {/* Outside the shell, so the shell's toast cannot reach here — and a
          refused save used to be a button that simply did not advance. */}
      <CelebrationToast />
      <div className="onboarding-header luxe-header">
        <span className="eyebrow">{t('onboarding.interests.eyebrow')}</span>
        <h1>{t('onboarding.interests.title')}</h1>
        <p>{t('onboarding.interests.lead', { count: MIN_INTERESTS })}</p>
      </div>

      <div className="selection-summary">
        <span className="tiny-chip">
          {t('onboarding.interests.selected', { count: selected.length })}
        </span>
        <span className="helper-text">{t('onboarding.interests.usedForMatching')}</span>
      </div>
      <div className="interest-grid">
        {categories.map((interest) => (
          <button
            key={interest}
            className={`interest-chip ${selected.includes(interest) ? 'selected' : ''}`}
            onClick={() => toggle(interest)}
            aria-pressed={selected.includes(interest)}
          >
            {categoryLabel(interest)}
          </button>
        ))}
      </div>

      {/* Preferred time is 15% of every match score, so it is asked for during
          setup rather than left empty until someone finds the profile editor. */}
      <div className="selection-summary">
        <span className="label-like">{t('onboarding.interests.whenFree')}</span>
      </div>
      <div className="chip-row">
        {timeBands.map((band) => (
          <button
            key={band}
            className={`interest-chip ${preferredTime === band ? 'selected' : ''}`}
            onClick={() => setPreferredTime(preferredTime === band ? '' : band)}
            aria-pressed={preferredTime === band}
          >
            {timeBandLabel(band)}
          </button>
        ))}
      </div>

      <button
        className="primary-button wide"
        disabled={selected.length < MIN_INTERESTS || busy}
        onClick={submit}
      >
        {busy ? t('common.saving') : t('common.continue')} <ArrowRight size={17} />
      </button>

      <SignOutLink />
    </div>
  )
}
