import { useState } from 'react'

import { Stats, Steps } from '../components/finance-ui'
import { fromInput, toInput } from '../components/marketing-ui'
import { Detail, NotFoundCard, useNow, when } from '../components/support-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, Stat, type Column } from '../components/ui'
import { PO_APPROVAL_LIMIT, poOpen, poSubtotal, poTax, poTotal, type POStatus, type PurchaseOrder, type Supplier } from '../data/inventory'
import { kes, shortDate } from '../lib/format'
import { useInventory } from '../lib/inventory'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'
import { useDirty, useUnsavedGuard } from '../lib/unsaved'

const DAY = 86_400_000
const poTone = (s: POStatus) => (s === 'Received' ? 'green' : s === 'Approved' || s === 'In transit' ? 'blue' : s === 'Partially received' || s === 'Pending approval' ? 'amber' : s === 'Cancelled' ? 'red' : 'gray')

// ---- list ------------------------------------------------------------------------------------------------------------

export function PurchaseOrders() {
  const { business, can, toast } = useStore()
  const inv = useInventory()
  const now = useNow()
  const vat = Number(business.vat) || 16
  const [status, setStatus] = useState('All statuses')
  const [supplier, setSupplier] = useState('All suppliers')
  const rows = inv.pos.filter((p) => (status === 'All statuses' || p.status === status) && (supplier === 'All suppliers' || inv.suppliers.find((s) => s.id === p.supplierId)?.name === supplier))
  const open = inv.pos.filter(poOpen)
  const overdue = open.filter((p) => p.expected < now)
  const sName = (id: string) => inv.suppliers.find((s) => s.id === id)?.name ?? '—'
  const cols: Column<PurchaseOrder>[] = [
    { key: 'id', header: 'PO number', sort: (a, b) => a.id.localeCompare(b.id), render: (p) => <button className="sp-link" onClick={() => navigate(`/purchasing/${p.id}`)}>{p.id}</button> },
    { key: 's', header: 'Supplier', render: (p) => sName(p.supplierId) },
    { key: 'l', header: 'Deliver to', render: (p) => inv.locations.find((l) => l.id === p.locationId)?.name ?? '—' },
    { key: 't', header: 'Total', sort: (a, b) => poTotal(a, vat) - poTotal(b, vat), render: (p) => <b>{kes(poTotal(p, vat))}</b> },
    { key: 'e', header: 'Expected', sort: (a, b) => a.expected - b.expected, render: (p) => <span style={{ color: poOpen(p) && p.expected < now ? 'var(--red)' : undefined }}>{shortDate(p.expected)}</span> },
    { key: 'st', header: 'Status', render: (p) => <Badge tone={poTone(p.status)}>{p.status}</Badge> },
    { key: 'by', header: 'Created by', render: (p) => p.createdBy },
  ]
  return (
    <>
      <PageHead title="Purchase orders list" desc="Track supplier orders from approval through receiving." actions={<><Btn disabled={!can('Purchasing', 'Export')} onClick={() => { downloadCsv('purchase-orders.csv', ['PO', 'Supplier', 'Total (KES)', 'Expected', 'Status', 'Created by'], rows.map((p) => [p.id, sName(p.supplierId), poTotal(p, vat), new Date(p.expected).toISOString().slice(0, 10), p.status, p.createdBy])); toast('Purchase orders exported') }}>Export</Btn><Btn variant="primary" disabled={!can('Purchasing', 'Create')} onClick={() => navigate('/purchasing/new')}>+ Create purchase order</Btn></>} />
      <Stats>
        <Stat label="Open POs" value={String(open.length)} trend={`${open.filter((p) => p.expected - now < 7 * DAY).length} due within 7 days`} icon="▤" />
        <Stat label="Incoming value" value={kes(open.reduce((n, p) => n + poTotal(p, vat), 0))} trend="Across active orders" icon="↓" />
        <Stat label="Overdue deliveries" value={String(overdue.length)} trend={overdue.length ? 'Follow up with suppliers' : 'All on time'} icon="!" up={overdue.length === 0} />
        <Stat label="Waiting for approval" value={String(inv.pos.filter((p) => p.status === 'Pending approval').length)} trend={`Orders above ${kes(PO_APPROVAL_LIMIT)}`} icon="✓" />
      </Stats>
      <DataTable title={`${rows.length} purchase orders`} rows={rows} rowKey={(p) => p.id} columns={cols} searchLabel="Search purchase orders" emptyTitle="No purchase orders yet" empty="Create one to restock from a supplier." emptyAction={can('Purchasing', 'Create') ? { label: 'Create a purchase order', onClick: () => navigate('/purchasing/new') } : undefined} searchText={(p) => `${p.id} ${sName(p.supplierId)}`}
        tools={<><select className="sp-select auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option>{['Draft', 'Pending approval', 'Approved', 'In transit', 'Partially received', 'Received', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select><select className="sp-select auto" aria-label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)}><option>All suppliers</option>{inv.suppliers.map((s) => <option key={s.id}>{s.name}</option>)}</select></>}
        actions={(p) => <Btn small onClick={() => navigate(`/purchasing/${p.id}`)}>Open</Btn>} />
    </>
  )
}

export function PurchaseOrderDetail({ id }: { id: string }) {
  const { products, business, openModal, toast, can } = useStore()
  const inv = useInventory()
  const vat = Number(business.vat) || 16
  const p = inv.pos.find((x) => x.id === id)
  if (!p) return <NotFoundCard what="Purchase order" back="All purchase orders" onBack={() => navigate('/purchasing')} />
  const s = inv.suppliers.find((x) => x.id === p.supplierId)
  const edit = can('Purchasing', 'Edit')
  const act = (a: 'approve' | 'send' | 'cancel', title: string, message: string, ok: string, danger = false) => openModal({ title, message, confirm: title.replace(/\?$/, ''), danger, onConfirm: () => { const e = inv.poAction(p.id, a); toast(e ?? ok) } })
  const submit = () => {
    if (!s || s.status === 'On hold') return toast('This supplier is on hold. Choose another or take it off hold first.')
    if (poSubtotal(p) < s.minOrder) return toast(`${s.name} has a ${kes(s.minOrder)} minimum order.`)
    openModal({ title: 'Submit purchase order?', message: poTotal(p, vat) > PO_APPROVAL_LIMIT ? `It is above ${kes(PO_APPROVAL_LIMIT)}, so it goes to an approver before it is issued.` : 'It is under the approval limit, so it is approved straight away.', confirm: 'Submit', onConfirm: () => { const r = inv.savePO({ id: p.id, supplierId: p.supplierId, locationId: p.locationId, expected: p.expected, lines: p.lines, shipping: p.shipping, notes: p.notes }, true); toast(r.error ?? 'Purchase order submitted') } })
  }
  const steps = [{ label: 'Draft', done: true }, { label: 'Approved', done: !['Draft', 'Pending approval', 'Cancelled'].includes(p.status) }, { label: 'In transit', done: ['In transit', 'Partially received', 'Received'].includes(p.status) }, { label: 'Received', done: p.status === 'Received' }]
  return (
    <>
      <PageHead title={`Purchase order ${p.id}`} desc={`${s?.name ?? 'Supplier'} · ${inv.locations.find((l) => l.id === p.locationId)?.name}`}
        actions={<><Btn onClick={() => navigate('/purchasing')}>← All orders</Btn>
          {p.status === 'Draft' && <><Btn disabled={!edit} onClick={() => navigate(`/purchasing/new?edit=${p.id}`)}>Edit</Btn><Btn variant="primary" disabled={!edit} onClick={submit}>Submit for approval</Btn></>}
          {p.status === 'Pending approval' && <Btn variant="primary" disabled={!edit} onClick={() => act('approve', 'Approve this order?', `${kes(poTotal(p, vat))} will be committed to ${s?.name}.`, 'Purchase order approved')}>Approve</Btn>}
          {p.status === 'Approved' && <Btn variant="primary" disabled={!edit} onClick={() => act('send', 'Send to supplier?', 'The order is issued to the supplier and marked in transit.', 'Order sent to the supplier')}>Send to supplier</Btn>}
          {poOpen(p) && <Btn variant="primary" disabled={!can('Inventory', 'Edit')} onClick={() => navigate(`/purchasing/receive?po=${p.id}`)}>Receive stock</Btn>}
          {!['Cancelled', 'Received'].includes(p.status) && !p.lines.some((l) => l.received > 0) && <Btn variant="danger" disabled={!edit} onClick={() => act('cancel', 'Cancel this order?', 'The supplier is told the order is cancelled.', 'Order cancelled', true)}>Cancel order</Btn>}</>} />
      {p.status !== 'Cancelled' && <Steps steps={steps} />}
      <div className="sp-two">
        <Panel title="Order items" right={<Badge tone={poTone(p.status)}>{p.status}</Badge>}>
          <div className="table-wrap"><table><thead><tr><th>Product / SKU</th><th>Ordered</th><th>Received</th><th>Unit cost</th><th className="fin-num">Line total</th></tr></thead>
            <tbody>{p.lines.map((l) => { const pr = products.find((x) => x.id === l.productId); return <tr key={l.productId}><td><b>{pr?.name}</b><span className="sp-sub">{pr?.sku}</span></td><td>{l.qty}</td><td>{l.received}{l.damaged > 0 && <span className="sp-sub" style={{ color: 'var(--red)' }}>{l.damaged} damaged</span>}</td><td>{kes(l.cost)}</td><td className="fin-num">{kes(l.qty * l.cost)}</td></tr> })}</tbody></table></div>
        </Panel>
        <div className="sp-stack">
          <Panel title="Order summary">
            <Detail label="Items subtotal">{kes(poSubtotal(p))}</Detail><Detail label="Shipping">{kes(p.shipping)}</Detail><Detail label={`Tax (${vat}%)`}>{kes(poTax(p, vat))}</Detail>
            <div className="sp-detail"><span>Total</span><b className="fin-total">{kes(poTotal(p, vat))}</b></div>
          </Panel>
          <Panel title="Details">
            <Detail label="Expected">{shortDate(p.expected)}</Detail><Detail label="Created by">{p.createdBy}</Detail><Detail label="Created">{when(p.createdAt)}</Detail>{p.approvedBy && <Detail label="Approved by">{p.approvedBy}</Detail>}{p.deliveryRef && <Detail label="Delivery reference">{p.deliveryRef}</Detail>}
            {p.notes && <p className="panel-sub" style={{ marginTop: 8 }}>{p.notes}</p>}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- create --------------------------------------------------------------------------------------------------------------

export function PurchaseOrderForm() {
  const { products, business, can, toast } = useStore()
  const inv = useInventory()
  const q = useQuery()
  const now = useNow()
  const vat = Number(business.vat) || 16
  const existing = q.get('edit') ? inv.pos.find((x) => x.id === q.get('edit')) : undefined
  const pre = q.get('product') ? products.find((x) => x.id === q.get('product')) : undefined
  const [supplierId, setSupplierId] = useState(existing?.supplierId ?? (pre ? inv.meta(pre).supplierId : '') ?? inv.suppliers[0]?.id ?? '')
  const [locationId, setLocationId] = useState(existing?.locationId ?? q.get('loc') ?? inv.primary?.id ?? '')
  const [expected, setExpected] = useState(toInput(existing?.expected ?? now + (inv.suppliers.find((s) => s.id === supplierId)?.leadDays ?? 7) * DAY).slice(0, 10))
  const [shipping, setShipping] = useState(String(existing?.shipping ?? 0))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [lines, setLines] = useState<{ productId: string; qty: string; cost: string }[]>(existing?.lines.map((l) => ({ productId: l.productId, qty: String(l.qty), cost: String(l.cost) })) ?? (pre ? [{ productId: pre.id, qty: q.get('qty') ?? '10', cost: String(inv.meta(pre).cost) }] : []))
  const [err, setErr] = useState('')
  const [add, setAdd] = useState('')
  const unsaved = useUnsavedGuard(useDirty({ supplierId, locationId, expected, shipping, notes, lines }))
  const supplier = inv.suppliers.find((s) => s.id === supplierId)
  const parsed = lines.map((l) => ({ productId: l.productId, qty: Number(l.qty), cost: Number(l.cost), received: 0, damaged: 0 }))
  const sub = parsed.reduce((n, l) => n + (l.qty > 0 && l.cost > 0 ? l.qty * l.cost : 0), 0)
  const draft: PurchaseOrder = { id: 'x', supplierId, locationId, expected: 0, status: 'Draft', lines: parsed, shipping: Number(shipping) || 0, notes, createdBy: '', createdAt: 0 }
  const total = poTotal(draft, vat)
  const mayCreate = can('Purchasing', 'Create')
  const bySupplier = products.filter((p) => p.status !== 'Archived' && (!supplierId || inv.meta(p).supplierId === supplierId || inv.meta(p).supplierId === ''))
  const save = (submit: boolean) => {
    if (!supplierId) return setErr('Choose a supplier.')
    if (!lines.length) return setErr('Add at least one product.')
    if (parsed.some((l) => !(Number.isInteger(l.qty) && l.qty > 0) || !(l.cost > 0))) return setErr('Every line needs a whole quantity above 0 and a unit cost.')
    if (!(fromInput(expected) > 0)) return setErr('Choose the expected delivery date.')
    if (submit && supplier?.status === 'On hold') return setErr(`${supplier.name} is on hold. Choose another supplier.`)
    if (submit && supplier && sub < supplier.minOrder) return setErr(`${supplier.name} has a ${kes(supplier.minOrder)} minimum order. This is ${kes(sub)}.`)
    const r = inv.savePO({ id: existing?.id, supplierId, locationId, expected: fromInput(expected), lines: parsed, shipping: Number(shipping) || 0, notes }, submit)
    if (r.error) return setErr(r.error)
    toast(submit ? 'Purchase order submitted' : 'Saved as a draft')
    unsaved()
    navigate(`/purchasing/${r.id}`)
  }
  return (
    <>
      <PageHead title={existing ? `Edit ${existing.id}` : 'Create purchase order'} desc="Build a supplier order and send it for approval." actions={<><Btn onClick={() => navigate('/purchasing')}>Cancel</Btn><Btn disabled={!mayCreate} onClick={() => save(false)}>Save draft</Btn><Btn variant="primary" disabled={!mayCreate} onClick={() => save(true)}>Submit for approval</Btn></>} />
      {!mayCreate && <div style={{ marginBottom: 12 }}><Notice>Your role can view purchase orders but not create them.</Notice></div>}
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Order information">
            <div className="sp-form2">
              <Field label="Supplier" value={supplierId} onChange={(v) => { setSupplierId(v); setErr('') }} options={inv.suppliers.map((s) => ({ value: s.id, label: `${s.name}${s.status === 'On hold' ? ' (on hold)' : ''}` }))} />
              <Field label="Deliver to" value={locationId} onChange={setLocationId} options={inv.locations.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name }))} />
              <Field label="Expected delivery" type="date" value={expected} onChange={(v) => { setExpected(v); setErr('') }} />
              <Field label="Shipping (KES)" type="number" value={shipping} onChange={setShipping} />
            </div>
            <Field label="Supplier note" multiline value={notes} onChange={setNotes} placeholder="Delivery instructions or terms" />
          </Panel>
          <Panel title="Order items" right={<div className="sp-row"><select className="sp-select auto" aria-label="Add a product" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">Add a product…</option>{bySupplier.filter((p) => !lines.some((l) => l.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><Btn small disabled={!add} onClick={() => { const p = products.find((x) => x.id === add); if (p) setLines([...lines, { productId: p.id, qty: '10', cost: String(inv.meta(p).cost) }]); setAdd(''); setErr('') }}>+ Add</Btn></div>}>
            <div className="table-wrap"><table><thead><tr><th>Product / SKU</th><th>Qty</th><th>Unit cost</th><th className="fin-num">Line total</th><th /></tr></thead>
              <tbody>{lines.map((l, i) => { const p = products.find((x) => x.id === l.productId); return <tr key={l.productId}><td><b>{p?.name}</b><span className="sp-sub">{p?.sku}</span></td>
                <td><input className="sp-input" style={{ width: 70 }} type="number" min={1} aria-label={`Quantity of ${p?.name}`} value={l.qty} onChange={(e) => { setLines(lines.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x))); setErr('') }} /></td>
                <td><input className="sp-input" style={{ width: 90 }} type="number" min={1} aria-label={`Unit cost of ${p?.name}`} value={l.cost} onChange={(e) => { setLines(lines.map((x, k) => (k === i ? { ...x, cost: e.target.value } : x))); setErr('') }} /></td>
                <td className="fin-num">{kes((Number(l.qty) || 0) * (Number(l.cost) || 0))}</td><td><Btn small onClick={() => setLines(lines.filter((_, k) => k !== i))} label={`Remove ${p?.name}`}>×</Btn></td></tr> })}
                {!lines.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>No products yet. Add one above, or reorder from Low-stock alerts.</td></tr>}</tbody></table></div>
            {err && <div className="sp-err" role="alert">{err}</div>}
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Order summary">
            <Detail label="Items subtotal">{kes(sub)}</Detail><Detail label="Shipping">{kes(Number(shipping) || 0)}</Detail><Detail label={`Tax (${vat}%)`}>{kes(poTax(draft, vat))}</Detail>
            <div className="sp-detail"><span>Total</span><b className="fin-total">{kes(total)}</b></div>
            <div style={{ marginTop: 10 }}><Notice>Approval is needed for orders above {kes(PO_APPROVAL_LIMIT)}.</Notice></div>
          </Panel>
          {supplier && <Panel title="Supplier terms"><Detail label="Payment terms">{supplier.terms}</Detail><Detail label="Lead time">{supplier.leadDays} days</Detail><Detail label="Minimum order">{kes(supplier.minOrder)}</Detail></Panel>}
        </div>
      </div>
    </>
  )
}

