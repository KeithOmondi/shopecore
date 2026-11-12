import { useState } from 'react'

import { Badge, Btn, Field, Notice, PageHead, Panel, SettingRow, Toggle } from '../components/ui'
import { kes, MINIMUM_BASKET, type Zone } from '../data/seed'
import { useStore } from '../lib/store'

type Errors = Record<string, string>
const num = (v: string) => (/^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN)

function FormShell({ title, children, onSave, onDiscard, dirty }: { title: string; children: React.ReactNode; onSave: () => void; onDiscard: () => void; dirty: boolean }) {
  return (
    <section className="card form-card">
      <h2>{title}</h2>
      {children}
      <div className="form-actions">
        <Btn disabled={!dirty} onClick={onDiscard}>Discard</Btn>
        <Btn variant="primary" onClick={onSave}>Save changes</Btn>
      </div>
    </section>
  )
}

export function BusinessSettings() {
  const { business, setBusiness, toast, log } = useStore()
  const [f, setF] = useState(business)
  const [errors, setErrors] = useState<Errors>({})
  const dirty = JSON.stringify(f) !== JSON.stringify(business)
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const save = () => {
    const e: Errors = {}
    if (f.name.trim().length < 2) e.name = 'Enter the registered business name'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) e.email = 'Enter a valid email address'
    if (!/^[AP]\d{9}[A-Z]$/i.test(f.kra.trim())) e.kra = 'A KRA PIN looks like P051234567X'
    const vat = num(f.vat.replace('%', ''))
    if (!(vat >= 0 && vat <= 100)) e.vat = 'Enter a rate between 0 and 100'
    if (!(num(f.baseFee) >= 0)) e.baseFee = 'Enter the fee in whole shillings'
    setErrors(e)
    if (Object.keys(e).length) return
    const next = { ...f, name: f.name.trim(), kra: f.kra.trim().toUpperCase(), vat: String(vat), baseFee: String(num(f.baseFee)) }
    setBusiness(next)
    setF(next)
    log('Updated business settings', 'Business settings')
    toast('Settings saved successfully')
  }

  return (
    <>
      <PageHead title="Business settings" desc="Store identity, tax rules, currency, and delivery fees." actions={<Btn variant="primary" onClick={save}>Save changes</Btn>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(265px,.8fr)', alignItems: 'start' }}>
        <FormShell title="Store profile" onSave={save} onDiscard={() => { setF(business); setErrors({}) }} dirty={dirty}>
          <div className="form-grid">
            <Field label="Business name" value={f.name} onChange={set('name')} error={errors.name} />
            <Field label="Business email" type="email" value={f.email} onChange={set('email')} error={errors.email} />
            <Field label="KRA PIN" value={f.kra} onChange={set('kra')} error={errors.kra} />
            <Field label="VAT rate (%)" value={f.vat} onChange={set('vat')} error={errors.vat} />
            <Field label="Default currency" value={f.currency} onChange={set('currency')} options={['KES — Kenyan Shilling', 'USD — US Dollar']} />
            <Field label="Base delivery fee (KES)" value={f.baseFee} onChange={set('baseFee')} error={errors.baseFee} />
          </div>
        </FormShell>
        <Panel title="Business configuration" sub="Current live configuration">
          <SettingRow title="Store information" sub="Public business name, registration and contact details" right={<Badge>Connected</Badge>} />
          <SettingRow title="Tax configuration" sub={`VAT registration · ${business.vat}% standard rate`} right={<Badge>Active</Badge>} />
          <SettingRow title="Currency and locale" sub={`${business.currency.slice(0, 3)} · Kenya · Africa/Nairobi`} right={<Badge>Active</Badge>} />
          <SettingRow title="Default delivery fee" sub={`${kes(Number(business.baseFee))} within Nairobi CBD`} right={<Badge>Active</Badge>} />
        </Panel>
      </div>
    </>
  )
}

