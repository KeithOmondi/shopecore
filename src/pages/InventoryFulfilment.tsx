import { useCallback, useEffect, useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, type Column } from '../components/ui'
import { ApiError, get, post } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import type { Location } from './Products'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100

function useGet<T>(path: string | null, everyMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    const run = () => void get<T>(path).then((d) => { if (live) { setData(d); setFailed(false) } }, () => { if (live) setFailed(true) })
    run()
    const t = everyMs ? setInterval(run, everyMs) : undefined
    return () => { live = false; if (t) clearInterval(t) }
  }, [path, tick, everyMs])
  return { data, failed, loading: !!path && !data && !failed, reload: useCallback(() => setTick((n) => n + 1), []) }
}

// ---- packing --------------------------------------------------------------------------------------------------------

interface PackJob {
  orderId: string; orderNumber: string; placedAt: string; totalCents: number; stage: 'pick' | 'packed'; picked: string[]
  items: { productId: string; sku: string; name: string; quantity: number; location: string | null }[]
}

export function PackingQueue() {
  const { can, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: PackJob[] }>('/v1/admin/packing', 20_000)
  const [busy, setBusy] = useState('')
  const edit = can('Orders', 'Edit')
  const jobs = data?.items ?? []
  const pick = async (job: PackJob, productId: string, picked: boolean) => {
    setBusy(job.orderId)
    try { await post(`/v1/admin/packing/${job.orderId}/pick`, { productId, picked }); reload() } catch (e) { toast(says(e)) } finally { setBusy('') }
  }
  const pack = async (job: PackJob) => {
    setBusy(job.orderId)
    try { await post(`/v1/admin/packing/${job.orderId}/pack`); toast(`${job.orderNumber} is packed`); reload() } catch (e) { toast(says(e)) } finally { setBusy('') }
  }
  return (
    <>
      <PageHead title="Packing queue" desc="Paid orders waiting to be picked and packed. Oldest first." actions={<Btn onClick={reload}>Refresh</Btn>} />
      {failed && !data && <Notice tone="warning" mark="!">We couldn’t load the queue. <button className="link-btn" onClick={reload}>Try again</button></Notice>}
      {loading && <div className="panel-sub">Loading…</div>}
      {data && jobs.length === 0 && <Notice mark="✓">Nothing is waiting. New paid orders appear here on their own.</Notice>}
      <div className="sp-stack">
        {jobs.map((j) => {
          const allPicked = j.items.every((i) => j.picked.includes(i.productId))
          return (
            <Panel key={j.orderId} title={j.orderNumber} sub={`Placed ${dateTime(Date.parse(j.placedAt))} · ${kes(shillings(j.totalCents))}`} right={<Badge tone={j.stage === 'packed' ? 'green' : 'amber'}>{j.stage === 'packed' ? 'Packed' : `${j.picked.length}/${j.items.length} picked`}</Badge>}>
              {j.items.map((i) => (
                <label key={i.productId} className="list-row" style={{ cursor: 'pointer' }}>
                  <span><b>{i.quantity} × {i.name}</b><small>{i.sku}{i.location ? ` · ${i.location}` : ''}</small></span>
                  <input type="checkbox" aria-label={`Picked ${i.name}`} checked={j.picked.includes(i.productId)} disabled={!edit || busy === j.orderId || j.stage === 'packed'} onChange={(e) => void pick(j, i.productId, e.target.checked)} />
                </label>
              ))}
              <div className="sp-row end" style={{ marginTop: 8 }}>
                <Btn small onClick={() => navigate(`/orders/${j.orderId}`)}>Open order</Btn>
                {j.stage !== 'packed' && <Btn small variant="primary" disabled={!edit || !allPicked || busy === j.orderId} onClick={() => void pack(j)}>Mark as packed</Btn>}
              </div>
            </Panel>
          )
        })}
      </div>
    </>
  )
}

// ---- returns --------------------------------------------------------------------------------------------------------

interface WReturn {
  id: string; number: string; orderNumber: string | null; customer: string; product: string; qty: number; reason: string; condition: string; valueCents: number
  receivedAt: string; disposition: string | null; location: string | null; note: string | null
}
const DISPOSITION: Record<string, string> = { restock_sellable: 'Back to sellable stock', restock_clearance: 'Restock as clearance', write_off: 'Write off', return_to_supplier: 'Return to supplier' }

