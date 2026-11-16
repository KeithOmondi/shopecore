import { useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, post } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

interface Waiting { orderId: string; order: string; placedAt: string; totalCents: number; cod: boolean; customer: string; area: string | null; zone: string | null; packed: boolean; items: number }
interface Delivery {
  id: string; orderId: string; order: string; riderId: string; rider: string; status: string; offerExpiresAt: string | null; assignedAt: string; acceptedAt: string | null; pickedUpAt: string | null
  customer: string; phone: string; area: string | null; address: string | null; zone: string | null; pickup: string | null; totalCents: number; earningsCents: number; codCents: number; distanceKm: number
}
interface BoardRider { id: string; name: string; phone: string; vehicle: string; zoneId: string | null; zone: string | null; activeDeliveries: number; location: { lat: number; lng: number; at: string | null } | null }
interface Board { unassigned: Waiting[]; active: Delivery[]; riders: BoardRider[] }

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
const STATUS: Record<string, { label: string; tone: 'amber' | 'blue' | 'green' | 'red' | 'gray' }> = {
  offered: { label: 'Offered', tone: 'amber' }, accepted: { label: 'Accepted', tone: 'blue' }, at_pickup: { label: 'At pickup', tone: 'blue' }, picked_up: { label: 'On the road', tone: 'blue' },
  at_dropoff: { label: 'At the door', tone: 'green' }, delivered: { label: 'Delivered', tone: 'green' }, failed: { label: 'Failed', tone: 'red' }, cancelled: { label: 'Cancelled', tone: 'gray' },
}
const useBoard = () => useGet<Board>('/v1/admin/dispatch/board', 15_000)

// ---- overview -------------------------------------------------------------------------------------------------------

export function DispatchOverview() {
  const { data: b, failed, reload } = useBoard()
  if (!b) return <PageHead title="Dispatch overview" desc={failed ? 'We couldn’t load the dispatch board.' : 'Loading…'} actions={<Btn onClick={reload}>Try again</Btn>} />
  const late = b.unassigned.filter((o) => minutesAgo(o.placedAt) > 20).length
  return (
    <>
      <PageHead title="Dispatch overview" desc="Orders waiting for a rider, deliveries on the road, and who is available." actions={<><Btn onClick={reload}>Refresh</Btn><Btn variant="primary" onClick={() => navigate('/dispatch/queue')}>Open the queue</Btn></>} />
      <div className="tile-row">
        <Stat label="Waiting for a rider" value={String(b.unassigned.length)} trend={late ? `${late} waiting over 20 min` : 'All recent'} icon="◷" up={late === 0} />
        <Stat label="On the road" value={String(b.active.filter((d) => ['picked_up', 'at_dropoff'].includes(d.status)).length)} trend="With riders now" icon="⌖" />
        <Stat label="Offered, not accepted" value={String(b.active.filter((d) => d.status === 'offered').length)} trend="Riders have 75 seconds" icon="…" />
        <Stat label="Riders online" value={String(b.riders.length)} trend={`${b.riders.filter((r) => r.activeDeliveries === 0).length} free`} icon="♙" />
      </div>
      <div className="sp-two" style={{ marginTop: 14 }}>
        <Panel title="Waiting for a rider" right={<Btn small onClick={() => navigate('/dispatch/queue')}>View all</Btn>}>
          {b.unassigned.length === 0 && <div className="panel-sub">Nothing is waiting.</div>}
          {b.unassigned.slice(0, 6).map((o) => <div className="list-row" key={o.orderId}><span><strong>{o.order}</strong><small>{o.area ?? o.zone ?? '—'} · {minutesAgo(o.placedAt)} min</small></span><Btn small onClick={() => navigate(`/dispatch/assign/${o.orderId}`)}>Assign</Btn></div>)}
        </Panel>
        <Panel title="Riders online">
          {b.riders.length === 0 && <div className="panel-sub">No riders are online.</div>}
          {b.riders.slice(0, 8).map((r) => <div className="list-row" key={r.id}><span><strong>{r.name}</strong><small>{r.vehicle} · {r.zone ?? 'No zone'}</small></span><Badge tone={r.activeDeliveries >= 3 ? 'amber' : 'green'}>{`${r.activeDeliveries}/3`}</Badge></div>)}
        </Panel>
      </div>
    </>
  )
}

