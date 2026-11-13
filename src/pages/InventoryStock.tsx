import { useState } from 'react'

import { Bars, Stats, Steps } from '../components/finance-ui'
import { Detail, NotFoundCard, useNow, when } from '../components/support-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, Stat, type Column } from '../components/ui'
import type { Product } from '../data/commerce'
import { countFinal, countState, MOVE_TYPES, poOpen, poTotal, type CountLine, type Location, type Move, type Movement, type MoveType } from '../data/inventory'
import { dateTime, kes } from '../lib/format'
import { useInventory } from '../lib/inventory'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'

const DAY = 86_400_000
const mvTone = (t: MoveType) => (t === 'Write-off' ? 'red' : t === 'PO receipt' || t === 'Return restock' || t === 'Opening stock' ? 'green' : t === 'Sale' ? 'gray' : 'blue')

// ---- overview ---------------------------------------------------------------------------------------------------

export function InventoryOverview() {
  const { products, categories, business } = useStore()
  const inv = useInventory()
  const now = useNow()
  const active = products.filter((p) => p.status === 'Active')
  const out = active.filter((p) => p.stock === 0)
  const open = inv.pos.filter(poOpen)
  const vat = Number(business.vat) || 16
  const incoming = open.reduce((n, p) => n + poTotal(p, vat), 0)
  const byCat = categories.map((c) => ({ c, v: products.filter((p) => p.category === c && p.status !== 'Archived').reduce((n, p) => n + p.stock * inv.meta(p).cost, 0) }))
  return (
    <>
      <PageHead title="Inventory overview" desc="Stock health and fulfilment readiness across your locations." actions={<><Btn onClick={() => { downloadCsv('inventory-report.csv', ['Product', 'SKU', 'On hand', 'Cost (KES)', 'Value (KES)'], products.map((p) => [p.name, p.sku, p.stock, inv.meta(p).cost, p.stock * inv.meta(p).cost])) }}>Export report</Btn><Btn variant="primary" onClick={() => navigate('/products/new')}>+ Add product</Btn></>} />
      <Stats>
        <Stat label="Stock value" value={kes(inv.stockValue)} trend="At cost, all locations" icon="▧" />
        <Stat label="Low-stock alerts" value={String(inv.alerts.length)} trend={`${inv.alerts.filter((a) => a.available === 0).length} out of stock at a location`} icon="!" up={inv.alerts.length === 0} />
        <Stat label="Out of stock" value={String(out.length)} trend={out.length ? out.map((p) => p.name).slice(0, 2).join(', ') : 'Nothing out'} icon="×" up={out.length === 0} />
        <Stat label="Incoming stock" value={kes(incoming)} trend={`${open.length} purchase orders · ${open.filter((p) => p.expected - now < 7 * DAY).length} due this week`} icon="↓" />
      </Stats>
      <div className="sp-two" style={{ gridTemplateColumns: 'minmax(0,1.45fr) minmax(260px,.9fr)' }}>
        <div className="sp-stack">
          <Panel title="Stock value by category" sub="At cost, all locations"><Bars values={byCat.map((x) => x.v)} labels={byCat.map((x) => x.c)} /></Panel>
          <Panel title="Low stock to review" sub="Products at or below their reorder point" right={<Btn small onClick={() => navigate('/inventory/alerts')}>View all</Btn>}>
            {inv.alerts.slice(0, 4).map((a) => <div className="list-row" key={a.product.id + a.location.id}><div><b style={{ fontSize: 11 }}>{a.product.name}</b><div className="panel-sub">{a.product.sku} · {a.location.name} · {a.available} left</div></div><Badge tone={a.available === 0 ? 'red' : 'amber'}>{a.available === 0 ? 'Out of stock' : 'Low stock'}</Badge></div>)}
            {!inv.alerts.length && <p className="panel-sub">Every product is above its reorder point.</p>}
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Location capacity" sub="Current use by location" right={<Btn small onClick={() => navigate('/inventory/levels')}>Details</Btn>}>
            {inv.locations.map((l) => { const used = inv.onHandAt(l.id); const pct = Math.min(100, Math.round((used / Math.max(1, l.capacity)) * 100)); return <div key={l.id} style={{ marginBottom: 12 }}><div className="sp-detail" style={{ border: 0, padding: '0 0 4px' }}><span style={{ color: 'var(--ink)' }}><b>{l.name}</b> · {l.city}</span><b>{pct}%</b></div><div className="progress"><i style={{ width: `${pct}%` }} /></div><div className="panel-sub">{used} of {l.capacity} units</div></div> })}
          </Panel>
          <Panel title="Incoming purchase orders" sub="Expected deliveries" right={<Btn small onClick={() => navigate('/purchasing')}>All POs</Btn>}>
            {open.slice(0, 4).map((p) => <div className="list-row" key={p.id}><div><b style={{ fontSize: 11 }}>{p.id} · {inv.suppliers.find((s) => s.id === p.supplierId)?.name}</b><div className="panel-sub">{dateTime(p.expected).replace(/, .*/, '')} · {p.lines.length} items</div></div><Badge tone={p.expected < now ? 'red' : 'blue'}>{p.expected < now ? 'Overdue' : p.status}</Badge></div>)}
            {!open.length && <p className="panel-sub">Nothing on the way.</p>}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- stock levels ------------------------------------------------------------------------------------------------

function LocationForm({ loc }: { loc?: Location }) {
  const inv = useInventory()
  const { closeModal, toast } = useStore()
  const [name, setName] = useState(loc?.name ?? '')
  const [city, setCity] = useState(loc?.city ?? '')
  const [cap, setCap] = useState(String(loc?.capacity ?? 300))
  const [active, setActive] = useState(loc?.active ?? true)
  const [err, setErr] = useState('')
  const save = () => {
    if (!name.trim()) return setErr('Name the location')
    if (inv.locations.some((l) => l.id !== loc?.id && l.name.toLowerCase() === name.trim().toLowerCase())) return setErr('Another location has that name')
    if (!(Number(cap) >= 1)) return setErr('Enter how many units it can hold')
    if (loc && !active && inv.onHandAt(loc.id) > 0) return setErr('This location still holds stock. Transfer it out before switching it off.')
    inv.saveLocation({ id: loc?.id, name: name.trim(), city: city.trim(), capacity: Number(cap), active })
    closeModal()
    toast('Location saved')
  }
  return (
    <>
      <Field label="Location name" value={name} onChange={(v) => { setName(v); setErr('') }} />
      <div className="sp-form2"><Field label="City" value={city} onChange={setCity} /><Field label="Capacity (units)" type="number" value={cap} onChange={setCap} /></div>
      <label className="sp-row" style={{ fontSize: 11, gap: 6, marginBottom: 8 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (stock can be received here)</label>
      {err && <div className="sp-err" role="alert">{err}</div>}
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={save}>Save location</Btn></div>
    </>
  )
}

interface Row { p: Product; loc: Location; onHand: number; reserved: number; avail: number; rp: number }

export function StockLevels() {
  const { products, categories, openModal, can, toast } = useStore()
  const inv = useInventory()
  const [loc, setLoc] = useState('All locations')
  const [cat, setCat] = useState('All categories')
  const [state, setState] = useState('All statuses')
  const edit = can('Inventory', 'Edit')
  const rows: Row[] = products.filter((p) => p.status !== 'Archived' && (cat === 'All categories' || p.category === cat)).flatMap((p) =>
    inv.locations.filter((l) => loc === 'All locations' || l.name === loc).map((l) => {
      const onHand = inv.levels[p.id]?.[l.id] ?? 0
      const reserved = l.id === inv.primary?.id ? inv.reserved(p.id) : 0
      return { p, loc: l, onHand, reserved, avail: Math.max(0, onHand - reserved), rp: inv.reorderAt(p.id, l.id) }
    }),
  ).filter((r) => state === 'All statuses' || (state === 'Out of stock' ? r.avail === 0 : state === 'Low stock' ? r.avail > 0 && r.avail <= r.rp : r.avail > r.rp))
  const cols: Column<Row>[] = [
    { key: 'p', header: 'Product / SKU', sort: (a, b) => a.p.name.localeCompare(b.p.name), render: (r) => <><b>{r.p.name}</b><span className="sp-sub">{r.p.sku}</span></> },
    { key: 'l', header: 'Location', render: (r) => r.loc.name },
    { key: 'h', header: 'On hand', sort: (a, b) => a.onHand - b.onHand, render: (r) => r.onHand },
    { key: 'r', header: 'Reserved', render: (r) => r.reserved },
    { key: 'a', header: 'Available', sort: (a, b) => a.avail - b.avail, render: (r) => <b style={{ color: r.avail === 0 ? 'var(--red)' : r.avail <= r.rp ? '#B45309' : undefined }}>{r.avail}</b> },
    { key: 'rp', header: 'Reorder point', render: (r) => r.rp },
    { key: 'v', header: 'Value (cost)', render: (r) => kes(r.onHand * inv.meta(r.p).cost) },
  ]
  return (
    <>
      <PageHead title="Stock levels by warehouse" desc="Compare on-hand, reserved and available stock at each location." actions={<><Btn disabled={!can('Inventory', 'Export')} onClick={() => { downloadCsv('stock-levels.csv', ['Product', 'SKU', 'Location', 'On hand', 'Reserved', 'Available', 'Reorder point'], rows.map((r) => [r.p.name, r.p.sku, r.loc.name, r.onHand, r.reserved, r.avail, r.rp])); toast('Stock levels exported') }}>Export</Btn><Btn variant="primary" disabled={!edit} onClick={() => navigate('/inventory/adjust')}>Adjust stock</Btn></>} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', marginBottom: 14 }}>
        {inv.locations.map((l) => { const used = inv.onHandAt(l.id); const pct = Math.min(100, Math.round((used / Math.max(1, l.capacity)) * 100)); return (
          <section className="card panel" key={l.id}>
            <div className="sp-row between"><div><b>{l.name}</b><div className="panel-sub">{l.city}</div></div><Badge tone={l.active ? 'green' : 'gray'}>{l.active ? 'Active' : 'Off'}</Badge></div>
            <div className="progress" style={{ margin: '10px 0' }}><i style={{ width: `${pct}%` }} /></div>
            <p className="panel-sub">{pct}% full · {used} of {l.capacity} units · {kes(products.reduce((n, p) => n + (inv.levels[p.id]?.[l.id] ?? 0) * inv.meta(p).cost, 0))} at cost</p>
            <Btn small disabled={!edit} onClick={() => openModal({ title: `Edit ${l.name}`, body: <LocationForm loc={l} />, noActions: true })}>Edit</Btn>
          </section>) })}
        <section className="card panel" style={{ display: 'grid', placeItems: 'center' }}><Btn disabled={!can('Inventory', 'Create')} onClick={() => openModal({ title: 'Add location', body: <LocationForm />, noActions: true })}>+ Add location</Btn></section>
      </div>
      <DataTable title={`${rows.length} stock records`} rows={rows} rowKey={(r) => `${r.p.id}|${r.loc.id}`} columns={cols} searchLabel="Search SKU or product" searchText={(r) => `${r.p.name} ${r.p.sku}`} pageSize={10}
        tools={<><select className="sp-select auto" aria-label="Location" value={loc} onChange={(e) => setLoc(e.target.value)}><option>All locations</option>{inv.locations.map((l) => <option key={l.id}>{l.name}</option>)}</select><select className="sp-select auto" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option>All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select><select className="sp-select auto" aria-label="Stock status" value={state} onChange={(e) => setState(e.target.value)}><option>All statuses</option><option>In stock</option><option>Low stock</option><option>Out of stock</option></select></>}
        actions={(r) => <Btn small disabled={!edit} onClick={() => navigate(`/inventory/adjust?product=${r.p.id}&loc=${r.loc.id}`)}>Adjust</Btn>} />
    </>
  )
}

// ---- stock adjustment -----------------------------------------------------------------------------------------------

const REASONS = ['Found during cycle count', 'Damaged or expired', 'Supplier correction', 'Internal transfer', 'Other']
const ADJ_TYPES = ['Increase stock', 'Decrease stock', 'Set exact count', 'Transfer to another location'] as const

export function StockAdjustment() {
  const { products, openModal, toast, can } = useStore()
  const inv = useInventory()
  const q = useQuery()
  const active = products.filter((p) => p.status !== 'Archived')
  const [pid, setPid] = useState(q.get('product') && active.some((p) => p.id === q.get('product')) ? q.get('product')! : active[0]?.id ?? '')
  const [loc, setLoc] = useState(q.get('loc') && inv.locations.some((l) => l.id === q.get('loc')) ? q.get('loc')! : inv.primary?.id ?? '')
  const [dest, setDest] = useState(inv.locations.find((l) => l.id !== loc)?.id ?? '')
  const [type, setType] = useState<(typeof ADJ_TYPES)[number]>('Increase stock')
  const [qty, setQty] = useState('1')
  const [reason, setReason] = useState(REASONS[0]!)
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const edit = can('Inventory', 'Edit')
  const p = products.find((x) => x.id === pid)
  const onHand = inv.levels[pid]?.[loc] ?? 0
  const n = Number(qty)
  const delta = type === 'Increase stock' ? n : type === 'Decrease stock' || type === 'Transfer to another location' ? -n : n - onHand
  const next = onHand + delta
  const recent = inv.movements.filter((m) => ['Adjustment', 'Transfer in', 'Transfer out', 'Write-off'].includes(m.type)).slice(0, 4)

  const review = () => {
    if (!p) return setErr('Choose a product.')
    if (!Number.isInteger(n) || n < (type === 'Set exact count' ? 0 : 1)) return setErr(type === 'Set exact count' ? 'Enter the counted quantity (0 or more).' : 'Enter a whole number of 1 or more.')
    if (next < 0) return setErr(`There are only ${onHand} on hand, so you can’t remove ${n}.`)
    if (type === 'Transfer to another location' && (dest === loc || !dest)) return setErr('Choose a different location to transfer to.')
    if (type === 'Set exact count' && delta === 0) return setErr('That is already the count on hand.')
    if (reason === 'Other' && notes.trim().length < 5) return setErr('Add a note explaining the change.')
    setErr('')
    const ref = type === 'Transfer to another location' ? `TR-${String(Date.now()).slice(-4)}` : `ADJ-${String(Date.now()).slice(-4)}`
    const kind: MoveType = reason === 'Damaged or expired' && delta < 0 ? 'Write-off' : 'Adjustment'
    const moves: Move[] = type === 'Transfer to another location'
      ? [{ productId: pid, locationId: loc, delta: -n, type: 'Transfer out', ref, note: notes.trim() }, { productId: pid, locationId: dest, delta: n, type: 'Transfer in', ref, note: notes.trim() }]
      : [{ productId: pid, locationId: loc, delta, type: kind, ref, note: `${reason}${notes.trim() ? ` · ${notes.trim()}` : ''}` }]
    openModal({
      title: 'Confirm stock adjustment?',
      message: type === 'Transfer to another location'
        ? `Move ${n} × ${p.name} from ${inv.locations.find((l) => l.id === loc)?.name} to ${inv.locations.find((l) => l.id === dest)?.name}. It is recorded in the movement history.`
        : `${delta > 0 ? 'Increase' : 'Decrease'} ${p.name} by ${Math.abs(delta)} unit${Math.abs(delta) === 1 ? '' : 's'} at ${inv.locations.find((l) => l.id === loc)?.name}. It is recorded in the movement history.`,
      confirm: 'Apply adjustment',
      onConfirm: () => { const e = inv.applyMoves(moves); if (e) setErr(e); else { toast('Adjustment recorded'); setNotes(''); setQty('1') } },
    })
  }
  if (!active.length) return <NotFoundCard what="Product" back="Back to stock" onBack={() => navigate('/stock')} />
  return (
    <>
      <PageHead title="Stock adjustment" desc="Record a controlled stock change with a reason and audit note." actions={<Btn onClick={() => navigate('/inventory/movements')}>View movement history</Btn>} />
      {!edit && <div style={{ marginBottom: 12 }}><Notice>Your role can see stock but not change it.</Notice></div>}
      <div className="sp-two">
        <Panel title="Adjustment details">
          <Field label="Product / SKU" value={pid} onChange={(v) => { setPid(v); setErr('') }} options={active.map((x) => ({ value: x.id, label: `${x.name} · ${x.sku}` }))} />
          <div className="sp-form2">
            <Field label="Location" value={loc} onChange={(v) => { setLoc(v); setErr('') }} options={inv.locations.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name }))} />
            <Field label="Currently on hand" value={`${onHand} units`} onChange={() => undefined} hint={loc === inv.primary?.id && inv.reserved(pid) ? `${inv.reserved(pid)} reserved for open orders` : undefined} />
            <Field label="Adjustment type" value={type} onChange={(v) => { setType(v as (typeof ADJ_TYPES)[number]); setErr('') }} options={ADJ_TYPES} />
            <Field label={type === 'Set exact count' ? 'Counted quantity' : 'Quantity'} type="number" value={qty} onChange={(v) => { setQty(v); setErr('') }} />
            {type === 'Transfer to another location' && <Field label="Transfer to" value={dest} onChange={setDest} options={inv.locations.filter((l) => l.active && l.id !== loc).map((l) => ({ value: l.id, label: l.name }))} />}
            <Field label="Reason" value={reason} onChange={(v) => { setReason(v); setErr('') }} options={REASONS} />
          </div>
          <Field label="Notes" multiline value={notes} onChange={(v) => { setNotes(v); setErr('') }} placeholder="Add context for the audit trail" />
          {err && <div className="sp-err" role="alert">{err}</div>}
          <div className="sp-row end sp-gap"><Btn onClick={() => { setQty('1'); setNotes(''); setErr('') }}>Cancel</Btn><Btn variant="primary" disabled={!edit} onClick={review}>Review adjustment</Btn></div>
        </Panel>
        <div className="sp-stack">
          <Panel title="Adjustment preview">
            <Detail label="Current on hand">{onHand} units</Detail>
            <Detail label="Change"><b style={{ color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>{Number.isFinite(delta) ? `${delta > 0 ? '+' : ''}${delta} units` : '—'}</b></Detail>
            <Detail label="New on hand">{Number.isFinite(next) ? `${next} units` : '—'}</Detail>
            <div style={{ marginTop: 10 }}><Notice>The change is timestamped and attributed to you.</Notice></div>
          </Panel>
          <Panel title="Recent adjustments">
            {recent.map((m) => <div className="list-row" key={m.id}><div><b style={{ fontSize: 11 }}>{products.find((x) => x.id === m.productId)?.name} <span style={{ color: m.qty >= 0 ? 'var(--green)' : 'var(--red)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</span></b><div className="panel-sub">{when(m.at)} · {m.note ?? m.type}</div></div></div>)}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- low stock ---------------------------------------------------------------------------------------------------------

export function LowStockAlerts() {
  const { products, can, toast } = useStore()
  const inv = useInventory()
  const now = useNow()
  const [rules, setRules] = useState(inv.alertRules)
  const [loc, setLoc] = useState('All locations')
  const edit = can('Inventory', 'Edit')
  const canOrder = can('Purchasing', 'Create')
  const rows = inv.alerts.filter((a) => loc === 'All locations' || a.location.name === loc)
  const openFor = (pid: string) => inv.pos.some((p) => ['Draft', 'Pending approval', 'Approved', 'In transit', 'Partially received'].includes(p.status) && p.lines.some((l) => l.productId === pid && l.received < l.qty))
  const key = (a: (typeof rows)[number]) => `${a.product.id}|${a.location.id}`
  const supplierOf = (p: Product) => inv.meta(p).supplierId

  const reorder = (keys: string[]) => {
    const picked = rows.filter((a) => keys.includes(key(a)))
    const groups = new Map<string, typeof picked>()
    for (const a of picked) { const k = `${supplierOf(a.product)}|${a.location.id}`; groups.set(k, [...(groups.get(k) ?? []), a]) }
    let made = 0
    for (const [k, list] of groups) {
      const [supplierId, locationId] = k.split('|') as [string, string]
      if (!supplierId) continue
      const s = inv.suppliers.find((x) => x.id === supplierId)
      const r = inv.savePO({ supplierId, locationId, expected: now + (s?.leadDays ?? inv.alertRules.leadDays) * DAY, shipping: 0, notes: 'Created from low-stock alerts', lines: list.map((a) => ({ productId: a.product.id, qty: a.suggested, cost: inv.meta(a.product).cost, received: 0, damaged: 0 })) }, false)
      if (r.id) made++
    }
    toast(made ? `${made} draft purchase order${made === 1 ? '' : 's'} created` : 'These products have no supplier set. Add one on the product.')
    if (made) navigate('/purchasing')
  }
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'p', header: 'Product / SKU', sort: (a, b) => a.product.name.localeCompare(b.product.name), render: (a) => <><b>{a.product.name}</b><span className="sp-sub">{a.product.sku}</span></> },
    { key: 'l', header: 'Location', render: (a) => a.location.name },
    { key: 'a', header: 'Available', sort: (a, b) => a.available - b.available, render: (a) => <b style={{ color: 'var(--red)' }}>{a.available}</b> },
    { key: 'r', header: 'Reorder point', render: (a) => <input type="number" min={0} className="sp-input" style={{ width: 70 }} aria-label={`Reorder point for ${a.product.name} at ${a.location.name}`} defaultValue={a.reorderAt} disabled={!edit} onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0 && v !== a.reorderAt) { inv.setReorder(a.product.id, a.location.id, v); toast('Reorder point saved') } }} /> },
    { key: 's', header: 'Suggested qty', render: (a) => a.suggested },
    { key: 'su', header: 'Supplier', render: (a) => inv.suppliers.find((s) => s.id === supplierOf(a.product))?.name ?? <span className="panel-sub">None set</span> },
    { key: 'st', header: 'Alert', render: (a) => <Badge tone={a.available === 0 ? 'red' : 'amber'}>{a.available === 0 ? 'Out of stock' : 'Low stock'}</Badge> },
    { key: 'o', header: 'On order', render: (a) => (openFor(a.product.id) ? <Badge tone="blue">On order</Badge> : '—') },
  ]
  const tracked = products.filter((p) => p.status === 'Active' && inv.meta(p).track)
  return (
    <>
      <PageHead title="Low-stock alerts and reorder settings" desc="Set reorder thresholds and turn stock alerts into replenishment." actions={<Btn variant="primary" disabled={!canOrder || !rows.length} onClick={() => reorder(rows.filter((a) => !openFor(a.product.id)).map(key))}>Create reorders ({rows.filter((a) => !openFor(a.product.id)).length})</Btn>} />
      <div className="sp-two" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', marginBottom: 14 }}>
        <Panel title="Alert rules" sub="How and when inventory alerts are created" right={<Badge tone="green">Enabled</Badge>}>
          <div className="sp-form2">
            <Field label="Alert when available stock reaches" value={rules.when} onChange={(v) => setRules({ ...rules, when: v as typeof rules.when })} options={['Reorder point', 'Below safety stock']} />
            <Field label="Email digest" value={rules.digest} onChange={(v) => setRules({ ...rules, digest: v })} options={['Daily at 8:00 AM', 'Weekly', 'Off']} />
            <Field label="Default supplier lead time (days)" type="number" value={String(rules.leadDays)} onChange={(v) => setRules({ ...rules, leadDays: Number(v) })} />
            <Field label="Safety buffer (%)" type="number" value={String(rules.bufferPct)} onChange={(v) => setRules({ ...rules, bufferPct: Number(v) })} />
          </div>
          <Btn small disabled={!edit} onClick={() => { if (!(rules.leadDays >= 0) || !(rules.bufferPct >= 0 && rules.bufferPct <= 100)) return toast('Check the lead time and buffer'); inv.setAlertRules(rules); toast('Alert rules saved') }}>Save settings</Btn>
        </Panel>
        <Panel title="Threshold health">
          <Detail label="Tracked products with a reorder point">{tracked.length} / {tracked.length}</Detail>
          <Detail label="Alerts right now">{inv.alerts.length}</Detail>
          <Detail label="Alerts with no order placed"><b style={{ color: 'var(--red)' }}>{inv.alerts.filter((a) => !openFor(a.product.id)).length}</b></Detail>
          <Detail label="Products with no supplier">{tracked.filter((p) => !inv.meta(p).supplierId).length}</Detail>
        </Panel>
      </div>
      <DataTable title={`${rows.length} alerts`} rows={rows} rowKey={key} columns={cols} searchLabel="Search low-stock products" searchText={(a) => `${a.product.name} ${a.product.sku}`}
        tools={<select className="sp-select auto" aria-label="Location" value={loc} onChange={(e) => setLoc(e.target.value)}><option>All locations</option>{inv.locations.map((l) => <option key={l.id}>{l.name}</option>)}</select>}
        bulk={{ label: 'Create PO for selected', onClick: (ids) => (canOrder ? reorder(ids) : toast('Your role can’t create purchase orders')) }}
        actions={(a) => <Btn small disabled={!canOrder} onClick={() => navigate(`/purchasing/new?product=${a.product.id}&loc=${a.location.id}&qty=${a.suggested}`)}>Reorder</Btn>} empty="Every product is above its reorder point." />
    </>
  )
}

// ---- movement history -------------------------------------------------------------------------------------------------------

export function MovementHistory() {
  const { products, can, toast } = useStore()
  const inv = useInventory()
  const now = useNow()
  const [type, setType] = useState('All movement types')
  const [loc, setLoc] = useState('All locations')
  const [day, setDay] = useState('')
  const rows = inv.movements.filter((m) => (type === 'All movement types' || m.type === type) && (loc === 'All locations' || inv.locations.find((l) => l.id === m.locationId)?.name === loc) && (!day || new Date(m.at).toLocaleDateString('en-CA') === day))
  const week = inv.movements.filter((m) => now - m.at < 7 * DAY)
  const name = (id: string) => products.find((p) => p.id === id)
  const cols: Column<Movement>[] = [
    { key: 'd', header: 'Date / time', sort: (a, b) => a.at - b.at, render: (m) => dateTime(m.at) },
    { key: 'p', header: 'Product / SKU', render: (m) => <><b>{name(m.productId)?.name ?? '—'}</b><span className="sp-sub">{name(m.productId)?.sku}</span></> },
    { key: 'l', header: 'Location', render: (m) => inv.locations.find((l) => l.id === m.locationId)?.name ?? '—' },
    { key: 't', header: 'Movement', render: (m) => <Badge tone={mvTone(m.type)}>{m.type}</Badge> },
    { key: 'q', header: 'Qty', sort: (a, b) => a.qty - b.qty, render: (m) => <b style={{ color: m.qty > 0 ? 'var(--green)' : undefined }}>{m.qty > 0 ? `+${m.qty}` : m.qty}</b> },
    { key: 'r', header: 'Reference', render: (m) => <>{m.ref}{m.note && <span className="sp-sub">{m.note}</span>}</> },
    { key: 'b', header: 'Staff', render: (m) => m.by },
    { key: 'ba', header: 'Balance', render: (m) => m.balance },
  ]
  return (
    <>
      <PageHead title="Stock movement history" desc="Auditable record of every inventory change by product and location." actions={<Btn disabled={!can('Inventory', 'Export')} onClick={() => { downloadCsv('stock-movements.csv', ['Date', 'Product', 'SKU', 'Location', 'Type', 'Qty', 'Reference', 'Staff', 'Balance'], rows.map((m) => [new Date(m.at).toISOString(), name(m.productId)?.name ?? '', name(m.productId)?.sku ?? '', inv.locations.find((l) => l.id === m.locationId)?.name ?? '', m.type, m.qty, m.ref, m.by, m.balance])); toast('Movements exported') }}>Export CSV</Btn>} />
      <Stats>
        <Stat label="Movements today" value={String(inv.movements.filter((m) => now - m.at < DAY).length)} trend="Across all locations" icon="⇄" />
        <Stat label="Stock received" value={`+${week.filter((m) => m.qty > 0 && ['PO receipt', 'Return restock', 'Opening stock', 'Transfer in'].includes(m.type)).reduce((n, m) => n + m.qty, 0)}`} trend="Units this week" icon="↓" />
        <Stat label="Stock removed" value={`−${Math.abs(week.filter((m) => m.qty < 0).reduce((n, m) => n + m.qty, 0))}`} trend="Sales, transfers and write-offs" icon="↑" />
        <Stat label="Adjustments" value={String(week.filter((m) => m.type === 'Adjustment').length)} trend="All attributed to staff" icon="±" />
      </Stats>
      <DataTable title={`${rows.length} records`} rows={rows} rowKey={(m) => m.id} columns={cols} searchLabel="Search SKU, reference or staff" searchText={(m) => `${name(m.productId)?.name} ${name(m.productId)?.sku} ${m.ref} ${m.by}`} pageSize={10}
        tools={<><select className="sp-select auto" aria-label="Movement type" value={type} onChange={(e) => setType(e.target.value)}><option>All movement types</option>{MOVE_TYPES.map((t) => <option key={t}>{t}</option>)}</select><select className="sp-select auto" aria-label="Location" value={loc} onChange={(e) => setLoc(e.target.value)}><option>All locations</option>{inv.locations.map((l) => <option key={l.id}>{l.name}</option>)}</select><input type="date" className="sp-input" style={{ width: 150 }} aria-label="Filter movements by date" value={day} onChange={(e) => setDay(e.target.value)} /></>} />
    </>
  )
}

// ---- cycle count -------------------------------------------------------------------------------------------------------------------

function StartCount() {
  const inv = useInventory()
  const { closeModal, toast } = useStore()
  const [loc, setLoc] = useState(inv.primary?.id ?? '')
  const [zone, setZone] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <Field label="Location" value={loc} onChange={setLoc} options={inv.locations.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name }))} />
      <Field label="Zone or aisle (optional)" value={zone} onChange={setZone} placeholder="For example Aisle 3" error={err} />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { const e = inv.startCount(loc, zone); if (e) return setErr(e); closeModal(); toast('Count started') }}>Start count</Btn></div>
    </>
  )
}