// ---- receive -----------------------------------------------------------------------------------------------------------------

export function ReceiveStock() {
  const { products, user, openModal, toast, can } = useStore()
  const inv = useInventory()
  const q = useQuery()
  const open = inv.pos.filter(poOpen)
  const [poId, setPoId] = useState(q.get('po') && open.some((p) => p.id === q.get('po')) ? q.get('po')! : open[0]?.id ?? '')
  const po = open.find((p) => p.id === poId)
  const [rows, setRows] = useState<Record<string, { good: string; damaged: string }>>({})
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  const edit = can('Inventory', 'Edit')
  if (!open.length) return <><PageHead title="Receive stock" desc="Check delivered quantities against a purchase order." /><Notice mark="✓" tone="success">No purchase orders are waiting to be received.</Notice></>
  if (!po) return <NotFoundCard what="Purchase order" back="Pick another" onBack={() => setPoId(open[0]!.id)} />
  const val = (pid: string) => rows[pid] ?? { good: String(Math.max(0, (po.lines.find((l) => l.productId === pid)?.qty ?? 0) - (po.lines.find((l) => l.productId === pid)?.received ?? 0))), damaged: '0' }
  const set = (pid: string, k: 'good' | 'damaged', v: string) => { setRows({ ...rows, [pid]: { ...val(pid), [k]: v } }); setErr('') }
  const parsed = po.lines.map((l) => ({ productId: l.productId, good: Number(val(l.productId).good), damaged: Number(val(l.productId).damaged) }))
  const goodTotal = parsed.reduce((n, r) => n + (Number.isFinite(r.good) ? r.good : 0), 0)
  const badTotal = parsed.reduce((n, r) => n + (Number.isFinite(r.damaged) ? r.damaged : 0), 0)
  const expectedTotal = po.lines.reduce((n, l) => n + (l.qty - l.received), 0)
  const complete = () => {
    if (parsed.some((r) => !Number.isInteger(r.good) || r.good < 0 || !Number.isInteger(r.damaged) || r.damaged < 0)) return setErr('Quantities must be whole numbers of 0 or more.')
    if (!ref.trim()) return setErr('Enter the supplier’s delivery reference.')
    openModal({ title: 'Confirm stock receipt?', message: `${goodTotal} good unit${goodTotal === 1 ? '' : 's'} will be added to ${inv.locations.find((l) => l.id === po.locationId)?.name} and logged against ${po.id}.${badTotal ? ` ${badTotal} damaged unit${badTotal === 1 ? ' is' : 's are'} recorded on the order but not added to stock.` : ''}`, confirm: 'Complete receiving', onConfirm: () => { const e = inv.receivePO(po.id, parsed, ref); if (e) setErr(e); else { toast('Stock received'); navigate(`/purchasing/${po.id}`) } } })
  }
  return (
    <>
      <PageHead title="Receive stock" desc={`Check delivered quantities and condition against ${po.id}.`} actions={<><select className="sp-select auto" aria-label="Purchase order" value={poId} onChange={(e) => { setPoId(e.target.value); setRows({}); setErr('') }}>{open.map((p) => <option key={p.id} value={p.id}>{p.id} · {inv.suppliers.find((s) => s.id === p.supplierId)?.name}</option>)}</select><Btn onClick={() => navigate('/purchasing')}>Save for later</Btn><Btn variant="primary" disabled={!edit} onClick={complete}>Complete receiving</Btn></>} />
      <Steps steps={[{ label: 'Purchase order', done: true }, { label: 'Check quantities', done: goodTotal + badTotal > 0 }, { label: 'Put away', done: false }]} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title={`${po.id} · ${inv.suppliers.find((s) => s.id === po.supplierId)?.name}`} sub={`${inv.locations.find((l) => l.id === po.locationId)?.name} · Expected ${shortDate(po.expected)}`} right={<Badge tone={poTone(po.status)}>{po.status}</Badge>}>
            <div className="sp-form2"><Field label="Received by" value={user?.name ?? ''} onChange={() => undefined} /><Field label="Supplier delivery reference" value={ref} onChange={(v) => { setRef(v); setErr('') }} placeholder="For example DN-6841" /></div>
          </Panel>
          <Panel title="Verify line items" sub={`${po.lines.length} products · ${expectedTotal} units still expected`}>
            <div className="table-wrap"><table><thead><tr><th>Product / SKU</th><th>Ordered</th><th>Already received</th><th>Good now</th><th>Damaged now</th></tr></thead>
              <tbody>{po.lines.map((l) => { const p = products.find((x) => x.id === l.productId); return <tr key={l.productId}><td><b>{p?.name}</b><span className="sp-sub">{p?.sku}</span></td><td>{l.qty}</td><td>{l.received}</td>
                <td><input className="sp-input" style={{ width: 72 }} type="number" min={0} aria-label={`Good units of ${p?.name}`} value={val(l.productId).good} disabled={!edit} onChange={(e) => set(l.productId, 'good', e.target.value)} /></td>
                <td><input className="sp-input" style={{ width: 72 }} type="number" min={0} aria-label={`Damaged units of ${p?.name}`} value={val(l.productId).damaged} disabled={!edit} onChange={(e) => set(l.productId, 'damaged', e.target.value)} /></td></tr> })}</tbody></table></div>
            {err && <div className="sp-err" role="alert">{err}</div>}
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Receiving summary"><Detail label="Still expected">{expectedTotal} units</Detail><Detail label="Receiving now (good)">{goodTotal} units</Detail><Detail label="Damaged">{badTotal} units</Detail><div style={{ marginTop: 10 }}><Notice>Count cartons before confirming. Fewer than ordered becomes a partial receipt and the order stays open.</Notice></div></Panel>
          <Panel title="Where it goes"><Detail label="Location">{inv.locations.find((l) => l.id === po.locationId)?.name}</Detail><p className="panel-sub" style={{ marginTop: 6 }}>Good units go straight to available stock there.</p></Panel>
        </div>
      </div>
    </>
  )
}