// ---- queue ----------------------------------------------------------------------------------------------------------

export function OrderQueue() {
  const { can } = useStore()
  const { data, failed, loading, reload } = useBoard()
  const cols: Column<Waiting>[] = [
    { key: 'o', header: 'Order', render: (o) => <button className="link-btn" onClick={() => navigate(`/orders/${o.orderId}`)}>{o.order}</button> },
    { key: 'c', header: 'Customer', render: (o) => <div><b>{o.customer}</b><div className="subtext">{o.area ?? '—'}</div></div> },
    { key: 'z', header: 'Zone', render: (o) => o.zone ?? '—' },
    { key: 'p', header: 'Packed', render: (o) => <Badge tone={o.packed ? 'green' : 'amber'}>{o.packed ? 'Ready' : 'Not yet'}</Badge> },
    { key: 'w', header: 'Waiting', sort: (a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt), render: (o) => `${minutesAgo(o.placedAt)} min` },
    { key: 't', header: 'Total', render: (o) => <>{kes(shillings(o.totalCents))}{o.cod && <span className="subtext"> cash on delivery</span>}</> },
  ]
  return (
    <>
      <PageHead title="Order queue" desc="Paid orders that still need a rider, oldest first." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <DataTable title="Waiting for a rider" rows={data?.unassigned ?? []} rowKey={(o) => o.orderId} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the queue.' : undefined} onRetry={reload}
        searchLabel="Search queue" searchText={(o) => `${o.order} ${o.customer} ${o.area ?? ''}`} emptyTitle="Nothing is waiting" empty="Paid orders appear here until a rider has them."
        actions={(o) => <Btn small variant="primary" disabled={!can('Dispatch', 'Edit')} onClick={() => navigate(`/dispatch/assign/${o.orderId}`)}>Assign</Btn>} />
    </>
  )
}

// ---- assign / reassign ----------------------------------------------------------------------------------------------

function Assigner({ orderId, again }: { orderId: string; again: boolean }) {
  const { can, toast } = useStore()
  const sug = useGet<{ items: BoardRider[] }>(`/v1/admin/dispatch/orders/${orderId}/suggestions`)
  const board = useBoard()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const waiting = board.data?.unassigned.find((o) => o.orderId === orderId)
  const live = board.data?.active.find((d) => d.orderId === orderId)
  const assign = async (riderId: string, force: boolean) => {
    setBusy(riderId)
    try { await post(`/v1/admin/dispatch/orders/${orderId}/assign`, { riderId, force, note }); toast(force ? 'Order handed to the rider' : 'Offer sent. They have 75 seconds to accept.'); navigate('/dispatch') } catch (e) { toast(says(e)) } finally { setBusy('') }
  }
  const unassign = async () => {
    setBusy('x')
    try { await post(`/v1/admin/dispatch/orders/${orderId}/unassign`); toast('Rider removed'); navigate('/dispatch/queue') } catch (e) { toast(says(e)) } finally { setBusy('') }
  }
  return (
    <>
      <PageHead title={again ? 'Reassign order' : 'Assign a rider'} desc={waiting ? `${waiting.order} · ${waiting.customer} · ${waiting.area ?? '—'}` : live ? `${live.order} · currently with ${live.rider}` : 'Choose who should take this order.'}
        actions={<>{live && ['offered', 'accepted', 'at_pickup'].includes(live.status) && <Btn variant="danger" disabled={!can('Dispatch', 'Edit') || !!busy} onClick={() => void unassign()}>Take the rider off</Btn>}<Btn onClick={() => navigate('/dispatch')}>Back</Btn></>} />
      {live && ['picked_up', 'at_dropoff'].includes(live.status) && <Notice tone="warning" mark="!">The rider already has this order on the road, so it can’t be reassigned.</Notice>}
      <Panel title="Riders online" sub="Same zone first, then the lightest load">
        <Field label="Note for the rider (optional)" value={note} onChange={setNote} />
        {sug.data?.items.length === 0 && <div className="panel-sub">No riders are online. You can still hand the order to an offline rider from the Riders page.</div>}
        {sug.data?.items.map((r) => (
          <div className="list-row" key={r.id}>
            <span><strong>{r.name}</strong><small>{r.vehicle} · {r.zone ?? 'No zone'} · {r.activeDeliveries} active</small></span>
            <span className="sp-row"><Btn small disabled={!can('Dispatch', 'Edit') || !!busy} onClick={() => void assign(r.id, false)}>Send offer</Btn><Btn small variant="primary" disabled={!can('Dispatch', 'Edit') || !!busy} onClick={() => void assign(r.id, true)}>Assign now</Btn></span>
          </div>
        ))}
      </Panel>
    </>
  )
}