export function CycleCounts() {
  const { products, openModal, toast, can } = useStore()
  const inv = useInventory()
  const [sel, setSel] = useState('')
  const edit = can('Inventory', 'Edit')
  const c = inv.counts.find((x) => x.id === sel) ?? inv.counts.find((x) => x.status !== 'Reconciled') ?? inv.counts[0]
  if (!c) return <><PageHead title="Stock take / cycle count" desc="Count physical inventory and reconcile variances." actions={<Btn variant="primary" disabled={!edit} onClick={() => openModal({ title: 'Start a stock count', body: <StartCount />, noActions: true })}>Start a count</Btn>} /><Notice>No counts yet.</Notice></>
  const loc = inv.locations.find((l) => l.id === c.locationId)
  const counted = c.lines.filter((l) => l.c1 !== undefined).length
  const variances = c.lines.filter((l) => countState(l) === 'Variance').length
  const matched = c.lines.filter((l) => countState(l) === 'Matched').length
  const locked = c.status !== 'Counting' || !edit
  const num = (v: string) => (v.trim() === '' ? undefined : Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : undefined)
  const submit = () => openModal({ title: 'Submit cycle count?', message: 'Matched items are confirmed. Variances need approval from someone else before stock is adjusted.', confirm: 'Submit count', onConfirm: () => { const e = inv.submitCount(c.id); toast(e ?? 'Count submitted') } })
  const approve = () => openModal({ title: 'Approve and adjust stock?', message: `${variances} variance${variances === 1 ? '' : 's'} will be applied to stock at ${loc?.name}.`, confirm: 'Approve', onConfirm: () => { const e = inv.approveCount(c.id); toast(e ?? 'Stock adjusted to the counted quantities') } })
  const cols: Column<CountLine>[] = [
    { key: 'p', header: 'Product / SKU', render: (l) => { const p = products.find((x) => x.id === l.productId); return <><b>{p?.name}</b><span className="sp-sub">{p?.sku}</span></> } },
    { key: 'e', header: 'Expected', render: (l) => l.expected },
    { key: 'c1', header: 'Count 1', render: (l) => <input type="number" min={0} className="sp-input" style={{ width: 70 }} aria-label={`Count for ${products.find((x) => x.id === l.productId)?.name}`} value={l.c1 ?? ''} disabled={locked} onChange={(e) => inv.setCount(c.id, l.productId, 'c1', num(e.target.value))} /> },
    { key: 'c2', header: 'Count 2', render: (l) => <input type="number" min={0} className="sp-input" style={{ width: 70 }} aria-label={`Second count for ${products.find((x) => x.id === l.productId)?.name}`} placeholder="—" value={l.c2 ?? ''} disabled={locked || countState(l) === 'Matched' || l.c1 === undefined} onChange={(e) => inv.setCount(c.id, l.productId, 'c2', num(e.target.value))} /> },
    { key: 'v', header: 'Variance', render: (l) => { const f = countFinal(l); return f === undefined || f === l.expected ? '—' : <b style={{ color: 'var(--red)' }}>{f - l.expected > 0 ? '+' : ''}{f - l.expected}</b> } },
    { key: 's', header: 'Status', render: (l) => { const s = countState(l); return <Badge tone={s === 'Matched' ? 'green' : s === 'Not counted' ? 'gray' : 'amber'}>{s}</Badge> } },
  ]
  return (
    <>
      <PageHead title="Stock take / cycle count" desc="Count physical inventory and reconcile variances with an audit trail." actions={<><select className="sp-select auto" aria-label="Choose a count" value={c.id} onChange={(e) => setSel(e.target.value)}>{inv.counts.map((x) => <option key={x.id} value={x.id}>{x.id} · {inv.locations.find((l) => l.id === x.locationId)?.name} · {x.status}</option>)}</select><Btn disabled={!edit} onClick={() => openModal({ title: 'Start a stock count', body: <StartCount />, noActions: true })}>New count</Btn>
        {c.status === 'Counting' && <Btn variant="primary" disabled={!edit} onClick={submit}>Submit count</Btn>}{c.status === 'Pending approval' && <Btn variant="primary" disabled={!edit} onClick={approve}>Approve adjustments</Btn>}</>} />
      <Steps steps={[{ label: 'Select location', done: true }, { label: 'Count products', done: c.status !== 'Counting' }, { label: 'Review variance', done: c.status === 'Reconciled' || (c.status === 'Pending approval') }, { label: 'Reconcile', done: c.status === 'Reconciled' }]} />
      <div className="sp-two" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', marginBottom: 14 }}>
        <Panel title={`Cycle count ${c.id}`} right={<Badge tone={c.status === 'Reconciled' ? 'green' : c.status === 'Pending approval' ? 'amber' : 'blue'}>{c.status}</Badge>}>
          <Detail label="Location">{loc?.name}</Detail><Detail label="Zone">{c.zone}</Detail><Detail label="Count owner">{c.owner}</Detail><Detail label="Started">{when(c.startedAt)}</Detail>{c.approvedBy && <Detail label="Approved by">{c.approvedBy}</Detail>}
        </Panel>
        <Panel title="Count progress" sub={`${counted} of ${c.lines.length} products counted`}>
          <div className="fin-total">{Math.round((counted / Math.max(1, c.lines.length)) * 100)}%</div>
          <div className="progress" style={{ margin: '10px 0' }}><i style={{ width: `${(counted / Math.max(1, c.lines.length)) * 100}%` }} /></div>
          <div className="panel-sub">{variances} variances · {matched} matched</div>
        </Panel>
      </div>
      <DataTable title="Count list" rows={c.lines} rowKey={(l) => l.productId} columns={cols} searchLabel="Search count list" searchText={(l) => products.find((p) => p.id === l.productId)?.name ?? ''} pageSize={20}
        actions={undefined} tools={<Btn small onClick={() => { downloadCsv(`${c.id}.csv`, ['Product', 'Expected', 'Count 1', 'Count 2'], c.lines.map((l) => [products.find((p) => p.id === l.productId)?.name ?? '', l.expected, l.c1 ?? '', l.c2 ?? ''])); toast('Count sheet exported') }}>Export count sheet</Btn>} />
    </>
  )
}