// ---- suppliers -------------------------------------------------------------------------------------------------------------------

function SupplierForm({ s }: { s?: Supplier }) {
  const inv = useInventory()
  const { closeModal, toast } = useStore()
  const [v, setV] = useState({ name: s?.name ?? '', contact: s?.contact ?? '', email: s?.email ?? '', phone: s?.phone ?? '', city: s?.city ?? '', terms: s?.terms ?? 'Net 30', leadDays: String(s?.leadDays ?? 7), minOrder: String(s?.minOrder ?? 0), status: s?.status ?? 'Active' })
  const [err, setErr] = useState<Record<string, string>>({})
  const set = (k: keyof typeof v) => (x: string) => { setV({ ...v, [k]: x }); setErr({}) }
  const save = () => {
    const e: Record<string, string> = {}
    if (!v.name.trim()) e.name = 'Name the supplier'
    else if (inv.suppliers.some((x) => x.id !== s?.id && x.name.toLowerCase() === v.name.trim().toLowerCase())) e.name = 'Another supplier has that name'
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) e.email = 'Enter a valid email'
    if (!(Number(v.leadDays) >= 0)) e.leadDays = 'Enter the lead time in days'
    if (!(Number(v.minOrder) >= 0)) e.minOrder = 'Enter 0 or more'
    setErr(e)
    if (Object.keys(e).length) return
    inv.saveSupplier({ id: s?.id, name: v.name.trim(), contact: v.contact.trim(), email: v.email.trim(), phone: v.phone.trim(), city: v.city.trim(), terms: v.terms, leadDays: Number(v.leadDays), minOrder: Number(v.minOrder), status: v.status as Supplier['status'], onTime: s?.onTime ?? 90 })
    closeModal()
    toast('Supplier saved')
  }
  return (
    <>
      <Field label="Supplier name" value={v.name} onChange={set('name')} error={err.name} />
      <div className="sp-form2"><Field label="Primary contact" value={v.contact} onChange={set('contact')} /><Field label="Phone" value={v.phone} onChange={set('phone')} /><Field label="Email" value={v.email} onChange={set('email')} error={err.email} /><Field label="City" value={v.city} onChange={set('city')} />
        <Field label="Payment terms" value={v.terms} onChange={set('terms')} options={['Net 14', 'Net 30', 'Net 45', 'Cash on delivery']} /><Field label="Lead time (days)" type="number" value={v.leadDays} onChange={set('leadDays')} error={err.leadDays} /><Field label="Minimum order (KES)" type="number" value={v.minOrder} onChange={set('minOrder')} error={err.minOrder} /><Field label="Status" value={v.status} onChange={set('status')} options={['Active', 'On hold']} /></div>
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={save}>Save supplier</Btn></div>
    </>
  )
}

