import { useState } from 'react'

import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, post } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
const money = (c: number) => kes(shillings(c))
const pct = (n: number | null) => (n === null ? '' : `${n >= 0 ? '+' : ''}${n}% vs last month`)
const monthName = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleString('en-GB', { month: 'long', year: 'numeric' })

// ---- overview -------------------------------------------------------------------------------------------------------

interface PaymentRow { kind: 'payment' | 'failure'; id: string; number: string; orderId: string; orderNumber: string; customer: string; method: string; amountCents: number; status: 'Success' | 'Failed'; state: string; stateLabel: string; ref: string | null; at: string | null; reason: string | null; attempts: number | null }
interface Overview {
  month: string
  summary: { orders: number; grossCents: number; refundsCents: number; vatCents: number; codHeldCents: number; pendingPayoutsCents: number; grossChangePct: number | null; ordersChangePct: number | null }
  daily: { day: string; revenueCents: number; payoutsCents: number }[]
  recentPayments: PaymentRow[]
  attention: { key: string; label: string; count: number; to: string }[]
}

export function FinanceOverview() {
  const { data: o, failed, reload } = useGet<Overview>('/v1/admin/finance/overview', 60_000)
  if (!o) return <PageHead title="Finance overview" desc={failed ? 'We couldn’t load the finance overview.' : 'Loading…'} actions={<Btn onClick={reload}>Try again</Btn>} />
  const s = o.summary
  const max = Math.max(1, ...o.daily.map((d) => d.revenueCents))
  return (
    <>
      <PageHead title="Finance overview" desc={`${monthName(o.month)} so far.`} actions={<Btn onClick={reload}>Refresh</Btn>} />
      <div className="tile-row">
        <Stat label="Sales" value={money(s.grossCents)} trend={pct(s.grossChangePct) || 'This month'} icon="↗" />
        <Stat label="Orders" value={String(s.orders)} trend={pct(s.ordersChangePct) || 'This month'} icon="▣" />
        <Stat label="Refunds" value={money(s.refundsCents)} trend="Approved this month" icon="↩" up={s.refundsCents === 0} />
        <Stat label="VAT collected" value={money(s.vatCents)} trend="Inside sales" icon="%" />
        <Stat label="Cash with riders" value={money(s.codHeldCents)} trend="Cash on delivery to hand in" icon="◈" up={s.codHeldCents === 0} />
        <Stat label="Rider payouts waiting" value={money(s.pendingPayoutsCents)} trend="Not yet paid" icon="◷" up={s.pendingPayoutsCents === 0} />
      </div>
      {o.attention.length > 0 && (
        <Panel title="Needs your attention">
          {o.attention.map((a) => <div className="list-row" key={a.key}><span><strong>{a.label}</strong></span><Btn small onClick={() => navigate(a.to.startsWith('/finance') ? a.to : a.to === '/payments' ? '/finance' : a.to === '/payouts' ? '/finance/payouts' : a.to)}>Open</Btn></div>)}
        </Panel>
      )}
      <div className="sp-two" style={{ marginTop: 14 }}>
        <Panel title="Sales over the last 30 days">
          <div className="sales-bars" role="img" aria-label="Daily sales">
            {o.daily.map((d, i, all) => <div key={d.day} title={`${d.day}: ${money(d.revenueCents)}`} className={`sales-bar${i === all.length - 1 ? ' latest' : ''}${d.revenueCents ? '' : ' empty'}`} style={{ height: `${Math.max(3, (d.revenueCents / max) * 100)}%` }} />)}
          </div>
        </Panel>
        <Panel title="Latest payments" right={<Btn small onClick={() => navigate('/finance/failed')}>Failed payments</Btn>}>
          {o.recentPayments.length === 0 && <div className="panel-sub">No payments yet.</div>}
          {o.recentPayments.map((p) => <div className="list-row" key={p.id}><span><strong>{p.orderNumber}</strong><small>{p.customer} · {p.method}</small></span><span className="sp-row"><b>{money(p.amountCents)}</b><Badge tone={p.status === 'Success' ? 'green' : 'red'}>{p.stateLabel}</Badge></span></div>)}
        </Panel>
      </div>
    </>
  )
}

