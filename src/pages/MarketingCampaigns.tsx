import { useEffect, useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, del, get, patch, post, put } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'
import type { ApiProduct, Category } from './Products'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
const money = (c: number) => kes(shillings(c))
/** `<input type="datetime-local">` wants local time without seconds. */
const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const fromLocal = (v: string) => new Date(v).toISOString()
const inDays = (n: number) => toLocal(new Date(Date.now() + n * 86_400_000).toISOString())

// ---- campaigns ------------------------------------------------------------------------------------------------------

interface Campaign {
  id: string; name: string; type: string; offer: string; audience: string; spendCents: number; startsAt: string; endsAt: string; couponId: string | null; status: 'Scheduled' | 'Active' | 'Ended'; version: number
  channels: { name: string; reach: number; clicks: number; conversions: number; salesCents: number }[]
  totals: { reach: number; clicks: number; conversions: number; salesCents: number; returnOnSpend: number | null }
}

function CampaignForm({ onDone }: { onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ name: '', type: 'Coupon', offer: '', audience: 'All customers', spend: '0', startsAt: inDays(0), endsAt: inDays(14) })
  const [err, setErr] = useState('')
  const go = async () => {
    if (!f.name.trim()) return setErr('Name the campaign')
    try { await post('/v1/admin/campaigns', { name: f.name.trim(), type: f.type, offer: f.offer.trim(), audience: f.audience.trim(), spendCents: Math.round((Number(f.spend) || 0) * 100), startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt) }); onDone(); closeModal(); toast('Campaign created') } catch (e) { setErr(says(e)) }
  }
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  return (
    <>
      <Field label="Name" value={f.name} onChange={set('name')} error={err} />
      <div className="sp-form2"><Field label="Kind" value={f.type} onChange={set('type')} options={['Coupon', 'Push', 'Bundle', 'Banner', 'Flash sale']} /><Field label="Budget spent (KES)" value={f.spend} onChange={set('spend')} /><Field label="Starts" type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /><Field label="Ends" type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></div>
      <Field label="The offer" value={f.offer} onChange={set('offer')} placeholder="e.g. 20% off bags" />
      <Field label="Who it is for" value={f.audience} onChange={set('audience')} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Create</Btn></div>
    </>
  )
}

export function MarketingOverview() {
  const { can, openModal } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Campaign[]; summary: { active: number; salesCents: number; spendCents: number } }>('/v1/admin/campaigns', 60_000)
  const cols: Column<Campaign>[] = [
    { key: 'n', header: 'Campaign', render: (c) => <button className="link-btn" onClick={() => navigate(`/marketing/analytics/${c.id}`)}>{c.name}</button> },
    { key: 't', header: 'Kind', render: (c) => c.type },
    { key: 's', header: 'Status', render: (c) => <Badge tone={c.status === 'Active' ? 'green' : c.status === 'Scheduled' ? 'blue' : 'gray'}>{c.status}</Badge> },
    { key: 'sa', header: 'Sales', sort: (a, b) => a.totals.salesCents - b.totals.salesCents, render: (c) => money(c.totals.salesCents) },
    { key: 'sp', header: 'Spend', render: (c) => money(c.spendCents) },
    { key: 'r', header: 'Return on spend', render: (c) => (c.totals.returnOnSpend === null ? '—' : `${c.totals.returnOnSpend}×`) },
    { key: 'd', header: 'Runs', render: (c) => `${dateTime(Date.parse(c.startsAt)).split(',')[0]} – ${dateTime(Date.parse(c.endsAt)).split(',')[0]}` },
  ]
  return (
    <>
      <PageHead title="Marketing overview" desc="Your offers and what they earned." actions={<><Btn onClick={reload}>Refresh</Btn><Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'New campaign', body: <CampaignForm onDone={reload} />, noActions: true })}>New campaign</Btn></>} />
      <div className="tile-row"><Stat label="Running now" value={String(data?.summary.active ?? '—')} trend="Active campaigns" icon="◎" /><Stat label="Sales from campaigns" value={data ? money(data.summary.salesCents) : '—'} trend="Orders using the offers" icon="↗" /><Stat label="Spent" value={data ? money(data.summary.spendCents) : '—'} trend="Budget entered" icon="−" /></div>
      <DataTable title="Campaigns" rows={data?.items ?? []} rowKey={(c) => c.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the campaigns.' : undefined} onRetry={reload} searchLabel="Search campaigns" searchText={(c) => `${c.name} ${c.type}`} emptyTitle="No campaigns yet" empty="Plan an offer, then track what it earns." actions={(c) => <Btn small onClick={() => navigate(`/marketing/analytics/${c.id}`)}>Results</Btn>} />
    </>
  )
}

function ChannelForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ name: '', reach: '0', clicks: '0', conversions: '0', sales: '0' })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  const go = async () => {
    if (!f.name.trim()) return setErr('Name the channel')
    try { await put(`/v1/admin/campaigns/${id}/channels`, { name: f.name.trim(), reach: Number(f.reach) || 0, clicks: Number(f.clicks) || 0, conversions: Number(f.conversions) || 0, salesCents: Math.round((Number(f.sales) || 0) * 100) }); onDone(); closeModal(); toast('Results saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Field label="Channel (for example Instagram ad)" value={f.name} onChange={set('name')} error={err} />
      <div className="sp-form2"><Field label="People reached" value={f.reach} onChange={set('reach')} /><Field label="Clicks" value={f.clicks} onChange={set('clicks')} /><Field label="Orders" value={f.conversions} onChange={set('conversions')} /><Field label="Sales (KES)" value={f.sales} onChange={set('sales')} /></div>
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Save</Btn></div>
    </>
  )
}

export function CampaignAnalytics({ id }: { id?: string }) {
  const { can, openModal } = useStore()
  const list = useGet<{ items: Campaign[] }>('/v1/admin/campaigns')
  const one = useGet<Campaign>(id ? `/v1/admin/campaigns/${id}` : null)
  if (!id) {
    return (
      <>
        <PageHead title="Campaign analytics" desc="Pick a campaign to see how it did." />
        <Panel title="Campaigns">{list.data?.items.length === 0 && <div className="panel-sub">No campaigns yet.</div>}{list.data?.items.map((c) => <div className="list-row" key={c.id}><span><strong>{c.name}</strong><small>{c.type} · {c.status}</small></span><Btn small onClick={() => navigate(`/marketing/analytics/${c.id}`)}>Results</Btn></div>)}</Panel>
      </>
    )
  }
  const c = one.data
  if (!c) return <PageHead title="Campaign" desc={one.failed ? 'We couldn’t load this campaign.' : 'Loading…'} actions={<Btn onClick={() => navigate('/marketing')}>Back</Btn>} />
  return (
    <>
      <PageHead title={c.name} desc={`${c.type} · ${c.offer || 'No offer written'}`} actions={<><Btn onClick={() => navigate('/marketing')}>Back</Btn><Btn variant="primary" disabled={!can('Marketing', 'Edit')} onClick={() => openModal({ title: 'Add channel results', body: <ChannelForm id={id} onDone={one.reload} />, noActions: true })}>Add results</Btn></>} />
      <div className="tile-row"><Stat label="Sales" value={money(c.totals.salesCents)} trend={`Spent ${money(c.spendCents)}`} icon="↗" /><Stat label="Return on spend" value={c.totals.returnOnSpend === null ? '—' : `${c.totals.returnOnSpend}×`} trend="Sales per shilling spent" icon="=" /><Stat label="Reached" value={c.totals.reach.toLocaleString('en-US')} trend={`${c.totals.clicks.toLocaleString('en-US')} clicks`} icon="◎" /><Stat label="Orders" value={String(c.totals.conversions)} trend="Converted" icon="▣" /></div>
      <Panel title="By channel">{c.channels.length === 0 && <div className="panel-sub">No results yet.</div>}{c.channels.map((ch) => <SettingRow key={ch.name} title={ch.name} sub={`${ch.reach.toLocaleString('en-US')} reached · ${ch.clicks} clicks · ${ch.conversions} orders`} right={<b>{money(ch.salesCents)}</b>} />)}</Panel>
    </>
  )
}

// ---- coupons --------------------------------------------------------------------------------------------------------

interface Coupon { id: string; name: string; code: string; type: 'percent' | 'fixed' | 'free_delivery'; value: number; minSpendCents: number; maxDiscountCents: number; limit: number; perCustomer: number; startsAt: string; endsAt: string; state: 'draft' | 'live' | 'paused'; status: string; categoryIds: string[]; audience: 'all' | 'new' | 'segment'; segmentId: string | null; combine: boolean; note: string; redemptions: number; discountGivenCents: number; version: number }
const couponTone = (s: string) => (s === 'Active' ? 'green' : s === 'Scheduled' ? 'blue' : s === 'Paused' || s === 'Draft' ? 'gray' : 'amber')
const couponValue = (c: Coupon) => (c.type === 'percent' ? `${c.value}% off` : c.type === 'fixed' ? `${money(c.value)} off` : 'Free delivery')

export function CouponsList() {
  const { can, toast } = useStore()
  const [status, setStatus] = useState('')
  const { data, failed, loading, reload } = useGet<{ items: Coupon[]; summary: { active: number; redemptions: number; discountGivenCents: number } }>(`/v1/admin/coupons?limit=200${status ? `&status=${status}` : ''}`, 60_000)
  const flip = async (c: Coupon, state: 'live' | 'paused') => { try { await post('/v1/admin/coupons/state', { ids: [c.id], state }); toast(state === 'live' ? 'Coupon is live' : 'Coupon paused'); reload() } catch (e) { toast(says(e)) } }
  const cols: Column<Coupon>[] = [
    { key: 'c', header: 'Coupon', render: (c) => <div><button className="link-btn" onClick={() => navigate(`/marketing/coupons/${c.id}`)}>{c.name}</button><div className="subtext"><code>{c.code}</code> · {couponValue(c)}</div></div> },
    { key: 's', header: 'Status', render: (c) => <Badge tone={couponTone(c.status)}>{c.status}</Badge> },
    { key: 'u', header: 'Used', sort: (a, b) => a.redemptions - b.redemptions, render: (c) => `${c.redemptions} / ${c.limit}` },
    { key: 'd', header: 'Discount given', render: (c) => money(c.discountGivenCents) },
    { key: 'e', header: 'Runs', render: (c) => `${dateTime(Date.parse(c.startsAt)).split(',')[0]} – ${dateTime(Date.parse(c.endsAt)).split(',')[0]}` },
  ]
  return (
    <>
      <PageHead title="Coupons" desc="Promo codes shoppers type in the cart." actions={<><Btn onClick={reload}>Refresh</Btn><Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => navigate('/marketing/coupons/new')}>New coupon</Btn></>} />
      <div className="tile-row"><Stat label="Active" value={String(data?.summary.active ?? '—')} trend="Can be used now" icon="%" /><Stat label="Times used" value={String(data?.summary.redemptions ?? '—')} trend="All time" icon="▣" /><Stat label="Discount given" value={data ? money(data.summary.discountGivenCents) : '—'} trend="All time" icon="−" /></div>
      <DataTable title="Coupons" rows={data?.items ?? []} rowKey={(c) => c.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the coupons.' : undefined} onRetry={reload} searchLabel="Search coupons" searchText={(c) => `${c.name} ${c.code}`} emptyTitle="No coupons yet" empty="Create a code to offer a discount."
        tools={<select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['Draft', 'Scheduled', 'Active', 'Paused', 'Exhausted', 'Ended'].map((s) => <option key={s}>{s}</option>)}</select>}
        actions={(c) => <div className="sp-row"><Btn small onClick={() => navigate(`/marketing/coupons/${c.id}`)}>Edit</Btn>{c.state === 'live' ? <Btn small disabled={!can('Marketing', 'Edit')} onClick={() => void flip(c, 'paused')}>Pause</Btn> : <Btn small variant="primary" disabled={!can('Marketing', 'Edit')} onClick={() => void flip(c, 'live')}>Go live</Btn>}</div>} />
    </>
  )
}

