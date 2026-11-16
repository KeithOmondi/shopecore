import { useCallback, useEffect, useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, type Column } from '../components/ui'
import { ApiError, get, patch, post } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'
import type { ApiProduct, Location, Supplier } from './Products'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100

type PoStatus = 'draft' | 'pending_approval' | 'approved' | 'in_transit' | 'partially_received' | 'received' | 'cancelled'
const STATUS: Record<PoStatus, { label: string; tone: 'gray' | 'amber' | 'blue' | 'green' | 'red' }> = {
  draft: { label: 'Draft', tone: 'gray' }, pending_approval: { label: 'Waiting for approval', tone: 'amber' }, approved: { label: 'Approved', tone: 'blue' }, in_transit: { label: 'On its way', tone: 'blue' },
  partially_received: { label: 'Partly received', tone: 'amber' }, received: { label: 'Received', tone: 'green' }, cancelled: { label: 'Cancelled', tone: 'red' },
}
interface Po {
  id: string; number: string; supplierId: string; supplier: string; locationId: string; location: string; expectedOn: string; status: PoStatus; shippingCents: number; subtotalCents: number; taxCents: number; totalCents: number
  notes: string; createdBy: string; approvedBy: string | null; deliveryRef: string | null; unitsOrdered: number; unitsReceived: number; version: number; createdAt: string
}
interface PoLine { productId: string; sku: string; name: string; qty: number; costCents: number; received: number; damaged: number }
interface PoDetail extends Po { lines: PoLine[]; receipts: { deliveryRef: string; by: string; at: string }[] }

function useGet<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    void get<T>(path).then((d) => { if (live) { setData(d); setFailed(false) } }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [path, tick])
  return { data, failed, loading: !!path && !data && !failed, reload: useCallback(() => setTick((n) => n + 1), []) }
}

// ---- list -----------------------------------------------------------------------------------------------------------

