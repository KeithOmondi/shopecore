import { useCallback, useEffect, useRef, useState } from 'react'

import { Stats } from '../components/finance-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, get, post, put } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'
import type { ApiProduct, Location } from './Products'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100

/** Loads one thing from the server; `reload` fetches it again after a change. */
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
const useLocations = () => useGet<{ items: Location[] }>('/v1/admin/locations')

// ---- overview -------------------------------------------------------------------------------------------------------

interface Overview { units: number; valueCents: number; outOfStock: number; lowStock: number; activeProducts: number; movementsThisWeek: number; locations: { id: string; name: string; capacity: number; units: number; usedPct: number | null }[] }

export function InventoryOverview() {
  const { data: o, failed, reload } = useGet<Overview>('/v1/admin/stock/overview')
  if (failed && !o) return <><PageHead title="Stock overview" desc="We couldn’t load the stock." actions={<Btn onClick={reload}>Try again</Btn>} /></>
  return (
    <>
      <PageHead title="Stock overview" desc="What you hold, where it is, and what needs attention." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <Stats>
        <Stat label="Units on hand" value={o ? o.units.toLocaleString('en-US') : '—'} trend={`${o?.activeProducts ?? 0} active products`} icon="▤" />
        <Stat label="Stock value" value={o ? kes(shillings(o.valueCents)) : '—'} trend="At cost" icon="◈" />
        <Stat label="Low stock" value={String(o?.lowStock ?? '—')} trend="At or below reorder level" icon="◷" up={(o?.lowStock ?? 0) === 0} />
        <Stat label="Out of stock" value={String(o?.outOfStock ?? '—')} trend="Can’t be sold" icon="!" up={(o?.outOfStock ?? 0) === 0} />
      </Stats>
      <div className="sp-two">
        <Panel title="Locations" sub="Units held and how full each place is">
          {o?.locations.length === 0 && <div className="panel-sub">No locations yet.</div>}
          {o?.locations.map((l) => (
            <SettingRow key={l.id} title={l.name} sub={l.capacity ? `${l.units.toLocaleString('en-US')} of ${l.capacity.toLocaleString('en-US')} units` : `${l.units.toLocaleString('en-US')} units`} right={<Badge tone={(l.usedPct ?? 0) > 90 ? 'red' : (l.usedPct ?? 0) > 70 ? 'amber' : 'green'}>{l.usedPct === null ? 'No limit' : `${l.usedPct}% full`}</Badge>} />
          ))}
        </Panel>
        <Panel title="This week">
          <SettingRow title="Stock movements" sub="Sales, receipts, adjustments and transfers" right={<b>{o?.movementsThisWeek ?? '—'}</b>} />
          <div style={{ marginTop: 10 }} className="sp-row">
            <Btn onClick={() => navigate('/inventory/alerts')}>Low stock alerts</Btn>
            <Btn onClick={() => navigate('/inventory/movements')}>Movement history</Btn>
          </div>
        </Panel>
      </div>
    </>
  )
}

// ---- levels ---------------------------------------------------------------------------------------------------------

interface Level { productId: string; sku: string; name: string; status: string; reorderAt: number; costCents: number; priceCents: number; available: number; reserved: number; onHand: number; locations: { locationId: string; onHand: number }[] }

