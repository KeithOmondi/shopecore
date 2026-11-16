import { useState } from 'react'

import { Badge, Btn, Field, Notice, PageHead, Panel, SettingRow } from '../components/ui'
import { ApiError, put } from '../lib/api'
import { kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')

// ---- business -------------------------------------------------------------------------------------------------------

interface Profile { name: string; email: string; phone: string; kraPin: string; address: string }

function ProfileForm({ p, onSaved }: { p: Profile; onSaved: () => void }) {
  const { can, toast } = useStore()
  const [f, setF] = useState(p)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof Profile) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors({}) }
  const dirty = JSON.stringify(f) !== JSON.stringify(p)
  const save = async () => {
    const e: Record<string, string> = {}
    if (f.name.trim().length < 2) e.name = 'Enter the registered business name'
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) e.email = 'Enter a valid email address'
    if (f.kraPin && !/^[AP]\d{9}[A-Z]$/i.test(f.kraPin.trim())) e.kraPin = 'A KRA PIN looks like P051234567X'
    setErrors(e)
    if (Object.keys(e).length) return
    try { await put('/v1/admin/business-profile', { ...f, name: f.name.trim(), kraPin: f.kraPin.trim().toUpperCase() }); onSaved(); toast('Business details saved') } catch (err) { setErrors({ form: says(err) }) }
  }
  return (
    <Panel title="Store profile" sub="Shown on invoices and receipts">
      {errors.form && <Notice tone="error" mark="!">{errors.form}</Notice>}
      <div className="form-grid">
        <Field label="Business name" value={f.name} onChange={set('name')} error={errors.name} />
        <Field label="Business email" type="email" value={f.email} onChange={set('email')} error={errors.email} />
        <Field label="Phone" value={f.phone} onChange={set('phone')} />
        <Field label="KRA PIN" value={f.kraPin} onChange={set('kraPin')} error={errors.kraPin} />
      </div>
      <Field label="Address" value={f.address} onChange={set('address')} />
      <div className="sp-row end"><Btn disabled={!dirty} onClick={() => setF(p)}>Discard</Btn><Btn variant="primary" disabled={!can('Settings', 'Edit') || !dirty} onClick={() => void save()}>Save changes</Btn></div>
    </Panel>
  )
}

