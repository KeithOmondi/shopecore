import { useState } from 'react'

import { Bars, Stats } from '../components/finance-ui'
import { fromInput, PhoneFrame, ProductPicker, Tag, toInput } from '../components/marketing-ui'
import { Detail, NotFoundCard, useNow } from '../components/support-ui'
import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, Stat, Toggle, downloadCsv, type Column } from '../components/ui'
import {
  applyCoupon, bundleStandalone, bundleStatus, campaignSeries, campaignTotals, couponStatus, COUPON_TYPES, saleBadge, salePrice, saleStatus, type Bundle, type Campaign, type Coupon, type CouponStatus, type CouponType, type FlashSale,
} from '../data/marketing'
import { dateTime, kes, shortDate } from '../lib/format'
import { useMarketing } from '../lib/marketing'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useDirty, useUnsavedGuard } from '../lib/unsaved'

const DAY = 86_400_000
const HOUR = 3_600_000
const couponTone = (s: CouponStatus) => (s === 'Active' ? 'green' : s === 'Scheduled' ? 'blue' : s === 'Paused' ? 'amber' : s === 'Draft' ? 'gray' : 'gray')
const offerText = (c: Coupon) => (c.type === 'Free delivery' ? 'Free delivery' : c.type === 'Fixed amount' ? `${kes(c.value)} off` : `${c.value}% off${c.maxDiscount ? ` (max ${kes(c.maxDiscount)})` : ''}`) + (c.minSpend ? ` · min ${kes(c.minSpend)}` : '')
const left = (ms: number, now: number) => { const d = ms - now; const h = Math.floor(Math.abs(d) / HOUR); const m = Math.floor((Math.abs(d) % HOUR) / 60_000); return h >= 48 ? `${Math.round(h / 24)} days` : `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m` }

// ---- overview -----------------------------------------------------------------------------------------------------

