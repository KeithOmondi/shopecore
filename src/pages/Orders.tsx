import { useState } from 'react'
import { OrderSupport } from './order-support'

import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, Tabs, type Column } from '../components/ui'
import { ORDER_FLOW, type Order, type OrderStatus, type PayMethod } from '../data/commerce'
import { dateTime, kes } from '../lib/format'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'

const TABS = ['All', 'Pending', 'Processing', 'Out for delivery', 'Delivered', 'Cancelled'] as const
const payTone = (p: Order['pay']) => (p === 'Paid' ? 'green' : p === 'Pending' ? 'amber' : p === 'Failed' ? 'red' : 'gray')
const statusTone = (s: OrderStatus) => (s === 'Delivered' ? 'green' : s === 'Cancelled' || s === 'Refunded' ? 'red' : s === 'Pending' ? 'amber' : 'blue')

export function OrdersList() {
  const { orders, customers, can, toast } = useStore()
  const q = useQuery()
  const customerId = q.get('customer')
  const [tab, setTab] = useState<(typeof TABS)[number]>('All')
  const [method, setMethod] = useState('All payments')
  const [todayKey] = useState(() => new Date().toDateString())

  const scoped = customerId ? orders.filter((o) => o.customerId === customerId) : orders
  const inTab = (o: Order) => tab === 'All' || (tab === 'Cancelled' ? o.status === 'Cancelled' || o.status === 'Refunded' : o.status === tab)
  const rows = scoped.filter((o) => inTab(o) && (method === 'All payments' || o.method === method))
  const today = scoped.filter((o) => new Date(o.placedAt).toDateString() === todayKey)
  const revenue = scoped.filter((o) => o.pay === 'Paid').reduce((n, o) => n + o.total, 0)
  const customer = customers.find((c) => c.id === customerId)

  const columns: Column<Order>[] = [
    { key: 'id', header: 'Order', sort: (a, b) => a.placedAt - b.placedAt, render: (o) => <button className="link-btn" onClick={() => navigate(`/orders/${o.id}`)}>{o.id}</button> },
    {
      key: 'customer', header: 'Customer', sort: (a, b) => a.customer.localeCompare(b.customer),
      render: (o) => (
        <div className="product-cell" style={{ minWidth: 130 }}>
          <AvatarTile text={o.customer.split(' ').map((p) => p[0]).join('').slice(0, 2)} />
          <div>
            <div className="prod-name">{o.customer}</div>
            <div className="subtext">{o.area}</div>
          </div>
        </div>
      ),
    },
    { key: 'items', header: 'Items', render: (o) => o.items.reduce((n, i) => n + i.qty, 0) },
    { key: 'total', header: 'Total', sort: (a, b) => a.total - b.total, render: (o) => <b>{kes(o.total)}</b> },
    { key: 'pay', header: 'Payment', render: (o) => <span><Badge tone={payTone(o.pay)}>{o.pay}</Badge> <span className="subtext">{o.method}</span></span> },
    { key: 'status', header: 'Status', sort: (a, b) => a.status.localeCompare(b.status), render: (o) => <Badge tone={statusTone(o.status)}>{o.status}</Badge> },
    { key: 'placed', header: 'Placed', render: (o) => dateTime(o.placedAt) },
  ]

  return (
    <>
      <PageHead
        title="Orders"
        desc={customer ? `Orders placed by ${customer.name}.` : 'Track, fulfil and refund customer orders.'}
        actions={
          <>
            {customer && <Btn onClick={() => navigate('/orders')}>Clear customer filter</Btn>}
            <Btn disabled={!can('Orders', 'Export')} onClick={() => { downloadCsv('orders.csv', ['Order', 'Customer', 'Total (KES)', 'Payment', 'Status', 'Placed'], rows.map((o) => [o.id, o.customer, o.total, `${o.method} · ${o.pay}`, o.status, new Date(o.placedAt).toISOString()])); toast('Orders exported') }}>Export</Btn>
            <Btn variant="primary" disabled={!can('Orders', 'Create')} onClick={() => navigate('/orders/new')}>New order</Btn>
          </>
        }
      />
      <div className="tile-row">
        <Stat label="Orders today" value={String(today.length)} trend="Since midnight" icon="▣" />
        <Stat label="Awaiting action" value={String(scoped.filter((o) => o.status === 'Pending').length)} trend="Pending orders" icon="◷" up={false} />
        <Stat label="Out for delivery" value={String(scoped.filter((o) => o.status === 'Out for delivery').length)} trend="With riders now" icon="⌖" />
        <Stat label="Paid revenue" value={kes(revenue)} trend="Last 30 days" icon="↗" />
      </div>
      <section className="card" style={{ marginBottom: 14 }}>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </section>
      <DataTable
        title={`${tab === 'All' ? 'All orders' : `${tab} orders`}`}
        rows={rows}
        rowKey={(o) => o.id}
        columns={columns}
        searchLabel="Search orders"
        searchText={(o) => `${o.id} ${o.customer} ${o.area} ${o.method}`}
        tools={
          <select className="select" aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>All payments</option><option>M-Pesa</option><option>Card</option><option>Cash on delivery</option>
          </select>
        }
        actions={(o) => <Btn small onClick={() => navigate(`/orders/${o.id}`)}>View</Btn>}
      />
    </>
  )
}

