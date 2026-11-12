import { useState } from 'react'

import { AvatarTile, Badge, Btn, Field, Notice, PageHead, Panel, SettingRow, Toggle } from '../components/ui'
import { DEMO_PASSWORD, useStore } from '../lib/store'

const SESSIONS = [
  { id: 'now', device: 'This browser', where: 'Nairobi, Kenya', when: 'Active now', current: true },
  { id: 's2', device: 'Chrome on Android', where: 'Nairobi, Kenya', when: 'Yesterday, 6:40 PM', current: false },
  { id: 's3', device: 'Safari on iPad', where: 'Mombasa, Kenya', when: '20 Oct, 9:15 AM', current: false },
]

/** The signed-in person's own profile, password, sessions and alerts. */
export default function Account() {
  const { user, updateStaff, toast, log, logout, openModal, passwords, setPassword } = useStore()
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})
  const [prefs, setPrefs] = useState({ orders: true, payments: true, riders: false, twoFactor: false })
  const [sessions, setSessions] = useState(SESSIONS)

  if (!user) return null

  const saveProfile = () => {
    const e: Record<string, string> = {}
    if (name.trim().split(/\s+/).length < 2) e.name = 'Enter your first and last name'
    if (phone.trim() && !/^\+?[\d\s]{9,16}$/.test(phone.trim())) e.phone = 'Enter a valid phone number'
    setErrors(e)
    if (Object.keys(e).length) return
    updateStaff(user.id, { name: name.trim(), phone: phone.trim() })
    log('Updated own profile', 'Staff')
    toast('Profile saved')
  }

  const changePassword = () => {
    const e: Record<string, string> = {}
    const current = passwords[user.email] ?? DEMO_PASSWORD
    if (pw.current !== current) e.current = 'That isn’t your current password'
    if (pw.next.length < 10) e.next = 'Use at least 10 characters'
    else if (!/[A-Z]/.test(pw.next) || !/\d/.test(pw.next)) e.next = 'Include a capital letter and a number'
    else if (pw.next === pw.current) e.next = 'Choose a password you haven’t used'
    if (pw.confirm !== pw.next) e.confirm = 'The passwords don’t match'
    setPwErrors(e)
    if (Object.keys(e).length) return
    setPassword(user.email, pw.next)
    log('Changed own password', 'Staff', 'Security')
    setPw({ current: '', next: '', confirm: '' })
    toast('Password changed')
  }

  return (
    <>
      <PageHead title="My account" desc="Your profile, password, sessions and alerts." actions={<Btn variant="danger" onClick={() => { logout(); toast('Signed out') }}>Sign out</Btn>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(280px,.9fr)', alignItems: 'start' }}>
        <div className="grid">
          <section className="card form-card">
            <div className="product-cell" style={{ marginBottom: 14 }}>
              <AvatarTile text={user.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()} size={42} />
              <div><h2 style={{ margin: 0 }}>{user.name}</h2><div className="panel-sub">{user.email} · <Badge tone="blue">{user.role}</Badge></div></div>
            </div>
            <div className="form-grid">
              <Field label="Full name" value={name} onChange={setName} error={errors.name} />
              <Field label="Phone number" value={phone} onChange={setPhone} error={errors.phone} />
            </div>
            <Notice>Your work email and role are managed by a workspace owner.</Notice>
            <div className="form-actions"><Btn variant="primary" onClick={saveProfile}>Save profile</Btn></div>
          </section>

          <section className="card form-card">
            <h2>Change password</h2>
            <Field label="Current password" type="password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} error={pwErrors.current} />
            <div className="form-grid">
              <Field label="New password" type="password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} error={pwErrors.next} hint="10+ characters with a capital letter and a number." />
              <Field label="Confirm new password" type="password" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} error={pwErrors.confirm} />
            </div>
            <div className="form-actions"><Btn variant="primary" onClick={changePassword}>Update password</Btn></div>
          </section>
        </div>

        <div className="grid">
          <Panel title="Security">
            <SettingRow title="Two-step verification" sub="Ask for a code when signing in on a new device" right={<Toggle on={prefs.twoFactor} onChange={(v) => { setPrefs({ ...prefs, twoFactor: v }); toast(v ? 'Two-step verification on' : 'Two-step verification off') }} label="Toggle two-step verification" />} />
          </Panel>
          <Panel title="Email alerts" sub="What lands in your inbox">
            <SettingRow title="New and stuck orders" right={<Toggle on={prefs.orders} onChange={(v) => setPrefs({ ...prefs, orders: v })} label="Toggle order alerts" />} />
            <SettingRow title="Failed payments and payouts" right={<Toggle on={prefs.payments} onChange={(v) => setPrefs({ ...prefs, payments: v })} label="Toggle payment alerts" />} />
            <SettingRow title="Rider applications" right={<Toggle on={prefs.riders} onChange={(v) => setPrefs({ ...prefs, riders: v })} label="Toggle rider alerts" />} />
          </Panel>
          <Panel title="Active sessions" sub="Where you’re signed in">
            {sessions.map((s) => (
              <SettingRow key={s.id} title={s.device} sub={`${s.where} · ${s.when}`} right={s.current ? <Badge tone="green">This device</Badge> : <Btn small onClick={() => { setSessions(sessions.filter((x) => x.id !== s.id)); toast('Session signed out') }}>Sign out</Btn>} />
            ))}
            {sessions.length > 1 && <Btn small onClick={() => openModal({ title: 'Sign out of other devices?', message: 'You’ll need to sign in again on each of them.', confirm: 'Sign out others', onConfirm: () => { setSessions(sessions.filter((s) => s.current)); toast('Other sessions signed out') } })}>Sign out of all other devices</Btn>}
          </Panel>
        </div>
      </div>
    </>
  )
}
