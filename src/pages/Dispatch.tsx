import { useEffect, useMemo, useState } from 'react'

import { MapView, type MapLine, type MapPin } from '../components/MapView'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import type { Order } from '../data/commerce'
import { posOf, zoneOf } from '../data/geo'
import { dateTime, kes } from '../lib/format'
import { autoAssign, isUnassigned, liveStatus, minutesSince, pickupArea, rankRiders, riderLoad, shortRoute } from '../lib/dispatch'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

const tone = (s: string) => (['Online', 'Delivered', 'Active', 'Paid'].includes(s) ? 'green' : ['Busy', 'Waiting', 'Delayed', 'At risk', 'In progress'].includes(s) ? 'amber' : ['Stuck', 'Suspended', 'Critical'].includes(s) ? 'red' : ['New', 'Unassigned'].includes(s) ? 'blue' : 'gray') as 'green' | 'amber' | 'red' | 'blue' | 'gray'
const queueStatus = (o: Order, now: number) => (minutesSince(o.placedAt, now) > 10 ? 'Waiting' : 'New')
const useNow = () => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function riderImg() {
  return <img src="/rider-profile.png" alt="" />
}

/** Opens the assign flow for an order. */
const toAssign = (id: string) => navigate(`/dispatch/assign/${id}`)

// ---- overview ------------------------------------------------------------------------------------------------