// ---- refund / cancel modal bodies ----------------------------------------------------------------

function RefundForm({ order }: { order: Order }) {
  const { orders, setOrders, closeModal, toast, log } = useStore()
  const max = order.total - order.refunded
  const [amount, setAmount] = useState(String(max))
  const [reason, setReason] = useState('Item arrived damaged')
  const [error, setError] = useState('')
  const submit = () => {
    const n = Number(amount)
    if (!Number.isInteger(n) || n <= 0) return setError('Enter the amount in whole shillings')
    if (n > max) return setError(`The most you can refund is ${kes(max)}`)
    const full = n === max
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, refunded: o.refunded + n, pay: full ? 'Refunded' : o.pay, status: full ? 'Refunded' : o.status, events: [...o.events, { status: 'Refunded', at: Date.now(), by: 'You', note: `${kes(n)} · ${reason}` }] } : o)))
    log(`Issued refund · ${order.id} (${kes(n)})`, 'Orders', 'Refund')
    closeModal()
    toast(`${kes(n)} refunded to the customer`)
  }
  return (
    <>
      <Field label="Refund amount (KES)" value={amount} onChange={(v) => { setAmount(v); setError('') }} error={error} hint={`Up to ${kes(max)} can be refunded to ${order.method === 'Card' ? 'the card' : 'M-Pesa'}.`} />
      <Field label="Reason" value={reason} onChange={setReason} options={['Item arrived damaged', 'Wrong item delivered', 'Late delivery', 'Customer changed their mind', 'Other']} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={submit}>Issue refund</Btn>
      </div>
    </>
  )
}

function NoteForm({ order }: { order: Order }) {
  const { orders, setOrders, closeModal, toast } = useStore()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  return (
    <>
      <Field label="Internal note" multiline value={text} onChange={(v) => { setText(v); setError('') }} placeholder="Only your staff can see this" error={error} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={() => {
          if (text.trim().length < 3) return setError('Write a note first')
          setOrders(orders.map((o) => (o.id === order.id ? { ...o, events: [...o.events, { status: 'Note', at: Date.now(), by: 'You', note: text.trim() }] } : o)))
          closeModal()
          toast('Note added')
        }}>Save note</Btn>
      </div>
    </>
  )
}

