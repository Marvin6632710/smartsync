import React, { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { authErrorMessage, resetPassword } from '../firebase/auth'
import { useAuth } from '../context/AuthContext'

export default function SignInPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await signIn({ email, password })
      navigate('/home', { replace: true })
    } catch (submitError) {
      setError(authErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then tap reset.')
      return
    }
    setError('')
    try {
      await resetPassword(email)
      // Deliberately does not confirm whether the address has an account —
      // that would let anyone check who is registered here.
      setNotice('If that email has an account, a reset link is on its way.')
    } catch (resetError) {
      setError(authErrorMessage(resetError))
    }
  }

  return (
    <div className="standalone-page auth-page">
      <div className="brand-orb">
        <Sparkles size={34} />
      </div>
      <div className="entry-copy">
        <span className="eyebrow">SmartSync</span>
        <h1>Welcome back</h1>
        <p>Sign in to see what is happening near you.</p>
      </div>

      <form className="form-card auth-card" onSubmit={submit}>
        <label htmlFor="signin-email">Email</label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="signin-password">Password</label>
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
            {error}
          </p>
        )}
        {notice && <p className="form-notice">{notice}</p>}

        <button className="primary-button wide" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} />
        </button>
        <button className="text-button" type="button" onClick={forgot}>
          Forgot password?
        </button>
      </form>

      <p className="auth-switch">
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </div>
  )
}
