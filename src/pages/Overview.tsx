import { useState } from 'react'

import { AvatarTile, Badge, Btn, downloadCsv, PageHead, Panel, Stat } from '../components/ui'
import { OVERVIEW, TOP_AREAS, TOP_PRODUCTS, type Range } from '../data/seed'
import { canOpen, homeOf, NAV_GROUPS, navigate } from '../lib/router'
import { DispatchOverview } from './Dispatch'
import { FinanceOverview } from './FinanceCore'
import { InventoryOverview } from './InventoryStock'
import { MarketingOverview } from './MarketingCampaigns'
import { RidersList } from './Riders'
import { SupportOverview } from './Support'
import { useStore } from '../lib/store'

const RANGES = Object.keys(OVERVIEW) as Range[]

/** IT support's home: accounts and system health only, with no sales, orders or money. */
function SystemHome() {
  const { audit, staff, integrations, backups } = useStore()
  const awaiting = staff.filter((s) => s.status === 'Invited').length
  const down = integrations.filter((i) => i.status !== 'Connected')
  return (
    <>
      <PageHead title="System overview" desc="Staff accounts, access and system health." />
      <div className="grid stats">
        <Stat label="Staff accounts" value={String(staff.length)} trend={`${staff.filter((s) => s.status === 'Active').length} active`} icon="◫" />
        <Stat label="Awaiting first sign-in" value={String(awaiting)} trend="Temporary password issued" icon="＋" up={awaiting === 0} />
        <Stat label="Integrations" value={`${integrations.length - down.length}/${integrations.length}`} trend={down.length ? `${down.length} need attention` : 'All connected'} icon="⌘" up={down.length === 0} />
        <Stat label="Last backup" value={backups[0]?.when ?? 'None'} trend={backups[0]?.type ?? ''} icon="◷" />
      </div>
      <div className="grid lower-grid">
        <Panel title="Integrations" sub="Connection status" right={<Btn small onClick={() => navigate('/integrations')}>Manage</Btn>}>
          {integrations.map((i) => (
            <div className="list-row" key={i.id}>
              <div><strong className="prod-name">{i.name}</strong><div className="subtext">{i.purpose}</div></div>
              <Badge tone={i.status === 'Connected' ? 'green' : 'amber'}>{i.status}</Badge>
            </div>
          ))}
        </Panel>
        <Panel title="Quick actions" sub="Accounts and access">
          <div className="list-row"><strong>Create a staff account</strong><Btn small onClick={() => navigate('/staff/new')}>Create</Btn></div>
          <div className="list-row"><strong>Reset a password</strong><Btn small onClick={() => navigate('/staff')}>Open staff list</Btn></div>
          <div className="list-row"><strong>Review roles and access</strong><Btn small onClick={() => navigate('/roles')}>Open</Btn></div>
        </Panel>
      </div>
      <Panel title="Recent activity" sub="Latest changes across your workspace" right={<Btn small onClick={() => navigate('/audit')}>View audit log</Btn>}>
        {audit.slice(0, 5).map((a) => (
          <div className="list-row" key={a.id}>
            <div className="list-main">
              <AvatarTile text={a.user === 'System' ? 'SY' : a.user.split(' ').map((p) => p[0]).join('').slice(0, 2)} />
              <span><strong>{a.user} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{a.action.toLowerCase()}</span></strong><small>{a.module} · {a.when}</small></span>
            </div>
            <Badge>{a.type}</Badge>
          </div>
        ))}
      </Panel>
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

function BusinessOverview() {
  const { audit, toast, can } = useStore()
  const [range, setRange] = useState<Range>('Last 30 days')
  const d = OVERVIEW[range]
  const total = d.statuses.reduce((n, s) => n + s[2], 0)

  return (
    <>
      <PageHead
        title="Executive overview"
        desc="Business performance at a glance."
        actions={
          <>
            <select className="select" aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as Range)}>
              {RANGES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <Btn onClick={() => { downloadCsv('executive-overview.csv', ['Metric', 'Value', 'Trend'], d.stats.map((x) => [x.label, x.value, x.trend])); toast('Report downloaded') }}>Export report</Btn>
          </>
        }
      />
      <div className="grid stats">{d.stats.map((s) => <Stat key={s.label} {...s} />)}</div>

      <div className="grid analytics">
        <Panel title="Sales over time" sub={d.sub} right={<div className="legend"><i /> Revenue</div>}>
          <div className="chart-wrap">
            <svg viewBox="0 0 620 190" preserveAspectRatio="none" role="img" aria-label="Sales line chart trending upward">
              <defs>
                <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity=".16" />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g className="chart-grid">{[25, 65, 105, 145, 180].map((y) => <line key={y} x1="35" y1={y} x2="610" y2={y} />)}</g>
              <path className="chart-fill" d={`${d.path} L610 180 L35 180Z`} />
              <path className="chart-line" d={d.path} />
            </svg>
          </div>
          <div className="chart-labels">{d.labels.map((l) => <span key={l}>{l}</span>)}</div>
        </Panel>

        <Panel title="Orders by status" sub={`${total.toLocaleString('en-US')} total orders`} right={<Btn small onClick={() => navigate('/orders')}>View orders</Btn>}>
          {d.statuses.map(([label, pct, count, color]) => (
            <div className="setting-row" key={label}>
              <span style={{ minWidth: 78, fontSize: 10 }}>{label}</span>
              <div className="progress" style={{ flex: 1 }}><i style={{ width: `${pct}%`, background: color }} /></div>
              <strong style={{ fontSize: 10, width: 38, textAlign: 'right' }}>{count.toLocaleString('en-US')}</strong>
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid lower-grid">
        <Panel title="Top products" sub="By revenue this month" right={<Btn small onClick={() => navigate('/reports')}>View report</Btn>}>
          {TOP_PRODUCTS.map((p) => (
            <div className="list-row" key={p.name}>
              <div className="list-main">
                <AvatarTile text={p.letter} />
                <span><strong>{p.name}</strong><small>{p.sold}</small></span>
              </div>
              <b className="row-right">{p.revenue}</b>
            </div>
          ))}
        </Panel>
        <Panel title="Top delivery areas" sub="By order volume">
          {TOP_AREAS.map((a) => (
            <div className="list-row" key={a.name}>
              <div>
                <strong className="prod-name">{a.name}</strong>
                <div className="subtext">{a.orders}</div>
              </div>
              <Badge tone="blue">{a.share}</Badge>
            </div>
          ))}
        </Panel>
      </div>

      {can('Access', 'View') && (
        <Panel title="Recent activity" sub="Latest changes across your workspace" right={<Btn small onClick={() => navigate('/audit')}>View audit log</Btn>}>
          {audit.slice(0, 3).map((a) => (
            <div className="list-row" key={a.id}>
              <div className="list-main">
                <AvatarTile text={a.user === 'System' ? 'SY' : a.user.split(' ').map((p) => p[0]).join('').slice(0, 2)} />
                <span>
                  <strong>{a.user} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>{a.action.toLowerCase()}</span></strong>
                  <small>{a.module} · {a.when}</small>
                </span>
              </div>
              <Badge>{a.type}</Badge>
            </div>
          ))}
        </Panel>
        )}
    </>
  )
}
