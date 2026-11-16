import { useCallback, useEffect, useRef, useState } from 'react'

import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, Tabs, type Column } from '../components/ui'
import { ApiError, get, post } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

// ---- what the server sends ----------------------------------------------------------------------------

type Status = 'Pending' | 'Processing' | 'Packed' | 'Out for delivery' | 'Shipped' | 'Delivered' | 'Cancelled'
type Method = 'mpesa' | 'card' | 'cod' | null

interface Row {
  id: string; number: string; customerId: string; customer: string; phone: string | null; area: string | null; itemCount: number
  totalCents: number; status: Status; paymentMethod: Method; paid: boolean; createdAt: string
}
interface Stats { byStatus: Record<string, number>; todayOrders: number; todayPaid: number; todayRevenueCents: number }
interface Detail {
  id: string; number: string; status: Status; rawStatus: string; canCancel: boolean; totalCents: number; subtotalCents: number; deliveryFeeCents: number; refundedCents: number
  paymentMethod: Method; paymentRef: string | null; paid: boolean; cashDueCents: number; createdAt: string
  customer: { id: string; name: string; phone: string; email: string }
  delivery: { name: string; phone: string; area: string; address: string }
  items: { productId: string; sku: string; name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[]
  events: { kind: string; at: string; by?: string; note?: string }[]
  packing: { stage: 'pick' | 'packed'; picked: string[]; packedAt: string | null; packedBy: string | null }
  dispatch: { deliveryId: string; status: string; riderId: string; riderName: string; riderPhone: string; vehicle: string | null; plate: string | null } | null
}
interface RiderOption { id: string; name: string; zone: string | null; availability: 'online' | 'offline'; vehicle: string | null; activeDeliveries: number }

const METHOD_TEXT = { mpesa: 'M-Pesa', card: 'Card', cod: 'Cash on delivery' } as const
const methodText = (m: Method) => (m ? METHOD_TEXT[m] : '—')
const TABS = ['All', 'Pending', 'Processing', 'Packed', 'Out for delivery', 'Delivered', 'Cancelled'] as const
const statusTone = (s: Status) => (s === 'Delivered' ? 'green' : s === 'Cancelled' ? 'red' : s === 'Pending' ? 'amber' : 'blue')
const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (cents: number) => cents / 100

// ---- the list -----------------------------------------------------------------------------------------

export function OrdersList() {
  const { can, toast } = useStore()
  const q = useQuery()
  const customerId = q.get('customer')
  const [tab, setTab] = useState<(typeof TABS)[number]>('All')
  const [method, setMethod] = useState('All payments')
  const [rows, setRows] = useState<Row[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [more, setMore] = useState(false)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)

  // Loads the first page whenever a filter changes (and every minute, so new app orders show up on their own).
  useEffect(() => {
    const mine = ++seq.current
    const params = new URLSearchParams({ limit: '100' })
    if (tab !== 'All') params.set('status', tab)
    const m = Object.entries(METHOD_TEXT).find(([, t]) => t === method)?.[0]
    if (m) params.set('method', m)
    if (customerId) params.set('customerId', customerId)
    void Promise.all([get<{ items: Row[]; nextCursor: string | null }>(`/v1/admin/orders?${params}`), get<Stats>('/v1/admin/orders/stats')]).then(
      ([list, s]) => { if (mine === seq.current) { setRows(list.items); setNext(list.nextCursor); setStats(s); setState('ready') } },
      () => { if (mine === seq.current) setState((cur) => (cur === 'ready' ? cur : 'error')) },
    )
  }, [tab, method, customerId, tick])
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const loadMore = async () => {
    if (!next) return
    setMore(true)
    try {
      const params = new URLSearchParams({ limit: '100', cursor: next })
      if (tab !== 'All') params.set('status', tab)
      const m = Object.entries(METHOD_TEXT).find(([, t]) => t === method)?.[0]
      if (m) params.set('method', m)
      if (customerId) params.set('customerId', customerId)
      const page = await get<{ items: Row[]; nextCursor: string | null }>(`/v1/admin/orders?${params}`)
      setRows((r) => [...r, ...page.items])
      setNext(page.nextCursor)
    } catch (e) { toast(says(e)) } finally { setMore(false) }
  }

  const by = stats?.byStatus ?? {}
  const columns: Column<Row>[] = [
    { key: 'id', header: 'Order', sort: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt), render: (o) => <button className="link-btn" onClick={() => navigate(`/orders/${o.id}`)}>{o.number}</button> },
    {
      key: 'customer', header: 'Customer', sort: (a, b) => a.customer.localeCompare(b.customer),
      render: (o) => (
        <div className="product-cell" style={{ minWidth: 130 }}>
          <AvatarTile text={o.customer.split(' ').map((p) => p[0]).join('').slice(0, 2)} />
          <div>
            <div className="prod-name">{o.customer}</div>
            <div className="subtext">{o.area ?? o.phone ?? ''}</div>
          </div>
        </div>
      ),
    },
    { key: 'items', header: 'Items', render: (o) => o.itemCount },
    { key: 'total', header: 'Total', sort: (a, b) => a.totalCents - b.totalCents, render: (o) => <b>{kes(shillings(o.totalCents))}</b> },
    { key: 'pay', header: 'Payment', render: (o) => <span><Badge tone={o.paid ? 'green' : o.status === 'Cancelled' ? 'gray' : 'amber'}>{o.paid ? 'Paid' : o.status === 'Cancelled' ? 'Not paid' : o.paymentMethod === 'cod' ? 'Cash due' : 'Awaiting'}</Badge> <span className="subtext">{methodText(o.paymentMethod)}</span></span> },
    { key: 'status', header: 'Status', sort: (a, b) => a.status.localeCompare(b.status), render: (o) => <Badge tone={statusTone(o.status)}>{o.status}</Badge> },
    { key: 'placed', header: 'Placed', render: (o) => dateTime(Date.parse(o.createdAt)) },
  ]