export function PurchaseOrders() {
  const { can } = useStore()
  const [status, setStatus] = useState('')
  const { data, failed, loading, reload } = useGet<{ items: Po[] }>(`/v1/admin/purchase-orders?limit=100${status ? `&status=${status}` : ''}`)
  const cols: Column<Po>[] = [
    { key: 'n', header: 'Order', render: (p) => <button className="link-btn" onClick={() => navigate(`/purchasing/${p.id}`)}>{p.number}</button> },
    { key: 's', header: 'Supplier', render: (p) => p.supplier },
    { key: 'l', header: 'Deliver to', render: (p) => p.location },
    { key: 'e', header: 'Expected', render: (p) => p.expectedOn },
    { key: 'u', header: 'Units', render: (p) => `${p.unitsReceived}/${p.unitsOrdered}` },
    { key: 't', header: 'Total', sort: (a, b) => a.totalCents - b.totalCents, render: (p) => <b>{kes(shillings(p.totalCents))}</b> },
    { key: 'st', header: 'Status', render: (p) => <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge> },
  ]
  return (
    <>
      <PageHead title="Purchase orders" desc="What you have ordered from suppliers, and what has arrived." actions={<><Btn onClick={reload}>Refresh</Btn><Btn variant="primary" disabled={!can('Purchasing', 'Create')} onClick={() => navigate('/purchasing/new')}>Create purchase order</Btn></>} />
      {data && data.items.length > 0 && <div className="sp-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>{(Object.keys(STATUS) as PoStatus[]).filter((k) => data.items.some((p) => p.status === k)).map((k) => <Badge key={k} tone={STATUS[k].tone}>{`${STATUS[k].label}: ${data.items.filter((p) => p.status === k).length}`}</Badge>)}</div>}
      <DataTable title="Orders" rows={data?.items ?? []} rowKey={(p) => p.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the purchase orders.' : undefined} onRetry={reload}
        searchLabel="Search orders" searchText={(p) => `${p.number} ${p.supplier}`} emptyTitle="No purchase orders yet" empty="Create one when stock runs low."
        tools={<select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{(Object.keys(STATUS) as PoStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>}
        actions={(p) => <Btn small onClick={() => navigate(`/purchasing/${p.id}`)}>View</Btn>} />
    </>
  )
}

// ---- detail ---------------------------------------------------------------------------------------------------------

export function PurchaseOrderDetail({ id }: { id: string }) {
  const { can, toast, openModal } = useStore()
  const { data: po, failed, reload } = useGet<PoDetail>(`/v1/admin/purchase-orders/${id}`)
  const [busy, setBusy] = useState(false)
  if (!po) return <PageHead title="Purchase order" desc={failed ? 'We couldn’t load this order.' : 'Loading…'} actions={<Btn onClick={() => navigate('/purchasing')}>Back to orders</Btn>} />
  const act = (action: 'approve' | 'send' | 'cancel') => {
    setBusy(true)
    void post(`/v1/admin/purchase-orders/${id}/actions`, { action }).then(() => { toast(action === 'approve' ? 'Order approved' : action === 'send' ? 'Marked as sent to the supplier' : 'Order cancelled'); reload() }, (e) => toast(says(e))).finally(() => setBusy(false))
  }
  const edit = can('Purchasing', 'Edit')
  return (
    <>
      <PageHead title={po.number} desc={`${po.supplier} · deliver to ${po.location} · expected ${po.expectedOn}`}
        actions={<>
          <Btn onClick={() => navigate('/purchasing')}>Back to orders</Btn>
          {po.status === 'pending_approval' && <Btn variant="primary" disabled={!edit || busy} onClick={() => act('approve')}>Approve</Btn>}
          {po.status === 'approved' && <Btn variant="primary" disabled={!edit || busy} onClick={() => act('send')}>Mark as sent</Btn>}
          {['in_transit', 'partially_received', 'approved'].includes(po.status) && <Btn disabled={!can('Inventory', 'Edit')} onClick={() => navigate(`/purchasing/receive?po=${po.id}`)}>Receive stock</Btn>}
          {['draft', 'pending_approval', 'approved'].includes(po.status) && <Btn variant="danger" disabled={!edit || busy} onClick={() => openModal({ title: `Cancel ${po.number}?`, confirm: 'Cancel order', cancelLabel: 'Keep order', danger: true, onConfirm: () => act('cancel') })}>Cancel</Btn>}
        </>} />
      <div className="sp-two">
        <section className="card table-card">
          <div className="table-head"><h2>Items</h2><Badge tone={STATUS[po.status].tone}>{STATUS[po.status].label}</Badge></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Damaged</th><th>Unit cost</th><th>Line total</th></tr></thead>
            <tbody>{po.lines.map((l) => <tr key={l.productId}><td><b>{l.name}</b><div className="subtext">{l.sku}</div></td><td>{l.qty}</td><td>{l.received}</td><td>{l.damaged}</td><td>{kes(shillings(l.costCents))}</td><td><b>{kes(shillings(l.qty * l.costCents))}</b></td></tr>)}</tbody>
          </table></div>
          <div style={{ padding: '10px 15px' }}>
            <SettingRow title="Subtotal" right={<span className="prod-name">{kes(shillings(po.subtotalCents))}</span>} />
            <SettingRow title="Shipping" right={<span className="prod-name">{kes(shillings(po.shippingCents))}</span>} />
            <SettingRow title="VAT" right={<span className="prod-name">{kes(shillings(po.taxCents))}</span>} />
            <SettingRow title="Total" right={<b>{kes(shillings(po.totalCents))}</b>} />
          </div>
        </section>
        <div className="sp-stack">
          <Panel title="Details">
            <SettingRow title="Created by" right={<span className="prod-name">{po.createdBy}</span>} />
            <SettingRow title="Approved by" right={<span className="prod-name">{po.approvedBy ?? '—'}</span>} />
            <SettingRow title="Created" right={<span className="prod-name">{dateTime(Date.parse(po.createdAt))}</span>} />
            {po.notes && <SettingRow title="Notes" sub={po.notes} />}
          </Panel>
          <Panel title="Deliveries received">
            {po.receipts.length === 0 && <div className="panel-sub">Nothing received yet.</div>}
            {po.receipts.map((r, i) => <SettingRow key={i} title={r.deliveryRef} sub={`${r.by} · ${dateTime(Date.parse(r.at))}`} />)}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- create ---------------------------------------------------------------------------------------------------------

export function PurchaseOrderForm() {
  const { can, toast } = useStore()
  const sup = useGet<{ items: Supplier[] }>('/v1/admin/suppliers').data?.items.filter((s) => s.status === 'active') ?? []
  const locs = useGet<{ items: Location[] }>('/v1/admin/locations').data?.items.filter((l) => l.active) ?? []
  const [supplierId, setSupplierId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [expectedOn, setExpectedOn] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10))
  const [shipping, setShipping] = useState('0')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ productId: string; name: string; qty: string; cost: string }[]>([])
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<ApiProduct[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (search.trim().length < 2) return
    let live = true
    const t = setTimeout(() => { void get<{ items: ApiProduct[] }>(`/v1/admin/products?limit=8&q=${encodeURIComponent(search.trim())}`).then((r) => { if (live) setFound(r.items) }, () => undefined) }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [search])

  const subtotal = lines.reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0)
  const save = async (submit: boolean) => {
    const e: Record<string, string> = {}
    if (!(supplierId || sup[0])) e.supplier = 'Choose a supplier'
    if (!lines.length) e.lines = 'Add at least one product'
    if (lines.some((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) < 1)) e.lines = 'Quantities must be whole numbers of 1 or more'
    if (lines.some((l) => !(Number(l.cost) >= 0) || l.cost === '')) e.lines = 'Enter a unit cost for every line'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const r = await post<{ id: string }>('/v1/admin/purchase-orders', {
        supplierId: supplierId || sup[0]!.id, locationId: locationId || locs[0]?.id, expectedOn, shippingCents: Math.round((Number(shipping) || 0) * 100), notes: notes.trim(), submit,
        lines: lines.map((l) => ({ productId: l.productId, qty: Number(l.qty), costCents: Math.round(Number(l.cost) * 100) })),
      })
      toast(submit ? 'Purchase order submitted' : 'Draft saved')
      navigate(`/purchasing/${r.id}`)
    } catch (err) { setErrors({ form: says(err) }) } finally { setBusy(false) }
  }
  if (!can('Purchasing', 'Create')) return <><PageHead title="Create purchase order" desc="Your role can’t create purchase orders." actions={<Btn onClick={() => navigate('/purchasing')}>Back</Btn>} /></>
  return (
    <>
      <PageHead title="Create purchase order" desc="Order stock from a supplier." actions={<Btn onClick={() => navigate('/purchasing')}>Cancel</Btn>} />
      {errors.form && <Notice tone="error" mark="!">{errors.form}</Notice>}
      <div className="sp-two" style={{ marginTop: 12 }}>
        <Panel title="Order">
          <div className="sp-form2">
            <Field label="Supplier" value={supplierId || sup[0]?.id || ''} onChange={setSupplierId} error={errors.supplier} options={sup.map((s) => ({ value: s.id, label: s.name }))} />
            <Field label="Deliver to" value={locationId || locs[0]?.id || ''} onChange={setLocationId} options={locs.map((l) => ({ value: l.id, label: l.name }))} />
            <Field label="Expected on" type="date" value={expectedOn} onChange={setExpectedOn} />
            <Field label="Shipping (KES)" value={shipping} onChange={setShipping} />
          </div>
          <Field label="Notes" multiline value={notes} onChange={setNotes} />
          <Field label="Add a product" value={search} onChange={setSearch} placeholder="Type a name or SKU" />
          {found.length > 0 && search.trim().length >= 2 && (
            <div className="sp-row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
              {found.filter((p) => !lines.some((l) => l.productId === p.id)).map((p) => <button key={p.id} className="pill" onClick={() => { setLines([...lines, { productId: p.id, name: p.name, qty: '10', cost: String(shillings(p.costCents)) }]); setSearch(''); setFound([]) }}>{p.name} · {p.sku}</button>)}
            </div>
          )}
          {lines.map((l, i) => (
            <div key={l.productId} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{l.name}</span>
              <input className="qty" aria-label={`Quantity of ${l.name}`} value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} />
              <input className="qty" aria-label={`Unit cost of ${l.name}`} value={l.cost} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, cost: e.target.value } : x)))} />
              <Btn small label="Remove line" onClick={() => setLines(lines.filter((_, k) => k !== i))}>×</Btn>
            </div>
          ))}
          {errors.lines && <div className="field-error">{errors.lines}</div>}
          <div className="sp-row end"><Btn disabled={busy} onClick={() => void save(false)}>Save draft</Btn><Btn variant="primary" disabled={busy} onClick={() => void save(true)}>Submit order</Btn></div>
        </Panel>
        <Panel title="Summary"><SettingRow title="Lines" right={<b>{lines.length}</b>} /><SettingRow title="Subtotal" right={<b>{kes(subtotal)}</b>} /><div className="panel-sub">VAT and approval rules are applied when you submit.</div></Panel>
      </div>
    </>
  )
}