export function DispatchOverview() {
  const { orders, riders, incidents, openDrawer, toast } = useStore()
  const now = useNow()
  const [zone, setZone] = useState('All zones')
  const [tab, setTab] = useState<'Unassigned' | 'In progress' | 'Delayed'>('Unassigned')
  const [stamp, setStamp] = useState('just now')

  const unassigned = orders.filter(isUnassigned)
  const active = orders.filter((o) => o.status === 'Processing' || o.status === 'Out for delivery')
  const inProgress = active.filter((o) => o.riderId)
  const delayed = orders.filter((o) => o.alert)
  const online = riders.filter((r) => r.status === 'Online')
  const available = online.filter((r) => riderLoad(orders, r.id) < 3)
  const inZone = (area: string) => zone === 'All zones' || zoneOf(area) === zone

  const pins: MapPin[] = [
    ...online.filter((r) => inZone(r.zone)).map((r) => ({ id: r.id, at: r.at, kind: 'rider' as const, label: r.name[0]!, title: `${r.name} · ${liveStatus(r, riderLoad(orders, r.id))}`, onClick: () => navigate(`/riders/${r.id}`) })),
    ...unassigned.filter((o) => inZone(pickupArea(o))).slice(0, 8).map((o, i) => ({ id: o.id, at: posOf(pickupArea(o)), kind: 'order' as const, label: String(i + 1), title: `${o.id} · waiting for a rider`, onClick: () => toAssign(o.id) })),
    ...delayed.filter((o) => inZone(o.area)).map((o) => ({ id: `a-${o.id}`, at: posOf(o.area), kind: 'sos' as const, label: '!', title: `${o.id} · ${o.alert!.reason}`, onClick: () => navigate('/dispatch/alerts') })),
    ...incidents.filter((i) => i.status !== 'Resolved').map((i) => ({ id: i.id, at: i.pos, kind: 'sos' as const, label: 'SOS', title: `${i.id} · ${i.type}`, onClick: () => navigate('/incidents') })),
  ]
  const lines: MapLine[] = active.filter((o) => o.riderId && o.status === 'Out for delivery' && inZone(o.area)).slice(0, 6).map((o) => ({ id: o.id, points: [riders.find((r) => r.id === o.riderId)!.at, posOf(o.area)] }))

  const list = tab === 'Unassigned' ? unassigned : tab === 'In progress' ? inProgress : delayed
  const zones = ['All zones', 'Westlands', 'Kilimani', 'CBD', 'Karen']

  return (
    <>
      <PageHead
        title="Dispatch overview"
        desc="Live delivery operations across Nairobi and surrounding areas."
        actions={
          <>
            <Btn onClick={() => { setStamp(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })); toast('Dispatch map refreshed') }}>Refresh map</Btn>
            <Btn variant="primary" onClick={() => navigate('/dispatch/queue')}>View queue</Btn>
          </>
        }
      />
      <div className="grid stats" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <Stat label="Active orders" value={String(active.length + unassigned.filter((o) => o.status === 'Pending').length)} trend={`${inProgress.filter((o) => o.status === 'Out for delivery').length} on the road · ${active.filter((o) => o.status === 'Processing').length} awaiting pickup`} icon="▤" />
        <Stat label="Online riders" value={String(online.length)} trend={`${available.length} riders available`} icon="♙" />
        <Stat label="Unassigned" value={String(unassigned.length)} trend={`${unassigned.filter((o) => minutesSince(o.placedAt, now) > 10).length} waiting over 10 min`} icon="＋" up={unassigned.length === 0} />
        <Stat label="Delayed" value={String(delayed.length)} trend={`${delayed.filter((o) => o.alert!.level !== 'At risk').length} need immediate attention`} icon="!" up={delayed.length === 0} />
      </div>
      <div className="dispatch-layout">
        <section className="card map-card dispatch-map">
          <div className="map-toolbar">
            <div>
              <h2>Live dispatch map</h2>
              <div className="panel-sub">Nairobi · Updated {stamp}</div>
            </div>
            <div className="actions">
              <select className="select" aria-label="Filter map by zone" value={zone} onChange={(e) => setZone(e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select>
              <Btn small onClick={() => openDrawer({ title: 'Map filters', body: <Notice>Pins shown: {pins.length}. Choose a zone above to focus on one area. Green pins are riders, amber are orders waiting for a rider, red are alerts and SOS.</Notice> })}>Filters</Btn>
            </div>
          </div>
          <MapView pins={pins} lines={lines} height={505} />
        </section>
        <aside className="card dispatch-side">
          <div className="dispatch-side-head">
            <h2>Order monitoring</h2>
            <Badge tone="blue">{`${unassigned.length} open`}</Badge>
          </div>
          <div className="tabs" role="tablist">
            {(['Unassigned', 'In progress', 'Delayed'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t} {t !== 'In progress' && <b>{t === 'Unassigned' ? unassigned.length : delayed.length}</b>}
              </button>
            ))}
          </div>
          <div className="queue-list">
            {list.slice(0, 5).map((o) => (
              <div className="queue-item" key={o.id}>
                <div className="queue-top">
                  <strong>{o.id}</strong>
                  <Badge tone={tone(tab === 'Delayed' ? o.alert!.level : tab === 'In progress' ? 'In progress' : queueStatus(o, now))}>{tab === 'Delayed' ? o.alert!.level : tab === 'In progress' ? 'In progress' : queueStatus(o, now)}</Badge>
                </div>
                <p>{shortRoute(o)} · {minutesSince(o.placedAt, now)} min</p>
                <div className="queue-bottom">
                  <span className="subtext">{kes(o.total)}</span>
                  {tab === 'Unassigned' ? <Btn small onClick={() => toAssign(o.id)}>Assign</Btn> : tab === 'In progress' ? <Btn small onClick={() => navigate(`/dispatch/live/${o.id}`)}>Track</Btn> : <Btn small onClick={() => navigate('/dispatch/alerts')}>Review</Btn>}
                </div>
              </div>
            ))}
            {list.length === 0 && <div className="panel-sub" style={{ padding: 16 }}>Nothing here right now.</div>}
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
            <button className="btn" style={{ width: '100%' }} onClick={() => navigate('/dispatch/queue')}>View all unassigned orders</button>
          </div>
        </aside>
      </div>
    </>
  )
}

// ---- order queue -------------------------------------------------------------------------------------------------------