export function StockLevels() {
  const { toast } = useStore()
  const locs = useLocations().data?.items ?? []
  const [loc, setLoc] = useState('')
  const [rows, setRows] = useState<Level[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [tick, setTick] = useState(0)
  const seq = useRef(0)
  useEffect(() => {
    const mine = ++seq.current
    void get<{ items: Level[]; nextCursor: string | null }>(`/v1/admin/stock/levels?limit=200${loc ? `&locationId=${loc}` : ''}`).then(
      (r) => { if (mine === seq.current) { setRows(r.items); setNext(r.nextCursor); setState('ready') } },
      () => { if (mine === seq.current) setState((c) => (c === 'ready' ? c : 'error')) })
  }, [loc, tick])
  const more = async () => { if (next) try { const r = await get<{ items: Level[]; nextCursor: string | null }>(`/v1/admin/stock/levels?limit=200&cursor=${encodeURIComponent(next)}${loc ? `&locationId=${loc}` : ''}`); setRows((x) => [...x, ...r.items]); setNext(r.nextCursor) } catch (e) { toast(says(e)) } }
  const at = (l: Level, id: string) => l.locations.find((x) => x.locationId === id)?.onHand ?? 0
  const cols: Column<Level>[] = [
    { key: 'p', header: 'Product', sort: (a, b) => a.name.localeCompare(b.name), render: (l) => <div><b>{l.name}</b><div className="subtext">{l.sku}</div></div> },
    ...(loc ? [] : locs.filter((l) => l.active).map((l) => ({ key: l.id, header: l.name, render: (r: Level) => at(r, l.id) }))),
    { key: 'a', header: 'Available', sort: (a, b) => a.available - b.available, render: (l) => (l.available === 0 ? <Badge tone="red">0</Badge> : l.available <= l.reorderAt ? <Badge tone="amber">{String(l.available)}</Badge> : l.available) },
    { key: 'r', header: 'Reserved', render: (l) => l.reserved },
    { key: 'v', header: 'Value at cost', sort: (a, b) => a.onHand * a.costCents - b.onHand * b.costCents, render: (l) => kes(shillings(l.onHand * l.costCents)) },
  ]
  return (
    <>
      <PageHead title="Stock levels" desc="Units held for every product, by location." actions={<><Btn onClick={() => setTick((n) => n + 1)}>Refresh</Btn><Btn disabled={!rows.length} onClick={() => { downloadCsv('stock-levels.csv', ['SKU', 'Product', 'Available', 'Reserved', 'On hand', 'Cost (KES)'], rows.map((l) => [l.sku, l.name, l.available, l.reserved, l.onHand, shillings(l.costCents)])); toast('Stock levels exported') }}>Export</Btn></>} />
      <DataTable title="Stock by product" rows={rows} rowKey={(l) => l.productId} columns={cols} loading={state === 'loading'} error={state === 'error' ? 'We couldn’t load stock levels.' : undefined} onRetry={() => { setState('loading'); setTick((n) => n + 1) }}
        searchLabel="Search products" searchText={(l) => `${l.name} ${l.sku}`} emptyTitle="No stock yet" empty="Add products to see their stock here."
        tools={<select className="select" aria-label="Location" value={loc} onChange={(e) => { setState('loading'); setLoc(e.target.value) }}><option value="">All locations</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>} />
      {next && <div style={{ textAlign: 'center', margin: '12px 0' }}><Btn onClick={() => void more()}>Load more</Btn></div>}
    </>
  )
}

// ---- low stock ------------------------------------------------------------------------------------------------------

interface Alerts { rules: { when: string; digest: string; leadDays: number; bufferPct: number }; items: { productId: string; sku: string; name: string; available: number; reorderAt: number; severity: 'out' | 'low'; supplier: string | null; supplierId: string | null; costCents: number; sold30: number; suggestedQty: number }[] }

export function LowStockAlerts() {
  const { can } = useStore()
  const { data, failed, loading, reload } = useGet<Alerts>('/v1/admin/stock/alerts')
  const items = data?.items ?? []
  type A = Alerts['items'][number]
  const cols: Column<A>[] = [
    { key: 'p', header: 'Product', render: (a) => <div><b>{a.name}</b><div className="subtext">{a.sku}</div></div> },
    { key: 's', header: 'Status', render: (a) => <Badge tone={a.severity === 'out' ? 'red' : 'amber'}>{a.severity === 'out' ? 'Out of stock' : 'Low'}</Badge> },
    { key: 'a', header: 'Available', sort: (a, b) => a.available - b.available, render: (a) => a.available },
    { key: 'r', header: 'Reorder at', render: (a) => a.reorderAt },
    { key: 'sold', header: 'Sold (30d)', render: (a) => a.sold30 },
    { key: 'sup', header: 'Supplier', render: (a) => a.supplier ?? '—' },
    { key: 'q', header: 'Suggested order', render: (a) => <b>{a.suggestedQty}</b> },
  ]
  return (
    <>
      <PageHead title="Low stock alerts" desc="Products at or below their reorder level." actions={<Btn onClick={reload}>Refresh</Btn>} />
      {data && <Notice mark="i">Alert rule: {data.rules.when.toLowerCase()}. Suggested quantities cover {data.rules.leadDays} days of sales plus {data.rules.bufferPct}%.</Notice>}
      <div style={{ marginTop: 12 }}>
        <DataTable title={`${items.length} products need attention`} rows={items} rowKey={(a) => a.productId} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the alerts.' : undefined} onRetry={reload}
          searchLabel="Search alerts" searchText={(a) => `${a.name} ${a.sku} ${a.supplier ?? ''}`} emptyTitle="Nothing is running low" empty="Every tracked product is above its reorder level."
          actions={(a) => <div className="sp-row"><Btn small disabled={!can('Inventory', 'Edit')} onClick={() => navigate(`/inventory/adjust?product=${a.productId}`)}>Adjust</Btn><Btn small disabled={!can('Purchasing', 'Create')} onClick={() => navigate('/purchasing/new')}>Reorder</Btn></div>} />
      </div>
    </>
  )
}

// ---- adjust / transfer ----------------------------------------------------------------------------------------------

export function StockAdjustment() {
  const { toast, can } = useStore()
  const q = useQuery()
  const locs = (useLocations().data?.items ?? []).filter((l) => l.active)
  const [productId, setProductId] = useState(q.get('product') ?? '')
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<ApiProduct[]>([])
  const [mode, setMode] = useState<'adjust' | 'transfer'>('adjust')
  const [locationId, setLocationId] = useState('')
  const [toId, setToId] = useState('')
  const [qty, setQty] = useState('')
  const [type, setType] = useState('Adjustment')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [snap, setSnap] = useState<{ available: number; levels: { locationId: string; onHand: number }[] } | null>(null)
  const product = useGet<ApiProduct>(productId ? `/v1/admin/products/${productId}` : null)
  const loc = locationId || locs[0]?.id || ''

  useEffect(() => {
    if (search.trim().length < 2) return
    let live = true
    const t = setTimeout(() => { void get<{ items: ApiProduct[] }>(`/v1/admin/products?limit=8&q=${encodeURIComponent(search.trim())}`).then((r) => { if (live) setFound(r.items) }, () => undefined) }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [search])

  const submit = async () => {
    const e: Record<string, string> = {}
    const n = Number(qty)
    if (!productId) e.product = 'Choose a product'
    if (!Number.isInteger(n) || n === 0 || (mode === 'transfer' && n < 0)) e.qty = mode === 'transfer' ? 'Enter a whole number above 0' : 'Enter a whole number (use − to remove stock)'
    if (reason.trim().length < 3 && mode === 'adjust') e.reason = 'Give a short reason'
    if (mode === 'transfer' && (!toId || toId === loc)) e.to = 'Choose a different location'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const r = mode === 'adjust'
        ? await post<{ available: number; levels: { locationId: string; onHand: number }[] }>('/v1/admin/stock/adjust', { productId, locationId: loc, delta: n, type, reason: reason.trim() })
        : await post<{ available: number; levels: { locationId: string; onHand: number }[] }>('/v1/admin/stock/transfer', { productId, fromLocationId: loc, toLocationId: toId, qty: n, note: reason.trim() })
      setSnap(r)
      setQty('')
      setReason('')
      toast(mode === 'adjust' ? 'Stock adjusted' : 'Stock moved')
    } catch (err) { setErrors({ form: says(err) }) } finally { setBusy(false) }
  }

  const levels = snap?.levels ?? product.data?.levels?.map((l) => ({ locationId: l.locationId, onHand: l.onHand })) ?? []
  return (
    <>
      <PageHead title="Stock adjustment" desc="Correct stock after a count, record damage, or move units between locations." />
      {!can('Inventory', 'Edit') && <Notice tone="warning" mark="!">Your role can view stock but not change it.</Notice>}
      {errors.form && <Notice tone="error" mark="!">{errors.form}</Notice>}
      <div className="sp-two" style={{ marginTop: 12 }}>
        <Panel title={mode === 'adjust' ? 'Adjust stock' : 'Transfer stock'}>
          <Field label="Action" value={mode} onChange={(v) => { setMode(v as typeof mode); setErrors({}) }} options={[{ value: 'adjust', label: 'Add or remove stock' }, { value: 'transfer', label: 'Move between locations' }]} />
          <Field label="Find a product" value={search} onChange={setSearch} placeholder="Type a name, SKU or barcode" error={errors.product} />
          {found.length > 0 && search.trim().length >= 2 && (
            <div className="sp-row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
              {found.map((p) => <button key={p.id} className="pill" onClick={() => { setProductId(p.id); setSnap(null); setSearch(''); setFound([]) }}>{p.name} · {p.sku}</button>)}
            </div>
          )}
          {product.data && <Notice mark="i">{product.data.name} ({product.data.sku}) · {product.data.available} available, {product.data.reserved} reserved</Notice>}
          <div className="sp-form2">
            <Field label={mode === 'adjust' ? 'Location' : 'From'} value={loc} onChange={setLocationId} options={locs.map((l) => ({ value: l.id, label: l.name }))} />
            {mode === 'transfer' && <Field label="To" value={toId} onChange={setToId} error={errors.to} options={[{ value: '', label: 'Choose…' }, ...locs.filter((l) => l.id !== loc).map((l) => ({ value: l.id, label: l.name }))]} />}
            <Field label={mode === 'adjust' ? 'Change (+ adds, − removes)' : 'Quantity'} value={qty} onChange={setQty} error={errors.qty} placeholder={mode === 'adjust' ? 'e.g. -3 or 20' : 'e.g. 10'} />
            {mode === 'adjust' && <Field label="Type" value={type} onChange={setType} options={['Adjustment', 'Write-off', 'Count correction']} />}
          </div>
          <Field label={mode === 'adjust' ? 'Reason' : 'Note (optional)'} value={reason} onChange={setReason} error={errors.reason} />
          <div className="sp-row end"><Btn variant="primary" disabled={!can('Inventory', 'Edit') || busy} onClick={() => void submit()}>{busy ? 'Saving…' : mode === 'adjust' ? 'Save adjustment' : 'Move stock'}</Btn></div>
        </Panel>
        <Panel title="Stock after your change" sub="Units at each location">
          {levels.length === 0 && <div className="panel-sub">Choose a product to see where it is held.</div>}
          {levels.map((l) => <SettingRow key={l.locationId} title={locs.find((x) => x.id === l.locationId)?.name ?? 'Location'} right={<b>{l.onHand}</b>} />)}
        </Panel>
      </div>
    </>
  )
}

// ---- movement history -----------------------------------------------------------------------------------------------

interface Movement { id: string; sku: string; product: string; location: string; type: string; qty: number; balance: number; ref: string; note: string; by: string; at: string }

export function MovementHistory() {
  const { toast } = useStore()
  const [type, setType] = useState('')
  const [rows, setRows] = useState<Movement[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const seq = useRef(0)
  const url = (cursor?: string) => `/v1/admin/stock/movements?limit=100${type ? `&type=${encodeURIComponent(type)}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  useEffect(() => {
    const mine = ++seq.current
    void get<{ items: Movement[]; nextCursor: string | null }>(url()).then((r) => { if (mine === seq.current) { setRows(r.items); setNext(r.nextCursor); setState('ready') } }, () => { if (mine === seq.current) setState('error') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])
  const cols: Column<Movement>[] = [
    { key: 'at', header: 'When', render: (m) => dateTime(Date.parse(m.at)) },
    { key: 'p', header: 'Product', render: (m) => <div><b>{m.product}</b><div className="subtext">{m.sku}</div></div> },
    { key: 't', header: 'Type', render: (m) => <Badge tone={m.qty < 0 ? 'amber' : 'green'}>{m.type}</Badge> },
    { key: 'l', header: 'Location', render: (m) => m.location },
    { key: 'q', header: 'Change', sort: (a, b) => a.qty - b.qty, render: (m) => <b style={{ color: m.qty < 0 ? 'var(--red)' : 'var(--green)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</b> },
    { key: 'b', header: 'Balance', render: (m) => m.balance },
    { key: 'r', header: 'Reference', render: (m) => m.ref || m.note || '—' },
    { key: 'by', header: 'By', render: (m) => m.by },
  ]
  return (
    <>
      <PageHead title="Movement history" desc="Every change to stock, newest first." actions={<Btn disabled={!rows.length} onClick={() => { downloadCsv('stock-movements.csv', ['When', 'SKU', 'Product', 'Type', 'Location', 'Change', 'Balance', 'Reference', 'By'], rows.map((m) => [m.at, m.sku, m.product, m.type, m.location, m.qty, m.balance, m.ref, m.by])); toast('Movements exported') }}>Export</Btn>} />
      <DataTable title="Movements" rows={rows} rowKey={(m) => m.id} columns={cols} loading={state === 'loading'} error={state === 'error' ? 'We couldn’t load the movements.' : undefined} searchLabel="Search movements" searchText={(m) => `${m.product} ${m.sku} ${m.ref} ${m.by}`} emptyTitle="No movements yet" empty="Stock changes appear here."
        tools={<select className="select" aria-label="Type" value={type} onChange={(e) => { setState('loading'); setType(e.target.value) }}><option value="">All types</option>{['Sale', 'Receipt', 'Adjustment', 'Write-off', 'Count correction', 'Transfer in', 'Transfer out', 'Return restock', 'Opening'].map((t) => <option key={t}>{t}</option>)}</select>} />
      {next && <div style={{ textAlign: 'center', margin: '12px 0' }}><Btn onClick={() => { void get<{ items: Movement[]; nextCursor: string | null }>(url(next)).then((r) => { setRows((x) => [...x, ...r.items]); setNext(r.nextCursor) }, (e) => toast(says(e))) }}>Load older</Btn></div>}
    </>
  )
}

// ---- cycle counts ---------------------------------------------------------------------------------------------------

interface CountSummary { id: string; number: string; location: string; zone: string; owner: string; status: string; startedAt: string; lines: number; counted: number; variances: number }
interface CountDetail { id: string; number: string; location: string; zone: string; owner: string; status: string; lines: { productId: string; sku: string; name: string; expected: number; c1: number | null; c2: number | null; state: string }[] }
const COUNT_STATUS: Record<string, string> = { counting: 'Counting', pending_approval: 'Waiting for approval', reconciled: 'Reconciled' }

export function CycleCounts() {
  const { toast, can } = useStore()
  const locs = (useLocations().data?.items ?? []).filter((l) => l.active)
  const list = useGet<{ items: CountSummary[] }>('/v1/admin/stock-counts')
  const [openId, setOpenId] = useState<string | null>(null)
  const detail = useGet<CountDetail>(openId ? `/v1/admin/stock-counts/${openId}` : null)
  const [loc, setLoc] = useState('')
  const [zone, setZone] = useState('')
  const [busy, setBusy] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})

  const start = async () => {
    setBusy(true)
    try { const c = await post<{ id: string }>('/v1/admin/stock-counts', { locationId: loc || locs[0]?.id, zone: zone.trim() || 'Whole location' }); list.reload(); setOpenId(c.id); toast('Count started') } catch (e) { toast(says(e)) } finally { setBusy(false) }
  }
  const enter = async (productId: string, which: 'c1' | 'c2') => {
    const raw = edits[`${productId}:${which}`]
    if (raw === undefined) return
    const value = raw === '' ? null : Number(raw)
    if (value !== null && (!Number.isInteger(value) || value < 0)) return toast('Enter a whole number, 0 or more')
    try { await post(`/v1/admin/stock-counts/${openId}/entries`, { productId, which, value }); setEdits((x) => { const { [`${productId}:${which}`]: _g, ...rest } = x; return rest }); detail.reload() } catch (e) { toast(says(e)) }
  }
  const act = async (what: 'submit' | 'approve') => {
    try { await post(`/v1/admin/stock-counts/${openId}/${what}`); toast(what === 'submit' ? 'Count submitted' : 'Count approved and stock corrected'); detail.reload(); list.reload() } catch (e) { toast(says(e)) }
  }
  const d = detail.data

  return (
    <>
      <PageHead title="Cycle counts" desc="Count what is on the shelf, compare it with the system, and correct the difference." />
      <div className="sp-two">
        <Panel title="Counts">
          {list.loading && <div className="panel-sub">Loading…</div>}
          {list.data?.items.length === 0 && <div className="panel-sub">No counts yet. Start one on the right.</div>}
          {list.data?.items.map((c) => (
            <div className="list-row" key={c.id}>
              <div><button className="sp-link" onClick={() => { setOpenId(c.id); setEdits({}) }}>{c.number}</button><div className="panel-sub">{c.location} · {c.zone} · {c.counted}/{c.lines} counted{c.variances ? ` · ${c.variances} differences` : ''}</div></div>
              <Badge tone={c.status === 'reconciled' ? 'green' : c.status === 'pending_approval' ? 'amber' : 'blue'}>{COUNT_STATUS[c.status] ?? c.status}</Badge>
            </div>
          ))}
        </Panel>
        <Panel title="Start a count">
          <Field label="Location" value={loc || locs[0]?.id || ''} onChange={setLoc} options={locs.map((l) => ({ value: l.id, label: l.name }))} />
          <Field label="Zone (optional)" value={zone} onChange={setZone} placeholder="e.g. Aisle 3" />
          <div className="sp-row end"><Btn variant="primary" disabled={!can('Inventory', 'Edit') || busy || !locs.length} onClick={() => void start()}>Start count</Btn></div>
        </Panel>
      </div>
      {d && (
        <div style={{ marginTop: 14 }}>
          <Panel title={`${d.number} · ${d.location}`} sub={`${d.zone} · run by ${d.owner}`} right={<Badge tone={d.status === 'reconciled' ? 'green' : 'blue'}>{COUNT_STATUS[d.status] ?? d.status}</Badge>}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th>System</th><th>Count 1</th><th>Count 2</th><th>Result</th></tr></thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.productId}>
                      <td><b>{l.name}</b><div className="subtext">{l.sku}</div></td>
                      <td>{l.expected}</td>
                      {(['c1', 'c2'] as const).map((w) => (
                        <td key={w}>
                          {d.status === 'counting' ? (
                            <input className="qty" aria-label={`${w === 'c1' ? 'Count 1' : 'Count 2'} for ${l.name}`} value={edits[`${l.productId}:${w}`] ?? (l[w] ?? '')} disabled={w === 'c2' && l.c1 === null}
                              onChange={(e) => setEdits((x) => ({ ...x, [`${l.productId}:${w}`]: e.target.value }))} onBlur={() => void enter(l.productId, w)} />
                          ) : (l[w] ?? '—')}
                        </td>
                      ))}
                      <td><Badge tone={l.state === 'match' || l.state === 'confirmed' ? 'green' : l.state === 'not_counted' ? 'gray' : 'amber'}>{l.state.replace('_', ' ')}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sp-row end" style={{ marginTop: 10 }}>
              {d.status === 'counting' && <Btn variant="primary" disabled={!can('Inventory', 'Edit')} onClick={() => void act('submit')}>Submit count</Btn>}
              {d.status === 'pending_approval' && <Btn variant="primary" disabled={!can('Inventory', 'Edit')} onClick={() => void act('approve')}>Approve and correct stock</Btn>}
            </div>
            {d.status === 'pending_approval' && <div className="panel-sub">Someone other than the person who ran the count must approve it.</div>}
          </Panel>
        </div>
      )}
    </>
  )
}

// ---- barcode labels -------------------------------------------------------------------------------------------------

export function BarcodeLabels() {
  const { toast } = useStore()
  const [rows, setRows] = useState<ApiProduct[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => { void get<{ items: ApiProduct[] }>('/v1/admin/products?limit=200&status=active').then((r) => { setRows(r.items); setState('ready') }, () => setState('error')) }, [])
  const chosen = rows.filter((p) => picked[p.id])
  const cols: Column<ApiProduct>[] = [
    { key: 'pick', header: '', render: (p) => <input type="checkbox" aria-label={`Select ${p.name}`} checked={!!picked[p.id]} onChange={(e) => setPicked((x) => ({ ...x, [p.id]: e.target.checked }))} /> },
    { key: 'n', header: 'Product', render: (p) => <div><b>{p.name}</b><div className="subtext">{p.sku}</div></div> },
    { key: 'b', header: 'Barcode', render: (p) => p.barcode || <span className="subtext">None set</span> },
    { key: 'pr', header: 'Price', render: (p) => kes(shillings(p.priceCents)) },
  ]
  return (
    <>
      <PageHead title="Barcode labels" desc="Choose products and print their labels." actions={<Btn variant="primary" disabled={!chosen.length} onClick={() => { if (!chosen.some((p) => p.barcode)) return toast('None of the chosen products has a barcode yet'); window.print() }}>Print {chosen.length || ''} labels</Btn>} />
      <DataTable title="Products" rows={rows} rowKey={(p) => p.id} columns={cols} loading={state === 'loading'} error={state === 'error' ? 'We couldn’t load the products.' : undefined} searchLabel="Search products" searchText={(p) => `${p.name} ${p.sku} ${p.barcode}`} emptyTitle="No products" empty="Add active products first." />
      {chosen.length > 0 && (
        <div className="print-only" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {chosen.map((p) => (
            <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 10, width: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 16, letterSpacing: 2, margin: '6px 0' }}>{p.barcode || p.sku}</div>
              <div style={{ fontSize: 11 }}>{p.sku} · {kes(shillings(p.priceCents))}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// Alert rules are kept on the server too.
export const saveAlertRules = (rules: Alerts['rules']) => put('/v1/admin/stock/alert-rules', rules)
