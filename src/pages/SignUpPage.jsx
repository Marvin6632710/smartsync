import React, { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LanguageMenu from '../components/LanguageMenu'
import { authErrorKey } from '../firebase/auth'
import { MAX_NAME_LENGTH } from '../firebase/users'
import { useAuth } from '../context/AuthContext'

const MIN_PASSWORD = 6

export default function SignUpPage() {
  const { t } = useTranslation()
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    // Checked here as well as by Firebase so the message arrives before a
    // round trip, and reads like a hint rather than a rejection.
    if (name.trim().length < 2) {
      setError('auth.signUp.nameRequired')
      return
    }
    if (!email.trim()) {
      setError('auth.errors.enterEmail')
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError('auth.signUp.passwordShort')
      return
    }
    setError('')
    setBusy(true)
    try {
      await signUp({ email, password, name })
      // New accounts go through interest selection — the recommendation
      // engine has nothing to work with until then.
      navigate('/interests', { replace: true })
    } catch (submitError) {
      setError(authErrorKey(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="standalone-page auth-page">
      <div className="entry-language">
        <LanguageMenu />
      </div>
      <div className="brand-orb">
        <Sparkles size={34} />
      </div>
      <div className="entry-copy">
        <span className="eyebrow">{t('common.appName')}</span>
        <h1>{t('auth.signUp.title')}</h1>
        <p>{t('auth.signUp.lead')}</p>
      </div>

      <form className="form-card auth-card" onSubmit={submit} noValidate>
        <label htmlFor="signup-name">{t('auth.name')}</label>
        <input
          id="signup-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          required
        />

        <label htmlFor="signup-email">{t('auth.email')}</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="signup-password">{t('auth.password')}</label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <small className="field-hint">
          {t('auth.signUp.passwordHint', { count: MIN_PASSWORD })}
        </small>

        {error && (
          <p className="form-error" role="alert">
            {t(error, { count: MIN_PASSWORD })}
          </p>
        )}

        <button className="primary-button wide" type="submit" disabled={busy}>
          {busy ? t('auth.signUp.busy') : t('auth.signUp.submit')} <ArrowRight size={17} />
        </button>
      </form>

      <p className="auth-switch">
        {t('auth.signUp.haveAccount')} <Link to="/signin">{t('auth.signUp.signInLink')}</Link>
      </p>

      {/* Reachable directly from a link, so the one screen that explains
          what this is has to be reachable back from here. */}
      <button className="text-button" type="button" onClick={() => navigate('/')}>
        {t('auth.whatIs')}
      </button>
    </div>
  )
}