export function OrderQueue() {
  const { orders, setOrders, riders, openModal, toast, log, can } = useStore()
  const now = useNow()
  const [tab, setTab] = useState<'All' | 'New' | 'Waiting'>('All')
  const [zone, setZone] = useState('All zones')
  const unassigned = orders.filter(isUnassigned)
  const edit = can('Orders', 'Edit')

  const rows = unassigned.filter((o) => (zone === 'All zones' || zoneOf(pickupArea(o)) === zone) && (tab === 'All' || queueStatus(o, now) === tab))

  const run = (ids: string[], label: string) => {
    const pool = orders.filter((o) => ids.includes(o.id))
    const preview = autoAssign(
      orders.map((o) => (ids.includes(o.id) || !isUnassigned(o) ? o : { ...o, status: 'Cancelled' as const })),
      riders,
    )
    openModal({
      title: label,
      message: `${Object.keys(preview.assignments).length} of ${pool.length} orders can be matched now using rider distance, capacity and current workload.${preview.skipped.length ? ` ${preview.skipped.length} will stay in the queue (no rider with spare capacity nearby).` : ''}`,
      confirm: 'Assign',
      onConfirm: () => {
        const at = Date.now()
        setOrders(orders.map((o) => {
          const rid = preview.assignments[o.id]
          if (!rid || !ids.includes(o.id)) return o
          return { ...o, riderId: rid, status: 'Processing', alert: undefined, events: [...o.events, { status: 'Processing', at, by: 'Auto-assign' }, { status: 'Note', at, by: 'Auto-assign', note: `Assigned to ${riders.find((r) => r.id === rid)?.name}` }] }
        }))
        log(`Auto-assigned ${Object.keys(preview.assignments).length} orders`, 'Orders')
        toast(`${Object.keys(preview.assignments).length} orders assigned`)
      },
    })
  }

  const columns: Column<Order>[] = [
    { key: 'order', header: 'Order', sort: (a, b) => a.placedAt - b.placedAt, render: (o) => <div><strong>{o.id}</strong><div className="subtext">{minutesSince(o.placedAt, now)} min ago</div></div> },
    { key: 'customer', header: 'Customer', sort: (a, b) => a.customer.localeCompare(b.customer), render: (o) => o.customer },
    { key: 'route', header: 'Route', render: (o) => shortRoute(o) },
    { key: 'value', header: 'Order value', sort: (a, b) => a.total - b.total, render: (o) => <b>{kes(o.total)}</b> },
    { key: 'status', header: 'Status', render: (o) => <Badge tone={tone(queueStatus(o, now))}>{queueStatus(o, now)}</Badge> },
  ]

  return (
    <>
      <PageHead
        title="Order queue"
        desc="Unassigned orders waiting for a rider."
        actions={<Btn variant="primary" disabled={!edit || unassigned.length === 0} onClick={() => run(unassigned.map((o) => o.id), 'Auto-assign all orders?')}>Auto-assign all</Btn>}
      />
      <div style={{ marginBottom: 13 }}>
        <Notice>{`${unassigned.length} orders are waiting for assignment. Auto-assign uses rider distance, capacity, and current workload.`}</Notice>
      </div>
      <div className="tabs" style={{ padding: 0, margin: '0 0 13px' }} role="tablist">
        {([['All', 'All orders', unassigned.length], ['New', 'New', unassigned.filter((o) => queueStatus(o, now) === 'New').length], ['Waiting', 'Waiting over 10 min', unassigned.filter((o) => queueStatus(o, now) === 'Waiting').length]] as const).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label} <b>{n}</b></button>
        ))}
      </div>
      <DataTable
        title="Unassigned orders"
        rows={rows}
        rowKey={(o) => o.id}
        columns={columns}
        searchLabel="Search order or customer"
        searchText={(o) => `${o.id} ${o.customer} ${shortRoute(o)}`}
        tools={<select className="select" aria-label="Zone" value={zone} onChange={(e) => setZone(e.target.value)}>{['All zones', 'Westlands', 'Kilimani', 'CBD', 'Karen', 'Greater Nairobi'].map((z) => <option key={z}>{z}</option>)}</select>}
        bulk={{ label: 'Assign selected', onClick: (ids) => (edit ? run(ids, `Assign ${ids.length} selected orders?`) : toast('Your role can’t assign orders')) }}
        empty="Every order has a rider. Nice work."
        actions={(o) => <Btn small disabled={!edit} onClick={() => toAssign(o.id)}>Assign</Btn>}
      />
    </>
  )
}

// ---- assign / reassign ------------------------------------------------------------------------------------------------

type SortBy = 'Recommended match' | 'Distance' | 'Rating'