// ---- payments -------------------------------------------------------------------------------------------------------

export function PaymentsList() {
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const { data, failed, loading, reload } = useGet<{ items: PaymentRow[]; totals: { successCount: number; receivedCents: number; failed: number; recovered: number; manualReview: number } }>(`/v1/admin/payments?limit=300${status ? `&status=${status}` : ''}${method ? `&method=${method}` : ''}`, 60_000)
  const t = data?.totals
  const cols: Column<PaymentRow>[] = [
    { key: 'n', header: 'Payment', render: (p) => <button className="link-btn" onClick={() => navigate(`/payments/${p.id}`)}>{p.number}</button> },
    { key: 'o', header: 'Order', render: (p) => <button className="link-btn" onClick={() => navigate(`/orders/${p.orderId}`)}>{p.orderNumber}</button> },
    { key: 'c', header: 'Customer', render: (p) => p.customer },
    { key: 'm', header: 'Method', render: (p) => p.method },
    { key: 'a', header: 'Amount', sort: (a, b) => a.amountCents - b.amountCents, render: (p) => <b>{money(p.amountCents)}</b> },
    { key: 's', header: 'Status', render: (p) => <Badge tone={p.status === 'Success' ? 'green' : p.state === 'manual_review' ? 'amber' : 'red'}>{p.stateLabel}</Badge> },
    { key: 'r', header: 'Reference', render: (p) => p.ref ?? '—' },
    { key: 'at', header: 'When', sort: (a, b) => Date.parse(a.at ?? '') - Date.parse(b.at ?? ''), render: (p) => (p.at ? dateTime(Date.parse(p.at)) : '—') },
  ]
  return (
    <>
      <PageHead title="Payments" desc="Every payment received through M-Pesa, and the ones that failed." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <div className="tile-row">
        <Stat label="Received" value={t ? money(t.receivedCents) : '—'} trend={`${t?.successCount ?? 0} payments`} icon="↗" />
        <Stat label="Failed" value={String(t?.failed ?? '—')} trend="Waiting to retry" icon="!" up={(t?.failed ?? 0) === 0} />
        <Stat label="Recovered" value={String(t?.recovered ?? '—')} trend="Worked on retry" icon="✓" />
        <Stat label="Manual review" value={String(t?.manualReview ?? '—')} trend="Retries ran out" icon="…" up={(t?.manualReview ?? 0) === 0} />
      </div>
      <DataTable title="Payments" rows={data?.items ?? []} rowKey={(p) => `${p.kind}:${p.id}`} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the payments.' : undefined} onRetry={reload}
        searchLabel="Search payments" searchText={(p) => `${p.number} ${p.orderNumber} ${p.customer} ${p.ref ?? ''}`} emptyTitle="No payments yet" empty="Payments appear when customers pay in the app."
        tools={<>
          <select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="success">Success</option><option value="failed">Failed</option><option value="recovered">Recovered</option><option value="manual_review">Manual review</option></select>
          <select className="select" aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All methods</option><option value="mpesa">M-Pesa</option><option value="card">Card</option></select>
        </>}
        actions={(p) => <Btn small onClick={() => navigate(`/payments/${p.id}`)}>View</Btn>} />
    </>
  )
}

interface PaymentDetailData {
  id: string; number: string; method: string; amountCents: number; ref: string | null; state: string; stateLabel: string; reason: string | null; attempts: number | null; at: string | null; retryable: boolean
  order: { id: string; number: string; status: string; totalCents: number; itemCount: number; refundedCents: number }; customer: { id: string; name: string; phone: string | null }; timeline: { at: string; label: string }[]
}

