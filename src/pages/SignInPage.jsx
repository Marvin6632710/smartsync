import React, { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import LanguageMenu from '../components/LanguageMenu'
import { authErrorKey, resetPassword } from '../firebase/auth'
import { useAuth } from '../context/AuthContext'

export default function SignInPage() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setNotice('')
    // The form asks for these itself rather than through the browser's
    // `required` bubble, which speaks the browser's language, not the app's.
    if (!email.trim()) {
      setError('auth.errors.enterEmail')
      return
    }
    if (!password) {
      setError('auth.errors.enterPassword')
      return
    }
    setError('')
    setBusy(true)
    try {
      await signIn({ email, password })
      navigate('/home', { replace: true })
    } catch (submitError) {
      setError(authErrorKey(submitError))
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (!email.trim()) {
      setError('auth.signIn.enterEmailFirst')
      return
    }
    setError('')
    try {
      await resetPassword(email)
      // Deliberately does not confirm whether the address has an account —
      // that would let anyone check who is registered here.
      setNotice('auth.signIn.resetSent')
    } catch (resetError) {
      setError(authErrorKey(resetError))
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
        <h1>{t('auth.signIn.title')}</h1>
        <p>{t('auth.signIn.lead')}</p>
      </div>

      <form className="form-card auth-card" onSubmit={submit} noValidate>
        <label htmlFor="signin-email">{t('auth.email')}</label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="signin-password">{t('auth.password')}</label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        {notice && <p className="form-notice">{t(notice)}</p>}

        <button className="primary-button wide" type="submit" disabled={busy}>
          {busy ? t('auth.signIn.busy') : t('auth.signIn.submit')} <ArrowRight size={17} />
        </button>
        <button className="text-button" type="button" onClick={forgot}>
          {t('auth.signIn.forgot')}
        </button>
      </form>

      <p className="auth-switch">
        {t('auth.signIn.newHere')} <Link to="/signup">{t('auth.signIn.createLink')}</Link>
      </p>

      {/* Reachable directly from a link, so the one screen that explains
          what this is has to be reachable back from here. */}
      <button className="text-button" type="button" onClick={() => navigate('/')}>
        {t('auth.whatIs')}
      </button>
    </div>
  )
}
