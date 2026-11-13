import { useState } from 'react'

import { AvatarTile, Badge, Btn, Field, Notice, PageHead, Panel, SettingRow, Toggle } from '../components/ui'
import { useStore } from '../lib/store'

/** The signed-in person's own profile, password, sessions and alerts. */
export default function Account() {
  const { user, updateStaff, toast, logout, changeOwnPassword } = useStore()
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})
  const [prefs, setPrefs] = useState({ orders: true, payments: true, riders: false, twoFactor: false })
  const [busy, setBusy] = useState(false)

  if (!user) return null

  const saveProfile = async () => {
    const e: Record<string, string> = {}
    if (name.trim().split(/\s+/).length < 2) e.name = 'Enter your first and last name'
    if (phone.trim() && !/^\+?[\d\s]{9,16}$/.test(phone.trim())) e.phone = 'Enter a valid phone number'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    const err = await updateStaff(user.id, { name: name.trim(), phone: phone.trim() })
    setBusy(false)
    if (err) return setErrors({ name: err })
    toast('Profile saved')
  }

  const changePassword = async () => {
    const e: Record<string, string> = {}
    if (!pw.current) e.current = 'Enter your current password'
    if (pw.next.length < 10) e.next = 'Use at least 10 characters'
    else if (!/[A-Z]/.test(pw.next) || !/\d/.test(pw.next)) e.next = 'Include a capital letter and a number'
    else if (pw.next === pw.current) e.next = 'Choose a password you haven’t used'
    if (pw.confirm !== pw.next) e.confirm = 'The passwords don’t match'
    setPwErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    const err = await changeOwnPassword(pw.current, pw.next)
    setBusy(false)
    if (err) return setPwErrors({ current: err })
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
            <div className="form-actions"><Btn variant="primary" disabled={busy} onClick={saveProfile}>Save profile</Btn></div>
          </section>

          <section className="card form-card">
            <h2>Change password</h2>
            <Field label="Current password" type="password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} error={pwErrors.current} />
            <div className="form-grid">
              <Field label="New password" type="password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} error={pwErrors.next} hint="10+ characters with a capital letter and a number." />
              <Field label="Confirm new password" type="password" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} error={pwErrors.confirm} />
            </div>
            <div className="form-actions"><Btn variant="primary" disabled={busy} onClick={changePassword}>Update password</Btn></div>
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
            <SettingRow title="This browser" sub="Signed in now" right={<Badge tone="green">This device</Badge>} />
            <Notice>Changing your password signs you out everywhere else. IT support can also end a person’s sessions.</Notice>
          </Panel>
        </div>
      </div>
    </>
  )
}