export function CouponEditor({ id }: { id?: string }) {
  const { can, toast, openModal } = useStore()
  const existing = useGet<Coupon>(id ? `/v1/admin/coupons/${id}` : null)
  const cats = useGet<{ items: Category[] }>('/v1/admin/categories').data?.items ?? []
  const segs = useGet<{ items: { id: string; name: string }[] }>('/v1/admin/segments').data?.items ?? []
  if (id && !existing.data) return <PageHead title="Coupon" desc={existing.failed ? 'We couldn’t load this coupon.' : 'Loading…'} actions={<Btn onClick={() => navigate('/marketing/coupons')}>Back</Btn>} />
  return <CouponForm key={id ?? 'new'} c={existing.data} cats={cats} segs={segs} can={can('Marketing', id ? 'Edit' : 'Create')} toast={toast} onDelete={() => openModal({ title: 'Delete this coupon?', message: 'A coupon that has been used can’t be deleted. Pause it instead.', confirm: 'Delete', danger: true, onConfirm: () => { void del(`/v1/admin/coupons/${id}`).then(() => { toast('Coupon deleted'); navigate('/marketing/coupons') }, (e) => toast(says(e))) } })} />
}

function CouponForm({ c, cats, segs, can, toast, onDelete }: { c: Coupon | null; cats: Category[]; segs: { id: string; name: string }[]; can: boolean; toast: (m: string) => void; onDelete: () => void }) {
  const [f, setF] = useState({ name: c?.name ?? '', code: c?.code ?? '', type: c?.type ?? 'percent', value: c ? String(c.type === 'fixed' ? shillings(c.value) : c.value) : '', minSpend: String(shillings(c?.minSpendCents ?? 0)), maxDiscount: String(shillings(c?.maxDiscountCents ?? 0)), limit: String(c?.limit ?? 500), perCustomer: String(c?.perCustomer ?? 1), startsAt: toLocal(c?.startsAt ?? new Date().toISOString()), endsAt: toLocal(c?.endsAt ?? new Date(Date.now() + 14 * 86_400_000).toISOString()), audience: c?.audience ?? 'all', segmentId: c?.segmentId ?? '', combine: c?.combine ?? false, note: c?.note ?? '', categoryIds: c?.categoryIds ?? [] as string[] })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors({}) }
  const save = async (state: 'draft' | 'live') => {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = 'Name the coupon'
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(f.code.trim())) e.code = '3 to 24 letters, digits, - or _'
    if (f.type !== 'free_delivery' && !(Number(f.value) > 0)) e.value = 'Enter the discount'
    if (f.type === 'percent' && Number(f.value) > 100) e.value = 'A percentage can’t be over 100'
    if (new Date(f.endsAt) <= new Date(f.startsAt)) e.endsAt = 'The end must be after the start'
    setErrors(e)
    if (Object.keys(e).length) return
    const body = { name: f.name.trim(), code: f.code.trim().toUpperCase(), type: f.type, value: f.type === 'fixed' ? Math.round(Number(f.value) * 100) : f.type === 'percent' ? Number(f.value) : 0, minSpendCents: Math.round((Number(f.minSpend) || 0) * 100), maxDiscountCents: Math.round((Number(f.maxDiscount) || 0) * 100), limit: Number(f.limit) || 1, perCustomer: Number(f.perCustomer) || 1, startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt), state: c && state === 'draft' ? c.state : state, audience: f.audience, segmentId: f.audience === 'segment' ? f.segmentId || null : null, combine: f.combine, note: f.note.trim(), categoryIds: f.categoryIds }
    setBusy(true)
    try { if (c) await patch(`/v1/admin/coupons/${c.id}`, body); else await post('/v1/admin/coupons', body); toast('Coupon saved'); navigate('/marketing/coupons') } catch (err) { setErrors({ form: says(err) }) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title={c ? `Edit ${c.name}` : 'New coupon'} desc={c ? `${c.redemptions} uses so far` : 'Shoppers type the code in their cart.'} actions={<><Btn onClick={() => navigate('/marketing/coupons')}>Back</Btn>{c && c.redemptions === 0 && <Btn variant="danger" disabled={!can} onClick={onDelete}>Delete</Btn>}</>} />
      {errors.form && <Notice tone="error" mark="!">{errors.form}</Notice>}
      <div className="sp-two">
        <Panel title="The offer">
          <div className="sp-form2"><Field label="Name (for you)" value={f.name} onChange={set('name')} error={errors.name} /><Field label="Code shoppers type" value={f.code} onChange={(v) => set('code')(v.toUpperCase())} error={errors.code} /></div>
          <div className="sp-form2">
            <Field label="Type" value={f.type} onChange={(v) => set('type')(v as Coupon['type'])} options={[{ value: 'percent', label: 'Percentage off' }, { value: 'fixed', label: 'Fixed amount off' }, { value: 'free_delivery', label: 'Free delivery' }]} />
            {f.type !== 'free_delivery' && <Field label={f.type === 'percent' ? 'Percent off' : 'Amount off (KES)'} value={f.value} onChange={set('value')} error={errors.value} />}
            <Field label="Smallest basket (KES)" value={f.minSpend} onChange={set('minSpend')} />
            {f.type === 'percent' && <Field label="Most it can take off (KES, 0 = no cap)" value={f.maxDiscount} onChange={set('maxDiscount')} />}
          </div>
          <Field label="Note" value={f.note} onChange={set('note')} />
        </Panel>
        <Panel title="Who, when and how many">
          <div className="sp-form2"><Field label="Starts" type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /><Field label="Ends" type="datetime-local" value={f.endsAt} onChange={set('endsAt')} error={errors.endsAt} /><Field label="Total uses allowed" value={f.limit} onChange={set('limit')} /><Field label="Uses per customer" value={f.perCustomer} onChange={set('perCustomer')} /></div>
          <Field label="Who can use it" value={f.audience} onChange={(v) => set('audience')(v as Coupon['audience'])} options={[{ value: 'all', label: 'Everyone' }, { value: 'new', label: 'New customers (first order)' }, { value: 'segment', label: 'A customer group' }]} />
          {f.audience === 'segment' && <Field label="Group" value={f.segmentId} onChange={set('segmentId')} options={[{ value: '', label: 'Choose…' }, ...segs.map((s) => ({ value: s.id, label: s.name }))]} />}
          <div className="field"><label>Only for these categories (none = all)</label><div className="sp-row" style={{ flexWrap: 'wrap' }}>{cats.map((k) => <label key={k.id} className="sp-row" style={{ gap: 4 }}><input type="checkbox" checked={f.categoryIds.includes(k.id)} onChange={(e) => set('categoryIds')(e.target.checked ? [...f.categoryIds, k.id] : f.categoryIds.filter((x) => x !== k.id))} />{k.name}</label>)}</div></div>
          <label className="sp-row" style={{ gap: 6 }}><input type="checkbox" checked={f.combine} onChange={(e) => set('combine')(e.target.checked)} /> Can be combined with a flash-sale price</label>
          <div className="sp-row end" style={{ marginTop: 10 }}><Btn disabled={!can || busy} onClick={() => void save('draft')}>{c ? 'Save' : 'Save as draft'}</Btn><Btn variant="primary" disabled={!can || busy} onClick={() => void save('live')}>{c ? 'Save and go live' : 'Create and go live'}</Btn></div>
        </Panel>
      </div>
    </>
  )
}

