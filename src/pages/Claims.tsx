import { useState } from 'react'

import { ago, Detail, Label, NotFoundCard, Person, PriorityTag, TimelineItem, useNow, when } from '../components/support-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, Stat, type Column } from '../components/ui'
import { PRIORITIES, type Dispute, type Refund, type ReturnRequest } from '../data/support'
import { kes } from '../lib/format'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'
import { REFUND_LIMIT, useSupport } from '../lib/support'

const refundTone = (s: Refund['status']) => (s === 'Needs review' ? 'amber' : s === 'Rejected' ? 'red' : 'green')
const order = { Urgent: 0, High: 1, Normal: 2, Low: 3 } as const

// ---- refunds -----------------------------------------------------------------------------------------

export function RefundsList() {
  const { refunds } = useSupport()
  const now = useNow()
  const [status, setStatus] = useState('Needs review')
  const [reason, setReason] = useState('All reasons')
  const [priority, setPriority] = useState('All priorities')
  const waiting = refunds.filter((r) => r.status === 'Needs review')
  const decided = refunds.filter((r) => r.decision && r.decision.amount >= 0)
  const times = decided.map((r) => r.decision!.at - r.submittedAt).sort((a, b) => a - b)
  const median = times.length ? times[Math.floor(times.length / 2)]! : 0
  const reasons = [...new Set(refunds.map((r) => r.reason))]
  const rows = refunds.filter((r) => (status === 'All statuses' || r.status === status) && (reason === 'All reasons' || r.reason === reason) && (priority === 'All priorities' || r.priority === priority))
  const cols: Column<Refund>[] = [
    { key: 'id', header: 'Request', sort: (a, b) => a.id.localeCompare(b.id), render: (r) => <button className="sp-link" onClick={() => navigate(`/support/refunds/${r.id}`)}>{r.id}</button> },
    { key: 'order', header: 'Order', render: (r) => r.orderId },
    { key: 'cust', header: 'Customer', sort: (a, b) => a.customerName.localeCompare(b.customerName), render: (r) => r.customerName },
    { key: 'amt', header: 'Amount', sort: (a, b) => a.amount - b.amount, render: (r) => kes(r.amount) },
    { key: 'why', header: 'Reason', render: (r) => r.reason },
    { key: 'at', header: 'Submitted', sort: (a, b) => a.submittedAt - b.submittedAt, render: (r) => when(r.submittedAt) },
    { key: 'pri', header: 'Priority', sort: (a, b) => order[a.priority] - order[b.priority], render: (r) => <PriorityTag p={r.priority} /> },
    { key: 'st', header: 'Status', render: (r) => <Badge tone={refundTone(r.status)}>{r.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="Refund requests" desc="Review customer claims and issue full or partial refunds." actions={<Btn onClick={() => downloadCsv('refund-requests.csv', ['Request', 'Order', 'Customer', 'Amount', 'Reason', 'Status'], rows.map((r) => [r.id, r.orderId, r.customerName, r.amount, r.reason, r.status]))}>Export</Btn>} />
      <div className="sp-stats3">
        <Stat label="Awaiting review" value={String(waiting.length)} trend={`${waiting.filter((r) => now - r.submittedAt < 86_400_000).length} submitted today`} icon="↶" />
        <Stat label="Pending value" value={kes(waiting.reduce((n, r) => n + r.amount, 0))} trend={`Across ${waiting.length} requests`} icon="K" />
        <Stat label="Median decision time" value={times.length ? (median >= 3_600_000 ? `${Math.floor(median / 3_600_000)}h ${Math.round((median % 3_600_000) / 60_000)}m` : `${Math.round(median / 60_000)}m`) : '—'} trend={times.length ? `${times.length} decided` : 'No decisions yet'} icon="◷" />
      </div>
      <DataTable
        title={`${waiting.length} requests awaiting review`}
        rows={rows}
        rowKey={(r) => r.id}
        columns={cols}
        searchLabel="Search refunds"
        searchText={(r) => `${r.id} ${r.orderId} ${r.customerName} ${r.reason}`}
        tools={
          <>
            <select className="sp-select auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option><option>Needs review</option><option>Approved</option><option>Partly approved</option><option>Rejected</option></select>
            <select className="sp-select auto" aria-label="Filter by reason" value={reason} onChange={(e) => setReason(e.target.value)}><option>All reasons</option>{reasons.map((r) => <option key={r}>{r}</option>)}</select>
            <select className="sp-select auto" aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option>All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          </>
        }
        actions={(r) => <Btn small onClick={() => navigate(`/support/refunds/${r.id}`)}>{r.status === 'Needs review' ? 'Review' : 'View'}</Btn>}
        empty="No refund requests match these filters."
      />
    </>
  )
}

function RejectForm({ id }: { id: string }) {
  const { decideRefund } = useSupport()
  const { closeModal, toast } = useStore()
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <p className="panel-sub" style={{ marginBottom: 10 }}>The customer will see this reason, so keep it clear and polite.</p>
      <Field label="Reason for the customer" multiline value={why} onChange={(v) => { setWhy(v); setErr('') }} error={err} />
      <div className="sp-row end">
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="danger" onClick={() => { if (!why.trim()) return setErr('Add a reason before rejecting'); decideRefund(id, 'reject', 0, why.trim()); closeModal(); toast('Refund request rejected') }}>Reject request</Btn>
      </div>
    </>
  )
}

export function RefundReview({ id }: { id: string }) {
  const { refunds, decideRefund, addRefundNote, tickets } = useSupport()
  const { orders, customers, openModal, toast, can } = useStore()
  const refund = refunds.find((r) => r.id === id)
  const order0 = refund ? orders.find((o) => o.id === refund.orderId) : undefined
  const [picked, setPicked] = useState<Set<string>>(() => new Set(refund?.itemNames ?? []))
  const [amount, setAmount] = useState(() => String(refund?.amount ?? 0))
  const [reason, setReason] = useState('Missing item confirmed')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  if (!refund || !order0) return <NotFoundCard what="Refund request" back="Back to requests" onBack={() => navigate('/support/refunds')} />
  const order = order0
  const edit = can('Support', 'Edit')
  const customer = customers.find((c) => c.id === refund.customerId)
  const open = refund.status === 'Needs review'
  const max = order.total - order.refunded
  const toggle = (name: string, on: boolean) => {
    const next = new Set(picked)
    if (on) next.add(name)
    else next.delete(name)
    setPicked(next)
    setAmount(String(Math.min(max, order.items.filter((i) => next.has(i.name)).reduce((n, i) => n + i.price * i.qty, 0))))
    setError('')
  }
  const amt = Number(amount)
  const approve = (n: number, label: string) => {
    const bad = !Number.isInteger(n) || n <= 0 ? 'Enter the refund amount in whole shillings.' : n > max ? `The most that can still be refunded on this order is ${kes(max)}.` : ''
    if (bad) return setError(bad)
    setError('')
    openModal({
      title: label,
      message: `${kes(n)} will be returned to the customer’s ${order.method === 'Card' ? 'card' : 'M-Pesa account'}${n > REFUND_LIMIT ? ` (above ${kes(REFUND_LIMIT)}, so a finance approver must be signed in)` : ''}.`,
      confirm: 'Approve refund',
      onConfirm: () => {
        const e = decideRefund(refund.id, 'approve', n, reason)
        if (e) setError(e)
        else toast(`${kes(n)} refunded to ${refund.customerName}`)
      },
    })
  }
  const lateHours = Math.max(0, Math.round((refund.submittedAt - order.placedAt) / 3_600_000))
  const others = refunds.filter((r) => r.orderId === order.id && r.id !== refund.id).length
  const ticket = refund.ticketId ? tickets.find((t) => t.id === refund.ticketId) : undefined
  const prior = refunds.filter((r) => r.customerId === refund.customerId && r.id !== refund.id && r.decision && r.decision.amount > 0)

  return (
    <>
      <PageHead title={`Refund review · ${refund.id}`} desc="Evaluate the customer’s request against the order and delivery evidence." actions={<Btn onClick={() => navigate('/support/refunds')}>Back to requests</Btn>} />
      {!edit && <div style={{ marginBottom: 12 }}><Notice>Your role can read refund requests but not decide them.</Notice></div>}
      <div className="sp-two">
        <div className="sp-stack">
          <Panel>
            <div className="sp-ticket-head">
              <div><h2 className="sp-ticket-title">{refund.reason}</h2><span className="panel-sub">Request {refund.id} · Order {refund.orderId} · Submitted {when(refund.submittedAt)}</span></div>
              <Badge tone={refundTone(refund.status)}>{refund.status}</Badge>
            </div>
            <div className="sp-note" style={{ marginTop: 14 }}><b>Customer note</b><br />“{refund.note}”</div>
            {!open && refund.decision && (
              <div style={{ marginTop: 12 }}><Notice tone={refund.status === 'Rejected' ? 'warning' : 'success'} mark={refund.status === 'Rejected' ? '×' : '✓'}>{refund.status === 'Rejected' ? `Rejected by ${refund.decision.by} · ${refund.decision.reason}` : `${kes(refund.decision.amount)} refunded by ${refund.decision.by} · ${refund.decision.reason}`}</Notice></div>
            )}
            <div className="panel-head" style={{ marginTop: 16 }}><h2>Order items</h2><span className="panel-sub">Select the items included in this refund</span></div>
            {order.items.map((i) => (
              <label key={i.productId} className={`sp-choice ${picked.has(i.name) ? 'on' : ''}`}>
                <input type="checkbox" checked={picked.has(i.name)} disabled={!open || !edit} onChange={(e) => toggle(i.name, e.target.checked)} />
                <span><b>{i.name}</b><span className="sp-sub">Qty {i.qty} · {kes(i.price)}</span></span>
                <b style={{ marginLeft: 'auto' }}>{kes(i.price * i.qty)}</b>
              </label>
            ))}
            <div className="sp-form2 sp-gap">
              <div className="field" style={{ marginBottom: 0 }}>
                <Label htmlFor="refundAmount">Refund amount (KES)</Label>
                <input id="refundAmount" className="sp-input" inputMode="numeric" value={amount} disabled={!open || !edit} onChange={(e) => { setAmount(e.target.value); setError('') }} aria-invalid={!!error} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <Label htmlFor="refundReason">Decision reason</Label>
                <select id="refundReason" className="sp-select" value={reason} disabled={!open || !edit} onChange={(e) => setReason(e.target.value)}><option>Missing item confirmed</option><option>Goodwill credit</option><option>Damage confirmed</option><option>Delivery issue confirmed</option></select>
              </div>
            </div>
            {error && <div className="sp-err" role="alert">{error}</div>}
            <div className="sp-row end sp-gap">
              <Btn disabled={!open || !edit} onClick={() => openModal({ title: 'Reject refund request?', body: <RejectForm id={refund.id} />, noActions: true })}>Reject</Btn>
              <Btn disabled={!open || !edit} onClick={() => approve(amt, 'Approve partial refund?')}>Approve {Number.isFinite(amt) && amt > 0 ? kes(amt) : 'amount'}</Btn>
              <Btn variant="primary" disabled={!open || !edit || max <= 0} onClick={() => { setAmount(String(max)); approve(max, 'Approve full refund?') }}>Approve full ({kes(max)})</Btn>
            </div>
          </Panel>
          <Panel title="Internal review notes" sub="Visible to staff only">
            {refund.notes.map((n, i) => <div className="sp-note" key={i} style={{ marginBottom: 8 }}>{n}</div>)}
            <textarea className="sp-text" aria-label="Internal review notes" placeholder="Add a note for the review trail…" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="sp-row end sp-gap"><Btn disabled={!edit} onClick={() => { if (!note.trim()) return toast('Write the note first'); addRefundNote(refund.id, note.trim()); setNote(''); toast('Review note saved') }}>Save note</Btn></div>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Customer and order" right={<Btn small onClick={() => navigate(`/orders/${order.id}`)}>Order detail</Btn>}>
            <div className="sp-row" style={{ marginBottom: 6 }}><Person name={refund.customerName} size={44} /><div><b style={{ fontSize: 14 }}>{refund.customerName}</b><div className="panel-sub">{customer?.orders ?? '—'} orders</div></div></div>
            <Detail label="Order total">{kes(order.total)}</Detail>
            <Detail label="Already refunded">{kes(order.refunded)}</Detail>
            <Detail label="Payment">{order.method} · {order.pay}</Detail>
            <Detail label="Delivery status"><Badge>{order.status}</Badge></Detail>
            <Detail label="Related ticket">{ticket ? <button className="sp-link" onClick={() => navigate(`/support/tickets/${ticket.id}`)}>#{ticket.id}</button> : '—'}</Detail>
          </Panel>
          <Panel title="Refund history">
            <Detail label="Previous refunds">{prior.length ? `${prior.length} · ${kes(prior.reduce((n, r) => n + r.decision!.amount, 0))}` : 'None'}</Detail>
            <Detail label="Lifetime spend">{customer ? kes(customer.spent) : '—'}</Detail>
            <div className="sp-note" style={{ marginTop: 10 }}>
              <b>Policy check</b><br />
              {lateHours <= 48 ? `Request is within the 48-hour claim window (${lateHours}h after ordering).` : `Request came ${lateHours} hours after ordering, past the 48-hour window. Use judgement.`} {others ? `${others} other request${others === 1 ? '' : 's'} on this order.` : 'No duplicate claims found.'}
              {order.pay !== 'Paid' && <> This order isn’t in a paid state.</>}
            </div>
            <p className="panel-sub" style={{ marginTop: 8 }}>You can approve up to {kes(REFUND_LIMIT)} yourself. Larger refunds need someone with payments access.</p>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- returns -----------------------------------------------------------------------------------------

const returnTone = (s: ReturnRequest['status']) => (s === 'Approved' ? 'green' : s === 'Rejected' ? 'red' : s === 'Pending' || s === 'Evidence requested' ? 'amber' : 'blue')

export function ReturnsList() {
  const { returns } = useSupport()
  const now = useNow()
  const [status, setStatus] = useState('All statuses')
  const [evidence, setEvidence] = useState('All evidence')
  const fresh = returns.filter((r) => r.status === 'New')
  const waiting = returns.filter((r) => r.status === 'New' || r.status === 'Review')
  const rows = returns.filter((r) => (status === 'All statuses' || r.status === status) && (evidence === 'All evidence' || (evidence === 'Photos attached' ? r.photos > 0 : r.photos === 0)))
  const cols: Column<ReturnRequest>[] = [
    { key: 'id', header: 'Request', sort: (a, b) => a.id.localeCompare(b.id), render: (r) => <button className="sp-link" onClick={() => navigate(`/support/returns/${r.id}`)}>{r.id}</button> },
    { key: 'o', header: 'Order', render: (r) => r.orderId },
    { key: 'c', header: 'Customer', sort: (a, b) => a.customerName.localeCompare(b.customerName), render: (r) => r.customerName },
    { key: 'why', header: 'Reason', render: (r) => r.reason },
    { key: 'at', header: 'Submitted', sort: (a, b) => a.submittedAt - b.submittedAt, render: (r) => when(r.submittedAt) },
    { key: 'ev', header: 'Evidence', render: (r) => (r.photos ? `${r.photos} photo${r.photos === 1 ? '' : 's'}` : 'No photo') },
    { key: 'st', header: 'Status', render: (r) => <Badge tone={returnTone(r.status)}>{r.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="Returns requests" desc="Inspect return claims, product condition and customer evidence." actions={<Btn onClick={() => downloadCsv('returns.csv', ['Request', 'Order', 'Customer', 'Reason', 'Status'], rows.map((r) => [r.id, r.orderId, r.customerName, r.reason, r.status]))}>Export</Btn>} />
      <div className="sp-stats3">
        <Stat label="New requests" value={String(fresh.length)} trend={`${fresh.filter((r) => r.photos).length} with photo evidence`} icon="↩" />
        <Stat label="Awaiting inspection" value={String(waiting.length)} trend={`${waiting.filter((r) => now - r.submittedAt > 86_400_000).length} older than 24 hours`} icon="◷" up={waiting.every((r) => now - r.submittedAt <= 86_400_000)} />
        <Stat label="Approved" value={String(returns.filter((r) => r.status === 'Approved').length)} trend="Approved in total" icon="✓" />
      </div>
      <DataTable
        title={`${fresh.length} new requests`}
        rows={rows}
        rowKey={(r) => r.id}
        columns={cols}
        searchLabel="Search returns"
        searchText={(r) => `${r.id} ${r.orderId} ${r.customerName} ${r.reason} ${r.item}`}
        tools={
          <>
            <select className="sp-select auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option>{['New', 'Review', 'Pending', 'Evidence requested', 'Approved', 'Rejected'].map((s) => <option key={s}>{s}</option>)}</select>
            <select className="sp-select auto" aria-label="Filter by evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)}><option>All evidence</option><option>Photos attached</option><option>No photo</option></select>
          </>
        }
        actions={(r) => <Btn small onClick={() => navigate(`/support/returns/${r.id}`)}>Inspect</Btn>}
      />
    </>
  )
}

export function ReturnDetail({ id }: { id: string }) {
  const { returns, decideReturn, tickets } = useSupport()
  const { orders, riders, can, openModal, toast } = useStore()
  const ret = returns.find((r) => r.id === id)
  const [inspection, setInspection] = useState<'confirmed' | 'more'>(ret?.inspection ?? 'confirmed')
  const [note, setNote] = useState(ret?.note ?? '')
  const [shot, setShot] = useState(1)
  const [error, setError] = useState('')
  if (!ret) return <NotFoundCard what="Return request" back="Back to returns" onBack={() => navigate('/support/returns')} />
  const edit = can('Support', 'Edit')
  const done = ret.status === 'Approved' || ret.status === 'Rejected'
  const order = orders.find((o) => o.id === ret.orderId)
  const rider = riders.find((r) => r.id === order?.riderId)
  const delivered = order?.events.find((e) => e.status === 'Delivered')
  const ticket = ret.ticketId ? tickets.find((t) => t.id === ret.ticketId) : tickets.find((t) => t.personId === ret.customerId)

  const decide = (kind: 'Approved' | 'Rejected' | 'Evidence requested') => {
    if (kind !== 'Evidence requested' && !note.trim()) return setError('Add a short reviewer note first.')
    setError('')
    const copy = {
      Approved: { title: 'Approve return?', message: 'The customer will receive return instructions and a refund once the item is received.' },
      Rejected: { title: 'Reject return?', message: 'The customer will be told the return was declined, with your note.' },
      'Evidence requested': { title: 'Request more evidence?', message: 'The customer will be asked to upload additional photos.' },
    }[kind]
    openModal({ ...copy, confirm: kind === 'Evidence requested' ? 'Send request' : kind === 'Approved' ? 'Approve return' : 'Reject return', danger: kind === 'Rejected', onConfirm: () => { decideReturn(ret.id, kind, note.trim(), kind === 'Evidence requested' ? 'more' : inspection); toast(kind === 'Evidence requested' ? 'Evidence requested from the customer' : `Return ${kind.toLowerCase()}`) } })
  }

  return (
    <>
      <PageHead title={`Return review · ${ret.id}`} desc="Inspect photo evidence and decide how to resolve this return." actions={<Btn onClick={() => navigate('/support/returns')}>Back to returns</Btn>} />
      {!edit && <div style={{ marginBottom: 12 }}><Notice>Your role can read return requests but not decide them.</Notice></div>}
      <div className="sp-two">
        <div className="sp-stack">
          <Panel>
            <div className="sp-ticket-head">
              <div><h2 className="sp-ticket-title">{ret.reason}</h2><span className="panel-sub">{ret.id} · Order {ret.orderId} · Submitted {when(ret.submittedAt)}</span></div>
              <Badge tone={returnTone(ret.status)}>{ret.status}</Badge>
            </div>
            <div className="panel-head" style={{ marginTop: 14 }}><h2>Photo evidence</h2><span className="panel-sub">{ret.photos ? `Customer app upload · ${shot} of ${ret.photos}` : 'No photos uploaded'}</span></div>
            {ret.photos > 0 ? (
              <>
                <img className="sp-photo" src="/return-evidence.png" alt={`Customer photo ${shot} of ${ret.photos} showing the item as it arrived`} />
                <p className="panel-sub" style={{ margin: '6px 0 10px' }}>Uploaded by {ret.customerName} · {when(ret.submittedAt)} · Original image</p>
                <div className="sp-form2">
                  <Btn disabled={shot <= 1} onClick={() => setShot(shot - 1)}>‹ Previous</Btn>
                  <Btn disabled={shot >= ret.photos} onClick={() => setShot(shot + 1)}>Next ›</Btn>
                </div>
              </>
            ) : <Notice tone="warning" mark="!">The customer didn’t attach a photo. You can ask for one.</Notice>}
            <div className="sp-form2 sp-gap" role="radiogroup" aria-label="Inspection result">
              <label className={`sp-choice ${inspection === 'confirmed' ? 'on' : ''}`}><input type="radio" name="inspection" checked={inspection === 'confirmed'} disabled={done || !edit} onChange={() => setInspection('confirmed')} /><span>Damage confirmed</span></label>
              <label className={`sp-choice ${inspection === 'more' ? 'on' : ''}`}><input type="radio" name="inspection" checked={inspection === 'more'} disabled={done || !edit} onChange={() => setInspection('more')} /><span>More evidence needed</span></label>
            </div>
            <Label htmlFor="rnote">Reviewer note</Label>
            <textarea id="rnote" className="sp-text" placeholder="Describe the inspection outcome…" value={note} disabled={done || !edit} onChange={(e) => { setNote(e.target.value); setError('') }} />
            {error && <div className="sp-err" role="alert">{error}</div>}
            <div className="sp-row end sp-gap">
              <Btn disabled={done || !edit} onClick={() => decide('Evidence requested')}>Request evidence</Btn>
              <Btn disabled={done || !edit} onClick={() => decide('Rejected')}>Reject</Btn>
              <Btn variant="primary" disabled={done || !edit} onClick={() => decide('Approved')}>Approve return</Btn>
            </div>
          </Panel>
          <Panel title="Customer conversation">
            <div className="sp-note" style={{ marginTop: 8 }}>“{ret.statement}”</div>
            {ticket && <div style={{ marginTop: 12 }}><Btn small onClick={() => navigate(`/support/tickets/${ticket.id}`)}>Open related ticket</Btn></div>}
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Request summary" right={<Badge tone={returnTone(ret.status)}>{ret.status}</Badge>}>
            <Detail label="Customer">{ret.customerName}</Detail>
            <Detail label="Item">{ret.item} · Qty {ret.qty}</Detail>
            <Detail label="Item value">{kes(ret.itemValue)}</Detail>
            <Detail label="Delivered">{delivered ? when(delivered.at) : '—'}</Detail>
            <Detail label="Rider">{rider?.name ?? '—'}</Detail>
          </Panel>
          <Panel title="Order delivery">
            <div className="sp-tl">
              {[...(order?.events ?? [])].filter((e) => e.status !== 'Note').reverse().slice(0, 4).map((e, i) => <TimelineItem key={i} title={e.status === 'Delivered' ? 'Delivered to customer' : e.status} sub={`${when(e.at)} · ${e.by}`} />)}
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- disputes -----------------------------------------------------------------------------------------

function ResolveForm({ d, inFavourOf, note }: { d: Dispute; inFavourOf: 'customer' | 'rider'; note: string }) {
  const { resolveDispute } = useSupport()
  const { orders, closeModal, toast } = useStore()
  const o = orders.find((x) => x.id === d.orderId)
  const canRefund = inFavourOf === 'customer' && o?.pay === 'Paid' && o.total - o.refunded > 0
  const [refund, setRefund] = useState(!!canRefund)
  return (
    <>
      <p className="panel-sub" style={{ marginBottom: 12 }}>{inFavourOf === 'customer' ? 'The dispute will be resolved in the customer’s favour and the outcome recorded.' : 'The dispute will be resolved in the rider’s favour and the outcome recorded.'}</p>
      {canRefund && (
        <label className="sp-choice" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
          <span><b>Open a refund request for {kes(o!.total - o!.refunded)}</b><span className="sp-sub">It goes to the refund queue for review.</span></span>
        </label>
      )}
      <div className="sp-row end">
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={() => { resolveDispute(d.id, inFavourOf, note, refund); closeModal(); toast(`Dispute ${d.id} resolved for the ${inFavourOf}`) }}>Resolve for {inFavourOf}</Btn>
      </div>
    </>
  )
}

export function Disputes({ id }: { id?: string }) {
  const { disputes, setDisputeNotes, escalateDispute } = useSupport()
  const { openModal, toast, can } = useStore()
  const now = useNow()
  const open = disputes.filter((d) => d.status === 'Awaiting decision' || d.status === 'Escalated')
  const sorted = [...disputes].sort((a, b) => (open.includes(b) ? 1 : 0) - (open.includes(a) ? 1 : 0) || order[a.priority] - order[b.priority])
  const d = disputes.find((x) => x.id === id) ?? sorted[0]
  const [noteErr, setNoteErr] = useState('')
  if (!d) return (<><PageHead title="Disputes" desc="Review delivery disputes with customer and rider evidence side by side." /><Notice mark="✓" tone="success">No disputes at the moment.</Notice></>)
  const edit = can('Support', 'Edit')
  const closed = d.status.startsWith('Resolved')
  const left = d.slaDueAt - now
  const tickets = open.length
  const resolve = (who: 'customer' | 'rider') => {
    if (!d.notes.trim()) return setNoteErr('Record your finding before resolving.')
    setNoteErr('')
    openModal({ title: `Resolve for ${who}?`, body: <ResolveForm d={d} inFavourOf={who} note={d.notes.trim()} />, noActions: true })
  }
  return (
    <>
      <PageHead title="Disputes" desc="Review delivery disputes with customer and rider evidence side by side." actions={<Btn onClick={() => downloadCsv('disputes.csv', ['Dispute', 'Order', 'Category', 'Priority', 'Status'], disputes.map((x) => [x.id, x.orderId, x.category, x.priority, x.status]))}>Export</Btn>} />
      <div className="sp-stats3">
        <Stat label="Open disputes" value={String(tickets)} trend={`${open.filter((x) => x.priority === 'Urgent' || x.priority === 'High').length} need a decision today`} icon="⚖" up={tickets === 0} />
        <Stat label="Customer claims" value={String(open.filter((x) => x.claimBy === 'Customer').length)} trend="Delivery or missing-item issues" icon="C" />
        <Stat label="Rider claims" value={String(open.filter((x) => x.claimBy === 'Rider').length)} trend="Route, proof or payout issues" icon="R" />
      </div>
      <div className="sp-two">
        <div className="sp-stack">
          <Panel
            title={`Dispute ${d.id}`}
            sub={`Order ${d.orderId} · ${d.category}`}
            right={<Badge tone={closed ? 'green' : 'amber'}>{d.status}</Badge>}
          >
            <div className="sp-claims">
              <div className="sp-claim">
                <div className="sp-row"><Person name={d.customerName} /><div><b style={{ fontSize: 11 }}>Customer statement</b><span className="sp-sub">{d.customerName}</span></div></div>
                <p>“{d.customerStatement}”</p>
                <Badge tone="red">{d.customerTag}</Badge>
              </div>
              <div className="sp-claim">
                <div className="sp-row"><Person name={d.riderName} /><div><b style={{ fontSize: 11 }}>Rider statement</b><span className="sp-sub">{d.riderName}</span></div></div>
                <p>“{d.riderStatement}”</p>
                <Badge tone="green">{d.riderTag}</Badge>
              </div>
            </div>
            <div className="panel-head" style={{ marginTop: 16 }}><h2>Evidence timeline</h2><Btn small onClick={() => navigate(`/orders/${d.orderId}`)}>View order</Btn></div>
            <div className="sp-tl">{d.evidence.map((e, i) => <TimelineItem key={i} tone={e.tone === 'blue' ? undefined : e.tone} title={e.text} sub={e.sub} />)}</div>
          </Panel>
          <Panel title="Decision notes">
            {closed && d.outcome && <div style={{ marginBottom: 10 }}><Notice tone="success" mark="✓">{d.status} by {d.outcome.by} · {when(d.outcome.at)}</Notice></div>}
            <textarea className="sp-text" aria-label="Decision notes" placeholder="Record your finding and the supporting evidence…" value={d.notes} disabled={closed || !edit} onChange={(e) => { setDisputeNotes(d.id, e.target.value); setNoteErr('') }} />
            {noteErr && <div className="sp-err" role="alert">{noteErr}</div>}
            <div className="sp-row end sp-gap">
              <Btn disabled={closed || !edit || d.status === 'Escalated'} onClick={() => openModal({ title: 'Send for more review?', message: 'The dispute will be escalated to the delivery operations lead.', confirm: 'Escalate', onConfirm: () => { escalateDispute(d.id); toast(`${d.id} escalated`) } })}>{d.status === 'Escalated' ? 'Escalated' : 'Escalate'}</Btn>
              <Btn disabled={closed || !edit} onClick={() => resolve('customer')}>Resolve for customer</Btn>
              <Btn variant="primary" disabled={closed || !edit} onClick={() => resolve('rider')}>Resolve for rider</Btn>
            </div>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Dispute queue">
            {sorted.map((x) => (
              <div className={`sp-detail ${x.id === d.id ? 'sp-active' : ''}`} key={x.id}>
                <button className="sp-link" style={{ flex: 1 }} onClick={() => navigate(`/support/disputes/${x.id}`)} aria-current={x.id === d.id ? 'true' : undefined}>{x.id}<span className="sp-sub">{x.orderId} · {x.customerName}</span></button>
                {x.status.startsWith('Resolved') ? <Badge tone="green">Resolved</Badge> : <PriorityTag p={x.priority} />}
              </div>
            ))}
          </Panel>
          <Panel title="Case details">
            <Detail label="Assigned to">{d.assignee}</Detail>
            <Detail label="Category">{d.category}</Detail>
            <Detail label="Opened">{ago(d.openedAt, now)}</Detail>
            <Detail label="Response SLA">{closed ? '—' : left > 0 ? <span style={{ color: left < 20 * 60_000 ? 'var(--red)' : undefined }}>{Math.round(left / 60_000)} min remaining</span> : <span style={{ color: 'var(--red)' }}>Overdue by {Math.round(-left / 60_000)} min</span>}</Detail>
            <Detail label="Related ticket">{d.ticketId ? <button className="sp-link" onClick={() => navigate(`/support/tickets/${d.ticketId}`)}>#{d.ticketId}</button> : '—'}</Detail>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- customer lookup ---------------------------------------------------------------------------------------

export function CustomerLookup() {
  const { customers, orders, openModal, toast, can, updateCustomer } = useStore()
  const { tickets, refunds, startChat } = useSupport()
  const wanted = useQuery().get('customer')
  const [term, setTerm] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const needle = submitted.trim().toLowerCase()
  const matches = needle
    ? customers.filter((c) => `${c.name} ${c.phone} ${c.email} ${c.id}`.toLowerCase().includes(needle) || orders.some((o) => o.customerId === c.id && o.id.toLowerCase() === needle))
    : []
  const c = customers.find((x) => x.id === (picked ?? (needle ? matches[0]?.id : wanted)))
  const edit = can('Support', 'Edit')
  const mine = c ? orders.filter((o) => o.customerId === c.id).sort((a, b) => b.placedAt - a.placedAt) : []
  const myTickets = c ? tickets.filter((t) => t.personId === c.id) : []
  const myRefunds = c ? refunds.filter((r) => r.customerId === c.id) : []
  const rated = myTickets.filter((t) => t.csat)
  const search = () => { setSubmitted(term); setPicked(null) }

  return (
    <>
      <PageHead title="Customer lookup" desc="Find a customer and review their orders, support history and satisfaction." />
      <section className="card panel" style={{ marginBottom: 14 }}>
        <div className="panel-head"><div><h2>Find a customer</h2><div className="panel-sub">Search by name, phone, email or order number.</div></div></div>
        <form className="sp-row" style={{ maxWidth: 720 }} onSubmit={(e) => { e.preventDefault(); search() }} role="search">
          <input className="sp-input" style={{ flex: 1, height: 38 }} aria-label="Find customer" placeholder="For example Nia, 0712 or SC-4928" value={term} onChange={(e) => setTerm(e.target.value)} />
          <Btn variant="primary" type="submit">Search</Btn>
        </form>
        {needle && matches.length > 1 && (
          <div className="sp-row" style={{ marginTop: 10 }}>
            <span className="panel-sub">{matches.length} matches:</span>
            {matches.slice(0, 8).map((m) => <button key={m.id} className={`btn small ${m.id === c?.id ? 'primary' : ''}`} onClick={() => setPicked(m.id)}>{m.name}</button>)}
          </div>
        )}
        {needle && !matches.length && <div style={{ marginTop: 10 }}><Notice tone="warning" mark="!">No customer matches “{submitted}”. Check the spelling or try a phone number.</Notice></div>}
      </section>
      {!c && !(needle && !matches.length) && <Notice>Search for a customer above, or open one from a ticket or chat.</Notice>}
      {c && (
        <div className="sp-two">
          <div className="sp-stack">
            <Panel title="Customer profile" right={<Badge tone="green">Active</Badge>}>
              <div className="sp-row" style={{ marginBottom: 14 }}>
                <Person name={c.name} size={48} />
                <div><b style={{ fontSize: 15 }}>{c.name}</b><div className="panel-sub">Customer ID {c.id.toUpperCase()} · Joined {c.added}</div></div>
                <Btn small onClick={() => { void navigator.clipboard?.writeText(c.id.toUpperCase()).catch(() => undefined); toast('Customer ID copied') }}>Copy ID</Btn>
              </div>
              <div className="sp-stats3" style={{ maxWidth: 'none' }}>
                <Stat label="Lifetime orders" value={String(c.orders)} trend={`${mine.length} on record here`} icon="▧" />
                <Stat label="Lifetime spend" value={kes(c.spent)} trend={`Average ${kes(c.spent / Math.max(1, c.orders))}`} icon="K" />
                <Stat label="Satisfaction" value={rated.length ? `${(rated.reduce((n, t) => n + t.csat!, 0) / rated.length).toFixed(1)} / 5` : '—'} trend={`${rated.length} rated tickets`} icon="☆" />
              </div>
              <div className="panel-head"><h2>Recent orders</h2><Btn small onClick={() => navigate(`/orders?customer=${c.id}`)}>All orders</Btn></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
                  <tbody>
                    {mine.slice(0, 4).map((o) => <tr key={o.id}><td><button className="sp-link" onClick={() => navigate(`/orders/${o.id}`)}>{o.id}</button></td><td>{when(o.placedAt)}</td><td>{kes(o.total)}</td><td><Badge>{o.status}</Badge></td></tr>)}
                    {!mine.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>No recent orders.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Support history">
              {myTickets.slice(0, 4).map((t) => (
                <div className="sp-detail" key={t.id}><span style={{ color: 'var(--ink)' }}><button className="sp-link" onClick={() => navigate(`/support/tickets/${t.id}`)}>#{t.id} · {t.subject}</button><span className="sp-sub">{when(t.createdAt)}</span></span><Badge tone={t.status === 'Resolved' ? 'green' : t.status === 'Open' ? 'red' : 'amber'}>{t.status}</Badge></div>
              ))}
              {myRefunds.map((r) => (
                <div className="sp-detail" key={r.id}><span style={{ color: 'var(--ink)' }}><button className="sp-link" onClick={() => navigate(`/support/refunds/${r.id}`)}>Refund {r.id} · {r.reason}</button><span className="sp-sub">{when(r.submittedAt)} · {kes(r.amount)}</span></span><Badge tone={refundTone(r.status)}>{r.status}</Badge></div>
              ))}
              {!myTickets.length && !myRefunds.length && <p className="panel-sub">No tickets or refunds yet.</p>}
            </Panel>
          </div>
          <div className="sp-stack">
            <Panel title="Customer contact">
              <Detail label="Phone">{c.phone}</Detail>
              <Detail label="Email">{c.email}</Detail>
              <Detail label="Default area">{c.area}, Nairobi</Detail>
              <Detail label="Wallet">{kes(c.wallet)}</Detail>
              <div style={{ marginTop: 10 }}><Btn disabled={!edit} onClick={() => { const id = startChat(c.id); navigate(`/support/chat?chat=${id}`) }}>Start live chat</Btn></div>
            </Panel>
            <Panel title="Internal customer note">
              {c.notes.slice(0, 3).map((n, i) => <p className="panel-sub" key={i} style={{ marginBottom: 6 }}>{n.text} <i>— {n.by}, {n.at}</i></p>)}
              <textarea className="sp-text" aria-label="Internal customer note" placeholder="Add a staff-only note…" value={note} disabled={!edit} onChange={(e) => setNote(e.target.value)} />
              <div className="sp-row end sp-gap"><Btn small disabled={!edit} onClick={() => { if (!note.trim()) return toast('Write the note first'); updateCustomer(c.id, { notes: [{ by: 'You', text: note.trim(), at: 'Today' }, ...c.notes] }); setNote(''); toast('Customer note saved') }}>Save note</Btn></div>
              <Btn small onClick={() => openModal({ title: `Open a ticket for ${c.name}`, message: 'Create it from the Tickets inbox so it gets a category and priority.', confirm: 'Go to inbox', onConfirm: () => navigate('/support/tickets') })}>Create ticket</Btn>
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