export function PaymentDetail({ id }: { id: string }) {
  const { can, toast } = useStore()
  const { data: p, failed, reload } = useGet<PaymentDetailData>(`/v1/admin/payments/${id}`)
  const [busy, setBusy] = useState(false)
  if (!p) return <PageHead title="Payment" desc={failed ? 'We couldn’t load this payment.' : 'Loading…'} actions={<Btn onClick={() => navigate("/payments")}>Back to payments</Btn>} />
  const retry = async () => {
    setBusy(true)
    try { const r = await post<{ outcome: string; reason?: string }>(`/v1/admin/payments/${id}/retry`); toast(r.outcome === 'recovered' ? 'The payment went through' : r.outcome === 'manual_review' ? 'Retries are used up. This needs a manual check.' : `Still failing: ${r.reason ?? 'try again later'}`); reload() } catch (e) { toast(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title={p.number} desc={`${p.method} · ${money(p.amountCents)}`} actions={<><Btn onClick={() => navigate("/payments")}>Back to payments</Btn><Btn onClick={() => navigate(`/orders/${p.order.id}`)}>Open the order</Btn>{p.retryable && <Btn variant="primary" disabled={!can('Payments', 'Edit') || busy} onClick={() => void retry()}>Retry now</Btn>}</>} />
      <div className="sp-two">
        <Panel title="Payment" right={<Badge tone={p.state === 'success' || p.state === 'recovered' ? 'green' : 'red'}>{p.stateLabel}</Badge>}>
          <SettingRow title="Amount" right={<b>{money(p.amountCents)}</b>} />
          <SettingRow title="Reference" right={<code>{p.ref ?? '—'}</code>} />
          {p.reason && <SettingRow title="Why it failed" sub={p.reason} right={<span className="prod-name">{`${p.attempts ?? 0} tries`}</span>} />}
          <SettingRow title="Order" sub={`${p.order.itemCount} items · ${p.order.status}`} right={<span className="prod-name">{p.order.number}</span>} />
          <SettingRow title="Customer" sub={p.customer.phone ?? ''} right={<span className="prod-name">{p.customer.name}</span>} />
          {p.order.refundedCents > 0 && <SettingRow title="Refunded" right={<b>{money(p.order.refundedCents)}</b>} />}
        </Panel>
        <Panel title="Timeline">{p.timeline.map((t, i) => <SettingRow key={i} title={t.label} sub={dateTime(Date.parse(t.at))} />)}</Panel>
      </div>
    </>
  )
}

export function FailedPayments() {
  const { can, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: PaymentRow[]; totals: { failed: number; manualReview: number } }>('/v1/admin/payments?failuresOnly=true&limit=200', 60_000)
  const [busy, setBusy] = useState(false)
  const retryAll = async () => {
    setBusy(true)
    try { const r = await post<{ tried: number; recovered: number; stillFailing: number }>('/v1/admin/payments/retry-eligible'); toast(`Tried ${r.tried}: ${r.recovered} recovered, ${r.stillFailing} still failing`); reload() } catch (e) { toast(says(e)) } finally { setBusy(false) }
  }
  const cols: Column<PaymentRow>[] = [
    { key: 'n', header: 'Payment', render: (p) => <button className="link-btn" onClick={() => navigate(`/payments/${p.id}`)}>{p.number}</button> },
    { key: 'o', header: 'Order', render: (p) => p.orderNumber },
    { key: 'c', header: 'Customer', render: (p) => p.customer },
    { key: 'a', header: 'Amount', render: (p) => <b>{money(p.amountCents)}</b> },
    { key: 'r', header: 'Why', render: (p) => p.reason ?? '—' },
    { key: 't', header: 'Tries', render: (p) => p.attempts ?? 0 },
    { key: 's', header: 'Status', render: (p) => <Badge tone={p.state === 'recovered' ? 'green' : p.state === 'manual_review' ? 'amber' : 'red'}>{p.stateLabel}</Badge> },
  ]
  return (
    <>
      <PageHead title="Failed payments" desc="Payments that didn’t go through. Reasons like “no signal” are retried; others need a person." actions={<><Btn onClick={reload}>Refresh</Btn><Btn variant="primary" disabled={!can('Payments', 'Edit') || busy} onClick={() => void retryAll()}>Retry all that can be retried</Btn></>} />
      <DataTable title="Failed payments" rows={data?.items ?? []} rowKey={(p) => p.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the failed payments.' : undefined} onRetry={reload}
        searchLabel="Search failures" searchText={(p) => `${p.number} ${p.orderNumber} ${p.customer} ${p.reason ?? ''}`} emptyTitle="No failed payments" empty="Every payment has gone through."
        actions={(p) => <Btn small onClick={() => navigate(`/payments/${p.id}`)}>Open</Btn>} />
    </>
  )
}

// ---- reconciliation -------------------------------------------------------------------------------------------------

interface StatementLine { id: string; ref: string; orderId: string | null; orderNumber: string | null; gatewayCents: number; oursCents: number | null; state: 'Matched' | 'Mismatch' | 'Unmatched' | 'Resolved'; resolution: string | null; note: string }
interface Statement { id: string | null; file?: string; importedBy?: string; importedAt?: string; completed?: boolean; completedBy?: string | null; summary?: { total: number; matched: number; mismatched: number; unmatched: number; resolved: number }; lines: StatementLine[] }

function ResolveForm({ statementId, line, onDone }: { statementId: string; line: StatementLine; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [how, setHow] = useState('adjusted')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const go = async () => {
    if (note.trim().length < 3) return setErr('Say what you found')
    try { await post(`/v1/admin/reconciliation/${statementId}/lines/${line.id}/resolve`, { how, note: note.trim() }); onDone(); closeModal(); toast('Line resolved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Notice mark="i">{`${line.ref}: gateway ${money(line.gatewayCents)} · ours ${line.oursCents === null ? 'no matching order' : money(line.oursCents)}`}</Notice>
      <Field label="How was it settled?" value={how} onChange={setHow} options={[{ value: 'adjusted', label: 'Corrected on our side' }, { value: 'matched_manually', label: 'Matched by hand' }, { value: 'written_off', label: 'Written off' }]} />
      <Field label="What did you find?" multiline value={note} onChange={(v) => { setNote(v); setErr('') }} error={err} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Resolve</Btn></div>
    </>
  )
}

export function Reconciliation() {
  const { can, toast, openModal } = useStore()
  const { data: st, failed, reload } = useGet<Statement>('/v1/admin/reconciliation')
  const [text, setText] = useState('')
  const [file, setFile] = useState('statement.csv')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const edit = can('Payments', 'Edit')
  const load = async (f: File | undefined) => { if (!f) return; setFile(f.name); setText(await f.text()) }
  const importIt = async () => {
    setBusy(true)
    try { await post('/v1/admin/reconciliation', { file, text }); setText(''); setErr(''); toast('Statement imported'); reload() } catch (e) { setErr(says(e)) } finally { setBusy(false) }
  }
  const complete = async () => { try { await post(`/v1/admin/reconciliation/${st!.id}/complete`); toast('Reconciliation completed'); reload() } catch (e) { toast(says(e)) } }
  const cols: Column<StatementLine>[] = [
    { key: 'r', header: 'Reference', render: (l) => <code>{l.ref}</code> },
    { key: 'o', header: 'Order', render: (l) => l.orderNumber ?? '—' },
    { key: 'g', header: 'Gateway', render: (l) => money(l.gatewayCents) },
    { key: 'u', header: 'Ours', render: (l) => (l.oursCents === null ? '—' : money(l.oursCents)) },
    { key: 's', header: 'Result', render: (l) => <Badge tone={l.state === 'Matched' || l.state === 'Resolved' ? 'green' : l.state === 'Mismatch' ? 'amber' : 'red'}>{l.state}</Badge> },
  ]
  return (
    <>
      <PageHead title="Reconciliation" desc="Compare the M-Pesa statement with your own records, line by line." actions={st?.id && !st.completed ? <Btn variant="primary" disabled={!edit} onClick={() => void complete()}>Complete reconciliation</Btn> : undefined} />
      {failed && !st && <Notice tone="warning" mark="!">We couldn’t load the statement.</Notice>}
      {st?.id && st.summary && (
        <div className="tile-row">
          <Stat label="Lines" value={String(st.summary.total)} trend={st.file ?? ''} icon="▤" />
          <Stat label="Matched" value={String(st.summary.matched)} trend="Amounts agree" icon="✓" />
          <Stat label="Need attention" value={String(st.summary.mismatched + st.summary.unmatched)} trend={`${st.summary.mismatched} differ · ${st.summary.unmatched} not found`} icon="!" up={st.summary.mismatched + st.summary.unmatched === 0} />
          <Stat label="Resolved" value={String(st.summary.resolved)} trend={st.completed ? `Completed by ${st.completedBy}` : 'In progress'} icon="◈" />
        </div>
      )}
      {st?.id && (
        <DataTable title="Statement lines" rows={st.lines} rowKey={(l) => l.id} columns={cols} searchLabel="Search lines" searchText={(l) => `${l.ref} ${l.orderNumber ?? ''}`} emptyTitle="No lines" empty="Import a statement to begin."
          actions={(l) => (l.state === 'Mismatch' || l.state === 'Unmatched') && !st.completed ? <Btn small disabled={!edit} onClick={() => openModal({ title: `Resolve ${l.ref}`, body: <ResolveForm statementId={st.id!} line={l} onDone={reload} />, noActions: true })}>Resolve</Btn> : <span className="subtext">{l.note}</span>} />
      )}
      <div style={{ marginTop: 14 }}>
        <Panel title="Import a statement" sub="A CSV with a header row that has a “reference” column and an “amount” column (in shillings)">
          <label className="btn small" style={{ cursor: 'pointer' }}>Choose a file<input type="file" accept=".csv,text/csv" hidden aria-label="Statement file" onChange={(e) => { void load(e.target.files?.[0]) }} /></label>
          <Field label="Or paste the rows" multiline value={text} onChange={(v) => { setText(v); setErr('') }} error={err} placeholder={'reference,amount\nQGH7K2LMN1,5100.00'} />
          <div className="sp-row end"><Btn variant="primary" disabled={!edit || busy || !text.trim()} onClick={() => void importIt()}>Import and match</Btn></div>
        </Panel>
      </div>
    </>
  )
}

// ---- refunds ledger -------------------------------------------------------------------------------------------------

interface RefundRow { id: string; number: string; order: string; orderId: string; customer: string; amountCents: number; reason: string; status: string; submittedAt: string; decision: { by: string | null; at: string; amountCents: number; reason: string } | null }

export function RefundsLedger() {
  const { data, failed, loading, reload } = useGet<{ items: RefundRow[] }>('/v1/admin/refunds?limit=200', 60_000)
  const items = data?.items ?? []
  const approved = items.filter((r) => r.decision && r.status !== 'rejected')
  const cols: Column<RefundRow>[] = [
    { key: 'n', header: 'Refund', render: (r) => <button className="link-btn" onClick={() => navigate(`/support/refunds/${r.id}`)}>{r.number}</button> },
    { key: 'o', header: 'Order', render: (r) => r.order },
    { key: 'c', header: 'Customer', render: (r) => r.customer },
    { key: 'a', header: 'Asked', render: (r) => money(r.amountCents) },
    { key: 'd', header: 'Approved', render: (r) => (r.decision && r.status !== 'rejected' ? <b>{money(r.decision.amountCents)}</b> : '—') },
    { key: 's', header: 'Status', render: (r) => <Badge tone={r.status === 'needs_review' ? 'amber' : r.status === 'rejected' ? 'red' : 'green'}>{r.status.replace('_', ' ')}</Badge> },
    { key: 'w', header: 'Asked on', render: (r) => dateTime(Date.parse(r.submittedAt)) },
  ]
  return (
    <>
      <PageHead title="Refunds ledger" desc="Every refund request and what was approved. Send the money back through M-Pesa, then keep this as your record." actions={<><Btn onClick={reload}>Refresh</Btn><Btn disabled={!items.length} onClick={() => downloadCsv('refunds.csv', ['Refund', 'Order', 'Customer', 'Asked (KES)', 'Approved (KES)', 'Status'], items.map((r) => [r.number, r.order, r.customer, shillings(r.amountCents), r.decision ? shillings(r.decision.amountCents) : '', r.status]))}>Export</Btn></>} />
      <div className="tile-row"><Stat label="Approved in total" value={money(approved.reduce((n, r) => n + (r.decision?.amountCents ?? 0), 0))} trend={`${approved.length} refunds`} icon="↩" /><Stat label="Waiting" value={String(items.filter((r) => r.status === 'needs_review').length)} trend="Need a decision" icon="◷" /></div>
      <DataTable title="Refunds" rows={items} rowKey={(r) => r.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the refunds.' : undefined} onRetry={reload} searchLabel="Search refunds" searchText={(r) => `${r.number} ${r.order} ${r.customer}`} emptyTitle="No refunds" empty="Refund requests appear here." />
    </>
  )
}

// ---- VAT ------------------------------------------------------------------------------------------------------------

interface VatMonth { month: string; taxableCents: number; collectedCents: number; adjustmentsCents: number; netCents: number; filing: { status: string; preparedBy: string; ack: string | null; filedAt: string | null } | null }

function FileForm({ month, onDone }: { month: string; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [ack, setAck] = useState('')
  const [err, setErr] = useState('')
  const go = async () => { try { await post(`/v1/admin/vat/${month}/file`, { ack: ack.trim() }); onDone(); closeModal(); toast('Return marked as filed') } catch (e) { setErr(says(e)) } }
  return (
    <>
      <Field label="Acknowledgement number from KRA" value={ack} onChange={(v) => { setAck(v); setErr('') }} error={err} hint="You get this after filing on iTax." />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Mark as filed</Btn></div>
    </>
  )
}

export function VatReport() {
  const { can, toast, openModal } = useStore()
  const { data, failed, loading, reload } = useGet<{ vatRate: number; items: VatMonth[]; unfiledCents: number }>('/v1/admin/vat')
  const edit = can('Payments', 'Edit')
  const prepare = async (m: string) => { try { await post(`/v1/admin/vat/${m}/prepare`); toast('Return prepared'); reload() } catch (e) { toast(says(e)) } }
  const cols: Column<VatMonth>[] = [
    { key: 'm', header: 'Month', render: (v) => monthName(v.month) },
    { key: 't', header: 'Taxable sales', render: (v) => money(v.taxableCents) },
    { key: 'c', header: 'VAT collected', render: (v) => money(v.collectedCents) },
    { key: 'a', header: 'Refund adjustments', render: (v) => money(v.adjustmentsCents) },
    { key: 'n', header: 'VAT to pay', render: (v) => <b>{money(v.netCents)}</b> },
    { key: 's', header: 'Return', render: (v) => <Badge tone={v.filing?.status === 'filed' ? 'green' : v.filing ? 'amber' : 'gray'}>{v.filing?.status === 'filed' ? `Filed · ${v.filing.ack}` : v.filing ? 'Draft prepared' : 'Not prepared'}</Badge> },
  ]
  return (
    <>
      <PageHead title="VAT report" desc={`VAT at ${data?.vatRate ?? 16}% is inside your prices. Prepare each month’s return once the month is over, then record the KRA acknowledgement.`} actions={data && data.unfiledCents > 0 ? <Badge tone="amber">{`${money(data.unfiledCents)} unfiled`}</Badge> : undefined} />
      <DataTable title="By month" rows={data?.items ?? []} rowKey={(v) => v.month} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the VAT report.' : undefined} onRetry={reload} searchLabel="Search months" searchText={(v) => v.month} emptyTitle="No sales yet" empty="VAT appears once you have sales."
        actions={(v) => (v.filing?.status === 'filed' ? null : <div className="sp-row"><Btn small disabled={!edit} onClick={() => void prepare(v.month)}>{v.filing ? 'Re-prepare' : 'Prepare'}</Btn>{v.filing && <Btn small variant="primary" disabled={!edit} onClick={() => openModal({ title: `File ${monthName(v.month)}`, body: <FileForm month={v.month} onDone={reload} />, noActions: true })}>Mark filed</Btn>}</div>)} />
    </>
  )
}

// ---- profit and loss ------------------------------------------------------------------------------------------------

interface Pnl { month: string; productNetCents: number; deliveryNetCents: number; refundsNetCents: number; revenueCents: number; cogsCents: number; grossProfitCents: number; riderPayCents: number; processingCents: number; expensesCents: number; expenseByCategory: [string, number][]; payrollCents: number; opexCents: number; netCents: number; closed: unknown; trend: { month: string; netCents: number }[]; assumptions: { cogsRate: number; processingFee: number; vatRate: number } }

export function ProfitLoss() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const { data: p, failed, reload } = useGet<Pnl>(`/v1/admin/reports/profit-and-loss?month=${month}`)
  const row = (title: string, cents: number, bold = false, sub?: string) => <SettingRow key={title} title={title} sub={sub} right={bold ? <b>{money(cents)}</b> : <span className="prod-name">{money(cents)}</span>} />
  return (
    <>
      <PageHead title="Profit and loss" desc="What came in, what it cost, and what is left." actions={<><Field label="" type="month" value={month} onChange={setMonth} /><Btn onClick={reload}>Refresh</Btn></>} />
      {!p && <div className="panel-sub">{failed ? 'We couldn’t load the report.' : 'Loading…'}</div>}
      {p && (
        <div className="sp-two">
          <Panel title={monthName(p.month)} right={p.closed ? <Badge tone="gray">Closed</Badge> : undefined}>
            {row('Product sales (without VAT)', p.productNetCents)}
            {row('Delivery fees (without VAT)', p.deliveryNetCents)}
            {row('Refunds', -p.refundsNetCents)}
            {row('Revenue', p.revenueCents, true)}
            {row('Cost of goods', -p.cogsCents, false, `Estimated at ${p.assumptions.cogsRate}% of product sales`)}
            {row('Gross profit', p.grossProfitCents, true)}
            {row('Rider pay', -p.riderPayCents)}
            {row('Payment processing', -p.processingCents, false, `${p.assumptions.processingFee}% of online payments`)}
            {row('Expenses', -p.expensesCents)}
            {row('Payroll', -p.payrollCents)}
            <SettingRow title="Net profit" right={<b style={{ color: p.netCents < 0 ? 'var(--red)' : 'var(--green)' }}>{money(p.netCents)}</b>} />
          </Panel>
          <div className="sp-stack">
            <Panel title="Expenses by category">{p.expenseByCategory.length === 0 && <div className="panel-sub">No approved expenses.</div>}{p.expenseByCategory.map(([c, v]) => <SettingRow key={c} title={c} right={<span className="prod-name">{money(v)}</span>} />)}</Panel>
            <Panel title="Last months">{p.trend.map((t) => <SettingRow key={t.month} title={monthName(t.month)} right={<span className="prod-name" style={{ color: t.netCents < 0 ? 'var(--red)' : undefined }}>{money(t.netCents)}</span>} />)}</Panel>
          </div>
        </div>
      )}
    </>
  )
}

// ---- accounts -------------------------------------------------------------------------------------------------------

interface Accounts { holds: { key: string; label: string; cents: number; to: string }[]; owes: { key: string; label: string; cents: number; to: string }[]; holdsTotalCents: number; owesTotalCents: number; netCents: number; journal: { at: string; label: string; cents: number }[]; note: string }

export function AccountsLedger() {
  const { data: a, failed, reload } = useGet<Accounts>('/v1/admin/accounts', 60_000)
  if (!a) return <PageHead title="Accounts" desc={failed ? 'We couldn’t load the accounts.' : 'Loading…'} actions={<Btn onClick={reload}>Try again</Btn>} />
  return (
    <>
      <PageHead title="Accounts" desc="What the business holds for others, and what it owes." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <div className="tile-row"><Stat label="Held" value={money(a.holdsTotalCents)} trend="Owed to us or held for us" icon="◈" /><Stat label="Owed" value={money(a.owesTotalCents)} trend="We still have to pay" icon="↗" up={a.owesTotalCents === 0} /><Stat label="Net position" value={money(a.netCents)} trend="Held minus owed" icon="=" /></div>
      <div className="sp-two">
        <Panel title="What we hold">{a.holds.map((h) => <SettingRow key={h.key} title={h.label} right={<b>{money(h.cents)}</b>} />)}</Panel>
        <Panel title="What we owe">{a.owes.map((h) => <SettingRow key={h.key} title={h.label} right={<b>{money(h.cents)}</b>} />)}</Panel>
      </div>
      <Notice mark="i">{a.note}</Notice>
    </>
  )
}
