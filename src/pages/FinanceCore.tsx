import { useRef, useState } from 'react'

import { Bars, MonthSelect, monthOptions, Stats, Steps } from '../components/finance-ui'
import { Detail, NotFoundCard, Person, useNow, when } from '../components/support-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, Stat, type Column } from '../components/ui'
import type { Order } from '../data/commerce'
import { matchState, monthEnd, monthKey, monthLabel, monthStart, RETRYABLE, shiftMonth, type StatementLine } from '../data/finance'
import { dayKey, dateTime, kes } from '../lib/format'
import { computePnl, pctOf } from '../lib/finance-calc'
import { useFinance, vatIn, type Payment } from '../lib/finance'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useSupport } from '../lib/support'

const txTone = (s: Payment['status']) => (s === 'Success' ? 'green' : s === 'Pending' ? 'amber' : s === 'Failed' ? 'red' : 'gray')
const DAY = 86_400_000

// ---- overview ------------------------------------------------------------------------------------------------

export function FinanceOverview() {
  const { orders, riders, payouts, deposits } = useStore()
  const { refunds: claimRefunds } = useSupport()
  const f = useFinance()
  const now = useNow()
  const [mk, setMk] = useState(monthKey(now))
  const [chart, setChart] = useState<'Revenue' | 'Payouts'>('Revenue')
  const m = f.month(mk)
  const p = computePnl(m, f.settings, f.vatRate, f.expenses, f.runs)
  const cod = riders.reduce((n, r) => n + r.cashHeld, 0)
  const due = deposits.filter((d) => d.status === 'Due')
  const pending = payouts.filter((x) => x.status === 'Pending')
  const failed = f.failed.filter((x) => x.status !== 'Recovered')
  const unpaidExpenses = f.expenses.filter((e) => e.status === 'Pending')
  const payrollWaiting = f.runs.filter((r) => r.status === 'Pending approval')
  const openClaims = claimRefunds.filter((r) => r.status === 'Needs review')

  const days = Array.from({ length: Math.min(30, Math.round((monthEnd(mk) - monthStart(mk)) / DAY)) }, (_, i) => dayKey(monthStart(mk) + i * DAY))
  const series = days.map((d) =>
    chart === 'Revenue'
      ? orders.filter((o) => o.status !== 'Cancelled' && dayKey(o.placedAt) === d).reduce((n, o) => n + o.total, 0)
      : payouts.filter((x) => x.status === 'Paid' && x.paidAt && dayKey(x.paidAt) === d).reduce((n, x) => n + x.amount, 0),
  )
  const todo: [string, string, string, string, string][] = [
    ['COD deposits overdue', `${due.length} riders · ${kes(due.reduce((n, d) => n + d.owed, 0))}`, 'Review', '/finance/cod', due.length ? 'red' : 'green'],
    ['Failed payments', `${failed.length} orders · ${kes(failed.reduce((n, x) => n + x.amount, 0))}`, 'Retry', '/finance/failed', failed.length ? 'amber' : 'green'],
    ['Rider payouts awaiting approval', `${pending.length} riders · ${kes(pending.reduce((n, x) => n + x.amount, 0))}`, 'Approve', '/finance/batch', pending.length ? 'blue' : 'green'],
    ['Refund requests from support', `${openClaims.length} waiting · ${kes(openClaims.reduce((n, r) => n + r.amount, 0))}`, 'Open', '/support/refunds', openClaims.length ? 'amber' : 'green'],
    ['Expenses awaiting approval', `${unpaidExpenses.length} · ${kes(unpaidExpenses.reduce((n, e) => n + e.amount, 0))}`, 'Review', '/finance/expenses', unpaidExpenses.length ? 'amber' : 'green'],
    ['Payroll awaiting approval', payrollWaiting.length ? payrollWaiting.map((r) => monthLabel(r.month)).join(', ') : 'Nothing waiting', 'Review', '/finance/payroll', payrollWaiting.length ? 'blue' : 'green'],
  ]

  return (
    <>
      <PageHead
        title="Finance overview"
        desc="Revenue, collections, refunds, payouts and profit at a glance."
        actions={<><MonthSelect value={mk} onChange={setMk} now={now} label="Reporting period" /><Btn onClick={() => navigate('/finance/exports')}>Export</Btn></>}
      />
      {m.sample && <div style={{ marginBottom: 12 }}><Notice>{monthLabel(mk)} shows sample figures. The demo only holds orders from the last 30 days.</Notice></div>}
      <Stats>
        <Stat label="Gross revenue" value={kes(m.gross)} trend={`${m.orders.toLocaleString('en-US')} orders · VAT included`} icon="↗" />
        <Stat label="Refunds" value={kes(m.refunds)} trend={`${pctOf(m.refunds, m.gross)} of gross sales`} icon="↶" up={false} />
        <Stat label="COD outstanding" value={kes(cod)} trend={due.length ? `${due.length} riders to chase` : 'All handed in'} icon="▣" up={due.length === 0} />
        <Stat label="Pending payouts" value={kes(pending.reduce((n, x) => n + x.amount, 0))} trend={`${pending.length} riders`} icon="⇧" up={pending.length === 0} />
        <Stat label="Net profit" value={kes(p.net)} trend={`${pctOf(p.net, p.revenue)} margin`} icon="₭" up={p.net >= 0} />
      </Stats>
      <div className="sp-two" style={{ gridTemplateColumns: 'minmax(0,1.45fr) minmax(260px,.9fr)' }}>
        <div className="sp-stack">
          <Panel title="Revenue and cash flow" sub="Daily totals in Kenyan shillings" right={<div className="sp-row">{(['Revenue', 'Payouts'] as const).map((c) => <button key={c} className={`btn small ${chart === c ? 'primary' : ''}`} aria-pressed={chart === c} onClick={() => setChart(c)}>{c}</button>)}</div>}>
            {m.sample ? <p className="panel-sub">No daily detail for sample months.</p> : <Bars values={series} labels={days.map((d) => d.slice(5))} />}
          </Panel>
          <Panel title="Recent transactions" sub="Latest payment activity" right={<Btn small onClick={() => navigate('/payments')}>View payments</Btn>}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Reference</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>{f.payments.slice(0, 5).map((t) => <tr key={t.id}><td><button className="link-btn" onClick={() => navigate(`/payments/${t.id}`)}>{t.id}</button></td><td>{t.method}</td><td>{kes(t.amount)}</td><td><Badge tone={txTone(t.status)}>{t.status}</Badge></td></tr>)}</tbody>
              </table>
            </div>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Needs your attention" sub="Items requiring finance review">
            {todo.map(([title, sub, action, to, tone]) => (
              <div className="list-row" key={title}>
                <div><b style={{ fontSize: 11 }}>{title}</b><div className="panel-sub">{sub}</div></div>
                <Btn small onClick={() => navigate(to)}>{tone === 'green' ? 'View' : action}</Btn>
              </div>
            ))}
          </Panel>
          <Panel title="Period summary">
            <Detail label="Gross sales">{kes(m.gross)}</Detail>
            <Detail label="Delivery revenue">{kes(m.delivery)}</Detail>
            <Detail label="Operating costs">{kes(p.opex)}</Detail>
            <Detail label="Net profit"><span style={{ color: p.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{kes(p.net)}</span></Detail>
            <div style={{ marginTop: 10 }}><Btn small onClick={() => navigate('/finance/pnl')}>View profit and loss</Btn></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- payments ---------------------------------------------------------------------------------------------------------

const RANGES: Record<string, number> = { 'All time': Infinity, Today: 1, 'Last 7 days': 7, 'Last 30 days': 30 }

export function PaymentsList() {
  const { orders, setOrders, can, openModal, toast, log } = useStore()
  const f = useFinance()
  const now = useNow()
  const [method, setMethod] = useState('All methods')
  const [status, setStatus] = useState('All statuses')
  const [range, setRange] = useState('All time')
  const edit = can('Payments', 'Edit')
  const rows = f.payments.filter((t) => (method === 'All methods' || t.method === method) && (status === 'All statuses' || t.status === status) && now - t.at <= RANGES[range]! * DAY)
  const collected = rows.filter((t) => t.status === 'Success').reduce((n, t) => n + t.amount, 0)

  const markPaid = (t: Payment) =>
    openModal({
      title: `Mark ${t.id} as paid?`,
      message: `Confirm that ${kes(t.amount)} from ${t.customer} reached your account. The order will move on to fulfilment.`,
      confirm: 'Mark as paid',
      onConfirm: () => { setOrders(orders.map((o) => (o.id === t.orderId ? { ...o, pay: 'Paid' } : o))); log(`Reconciled payment ${t.id} · ${t.orderId}`, 'Payments'); toast('Payment marked as paid') },
    })

  const columns: Column<Payment>[] = [
    { key: 'id', header: 'Payment ID', sort: (a, b) => a.at - b.at, render: (t) => <button className="sp-link" onClick={() => navigate(`/payments/${t.id}`)}>{t.id}</button> },
    { key: 'order', header: 'Order', render: (t) => <button className="link-btn" onClick={() => navigate(`/orders/${t.orderId}`)}>{t.orderId}</button> },
    { key: 'method', header: 'Method', render: (t) => t.method },
    { key: 'customer', header: 'Customer', sort: (a, b) => a.customer.localeCompare(b.customer), render: (t) => t.customer },
    { key: 'amount', header: 'Amount', sort: (a, b) => a.amount - b.amount, render: (t) => <b>{kes(t.amount)}</b> },
    { key: 'at', header: 'Time', render: (t) => dateTime(t.at) },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={txTone(t.status)}>{t.status}</Badge> },
  ]
  return (
    <>
      <PageHead
        title="Payments"
        desc="Search and review M-Pesa, card and cash-on-delivery transactions."
        actions={<><Btn onClick={() => navigate('/finance/reconciliation')}>Reconcile statement</Btn><Btn variant="primary" disabled={!can('Payments', 'Export')} onClick={() => { downloadCsv('payments.csv', ['Payment', 'Order', 'Customer', 'Method', 'Amount (KES)', 'Status', 'Reference', 'Date'], rows.map((t) => [t.id, t.orderId, t.customer, t.method, t.amount, t.status, t.ref, new Date(t.at).toISOString()])); toast('Payments exported') }}>Export payments</Btn></>}
      />
      <Stats>
        <Stat label="Collected" value={kes(collected)} trend={`${rows.filter((t) => t.status === 'Success').length} successful`} icon="↗" />
        <Stat label="Awaiting payment" value={String(rows.filter((t) => t.status === 'Pending').length)} trend={kes(rows.filter((t) => t.status === 'Pending').reduce((n, t) => n + t.amount, 0))} icon="◷" up={false} />
        <Stat label="Failed" value={String(rows.filter((t) => t.status === 'Failed').length)} trend="Retry from Failed payments" icon="!" up={false} />
        <Stat label="Refunded" value={String(rows.filter((t) => t.status === 'Refunded').length)} trend="Orders refunded in full" icon="↺" up={false} />
      </Stats>
      <DataTable
        title={`${rows.length} transactions`}
        rows={rows}
        rowKey={(t) => t.id}
        columns={columns}
        searchLabel="Search payment or order ID"
        searchText={(t) => `${t.id} ${t.orderId} ${t.customer} ${t.ref}`}
        tools={
          <>
            <select className="sp-select auto" aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}><option>All methods</option><option>M-Pesa</option><option>Card</option><option>Cash on delivery</option></select>
            <select className="sp-select auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option><option>Success</option><option>Pending</option><option>Failed</option><option>Refunded</option></select>
            <select className="sp-select auto" aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value)}>{Object.keys(RANGES).map((r) => <option key={r}>{r}</option>)}</select>
          </>
        }
        actions={(t) => (t.status === 'Pending' && t.method !== 'M-Pesa' ? <Btn small disabled={!edit} onClick={() => markPaid(t)}>Mark as paid</Btn> : <Btn small onClick={() => navigate(`/payments/${t.id}`)}>View</Btn>)}
      />
    </>
  )
}

