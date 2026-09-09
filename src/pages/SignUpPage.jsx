import React, { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { authErrorMessage } from '../firebase/auth'
import { useAuth } from '../context/AuthContext'

const MIN_PASSWORD = 6

export default function SignUpPage() {
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
      setError('Please enter your name.')
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`)
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
      setError(authErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="standalone-page auth-page">
      <div className="brand-orb">
        <Sparkles size={34} />
      </div>
      <div className="entry-copy">
        <span className="eyebrow">SmartSync</span>
        <h1>Create your account</h1>
        <p>Join activities near you and meet people by doing.</p>
      </div>

      <form className="form-card auth-card" onSubmit={submit}>
        <label htmlFor="signup-name">Name</label>
        <input
          id="signup-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />

        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <small className="field-hint">At least {MIN_PASSWORD} characters.</small>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button wide" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'} <ArrowRight size={17} />
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/signin">Sign in</Link>
      </p>
    </div>
  )
}