// ---- receive --------------------------------------------------------------------------------------------------------

export function ReceiveStock() {
  const { toast, can } = useStore()
  const q = useQuery()
  const open = useGet<{ items: Po[] }>('/v1/admin/purchase-orders?limit=100')
  const options = (open.data?.items ?? []).filter((p) => ['approved', 'in_transit', 'partially_received'].includes(p.status))
  const [poId, setPoId] = useState(q.get('po') ?? '')
  const po = useGet<PoDetail>(poId ? `/v1/admin/purchase-orders/${poId}` : null)
  const [ref, setRef] = useState('')
  const [entry, setEntry] = useState<Record<string, { good: string; damaged: string }>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const d = po.data
    if (!d) return
    if (!ref.trim()) return setError('Enter the delivery note number')
    const lines = d.lines.map((l) => ({ productId: l.productId, good: Number(entry[l.productId]?.good || 0), damaged: Number(entry[l.productId]?.damaged || 0) })).filter((l) => l.good > 0 || l.damaged > 0)
    if (!lines.length) return setError('Enter what arrived')
    if (lines.some((l) => !Number.isInteger(l.good) || !Number.isInteger(l.damaged) || l.good < 0 || l.damaged < 0)) return setError('Use whole numbers')
    setBusy(true)
    try { await post(`/v1/admin/purchase-orders/${d.id}/receive`, { deliveryRef: ref.trim(), lines }); toast('Stock received'); navigate(`/purchasing/${d.id}`) } catch (e) { setError(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title="Receive stock" desc="Record what arrived against a purchase order." />
      <Panel title="Delivery">
        <Field label="Purchase order" value={poId} onChange={(v) => { setPoId(v); setEntry({}); setError('') }} options={[{ value: '', label: options.length ? 'Choose an order…' : 'No orders are waiting for delivery' }, ...options.map((p) => ({ value: p.id, label: `${p.number} · ${p.supplier}` }))]} />
        {po.data && (
          <>
            <Field label="Delivery note number" value={ref} onChange={(v) => { setRef(v); setError('') }} />
            <div className="table-wrap"><table>
              <thead><tr><th>Product</th><th>Ordered</th><th>Already in</th><th>Good</th><th>Damaged</th></tr></thead>
              <tbody>{po.data.lines.map((l) => (
                <tr key={l.productId}><td><b>{l.name}</b><div className="subtext">{l.sku}</div></td><td>{l.qty}</td><td>{l.received}</td>
                  <td><input className="qty" aria-label={`Good units of ${l.name}`} value={entry[l.productId]?.good ?? ''} onChange={(e) => setEntry((x) => ({ ...x, [l.productId]: { good: e.target.value, damaged: x[l.productId]?.damaged ?? '' } }))} /></td>
                  <td><input className="qty" aria-label={`Damaged units of ${l.name}`} value={entry[l.productId]?.damaged ?? ''} onChange={(e) => setEntry((x) => ({ ...x, [l.productId]: { good: x[l.productId]?.good ?? '', damaged: e.target.value } }))} /></td></tr>
              ))}</tbody>
            </table></div>
            {error && <div className="field-error" role="alert">{error}</div>}
            <div className="sp-row end"><Btn variant="primary" disabled={!can('Inventory', 'Edit') || busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'Confirm delivery'}</Btn></div>
          </>
        )}
      </Panel>
    </>
  )
}

// ---- suppliers ------------------------------------------------------------------------------------------------------

interface SupplierFull extends Supplier { contact: string; email: string; phone: string; city: string; terms: string; leadDays: number; minOrderCents: number; products: number }

function SupplierForm({ s, onSaved }: { s?: SupplierFull; onSaved: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ name: s?.name ?? '', contact: s?.contact ?? '', email: s?.email ?? '', phone: s?.phone ?? '', city: s?.city ?? '', terms: s?.terms ?? 'Net 30', leadDays: String(s?.leadDays ?? 7), status: s?.status ?? 'active' })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.name.trim()) return setErr('Name the supplier')
    const body = { ...f, name: f.name.trim(), leadDays: Number(f.leadDays) || 0 }
    try { if (s) await patch(`/v1/admin/suppliers/${s.id}`, body); else await post('/v1/admin/suppliers', body); onSaved(); closeModal(); toast('Supplier saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Field label="Supplier name" value={f.name} onChange={set('name')} error={err} />
      <div className="sp-form2"><Field label="Contact person" value={f.contact} onChange={set('contact')} /><Field label="Phone" value={f.phone} onChange={set('phone')} /><Field label="Email" value={f.email} onChange={set('email')} /><Field label="City" value={f.city} onChange={set('city')} /><Field label="Payment terms" value={f.terms} onChange={set('terms')} /><Field label="Lead time (days)" value={f.leadDays} onChange={set('leadDays')} /></div>
      <Field label="Status" value={f.status} onChange={set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On hold' }]} />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void save()}>Save supplier</Btn></div>
    </>
  )
}

export function Suppliers() {
  const { can, openModal } = useStore()
  const list = useGet<{ items: SupplierFull[] }>('/v1/admin/suppliers')
  const cols: Column<SupplierFull>[] = [
    { key: 'n', header: 'Supplier', sort: (a, b) => a.name.localeCompare(b.name), render: (s) => <div><b>{s.name}</b><div className="subtext">{[s.contact, s.city].filter(Boolean).join(' · ')}</div></div> },
    { key: 'c', header: 'Contact', render: (s) => <div>{s.phone || '—'}<div className="subtext">{s.email}</div></div> },
    { key: 'p', header: 'Products', render: (s) => s.products },
    { key: 'l', header: 'Lead time', render: (s) => `${s.leadDays} days` },
    { key: 't', header: 'Terms', render: (s) => s.terms },
    { key: 'st', header: 'Status', render: (s) => <Badge tone={s.status === 'active' ? 'green' : 'amber'}>{s.status === 'active' ? 'Active' : 'On hold'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Suppliers" desc="Who you buy from." actions={<Btn variant="primary" disabled={!can('Purchasing', 'Create')} onClick={() => openModal({ title: 'Add supplier', body: <SupplierForm onSaved={list.reload} />, noActions: true })}>Add supplier</Btn>} />
      <DataTable title="Suppliers" rows={list.data?.items ?? []} rowKey={(s) => s.id} columns={cols} loading={list.loading} error={list.failed && !list.data ? 'We couldn’t load the suppliers.' : undefined} onRetry={list.reload} searchLabel="Search suppliers" searchText={(s) => `${s.name} ${s.contact} ${s.city}`} emptyTitle="No suppliers yet" empty="Add the suppliers you buy from."
        actions={(s) => <Btn small disabled={!can('Purchasing', 'Edit')} onClick={() => openModal({ title: `Edit ${s.name}`, body: <SupplierForm s={s} onSaved={list.reload} />, noActions: true })}>Edit</Btn>} />
    </>
  )
}