export function BusinessSettings() {
  const { data, failed, reload } = useGet<Profile>('/v1/admin/business-profile')
  const fin = useGet<{ vatRate: number }>('/v1/admin/finance/settings').data
  return (
    <>
      <PageHead title="Business settings" desc="Store identity and tax details." />
      {!data && <div className="panel-sub">{failed ? 'We couldn’t load the settings.' : 'Loading…'}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(265px,.8fr)', alignItems: 'start' }}>
        {data && <ProfileForm key={JSON.stringify(data)} p={data} onSaved={reload} />}
        <Panel title="Other business rules" sub="These live where they are used">
          <SettingRow title="VAT rate" sub="Finance settings" right={<span className="sp-row"><b>{fin ? `${fin.vatRate}%` : '—'}</b><Btn small onClick={() => navigate('/finance/settings')}>Change</Btn></span>} />
          <SettingRow title="Currency" sub="Prices are in Kenyan shillings" right={<Badge>KES</Badge>} />
          <SettingRow title="Delivery fees" sub="Delivery settings and zones" right={<Btn small onClick={() => navigate('/settings/delivery')}>Open</Btn>} />
        </Panel>
      </div>
    </>
  )
}

// ---- payments -------------------------------------------------------------------------------------------------------

interface Status { integrations: { mpesa: { mode: string; connected: boolean }; payouts: { connected: boolean } } }

export function PaymentSettings() {
  const { data, failed } = useGet<Status>('/v1/admin/system/status')
  const m = data?.integrations.mpesa
  const MODE: Record<string, string> = { off: 'Off. Customers can only pay cash on delivery.', simulator: 'Test mode. Payments are simulated and no real money moves.', sandbox: 'Safaricom sandbox (testing).', production: 'Live. Customers pay with real M-Pesa.' }
  return (
    <>
      <PageHead title="Payment gateway settings" desc="How customers pay. The gateway keys are set on the server, never in this page." />
      {!data && <div className="panel-sub">{failed ? 'We couldn’t load the status.' : 'Loading…'}</div>}
      {m && (
        <div className="sp-two">
          <Panel title="M-Pesa" right={<Badge tone={m.mode === 'production' ? 'green' : m.mode === 'off' ? 'gray' : 'amber'}>{m.mode}</Badge>}>
            <Notice tone={m.mode === 'production' ? 'success' : 'warning'} mark={m.mode === 'production' ? '✓' : '!'}>{MODE[m.mode] ?? m.mode}</Notice>
            <p className="panel-sub" style={{ marginTop: 10 }}>The shortcode, passkey and callback address are part of the server’s configuration. To go live, ask whoever deploys the server to set the production M-Pesa details and restart it.</p>
          </Panel>
          <Panel title="Other methods">
            <SettingRow title="Cash on delivery" sub="Always available. The rider collects the cash." right={<Badge tone="green">On</Badge>} />
            <SettingRow title="Cards" sub="Not offered in the app yet" right={<Badge>Off</Badge>} />
            <SettingRow title="Paying riders" sub={data?.integrations.payouts.connected ? 'Connected' : 'Not connected: pay from the M-Pesa portal and mark payouts paid'} right={<Badge tone={data?.integrations.payouts.connected ? 'green' : 'amber'}>{data?.integrations.payouts.connected ? 'Connected' : 'Manual'}</Badge>} />
          </Panel>
        </div>
      )}
    </>
  )
}

// ---- delivery -------------------------------------------------------------------------------------------------------

export function DeliverySettings() {
  const { can, toast } = useStore()
  const { data, failed, reload } = useGet<{ items: { id: string }[]; settings: { baseFeeCents: number; minBasketCents: number } }>('/v1/admin/zones')
  const [f, setF] = useState<{ base: string; min: string } | null>(null)
  const [err, setErr] = useState('')
  const s = data?.settings
  const cur = f ?? (s ? { base: String(s.baseFeeCents / 100), min: String(s.minBasketCents / 100) } : { base: '', min: '' })
  const save = async () => {
    if (!(Number(cur.base) >= 0) || !(Number(cur.min) >= 0)) return setErr('Enter amounts in whole shillings')
    try { await put('/v1/admin/delivery-settings', { baseFeeCents: Math.round(Number(cur.base) * 100), minBasketCents: Math.round(Number(cur.min) * 100) }); setF(null); reload(); toast('Delivery settings saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <PageHead title="Delivery settings" desc="The fee for places outside every delivery zone, and the smallest order you will deliver." actions={<Btn onClick={() => navigate('/zones')}>Delivery zones</Btn>} />
      {!s && <div className="panel-sub">{failed ? 'We couldn’t load the settings.' : 'Loading…'}</div>}
      {s && (
        <div className="sp-two">
          <Panel title="Fees and minimums">
            <div className="sp-form2"><Field label="Fee outside every zone (KES)" value={cur.base} onChange={(v) => { setF({ ...cur, base: v }); setErr('') }} /><Field label="Smallest basket (KES)" value={cur.min} onChange={(v) => { setF({ ...cur, min: v }); setErr('') }} error={err} /></div>
            <div className="sp-row end"><Btn variant="primary" disabled={!can('Settings', 'Edit') || !f} onClick={() => void save()}>Save changes</Btn></div>
          </Panel>
          <Panel title="Today"><SettingRow title="Zones" right={<b>{data?.items.length ?? 0}</b>} /><SettingRow title="Outside-zone fee" right={<b>{kes(s.baseFeeCents / 100)}</b>} /><SettingRow title="Smallest basket" right={<b>{kes(s.minBasketCents / 100)}</b>} /></Panel>
        </div>
      )}
      <RiderProgramme />
      <ShopperRewards />
    </>
  )
}

// ---- rider programme ---------------------------------------------------------------------------------------------------

interface Programme { minWithdrawCents: number; withdrawFeeCents: number; referralRewardCents: number; referralGoal: number; cashInstructions: string }

/** Withdrawals, the referral bonus and where riders hand in cash: what the rider app shows. */
type RewardsData = { earnPerHundredKes: number; pointValueCents: number; minRedeemPoints: number; referralPoints: number; couponDays: number }

/** How shoppers earn and spend points, and what a friend's invite is worth. */
function ShopperRewards() {
  const { can, toast } = useStore()
  const { data, failed, reload } = useGet<RewardsData>('/v1/admin/rewards-programme')
  const [f, setF] = useState<{ earn: string; value: string; min: string; ref: string; days: string } | null>(null)
  const [err, setErr] = useState('')
  const cur = f ?? (data ? { earn: String(data.earnPerHundredKes), value: String(data.pointValueCents / 100), min: String(data.minRedeemPoints), ref: String(data.referralPoints), days: String(data.couponDays) } : null)
  if (!cur) return <div style={{ marginTop: 14 }}><Panel title="Shopper rewards"><div className="panel-sub">{failed ? 'We couldn’t load the rewards settings.' : 'Loading…'}</div></Panel></div>
  const set = (k: keyof typeof cur, v: string) => { setF({ ...cur, [k]: v }); setErr('') }
  const save = async () => {
    if (!(Number(cur.earn) >= 0) || !(Number(cur.value) > 0) || !(Number(cur.min) >= 1) || !(Number(cur.ref) >= 0) || !(Number(cur.days) >= 1)) return setErr('Check the numbers: values must be positive, and a code needs at least 1 day')
    try {
      await put('/v1/admin/rewards-programme', { earnPerHundredKes: Number(cur.earn), pointValueCents: Math.round(Number(cur.value) * 100), minRedeemPoints: Math.round(Number(cur.min)), referralPoints: Math.round(Number(cur.ref)), couponDays: Math.round(Number(cur.days)) })
      setF(null); reload(); toast('Shopper rewards saved')
    } catch (e) { setErr(says(e)) }
  }
  return (
    <div style={{ marginTop: 14 }}>
      <Panel title="Shopper rewards" sub="Points shoppers earn on delivered orders, what they are worth, and the invite-a-friend bonus">
        <div className="sp-form2">
          <Field label="Points per KES 100 spent" value={cur.earn} onChange={(v) => set('earn', v)} />
          <Field label="Value of one point (KES)" value={cur.value} onChange={(v) => set('value', v)} />
          <Field label="Fewest points to redeem" value={cur.min} onChange={(v) => set('min', v)} />
          <Field label="Points for each side of an invite" value={cur.ref} onChange={(v) => set('ref', v)} />
          <Field label="Days a redeemed code lasts" value={cur.days} onChange={(v) => set('days', v)} error={err} />
        </div>
        <div className="sp-row end"><Btn variant="primary" disabled={!can('Settings', 'Edit') || !f} onClick={() => void save()}>Save changes</Btn></div>
      </Panel>
    </div>
  )
}

function RiderProgramme() {
  const { can, toast } = useStore()
  const { data, failed, reload } = useGet<Programme>('/v1/admin/rider-programme')
  const [f, setF] = useState<{ min: string; fee: string; reward: string; goal: string; cash: string } | null>(null)
  const [err, setErr] = useState('')
  const cur = f ?? (data ? { min: String(data.minWithdrawCents / 100), fee: String(data.withdrawFeeCents / 100), reward: String(data.referralRewardCents / 100), goal: String(data.referralGoal), cash: data.cashInstructions } : null)
  if (!cur) return <Panel title="Rider programme"><div className="panel-sub">{failed ? 'We couldn’t load the rider settings.' : 'Loading…'}</div></Panel>
  const set = (k: keyof typeof cur, v: string) => { setF({ ...cur, [k]: v }); setErr('') }
  const save = async () => {
    const nums = [cur.min, cur.fee, cur.reward]
    if (nums.some((n) => !(Number(n) >= 0)) || !(Number(cur.goal) >= 1)) return setErr('Enter amounts in whole shillings and a goal of at least 1 delivery')
    try {
      await put('/v1/admin/rider-programme', { minWithdrawCents: Math.round(Number(cur.min) * 100), withdrawFeeCents: Math.round(Number(cur.fee) * 100), referralRewardCents: Math.round(Number(cur.reward) * 100), referralGoal: Math.round(Number(cur.goal)), cashInstructions: cur.cash.trim() })
      setF(null); reload(); toast('Rider programme saved')
    } catch (e) { setErr(says(e)) }
  }
  return (
    <div style={{ marginTop: 14 }}>
      <Panel title="Rider programme" sub="What riders see in their app: withdrawals, the referral bonus and where to hand in cash">
        <div className="sp-form2">
          <Field label="Smallest withdrawal (KES)" value={cur.min} onChange={(v) => set('min', v)} />
          <Field label="Withdrawal fee (KES)" value={cur.fee} onChange={(v) => set('fee', v)} />
          <Field label="Referral bonus (KES)" value={cur.reward} onChange={(v) => set('reward', v)} />
          <Field label="Deliveries the new rider must reach" value={cur.goal} onChange={(v) => set('goal', v)} />
        </div>
        <Field label="How riders hand in cash" value={cur.cash} onChange={(v) => set('cash', v)} error={err} />
        <div className="sp-row end"><Btn variant="primary" disabled={!can('Settings', 'Edit') || !f} onClick={() => void save()}>Save changes</Btn></div>
      </Panel>
    </div>
  )
}