function RiderChoice({ order, mode, sort = 'Recommended match' }: { order: Order; mode: 'assign' | 'reassign'; sort?: SortBy }) {
  const { orders, riders, assignRider, openModal, toast, log, can } = useStore()
  const [reason, setReason] = useState('Rider requested assistance')
  const all = useMemo(() => rankRiders(order, riders, orders, sort), [order, riders, orders, sort])
  const list = all.slice(0, 6)
  const [picked, setPicked] = useState<string>()
  const chosen = list.find((c) => c.rider.id === picked) ?? list[0]
  const current = riders.find((r) => r.id === order.riderId)

  const confirm = () => {
    if (!chosen) return
    openModal({
      title: mode === 'assign' ? 'Assign order?' : 'Reassign order?',
      message: mode === 'assign' ? `${chosen.rider.name} will be notified about order ${order.id}.` : `${current?.name ?? 'The current rider'} will be told, and ${chosen.rider.name} will receive the order details.`,
      confirm: mode === 'assign' ? `Assign ${chosen.rider.name.split(' ')[0]}` : 'Confirm reassignment',
      onConfirm: () => {
        assignRider(order.id, chosen.rider.id, mode === 'reassign' ? reason : undefined)
        log(`${mode === 'assign' ? 'Assigned' : 'Reassigned'} ${order.id} to ${chosen.rider.name}`, 'Orders')
        toast(`${chosen.rider.name} ${mode === 'assign' ? 'assigned' : 'now has'} ${order.id}`)
        navigate(mode === 'assign' ? '/dispatch/queue' : `/dispatch/live/${order.id}`)
      },
    })
  }

  return (
    <>
      <div className="panel-sub" style={{ margin: '7px 0' }}>{`${all.length} riders nearby · ${all.filter((c) => c.live === 'Online').length} available`}</div>
      {list.map((c) => (
        <label key={c.rider.id} className={`rider-option ${chosen?.rider.id === c.rider.id ? 'selected' : ''}`}>
          <input type="radio" name="rider" className="check" checked={chosen?.rider.id === c.rider.id} onChange={() => setPicked(c.rider.id)} />
          {riderImg()}
          <span style={{ flex: 1 }}>
            <strong>{c.rider.name}</strong>
            <small>{`★ ${c.rider.rating.toFixed(1)} · ${c.km} km away · ${mode === 'assign' ? `Load ${c.load}/3` : `${c.load} active orders`}`}</small>
          </span>
          <Badge tone={tone(c.live)}>{c.live}</Badge>
        </label>
      ))}
      {list.length === 0 && <Notice tone="warning" mark="!">No rider with spare capacity is nearby. Try again in a few minutes, or contact a rider directly.</Notice>}
      <div className="form-actions" style={{ marginTop: 10 }}>
        {mode === 'reassign' && <div style={{ flex: 1 }}><Field label="Reason for reassignment" value={reason} onChange={setReason} options={['Rider requested assistance', 'Vehicle issue', 'Order delay', 'Other']} /></div>}
        <Btn onClick={() => navigate(mode === 'assign' ? '/dispatch/queue' : `/dispatch/live/${order.id}`)}>Cancel</Btn>
        <Btn variant="primary" disabled={!chosen || !can('Orders', 'Edit')} onClick={confirm}>{mode === 'assign' ? `Assign ${chosen?.rider.name ?? 'rider'}` : 'Confirm reassignment'}</Btn>
      </div>
    </>
  )
}