function PickOrder({ title, rows, to }: { title: string; rows: { id: string; label: string; sub: string }[]; to: string }) {
  return (
    <>
      <PageHead title={title} desc="Choose an order." actions={<Btn onClick={() => navigate('/dispatch')}>Back</Btn>} />
      <Panel title="Orders">
        {rows.length === 0 && <div className="panel-sub">Nothing to show right now.</div>}
        {rows.map((r) => <div className="list-row" key={r.id}><span><strong>{r.label}</strong><small>{r.sub}</small></span><Btn small onClick={() => navigate(`${to}/${r.id}`)}>Choose</Btn></div>)}
      </Panel>
    </>
  )
}

export function AssignRider({ id }: { id?: string }) {
  const { data } = useBoard()
  if (id) return <Assigner orderId={id} again={false} />
  return <PickOrder title="Assign a rider" to="/dispatch/assign" rows={(data?.unassigned ?? []).map((o) => ({ id: o.orderId, label: o.order, sub: `${o.customer} · ${o.area ?? '—'}` }))} />
}

export function ReassignOrder({ id }: { id?: string }) {
  const { data } = useBoard()
  if (id) return <Assigner orderId={id} again />
  return <PickOrder title="Reassign order" to="/dispatch/reassign" rows={(data?.active ?? []).filter((d) => ['offered', 'accepted', 'at_pickup'].includes(d.status)).map((d) => ({ id: d.orderId, label: d.order, sub: `with ${d.rider} · ${STATUS[d.status]?.label ?? d.status}` }))} />
}

// ---- live order -----------------------------------------------------------------------------------------------------

export function LiveOrder({ id }: { id?: string }) {
  const { data, failed, reload } = useBoard()
  const hist = useGet<{ attempts: { outcome: string; rider: string; reason: string; at: string }[] }>(id ? `/v1/admin/dispatch/orders/${id}/history` : null)
  if (!id) {
    return <PickOrder title="Live orders" to="/dispatch/live" rows={(data?.active ?? []).map((d) => ({ id: d.orderId, label: d.order, sub: `${d.rider} · ${STATUS[d.status]?.label ?? d.status} · ${d.area ?? '—'}` }))} />
  }
  const d = data?.active.find((x) => x.orderId === id)
  if (!data) return <PageHead title="Live order" desc={failed ? 'We couldn’t load this delivery.' : 'Loading…'} actions={<Btn onClick={() => navigate('/dispatch/live')}>Back</Btn>} />
  if (!d) return <><PageHead title="Live order" desc="This order isn’t on the road right now." actions={<><Btn onClick={() => navigate(`/orders/${id}`)}>Open the order</Btn><Btn onClick={() => navigate('/dispatch/live')}>Back</Btn></>} /></>
  return (
    <>
      <PageHead title={d.order} desc={`${d.customer} · ${d.area ?? '—'}`} actions={<><Btn onClick={reload}>Refresh</Btn><Btn onClick={() => navigate(`/orders/${id}`)}>Open the order</Btn><Btn onClick={() => navigate(`/dispatch/reassign/${id}`)}>Reassign</Btn></>} />
      <div className="sp-two">
        <Panel title="Delivery" right={<Badge tone={STATUS[d.status]?.tone ?? 'gray'}>{STATUS[d.status]?.label ?? d.status}</Badge>}>
          <SettingRow title="Rider" right={<button className="link-btn" onClick={() => navigate(`/riders/${d.riderId}`)}>{d.rider}</button>} />
          <SettingRow title="Pick up from" right={<span className="prod-name">{d.pickup ?? '—'}</span>} />
          <SettingRow title="Deliver to" sub={d.address ?? ''} right={<span className="prod-name">{d.area ?? '—'}</span>} />
          <SettingRow title="Customer phone" right={<span className="prod-name">{d.phone}</span>} />
          <SettingRow title="Cash to collect" right={<b>{d.codCents ? kes(shillings(d.codCents)) : 'None'}</b>} />
          <SettingRow title="Rider earns" right={<span className="prod-name">{kes(shillings(d.earningsCents))}</span>} />
          {d.offerExpiresAt && d.status === 'offered' && <SettingRow title="Offer expires" right={<span className="prod-name">{dateTime(Date.parse(d.offerExpiresAt))}</span>} />}
        </Panel>
        <Panel title="History">
          {hist.data?.attempts.length === 0 && <div className="panel-sub">No history yet.</div>}
          {hist.data?.attempts.map((h, i) => <SettingRow key={i} title={`${h.rider} · ${h.outcome}`} sub={h.reason} right={<span className="prod-name">{dateTime(Date.parse(h.at))}</span>} />)}
        </Panel>
      </div>
    </>
  )
}