// ---- flash sales ----------------------------------------------------------------------------------------------------

interface Flash { id: string; name: string; startsAt: string; endsAt: string; type: 'percent' | 'fixed'; value: number; placement: string; stockGuard: number; state: 'draft' | 'live'; status: string; productIds: string[]; salesTodayCents: number; salesTotalCents?: number; version: number }

function FlashForm({ f0, onDone }: { f0?: Flash; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ name: f0?.name ?? '', startsAt: toLocal(f0?.startsAt ?? new Date().toISOString()), endsAt: toLocal(f0?.endsAt ?? new Date(Date.now() + 86_400_000).toISOString()), type: f0?.type ?? 'percent', value: f0 ? String(f0.type === 'fixed' ? shillings(f0.value) : f0.value) : '', placement: f0?.placement ?? 'Home carousel', stockGuard: String(f0?.stockGuard ?? 10) })
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<ApiProduct[]>([])
  const [ids, setIds] = useState<string[]>(f0?.productIds ?? [])
  const [err, setErr] = useState('')
  useEffect(() => {
    if (search.trim().length < 2) return
    let live = true
    const t = setTimeout(() => { void get<{ items: ApiProduct[] }>(`/v1/admin/products?limit=8&status=active&q=${encodeURIComponent(search.trim())}`).then((r) => { if (live) setFound(r.items) }, () => undefined) }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [search])
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  const go = async (state: 'draft' | 'live') => {
    if (!f.name.trim()) return setErr('Name the sale')
    if (!(Number(f.value) > 0)) return setErr('Enter the discount')
    if (!ids.length) return setErr('Choose at least one product')
    const body = { name: f.name.trim(), startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt), type: f.type, value: f.type === 'fixed' ? Math.round(Number(f.value) * 100) : Math.round(Number(f.value)), productIds: ids, placement: f.placement, stockGuard: Number(f.stockGuard) || 0, state }
    try { if (f0) await patch(`/v1/admin/flash-sales/${f0.id}`, body); else await post('/v1/admin/flash-sales', body); onDone(); closeModal(); toast('Flash sale saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Field label="Name" value={f.name} onChange={set('name')} error={err} />
      <div className="sp-form2"><Field label="Starts" type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /><Field label="Ends" type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /><Field label="Discount type" value={f.type} onChange={set('type')} options={[{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Amount off (KES)' }]} /><Field label={f.type === 'percent' ? 'Percent off' : 'Amount off (KES)'} value={f.value} onChange={set('value')} /><Field label="Where it shows" value={f.placement} onChange={set('placement')} options={['Home carousel', 'Category pages', 'Product pages only']} /><Field label="Stop when stock is down to" value={f.stockGuard} onChange={set('stockGuard')} /></div>
      <Field label="Add products" value={search} onChange={setSearch} placeholder="Type a name or SKU" />
      {found.length > 0 && search.trim().length >= 2 && <div className="sp-row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>{found.filter((p) => !ids.includes(p.id)).map((p) => <button key={p.id} className="pill" onClick={() => { setIds([...ids, p.id]); setPicked([...picked, { id: p.id, name: p.name }]); setSearch(''); setFound([]) }}>{p.name}</button>)}</div>}
      <div className="sp-row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>{ids.map((id) => <span key={id} className="pill">{picked.find((p) => p.id === id)?.name ?? 'Product'} <button className="link-btn" aria-label="Remove" onClick={() => setIds(ids.filter((x) => x !== id))}>×</button></span>)}</div>
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn onClick={() => void go('draft')}>Save as draft</Btn><Btn variant="primary" onClick={() => void go('live')}>Save and publish</Btn></div>
    </>
  )
}

export function FlashSales() {
  const { can, openModal } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Flash[] }>('/v1/admin/flash-sales', 60_000)
  const rules = useGet<{ noStackFlash: boolean; bundlePoints: boolean }>('/v1/admin/marketing/rules')
  const cols: Column<Flash>[] = [
    { key: 'n', header: 'Sale', render: (s) => <div><b>{s.name}</b><div className="subtext">{s.productIds.length} products · {s.placement}</div></div> },
    { key: 'd', header: 'Discount', render: (s) => (s.type === 'percent' ? `${s.value}% off` : `${money(s.value)} off`) },
    { key: 's', header: 'Status', render: (s) => <Badge tone={s.status === 'Live' ? 'green' : s.status === 'Scheduled' ? 'blue' : 'gray'}>{s.status}</Badge> },
    { key: 'a', header: 'Sales today', render: (s) => money(s.salesTodayCents) },
    { key: 'r', header: 'Runs', render: (s) => `${dateTime(Date.parse(s.startsAt))} – ${dateTime(Date.parse(s.endsAt))}` },
  ]
  return (
    <>
      <PageHead title="Flash sales" desc="Time-limited price cuts. The app shows the new price and a countdown." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'New flash sale', body: <FlashForm onDone={reload} />, noActions: true })}>New flash sale</Btn>} />
      {rules.data && <Notice mark="i">{rules.data.noStackFlash ? 'A coupon can’t be added on top of a flash-sale price.' : 'Coupons can be added on top of a flash-sale price.'}</Notice>}
      <div style={{ marginTop: 12 }}><DataTable title="Flash sales" rows={data?.items ?? []} rowKey={(s) => s.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the flash sales.' : undefined} onRetry={reload} searchLabel="Search sales" searchText={(s) => s.name} emptyTitle="No flash sales" empty="Create one to cut prices for a day or a week."
        actions={(s) => <Btn small disabled={!can('Marketing', 'Edit')} onClick={() => openModal({ title: `Edit ${s.name}`, body: <FlashForm f0={s} onDone={reload} />, noActions: true })}>Edit</Btn>} /></div>
    </>
  )
}

// ---- bundles --------------------------------------------------------------------------------------------------------

interface Bundle { id: string; name: string; type: 'Bundle' | 'Multi-buy' | 'Cross-sell'; description: string; items: { productId: string; quantity: number; name?: string }[]; priceCents: number; percent: number; minItems: number; state: 'draft' | 'live'; status?: string; startsAt?: string | null; version?: number }

function BundleForm({ b, onDone }: { b?: Bundle; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ name: b?.name ?? '', type: b?.type ?? 'Bundle', description: b?.description ?? '', price: String(shillings(b?.priceCents ?? 0)), percent: String(b?.percent ?? 0), minItems: String(b?.minItems ?? 0) })
  const [items, setItems] = useState<{ productId: string; quantity: number; name: string }[]>((b?.items ?? []).map((i) => ({ productId: i.productId, quantity: i.quantity, name: i.name ?? 'Product' })))
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<ApiProduct[]>([])
  const [err, setErr] = useState('')
  useEffect(() => {
    if (search.trim().length < 2) return
    let live = true
    const t = setTimeout(() => { void get<{ items: ApiProduct[] }>(`/v1/admin/products?limit=8&status=active&q=${encodeURIComponent(search.trim())}`).then((r) => { if (live) setFound(r.items) }, () => undefined) }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [search])
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  const go = async (state: 'draft' | 'live') => {
    if (!f.name.trim()) return setErr('Name the offer')
    const body = { name: f.name.trim(), type: f.type, description: f.description.trim(), items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })), priceCents: Math.round((Number(f.price) || 0) * 100), percent: Number(f.percent) || 0, minItems: Number(f.minItems) || 0, state }
    try { if (b) await patch(`/v1/admin/bundles/${b.id}`, body); else await post('/v1/admin/bundles', body); onDone(); closeModal(); toast('Offer saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Field label="Name" value={f.name} onChange={set('name')} error={err} />
      <div className="sp-form2"><Field label="Kind" value={f.type} onChange={set('type')} options={['Bundle', 'Multi-buy', 'Cross-sell']} /><Field label="Bundle price (KES, 0 if using %)" value={f.price} onChange={set('price')} /><Field label="Or percent off the items" value={f.percent} onChange={set('percent')} /><Field label="Minimum items (multi-buy)" value={f.minItems} onChange={set('minItems')} /></div>
      <Field label="Description" value={f.description} onChange={set('description')} />
      <Field label="Add products" value={search} onChange={setSearch} placeholder="Type a name or SKU" />
      {found.length > 0 && search.trim().length >= 2 && <div className="sp-row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>{found.filter((p) => !items.some((i) => i.productId === p.id)).map((p) => <button key={p.id} className="pill" onClick={() => { setItems([...items, { productId: p.id, quantity: 1, name: p.name }]); setSearch(''); setFound([]) }}>{p.name}</button>)}</div>}
      {items.map((i, k) => <div key={i.productId} className="sp-row" style={{ marginBottom: 4 }}><span style={{ flex: 1 }}>{i.name}</span><input className="qty" aria-label={`Quantity of ${i.name}`} value={i.quantity} onChange={(e) => setItems(items.map((x, n) => (n === k ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} /><Btn small label="Remove" onClick={() => setItems(items.filter((_, n) => n !== k))}>×</Btn></div>)}
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn onClick={() => void go('draft')}>Save as draft</Btn><Btn variant="primary" onClick={() => void go('live')}>Save and publish</Btn></div>
    </>
  )
}

export function Bundles() {
  const { can, openModal, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Bundle[] }>('/v1/admin/bundles', 60_000)
  const flip = async (b: Bundle, state: 'draft' | 'live') => { try { await post(`/v1/admin/bundles/${b.id}/state`, { state }); toast(state === 'live' ? 'Offer published' : 'Offer unpublished'); reload() } catch (e) { toast(says(e)) } }
  const cols: Column<Bundle>[] = [
    { key: 'n', header: 'Offer', render: (b) => <div><b>{b.name}</b><div className="subtext">{b.type} · {b.items.length} products</div></div> },
    { key: 'p', header: 'Deal', render: (b) => (b.priceCents ? `${money(b.priceCents)} for the set` : b.percent ? `${b.percent}% off` : '—') },
    { key: 's', header: 'Status', render: (b) => <Badge tone={b.state === 'live' ? 'green' : 'gray'}>{b.state === 'live' ? 'Live' : 'Draft'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Bundles and multi-buy" desc="Offers that sell products together at a better price." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'New offer', body: <BundleForm onDone={reload} />, noActions: true })}>New offer</Btn>} />
      <DataTable title="Offers" rows={data?.items ?? []} rowKey={(b) => b.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the offers.' : undefined} onRetry={reload} searchLabel="Search offers" searchText={(b) => b.name} emptyTitle="No offers yet" empty="Bundle products together to lift order size."
        actions={(b) => <div className="sp-row"><Btn small disabled={!can('Marketing', 'Edit')} onClick={() => openModal({ title: `Edit ${b.name}`, body: <BundleForm b={b} onDone={reload} />, noActions: true })}>Edit</Btn><Btn small disabled={!can('Marketing', 'Edit')} onClick={() => void flip(b, b.state === 'live' ? 'draft' : 'live')}>{b.state === 'live' ? 'Unpublish' : 'Publish'}</Btn></div>} />
    </>
  )
}
