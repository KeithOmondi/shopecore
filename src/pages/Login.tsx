import { useState, type FormEvent } from 'react'

import { Notice, isEmail } from '../components/ui'
import { DEMO_PASSWORD, useStore } from '../lib/store'

/**
 * One sign-in for everyone who works in the admin, owners and staff alike. People don't create their own
 * accounts or reset their own passwords: IT support or an owner does that for them.
 */
export default function Login() {
  const { login, toast, staff } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!isEmail(email)) return setError('Enter your work email address.')
    if (!password) return setError('Enter your password.')
    setBusy(true)
    setError('')
    setTimeout(() => {
      const err = login(email, password)
      setBusy(false)
      if (err) setError(err)
      else toast('Welcome back')
    }, 500)
  }

  return (
    <div className="login-page">
      <main className="login-card card" aria-labelledby="login-title">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <span className="brand-mark" aria-hidden="true">S</span>
          <span className="brand-name">ShopCore Admin</span>
        </div>
        <form onSubmit={submit} noValidate>
          <h1 id="login-title">Sign in</h1>
          <p className="login-sub">For ShopCore staff and administrators.</p>
          {error && <div style={{ marginBottom: 12 }}><Notice tone="error" mark="!">{error}</Notice></div>}
          <div className="field">
            <label htmlFor="login-email">Work email</label>
            <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@shopcore.co" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
              <button type="button" className="link-btn" style={{ position: 'absolute', right: 10, top: 9 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button type="button" className="link-btn" aria-expanded={help} onClick={() => setHelp((h) => !h)}>Forgot your password?</button>
          </div>
          {help && (
            <div style={{ marginBottom: 14 }}>
              <Notice>Passwords are reset by the IT team, not from this page. Contact IT support and they will give you a temporary password to change when you sign in. The same goes for a new account.</Notice>
            </div>
          )}
          <button className="btn primary" type="submit" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div style={{ marginTop: 18 }}>
            <Notice>
              Demo: sign in as <b>{staff[0]?.email}</b> with password <b>{DEMO_PASSWORD}</b>. Other staff emails (for example <b>faith@shopcore.co</b> or <b>brian@shopcore.co</b> for IT support) open the admin with their own role. <b>david@shopcore.co</b> has a temporary password and must choose a new one.
            </Notice>
          </div>
        </form>
      </main>
    </div>
  )
}
