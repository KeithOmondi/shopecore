import { useState, type FormEvent } from 'react'

import { Field, Notice } from '../components/ui'
import { useStore } from '../lib/store'

/** Shown after signing in with a temporary password (a new account, or a reset by IT). */
export default function FirstSignIn() {
  const { user, passwords, completeFirstSignIn, logout, toast } = useStore()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (next.length < 10) errs.next = 'Use at least 10 characters'
    else if (!/[A-Z]/.test(next) || !/[a-z]/.test(next) || !/\d/.test(next)) errs.next = 'Include a capital letter, a lowercase letter and a number'
    else if (next === (passwords[user?.email ?? ''] ?? '')) errs.next = 'Choose a password that is different from the temporary one'
    if (confirm !== next) errs.confirm = 'The passwords don’t match'
    setErrors(errs)
    if (Object.keys(errs).length) return
    completeFirstSignIn(next)
    toast('Password set. Welcome to ShopCore Admin.')
  }

  return (
    <div className="login-page">
      <main className="login-card card" aria-labelledby="first-title">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <span className="brand-mark" aria-hidden="true">S</span>
          <span className="brand-name">ShopCore Admin</span>
        </div>
        <form onSubmit={submit} noValidate>
          <h1 id="first-title">Choose your password</h1>
          <p className="login-sub">{`Hi ${user?.name.split(' ')[0]}. You signed in with a temporary password, so pick your own before you continue.`}</p>
          <Field label="New password" type="password" value={next} onChange={setNext} error={errors.next} hint="10+ characters with a capital letter, a lowercase letter and a number." />
          <Field label="Confirm new password" type="password" value={confirm} onChange={setConfirm} error={errors.confirm} />
          <button className="btn primary" type="submit" style={{ width: '100%', marginTop: 4 }}>Save password and continue</button>
          <div style={{ textAlign: 'center', marginTop: 14 }}><button type="button" className="link-btn" onClick={logout}>Sign out</button></div>
          <div style={{ marginTop: 14 }}><Notice>If you didn’t expect this, sign out and tell IT support.</Notice></div>
        </form>
      </main>
    </div>
  )
}