const stl = (ms: number) => `STL-${dayKey(ms).replaceAll('-', '')}-0${(ms % 4) + 1}`

export function PaymentDetail({ id }: { id: string }) {
  const { orders, customers, payments: gw, can, toast } = useStore()
  const f = useFinance()
  const { retryFailed } = f
  const t = f.payments.find((x) => x.id === id)
  if (!t) return <NotFoundCard what="Payment" back="Back to payments" onBack={() => navigate('/payments')} />
  const order = orders.find((o) => o.id === t.orderId)
  const customer = customers.find((c) => c.id === order?.customerId) ?? customers.find((c) => c.name === t.customer)
  const failed = f.failed.find((x) => x.id === t.id)
  const retry = () => {
    const r = retryFailed(t.id)
    toast(r === 'recovered' ? 'Payment recovered' : r === 'manual' ? 'Still failing. Moved to manual review' : 'The retry failed again')
  }
  return (
    <>
      <PageHead title="Payment detail" desc="Transaction record with processor references and settlement status." actions={<><Btn onClick={() => navigate('/payments')}>← Payments</Btn>{failed && failed.status !== 'Recovered' && <Btn variant="primary" disabled={!can('Payments', 'Edit')} onClick={retry}>Retry payment</Btn>}{order && t.status === 'Success' && <Btn disabled={!can('Orders', 'Edit') && !can('Payments', 'Edit')} onClick={() => navigate(`/orders/${order.id}`)}>Refund from order</Btn>}</>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title={t.id} sub="Payment ID" right={<Badge tone={txTone(t.status)}>{t.status}</Badge>}>
            <div className="sp-detail"><span>Amount</span><b className="fin-total">{kes(t.amount)}</b></div>
            <Detail label="Method">{t.method === 'M-Pesa' ? `M-Pesa · Paybill ${gw.shortcode}` : t.method}</Detail>
            <Detail label="Time">{dateTime(t.at)}</Detail>
            <Detail label="Gateway reference"><code>{t.ref}</code></Detail>
            <Detail label="Gateway result">{t.failure ? `Failed · ${t.failure}` : t.status === 'Success' ? 'Success' : t.status}</Detail>
            {t.attempts !== undefined && <Detail label="Attempts">{t.attempts} of 3</Detail>}
            <Detail label="Settlement batch">{t.status === 'Success' ? stl(t.at) : 'Not settled'}</Detail>
          </Panel>
          <Panel title="Order summary" sub={`Order ${t.orderId}`} right={order && <Btn small onClick={() => navigate(`/orders/${order.id}`)}>View order</Btn>}>
            {order ? (
              <>
                <Detail label="Items subtotal">{kes(order.subtotal)}</Detail>
                <Detail label="Delivery fee">{kes(order.fee)}</Detail>
                <Detail label="Discount">− KES 0</Detail>
                <Detail label="Total charged">{kes(order.total)}</Detail>
                {order.refunded > 0 && <Detail label="Refunded"><span style={{ color: 'var(--red)' }}>− {kes(order.refunded)}</span></Detail>}
              </>
            ) : <p className="panel-sub">This order isn’t in the demo data.</p>}
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Customer">
            <div className="sp-row"><Person name={t.customer} size={44} /><div><b>{t.customer}</b>{customer && <div className="panel-sub">{customer.phone} · {customer.email}</div>}</div></div>
            {customer && <><Detail label="Account since">{customer.added}</Detail><Detail label="Lifetime orders">{customer.orders}</Detail></>}
          </Panel>
          <Panel title="Event timeline">
            <div className="sp-tl">
              {[
                ...(order?.events.filter((e) => e.status === 'Refunded').map((e) => ({ title: `Refund ${e.note ?? ''}`, sub: dateTime(e.at) })) ?? []),
                { title: t.status === 'Failed' ? `Payment failed${t.failure ? ` · ${t.failure}` : ''}` : t.status === 'Pending' ? 'Waiting for payment' : 'Payment confirmed', sub: `${dateTime(t.at)}${t.method === 'M-Pesa' ? ' · M-Pesa callback' : ''}` },
                { title: 'Customer started checkout', sub: dateTime(order?.placedAt ?? t.at - 120_000) },
              ].map((e, i) => <div className="sp-tl-item" key={i}><span className={`sp-tl-dot ${i === 0 ? '' : 'gray'}`} /><div><b>{e.title}</b><small>{e.sub}</small></div></div>)}
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- failed payments ------------------------------------------------------------------------------------------------------

export function FailedPayments() {
  const f = useFinance()
  const { can, openModal, toast } = useStore()
  const now = useNow()
  const [state, setState] = useState('Open')
  const edit = can('Payments', 'Edit')
  const open = f.failed.filter((x) => x.status !== 'Recovered')
  const eligible = open.filter((x) => x.status === 'Failed' && RETRYABLE.includes(x.reason) && x.attempts < 3)
  const rows = f.failed.filter((x) => (state === 'Open' ? x.status !== 'Recovered' : state === 'Recovered' ? x.status === 'Recovered' : true))
  const recovered = f.failed.filter((x) => x.status === 'Recovered')

  const retry = (id: string) => {
    const r = f.retryFailed(id)
    toast(r === 'recovered' ? `Payment ${id} recovered` : r === 'manual' ? `${id} failed 3 times. Moved to manual review` : `${id} failed again`)
  }
  const retryAll = () =>
    openModal({
      title: 'Retry eligible payments?',
      message: `${eligible.length} payment${eligible.length === 1 ? '' : 's'} will be retried once. Customers may get a new M-Pesa prompt.`,
      confirm: 'Retry now',
      onConfirm: () => { const results = eligible.map((x) => f.retryFailed(x.id)); toast(`${results.filter((r) => r === 'recovered').length} of ${results.length} recovered`) },
    })
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'id', header: 'Payment', render: (x) => <button className="sp-link" onClick={() => navigate(`/payments/${x.id}`)}>{x.id}</button> },
    { key: 'order', header: 'Order', render: (x) => x.orderId },
    { key: 'customer', header: 'Customer', sort: (a, b) => a.customer.localeCompare(b.customer), render: (x) => x.customer },
    { key: 'method', header: 'Method', render: (x) => x.method },
    { key: 'amount', header: 'Amount', sort: (a, b) => a.amount - b.amount, render: (x) => <b>{kes(x.amount)}</b> },
    { key: 'reason', header: 'Failure reason', render: (x) => x.reason },
    { key: 'att', header: 'Attempts', render: (x) => `${x.attempts} of 3` },
    { key: 'st', header: 'Status', render: (x) => <Badge tone={x.status === 'Recovered' ? 'green' : x.status === 'Manual review' ? 'red' : 'amber'}>{x.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="Failed payments and retries" desc="Resolve failed collections with safe, auditable retry attempts." actions={<><Btn disabled={!edit || !eligible.length} onClick={retryAll}>Retry eligible ({eligible.length})</Btn><Btn variant="primary" onClick={() => { downloadCsv('failed-payments.csv', ['Payment', 'Order', 'Customer', 'Method', 'Amount', 'Reason', 'Attempts', 'Status'], f.failed.map((x) => [x.id, x.orderId, x.customer, x.method, x.amount, x.reason, x.attempts, x.status])); toast('Failures exported') }}>Export failures</Btn></>} />
      <Stats>
        <Stat label="Failed" value={String(open.length)} trend={kes(open.reduce((n, x) => n + x.amount, 0))} icon="!" up={open.length === 0} />
        <Stat label="Retry eligible" value={String(eligible.length)} trend="Timeouts and unreachable customers" icon="↻" />
        <Stat label="Recovered" value={kes(recovered.reduce((n, x) => n + x.amount, 0))} trend={`${recovered.length} payments`} icon="✓" />
      </Stats>
      <DataTable
        title={`${rows.length} payments`}
        rows={rows}
        rowKey={(x) => x.id}
        columns={cols}
        searchLabel="Search payment, order or customer"
        searchText={(x) => `${x.id} ${x.orderId} ${x.customer} ${x.reason}`}
        tools={<select className="sp-select auto" aria-label="Retry status" value={state} onChange={(e) => setState(e.target.value)}><option>Open</option><option>Recovered</option><option>All</option></select>}
        actions={(x) => x.status === 'Recovered' ? <span className="subtext">{when(now)}</span> : <Btn small disabled={!edit || x.status === 'Manual review'} onClick={() => retry(x.id)}>{x.status === 'Manual review' ? 'Manual' : 'Retry'}</Btn>}
        empty="Nothing here. Every payment went through."
      />
    </>
  )
}

// ---- reconciliation ----------------------------------------------------------------------------------------------------------

function LineForm({ line }: { line: StatementLine }) {
  const { orders, closeModal, toast } = useStore()
  const f = useFinance()
  const state = matchState(line)
  const used = new Set(f.statement.lines.map((l) => l.orderId))
  const choices = orders.filter((o) => o.pay === 'Paid' && !used.has(o.id)).slice(0, 25)
  const [how, setHow] = useState<'adjusted' | 'written-off' | 'matched-manually'>(state === 'Unmatched' ? 'matched-manually' : 'adjusted')
  const [orderId, setOrderId] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const submit = () => {
    if (how === 'matched-manually' && !orderId) return setErr('Choose the order this payment belongs to')
    if (!note.trim()) return setErr('Add a note for the audit trail')
    f.resolveLine(line.id, how, note.trim(), how === 'matched-manually' ? orderId : undefined)
    closeModal()
    toast('Line resolved')
  }
  return (
    <>
      <Detail label="Gateway reference"><code>{line.ref}</code></Detail>
      <Detail label="Gateway amount">{kes(line.gateway)}</Detail>
      <Detail label="ShopCore amount">{line.ours === null ? '—' : kes(line.ours)}</Detail>
      <Detail label="Variance">{kes(line.gateway - (line.ours ?? 0))}</Detail>
      {line.resolution ? (
        <div style={{ marginTop: 12 }}><Notice tone="success" mark="✓">Resolved: {line.resolution.replace('-', ' ')}. {line.note}</Notice></div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {state === 'Mismatch' && (
            <>
              <label className={`sp-choice ${how === 'adjusted' ? 'on' : ''}`}><input type="radio" checked={how === 'adjusted'} onChange={() => setHow('adjusted')} /><span><b>Accept the gateway amount</b><span className="sp-sub">Record an adjustment of {kes(Math.abs(line.gateway - (line.ours ?? 0)))}.</span></span></label>
              <label className={`sp-choice ${how === 'written-off' ? 'on' : ''}`}><input type="radio" checked={how === 'written-off'} onChange={() => setHow('written-off')} /><span><b>Write off the difference</b><span className="sp-sub">The order total stays as it is.</span></span></label>
            </>
          )}
          {state === 'Unmatched' && (
            <>
              <label className={`sp-choice ${how === 'matched-manually' ? 'on' : ''}`}><input type="radio" checked={how === 'matched-manually'} onChange={() => setHow('matched-manually')} /><span><b>Match to an order</b></span></label>
              {how === 'matched-manually' && <Field label="Order" value={orderId} onChange={setOrderId} options={[{ value: '', label: 'Choose an order…' }, ...choices.map((o) => ({ value: o.id, label: `${o.id} · ${o.customer} · ${kes(o.total)}` }))]} />}
              <label className={`sp-choice ${how === 'written-off' ? 'on' : ''}`}><input type="radio" checked={how === 'written-off'} onChange={() => setHow('written-off')} /><span><b>Hold as unidentified</b><span className="sp-sub">Follow up with the sender; nothing is credited.</span></span></label>
            </>
          )}
          <Field label="Note" multiline value={note} onChange={(v) => { setNote(v); setErr('') }} error={err} />
          <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={submit}>Resolve</Btn></div>
        </div>
      )}
    </>
  )
}

export function Reconciliation() {
  const f = useFinance()
  const { openModal, toast, can } = useStore()
  const file = useRef<HTMLInputElement>(null)
  const [show, setShow] = useState('All match statuses')
  const edit = can('Payments', 'Edit')
  const s = f.statement
  const rows = s.lines.filter((l) => show === 'All match statuses' || matchState(l) === show)
  const sum = (st: string) => s.lines.filter((l) => matchState(l) === st).reduce((n, l) => n + l.gateway, 0)
  const open = s.lines.filter((l) => matchState(l) === 'Mismatch' || matchState(l) === 'Unmatched')
  const total = s.lines.reduce((n, l) => n + l.gateway, 0)

  const upload = async (fl: File | undefined) => {
    if (!fl) return
    const err = f.importStatement(fl.name, await fl.text())
    toast(err ?? `${fl.name} imported`)
  }
  const sample = () => downloadCsv('mpesa-statement-sample.csv', ['reference', 'amount'], s.lines.filter((l) => l.ours !== null).map((l) => [l.ref, l.gateway]))
  const cols: Column<StatementLine>[] = [
    { key: 'ref', header: 'Gateway reference', render: (l) => <code>{l.ref}</code> },
    { key: 'order', header: 'Order', render: (l) => l.orderId ?? '—' },
    { key: 'g', header: 'Gateway amount', sort: (a, b) => a.gateway - b.gateway, render: (l) => kes(l.gateway) },
    { key: 'o', header: 'ShopCore amount', render: (l) => (l.ours === null ? '—' : kes(l.ours)) },
    { key: 'v', header: 'Variance', render: (l) => { const v = l.gateway - (l.ours ?? 0); return v === 0 ? kes(0) : <span style={{ color: 'var(--red)' }}>{kes(v)}</span> } },
    { key: 'st', header: 'Match status', render: (l) => { const m = matchState(l); return <Badge tone={m === 'Matched' || m === 'Resolved' ? 'green' : m === 'Mismatch' ? 'red' : 'amber'}>{m}</Badge> } },
  ]
  return (
    <>
      <PageHead
        title="Reconciliation"
        desc="Match gateway statements against ShopCore orders and investigate variances."
        actions={<><input ref={file} type="file" accept=".csv" hidden aria-label="Statement file" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} /><Btn disabled={!edit} onClick={() => file.current?.click()}>Upload statement</Btn><Btn variant="primary" disabled={!edit || s.completed} onClick={() => openModal({ title: 'Complete reconciliation?', message: open.length ? `${open.length} unresolved line${open.length === 1 ? '' : 's'} will stay open and block the period close.` : 'Every line is matched or resolved.', confirm: 'Complete', onConfirm: () => { f.completeReconciliation(); toast('Reconciliation completed') } })}>{s.completed ? 'Completed' : 'Complete reconciliation'}</Btn></>}
      />
      <Stats>
        <Stat label="Statement total" value={kes(total)} trend={`${s.lines.length} lines`} icon="₭" />
        <Stat label="Matched" value={kes(sum('Matched') + sum('Resolved'))} trend={pctOf(sum('Matched') + sum('Resolved'), total)} icon="✓" />
        <Stat label="Mismatches" value={kes(s.lines.filter((l) => matchState(l) === 'Mismatch').reduce((n, l) => n + Math.abs(l.gateway - (l.ours ?? 0)), 0))} trend={`${s.lines.filter((l) => matchState(l) === 'Mismatch').length} amount variances`} icon="!" up={false} />
        <Stat label="Unmatched" value={kes(sum('Unmatched'))} trend={`${s.lines.filter((l) => matchState(l) === 'Unmatched').length} gateway transactions`} icon="?" up={false} />
      </Stats>
      <Panel>
        <Steps steps={[{ label: 'Upload statement', done: true }, { label: 'Review matches', done: true }, { label: 'Complete', done: s.completed }]} />
        <div className="sp-row between">
          <div><b style={{ fontSize: 12 }}>M-Pesa statement · {s.file}</b><div className="panel-sub">Imported {dateTime(s.importedAt)} · {s.lines.length} transactions</div></div>
          <Btn small onClick={sample}>Download a sample file</Btn>
        </div>
        <p className="panel-sub" style={{ marginTop: 8 }}>A statement is a CSV with a “reference” column and an “amount” column. Lines are matched to payments by gateway reference.</p>
      </Panel>
      <div style={{ height: 12 }} />
      <DataTable
        title="Statement lines"
        rows={rows}
        rowKey={(l) => l.id}
        columns={cols}
        searchLabel="Search reference or order"
        searchText={(l) => `${l.ref} ${l.orderId ?? ''}`}
        tools={<select className="sp-select auto" aria-label="Match status" value={show} onChange={(e) => setShow(e.target.value)}><option>All match statuses</option><option>Mismatch</option><option>Unmatched</option><option>Matched</option><option>Resolved</option></select>}
        actions={(l) => {
          const m = matchState(l)
          return <Btn small onClick={() => openModal({ title: m === 'Matched' ? 'Matched transaction' : m === 'Unmatched' ? 'Unmatched gateway transaction' : m === 'Resolved' ? 'Resolved line' : 'Reconciliation mismatch', body: <LineForm line={l} />, noActions: true })}>{m === 'Matched' || m === 'Resolved' ? 'View' : m === 'Unmatched' ? 'Match' : 'Investigate'}</Btn>
        }}
      />
    </>
  )
}

// ---- refunds ledger ------------------------------------------------------------------------------------------------------------

interface RefundRow { id: string; order: Order; amount: number; reason: string; at: number }

export function RefundsLedger() {
  const { orders, can, toast } = useStore()
  const { refunds: claims } = useSupport()
  const now = useNow()
  const [method, setMethod] = useState('All methods')
  const rows: RefundRow[] = orders.filter((o) => o.refunded > 0).map((o) => {
    const ev = [...o.events].reverse().find((e) => e.status === 'Refunded')
    return { id: `RF-${o.id.slice(3)}`, order: o, amount: o.refunded, reason: ev?.note?.split(' · ')[1] ?? 'Order cancelled', at: ev?.at ?? o.placedAt }
  }).filter((r) => method === 'All methods' || r.order.method === method).sort((a, b) => b.at - a.at)
  const start = monthStart(monthKey(now))
  const thisMonth = rows.filter((r) => r.at >= start)
  const waiting = claims.filter((c) => c.status === 'Needs review')
  const cols: Column<RefundRow>[] = [
    { key: 'id', header: 'Refund', render: (r) => <b>{r.id}</b> },
    { key: 'o', header: 'Order', render: (r) => <button className="link-btn" onClick={() => navigate(`/orders/${r.order.id}`)}>{r.order.id}</button> },
    { key: 'c', header: 'Customer', sort: (a, b) => a.order.customer.localeCompare(b.order.customer), render: (r) => r.order.customer },
    { key: 'm', header: 'Refunded to', render: (r) => r.order.method === 'Card' ? 'Card' : 'M-Pesa' },
    { key: 'a', header: 'Amount', sort: (a, b) => a.amount - b.amount, render: (r) => <b>{kes(r.amount)}</b> },
    { key: 'w', header: 'Reason', render: (r) => r.reason },
    { key: 'p', header: 'Processed', sort: (a, b) => a.at - b.at, render: (r) => dateTime(r.at) },
    { key: 's', header: 'Type', render: (r) => <Badge tone={r.amount >= r.order.total ? 'red' : 'amber'}>{r.amount >= r.order.total ? 'Full' : 'Partial'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Refunds ledger" desc="Every refund sent back to customers, with the order and reason behind it." actions={<><Btn disabled={!can('Payments', 'Export')} onClick={() => { downloadCsv('refunds.csv', ['Refund', 'Order', 'Customer', 'Amount (KES)', 'Reason', 'Date'], rows.map((r) => [r.id, r.order.id, r.order.customer, r.amount, r.reason, new Date(r.at).toISOString()])); toast('Refund ledger exported') }}>Export ledger</Btn><Btn variant="primary" onClick={() => navigate('/support/refunds')}>Refund requests</Btn></>} />
      <Stats>
        <Stat label="Refunds this month" value={kes(thisMonth.reduce((n, r) => n + r.amount, 0))} trend={`${thisMonth.length} transactions`} icon="↶" up={false} />
        <Stat label="All refunds" value={kes(rows.reduce((n, r) => n + r.amount, 0))} trend={`${rows.length} orders`} icon="₭" up={false} />
        <Stat label="Awaiting decision" value={String(waiting.length)} trend={kes(waiting.reduce((n, c) => n + c.amount, 0)) + ' requested by customers'} icon="…" up={waiting.length === 0} />
      </Stats>
      <DataTable
        title="Refunds"
        rows={rows}
        rowKey={(r) => r.id}
        columns={cols}
        searchLabel="Search refund or order ID"
        searchText={(r) => `${r.id} ${r.order.id} ${r.order.customer} ${r.reason}`}
        tools={<select className="sp-select auto" aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}><option>All methods</option><option>M-Pesa</option><option>Card</option></select>}
        empty="No refunds have been issued."
      />
    </>
  )
}

// ---- VAT --------------------------------------------------------------------------------------------------------------------------

const vatDue = (key: string) => { const [y, m] = shiftMonth(key, 1).split('-').map(Number); return new Date(y!, m! - 1, 20, 23, 59).getTime() }

function FileForm({ month }: { month: string }) {
  const f = useFinance()
  const { closeModal, toast } = useStore()
  const [ack, setAck] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <p className="panel-sub" style={{ marginBottom: 10 }}>File the return on iTax first, then enter the acknowledgement number here so the filing is on record.</p>
      <Field label="KRA acknowledgement number" value={ack} onChange={(v) => { setAck(v); setErr('') }} error={err} placeholder="For example KRA-VAT-884201" />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { const e = f.fileReturn(month, ack); if (e) return setErr(e); closeModal(); toast(`${monthLabel(month)} return marked as filed`) }}>Mark as filed</Btn></div>
    </>
  )
}

export function VatReport() {
  const f = useFinance()
  const { can, openModal, toast } = useStore()
  const now = useNow()
  const edit = can('Payments', 'Edit')
  const cur = monthKey(now)
  const rows = monthOptions(now, 5).map((k) => {
    const m = f.month(k)
    const collected = vatIn(m.gross, f.vatRate)
    const adj = vatIn(m.refunds, f.vatRate)
    return { key: k, m, taxable: m.gross / (1 + f.vatRate / 100), collected, adj, net: collected - adj, filing: f.filings[k], due: vatDue(k) }
  })
  const c = rows[0]!
  const prepare = (k: string) => openModal({ title: `Prepare VAT return for ${monthLabel(k)}?`, message: 'A draft return is created from this month’s orders and refunds for you to review.', confirm: 'Prepare draft', onConfirm: () => { f.prepareFiling(k); toast('Draft return prepared') } })
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'p', header: 'Period', render: (r) => <b>{monthLabel(r.key)}{r.m.sample && <span className="sp-sub">Sample figures</span>}</b> },
    { key: 't', header: 'Taxable sales', render: (r) => kes(r.taxable) },
    { key: 'c', header: `VAT collected (${f.vatRate}%)`, render: (r) => kes(r.collected) },
    { key: 'a', header: 'Refund adjustments', render: (r) => kes(r.adj) },
    { key: 'n', header: 'Net VAT payable', render: (r) => <b>{kes(r.net)}</b> },
    { key: 'd', header: 'Due', render: (r) => dateTime(r.due).replace(/, .*/, '') },
    { key: 's', header: 'Filing status', render: (r) => r.filing ? <Badge tone={r.filing.status === 'Filed' ? 'green' : 'amber'}>{r.filing.status}</Badge> : r.key === cur ? <Badge tone="blue">Open</Badge> : <Badge tone={now > r.due ? 'red' : 'amber'}>{now > r.due ? 'Overdue' : 'Not prepared'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Taxes and VAT report" desc="Review VAT collected, adjustments and monthly filing summaries." actions={<><Btn disabled={!can('Payments', 'Export')} onClick={() => { downloadCsv('vat-report.csv', ['Period', 'Taxable sales', 'VAT collected', 'Refund adjustments', 'Net VAT payable', 'Status'], rows.map((r) => [monthLabel(r.key), Math.round(r.taxable), Math.round(r.collected), Math.round(r.adj), Math.round(r.net), r.filing?.status ?? 'Not filed'])); toast('VAT report exported') }}>Export report</Btn><Btn variant="primary" disabled={!edit || !!f.filings[shiftMonth(cur, -1)]} onClick={() => prepare(shiftMonth(cur, -1))}>Prepare last month’s return</Btn></>} />
      <Stats>
        <Stat label="VAT collected" value={kes(c.collected)} trend={`${monthLabel(cur)} · ${f.vatRate}% standard rate`} icon="%" />
        <Stat label="Refund adjustments" value={kes(c.adj)} trend="Credited back on refunds" icon="↶" up={false} />
        <Stat label="Net VAT payable" value={kes(c.net)} trend={`Due ${dateTime(c.due).replace(/, .*/, '')}`} icon="₭" />
      </Stats>
      <div style={{ marginBottom: 12 }}><Notice>Prices are treated as VAT-inclusive. This report shows output VAT only. Input VAT on purchases isn’t tracked yet, so confirm the final figure with your accountant before filing.</Notice></div>
      <DataTable
        title="VAT by month"
        rows={rows}
        rowKey={(r) => r.key}
        columns={cols}
        searchLabel="Search tax period"
        searchText={(r) => monthLabel(r.key)}
        actions={(r) => r.filing?.status === 'Filed' ? <Btn small onClick={() => openModal({ title: `${monthLabel(r.key)} · Filed`, message: `Acknowledgement ${r.filing!.ack} · filed ${dateTime(r.filing!.filedAt!)} · prepared by ${r.filing!.preparedBy}.` })}>View</Btn> : r.filing ? <Btn small disabled={!edit} onClick={() => openModal({ title: `File ${monthLabel(r.key)} return`, body: <FileForm month={r.key} />, noActions: true })}>Mark as filed</Btn> : <Btn small disabled={!edit} onClick={() => prepare(r.key)}>Prepare</Btn>}
      />
    </>
  )
}

// ---- profit and loss ---------------------------------------------------------------------------------------------------------

export function ProfitLoss() {
  const f = useFinance()
  const { can, toast } = useStore()
  const now = useNow()
  const [mk, setMk] = useState(monthKey(now))
  const m = f.month(mk)
  const p = computePnl(m, f.settings, f.vatRate, f.expenses, f.runs)
  const trend = monthOptions(now, 5).reverse().map((k) => ({ k, p: computePnl(f.month(k), f.settings, f.vatRate, f.expenses, f.runs) }))
  const closed = f.closed[mk]
  const lines: [string, number, boolean?][] = [
    ['Revenue', 0, true], ['Product sales (ex VAT)', p.productNet], ['Delivery fees (ex VAT)', p.deliveryNet], ['Refunds (ex VAT)', -p.refundsNet],
    ['Total revenue', p.revenue, true], ['Cost of goods sold', -p.cogs], ['Gross profit', p.grossProfit, true],
    ['Rider payouts', -p.riderPay], ['Payment processing fees', -p.processing], ['Operating expenses', -p.expenses], ['Staff payroll (employer cost)', -p.payroll], ['Net profit', p.net, true],
  ]
  const fmt = (n: number) => (n < 0 ? `− ${kes(-n)}` : kes(n))
  return (
    <>
      <PageHead title="Profit and loss summary" desc="Accrual view of operating performance for the selected month." actions={<><MonthSelect value={mk} onChange={setMk} now={now} /><Btn disabled={!can('Payments', 'Export')} onClick={() => { downloadCsv(`profit-and-loss-${mk}.csv`, ['Account', 'Amount (KES)'], lines.filter((l) => !(l[1] === 0 && l[2])).map((l) => [l[0], Math.round(l[1])])); toast('P&L exported') }}>Export</Btn></>} />
      {m.sample && <div style={{ marginBottom: 12 }}><Notice>This month uses sample sales figures. Expenses and payroll are real.</Notice></div>}
      {!m.sample && m.orders < 100 && <div style={{ marginBottom: 12 }}><Notice>Sales come from the {m.orders} demo orders in this month, so fixed costs such as payroll can outweigh them. Real figures arrive with the backend.</Notice></div>}
      <Stats>
        <Stat label="Total revenue" value={kes(p.revenue)} trend="After refunds, VAT excluded" icon="↗" />
        <Stat label="Gross profit" value={kes(p.grossProfit)} trend={`${pctOf(p.grossProfit, p.revenue)} gross margin`} icon="₭" />
        <Stat label="Operating costs" value={kes(p.opex)} trend={`${pctOf(p.opex, p.revenue)} of revenue`} icon="−" up={false} />
        <Stat label="Net profit" value={kes(p.net)} trend={`${pctOf(p.net, p.revenue)} net margin`} icon="✓" up={p.net >= 0} />
      </Stats>
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Profit and loss" sub={`KES · ${monthLabel(mk)}`} right={<Badge tone={closed ? 'gray' : 'blue'}>{closed ? 'Closed' : 'Open'}</Badge>}>
            <div className="table-wrap"><table><thead><tr><th>Account</th><th className="fin-num">Amount</th></tr></thead>
              <tbody>{lines.map(([l, v, b]) => <tr key={l} className={b ? 'fin-row-strong' : ''}><td>{l}</td><td className="fin-num">{b && v === 0 ? '' : fmt(v)}</td></tr>)}</tbody></table></div>
            <p className="panel-sub" style={{ marginTop: 8 }}>Cost of goods is estimated at {f.settings.cogsRate}% of product sales until real product costs are tracked. Change it under Finance settings.</p>
          </Panel>
          <Panel title="Monthly net profit" sub="KES · last 6 months"><Bars values={trend.map((t) => t.p.net)} labels={trend.map((t) => monthLabel(t.k).slice(0, 3))} /></Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Report notes">
            <Detail label="Accounting basis">Accrual</Detail>
            <Detail label="VAT">{f.vatRate}% included in prices</Detail>
            <Detail label="Period status">{closed ? `Closed by ${closed.by}` : 'Open'}</Detail>
            <div style={{ marginTop: 10 }}><Btn variant="primary" onClick={() => navigate('/finance/close')}>Review period close</Btn></div>
          </Panel>
          <Panel title="Expense breakdown">
            {p.expenseByCategory.map(([c, v]) => <div className="list-row" key={c}><b style={{ fontSize: 11 }}>{c}</b><b>{kes(v)}</b></div>)}
            {p.payroll > 0 && <div className="list-row"><b style={{ fontSize: 11 }}>Staff payroll</b><b>{kes(p.payroll)}</b></div>}
            {!p.expenseByCategory.length && p.payroll === 0 && <p className="panel-sub">No approved expenses this month.</p>}
            <div style={{ marginTop: 8 }}><Btn small onClick={() => navigate('/finance/expenses')}>View expenses</Btn></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- accounts and ledger ------------------------------------------------------------------------------------------------------

export function AccountsLedger() {
  const { riders, payouts, customers, transactions, orders } = useStore()
  const f = useFinance()
  const now = useNow()
  const received = transactions.filter((t) => t.status === 'Success').reduce((n, t) => n + t.amount, 0)
  const refunded = orders.reduce((n, o) => n + o.refunded, 0)
  const riderOwed = payouts.filter((p) => p.status !== 'Paid').reduce((n, p) => n + p.amount, 0)
  const storeOwed = f.settlements.filter((s) => !s.paid).reduce((n, s) => n + s.net, 0)
  const vatOwed = monthOptions(now, 1).reduce((n, k) => { if (f.filings[k]?.status === 'Filed') return n; const m = f.month(k); return n + vatIn(m.gross, f.vatRate) - vatIn(m.refunds, f.vatRate) }, 0)
  const wallets = customers.reduce((n, c) => n + c.wallet, 0)
  const payrollOwed = f.runs.filter((r) => r.status === 'Approved').reduce((n, r) => n + r.lines.reduce((m, l) => m + l.slip.net, 0), 0)
  const codHeld = riders.reduce((n, r) => n + r.cashHeld, 0)
  const invoiceDue = f.invoices.filter((i) => !i.draft).reduce((n, i) => n + Math.max(0, i.lines.reduce((m, l) => m + l.qty * l.unit, 0) * (1 + i.vatRate / 100) - i.payments.reduce((m, p) => m + p.amount, 0)), 0)
  const owes: [string, number, string][] = [['Rider earnings not yet paid', riderOwed, '/payouts'], ['Partner stores not yet settled', storeOwed, '/finance/settlements'], ['VAT to pay KRA', vatOwed, '/finance/vat'], ['Customer wallet balances', wallets, '/customers'], ['Approved payroll not yet paid', payrollOwed, '/finance/payroll']]
  const holds: [string, number, string][] = [['Customer payments received', received - refunded, '/payments'], ['Cash held by riders (COD)', codHeld, '/finance/cod'], ['Business invoices unpaid', invoiceDue, '/finance/invoices']]
  const sumOwes = owes.reduce((n, o) => n + o[1], 0)
  const sumHolds = holds.reduce((n, o) => n + o[1], 0)
  const entries = transactions.filter((t) => t.status === 'Success').slice(0, 10)

  return (
    <>
      <PageHead title="Accounts and ledger" desc="Money ShopCore holds, money it owes, and the entries behind it." />
      <div style={{ marginBottom: 12 }}><Notice>These balances are worked out from the demo orders, payouts and settlements. Once the real ledger and the escrow bank account are connected, this page will read from them.</Notice></div>
      <Stats>
        <Stat label="Money in and receivable" value={kes(sumHolds)} trend="Held or due to ShopCore" icon="↓" />
        <Stat label="Money owed out" value={kes(sumOwes)} trend="Riders, stores, tax, wallets, payroll" icon="↑" up={false} />
        <Stat label="Net position" value={kes(sumHolds - sumOwes)} trend="Before expenses" icon="₭" up={sumHolds - sumOwes >= 0} />
      </Stats>
      <div className="sp-two" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        <Panel title="Held and receivable" sub="Assets">
          {holds.map(([l, v, to]) => <div className="list-row" key={l}><button className="sp-link" onClick={() => navigate(to)}>{l}</button><b>{kes(v)}</b></div>)}
          <div className="list-row"><b>Total</b><b>{kes(sumHolds)}</b></div>
        </Panel>
        <Panel title="Owed to others" sub="Liabilities">
          {owes.map(([l, v, to]) => <div className="list-row" key={l}><button className="sp-link" onClick={() => navigate(to)}>{l}</button><b>{kes(v)}</b></div>)}
          <div className="list-row"><b>Total</b><b>{kes(sumOwes)}</b></div>
        </Panel>
      </div>
      <div style={{ height: 14 }} />
      <Panel title="Recent journal entries" sub="Each customer payment is a debit to the gateway and a credit to customer funds held">
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Debit</th><th>Credit</th><th className="fin-num">Amount</th></tr></thead>
          <tbody>{entries.map((t) => <tr key={t.id}><td>{dateTime(t.at)}</td><td><button className="link-btn" onClick={() => navigate(`/payments/${t.id}`)}>{t.id}</button></td><td>{t.method === 'Card' ? 'Card gateway' : 'M-Pesa paybill'}</td><td>Customer funds held · {t.orderId}</td><td className="fin-num">{kes(t.amount)}</td></tr>)}</tbody></table></div>
      </Panel>
    </>
  )
}