export function AssignRider({ id }: { id?: string }) {
  const { orders } = useStore()
  const order = id ? orders.find((o) => o.id === id) : orders.find(isUnassigned)
  const [sort, setSort] = useState<SortBy>('Recommended match')
  const { riders } = useStore()

  if (!order) {
    return (
      <>
        <PageHead title="Assign rider" desc="Choose a nearby rider for an order." actions={<Btn onClick={() => navigate('/dispatch/queue')}>Back to queue</Btn>} />
        <Notice mark="✓" tone="success">{id ? `We couldn’t find order ${id}.` : 'There are no unassigned orders right now.'}</Notice>
      </>
    )
  }
  if (!isUnassigned(order)) {
    return (
      <>
        <PageHead title="Assign rider" desc={`Order ${order.id} already has a rider.`} actions={<Btn onClick={() => navigate('/dispatch/queue')}>Back to queue</Btn>} />
        <Notice>This order is with {riders.find((r) => r.id === order.riderId)?.name ?? 'a rider'}. Use Reassign order to change the rider.</Notice>
      </>
    )
  }

  return (
    <>
      <PageHead title="Assign rider" desc={`Choose a nearby rider for order ${order.id}.`} actions={<Btn onClick={() => navigate('/dispatch/queue')}>Back to queue</Btn>} />
      <section className="card panel" style={{ maxWidth: 760 }}>
        <div className="panel-head">
          <div>
            <h2>{`Order ${order.id} · ${kes(order.total)}`}</h2>
            <div className="panel-sub">{`Pickup: ${order.pickup} · Drop-off: ${order.area}`}</div>
          </div>
          <Badge tone="blue">Unassigned</Badge>
        </div>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <Field label="Zone" value={`${zoneOf(pickupArea(order))}, Nairobi`} onChange={() => {}} options={[`${zoneOf(pickupArea(order))}, Nairobi`]} />
          <Field label="Sort nearby riders by" value={sort} onChange={(v) => setSort(v as SortBy)} options={['Recommended match', 'Distance', 'Rating']} />
        </div>
        <RiderChoice order={order} mode="assign" sort={sort} />
      </section>
    </>
  )
}