// ---- delayed --------------------------------------------------------------------------------------------------------

export function DelayedOrders() {
  const { data, failed, loading, reload } = useBoard()
  const [limit, setLimit] = useState('20')
  const mins = Number(limit) || 20
  type Row = { id: string; order: string; who: string; where: string; late: number; kind: 'No rider' | 'Offer unanswered' | 'Slow pickup' | 'Slow delivery' }
  const rows: Row[] = [
    ...(data?.unassigned ?? []).filter((o) => minutesAgo(o.placedAt) >= mins).map((o): Row => ({ id: o.orderId, order: o.order, who: o.customer, where: o.area ?? '—', late: minutesAgo(o.placedAt), kind: 'No rider' })),
    ...(data?.active ?? []).flatMap((d): Row[] => {
      const m = minutesAgo(d.assignedAt)
      if (d.status === 'offered' && d.offerExpiresAt && Date.parse(d.offerExpiresAt) < Date.now()) return [{ id: d.orderId, order: d.order, who: d.rider, where: d.area ?? '—', late: m, kind: 'Offer unanswered' }]
      if (['accepted', 'at_pickup'].includes(d.status) && m >= mins) return [{ id: d.orderId, order: d.order, who: d.rider, where: d.area ?? '—', late: m, kind: 'Slow pickup' }]
      if (['picked_up', 'at_dropoff'].includes(d.status) && d.pickedUpAt && minutesAgo(d.pickedUpAt) >= mins * 2) return [{ id: d.orderId, order: d.order, who: d.rider, where: d.area ?? '—', late: minutesAgo(d.pickedUpAt), kind: 'Slow delivery' }]
      return []
    }),
  ].sort((a, b) => b.late - a.late)
  const cols: Column<Row>[] = [
    { key: 'o', header: 'Order', render: (r) => <button className="link-btn" onClick={() => navigate(`/orders/${r.id}`)}>{r.order}</button> },
    { key: 'k', header: 'Problem', render: (r) => <Badge tone={r.kind === 'No rider' ? 'red' : 'amber'}>{r.kind}</Badge> },
    { key: 'w', header: 'Who', render: (r) => r.who },
    { key: 'a', header: 'Area', render: (r) => r.where },
    { key: 'l', header: 'Minutes', sort: (a, b) => a.late - b.late, render: (r) => <b>{r.late}</b> },
  ]
  return (
    <>
      <PageHead title="Delayed and stuck orders" desc="Orders that are taking longer than they should." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <DataTable title={`${rows.length} need attention`} rows={rows} rowKey={(r) => `${r.id}:${r.kind}`} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the board.' : undefined} onRetry={reload}
        searchLabel="Search delayed orders" searchText={(r) => `${r.order} ${r.who} ${r.where}`} emptyTitle="Nothing is delayed" empty="Every order is moving."
        tools={<select className="select" aria-label="Late after" value={limit} onChange={(e) => setLimit(e.target.value)}><option value="10">Late after 10 min</option><option value="20">Late after 20 min</option><option value="30">Late after 30 min</option></select>}
        actions={(r) => <Btn small onClick={() => navigate(r.kind === 'No rider' ? `/dispatch/assign/${r.id}` : `/dispatch/reassign/${r.id}`)}>{r.kind === 'No rider' ? 'Assign' : 'Reassign'}</Btn>} />
    </>
  )
}