  return (
    <>
      <PageHead
        title="Orders"
        desc={customerId ? 'Orders placed by one customer.' : 'Orders placed in the ShopCore app. Pack them, send them out and follow them to the door.'}
        actions={
          <>
            {customerId && <Btn onClick={() => navigate('/orders')}>Clear customer filter</Btn>}
            <Btn onClick={() => setTick((n) => n + 1)}>Refresh</Btn>
            <Btn disabled={!can('Orders', 'Export') || !rows.length} onClick={() => { downloadCsv('orders.csv', ['Order', 'Customer', 'Phone', 'Total (KES)', 'Payment', 'Status', 'Placed'], rows.map((o) => [o.number, o.customer, o.phone ?? '', shillings(o.totalCents), `${methodText(o.paymentMethod)} · ${o.paid ? 'Paid' : 'Not paid'}`, o.status, o.createdAt])); toast('Orders exported') }}>Export</Btn>
          </>
        }
      />
      <div className="tile-row">
        <Stat label="Orders today" value={String(stats?.todayOrders ?? '—')} trend="Since midnight" icon="▣" />
        <Stat label="Awaiting packing" value={String((by.Processing ?? 0) + (by.Packed ?? 0))} trend="Paid, not yet out" icon="◷" up={false} />
        <Stat label="Out for delivery" value={String(by['Out for delivery'] ?? 0)} trend="With riders now" icon="⌖" />
        <Stat label="Paid today" value={kes(shillings(stats?.todayRevenueCents ?? 0))} trend={`${stats?.todayPaid ?? 0} paid orders`} icon="↗" />
      </div>
      <section className="card" style={{ marginBottom: 14 }}>
        <Tabs tabs={TABS} value={tab} onChange={(t) => { setState('loading'); setTab(t) }} />
      </section>
      <DataTable
        title={tab === 'All' ? 'All orders' : `${tab} orders`}
        rows={rows}
        rowKey={(o) => o.id}
        columns={columns}
        loading={state === 'loading'}
        error={state === 'error' ? 'We couldn’t load the orders.' : undefined}
        onRetry={() => { setState('loading'); setTick((n) => n + 1) }}
        searchLabel="Search orders"
        emptyTitle="No orders here"
        empty="Orders placed in the ShopCore app show up here as they come in."
        searchText={(o) => `${o.number} ${o.customer} ${o.phone ?? ''} ${o.area ?? ''} ${methodText(o.paymentMethod)}`}
        tools={
          <select className="select" aria-label="Payment method" value={method} onChange={(e) => { setState('loading'); setMethod(e.target.value) }}>
            <option>All payments</option><option>M-Pesa</option><option>Card</option><option>Cash on delivery</option>
          </select>
        }
        actions={(o) => <Btn small onClick={() => navigate(`/orders/${o.id}`)}>View</Btn>}
      />
      {next && <div style={{ textAlign: 'center', margin: '12px 0' }}><Btn disabled={more} onClick={() => void loadMore()}>{more ? 'Loading…' : 'Load older orders'}</Btn></div>}
    </>
  )
}

