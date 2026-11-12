import { Badge, Panel } from '../components/ui'
import type { Order } from '../data/commerce'
import { kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useSupport } from '../lib/support'

/** What support has on file for an order: tickets, refunds, returns and disputes, each a link to the right page. */
export function OrderSupport({ order }: { order: Order }) {
  const { can } = useStore()
  const { tickets, refunds, returns, disputes } = useSupport()
  if (!can('Support', 'View')) return null
  const t = tickets.filter((x) => x.orderId === order.id)
  const r = refunds.filter((x) => x.orderId === order.id)
  const rt = returns.filter((x) => x.orderId === order.id)
  const d = disputes.filter((x) => x.orderId === order.id)
  const none = !t.length && !r.length && !rt.length && !d.length
  const row = (key: string, label: string, sub: string, tone: 'green' | 'amber' | 'red' | 'blue' | 'gray', status: string, to: string) => (
    <div className="list-row" key={key}>
      <span><button className="link-btn" onClick={() => navigate(to)}>{label}</button><small className="panel-sub" style={{ display: 'block' }}>{sub}</small></span>
      <Badge tone={tone}>{status}</Badge>
    </div>
  )
  return (
    <Panel title="Support" sub="Tickets and claims linked to this order">
      {t.map((x) => row(x.id, `Ticket #${x.id}`, x.subject, x.status === 'Resolved' ? 'green' : x.status === 'Open' ? 'red' : 'amber', x.status, `/support/tickets/${x.id}`))}
      {r.map((x) => row(x.id, `Refund ${x.id}`, `${x.reason} · ${kes(x.amount)}`, x.status === 'Needs review' ? 'amber' : x.status === 'Rejected' ? 'red' : 'green', x.status, `/support/refunds/${x.id}`))}
      {rt.map((x) => row(x.id, `Return ${x.id}`, x.reason, x.status === 'Approved' ? 'green' : x.status === 'Rejected' ? 'red' : 'amber', x.status, `/support/returns/${x.id}`))}
      {d.map((x) => row(x.id, `Dispute ${x.id}`, x.category, x.status.startsWith('Resolved') ? 'green' : 'amber', x.status, `/support/disputes/${x.id}`))}
      {none && <p className="panel-sub">Nothing on file for this order.</p>}
    </Panel>
  )
}