export function Suppliers() {
  const { business, openModal, can } = useStore()
  const inv = useInventory()
  const vat = Number(business.vat) || 16
  const [status, setStatus] = useState('All statuses')
  const [sel, setSel] = useState(inv.suppliers[0]?.id ?? '')
  const edit = can('Purchasing', 'Edit')
  const cur = inv.suppliers.find((s) => s.id === sel) ?? inv.suppliers[0]
  const rows = inv.suppliers.filter((s) => status === 'All statuses' || s.status === status)
  const mine = (s: Supplier) => inv.pos.filter((p) => p.supplierId === s.id)
  const onTime = (s: Supplier) => { const done = mine(s).filter((p) => p.status === 'Received' && p.receivedAt); return done.length ? Math.round((done.filter((p) => p.receivedAt! <= p.expected + DAY).length / done.length) * 100) : s.onTime }
  const cols: Column<Supplier>[] = [
    { key: 'n', header: 'Supplier', sort: (a, b) => a.name.localeCompare(b.name), render: (s) => <><button className="sp-link" onClick={() => setSel(s.id)}>{s.name}</button><span className="sp-sub">{s.city}</span></> },
    { key: 'l', header: 'Lead time', render: (s) => `${s.leadDays} days` },
    { key: 'o', header: 'Open POs', render: (s) => mine(s).filter(poOpen).length },
    { key: 't', header: 'On-time', render: (s) => `${onTime(s)}%` },
    { key: 'st', header: 'Status', render: (s) => <Badge tone={s.status === 'Active' ? 'green' : 'amber'}>{s.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="Suppliers list and detail" desc="Keep supplier contacts, terms and delivery performance in one place." actions={<Btn variant="primary" disabled={!can('Purchasing', 'Create')} onClick={() => openModal({ title: 'Add supplier', body: <SupplierForm />, noActions: true })}>+ Add supplier</Btn>} />
      <div className="sp-two" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(280px,1fr)' }}>
        <DataTable title={`${rows.length} suppliers`} rows={rows} rowKey={(s) => s.id} columns={cols} searchLabel="Search suppliers" searchText={(s) => `${s.name} ${s.contact} ${s.city}`}
          tools={<select className="sp-select auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option><option>Active</option><option>On hold</option></select>} actions={(s) => <Btn small onClick={() => setSel(s.id)}>View</Btn>} />
        {cur && (
          <Panel title={cur.name} sub={`Supplier detail · ${cur.city}`} right={<Badge tone={cur.status === 'Active' ? 'green' : 'amber'}>{cur.status}</Badge>}>
            <Detail label="Primary contact">{cur.contact || '—'}</Detail><Detail label="Email">{cur.email || '—'}</Detail><Detail label="Phone">{cur.phone || '—'}</Detail><Detail label="Payment terms">{cur.terms}</Detail><Detail label="Default lead time">{cur.leadDays} days</Detail><Detail label="Minimum order">{kes(cur.minOrder)}</Detail><Detail label="On-time delivery"><b style={{ color: 'var(--green)' }}>{onTime(cur)}%</b></Detail>
            <div className="sp-label" style={{ marginTop: 14 }}>Recent purchase orders</div>
            {mine(cur).slice(0, 4).map((p) => <div className="list-row" key={p.id}><button className="sp-link" onClick={() => navigate(`/purchasing/${p.id}`)}>{p.id} · {p.status}</button><b>{kes(poTotal(p, vat))}</b></div>)}
            {!mine(cur).length && <p className="panel-sub">No orders yet.</p>}
            <div className="sp-row sp-gap"><Btn small disabled={!edit} onClick={() => openModal({ title: `Edit ${cur.name}`, body: <SupplierForm s={cur} />, noActions: true })}>Edit supplier</Btn><Btn small disabled={!can('Purchasing', 'Create') || cur.status === 'On hold'} onClick={() => navigate('/purchasing/new')}>New order</Btn></div>
          </Panel>
        )}
      </div>
    </>
  )
}

