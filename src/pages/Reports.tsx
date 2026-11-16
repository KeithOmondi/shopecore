import { useState } from 'react'

import { Badge, Btn, downloadCsv, PageHead, Panel, SettingRow, Stat, Tabs } from '../components/ui'
import { kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'
import type { ApiRider } from './Riders'

const TABS = ['Sales', 'Products', 'Riders', 'Customers'] as const
const RANGES = { 'Last 7 days': 7, 'Last 30 days': 30, 'Last 90 days': 90 } as const
const money = (c: number) => kes(c / 100)
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)

interface Sales { orders: number; totalCents: number; averageCents: number; byDay: { day: string; orders: number; totalCents: number }[]; byCategory: { name: string; totalCents: number }[]; byArea: { area: string; orders: number; totalCents: number }[]; topProducts: { name: string; units: number; totalCents: number }[] }
interface Cust { id: string; name: string; email: string; phone: string; orders: number; spentCents: number; segment: 'new' | 'returning' }

function BarChart({ data, label }: { data: { key: string; label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <>
      <div className="bar-chart" role="img" aria-label={label}>
        {data.map((d) => <div key={d.key} className="b" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} title={`${d.label}: ${money(d.value)}`} />)}
      </div>
      <div className="chart-labels"><span>{data[0]?.label}</span><span>{data[Math.floor(data.length / 2)]?.label}</span><span>{data[data.length - 1]?.label}</span></div>
    </>
  )
}

/** Reports built from the server’s own figures. */
export default function Reports() {
  const { can, toast } = useStore()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Sales')
  const [range, setRange] = useState<keyof typeof RANGES>('Last 30 days')
  const days = RANGES[range]
  const allowed = can('Payments', 'View')
  const sales = useGet<Sales>(allowed && (tab === 'Sales' || tab === 'Products') ? `/v1/admin/reports/sales?from=${day(days - 1)}&to=${day(0)}` : null)
  const riders = useGet<{ items: ApiRider[] }>(can('Riders', 'View') && tab === 'Riders' ? '/v1/admin/riders?status=approved&limit=200' : null)
  const customers = useGet<{ items: Cust[] }>(can('Customers', 'View') && tab === 'Customers' ? '/v1/admin/customers?limit=200' : null)
  const s = sales.data
  const top = (customers.data?.items ?? []).slice().sort((a, b) => b.spentCents - a.spentCents).slice(0, 8)
  const ranked = (riders.data?.items ?? []).slice().sort((a, b) => b.deliveries - a.deliveries)
  const exportIt = () => {
    if (tab === 'Sales' && s) downloadCsv('sales.csv', ['Day', 'Orders', 'Sales (KES)'], s.byDay.map((d) => [d.day, d.orders, d.totalCents / 100]))
    else if (tab === 'Products' && s) downloadCsv('top-products.csv', ['Product', 'Units', 'Sales (KES)'], s.topProducts.map((p) => [p.name, p.units, p.totalCents / 100]))
    else if (tab === 'Riders') downloadCsv('riders.csv', ['Rider', 'Deliveries', 'Rating', 'Cash held (KES)'], ranked.map((r) => [r.name, r.deliveries, r.rating, r.cashHeldCents / 100]))
    else downloadCsv('top-customers.csv', ['Customer', 'Orders', 'Spent (KES)'], top.map((c) => [c.name, c.orders, c.spentCents / 100]))
    toast('Report exported')
  }
  return (
    <>
      <PageHead title="Reports" desc="Sales, products, riders and customers." actions={<>{tab === 'Sales' || tab === 'Products' ? <select className="select" aria-label="Range" value={range} onChange={(e) => setRange(e.target.value as keyof typeof RANGES)}>{Object.keys(RANGES).map((r) => <option key={r}>{r}</option>)}</select> : null}<Btn onClick={exportIt}>Export</Btn></>} />
      <section className="card" style={{ marginBottom: 14 }}><Tabs tabs={TABS} value={tab} onChange={setTab} /></section>

      {(tab === 'Sales' || tab === 'Products') && !allowed && <Panel><p className="panel-sub">Sales figures need finance access. Ask an owner to update your role.</p></Panel>}
      {tab === 'Sales' && s && (
        <>
          <div className="tile-row"><Stat label="Sales" value={money(s.totalCents)} trend={range} icon="↗" /><Stat label="Orders" value={String(s.orders)} trend="Paid orders" icon="▣" /><Stat label="Average order" value={money(s.averageCents)} trend="Per order" icon="◈" /></div>
          <Panel title="Sales by day">{s.byDay.length === 0 ? <p className="panel-sub">No sales in this period.</p> : <BarChart label="Sales by day" data={s.byDay.map((d) => ({ key: d.day, label: d.day.slice(5), value: d.totalCents }))} />}</Panel>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', marginTop: 14 }}>
            <Panel title="By category">{s.byCategory.map((c) => <SettingRow key={c.name} title={c.name} right={<b>{money(c.totalCents)}</b>} />)}{s.byCategory.length === 0 && <p className="panel-sub">Nothing yet.</p>}</Panel>
            <Panel title="By area">{s.byArea.map((a) => <SettingRow key={a.area} title={a.area} sub={`${a.orders} orders`} right={<b>{money(a.totalCents)}</b>} />)}{s.byArea.length === 0 && <p className="panel-sub">Nothing yet.</p>}</Panel>
          </div>
        </>
      )}
      {tab === 'Products' && s && (
        <Panel title="Best sellers" right={can('Products', 'View') ? <Btn small onClick={() => navigate('/products')}>All products</Btn> : undefined}>
          {s.topProducts.length === 0 && <p className="panel-sub">No sales in this period.</p>}
          {s.topProducts.map((p, i) => <SettingRow key={p.name} title={`${i + 1}. ${p.name}`} sub={`${p.units} sold`} right={<b>{money(p.totalCents)}</b>} />)}
        </Panel>
      )}
      {tab === 'Riders' && (
        <Panel title="Riders by deliveries">
          {!can('Riders', 'View') && <p className="panel-sub">Your role can’t see riders.</p>}
          {riders.data && ranked.length === 0 && <p className="panel-sub">No approved riders yet.</p>}
          {ranked.map((r) => <SettingRow key={r.id} title={r.name} sub={`${r.vehicle}${r.zone ? ` · ${r.zone}` : ''}`} right={<span className="sp-row"><b>{r.deliveries}</b>{r.deliveries > 0 && <Badge tone="gray">{`★ ${r.rating.toFixed(2)}`}</Badge>}</span>} />)}
        </Panel>
      )}
      {tab === 'Customers' && (
        <>
          {!can('Customers', 'View') && <Panel><p className="panel-sub">Your role can’t see customers.</p></Panel>}
          {customers.data && <div className="tile-row"><Stat label="Customers" value={String(customers.data.items.length)} trend="Most recent 200" icon="♧" /><Stat label="Returning" value={String(customers.data.items.filter((c) => c.segment === 'returning').length)} trend="Two or more orders" icon="↻" /><Stat label="New" value={String(customers.data.items.filter((c) => c.segment === 'new').length)} trend="One order or none" icon="＋" /></div>}
          {customers.data && <Panel title="Top customers by spend">{top.map((c) => <SettingRow key={c.id} title={c.name || c.email || c.phone} sub={`${c.orders} orders`} right={<b>{money(c.spentCents)}</b>} />)}{top.length === 0 && <p className="panel-sub">No customers yet.</p>}</Panel>}
        </>
      )}
    </>
  )
}