export function PaymentSettings() {
  const { payments, setPayments, toast, log } = useStore()
  const [f, setF] = useState(payments)
  const [errors, setErrors] = useState<Errors>({})
  const dirty = JSON.stringify(f) !== JSON.stringify(payments)
  const set = (k: 'shortcode' | 'callback' | 'currency' | 'delay') => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const save = () => {
    const e: Errors = {}
    if (!/^\d{5,7}$/.test(f.shortcode.trim())) e.shortcode = 'A shortcode has 5 to 7 digits'
    if (!/^https:\/\/[^\s]+\.[^\s]+$/.test(f.callback.trim())) e.callback = 'The callback must be an https:// URL'
    if (!f.mpesa && !f.card) e.toggles = 'Keep at least one payment method on, or customers can’t check out.'
    setErrors(e)
    if (Object.keys(e).length) return
    setPayments(f)
    log('Updated payment gateway settings', 'Payments', 'Security')
    toast('Settings saved successfully')
  }

  return (
    <>
      <PageHead title="Payment gateway settings" desc="Configure M-Pesa and card processing for customer checkout." actions={<Btn variant="primary" onClick={save}>Save changes</Btn>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(265px,.8fr)', alignItems: 'start' }}>
        <FormShell title="Gateway configuration" onSave={save} onDiscard={() => { setF(payments); setErrors({}) }} dirty={dirty}>
          <div className="form-grid">
            <Field label="M-Pesa shortcode" value={f.shortcode} onChange={set('shortcode')} error={errors.shortcode} />
            <Field label="Callback URL" value={f.callback} onChange={set('callback')} error={errors.callback} />
            <Field label="Settlement currency" value={f.currency} onChange={set('currency')} options={['KES', 'USD']} />
            <Field label="Settlement delay" value={f.delay} onChange={set('delay')} options={['T+1 business day', 'T+2 business days', 'Same day']} />
          </div>
          <SettingRow title="Enable M-Pesa checkout" sub="Allow customers to pay via M-Pesa" right={<Toggle on={f.mpesa} onChange={(v) => setF((s) => ({ ...s, mpesa: v }))} label="Toggle M-Pesa" />} />
          <SettingRow title="Enable card payments" sub="Visa and Mastercard processing" right={<Toggle on={f.card} onChange={(v) => setF((s) => ({ ...s, card: v }))} label="Toggle card payments" />} />
          {errors.toggles && <Notice tone="error" mark="!">{errors.toggles}</Notice>}
        </FormShell>
        <Panel title="Payment methods" sub="Current live configuration">
          <SettingRow title="M-Pesa Daraja" sub={`Till number · ${payments.shortcode} · ${payments.mpesa ? 'Connected' : 'Off'}`} right={<Badge>{payments.mpesa ? 'Connected' : 'Disconnected'}</Badge>} />
          <SettingRow title="Visa and Mastercard" sub={`Card processing · ${payments.card ? 'Connected' : 'Off'}`} right={<Badge>{payments.card ? 'Active' : 'Disconnected'}</Badge>} />
          <SettingRow title="Settlement account" sub="KCB Business · •••• 9082" right={<Badge>Active</Badge>} />
          <SettingRow title="Payment security" sub="3D Secure · Enabled" right={<Badge>Active</Badge>} />
        </Panel>
      </div>
    </>
  )
}

function ZoneForm({ onSave }: { onSave: (z: Omit<Zone, 'id'>) => void }) {
  const { closeModal } = useStore()
  const [name, setName] = useState('')
  const [fee, setFee] = useState('250')
  const [commission, setCommission] = useState('82')
  const [errors, setErrors] = useState<Errors>({})
  const submit = () => {
    const e: Errors = {}
    if (name.trim().length < 2) e.name = 'Name the zone'
    if (!(num(fee) >= 0)) e.fee = 'Enter a fee'
    const c = num(commission)
    if (!(c > 0 && c <= 100)) e.commission = 'Enter a share between 1 and 100'
    setErrors(e)
    if (Object.keys(e).length) return
    onSave({ name: name.trim(), fee: num(fee), commission: c, note: '', active: true, points: [] })
    closeModal()
  }
  return (
    <>
      <Field label="Zone name" value={name} onChange={setName} placeholder="e.g. Nairobi West" error={errors.name} />
      <div className="form-grid">
        <Field label="Customer fee (KES)" value={fee} onChange={setFee} error={errors.fee} />
        <Field label="Rider share (%)" value={commission} onChange={setCommission} error={errors.commission} />
      </div>
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={submit}>Add zone</Btn>
      </div>
    </>
  )
}

export function DeliverySettings() {
  const { zones, setZones, openModal, toast, log } = useStore()
  const [selected, setSelected] = useState(zones[0]!.id)
  const zone = zones.find((z) => z.id === selected) ?? zones[0]!
  const [draft, setDraft] = useState({ name: zone.name, fee: String(zone.fee), commission: String(zone.commission), min: String(MINIMUM_BASKET) })
  const [errors, setErrors] = useState<Errors>({})
  const [minimum, setMinimum] = useState(MINIMUM_BASKET)

  const choose = (z: Zone) => {
    setSelected(z.id)
    setDraft({ name: z.name, fee: String(z.fee), commission: String(z.commission), min: String(minimum) })
    setErrors({})
  }
  const dirty = draft.name !== zone.name || draft.fee !== String(zone.fee) || draft.commission !== String(zone.commission) || draft.min !== String(minimum)

  const save = () => {
    const e: Errors = {}
    if (draft.name.trim().length < 2) e.name = 'Name the zone'
    if (!(num(draft.fee) >= 0)) e.fee = 'Enter the fee in whole shillings'
    const c = num(draft.commission)
    if (!(c > 0 && c <= 100)) e.commission = 'Enter a share between 1 and 100'
    if (!(num(draft.min) >= 0)) e.min = 'Enter an amount'
    setErrors(e)
    if (Object.keys(e).length) return
    setZones(zones.map((z) => (z.id === zone.id ? { ...z, name: draft.name.trim(), fee: num(draft.fee), commission: c } : z)))
    setMinimum(num(draft.min))
    log(`Updated delivery fee rules · ${draft.name.trim()}`, 'Delivery settings')
    toast('Settings saved successfully')
  }

  const addZone = (z: Omit<Zone, 'id'>) => {
    const id = `z${Date.now()}`
    setZones([...zones, { ...z, id }])
    log(`Added delivery zone · ${z.name}`, 'Delivery settings')
    toast(`${z.name} added`)
    setSelected(id)
    setDraft({ name: z.name, fee: String(z.fee), commission: String(z.commission), min: String(minimum) })
  }

  return (
    <>
      <PageHead title="Delivery settings" desc="Manage delivery zones, customer fees, and rider commissions." actions={<Btn variant="primary" onClick={save}>Save changes</Btn>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(265px,.8fr)', alignItems: 'start' }}>
        <FormShell title="Default delivery rules" onSave={save} onDiscard={() => choose(zone)} dirty={dirty}>
          <div className="form-grid">
            <Field label="Zone name" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} error={errors.name} />
            <Field label="Customer delivery fee (KES)" value={draft.fee} onChange={(v) => setDraft((d) => ({ ...d, fee: v }))} error={errors.fee} />
            <Field label="Rider commission (%)" value={draft.commission} onChange={(v) => setDraft((d) => ({ ...d, commission: v }))} error={errors.commission} />
            <Field label="Minimum order for free delivery (KES)" value={draft.min} onChange={(v) => setDraft((d) => ({ ...d, min: v }))} error={errors.min} />
          </div>
        </FormShell>
        <Panel title="Delivery zones" sub="Select a zone to edit it" right={<Btn small onClick={() => openModal({ title: 'Add delivery zone', message: 'Create a new delivery zone and configure its fee.', body: <ZoneForm onSave={addZone} />, noActions: true })}>+ Add zone</Btn>}>
          {zones.map((z) => (
            <button key={z.id} type="button" className="setting-row" onClick={() => choose(z)} style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'inherit', cursor: 'pointer', outline: z.id === zone.id ? '2px solid #BFDBFE' : undefined, borderRadius: 4 }}>
              <span>
                <strong>{z.name}</strong>
                <small>{kes(z.fee)} customer fee · {z.commission}% rider share</small>
              </span>
              <Badge tone={z.id === zone.id ? 'blue' : 'green'}>{z.id === zone.id ? 'Editing' : 'Active'}</Badge>
            </button>
          ))}
          <SettingRow title="Minimum basket" sub={`${kes(minimum)} for free delivery`} right={<Badge>Active</Badge>} />
        </Panel>
      </div>
    </>
  )
}