export function ReassignOrder({ id }: { id?: string }) {
  const { orders, riders } = useStore()
  const order = id ? orders.find((o) => o.id === id) : orders.find((o) => o.riderId && (o.status === 'Out for delivery' || o.status === 'Processing'))
  if (!order || !order.riderId) {
    return (
      <>
        <PageHead title="Reassign order" desc="Move an order to another available rider." actions={<Btn onClick={() => navigate('/dispatch')}>Back to dispatch</Btn>} />
        <Notice>{id ? `Order ${id} has no rider to replace.` : 'There are no assigned orders to reassign right now.'}</Notice>
      </>
    )
  }
  const current = riders.find((r) => r.id === order.riderId)!

  return (
    <>
      <PageHead title="Reassign order" desc={`Move order ${order.id} to another available rider.`} actions={<Btn onClick={() => navigate(`/dispatch/live/${order.id}`)}>Return to order</Btn>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(280px,.85fr)', alignItems: 'start' }}>
        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Choose replacement rider</h2>
              <div className="panel-sub">Recommended by distance, rating, and active load</div>
            </div>
          </div>
          <RiderChoice order={order} mode="reassign" />
        </section>
        <Panel title="Order snapshot">
          <SettingRow title="Order" sub={`${order.id} · ${kes(order.total)}`} right={<Badge tone="amber">{order.status}</Badge>} />
          <SettingRow title="Current rider" sub={`${current.name} · ${current.rating.toFixed(1)} rating`} />
          <SettingRow title="Pickup" sub={order.pickup} />
          <SettingRow title="Drop-off" sub={`${order.area} · ${order.address}`} />
        </Panel>
      </div>
    </>
  )
}

// ---- live order ------------------------------------------------------------------------------------------------------------

function MessageForm({ name, orderId }: { name: string; orderId: string }) {
  const { closeDrawer, toast, log } = useStore()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  return (
    <>
      <Field label="Message" multiline value={text} onChange={(v) => { setText(v); setError('') }} placeholder={`Sent to ${name}'s app`} error={error} />
      <Btn variant="primary" onClick={() => { if (text.trim().length < 3) return setError('Write a message first'); log(`Messaged ${name} about ${orderId}`, 'Orders'); closeDrawer(); toast(`Message sent to ${name.split(' ')[0]}`) }}>Send message</Btn>
    </>
  )
}

export function LiveOrder({ id }: { id?: string }) {
  const { orders, setOrders, riders, customers, openDrawer, closeDrawer, openModal, toast, log, can } = useStore()
  const order = id ? orders.find((o) => o.id === id) : orders.find((o) => o.status === 'Out for delivery')
  const [progress, setProgress] = useState(0.25)

  useEffect(() => {
    const t = setInterval(() => setProgress((p) => Math.min(0.95, p + 0.03)), 3000)
    return () => clearInterval(t)
  }, [])

  if (!order) {
    return (
      <>
        <PageHead title="Live order detail" desc="Follow an order on its way to the customer." actions={<Btn onClick={() => navigate('/dispatch')}>Back to dispatch</Btn>} />
        <Notice>{id ? `We couldn’t find order ${id}.` : 'No order is on the road right now.'}</Notice>
      </>
    )
  }
  const rider = riders.find((r) => r.id === order.riderId)
  const customer = customers.find((c) => c.id === order.customerId)
  const from = posOf(pickupArea(order))
  const to = posOf(order.area)
  const out = order.status === 'Out for delivery'
  const p = out ? progress : order.status === 'Delivered' ? 1 : 0
  const at = { lat: from.lat + (to.lat - from.lat) * p, lng: from.lng + (to.lng - from.lng) * p }
  const kmLeft = Math.max(0.1, Math.round(Math.hypot(to.lat - at.lat, to.lng - at.lng) * 0.12 * 10) / 10)
  const etaMin = out ? Math.max(1, Math.round(kmLeft * 4)) : 0
  const steps = [
    { done: true, title: 'Order placed', sub: `${dateTime(order.placedAt)} · ${order.pay === 'Paid' ? 'Customer payment confirmed' : 'Awaiting payment'}` },
    { done: order.status !== 'Pending', title: 'Picked up from store', sub: `${order.status === 'Pending' ? 'Not yet' : 'Picked up'} · ${order.pickup}` },
    { done: out || order.status === 'Delivered', title: 'Rider en route', sub: rider ? `${rider.name} · ${out ? `${kmLeft} km from drop-off` : '—'}` : 'No rider yet' },
    { done: order.status === 'Delivered', title: 'Delivered', sub: out ? `Estimated in ${etaMin} min` : order.status === 'Delivered' ? 'Completed' : '—' },
  ]

  const markDelivered = () =>
    openModal({
      title: 'Mark as delivered?',
      message: 'Use this only when the rider has confirmed the handover. Cash orders are marked paid.',
      confirm: 'Mark delivered',
      onConfirm: () => {
        const now = Date.now()
        setOrders(orders.map((o) => (o.id === order.id ? { ...o, status: 'Delivered', pay: o.method === 'Cash on delivery' ? 'Paid' : o.pay, alert: undefined, events: [...o.events, { status: 'Delivered', at: now, by: 'Dispatch' }] } : o)))
        log(`Marked ${order.id} delivered`, 'Orders')
        toast('Order marked as delivered')
      },
    })

  return (
    <>
      <PageHead
        title="Live order detail"
        desc={`Order ${order.id} · Placed ${dateTime(order.placedAt)}`}
        actions={
          <>
            <Btn disabled={!rider || !can('Orders', 'Edit')} onClick={() => navigate(`/dispatch/reassign/${order.id}`)}>Reassign rider</Btn>
            <Btn
              variant="primary"
              onClick={() =>
                openDrawer({
                  title: 'Order actions',
                  body: (
                    <>
                      <SettingRow title="Open order record" sub="Items, payment and notes" right={<Btn small onClick={() => { closeDrawer(); navigate(`/orders/${order.id}`) }}>Open</Btn>} />
                      {out && <SettingRow title="Mark as delivered" sub="After the rider confirms the handover" right={<Btn small disabled={!can('Orders', 'Edit')} onClick={() => { closeDrawer(); markDelivered() }}>Mark</Btn>} />}
                      {order.alert && <SettingRow title="Clear alert" sub={order.alert.reason} right={<Btn small disabled={!can('Orders', 'Edit')} onClick={() => { setOrders(orders.map((o) => (o.id === order.id ? { ...o, alert: undefined } : o))); closeDrawer(); toast('Alert cleared') }}>Clear</Btn>} />}
                    </>
                  ),
                })
              }>
              More actions
            </Btn>
          </>
        }
      />
      <div className="route-panel">
        <div className="grid">
          <Panel title="Delivery timeline" sub={out ? 'Order is on the way to the customer' : `Order is ${order.status.toLowerCase()}`} right={<Badge tone={out ? 'amber' : order.status === 'Delivered' ? 'green' : 'blue'}>{out ? 'In progress' : order.status}</Badge>}>
            {steps.map((s) => (
              <div key={s.title} className={`timeline-step ${s.done ? 'done' : ''}`}>
                <i className="timeline-dot" />
                <div>
                  <strong>{s.title}</strong>
                  <small>{s.sub}</small>
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="Rider location" sub="Live location · Updated a few seconds ago" right={<Btn small onClick={() => toast('Rider location refreshed')}>Refresh</Btn>}>
            <MapView
              height={300}
              pins={[...(rider ? [{ id: 'rider', at: out ? at : rider.at, kind: 'rider' as const, label: rider.name[0]!, title: rider.name }] : []), { id: 'drop', at: to, kind: 'order' as const, label: customer?.name[0] ?? 'C', title: `Drop-off · ${order.area}` }]}
              lines={[{ id: 'route', points: [out ? at : from, to] }]}
            />
          </Panel>
        </div>
        <div className="grid">
          <Panel title="Assigned rider" sub="Currently completing this delivery" right={rider && <Badge tone={tone(liveStatus(rider, riderLoad(orders, rider.id)))}>{liveStatus(rider, riderLoad(orders, rider.id))}</Badge>}>
            {rider ? (
              <div className="rider-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {riderImg()}
                <span style={{ flex: 1 }}><strong>{rider.name}</strong><small>{`★ ${rider.rating.toFixed(1)} · Rider ID RD-${1000 + Number(rider.id.slice(1))}`}</small></span>
                <a className="icon-btn" href={`tel:${rider.phone.replace(/\s/g, '')}`} aria-label="Call rider">☎</a>
                <button className="icon-btn" aria-label="Message rider" onClick={() => openDrawer({ title: `Message ${rider.name}`, body: <MessageForm name={rider.name} orderId={order.id} /> })}>✉</button>
              </div>
            ) : (
              <Notice tone="warning" mark="!">No rider yet. <button className="link-btn" onClick={() => navigate(`/dispatch/assign/${order.id}`)}>Assign one</button></Notice>
            )}
          </Panel>
          <Panel title="Customer and delivery">
            <SettingRow title={order.customer} sub={customer?.phone} right={<a className="icon-btn" href={`tel:${(customer?.phone ?? '').replace(/\s/g, '')}`} aria-label="Call customer">☎</a>} />
            <SettingRow title="Drop-off address" sub={order.address} right={<Btn small onClick={() => { navigator.clipboard?.writeText(order.address).then(() => toast('Address copied'), () => toast('Copy it manually')) }}>Copy</Btn>} />
            <SettingRow title="Order total" sub={`${kes(order.total)} · ${order.method === 'Cash on delivery' ? 'Cash on delivery' : `Paid by ${order.method}`}`} right={<Badge tone={tone(order.pay)}>{order.pay}</Badge>} />
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- delayed and stuck ------------------------------------------------------------------------------------------------------------

export function DelayedOrders() {
  const { orders, setOrders, riders, openDrawer, closeDrawer, toast, log, can } = useStore()
  const [level, setLevel] = useState('All alerts')
  const [zone, setZone] = useState('All zones')
  const alerts = orders.filter((o) => o.alert)
  const rows = alerts.filter((o) => (level === 'All alerts' || o.alert!.level === level) && (zone === 'All zones' || zoneOf(o.area) === zone))
  const riderOf = (o: Order) => riders.find((r) => r.id === o.riderId)

  const columns: Column<Order>[] = [
    { key: 'order', header: 'Order / Rider', render: (o) => <div><strong>{o.id}</strong><div className="subtext">{riderOf(o)?.name ?? 'No rider'}</div></div> },
    { key: 'reason', header: 'Alert reason', render: (o) => o.alert!.reason },
    { key: 'zone', header: 'Zone', render: (o) => zoneOf(o.area) },
    { key: 'delay', header: 'Delay', sort: (a, b) => a.alert!.lateMin - b.alert!.lateMin, render: (o) => <b style={{ color: 'var(--red)' }}>{`${o.alert!.lateMin} min late`}</b> },
    { key: 'priority', header: 'Priority', render: (o) => <Badge tone={tone(o.alert!.level)}>{o.alert!.level}</Badge> },
  ]

  const investigate = (o: Order) => {
    const r = riderOf(o)
    openDrawer({
      title: `Delayed order ${o.id}`,
      body: (
        <>
          <Notice tone="warning" mark="!">{`${o.alert!.reason} · ${o.alert!.lateMin} min late`}</Notice>
          <SettingRow title="Rider" sub={r ? `${r.name} · ${r.phone}` : 'No rider'} right={r && <a className="btn small" href={`tel:${r.phone.replace(/\s/g, '')}`}>Call</a>} />
          <SettingRow title="Customer" sub={o.customer} right={<Btn small onClick={() => { closeDrawer(); navigate(`/orders/${o.id}`) }}>Open order</Btn>} />
          <SettingRow title="Route" sub={`${o.pickup} → ${o.address}`} />
          <div className="actions" style={{ marginTop: 16 }}>
            <Btn onClick={() => { closeDrawer(); navigate(`/dispatch/live/${o.id}`) }}>Track live</Btn>
            <Btn disabled={!o.riderId || !can('Orders', 'Edit')} onClick={() => { closeDrawer(); navigate(`/dispatch/reassign/${o.id}`) }}>Reassign</Btn>
            <Btn variant="primary" disabled={!can('Orders', 'Edit')} onClick={() => { setOrders(orders.map((x) => (x.id === o.id ? { ...x, alert: undefined } : x))); log(`Resolved delay alert · ${o.id}`, 'Orders'); closeDrawer(); toast('Alert resolved') }}>Mark resolved</Btn>
          </div>
        </>
      ),
    })
  }

  const count = (pred: (o: Order) => boolean) => alerts.filter(pred).length
  return (
    <>
      <PageHead
        title="Delayed and stuck orders alerts"
        desc="Orders that need attention from dispatch."
        actions={
          <>
            <Btn onClick={() => { log('Notified all riders about delayed orders', 'Orders'); toast('Riders have been notified') }}>Notify all riders</Btn>
            <Btn onClick={() => { downloadCsv('alerts.csv', ['Order', 'Rider', 'Reason', 'Zone', 'Late (min)', 'Priority'], rows.map((o) => [o.id, riderOf(o)?.name ?? '', o.alert!.reason, zoneOf(o.area), o.alert!.lateMin, o.alert!.level])); toast('Alerts exported') }}>Export alerts</Btn>
          </>
        }
      />
      <div className="grid stats" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <Stat label="Delayed orders" value={String(alerts.length)} trend={`${count((o) => o.alert!.lateMin > 15)} over 15 minutes`} icon="!" up={alerts.length === 0} />
        <Stat label="Pickup wait" value={String(count((o) => o.alert!.reason.startsWith('Pickup')))} trend="Waiting at the store" icon="⌛" up={false} />
        <Stat label="No movement" value={String(count((o) => o.alert!.reason.startsWith('No movement')))} trend="More than 10 minutes" icon="↔" up={false} />
        <Stat label="At-risk orders" value={String(count((o) => o.alert!.level === 'At risk'))} trend="ETA may be missed" icon="◷" up={false} />
      </div>
      {count((o) => o.alert!.level === 'Stuck') > 0 && <div style={{ marginBottom: 13 }}><Notice tone="warning" mark="!">{`${count((o) => o.alert!.level === 'Stuck')} order has not moved for more than 10 minutes. Review the rider’s location and contact the customer if needed.`}</Notice></div>}
      <DataTable
        title="Needs attention"
        rows={rows}
        rowKey={(o) => o.id}
        columns={columns}
        searchLabel="Search order or rider"
        searchText={(o) => `${o.id} ${o.customer} ${riderOf(o)?.name ?? ''} ${o.alert!.reason}`}
        tools={
          <>
            <select className="select" aria-label="Alert type" value={level} onChange={(e) => setLevel(e.target.value)}>{['All alerts', 'Delayed', 'Stuck', 'At risk'].map((l) => <option key={l}>{l}</option>)}</select>
            <select className="select" aria-label="Zone" value={zone} onChange={(e) => setZone(e.target.value)}>{['All zones', 'Westlands', 'Kilimani', 'CBD', 'Karen'].map((z) => <option key={z}>{z}</option>)}</select>
          </>
        }
        empty="No delayed orders. Deliveries are on track."
        actions={(o) => <Btn small onClick={() => investigate(o)}>Investigate</Btn>}
      />
    </>
  )
}