// ---- labels --------------------------------------------------------------------------------------------------------------------------

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
/** The bars of an EAN-13 barcode, as a string of 1s (bar) and 0s (space). */
export function eanBits(code: string): string {
  if (!/^\d{13}$/.test(code)) return ''
  const d = code.split('').map(Number)
  const par = PARITY[d[0]!]!
  let bits = '101'
  for (let i = 1; i <= 6; i++) bits += par[i - 1] === 'L' ? L[d[i]!] : G[d[i]!]
  bits += '01010'
  for (let i = 7; i <= 12; i++) bits += R[d[i]!]
  return bits + '101'
}

function Barcode({ code }: { code: string }) {
  const bits = eanBits(code)
  return (
    <svg viewBox={`0 0 ${bits.length + 14} 40`} width="100%" height="34" role="img" aria-label={`Barcode ${code}`} preserveAspectRatio="none">
      <rect width="100%" height="100%" fill="#fff" />
      {[...bits].map((b, i) => (b === '1' ? <rect key={i} x={i + 7} y={2} width={1} height={36} fill="#000" /> : null))}
    </svg>
  )
}

export function BarcodeLabels() {
  const { products, categories, toast } = useStore()
  const inv = useInventory()
  const [cat, setCat] = useState('All categories')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [copies, setCopies] = useState<Record<string, number>>({})
  const [size, setSize] = useState('50 × 30 mm · Product')
  const [price, setPrice] = useState(true)
  const [sku, setSku] = useState(true)
  const rows = products.filter((p) => p.status !== 'Archived' && (cat === 'All categories' || p.category === cat))
  const chosen = rows.filter((p) => picked.has(p.id))
  const total = chosen.reduce((n, p) => n + (copies[p.id] ?? 1), 0)
  const first = chosen[0] ?? rows[0]
  const toggle = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })
  const label = (p: Product, k?: number) => (
    <div className="label-card" key={`${p.id}-${k ?? 0}`} style={{ width: size.startsWith('100') ? 220 : 160 }}>
      <b>{p.name}</b>
      <div className="panel-sub">{inv.brands.find((b) => b.id === inv.meta(p).brandId)?.name ?? ''} · {p.category}</div>
      <Barcode code={inv.meta(p).barcode} />
      <div className="sp-row between" style={{ fontSize: 9 }}><span>{sku ? p.sku : inv.meta(p).barcode}</span>{price && <b>{kes(p.price)}</b>}</div>
    </div>
  )
  return (
    <>
      <PageHead title="Barcode and label printing" desc="Generate shelf and product labels from inventory records." actions={<Btn variant="primary" disabled={!total} onClick={() => { toast(`${total} label${total === 1 ? '' : 's'} sent to the print dialog`); window.print() }}>Print labels ({total})</Btn>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Choose products" right={<div className="sp-row"><select className="sp-select auto" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option>All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select><Btn small onClick={() => setPicked(new Set(rows.map((p) => p.id)))}>Select all</Btn><Btn small onClick={() => setPicked(new Set())}>Clear</Btn></div>}>
            <div className="table-wrap"><table><thead><tr><th /><th>Product / SKU</th><th>Barcode</th><th>Price</th><th>Labels</th></tr></thead>
              <tbody>{rows.map((p) => <tr key={p.id}><td><input type="checkbox" className="table-check" checked={picked.has(p.id)} aria-label={`Select ${p.name}`} onChange={(e) => toggle(p.id, e.target.checked)} /></td><td><b>{p.name}</b><span className="sp-sub">{p.sku}</span></td><td><code>{inv.meta(p).barcode}</code></td><td>{kes(p.price)}</td><td><input type="number" min={0} className="sp-input" style={{ width: 62 }} aria-label={`Number of labels for ${p.name}`} value={copies[p.id] ?? 1} onChange={(e) => setCopies({ ...copies, [p.id]: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} /></td></tr>)}</tbody></table></div>
          </Panel>
          <Panel title="Print settings">
            <div className="sp-form2"><Field label="Label size" value={size} onChange={setSize} options={['50 × 30 mm · Product', '100 × 50 mm · Shelf']} /><Field label="Show price" value={price ? 'Yes' : 'No'} onChange={(v) => setPrice(v === 'Yes')} options={['Yes', 'No']} /><Field label="Show SKU (otherwise barcode number)" value={sku ? 'Yes' : 'No'} onChange={(v) => setSku(v === 'Yes')} options={['Yes', 'No']} /></div>
          </Panel>
        </div>
        <Panel title="Label preview" sub={size} right={<Badge>{`${total} label${total === 1 ? '' : 's'}`}</Badge>}>
          {first ? label(first) : <p className="panel-sub">Nothing to preview.</p>}
          <p className="panel-sub" style={{ marginTop: 10 }}>The preview follows the first selected product. Barcodes are real EAN-13 codes made from each product’s barcode number.</p>
        </Panel>
      </div>
      <div className="label-sheet" aria-hidden="true">{chosen.flatMap((p) => Array.from({ length: copies[p.id] ?? 1 }, (_, k) => label(p, k)))}</div>
    </>
  )
}