// ---- one order ----------------------------------------------------------------------------------------

/** Tickets and refund requests linked to an order, each a link to the right page. */
function OrderSupport({ orderId }: { orderId: string }) {
  const { can } = useStore()
  const tickets = useGet<{ items: { id: string; number: string; subject: string; status: string }[] }>(can('Support', 'View') ? `/v1/admin/tickets?orderId=${orderId}&limit=10` : null)
  const refunds = useGet<{ items: { id: string; number: string; amountCents: number; status: string }[] }>(can('Claims', 'View') ? `/v1/admin/refunds?orderId=${orderId}&limit=10` : null)
  if (!can('Support', 'View') && !can('Claims', 'View')) return null
  const t = tickets.data?.items ?? []
  const r = refunds.data?.items ?? []
  return (
    <Panel title="Support" sub="Tickets and refund requests for this order">
      {t.map((x) => <div className="list-row" key={x.id}><span><button className="link-btn" onClick={() => navigate(`/support/tickets/${x.id}`)}>{x.number}</button><small className="panel-sub" style={{ display: 'block' }}>{x.subject}</small></span><Badge tone={x.status === 'resolved' ? 'green' : 'amber'}>{x.status}</Badge></div>)}
      {r.map((x) => <div className="list-row" key={x.id}><span><button className="link-btn" onClick={() => navigate(`/support/refunds/${x.id}`)}>{x.number}</button><small className="panel-sub" style={{ display: 'block' }}>{kes(x.amountCents / 100)}</small></span><Badge tone={x.status === 'rejected' ? 'red' : x.status === 'needs_review' ? 'amber' : 'green'}>{x.status.replace('_', ' ')}</Badge></div>)}
      {t.length === 0 && r.length === 0 && <p className="panel-sub">Nothing on file for this order.</p>}
    </Panel>
  )
}

