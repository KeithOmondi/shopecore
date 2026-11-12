import { useMemo, useState } from 'react'

import { Badge, Btn, downloadCsv, PageHead, Panel, Stat, Tabs } from '../components/ui'
import { dayKey, kes, pct } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

const TABS = ['Sales', 'Products', 'Riders', 'Customers'] as const
const RANGES = { 'Last 7 days': 7, 'Last 30 days': 30 } as const

function BarChart({ data, label }: { data: { key: string; label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <>
      <div className="bar-chart" role="img" aria-label={label}>
        {data.map((d) => <div key={d.key} className="b" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} title={`${d.label}: ${kes(d.value)}`} />)}
      </div>
      <div className="chart-labels">
        <span>{data[0]?.label}</span><span>{data[Math.floor(data.length / 2)]?.label}</span><span>{data[data.length - 1]?.label}</span>
      </div>
    </>
  )
}

/** Reports built live from orders, products, riders and customers. */
export default function Reports() {
  const { orders, riders, customers, can, toast } = useStore()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Sales')
  const [range, setRange] = useState<keyof typeof RANGES>('Last 30 days')
  const [now] = useState(() => Date.now())

  const data = useMemo(() => {
    const days = RANGES[range]
    const since = now - days * 86_400_000
    const inRange = orders.filter((o) => o.placedAt >= since)
    const sold = inRange.filter((o) => o.status !== 'Cancelled' && o.status !== 'Refunded')

    const byDay = Array.from({ length: days }, (_, i) => {
      const d = new Date(now - (days - 1 - i) * 86_400_000)
      const key = dayKey(d.getTime())
      return { key, label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), value: sold.filter((o) => dayKey(o.placedAt) === key).reduce((n, o) => n + o.total, 0) }
    })

    const products = new Map<string, { name: string; units: number; revenue: number }>()
    for (const o of sold) for (const i of o.items) {
      const cur = products.get(i.productId) ?? { name: i.name, units: 0, revenue: 0 }
      cur.units += i.qty
      cur.revenue += i.qty * i.price
      products.set(i.productId, cur)
    }

    const byRider = new Map<string, { name: string; deliveries: number; revenue: number }>()
    for (const o of sold.filter((x) => x.status === 'Delivered' && x.riderId)) {
      const r = riders.find((x) => x.id === o.riderId)
      const cur = byRider.get(o.riderId!) ?? { name: r?.name ?? 'Unknown', deliveries: 0, revenue: 0 }
      cur.deliveries += 1
      cur.revenue += o.fee
      byRider.set(o.riderId!, cur)
    }

    const byCustomer = new Map<string, { name: string; orders: number; spent: number }>()
    for (const o of sold) {
      const cur = byCustomer.get(o.customerId) ?? { name: o.customer, orders: 0, spent: 0 }
      cur.orders += 1
      cur.spent += o.total
      byCustomer.set(o.customerId, cur)
    }

    const revenue = sold.reduce((n, o) => n + o.total, 0)
    return {
      inRange, sold, byDay, revenue,
      aov: sold.length ? revenue / sold.length : 0,
      products: [...products.values()].sort((a, b) => b.revenue - a.revenue),
      riders: [...byRider.values()].sort((a, b) => b.deliveries - a.deliveries),
      customers: [...byCustomer.values()].sort((a, b) => b.spent - a.spent),
      cancelled: inRange.filter((o) => o.status === 'Cancelled' || o.status === 'Refunded').length,
    }
  }, [orders, riders, range, now])

  const exportable = can('Reports', 'Export')
  const exportTab = () => {
    if (tab === 'Sales') downloadCsv('sales-report.csv', ['Day', 'Revenue (KES)'], data.byDay.map((d) => [d.key, d.value]))
    else if (tab === 'Products') downloadCsv('product-report.csv', ['Product', 'Units', 'Revenue (KES)'], data.products.map((p) => [p.name, p.units, p.revenue]))
    else if (tab === 'Riders') downloadCsv('rider-report.csv', ['Rider', 'Deliveries', 'Delivery fees (KES)'], data.riders.map((r) => [r.name, r.deliveries, r.revenue]))
    else downloadCsv('customer-report.csv', ['Customer', 'Orders', 'Spent (KES)'], data.customers.map((c) => [c.name, c.orders, c.spent]))
    toast(`${tab} report exported`)
  }

  const table = (headers: string[], rows: (string | number | React.ReactNode)[][], empty: string) => (
    <section className="card table-card">
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 10).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
            {rows.length === 0 && <tr><td colSpan={headers.length} style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )

  return (
    <>
      <PageHead
        title="Reports"
        desc="Sales, products, riders and customers, built from your live orders."
        actions={
          <>
            <select className="select" aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as keyof typeof RANGES)}>{Object.keys(RANGES).map((r) => <option key={r}>{r}</option>)}</select>
            <Btn onClick={() => window.print()}>Print</Btn>
            <Btn variant="primary" disabled={!exportable} onClick={exportTab}>Export CSV</Btn>
          </>
        }
      />
      <div className="tile-row">
        <Stat label="Revenue" value={kes(data.revenue)} trend={range} icon="↗" />
        <Stat label="Orders" value={String(data.sold.length)} trend={`${data.inRange.length} placed`} icon="▣" />
        <Stat label="Average order" value={kes(data.aov)} trend="Per completed order" icon="◈" />
        <Stat label="Cancelled or refunded" value={pct(data.cancelled, data.inRange.length)} trend={`${data.cancelled} orders`} icon="↺" up={data.cancelled === 0} />
      </div>
      <section className="card" style={{ marginBottom: 14 }}>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </section>

      {tab === 'Sales' && (
        <Panel title="Revenue by day" sub={`Gross sales · ${range}`}>
          <BarChart data={data.byDay} label="Revenue by day" />
          <div className="panel-sub" style={{ marginTop: 10 }}>Hover a bar to see the day’s total.</div>
        </Panel>
      )}
      {tab === 'Products' &&
        table(['Product', 'Units sold', 'Revenue', 'Share'], data.products.map((p) => [<b key="n">{p.name}</b>, p.units, kes(p.revenue), pct(p.revenue, data.revenue)]), 'No sales in this period.')}
      {tab === 'Riders' &&
        table(['Rider', 'Deliveries', 'Delivery fees'], data.riders.map((r) => [<b key="n">{r.name}</b>, r.deliveries, kes(r.revenue)]), 'No deliveries in this period.')}
      {tab === 'Customers' && (
        <>
          <div className="tile-row" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
            <Stat label="Customers" value={String(customers.length)} trend="Total profiles" icon="♙" />
            <Stat label="Returning" value={String(customers.filter((c) => c.segment === 'Returning').length)} trend={pct(customers.filter((c) => c.segment === 'Returning').length, customers.length)} icon="↻" />
            <Stat label="New" value={String(customers.filter((c) => c.segment === 'New').length)} trend={pct(customers.filter((c) => c.segment === 'New').length, customers.length)} icon="＋" />
          </div>
          {table(['Customer', 'Orders', 'Spent'], data.customers.map((c) => [<b key="n">{c.name}</b>, c.orders, kes(c.spent)]), 'No orders in this period.')}
        </>
      )}
      {!exportable && <div style={{ marginTop: 12 }}><Badge tone="amber">Export is off for your role</Badge></div>}
      <div style={{ marginTop: 14 }}><Btn small onClick={() => navigate('/orders')}>View orders</Btn></div>
    </>
  )
}
