import { useState } from 'react'

import { AvatarTile, Badge, Btn, downloadCsv, PageHead, Panel, Stat } from '../components/ui'
import { OVERVIEW, TOP_AREAS, TOP_PRODUCTS, type Range } from '../data/seed'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

const RANGES = Object.keys(OVERVIEW) as Range[]

export default function Overview() {
  const { audit, toast } = useStore()
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
    </>
  )
}