function NoteForm({ order, onSaved }: { order: Detail; onSaved: (d: Detail) => void }) {
  const { closeModal, toast } = useStore()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (text.trim().length < 3) return setError('Write a note first')
    setBusy(true)
    try {
      onSaved(await post<Detail>(`/v1/admin/orders/${order.id}/notes`, { text: text.trim() }))
      closeModal()
      toast('Note added')
    } catch (e) { setError(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <Field label="Internal note" multiline value={text} onChange={(v) => { setText(v); setError('') }} placeholder="Only your staff can see this" error={error} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" disabled={busy} onClick={() => void save()}>Save note</Btn>
      </div>
    </>
  )
}

export function OrderDetail({ id }: { id: string }) {
  const { can, openModal, toast } = useStore()
  const [order, setOrder] = useState<Detail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [riders, setRiders] = useState<RiderOption[]>([])
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    void get<Detail>(`/v1/admin/orders/${id}`).then(
      (d) => { setOrder(d); setState('ready') },
      (e) => setState((cur) => (e instanceof ApiError && e.status === 404 ? 'missing' : cur === 'ready' ? cur : 'error')),
    )
  }, [id, tick])
  // Rider and delivery progress change on their own, so the page keeps itself fresh.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 20_000)
    return () => clearInterval(t)
  }, [])
  const canDispatch = can('Dispatch', 'Edit')
  const needsRiders = !!order && order.rawStatus === 'PAID' && !order.dispatch && canDispatch
  useEffect(() => {
    if (!needsRiders) return
    void get<{ items: (RiderOption & { status: string })[] }>('/v1/admin/riders?status=approved').then((r) => setRiders(r.items), () => setRiders([]))
  }, [needsRiders])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  const run = async (what: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try { await what(); toast(done); reload() } catch (e) { toast(says(e)) } finally { setBusy(false) }
  }

  if (state === 'loading') return <><PageHead title="Order" desc="Loading…" actions={<Btn onClick={() => navigate('/orders')}>Back to orders</Btn>} /></>
  if (state === 'error' && !order) {
    return (
      <>
        <PageHead title="Order" desc="We couldn’t load this order." actions={<Btn onClick={() => navigate('/orders')}>Back to orders</Btn>} />
        <Notice tone="warning" mark="!">Check your connection, then <button className="link-btn" onClick={() => { setState('loading'); reload() }}>try again</button>.</Notice>
      </>
    )
  }
  if (!order) {
    return (
      <>
        <PageHead title="Orders" desc="That order doesn’t exist." actions={<Btn onClick={() => navigate('/orders')}>Back to orders</Btn>} />
        <Notice tone="warning" mark="!">We couldn’t find that order.</Notice>
      </>
    )
  }

  const edit = can('Orders', 'Edit')
  const closed = order.status === 'Delivered' || order.status === 'Cancelled' || order.status === 'Shipped'
  const toPack = order.rawStatus === 'PAID' && order.packing.stage !== 'packed'
  const allPicked = order.items.every((i) => order.packing.picked.includes(i.productId))
  const onTheRoad = order.status === 'Out for delivery'

  const cancel = () =>
    openModal({
      title: `Cancel ${order.number}?`,
      message: order.paid && order.paymentMethod !== 'cod' ? 'The customer has already paid. Cancelling puts the stock back, and Finance then returns the money to them.' : 'The customer hasn’t paid, so nothing needs refunding. The stock goes back on the shelf.',
      confirm: 'Cancel order', cancelLabel: 'Keep order', danger: true,
      onConfirm: () => { void run(() => post(`/v1/orders/${order.id}/cancel`, { reason: 'Cancelled by staff' }), `Order ${order.number} cancelled`) },
    })

  const assign = (riderId: string) => {
    const r = riders.find((x) => x.id === riderId)
    if (!r) return
    const send = (force: boolean) => run(() => post(`/v1/admin/dispatch/orders/${order.id}/assign`, { riderId, force }), force ? `${r.name} was given the order` : `Offer sent to ${r.name}`)
    if (r.availability === 'online') { void send(false); return }
    openModal({ title: `${r.name} is offline`, message: 'Give them the order anyway? They’ll see it the next time they open the rider app.', confirm: 'Assign anyway', onConfirm: () => { void send(true) } })
  }

  const invoice = () => {
    downloadCsv(`${order.number}-invoice.csv`, ['Item', 'Qty', 'Unit price (KES)', 'Line total (KES)'], [...order.items.map((i) => [i.name, i.quantity, shillings(i.unitPriceCents), shillings(i.lineTotalCents)]), ['Delivery fee', 1, shillings(order.deliveryFeeCents), shillings(order.deliveryFeeCents)], ['Total', '', '', shillings(order.totalCents)]])
    toast('Invoice downloaded')
  }

  return (
    <>
      <PageHead
        title={`Order ${order.number}`}
        desc={`Placed ${dateTime(Date.parse(order.createdAt))} by ${order.customer.name}`}
        actions={
          <>
            <Btn onClick={() => navigate('/orders')}>Back to orders</Btn>
            <Btn onClick={reload}>Refresh</Btn>
            <Btn onClick={invoice}>Invoice</Btn>
            <Btn onClick={() => window.print()}>Print</Btn>
            {order.canCancel && !onTheRoad && <Btn variant="danger" disabled={!edit || busy} onClick={cancel}>Cancel order</Btn>}
            {toPack && <Btn variant="primary" disabled={!edit || busy || !allPicked} onClick={() => void run(() => post(`/v1/admin/packing/${order.id}/pack`), `${order.number} is packed`)}>Mark as packed</Btn>}
          </>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(280px,.8fr)', alignItems: 'start' }}>
        <div className="grid">
          <section className="card table-card">
            <div className="table-head">
              <h2>Items</h2>
              <Badge tone={statusTone(order.status)}>{order.status}</Badge>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>{toPack && <th>Picked</th>}<th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.productId}>
                      {toPack && (
                        <td>
                          <input type="checkbox" aria-label={`Picked ${i.name}`} disabled={!edit || busy} checked={order.packing.picked.includes(i.productId)}
                            onChange={(e) => void run(() => post(`/v1/admin/packing/${order.id}/pick`, { productId: i.productId, picked: e.target.checked }), e.target.checked ? 'Marked as picked' : 'Unmarked')} />
                        </td>
                      )}
                      <td>{can('Products', 'View') ? <button className="link-btn" onClick={() => navigate(`/products/${i.productId}`)}>{i.name}</button> : i.name}<div className="subtext">{i.sku}</div></td>
                      <td>{i.quantity}</td><td>{kes(shillings(i.unitPriceCents))}</td><td><b>{kes(shillings(i.lineTotalCents))}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 15px' }}>
              <SettingRow title="Subtotal" right={<span className="prod-name">{kes(shillings(order.subtotalCents))}</span>} />
              <SettingRow title="Delivery fee" right={<span className="prod-name">{kes(shillings(order.deliveryFeeCents))}</span>} />
              {order.subtotalCents + order.deliveryFeeCents > order.totalCents && <SettingRow title="Discount" right={<span className="prod-name">−{kes(shillings(order.subtotalCents + order.deliveryFeeCents - order.totalCents))}</span>} />}
              <SettingRow title="Total" right={<b>{kes(shillings(order.totalCents))}</b>} />
              {order.refundedCents > 0 && <SettingRow title="Refunded" right={<b style={{ color: 'var(--red)' }}>−{kes(shillings(order.refundedCents))}</b>} />}
            </div>
          </section>

          <Panel title="Activity" sub="Status changes and internal notes" right={<Btn small disabled={!edit} onClick={() => openModal({ title: 'Add internal note', body: <NoteForm order={order} onSaved={setOrder} />, noActions: true })}>+ Add note</Btn>}>
            <ul className="timeline">
              {[...order.events].reverse().map((e, i) => (
                <li key={i}>
                  <span className="dot" style={e.kind === 'Note' ? { background: '#9CA3AF' } : undefined} />
                  <span>
                    <strong>{e.kind}</strong>
                    {e.note && <span style={{ fontSize: 11 }}>{e.note}</span>}
                    <small style={{ display: 'block' }}>{e.by ? `${e.by} · ` : ''}{dateTime(Date.parse(e.at))}</small>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="grid">
          <OrderSupport orderId={order.id} />
          <Panel title="Customer">
            <div className="prod-name">{order.customer.name}</div>
            <div className="subtext" style={{ marginBottom: 8 }}>{[order.customer.phone, order.customer.email].filter(Boolean).join(' · ')}</div>
            <SettingRow title="Delivery address" sub={[order.delivery.name, order.delivery.address, order.delivery.area].filter(Boolean).join(', ')} />
            <div style={{ marginTop: 8 }}><Btn small onClick={() => navigate(`/orders?customer=${order.customer.id}`)}>All their orders</Btn></div>
          </Panel>
          <Panel title="Payment">
            <SettingRow title="Method" right={<span className="prod-name">{methodText(order.paymentMethod)}</span>} />
            <SettingRow title="Status" right={<Badge tone={order.paid ? 'green' : order.status === 'Cancelled' ? 'gray' : 'amber'}>{order.paid ? 'Paid' : order.status === 'Cancelled' ? 'Not paid' : order.cashDueCents ? 'Cash due' : 'Awaiting payment'}</Badge>} />
            {order.cashDueCents > 0 && <SettingRow title="Cash to collect" right={<b>{kes(shillings(order.cashDueCents))}</b>} />}
            {order.paymentRef && <SettingRow title="Reference" right={<code>{order.paymentRef}</code>} />}
            {order.status === 'Cancelled' && order.paid && order.paymentMethod !== 'cod' && order.refundedCents === 0 && <Notice tone="warning" mark="!">This paid order was cancelled. The money still needs to go back to the customer. Finance handles that.</Notice>}
          </Panel>
          <Panel title="Rider">
            {order.dispatch ? (
              <div className="list-row" style={{ paddingTop: 0 }}>
                <span>
                  <strong style={{ fontSize: 11, display: 'block' }}>{order.dispatch.riderName}</strong>
                  <small className="panel-sub">{[order.dispatch.vehicle, order.dispatch.plate, order.dispatch.riderPhone].filter(Boolean).join(' · ')}</small>
                  <small className="panel-sub" style={{ display: 'block' }}>{order.dispatch.status === 'offered' ? 'Waiting for them to accept' : order.dispatch.status.replace('_', ' ')}</small>
                </span>
                {can('Riders', 'View') && <Btn small onClick={() => navigate(`/riders/${order.dispatch!.riderId}`)}>View</Btn>}
              </div>
            ) : (
              <div className="panel-sub" style={{ marginBottom: 8 }}>{order.rawStatus === 'PAID' ? 'No rider assigned yet.' : closed ? '—' : 'A rider can be assigned once the order is paid.'}</div>
            )}
            {order.dispatch && !onTheRoad && !closed && canDispatch && (
              <Btn small disabled={busy} onClick={() => void run(() => post(`/v1/admin/dispatch/orders/${order.id}/unassign`), 'Rider removed')}>Take the rider off</Btn>
            )}
            {needsRiders && (
              <Field label="Assign a rider" value="" onChange={assign} disabled={busy}
                options={[{ value: '', label: riders.length ? 'Choose a rider…' : 'No approved riders yet' }, ...riders.map((r) => ({ value: r.id, label: `${r.name}${r.zone ? ` · ${r.zone}` : ''} · ${r.availability}${r.activeDeliveries ? ` · ${r.activeDeliveries} on now` : ''}` }))]} />
            )}
            {needsRiders && order.packing.stage !== 'packed' && <p className="panel-sub">Tip: pack the order first, so the rider finds it ready.</p>}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- creating an order by hand ------------------------------------------------------------------------

export function NewOrder() {
  return (
    <>
      <PageHead title="New order" desc="Orders are placed by customers in the ShopCore app." actions={<Btn onClick={() => navigate('/orders')}>Back to orders</Btn>} />
      <Notice tone="warning" mark="i">Customers place their own orders, and they appear here the moment they do. Creating an order for someone over the phone will come with the customer-management update.</Notice>
    </>
  )
}
