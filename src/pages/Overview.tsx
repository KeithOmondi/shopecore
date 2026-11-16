import { AvatarTile, Badge, Btn, PageHead, Panel, SettingRow, Stat } from '../components/ui'
import { kes } from '../lib/format'
import { canOpen, homeOf, NAV_GROUPS, navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'
import { DispatchOverview } from './Dispatch'
import { FinanceOverview } from './FinanceCore'
import { InventoryOverview } from './InventoryStock'
import { MarketingOverview } from './MarketingCampaigns'
import { RidersList } from './Riders'
import { SupportOverview } from './Support'

const money = (c: number) => kes(c / 100)

function RecentActivity() {
  const { audit } = useStore()
  return (
    <Panel title="Recent activity" sub="Latest changes across your workspace" right={<Btn small onClick={() => navigate('/audit')}>View audit log</Btn>}>
      {audit.length === 0 && <p className="panel-sub">Nothing yet.</p>}
      {audit.slice(0, 6).map((a) => (
        <div className="list-row" key={a.id}>
          <div className="list-main">
            <AvatarTile text={a.user === 'System' ? 'SY' : a.user.split(' ').map((p) => p[0]).join('').slice(0, 2)} />
            <span><strong>{a.user} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{a.action.toLowerCase()}</span></strong><small>{a.module} · {a.when}</small></span>
          </div>
          <Badge>{a.type}</Badge>
        </div>
      ))}
    </Panel>
  )
}

/** IT support's home: accounts and system health only, with no sales, orders or money. */
function SystemHome() {
  const { staff } = useStore()
  const sys = useGet<{ health: Record<string, string>; integrations: Record<string, { connected: boolean }> }>('/v1/admin/system/status', 60_000).data
  const awaiting = staff.filter((s) => s.status === 'Invited').length
  const ints = sys ? Object.values(sys.integrations) : []
  const down = ints.filter((i) => !i.connected).length
  const healthy = sys ? Object.values(sys.health).every((v) => v === 'ok') : null
  return (
    <>
      <PageHead title="System overview" desc="Staff accounts, access and system health." />
      <div className="grid stats">
        <Stat label="Staff accounts" value={String(staff.length)} trend={`${staff.filter((s) => s.status === 'Active').length} active`} icon="◫" />
        <Stat label="Awaiting first sign-in" value={String(awaiting)} trend="Temporary password issued" icon="＋" up={awaiting === 0} />
        <Stat label="Connections" value={sys ? `${ints.length - down}/${ints.length}` : '—'} trend={down ? `${down} not connected` : 'All connected'} icon="⌘" up={down === 0} />
        <Stat label="System" value={healthy === null ? '—' : healthy ? 'Healthy' : 'Needs a look'} trend="Database and cache" icon="♥" up={healthy ?? true} />
      </div>
      <div className="grid lower-grid">
        <Panel title="Quick actions" sub="Accounts and access">
          <div className="list-row"><strong>Create a staff account</strong><Btn small onClick={() => navigate('/staff/new')}>Create</Btn></div>
          <div className="list-row"><strong>Reset a password</strong><Btn small onClick={() => navigate('/staff')}>Open staff list</Btn></div>
          <div className="list-row"><strong>Review roles and access</strong><Btn small onClick={() => navigate('/roles')}>Open</Btn></div>
          <div className="list-row"><strong>Check system health</strong><Btn small onClick={() => navigate('/health')}>Open</Btn></div>
        </Panel>
      </div>
      <RecentActivity />
    </>
  )
}

/** A role without its own home page gets a short list of everything it can open. */
function Landing() {
  const { role, permissions, user } = useStore()
  const groups = NAV_GROUPS.map((g) => ({ label: g.label, items: g.items.filter((i) => i.label !== 'Executive overview' && canOpen(role, i.label, permissions[role])) })).filter((g) => g.items.length)
  return (
    <>
      <PageHead title="Home" desc={`Welcome, ${user?.name.split(' ')[0] ?? 'there'}. Here is everything your role can open.`} />
      {groups.length === 0 && <Panel><p className="panel-sub">Your role doesn’t have access to any pages yet. Ask an owner to update it.</p></Panel>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
        {groups.map((g) => (
          <Panel key={g.label} title={g.label}>
            {g.items.map((i) => <div className="list-row" key={i.label}><b style={{ fontSize: 11 }}>{i.label}</b><Btn small onClick={() => navigate(i.path)}>Open</Btn></div>)}
          </Panel>
        ))}
      </div>
    </>
  )
}

/** The home page: the company overview for owners and operations, and each department’s own page for everyone else. */
export default function Overview() {
  const { can, role, permissions } = useStore()
  if (can('Overview', 'View')) return <BusinessOverview />
  switch (homeOf(role, permissions[role]).path) {
    case '/marketing': return <MarketingOverview />
    case '/finance': return <FinanceOverview />
    case '/dispatch': return <DispatchOverview />
    case '/riders': return <RidersList />
    case '/stock': return <InventoryOverview />
    default:
      if (role === 'IT support') return <SystemHome />
      if (role === 'Customer support') return <SupportOverview />
      return <Landing />
  }
}

interface OrderStats { byStatus: Record<string, number>; todayOrders: number; todayPaid: number; todayRevenueCents: number }

type SalesReport = { orders: number; averageCents: number; topProducts: { name: string; units: number; totalCents: number }[] }
type RecentOrder = { id: string; number: string; customer: string; itemCount: number; totalCents: number; status: string; createdAt: string }

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const dayName = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-KE', { weekday: 'short' })
const placed = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const tone = (s: string): 'green' | 'amber' | 'red' | 'blue' | 'gray' => /deliver|paid|complete|fulfil/i.test(s) ? 'green' : /cancel|fail|refund/i.test(s) ? 'red' : /pending|await|unpaid/i.test(s) ? 'amber' : 'blue'

function BusinessOverview() {
  const { can, user } = useStore()
  const orders = useGet<OrderStats>(can('Orders', 'View') ? '/v1/admin/orders/stats' : null, 60_000)
  const recent = useGet<{ items: RecentOrder[] }>(can('Orders', 'View') ? '/v1/admin/orders?limit=6' : null, 60_000)
  const sales = useGet<SalesReport>(can('Payments', 'View') || can('Reports', 'View') ? '/v1/admin/reports/sales' : null, 120_000)
  const fin = useGet<{ summary: { orders: number; grossCents: number; refundsCents: number; codHeldCents: number; pendingPayoutsCents: number; grossChangePct: number | null }; attention: { key: string; label: string; to: string }[]; daily: { day: string; revenueCents: number }[] }>(can('Payments', 'View') ? '/v1/admin/finance/overview' : null, 60_000)
  const sup = useGet<{ tickets: { open: number; breached: number }; chats: { waiting: number }; claims: { refundsToReview: number; returnsToReview: number; openDisputes: number } }>(can('Support', 'View') ? '/v1/admin/support/overview' : null, 60_000)
  const board = useGet<{ unassigned: unknown[]; active: unknown[]; riders: unknown[] }>(can('Dispatch', 'View') ? '/v1/admin/dispatch/board' : null, 30_000)
  const low = useGet<{ items: unknown[] }>(can('Inventory', 'View') ? '/v1/admin/stock/alerts' : null, 120_000)
  const o = orders.data
  const f = fin.data?.summary
  const week = (fin.data?.daily ?? []).slice(-7)
  const max = Math.max(1, ...week.map((d) => d.revenueCents))
  const lastSale = week.reduce((k, d, i) => (d.revenueCents ? i : k), -1)
  const waiting = board.data?.unassigned.length
  const first = (user?.name ?? '').split(' ')[0]
  const sub = o ? `${o.todayOrders} order${o.todayOrders === 1 ? '' : 's'} today${waiting ? ` · ${waiting} waiting for a rider` : ''}.` : 'How the business is doing right now.'
  return (
    <>
      <div className="dash-hello">
        <div>
          <h1>{greeting()}{first ? `, ${first}` : ''}</h1>
          <p>{sub}</p>
        </div>
        <div className="actions">
          {can('Orders', 'View') && <Btn onClick={() => navigate('/orders')}>View orders</Btn>}
          {can('Products', 'Create') && <Btn variant="primary" onClick={() => navigate('/products')}>Add product</Btn>}
        </div>
      </div>
      <div className="grid stats dash-stats">
        <Stat label="Revenue this month" value={f ? money(f.grossCents) : '—'} trend={f?.grossChangePct == null ? 'This month' : `${f.grossChangePct >= 0 ? '+' : ''}${f.grossChangePct}% vs last month`} icon="◈" up={(f?.grossChangePct ?? 0) >= 0} />
        <Stat label="Orders today" value={o ? String(o.todayOrders) : '—'} trend={o ? `${o.todayPaid} paid · ${money(o.todayRevenueCents)}` : ''} icon="▣" />
        <Stat label="Avg. order value" value={sales.data ? money(sales.data.averageCents) : '—'} trend="Last 30 days" icon="↗" />
        <Stat label="Waiting for a rider" value={board.data ? String(board.data.unassigned.length) : '—'} trend={`${board.data?.active.length ?? 0} on the road · ${board.data?.riders.length ?? 0} riders online`} icon="⌖" up={(board.data?.unassigned.length ?? 0) === 0} />
      </div>
      <div className="dash-grid">
        <Panel title="Revenue" sub="Last 7 days">
          {!fin.data && <p className="panel-sub">{can('Payments', 'View') ? 'Loading…' : 'You don’t have access to finance figures.'}</p>}
          {fin.data && (
            <div className="sales-cols" role="img" aria-label="Daily revenue, last 7 days">
              {week.map((d, i) => (
                <div className="sales-col" key={d.day} title={`${d.day}: ${money(d.revenueCents)}`}>
                  <div className="sales-track"><div className={`sales-bar${i === lastSale ? ' latest' : ''}${d.revenueCents ? '' : ' empty'}`} style={{ height: `${Math.max(4, (d.revenueCents / max) * 100)}%` }} /></div>
                  <span>{dayName(d.day)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Best sellers" sub="Last 30 days">
          {!sales.data && <p className="panel-sub">{can('Payments', 'View') || can('Reports', 'View') ? 'Loading…' : 'You don’t have access to sales figures.'}</p>}
          {sales.data && sales.data.topProducts.length === 0 && <p className="panel-sub">No sales yet.</p>}
          {sales.data?.topProducts.slice(0, 5).map((p) => (
            <div className="best-row" key={p.name}>
              <AvatarTile text={p.name.slice(0, 2).toUpperCase()} />
              <span className="best-name"><strong>{p.name}</strong><small>{p.units} sold</small></span>
              <b>{money(p.totalCents)}</b>
            </div>
          ))}
        </Panel>
      </div>
      {can('Orders', 'View') && (
        <Panel title="Latest orders" right={<Btn small onClick={() => navigate('/orders')}>View all</Btn>}>
          {!recent.data && <p className="panel-sub">Loading…</p>}
          {recent.data && recent.data.items.length === 0 && <p className="panel-sub">No orders yet.</p>}
          {recent.data && recent.data.items.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead>
                <tbody>
                  {recent.data.items.map((r) => (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${r.id}`)}>
                      <td><b>{r.number}</b></td><td>{r.customer}</td><td>{r.itemCount}</td><td>{money(r.totalCents)}</td><td><Badge tone={tone(r.status)}>{r.status}</Badge></td><td>{placed(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      <div className="grid lower-grid" style={{ marginTop: 16 }}>
        <Panel title="Needs attention">
          {sup.data && <SettingRow title="Support tickets open" sub={sup.data.tickets.breached ? `${sup.data.tickets.breached} past their reply time` : 'All within time'} right={<Btn small onClick={() => navigate('/support/tickets')}>{String(sup.data.tickets.open)}</Btn>} />}
          {sup.data && <SettingRow title="Refunds and returns to review" right={<Btn small onClick={() => navigate('/support/refunds')}>{String(sup.data.claims.refundsToReview + sup.data.claims.returnsToReview)}</Btn>} />}
          {low.data && <SettingRow title="Products running low" right={<Btn small onClick={() => navigate('/inventory/alerts')}>{String(low.data.items.length)}</Btn>} />}
          {f && <SettingRow title="Cash riders still hold" right={<Btn small onClick={() => navigate('/finance/cod')}>{money(f.codHeldCents)}</Btn>} />}
          {f && <SettingRow title="Rider payouts waiting" right={<Btn small onClick={() => navigate('/payouts')}>{money(f.pendingPayoutsCents)}</Btn>} />}
          {fin.data?.attention.map((a) => <SettingRow key={a.key} title={a.label} right={<Btn small onClick={() => navigate(a.to.startsWith('/finance') ? a.to : '/finance')}>Open</Btn>} />)}
        </Panel>
        <RecentActivity />
      </div>
    </>
  )
}