export function ReturnsRestock() {
  const [state, setState] = useState<'open' | 'decided'>('open')
  const { data, failed, loading, reload } = useGet<{ items: WReturn[] }>(`/v1/admin/warehouse-returns?state=${state}&limit=100`)
  const cols: Column<WReturn>[] = [
    { key: 'n', header: 'Return', render: (r) => <button className="link-btn" onClick={() => navigate(`/inventory/returns/${r.id}`)}>{r.number}</button> },
    { key: 'p', header: 'Product', render: (r) => <div><b>{r.product}</b><div className="subtext">{r.qty} unit{r.qty === 1 ? '' : 's'}{r.orderNumber ? ` · ${r.orderNumber}` : ''}</div></div> },
    { key: 'c', header: 'Customer', render: (r) => r.customer || '—' },
    { key: 'r', header: 'Reason', render: (r) => r.reason || '—' },
    { key: 'v', header: 'Value', render: (r) => kes(shillings(r.valueCents)) },
    { key: 'd', header: state === 'open' ? 'Received' : 'Decision', render: (r) => (state === 'open' ? dateTime(Date.parse(r.receivedAt)) : <Badge tone={r.disposition === 'write_off' ? 'red' : 'green'}>{DISPOSITION[r.disposition ?? ''] ?? r.disposition}</Badge>) },
  ]
  return (
    <>
      <PageHead title="Returns and restock" desc="Items customers sent back, waiting for an inspection decision." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <DataTable title={state === 'open' ? 'Waiting for inspection' : 'Decided'} rows={data?.items ?? []} rowKey={(r) => r.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the returns.' : undefined} onRetry={reload}
        searchLabel="Search returns" searchText={(r) => `${r.number} ${r.product} ${r.customer} ${r.orderNumber ?? ''}`} emptyTitle={state === 'open' ? 'No returns to inspect' : 'Nothing decided yet'} empty="Approved customer returns arrive here."
        tools={<select className="select" aria-label="State" value={state} onChange={(e) => setState(e.target.value as typeof state)}><option value="open">Waiting</option><option value="decided">Decided</option></select>}
        actions={(r) => <Btn small onClick={() => navigate(`/inventory/returns/${r.id}`)}>{r.disposition ? 'View' : 'Inspect'}</Btn>} />
    </>
  )
}

export function ReturnInspection({ id }: { id: string }) {
  const { can, toast } = useStore()
  const open = useGet<{ items: WReturn[] }>('/v1/admin/warehouse-returns?state=open&limit=200')
  const done = useGet<{ items: WReturn[] }>('/v1/admin/warehouse-returns?state=decided&limit=200')
  const locs = (useGet<{ items: Location[] }>('/v1/admin/locations').data?.items ?? []).filter((l) => l.active)
  const r = [...(open.data?.items ?? []), ...(done.data?.items ?? [])].find((x) => x.id === id)
  const [disposition, setDisposition] = useState('restock_sellable')
  const [locationId, setLocationId] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!r) return <PageHead title="Return" desc={open.loading || done.loading ? 'Loading…' : 'We couldn’t find that return.'} actions={<Btn onClick={() => navigate('/inventory/returns')}>Back to returns</Btn>} />
  const decide = async () => {
    setBusy(true)
    try { await post(`/v1/admin/warehouse-returns/${id}/decision`, { disposition, locationId: locationId || locs[0]?.id, notes: notes.trim() }); toast('Decision recorded'); navigate('/inventory/returns') } catch (e) { setErr(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title={`Return ${r.number}`} desc={`${r.product} · ${r.qty} unit${r.qty === 1 ? '' : 's'}`} actions={<Btn onClick={() => navigate('/inventory/returns')}>Back to returns</Btn>} />
      <div className="sp-two">
        <Panel title="What came back">
          <SettingRow title="Customer" right={<span className="prod-name">{r.customer || '—'}</span>} />
          <SettingRow title="Order" right={<span className="prod-name">{r.orderNumber ?? '—'}</span>} />
          <SettingRow title="Reason" right={<span className="prod-name">{r.reason || '—'}</span>} />
          <SettingRow title="Condition reported" right={<span className="prod-name">{r.condition || '—'}</span>} />
          <SettingRow title="Value" right={<b>{kes(shillings(r.valueCents))}</b>} />
        </Panel>
        <Panel title={r.disposition ? 'Decision' : 'Inspection decision'}>
          {r.disposition ? (
            <>
              <SettingRow title="Decision" right={<Badge tone="green">{DISPOSITION[r.disposition] ?? r.disposition}</Badge>} />
              <SettingRow title="Location" right={<span className="prod-name">{r.location ?? '—'}</span>} />
              {r.note && <SettingRow title="Notes" sub={r.note} />}
            </>
          ) : (
            <>
              <Field label="What should happen to it?" value={disposition} onChange={setDisposition} options={Object.entries(DISPOSITION).map(([value, label]) => ({ value, label }))} />
              <Field label="Location" value={locationId || locs[0]?.id || ''} onChange={setLocationId} options={locs.map((l) => ({ value: l.id, label: l.name }))} />
              <Field label="Notes" multiline value={notes} onChange={setNotes} error={err} />
              <div className="sp-row end"><Btn variant="primary" disabled={!can('Inventory', 'Edit') || busy} onClick={() => void decide()}>Record decision</Btn></div>
            </>
          )}
        </Panel>
      </div>
    </>
  )
}