export function OrderDetail({ id }: { id: string }) {
  const { orders, setOrders, products, setProducts, riders, customers, can, openModal, toast, log, transactions } = useStore()
  const order = orders.find((o) => o.id === id)
  if (!order) {
    return (
      <>
        <PageHead title="Orders" desc="That order doesn’t exist." actions={<Btn onClick={() => navigate('/orders')}>Back to orders</Btn>} />
        <Notice tone="warning" mark="!">We couldn’t find order {id}.</Notice>
      </>
    )
  }
  const edit = can('Orders', 'Edit')
  const rider = riders.find((r) => r.id === order.riderId)
  const customer = customers.find((c) => c.id === order.customerId)
  const txn = transactions.find((t) => t.orderId === order.id)
  const flowIndex = ORDER_FLOW.indexOf(order.status)
  const next = flowIndex >= 0 && flowIndex < ORDER_FLOW.length - 1 ? ORDER_FLOW[flowIndex + 1]! : null
  const closed = order.status === 'Delivered' || order.status === 'Cancelled' || order.status === 'Refunded'
  const available = riders.filter((r) => r.status === 'Online')

  const patch = (changes: Partial<Order>, event?: Order['events'][number]) =>
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, ...changes, events: event ? [...o.events, event] : o.events } : o)))

  const adjustStock = (dir: 1 | -1) =>
    setProducts(products.map((p) => {
      const line = order.items.find((i) => i.productId === p.id)
      return line ? { ...p, stock: Math.max(0, p.stock + dir * line.qty) } : p
    }))

  const advance = () => {
    if (!next) return
    const at = Date.now()
    if (next === 'Out for delivery' && !order.riderId) return toast('Assign a rider before sending the order out')
    patch(
      { status: next, pay: next === 'Delivered' && order.method === 'Cash on delivery' ? 'Paid' : order.pay },
      { status: next, at, by: 'You' },
    )
    if (next === 'Processing') adjustStock(-1)
    log(`Moved ${order.id} to ${next}`, 'Orders')
    toast(`Order ${order.id} is now ${next.toLowerCase()}`)
  }

  const cancel = () =>
    openModal({
      title: `Cancel ${order.id}?`,
      message: order.pay === 'Paid' ? 'The customer has paid, so the full amount will be refunded.' : 'The customer has not paid yet.',
      confirm: 'Cancel order',
      cancelLabel: 'Keep order',
      danger: true,
      onConfirm: () => {
        const paid = order.pay === 'Paid'
        patch({ status: 'Cancelled', pay: paid ? 'Refunded' : order.pay, refunded: paid ? order.total : order.refunded, riderId: null }, { status: 'Cancelled', at: Date.now(), by: 'You', note: paid ? 'Full refund issued' : undefined })
        if (flowIndex >= 1) adjustStock(1)
        log(`Cancelled order ${order.id}`, 'Orders', paid ? 'Refund' : 'Updated')
        toast(`Order ${order.id} cancelled`)
      },
    })

  const assign = (riderId: string) => {
    patch({ riderId: riderId || null }, riderId ? { status: 'Note', at: Date.now(), by: 'You', note: `Assigned to ${riders.find((r) => r.id === riderId)?.name}` } : undefined)
    if (riderId) log(`Assigned ${order.id} to ${riders.find((r) => r.id === riderId)?.name}`, 'Orders')
    toast(riderId ? 'Rider assigned' : 'Rider removed')
  }

  const invoice = () => {
    downloadCsv(`${order.id}-invoice.csv`, ['Item', 'Qty', 'Unit price (KES)', 'Line total (KES)'], [...order.items.map((i) => [i.name, i.qty, i.price, i.price * i.qty]), ['Delivery fee', 1, order.fee, order.fee], ['Total', '', '', order.total]])
    toast('Invoice downloaded')
  }

  return (
    <>
      <PageHead
        title={`Order ${order.id}`}
        desc={`Placed ${dateTime(order.placedAt)} by ${order.customer}`}
        actions={
          <>
            <Btn onClick={() => navigate('/orders')}>Back to orders</Btn>
            <Btn onClick={invoice}>Invoice</Btn>
            <Btn onClick={() => window.print()}>Print</Btn>
            {order.pay === 'Paid' && order.total - order.refunded > 0 && <Btn disabled={!edit} onClick={() => openModal({ title: 'Issue a refund', message: `Order ${order.id} · paid ${kes(order.total)}`, body: <RefundForm order={order} />, noActions: true })}>Refund</Btn>}
            {!closed && <Btn variant="danger" disabled={!edit || order.status === 'Out for delivery'} onClick={cancel}>Cancel order</Btn>}
            {next && <Btn variant="primary" disabled={!edit} onClick={advance}>{`Mark as ${next.toLowerCase()}`}</Btn>}
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
                <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.productId}>
                      <td><button className="link-btn" onClick={() => navigate(`/products/${i.productId}`)}>{i.name}</button></td>
                      <td>{i.qty}</td><td>{kes(i.price)}</td><td><b>{kes(i.price * i.qty)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 15px' }}>
              <SettingRow title="Subtotal" right={<span className="prod-name">{kes(order.subtotal)}</span>} />
              <SettingRow title="Delivery fee" right={<span className="prod-name">{kes(order.fee)}</span>} />
              <SettingRow title="Total" right={<b>{kes(order.total)}</b>} />
              {order.refunded > 0 && <SettingRow title="Refunded" right={<b style={{ color: 'var(--red)' }}>−{kes(order.refunded)}</b>} />}
            </div>
          </section>

          <Panel title="Activity" sub="Status changes and internal notes" right={<Btn small disabled={!edit} onClick={() => openModal({ title: 'Add internal note', body: <NoteForm order={order} />, noActions: true })}>+ Add note</Btn>}>
            <ul className="timeline">
              {[...order.events].reverse().map((e, i) => (
                <li key={i}>
                  <span className="dot" style={e.status === 'Note' ? { background: '#9CA3AF' } : undefined} />
                  <span>
                    <strong>{e.status === 'Note' ? 'Note' : e.status}</strong>
                    {e.note && <span style={{ fontSize: 11 }}>{e.note}</span>}
                    <small style={{ display: 'block' }}>{e.by} · {dateTime(e.at)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="grid">
          <OrderSupport order={order} />
          <Panel title="Customer" right={customer && <Btn small onClick={() => navigate(`/customers/${customer.id}`)}>Profile</Btn>}>
            <div className="prod-name">{order.customer}</div>
            <div className="subtext" style={{ marginBottom: 8 }}>{customer?.phone} · {customer?.email}</div>
            <SettingRow title="Delivery address" sub={order.address} />
          </Panel>
          <Panel title="Payment">
            <SettingRow title="Method" right={<span className="prod-name">{order.method}</span>} />
            <SettingRow title="Status" right={<Badge tone={payTone(order.pay)}>{order.pay}</Badge>} />
            {txn && <SettingRow title="Reference" sub={txn.id} right={<code>{txn.ref}</code>} />}
          </Panel>
          <Panel title="Rider">
            {rider ? (
              <div className="list-row" style={{ paddingTop: 0 }}>
                <span><strong style={{ fontSize: 11, display: 'block' }}>{rider.name}</strong><small className="panel-sub">{rider.vehicle} · {rider.plate}</small></span>
                <Btn small onClick={() => navigate(`/riders/${rider.id}`)}>View</Btn>
              </div>
            ) : (
              <div className="panel-sub" style={{ marginBottom: 8 }}>No rider assigned yet.</div>
            )}
            {!closed && order.status !== 'Out for delivery' && (
              <Field label={rider ? 'Reassign to' : 'Assign a rider'} value={order.riderId ?? ''} onChange={assign} options={[{ value: '', label: 'Unassigned' }, ...available.map((r) => ({ value: r.id, label: `${r.name} · ${r.zone}` }))]} />
            )}
            {!closed && order.status !== 'Out for delivery' && (
              <div className="chip-row">
                {available.slice(0, 4).map((r) => (
                  <button key={r.id} className="pill" disabled={!edit} onClick={() => assign(r.id)}>{r.name}</button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- create an order by hand (phone / WhatsApp orders) ------------------------------------------------

export function NewOrder() {
  const { customers, products, orders, setOrders, can, toast, log } = useStore()
  const sellable = products.filter((p) => p.status === 'Active' && p.stock > 0)
  const [customerId, setCustomerId] = useState(customers[0]!.id)
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([{ productId: sellable[0]?.id ?? '', qty: '1' }])
  const [method, setMethod] = useState<PayMethod>('M-Pesa')
  const [address, setAddress] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (!can('Orders', 'Create')) {
    return (
      <>
        <PageHead title="New order" desc="Your role can’t create orders." actions={<Btn onClick={() => navigate('/orders')}>Back to orders</Btn>} />
        <Notice tone="warning" mark="!">Ask a workspace owner to give your role the Create permission for Orders.</Notice>
      </>
    )
  }
  const customer = customers.find((c) => c.id === customerId)!
  const priced = lines.map((l) => ({ ...l, product: products.find((p) => p.id === l.productId), n: Number(l.qty) }))
  const subtotal = priced.reduce((n, l) => n + (l.product?.price ?? 0) * (Number.isInteger(l.n) ? l.n : 0), 0)
  const fee = subtotal >= 1500 ? 180 : 250

  const save = () => {
    const e: Record<string, string> = {}
    const clean = priced.filter((l) => l.product)
    if (!clean.length) e.lines = 'Add at least one product'
    for (const l of clean) {
      if (!Number.isInteger(l.n) || l.n < 1) e.lines = 'Quantities must be whole numbers of 1 or more'
      else if (l.n > l.product!.stock) e.lines = `Only ${l.product!.stock} of ${l.product!.name} in stock`
    }
    if (new Set(clean.map((l) => l.productId)).size !== clean.length) e.lines = 'Each product can appear once. Change the quantity instead.'
    setErrors(e)
    if (Object.keys(e).length) return
    const id = `SC-${Math.max(...orders.map((o) => Number(o.id.slice(3)))) + 1}`
    const now = Date.now()
    const order: Order = {
      id, customerId, customer: customer.name,
      items: clean.map((l) => ({ productId: l.productId, name: l.product!.name, qty: l.n, price: l.product!.price })),
      subtotal, fee, total: subtotal + fee, status: 'Pending', method, pay: 'Pending', riderId: null, area: customer.area, address: address.trim() || `${customer.street}, ${customer.area}`,
      placedAt: now, events: [{ status: 'Pending', at: now, by: 'You', note: 'Created by staff' }], refunded: 0, pickup: 'Urban Bites, Westlands',
    }
    setOrders([order, ...orders])
    log(`Created order ${id}`, 'Orders')
    toast(`Order ${id} created`)
    navigate(`/orders/${id}`)
  }

  return (
    <>
      <PageHead title="New order" desc="Create an order on behalf of a customer (phone or chat orders)." actions={<Btn onClick={() => navigate('/orders')}>Cancel</Btn>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(260px,.8fr)', alignItems: 'start' }}>
        <section className="card form-card">
          <h2>Order details</h2>
          <div className="form-grid">
            <Field label="Customer" value={customerId} onChange={setCustomerId} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
            <Field label="Payment method" value={method} onChange={(v) => setMethod(v as PayMethod)} options={['M-Pesa', 'Card', 'Cash on delivery']} />
          </div>
          <div className="panel-sub" style={{ marginTop: -4, marginBottom: 10 }}>{customer.name} · {customer.phone}</div>
          <Field label="Delivery address (optional)" value={address} onChange={setAddress} placeholder={`${customer.street}, ${customer.area}`} />
          <div className="field">
            <label>Products</label>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <select value={l.productId} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, productId: e.target.value } : x)))} aria-label="Product">
                  {sellable.map((p) => <option key={p.id} value={p.id}>{p.name} · {kes(p.price)}</option>)}
                </select>
                <input className="qty" value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} aria-label="Quantity" />
                <Btn small disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))} label="Remove line">×</Btn>
              </div>
            ))}
            <div><Btn small onClick={() => setLines([...lines, { productId: sellable[0]?.id ?? '', qty: '1' }])}>+ Add product</Btn></div>
            {errors.lines && <div className="field-error">{errors.lines}</div>}
          </div>
          <div className="form-actions">
            <Btn onClick={() => navigate('/orders')}>Cancel</Btn>
            <Btn variant="primary" onClick={save}>Create order</Btn>
          </div>
        </section>
        <Panel title="Summary" sub="Updates as you add products">
          <SettingRow title="Subtotal" right={<span className="prod-name">{kes(subtotal)}</span>} />
          <SettingRow title="Delivery fee" right={<span className="prod-name">{kes(fee)}</span>} />
          <SettingRow title="Total" right={<b>{kes(subtotal + fee)}</b>} />
        </Panel>
      </div>
    </>
  )
}