export function MarketingOverview() {
  const m = useMarketing()
  const { products } = useStore()
  const now = useNow()
  const totals = m.campaigns.map((c) => ({ c, t: campaignTotals(c) }))
  const sales = totals.reduce((n, x) => n + x.t.sales, 0)
  const clicks = totals.reduce((n, x) => n + x.t.clicks, 0)
  const conv = totals.reduce((n, x) => n + x.t.conversions, 0)
  const sent = m.pushes.filter((p) => p.stats)
  const open = sent.reduce((n, p) => n + p.stats!.opened, 0) / Math.max(1, sent.reduce((n, p) => n + p.stats!.sent, 0))
  const mails = m.messages.filter((x) => x.channel === 'Email' && x.stats)
  const ctr = mails.reduce((n, x) => n + x.stats!.clicks, 0) / Math.max(1, mails.reduce((n, x) => n + x.stats!.sent, 0))
  const active = m.coupons.filter((c) => couponStatus(c, now) === 'Active')
  const redemptions = m.coupons.reduce((n, c) => n + c.redemptions, 0)
  const redeemRate = redemptions / Math.max(1, m.coupons.reduce((n, c) => n + c.limit, 0))
  const attention: { title: string; sub: string; to: string; action: string }[] = [
    ...m.flash.filter((s) => saleStatus(s, now) === 'Live').flatMap((s) => { const low = s.productIds.filter((id) => (products.find((p) => p.id === id)?.stock ?? 99) <= s.guard).length; return low ? [{ title: s.name, sub: `${low} product${low === 1 ? ' is' : 's are'} at the stock guard and left out`, to: '/marketing/flash', action: 'Review' }] : [] }),
    ...active.filter((c) => c.end - now < 3 * DAY).map((c) => ({ title: c.name, sub: `${c.code} ends in ${left(c.end, now)}`, to: `/marketing/coupons/${c.id}`, action: 'Review' })),
    ...m.banners.filter((b) => b.published && !m.knownLink(b.link)).map((b) => ({ title: b.title, sub: 'The banner link is broken', to: '/marketing/banners', action: 'Fix' })),
  ]
  return (
    <>
      <PageHead title="Marketing overview" desc="Campaign performance, coupon usage and customer engagement at a glance." actions={<Btn variant="primary" onClick={() => navigate('/marketing/coupons/new')}>Create campaign</Btn>} />
      <Stats>
        <Stat label="Campaign-attributed sales" value={kes(sales)} trend={`${m.campaigns.length} campaigns`} icon="↗" />
        <Stat label="Coupon redemptions" value={redemptions.toLocaleString('en-US')} trend={`Across ${active.length} active offers`} icon="%" />
        <Stat label="Conversion rate" value={`${((conv / Math.max(1, clicks)) * 100).toFixed(1)}%`} trend="Clicks that became orders" icon="◎" />
        <Stat label="Push open rate" value={`${(open * 100).toFixed(1)}%`} trend="Industry average about 22%" icon="↗" />
      </Stats>
      <div className="sp-two" style={{ gridTemplateColumns: 'minmax(0,1.45fr) minmax(260px,.9fr)' }}>
        <div className="sp-stack">
          <Panel title="Campaign performance" sub="Attributed sales by campaign"><Bars values={totals.map((x) => x.t.sales)} labels={totals.map((x) => x.c.name)} /></Panel>
          <Panel title="Top campaigns" sub="Ranked by attributed sales" right={<Btn small onClick={() => navigate('/marketing/analytics')}>View analytics</Btn>}>
            <div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Type</th><th>Attributed sales</th><th>Conversion</th><th>Status</th></tr></thead>
              <tbody>{[...totals].sort((a, b) => b.t.sales - a.t.sales).map(({ c, t }) => <tr key={c.id}><td><button className="sp-link" onClick={() => navigate(`/marketing/analytics/${c.id}`)}>{c.name}</button></td><td>{c.type}</td><td>{kes(t.sales)}</td><td>{((t.conversions / Math.max(1, t.clicks)) * 100).toFixed(1)}%</td><td><Badge tone={c.status === 'Active' ? 'green' : c.status === 'Scheduled' ? 'blue' : 'gray'}>{c.status}</Badge></td></tr>)}</tbody></table></div>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Engagement snapshot" sub="From campaigns sent in this demo">
            {([['Push open rate', open], ['Email click-through', ctr], ['Coupon redemption rate', redeemRate]] as const).map(([l, v]) => <div key={l} style={{ marginBottom: 12 }}><div className="sp-detail" style={{ border: 0, padding: '0 0 4px' }}><span>{l}</span><b>{(v * 100).toFixed(1)}%</b></div><div className="progress"><i style={{ width: `${Math.min(100, v * 100 * 2)}%` }} /></div></div>)}
          </Panel>
          <Panel title="Needs attention" right={<Badge tone={attention.length ? 'amber' : 'green'}>{attention.length ? `${attention.length} items` : 'All clear'}</Badge>}>
            {attention.map((a) => <div className="list-row" key={a.title + a.sub}><div><b style={{ fontSize: 11 }}>{a.title}</b><div className="panel-sub">{a.sub}</div></div><Btn small onClick={() => navigate(a.to)}>{a.action}</Btn></div>)}
            {!attention.length && <p className="panel-sub">Nothing needs attention.</p>}
          </Panel>
          <Panel title="Quick actions" sub="Launch a new customer touchpoint">
            <div className="sp-row"><Btn small onClick={() => navigate('/marketing/push')}>Compose push</Btn><Btn small onClick={() => navigate('/marketing/coupons/new')}>New coupon</Btn><Btn small onClick={() => navigate('/marketing/flash')}>Flash sale</Btn></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- analytics -----------------------------------------------------------------------------------------------------

export function CampaignAnalytics({ id }: { id?: string }) {
  const m = useMarketing()
  const { orders, can, toast } = useStore()
  const now = useNow()
  const c: Campaign | undefined = m.campaigns.find((x) => x.id === id) ?? (id ? undefined : m.campaigns[0])
  if (!c) return <NotFoundCard what="Campaign" back="All campaigns" onBack={() => navigate('/marketing/analytics')} />
  const t = campaignTotals(c)
  const series = campaignSeries(c, now)
  const top = new Map<string, number>()
  for (const o of orders.filter((x) => x.status !== 'Cancelled')) for (const i of o.items) top.set(i.name, (top.get(i.name) ?? 0) + i.price * i.qty)
  const best = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const spendShare = (reach: number) => (c.spend * reach) / Math.max(1, t.reach)
  return (
    <>
      <PageHead title="Campaign analytics detail" desc={`Performance breakdown for ${c.name}.`} actions={<><select className="sp-select auto" aria-label="Campaign" value={c.id} onChange={(e) => navigate(`/marketing/analytics/${e.target.value}`)}>{m.campaigns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><Btn onClick={() => navigate('/marketing')}>← Marketing</Btn><Btn variant="primary" disabled={!can('Marketing', 'Export')} onClick={() => { downloadCsv(`${c.id}-analytics.csv`, ['Channel', 'Reach', 'Clicks', 'Conversions', 'Sales (KES)', 'ROAS'], c.channels.map((x) => [x.name, x.reach, x.clicks, x.conversions, x.sales, (x.sales / Math.max(1, spendShare(x.reach))).toFixed(1)])); toast('Report exported') }}>Export report</Btn></>} />
      <Stats>
        <Stat label="Attributed sales" value={kes(t.sales)} trend={c.status === 'Scheduled' ? 'Not started yet' : `${c.channels.length} channels`} icon="₭" />
        <Stat label="Orders attributed" value={t.conversions.toLocaleString('en-US')} trend={`${t.clicks.toLocaleString('en-US')} clicks`} icon="▦" />
        <Stat label="Conversion rate" value={`${((t.conversions / Math.max(1, t.clicks)) * 100).toFixed(1)}%`} trend="Clicks that became orders" icon="◎" />
        <Stat label="Return on spend" value={`${(t.sales / Math.max(1, c.spend)).toFixed(1)}×`} trend={`${kes(c.spend)} campaign cost`} icon="↗" />
      </Stats>
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Attributed sales trend" sub={`${shortDate(c.start)} – ${shortDate(Math.min(c.end, now))}`}><Bars values={series} labels={series.map((_, i) => `Day ${i + 1}`)} /></Panel>
          <Panel title="Channel performance">
            <div className="table-wrap"><table><thead><tr><th>Channel</th><th>Reach</th><th>Clicks</th><th>Conversions</th><th>Sales</th><th>ROAS</th></tr></thead>
              <tbody>{c.channels.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.reach.toLocaleString('en-US')}</td><td>{x.clicks.toLocaleString('en-US')}</td><td>{x.conversions}</td><td>{kes(x.sales)}</td><td>{(x.sales / Math.max(1, spendShare(x.reach))).toFixed(1)}×</td></tr>)}</tbody></table></div>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Campaign summary" sub={c.type} right={<Badge tone={c.status === 'Active' ? 'green' : c.status === 'Scheduled' ? 'blue' : 'gray'}>{c.status}</Badge>}>
            <Detail label="Audience">{c.audience}</Detail><Detail label="Start date">{shortDate(c.start)}</Detail><Detail label="End date">{shortDate(c.end)}</Detail><Detail label="Offer">{c.offer}</Detail>
          </Panel>
          <Panel title="Top products" sub="Best sellers across the shop, for reference">
            {best.map(([n, v], i) => <div className="list-row" key={n}><b style={{ fontSize: 11 }}>{n}</b><span className="panel-sub">{kes(v)}{i === 0 ? ' · top' : ''}</span></div>)}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- coupons ------------------------------------------------------------------------------------------------------------

export function CouponsList() {
  const m = useMarketing()
  const { can, toast, openModal } = useStore()
  const now = useNow()
  const [status, setStatus] = useState('All statuses')
  const [type, setType] = useState('All discount types')
  const edit = can('Marketing', 'Edit')
  const rows = m.coupons.filter((c) => (status === 'All statuses' || couponStatus(c, now) === status) && (type === 'All discount types' || c.type === type))
  const active = m.coupons.filter((c) => couponStatus(c, now) === 'Active')
  const cols: Column<Coupon>[] = [
    { key: 'code', header: 'Code', sort: (a, b) => a.code.localeCompare(b.code), render: (c) => <button className="sp-link" onClick={() => navigate(`/marketing/coupons/${c.id}`)}>{c.code}</button> },
    { key: 'offer', header: 'Offer', render: (c) => offerText(c) },
    { key: 'use', header: 'Usage', sort: (a, b) => a.redemptions - b.redemptions, render: (c) => `${c.redemptions.toLocaleString('en-US')} / ${c.limit.toLocaleString('en-US')}` },
    { key: 'end', header: 'Valid until', sort: (a, b) => a.end - b.end, render: (c) => shortDate(c.end) },
    { key: 'st', header: 'Status', render: (c) => <Badge tone={couponTone(couponStatus(c, now))}>{couponStatus(c, now)}</Badge> },
  ]
  return (
    <>
      <PageHead title="Coupons list" desc="Create, track and manage discount codes across the ShopCore app." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => navigate('/marketing/coupons/new')}>Create coupon</Btn>} />
      <Stats>
        <Stat label="Active coupons" value={String(active.length)} trend={`${active.filter((c) => c.end - now < 7 * DAY).length} ending this week`} icon="%" />
        <Stat label="Redemptions" value={m.coupons.reduce((n, c) => n + c.redemptions, 0).toLocaleString('en-US')} trend={`${kes(m.coupons.reduce((n, c) => n + c.discountGiven, 0))} discount value`} icon="↗" />
        <Stat label="Paused or ended" value={String(m.coupons.filter((c) => ['Paused', 'Ended', 'Exhausted'].includes(couponStatus(c, now))).length)} trend="Not accepting redemptions" icon="◷" />
      </Stats>
      <DataTable title={`${rows.length} coupons`} rows={rows} rowKey={(c) => c.id} columns={cols} searchLabel="Search code or offer" searchText={(c) => `${c.code} ${c.name} ${offerText(c)}`}
        tools={<><select className="sp-select auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option>{['Active', 'Scheduled', 'Paused', 'Draft', 'Ended', 'Exhausted'].map((s) => <option key={s}>{s}</option>)}</select><select className="sp-select auto" aria-label="Discount type" value={type} onChange={(e) => setType(e.target.value)}><option>All discount types</option>{COUPON_TYPES.map((t) => <option key={t}>{t}</option>)}</select></>}
        bulk={{ label: 'Pause selected', onClick: (ids) => { if (!edit) return toast('Your role can’t change coupons'); openModal({ title: 'Pause selected coupons?', message: 'Selected coupons stop accepting new redemptions until you resume them.', confirm: 'Pause', onConfirm: () => { m.setCouponState(ids, 'Paused'); toast('Coupons paused') } }) } }}
        actions={(c) => <div className="sp-row"><Btn small onClick={() => navigate(`/marketing/coupons/${c.id}`)}>Edit</Btn>{c.state !== 'Draft' && <Btn small disabled={!edit} onClick={() => { m.setCouponState([c.id], c.state === 'Paused' ? 'Live' : 'Paused'); toast(c.state === 'Paused' ? 'Coupon resumed' : 'Coupon paused') }}>{c.state === 'Paused' ? 'Resume' : 'Pause'}</Btn>}</div>} />
    </>
  )
}

export function CouponEditor({ id }: { id?: string }) {
  const m = useMarketing()
  const { categories, orders, toast, can } = useStore()
  const now = useNow()
  const cur = id ? m.coupons.find((c) => c.id === id) : undefined
  const [v, setV] = useState(() => ({
    name: cur?.name ?? '', code: cur?.code ?? '', type: (cur?.type ?? 'Percentage discount') as CouponType, value: String(cur?.value ?? 10), minSpend: String(cur?.minSpend ?? 1000), maxDiscount: String(cur?.maxDiscount ?? 0), limit: String(cur?.limit ?? 1000), perCustomer: String(cur?.perCustomer ?? 1),
    start: toInput(cur?.start ?? now + HOUR), end: toInput(cur?.end ?? now + 14 * DAY), state: cur?.state ?? 'Draft', categories: cur?.categories ?? [], customers: cur?.customers ?? 'All customers', segmentId: cur?.segmentId ?? 'sg-new', combine: cur?.combine ?? false, note: cur?.note ?? '',
  }))
  const [err, setErr] = useState<Record<string, string>>({})
  const unsaved = useUnsavedGuard(useDirty(v))
  const [test, setTest] = useState({ subtotal: '3000', fee: '250', isNew: false })
  const edit = can('Marketing', 'Edit') || (!cur && can('Marketing', 'Create'))
  if (id && !cur) return <NotFoundCard what="Coupon" back="All coupons" onBack={() => navigate('/marketing/coupons')} />
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const build = (): Omit<Coupon, 'id' | 'redemptions' | 'discountGiven' | 'createdBy'> => ({
    name: v.name.trim(), code: v.code.trim().toUpperCase(), type: v.type, value: v.type === 'Free delivery' ? 0 : Number(v.value), minSpend: Number(v.minSpend) || 0, maxDiscount: Number(v.maxDiscount) || 0, limit: Number(v.limit), perCustomer: Number(v.perCustomer),
    start: fromInput(v.start), end: fromInput(v.end), state: v.state, categories: v.categories, customers: v.customers, segmentId: v.customers === 'Selected segment' ? v.segmentId : undefined, combine: v.combine, note: v.note,
  })
  const save = () => {
    const c = build()
    const e: Record<string, string> = {}
    if (!c.name) e.name = 'Give the coupon a name'
    if (!/^[A-Z0-9]{4,20}$/.test(c.code)) e.code = 'Use 4 to 20 letters or numbers, no spaces'
    if (c.type !== 'Free delivery' && !(c.value > 0)) e.value = 'Enter a discount above 0'
    if (c.type === 'Percentage discount' && c.value > 100) e.value = 'A percentage can’t be more than 100'
    if (!Number.isInteger(c.limit) || c.limit < 1) e.limit = 'Enter a whole number of 1 or more'
    if (!Number.isInteger(c.perCustomer) || c.perCustomer < 1) e.perCustomer = 'Enter 1 or more'
    if (!(c.end > c.start)) e.end = 'The end must be after the start'
    setErr(e)
    if (Object.keys(e).length) return
    const r = m.saveCoupon({ ...c, id: cur?.id })
    if (r.error) return setErr({ code: r.error })
    toast(c.state === 'Draft' ? 'Coupon saved as a draft' : 'Coupon saved')
    unsaved()
    navigate('/marketing/coupons')
  }
  const avgSub = orders.length ? orders.reduce((n, o) => n + o.subtotal, 0) / orders.length : 3000
  const probe = { ...build(), id: 'probe', redemptions: 0, discountGiven: 0, createdBy: '' } as Coupon
  const live: Coupon = { ...probe, state: 'Live', start: 0, end: Number.MAX_SAFE_INTEGER, limit: 1e9 }
  const aud = m.audience(v.customers === 'Selected segment' ? v.segmentId : v.customers === 'New customers only' ? 'sg-new' : 'sg-all')
  const forecast = Math.min(Number(v.limit) || 0, Math.round(aud.total * 0.25 * (Number(v.perCustomer) || 1)))
  const per = applyCoupon(live, { subtotal: avgSub, delivery: 250, newCustomer: true, categories: v.categories }, now)
  const cost = per.ok ? per.discount * forecast : 0
  const result = applyCoupon(live, { subtotal: Number(test.subtotal) || 0, delivery: Number(test.fee) || 0, newCustomer: test.isNew, categories: v.categories }, now)
  return (
    <>
      <PageHead title={cur ? 'Edit coupon' : 'Create coupon'} desc="Configure a promotion code and limit how it can be used." actions={<><Btn onClick={() => navigate('/marketing/coupons')}>Cancel</Btn><Btn variant="primary" disabled={!edit} onClick={save}>Save coupon</Btn></>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Offer details" sub="Set the code and discount structure" right={<Badge tone={couponTone(cur ? couponStatus(cur, now) : 'Draft')}>{cur ? couponStatus(cur, now) : 'Draft'}</Badge>}>
            <div className="sp-form2">
              <Field label="Coupon name" value={v.name} onChange={set('name')} error={err.name} />
              <Field label="Coupon code" value={v.code} onChange={(x) => set('code')(x.toUpperCase())} error={err.code} hint="Customers enter this at checkout." />
              <Field label="Discount type" value={v.type} onChange={(x) => set('type')(x as CouponType)} options={COUPON_TYPES} />
              <Field label={v.type === 'Percentage discount' ? 'Discount (%)' : 'Discount value (KES)'} type="number" value={v.type === 'Free delivery' ? '0' : v.value} onChange={set('value')} error={err.value} />
              <Field label="Minimum spend (KES)" type="number" value={v.minSpend} onChange={set('minSpend')} />
              <Field label="Maximum discount (KES)" type="number" value={v.maxDiscount} onChange={set('maxDiscount')} hint="0 means no cap. Applies to percentage coupons." />
              <Field label="Total usage limit" type="number" value={v.limit} onChange={set('limit')} error={err.limit} />
              <Field label="Limit per customer" type="number" value={v.perCustomer} onChange={set('perCustomer')} error={err.perCustomer} />
              <Field label="Start date and time" type="datetime-local" value={v.start} onChange={set('start')} />
              <Field label="End date and time" type="datetime-local" value={v.end} onChange={set('end')} error={err.end} />
              <Field label="Status" value={v.state === 'Live' ? 'Live' : v.state} onChange={(x) => set('state')(x as Coupon['state'])} options={[{ value: 'Draft', label: 'Draft' }, { value: 'Live', label: 'Live (scheduled or active by date)' }, { value: 'Paused', label: 'Paused' }]} />
            </div>
          </Panel>
          <Panel title="Eligibility">
            <div className="sp-form2">
              <Field label="Applicable customers" value={v.customers} onChange={(x) => set('customers')(x as Coupon['customers'])} options={['All customers', 'New customers only', 'Selected segment']} />
              {v.customers === 'Selected segment' && <Field label="Segment" value={v.segmentId} onChange={set('segmentId')} options={m.segments.map((s) => ({ value: s.id, label: s.name }))} />}
            </div>
            <fieldset style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', margin: '0 0 12px' }}>
              <legend style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', padding: '0 4px' }}>Applicable categories ({v.categories.length ? v.categories.length : 'all'})</legend>
              <div className="sp-row">{categories.map((c) => <label key={c} className="sp-row" style={{ fontSize: 11, gap: 5 }}><input type="checkbox" checked={v.categories.includes(c)} onChange={(e) => set('categories')(e.target.checked ? [...v.categories, c] : v.categories.filter((x) => x !== c))} />{c}</label>)}</div>
            </fieldset>
            <Field label="Internal note" multiline value={v.note} onChange={set('note')} placeholder="Add a note for your team" />
            <label className="sp-row" style={{ fontSize: 11, gap: 6 }}><input type="checkbox" checked={v.combine} onChange={(e) => set('combine')(e.target.checked)} /> Can be combined with other offers</label>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Customer preview">
            <div className="sp-note"><div className="sp-label">Checkout offer</div><h3 style={{ margin: '4px 0', fontSize: 16 }}>{v.code.trim().toUpperCase() || 'CODE'}</h3><span className="panel-sub">{v.type === 'Free delivery' ? 'Free delivery' : v.type === 'Fixed amount' ? `Save ${kes(Number(v.value) || 0)}` : `Save ${Number(v.value) || 0}%`} on your next order{Number(v.minSpend) ? ` of ${kes(Number(v.minSpend))} or more` : ''}.</span></div>
          </Panel>
          <Panel title="Try it" sub="Check what this coupon does to a basket">
            <div className="sp-form2"><Field label="Basket (KES)" type="number" value={test.subtotal} onChange={(x) => setTest({ ...test, subtotal: x })} /><Field label="Delivery fee (KES)" type="number" value={test.fee} onChange={(x) => setTest({ ...test, fee: x })} /></div>
            <label className="sp-row" style={{ fontSize: 11, gap: 6, marginBottom: 8 }}><input type="checkbox" checked={test.isNew} onChange={(e) => setTest({ ...test, isNew: e.target.checked })} /> New customer</label>
            {result.ok ? <Notice tone="success" mark="✓">Takes off {kes(result.discount)}. The customer pays {kes(Math.max(0, (Number(test.subtotal) || 0) + (Number(test.fee) || 0) - result.discount))}.</Notice> : <Notice tone="warning" mark="!">{result.reason}</Notice>}
          </Panel>
          <Panel title="Usage forecast" sub="Based on the eligible audience">
            <div className="fin-total">~{forecast.toLocaleString('en-US')} <span className="panel-sub">redemptions</span></div>
            <div className="progress" style={{ margin: '10px 0' }}><i style={{ width: `${Math.min(100, (forecast / Math.max(1, Number(v.limit) || 1)) * 100)}%` }} /></div>
            <Detail label="Eligible customers">{aud.total}</Detail><Detail label="Estimated discount cost">{kes(cost)}</Detail>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- flash sales ----------------------------------------------------------------------------------------------------------

function FlashForm({ sale }: { sale?: FlashSale }) {
  const m = useMarketing()
  const { products, closeModal, toast } = useStore()
  const now = useNow()
  const [v, setV] = useState({ name: sale?.name ?? '', start: toInput(sale?.start ?? now + 2 * HOUR), end: toInput(sale?.end ?? now + 10 * HOUR), kind: sale?.kind ?? 'percent', value: String(sale?.value ?? 15), placement: sale?.placement ?? 'Home carousel', guard: String(sale?.guard ?? 10), ids: sale?.productIds ?? [] as string[] })
  const [err, setErr] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const save = (state: 'Draft' | 'Live') => {
    const e: Record<string, string> = {}
    const val = Number(v.value)
    if (!v.name.trim()) e.name = 'Name the sale'
    if (!(fromInput(v.end) > fromInput(v.start))) e.end = 'The end must be after the start'
    if (!(val > 0) || (v.kind === 'percent' && val > 90)) e.value = v.kind === 'percent' ? 'Enter a discount from 1 to 90%' : 'Enter an amount above 0'
    if (!v.ids.length) e.ids = 'Choose at least one product'
    if (v.kind === 'fixed' && products.some((p) => v.ids.includes(p.id) && p.price <= val)) e.value = 'The discount is more than the price of a chosen product'
    setErr(e)
    if (Object.keys(e).length) return
    const r = m.saveFlash({ id: sale?.id, name: v.name.trim(), start: fromInput(v.start), end: fromInput(v.end), kind: v.kind, value: val, productIds: v.ids, placement: v.placement, guard: Number(v.guard) || 0, state })
    if (r.error) return setErr({ ids: r.error })
    closeModal()
    toast(state === 'Draft' ? 'Flash sale saved as a draft' : 'Flash sale scheduled')
  }
  return (
    <>
      <Field label="Sale name" value={v.name} onChange={set('name')} error={err.name} />
      <div className="sp-form2"><Field label="Starts" type="datetime-local" value={v.start} onChange={set('start')} /><Field label="Ends" type="datetime-local" value={v.end} onChange={set('end')} error={err.end} />
        <Field label="Discount type" value={v.kind} onChange={(x) => set('kind')(x as 'percent' | 'fixed')} options={[{ value: 'percent', label: 'Percentage off' }, { value: 'fixed', label: 'Fixed amount off' }]} /><Field label={v.kind === 'percent' ? 'Percent off' : 'KES off'} type="number" value={v.value} onChange={set('value')} error={err.value} />
        <Field label="Placement" value={v.placement} onChange={set('placement')} options={['Home carousel', 'Category pages', 'Product pages only']} /><Field label="Inventory guard (units)" type="number" value={v.guard} onChange={set('guard')} hint="Products at or below this stock leave the sale." /></div>
      <ProductPicker products={products} selected={v.ids} onChange={(ids) => set('ids')(ids)} />
      {err.ids && <div className="sp-err" role="alert">{err.ids}</div>}
      <div className="sp-row end sp-gap"><Btn onClick={closeModal}>Cancel</Btn><Btn onClick={() => save('Draft')}>Save draft</Btn><Btn variant="primary" onClick={() => save('Live')}>Schedule sale</Btn></div>
    </>
  )
}

export function FlashSales() {
  const m = useMarketing()
  const { products, openModal, toast, can } = useStore()
  const now = useNow()
  const [sel, setSel] = useState('')
  const edit = can('Marketing', 'Edit')
  const sorted = [...m.flash].sort((a, b) => a.start - b.start)
  const cur = m.flash.find((s) => s.id === sel) ?? sorted.find((s) => saleStatus(s, now) === 'Live') ?? sorted[0]
  const live = m.flash.filter((s) => saleStatus(s, now) === 'Live')
  const next = m.flash.filter((s) => saleStatus(s, now) === 'Scheduled').sort((a, b) => a.start - b.start)[0]
  const items = (s: FlashSale) => s.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
  return (
    <>
      <PageHead title="Flash sales" desc="Schedule limited-time discounts with a clear start and end time." actions={<><Btn onClick={() => navigate('/marketing/bundles')}>Manage bundles</Btn><Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'Create flash sale', body: <FlashForm />, noActions: true })}>Create flash sale</Btn></>} />
      <Stats>
        <Stat label="Scheduled" value={String(m.flash.filter((s) => saleStatus(s, now) === 'Scheduled').length)} trend={next ? `Next starts in ${left(next.start, now)}` : 'None scheduled'} icon="◷" />
        <Stat label="Live now" value={String(live.length)} trend={`${kes(live.reduce((n, s) => n + s.salesToday, 0))} sales today`} icon="ϟ" />
        <Stat label="Items in sale" value={String(new Set(m.flash.filter((s) => ['Live', 'Scheduled'].includes(saleStatus(s, now))).flatMap((s) => s.productIds)).size)} trend="Across live and scheduled sales" icon="▦" />
      </Stats>
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Upcoming and live" sub="Offers scheduled for your storefront">
            {sorted.map((s) => { const st = saleStatus(s, now); return (
              <div className="list-row" key={s.id} style={cur?.id === s.id ? { background: 'var(--blue-soft)' } : undefined}>
                <div><button className="sp-link" onClick={() => setSel(s.id)}>{s.name}</button><div className="panel-sub">{dateTime(s.start)} – {dateTime(s.end)} · {s.productIds.length} products</div><div className="sp-row" style={{ marginTop: 6 }}><Badge tone={st === 'Live' ? 'green' : st === 'Scheduled' ? 'blue' : 'gray'}>{st}</Badge><Tag>{saleBadge(s)}</Tag></div></div>
                <div className="sp-row"><Btn small disabled={!edit || st === 'Ended'} onClick={() => openModal({ title: `Edit ${s.name}`, body: <FlashForm sale={s} />, noActions: true })}>Edit</Btn>{st === 'Live' && <Btn small disabled={!edit} onClick={() => openModal({ title: `End ${s.name} now?`, message: 'Prices go back to normal straight away.', confirm: 'End sale', danger: true, onConfirm: () => { m.saveFlash({ ...s, end: Date.now() - 1 }); toast('Sale ended') } })}>End</Btn>}</div>
              </div>) })}
          </Panel>
          {cur && (
            <Panel title="Sale products" sub={`Included in ${cur.name}`}>
              {items(cur).map((p) => { const low = p.stock <= cur.guard; return <div className="list-row" key={p.id}><div><b style={{ fontSize: 11 }}>{p.name}</b><div className="panel-sub">{kes(salePrice(cur, p))} <s>{kes(p.price)}</s> · {p.stock} in stock</div></div>{low ? <Badge tone="amber">Below stock guard</Badge> : <Badge tone="green">{saleBadge(cur)}</Badge>}</div> })}
            </Panel>
          )}
        </div>
        <div className="sp-stack">
          {cur && (
            <>
              <Panel title="Countdown preview" sub="Customer app" right={<Badge tone={saleStatus(cur, now) === 'Live' ? 'green' : 'blue'}>{saleStatus(cur, now).toUpperCase()}</Badge>}>
                <PhoneFrame label="Phone preview"><div className="panel-sub">SHOPCORE · TODAY’S PICKS</div><div style={{ background: 'linear-gradient(130deg,#BFDBFE,#93C5FD)', borderRadius: 8, padding: 12, marginTop: 8 }}><b style={{ fontSize: 13 }}>{cur.name}</b><div className="panel-sub" style={{ marginTop: 6 }}>{saleStatus(cur, now) === 'Live' ? 'Ends in' : 'Starts in'}</div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)', margin: '2px 0 8px' }}>{left(saleStatus(cur, now) === 'Live' ? cur.end : cur.start, now)}</div><button className="btn small primary" type="button">Shop flash sale</button></div></PhoneFrame>
              </Panel>
              <Panel title="Sale settings">
                <Detail label="Featured placement">{cur.placement}</Detail><Detail label="Inventory guard">{cur.guard} units</Detail><Detail label="Discount stacking">{m.rules.noStackFlash ? 'Not allowed' : 'Allowed'}</Detail>
              </Panel>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ---- promotions and bundles -----------------------------------------------------------------------------------------------------

function BundleForm({ bundle }: { bundle?: Bundle }) {
  const m = useMarketing()
  const { products, closeModal, toast } = useStore()
  const now = useNow()
  const [v, setV] = useState({ name: bundle?.name ?? '', kind: bundle?.kind ?? 'Bundle', desc: bundle?.desc ?? '', ids: bundle?.items.map((i) => i.productId) ?? ([] as string[]), price: String(bundle?.price ?? ''), percent: String(bundle?.percent ?? 15), minItems: String(bundle?.minItems ?? 3), start: toInput(bundle?.start ?? now) })
  const [err, setErr] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const standalone = products.filter((p) => v.ids.includes(p.id)).reduce((n, p) => n + p.price, 0)
  const save = (state: 'Draft' | 'Live') => {
    const e: Record<string, string> = {}
    if (!v.name.trim()) e.name = 'Name the offer'
    if (v.kind === 'Multi-buy') {
      if (!(Number(v.percent) >= 1 && Number(v.percent) <= 60)) e.percent = 'Enter 1 to 60%'
      if (!(Number(v.minItems) >= 2)) e.minItems = 'At least 2 items'
    } else {
      if (v.ids.length < 2) e.ids = 'A bundle needs at least two products'
      const p = Number(v.price)
      if (!(p > 0)) e.price = 'Enter the bundle price'
      else if (standalone && p >= standalone) e.price = `The price must be less than the ${kes(standalone)} total, or it isn’t a saving`
    }
    setErr(e)
    if (Object.keys(e).length) return
    m.saveBundle({ id: bundle?.id, name: v.name.trim(), kind: v.kind, desc: v.desc.trim(), items: v.kind === 'Multi-buy' ? [] : v.ids.map((productId) => ({ productId, qty: 1 })), price: v.kind === 'Multi-buy' ? 0 : Number(v.price), percent: v.kind === 'Multi-buy' ? Number(v.percent) : 0, minItems: v.kind === 'Multi-buy' ? Number(v.minItems) : 0, state, start: fromInput(v.start) })
    closeModal()
    toast(state === 'Draft' ? 'Saved as a draft' : 'Offer saved')
  }
  return (
    <>
      <div className="sp-form2"><Field label="Name" value={v.name} onChange={set('name')} error={err.name} /><Field label="Type" value={v.kind} onChange={(x) => set('kind')(x as Bundle['kind'])} options={['Bundle', 'Multi-buy', 'Cross-sell']} /></div>
      <Field label="Description" value={v.desc} onChange={set('desc')} />
      {v.kind === 'Multi-buy' ? <div className="sp-form2"><Field label="Percent off" type="number" value={v.percent} onChange={set('percent')} error={err.percent} /><Field label="Minimum items" type="number" value={v.minItems} onChange={set('minItems')} error={err.minItems} /></div> : (
        <>
          <ProductPicker products={products} selected={v.ids} onChange={(ids) => set('ids')(ids)} />
          {err.ids && <div className="sp-err" role="alert">{err.ids}</div>}
          <Field label="Bundle price (KES)" type="number" value={v.price} onChange={set('price')} error={err.price} hint={standalone ? `Standalone total ${kes(standalone)}${Number(v.price) > 0 && Number(v.price) < standalone ? ` · customer saves ${kes(standalone - Number(v.price))}` : ''}` : 'Choose products to see the standalone total'} />
        </>
      )}
      <Field label="Starts" type="datetime-local" value={v.start} onChange={set('start')} />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn onClick={() => save('Draft')}>Save draft</Btn><Btn variant="primary" onClick={() => save('Live')}>Save and publish</Btn></div>
    </>
  )
}

export function Bundles() {
  const m = useMarketing()
  const { products, openModal, toast, can } = useStore()
  const now = useNow()
  const edit = can('Marketing', 'Edit')
  const live = m.bundles.filter((b) => bundleStatus(b, now) === 'Live')
  const values = m.bundles.filter((b) => b.price > 0).map((b) => b.price)
  return (
    <>
      <PageHead title="Promotions and bundles" desc="Group products into offers that increase basket size." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'Create bundle', body: <BundleForm />, noActions: true })}>Create bundle</Btn>} />
      <Stats>
        <Stat label="Live offers" value={String(live.length)} trend={`${m.bundles.filter((b) => b.state === 'Draft').length} drafts`} icon="◇" />
        <Stat label="Units sold" value={m.bundles.reduce((n, b) => n + b.unitsSold, 0).toLocaleString('en-US')} trend="Across all offers" icon="▦" />
        <Stat label="Average bundle price" value={kes(values.length ? values.reduce((n, x) => n + x, 0) / values.length : 0)} trend="Fixed-price bundles" icon="₭" />
      </Stats>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
        {m.bundles.map((b) => { const st = bundleStatus(b, now); const stand = bundleStandalone(b, products); return (
          <section className="card panel" key={b.id}>
            <div className="sp-row between"><Tag>{b.kind.toUpperCase()}</Tag><Badge tone={st === 'Live' ? 'green' : st === 'Scheduled' ? 'blue' : 'gray'}>{st}</Badge></div>
            <h3 style={{ margin: '10px 0 4px', fontSize: 14 }}>{b.name}</h3><p className="panel-sub" style={{ minHeight: 30 }}>{b.desc}</p>
            <div className="fin-total">{b.kind === 'Multi-buy' ? <>{b.percent}% <span className="panel-sub">off</span></> : kes(b.price)}</div>
            <div className="panel-sub">{b.kind === 'Multi-buy' ? `Minimum ${b.minItems} eligible items` : <><s>{kes(stand)}</s> · Save {kes(Math.max(0, stand - b.price))}</>}</div>
            <div style={{ marginTop: 10 }}><Detail label="Units sold">{b.unitsSold}</Detail><Detail label={st === 'Scheduled' ? 'Starts' : 'Conversion'}>{st === 'Scheduled' ? shortDate(b.start) : `${b.conversion}%`}</Detail></div>
            <div className="sp-row sp-gap"><Btn small disabled={!edit} onClick={() => openModal({ title: `Edit ${b.name}`, body: <BundleForm bundle={b} />, noActions: true })}>Edit</Btn><Btn small disabled={!edit} onClick={() => { m.setBundleState(b.id, b.state === 'Live' ? 'Draft' : 'Live'); toast(b.state === 'Live' ? 'Offer unpublished' : 'Offer published') }}>{b.state === 'Live' ? 'Unpublish' : 'Publish'}</Btn></div>
          </section>) })}
      </div>
      <div style={{ height: 14 }} />
      <Panel title="Promotion rules" sub="Stacking and eligibility policies">
        <SettingRow title="Discounts do not stack with flash sale pricing" sub="The highest eligible discount is applied at checkout." right={<Toggle on={m.rules.noStackFlash} label="Block stacking with flash sales" onChange={(on) => { if (edit) { m.setRules({ ...m.rules, noStackFlash: on }); toast('Rule updated') } }} />} />
        <SettingRow title="Bundles qualify for loyalty points" sub="Points are calculated on the final bundle price." right={<Toggle on={m.rules.bundlePoints} label="Bundles earn points" onChange={(on) => { if (edit) { m.setRules({ ...m.rules, bundlePoints: on }); toast('Rule updated') } }} />} />
      </Panel>
    </>
  )
}
