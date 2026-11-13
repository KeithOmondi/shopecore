import { useState } from 'react'

import { Stats } from '../components/finance-ui'
import { Detail, NotFoundCard, ago, useNow, when } from '../components/support-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, Stat, type Column } from '../components/ui'
import type { Order } from '../data/commerce'
import { DISPOSITIONS, type Disposition, type WarehouseReturn } from '../data/inventory'
import { kes } from '../lib/format'
import { useInventory } from '../lib/inventory'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

// ---- packing queue ----------------------------------------------------------------------------------------------

export function PackingQueue() {
  const { orders, products, can, toast } = useStore()
  const inv = useInventory()
  const now = useNow()
  const [sel, setSel] = useState('')
  const [prio, setPrio] = useState('All priority')
  const edit = can('Inventory', 'Edit')
  const queue = orders.filter((o) => (o.status === 'Pending' || o.status === 'Processing') && inv.pack[o.id]?.stage !== 'packed').sort((a, b) => a.placedAt - b.placedAt)
  const ready = orders.filter((o) => inv.pack[o.id]?.stage === 'packed' && (o.status === 'Processing' || o.status === 'Pending'))
  const urgent = (o: Order) => now - o.placedAt > 40 * 60_000
  const rows = queue.filter((o) => prio === 'All priority' || (prio === 'Priority' ? urgent(o) : !urgent(o)))
  const cur = orders.find((o) => o.id === sel) ?? rows[0]
  const picking = queue.filter((o) => (inv.pack[o.id]?.picked.length ?? 0) > 0)
  const times = ready.map((o) => (inv.pack[o.id]!.packedAt ?? 0) - inv.pack[o.id]!.startedAt).filter((t) => t > 0)
  const avg = times.length ? times.reduce((n, t) => n + t, 0) / times.length : 0

  const cols: Column<Order>[] = [
    { key: 'o', header: 'Order', render: (o) => <b>{o.id}</b> },
    { key: 'c', header: 'Customer', render: (o) => o.customer },
    { key: 'i', header: 'Items', render: (o) => `${o.items.reduce((n, i) => n + i.qty, 0)} items` },
    { key: 'p', header: 'Placed', sort: (a, b) => a.placedAt - b.placedAt, render: (o) => ago(o.placedAt, now) },
    { key: 'pr', header: 'Priority', render: (o) => <Badge tone={urgent(o) ? 'amber' : 'gray'}>{urgent(o) ? 'Priority' : 'Standard'}</Badge> },
    { key: 's', header: 'Stage', render: (o) => <Badge tone={(inv.pack[o.id]?.picked.length ?? 0) > 0 ? 'blue' : 'gray'}>{(inv.pack[o.id]?.picked.length ?? 0) > 0 ? 'Picking' : 'Awaiting pick'}</Badge> },
  ]
  const pack = (o: Order) => { const e = inv.packOrder(o.id); toast(e ?? `${o.id} packed and ready for a rider`) }
  return (
    <>
      <PageHead title="Order packing queue" desc="Pick, pack and stage orders for rider collection." actions={<><Btn onClick={() => { downloadCsv('pick-list.csv', ['Order', 'Customer', 'Item', 'Qty'], queue.flatMap((o) => o.items.map((i) => [o.id, o.customer, i.name, i.qty]))); toast('Pick list downloaded') }}>Print pick list</Btn></>} />
      <Stats>
        <Stat label="Awaiting pick" value={String(queue.length - picking.length)} trend={`${queue.filter(urgent).length} are priority`} icon="▤" />
        <Stat label="In packing" value={String(picking.length)} trend="Some items picked" icon="□" />
        <Stat label="Ready for rider" value={String(ready.length)} trend="Packed and waiting" icon="✓" />
        <Stat label="Average pack time" value={avg ? `${Math.floor(avg / 60_000)}m ${String(Math.round((avg % 60_000) / 1000)).padStart(2, '0')}s` : '—'} trend={times.length ? `${times.length} packed here` : 'Pack an order to see this'} icon="◷" />
      </Stats>
      <div className="sp-two">
        <DataTable title={`${rows.length} orders to pack`} rows={rows} rowKey={(o) => o.id} columns={cols} searchLabel="Search order or customer" searchText={(o) => `${o.id} ${o.customer}`} pageSize={8}
          tools={<select className="sp-select auto" aria-label="Priority" value={prio} onChange={(e) => setPrio(e.target.value)}><option>All priority</option><option>Priority</option><option>Standard</option></select>}
          actions={(o) => <Btn small disabled={!edit} onClick={() => setSel(o.id)}>Pick</Btn>} empty="Nothing waiting to be packed." />
        <div className="sp-stack">
          {cur ? (
            <Panel title={`Pick list · ${cur.id}`} sub={`${cur.customer} · ${cur.items.reduce((n, i) => n + i.qty, 0)} items`} right={<Badge tone="blue">{(inv.pack[cur.id]?.picked.length ?? 0) ? 'Picking' : 'Ready to pick'}</Badge>}>
              {cur.items.map((i) => {
                const st = inv.pack[cur.id]
                const p = products.find((x) => x.id === i.productId)
                return (
                  <div className="list-row" key={i.productId}>
                    <div><b style={{ fontSize: 11 }}>{i.name}</b><div className="panel-sub">{p?.sku} · {inv.primary?.name} · {inv.levels[i.productId]?.[inv.primary?.id ?? ''] ?? 0} on hand</div></div>
                    <label className="sp-row" style={{ gap: 6, fontSize: 11 }}><input type="checkbox" aria-label={`Picked ${i.name}`} disabled={!edit} checked={st?.picked.includes(i.productId) ?? false} onChange={(e) => inv.pickItem(cur.id, i.productId, e.target.checked)} />{i.qty} unit{i.qty === 1 ? '' : 's'}</label>
                  </div>
                )
              })}
              <div className="sp-row end sp-gap"><Btn disabled={!edit} onClick={() => { cur.items.forEach((i) => inv.pickItem(cur.id, i.productId, true)); toast('All items marked as picked') }}>Mark all picked</Btn><Btn variant="primary" disabled={!edit} onClick={() => pack(cur)}>Continue to pack</Btn></div>
              {cur.status === 'Pending' && <p className="panel-sub" style={{ marginTop: 8 }}>Packing takes the units out of stock and moves the order to Processing.</p>}
            </Panel>
          ) : <Notice mark="✓" tone="success">Everything has been packed.</Notice>}
          <Panel title="Ready for rider">
            {ready.map((o) => <div className="list-row" key={o.id}><div><b style={{ fontSize: 11 }}>{o.id} · {o.customer}</b><div className="panel-sub">{inv.pack[o.id]?.packedAt ? `Packed ${ago(inv.pack[o.id]!.packedAt!, now)}` : 'Packed'}</div></div><Btn small onClick={() => toast(`Label printed for ${o.id}`)}>Label</Btn></div>)}
            {!ready.length && <p className="panel-sub">No packed orders yet.</p>}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- returns restock -----------------------------------------------------------------------------------------------

export function ReturnsRestock() {
  const inv = useInventory()
  const [filter, setFilter] = useState('Awaiting inspection')
  const state = (r: WarehouseReturn) => { const d = inv.decisions[r.id]; return d ? (d.disposition.startsWith('Restock') ? 'Restocked' : 'Written off') : 'Awaiting inspection' }
  const rows = inv.returnsQueue.filter((r) => filter === 'All' || state(r) === filter)
  const waiting = inv.returnsQueue.filter((r) => state(r) === 'Awaiting inspection')
  const cols: Column<WarehouseReturn>[] = [
    { key: 'id', header: 'Return', render: (r) => <button className="sp-link" onClick={() => navigate(`/inventory/returns/${r.id}`)}>{r.id}</button> },
    { key: 'o', header: 'Order', render: (r) => r.orderId },
    { key: 'p', header: 'Product', render: (r) => r.productName },
    { key: 'q', header: 'Qty', render: (r) => r.qty },
    { key: 'w', header: 'Reason', render: (r) => r.reason },
    { key: 'c', header: 'Condition', render: (r) => r.condition },
    { key: 's', header: 'Disposition', render: (r) => <Badge tone={state(r) === 'Awaiting inspection' ? 'amber' : state(r) === 'Restocked' ? 'green' : 'red'}>{inv.decisions[r.id]?.disposition ?? 'Pending inspection'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Returns restock" desc="Inspect returned goods and choose whether to restock or write them off." actions={<Btn onClick={() => { downloadCsv('returns-restock.csv', ['Return', 'Order', 'Product', 'Qty', 'Reason', 'Status'], rows.map((r) => [r.id, r.orderId, r.productName, r.qty, r.reason, state(r)])) }}>Export</Btn>} />
      <Stats>
        <Stat label="Awaiting inspection" value={String(waiting.length)} trend="Approved returns coming back" icon="↶" up={waiting.length === 0} />
        <Stat label="Restocked" value={String(inv.returnsQueue.filter((r) => state(r) === 'Restocked').length)} trend="Back on the shelf" icon="✓" />
        <Stat label="Written off" value={String(inv.returnsQueue.filter((r) => state(r) === 'Written off').length)} trend="Damage or loss" icon="!" up={false} />
        <Stat label="Value under review" value={kes(waiting.reduce((n, r) => n + r.value, 0))} trend={`Across ${waiting.length} returns`} icon="▧" />
      </Stats>
      <DataTable title={`${rows.length} returns`} rows={rows} rowKey={(r) => r.id} columns={cols} searchLabel="Search returns or orders" searchText={(r) => `${r.id} ${r.orderId} ${r.productName}`}
        tools={<select className="sp-select auto" aria-label="Status" value={filter} onChange={(e) => setFilter(e.target.value)}><option>Awaiting inspection</option><option>Restocked</option><option>Written off</option><option>All</option></select>}
        actions={(r) => <Btn small onClick={() => navigate(`/inventory/returns/${r.id}`)}>{inv.decisions[r.id] ? 'View' : 'Inspect'}</Btn>} empty="No returns in this view." />
    </>
  )
}

export function ReturnInspection({ id }: { id: string }) {
  const { openModal, toast, can } = useStore()
  const inv = useInventory()
  const r = inv.returnsQueue.find((x) => x.id === id)
  const done = inv.decisions[id]
  const [disp, setDisp] = useState<Disposition>('Restock · sellable')
  const [loc, setLoc] = useState(inv.primary?.id ?? '')
  const [refund, setRefund] = useState('No refund required')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const edit = can('Inventory', 'Edit')
  if (!r) return <NotFoundCard what="Return" back="Back to returns" onBack={() => navigate('/inventory/returns')} />
  const save = () => {
    if (!r.productId && disp.startsWith('Restock')) return setErr('This item can’t be matched to a product, so it can’t be restocked. Write it off instead.')
    if (!disp.startsWith('Restock') && notes.trim().length < 3) return setErr('Say why it is being written off or returned.')
    setErr('')
    openModal({
      title: disp.startsWith('Restock') ? 'Restock returned item?' : disp.startsWith('Write') ? 'Write off returned item?' : 'Return item to the supplier?',
      message: disp.startsWith('Restock') ? `${r.qty} unit${r.qty === 1 ? '' : 's'} of ${r.productName} will be added to ${inv.locations.find((l) => l.id === loc)?.name} stock.` : 'The item stays out of sellable stock and the decision is recorded.',
      confirm: 'Confirm', danger: disp.startsWith('Write'),
      onConfirm: () => { const e = inv.decideReturn(r, { disposition: disp, locationId: loc, notes: notes.trim(), refund }); if (e) setErr(e); else toast('Disposition saved') },
    })
  }
  return (
    <>
      <PageHead title={`Returns restock · ${r.id}`} desc="Inspect the returned item and record what happens to it." actions={<Btn onClick={() => navigate('/inventory/returns')}>Back to returns</Btn>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Return inspection" sub={`Order ${r.orderId} · ${r.customer} · Received ${when(r.receivedAt)}`} right={<Badge tone={done ? 'green' : 'amber'}>{done ? 'Decided' : 'Inspection pending'}</Badge>}>
            <div className="sp-form2" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 8 }}><Detail label="Product">{r.productName}</Detail><Detail label="Quantity">{r.qty}</Detail><Detail label="Value">{kes(r.value)}</Detail></div>
            <Detail label="Customer reason">{r.reason}</Detail><Detail label="Reported condition">{r.condition}</Detail>
            {done && <div style={{ marginTop: 10 }}><Notice tone="success" mark="✓">{done.disposition} by {done.by} · {when(done.at)}{done.notes && ` · ${done.notes}`}</Notice></div>}
          </Panel>
          {r.condition === 'Photo evidence' && <Panel title="Photo evidence" sub="Customer upload"><img className="sp-photo" src="/return-evidence.png" alt="Customer photo of the returned item" /></Panel>}
        </div>
        <div className="sp-stack">
          <Panel title="Choose disposition">
            <Field label="Inventory disposition" value={disp} onChange={(v) => { setDisp(v as Disposition); setErr('') }} options={DISPOSITIONS} />
            <Field label="Location" value={loc} onChange={setLoc} options={inv.locations.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name }))} />
            <Field label="Refund status" value={refund} onChange={setRefund} options={['No refund required', 'Refund already issued', 'Send to refund review']} />
            <Field label="Inspection notes" multiline value={notes} onChange={(v) => { setNotes(v); setErr('') }} placeholder="Describe the item condition" />
            {err && <div className="sp-err" role="alert">{err}</div>}
            {disp.startsWith('Write') && <Notice tone="warning" mark="!">Written-off items never go back into sellable stock.</Notice>}
            <div className="sp-row end sp-gap"><Btn variant="primary" disabled={!edit || !!done} onClick={save}>Save disposition</Btn></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

