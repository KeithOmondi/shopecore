import { useEffect, useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, get, openFile, post } from '../lib/api'
import { kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

// ---- refunds --------------------------------------------------------------------------------------------------------

interface Refund {
  id: string; number: string; orderId: string; order: string; customerId: string; customer: string; amountCents: number; reason: string; priority: string
  status: 'needs_review' | 'approved' | 'partly_approved' | 'rejected'; openedBy: string; submittedAt: string; orderTotalCents: number; alreadyRefundedCents: number
  decision: { by: string | null; at: string; amountCents: number; reason: string } | null
}
interface RefundFull extends Refund { items: string[]; notes: { text: string; by: string; at: string }[] }
const REFUND_TEXT = { needs_review: 'Needs review', approved: 'Approved', partly_approved: 'Partly approved', rejected: 'Rejected' } as const
const refundTone = (s: Refund['status']) => (s === 'needs_review' ? 'amber' : s === 'rejected' ? 'red' : 'green')

export function RefundsList() {
  const [status, setStatus] = useState('needs_review')
  const { data, failed, loading, reload } = useGet<{ items: Refund[] }>(`/v1/admin/refunds?limit=100${status ? `&status=${status}` : ''}`, 30_000)
  const items = data?.items ?? []
  const cols: Column<Refund>[] = [
    { key: 'n', header: 'Request', render: (r) => <button className="sp-link" onClick={() => navigate(`/support/refunds/${r.id}`)}>{r.number}</button> },
    { key: 'o', header: 'Order', render: (r) => r.order },
    { key: 'c', header: 'Customer', render: (r) => r.customer },
    { key: 'a', header: 'Amount', sort: (a, b) => a.amountCents - b.amountCents, render: (r) => <b>{kes(shillings(r.amountCents))}</b> },
    { key: 'r', header: 'Reason', render: (r) => r.reason },
    { key: 's', header: 'Status', render: (r) => <Badge tone={refundTone(r.status)}>{REFUND_TEXT[r.status]}</Badge> },
    { key: 'w', header: 'Asked', sort: (a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt), render: (r) => ago(r.submittedAt) },
  ]
  return (
    <>
      <PageHead title="Refund requests" desc="Customers asking for their money back. Decide each one." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <div className="tile-row"><Stat label="Waiting for a decision" value={String(status === 'needs_review' ? items.length : '—')} trend="Oldest first in the list" icon="◷" /></div>
      <DataTable title="Refunds" rows={items} rowKey={(r) => r.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the refunds.' : undefined} onRetry={reload}
        searchLabel="Search refunds" searchText={(r) => `${r.number} ${r.order} ${r.customer} ${r.reason}`} emptyTitle="Nothing here" empty="Refund requests from customers and staff appear here."
        tools={<select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{(Object.keys(REFUND_TEXT) as Refund['status'][]).map((s) => <option key={s} value={s}>{REFUND_TEXT[s]}</option>)}</select>}
        actions={(r) => <Btn small onClick={() => navigate(`/support/refunds/${r.id}`)}>{r.status === 'needs_review' ? 'Review' : 'View'}</Btn>} />
    </>
  )
}

export function RefundReview({ id }: { id: string }) {
  const { can, toast } = useStore()
  const { data: r, failed, reload } = useGet<RefundFull>(`/v1/admin/refunds/${id}`)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!r) return <PageHead title="Refund request" desc={failed ? 'We couldn’t load this request.' : 'Loading…'} actions={<Btn onClick={() => navigate('/support/refunds')}>Back to refunds</Btn>} />
  const edit = can('Claims', 'Edit')
  const max = r.orderTotalCents - r.alreadyRefundedCents
  const decide = async (decision: 'approve' | 'reject') => {
    const cents = Math.round((amount === '' ? shillings(r.amountCents) : Number(amount)) * 100)
    if (reason.trim().length < 3) return setErr('Give a short reason')
    if (decision === 'approve' && (!Number.isInteger(cents) || cents < 1 || cents > max)) return setErr(`Enter an amount up to ${kes(shillings(max))}`)
    setBusy(true)
    try { await post(`/v1/admin/refunds/${id}/decision`, decision === 'approve' ? { decision, amountCents: cents, reason: reason.trim() } : { decision, reason: reason.trim() }); toast(decision === 'approve' ? 'Refund approved' : 'Refund rejected'); reload() } catch (e) { setErr(says(e)) } finally { setBusy(false) }
  }
  const addNote = async () => { try { await post(`/v1/admin/refunds/${id}/notes`, { text: note.trim() }); setNote(''); reload() } catch (e) { toast(says(e)) } }
  return (
    <>
      <PageHead title={r.number} desc={`${r.customer} · ${r.order}`} actions={<><Btn onClick={() => navigate('/support/refunds')}>Back to refunds</Btn>{can('Orders', 'View') && <Btn onClick={() => navigate(`/orders/${r.orderId}`)}>Open the order</Btn>}</>} />
      <div className="sp-two">
        <Panel title="Request" right={<Badge tone={refundTone(r.status)}>{REFUND_TEXT[r.status]}</Badge>}>
          <SettingRow title="Asking for" right={<b>{kes(shillings(r.amountCents))}</b>} />
          <SettingRow title="Order total" right={<span className="prod-name">{kes(shillings(r.orderTotalCents))}</span>} />
          <SettingRow title="Already refunded" right={<span className="prod-name">{kes(shillings(r.alreadyRefundedCents))}</span>} />
          <SettingRow title="Reason" sub={r.reason} />
          <SettingRow title="Items" sub={r.items.join(', ')} />
          <SettingRow title="Opened by" right={<span className="prod-name">{r.openedBy}</span>} />
          {r.decision && <Notice tone={r.status === 'rejected' ? 'warning' : 'success'} mark={r.status === 'rejected' ? '!' : '✓'}>{`${r.status === 'rejected' ? 'Rejected' : `Approved ${kes(shillings(r.decision.amountCents))}`} by ${r.decision.by ?? 'staff'}: ${r.decision.reason}`}</Notice>}
        </Panel>
        <div className="sp-stack">
          {r.status === 'needs_review' && (
            <Panel title="Decision" sub="Money is returned to the customer by Finance after you approve">
              <Field label="Amount to refund (KES)" value={amount === '' ? String(shillings(r.amountCents)) : amount} onChange={(v) => { setAmount(v); setErr('') }} hint={`Up to ${kes(shillings(max))}. Large refunds need someone with payments access.`} />
              <Field label="Reason" multiline value={reason} onChange={(v) => { setReason(v); setErr('') }} error={err} />
              <div className="sp-row end"><Btn variant="danger" disabled={!edit || busy} onClick={() => void decide('reject')}>Reject</Btn><Btn variant="primary" disabled={!edit || busy} onClick={() => void decide('approve')}>Approve</Btn></div>
            </Panel>
          )}
          <Panel title="Notes">
            {r.notes.map((n, i) => <SettingRow key={i} title={n.text} sub={`${n.by} · ${ago(n.at)}`} />)}
            <Field label="Add a note" value={note} onChange={setNote} />
            <div className="sp-row end"><Btn disabled={!edit || !note.trim()} onClick={() => void addNote()}>Add note</Btn></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- returns --------------------------------------------------------------------------------------------------------

interface ReturnReq {
  id: string; number: string; orderId: string; order: string; customer: string; item: string; itemValueCents: number; qty: number; reason: string; statement: string; photos: number; photoUrls: string[]
  status: 'new' | 'review' | 'pending' | 'evidence_requested' | 'approved' | 'rejected'; inspection: string; note: string; submittedAt: string; decidedBy: string | null; decidedAt: string | null
}
const RETURN_TEXT: Record<ReturnReq['status'], string> = { new: 'New', review: 'In review', pending: 'Pending', evidence_requested: 'More info asked', approved: 'Approved', rejected: 'Rejected' }
const returnTone = (s: ReturnReq['status']) => (s === 'approved' ? 'green' : s === 'rejected' ? 'red' : 'amber')

export function ReturnsList() {
  const [open, setOpen] = useState(true)
  const { data, failed, loading, reload } = useGet<{ items: ReturnReq[] }>(`/v1/admin/returns?limit=100${open ? '&open=true' : ''}`, 30_000)
  const cols: Column<ReturnReq>[] = [
    { key: 'n', header: 'Request', render: (r) => <button className="sp-link" onClick={() => navigate(`/support/returns/${r.id}`)}>{r.number}</button> },
    { key: 'o', header: 'Order', render: (r) => r.order },
    { key: 'i', header: 'Item', render: (r) => <div><b>{r.item}</b><div className="subtext">{r.qty} unit{r.qty === 1 ? '' : 's'} · {kes(shillings(r.itemValueCents))}</div></div> },
    { key: 'c', header: 'Customer', render: (r) => r.customer },
    { key: 'r', header: 'Reason', render: (r) => r.reason },
    { key: 'p', header: 'Photos', render: (r) => r.photos },
    { key: 's', header: 'Status', render: (r) => <Badge tone={returnTone(r.status)}>{RETURN_TEXT[r.status]}</Badge> },
    { key: 'w', header: 'Asked', render: (r) => ago(r.submittedAt) },
  ]
  return (
    <>
      <PageHead title="Return requests" desc="Customers asking to send something back." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <DataTable title={open ? 'Waiting for a decision' : 'All returns'} rows={data?.items ?? []} rowKey={(r) => r.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the returns.' : undefined} onRetry={reload}
        searchLabel="Search returns" searchText={(r) => `${r.number} ${r.order} ${r.customer} ${r.item}`} emptyTitle="No returns to review" empty="Return requests from the app appear here."
        tools={<select className="select" aria-label="Show" value={open ? 'open' : 'all'} onChange={(e) => setOpen(e.target.value === 'open')}><option value="open">Waiting</option><option value="all">All</option></select>}
        actions={(r) => <Btn small onClick={() => navigate(`/support/returns/${r.id}`)}>{returnTone(r.status) === 'amber' ? 'Review' : 'View'}</Btn>} />
    </>
  )
}

export function ReturnDetail({ id }: { id: string }) {
  const { can, toast } = useStore()
  const { data, failed, reload } = useGet<{ items: ReturnReq[] }>('/v1/admin/returns?limit=200')
  const r = data?.items.find((x) => x.id === id)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!r) return <PageHead title="Return request" desc={failed ? 'We couldn’t load this request.' : data ? 'We couldn’t find that return.' : 'Loading…'} actions={<Btn onClick={() => navigate('/support/returns')}>Back to returns</Btn>} />
  const decided = r.status === 'approved' || r.status === 'rejected'
  const decide = async (decision: 'approved' | 'rejected' | 'evidence_requested') => {
    if (note.trim().length < 3) return setErr('Write a short note for the customer')
    setBusy(true)
    try { await post(`/v1/admin/returns/${id}/decision`, { decision, note: note.trim() }); toast('Decision saved'); reload() } catch (e) { setErr(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title={r.number} desc={`${r.customer} · ${r.order}`} actions={<><Btn onClick={() => navigate('/support/returns')}>Back to returns</Btn>{can('Orders', 'View') && <Btn onClick={() => navigate(`/orders/${r.orderId}`)}>Open the order</Btn>}</>} />
      <div className="sp-two">
        <Panel title="What the customer says" right={<Badge tone={returnTone(r.status)}>{RETURN_TEXT[r.status]}</Badge>}>
          <SettingRow title="Item" sub={`${r.qty} unit${r.qty === 1 ? '' : 's'}`} right={<b>{r.item}</b>} />
          <SettingRow title="Value" right={<span className="prod-name">{kes(shillings(r.itemValueCents))}</span>} />
          <SettingRow title="Reason" right={<span className="prod-name">{r.reason}</span>} />
          {r.statement && <SettingRow title="In their words" sub={r.statement} />}
          <SettingRow title="Photos" right={r.photoUrls.length ? <span className="sp-row">{r.photoUrls.map((u, i) => <Btn small key={u} onClick={() => void openFile(u).catch((e) => toast(says(e)))}>{`Photo ${i + 1}`}</Btn>)}</span> : <span className="prod-name">{r.photos ? `${r.photos} (not stored)` : 'None'}</span>} />
          {r.note && <Notice mark="i">{`${decided ? 'Decision note' : 'Last note to the customer'}: ${r.note}`}</Notice>}
        </Panel>
        {!decided && (
          <Panel title="Decision" sub="The customer sees your note in the app. Approving sends the item to the warehouse inspection queue.">
            <Field label="Note to the customer" multiline value={note} onChange={(v) => { setNote(v); setErr('') }} error={err} />
            <div className="sp-row end">
              <Btn disabled={!can('Claims', 'Edit') || busy} onClick={() => void decide('evidence_requested')}>Ask for more info</Btn>
              <Btn variant="danger" disabled={!can('Claims', 'Edit') || busy} onClick={() => void decide('rejected')}>Reject</Btn>
              <Btn variant="primary" disabled={!can('Claims', 'Edit') || busy} onClick={() => void decide('approved')}>Approve</Btn>
            </div>
          </Panel>
        )}
      </div>
    </>
  )
}

// ---- disputes -------------------------------------------------------------------------------------------------------

interface Dispute {
  id: string; number: string; orderId: string; order: string; customer: string; rider: string | null; claimBy: string; category: string; priority: string
  status: 'awaiting_decision' | 'escalated' | 'resolved_customer' | 'resolved_rider'; customerStatement: string; riderStatement: string; evidence: string[] | string; notes: string; assignee: string | null
  openedAt: string; late: boolean; outcome: { by: string | null; at: string; note: string } | null
}
const DISPUTE_TEXT: Record<Dispute['status'], string> = { awaiting_decision: 'Needs a decision', escalated: 'Escalated', resolved_customer: 'Resolved for the customer', resolved_rider: 'Resolved for the rider' }

export function Disputes({ id }: { id?: string }) {
  const { can, toast } = useStore()
  const [open, setOpen] = useState(true)
  const list = useGet<{ items: Dispute[] }>(`/v1/admin/disputes?limit=100${open ? '&open=true' : ''}`, 30_000)
  const [note, setNote] = useState('')
  const [refund, setRefund] = useState(false)
  const [busy, setBusy] = useState(false)
  const d = id ? list.data?.items.find((x) => x.id === id) : undefined
  const cols: Column<Dispute>[] = [
    { key: 'n', header: 'Dispute', render: (x) => <button className="sp-link" onClick={() => navigate(`/support/disputes/${x.id}`)}>{x.number}</button> },
    { key: 'o', header: 'Order', render: (x) => x.order },
    { key: 'c', header: 'Customer', render: (x) => x.customer },
    { key: 'r', header: 'Rider', render: (x) => x.rider ?? '—' },
    { key: 'cat', header: 'About', render: (x) => x.category },
    { key: 's', header: 'Status', render: (x) => <Badge tone={x.status.startsWith('resolved') ? 'green' : x.late ? 'red' : 'amber'}>{DISPUTE_TEXT[x.status]}</Badge> },
    { key: 'w', header: 'Opened', render: (x) => ago(x.openedAt) },
  ]
  const act = async (what: () => Promise<unknown>, done: string) => { setBusy(true); try { await what(); toast(done); setNote(''); list.reload() } catch (e) { toast(says(e)) } finally { setBusy(false) } }
  if (id) {
    if (!d) return <PageHead title="Dispute" desc={list.failed ? 'We couldn’t load this dispute.' : list.data ? 'We couldn’t find that dispute (it may be resolved).' : 'Loading…'} actions={<Btn onClick={() => navigate('/support/disputes')}>Back to disputes</Btn>} />
    const edit = can('Claims', 'Edit')
    const resolved = d.status.startsWith('resolved')
    return (
      <>
        <PageHead title={d.number} desc={`${d.customer} · ${d.order}${d.rider ? ` · rider ${d.rider}` : ''}`} actions={<><Btn onClick={() => navigate('/support/disputes')}>Back to disputes</Btn>{can('Orders', 'View') && <Btn onClick={() => navigate(`/orders/${d.orderId}`)}>Open the order</Btn>}</>} />
        <div className="sp-two">
          <Panel title="The two sides" right={<Badge tone={resolved ? 'green' : d.late ? 'red' : 'amber'}>{DISPUTE_TEXT[d.status]}</Badge>}>
            <SettingRow title="Raised by" right={<span className="prod-name">{d.claimBy}</span>} />
            <SettingRow title="Customer says" sub={d.customerStatement || 'Nothing written yet'} />
            <SettingRow title="Rider says" sub={d.riderStatement || 'Nothing written yet'} />
            {d.notes && <SettingRow title="Staff notes" sub={d.notes} />}
            {d.outcome && <Notice mark="✓">{`${d.outcome.by ?? 'Staff'}: ${d.outcome.note}`}</Notice>}
          </Panel>
          {!resolved && (
            <Panel title="Decide">
              <Field label="Your note" multiline value={note} onChange={setNote} />
              <label className="sp-row" style={{ gap: 6, marginBottom: 8 }}><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> Also open a refund request when the customer wins</label>
              <div className="sp-row end">
                {d.status === 'awaiting_decision' && <Btn disabled={!edit || busy} onClick={() => void act(() => post(`/v1/admin/disputes/${d.id}/escalate`), 'Escalated')}>Escalate</Btn>}
                <Btn disabled={!edit || busy || note.trim().length < 3} onClick={() => void act(() => post(`/v1/admin/disputes/${d.id}/resolve`, { inFavourOf: 'rider', note: note.trim() }), 'Resolved for the rider')}>Rider is right</Btn>
                <Btn variant="primary" disabled={!edit || busy || note.trim().length < 3} onClick={() => void act(() => post(`/v1/admin/disputes/${d.id}/resolve`, { inFavourOf: 'customer', note: note.trim(), openRefund: refund }), 'Resolved for the customer')}>Customer is right</Btn>
              </div>
            </Panel>
          )}
        </div>
      </>
    )
  }
  return (
    <>
      <PageHead title="Delivery disputes" desc="When a customer and a rider disagree about a delivery." actions={<Btn onClick={list.reload}>Refresh</Btn>} />
      <DataTable title={open ? 'Open disputes' : 'All disputes'} rows={list.data?.items ?? []} rowKey={(x) => x.id} columns={cols} loading={list.loading} error={list.failed && !list.data ? 'We couldn’t load the disputes.' : undefined} onRetry={list.reload}
        searchLabel="Search disputes" searchText={(x) => `${x.number} ${x.order} ${x.customer} ${x.rider ?? ''}`} emptyTitle="No disputes" empty="Support staff open a dispute from a ticket about a delivery."
        tools={<select className="select" aria-label="Show" value={open ? 'open' : 'all'} onChange={(e) => setOpen(e.target.value === 'open')}><option value="open">Open</option><option value="all">All</option></select>}
        actions={(x) => <Btn small onClick={() => navigate(`/support/disputes/${x.id}`)}>Open</Btn>} />
    </>
  )
}

// ---- customer lookup ------------------------------------------------------------------------------------------------

interface Found { id: string; name: string; email: string; phone: string; area: string; orders: number; spentCents: number }

export function CustomerLookup() {
  const { can, toast } = useStore()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Found[]>([])
  const [searched, setSearched] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) return
    let live = true
    const t = setTimeout(() => { void get<{ items: Found[] }>(`/v1/admin/customers?limit=10&q=${encodeURIComponent(q.trim())}`).then((r) => { if (live) { setFound(r.items); setSearched(true) } }, () => undefined) }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [q])
  const startChat = async (c: Found) => { try { await post('/v1/admin/chats', { customerId: c.id }); navigate('/support/chat') } catch (e) { toast(says(e)) } }
  return (
    <>
      <PageHead title="Customer lookup" desc="Find a customer by name, phone or email before you help them." />
      <Panel title="Search">
        <Field label="Name, phone or email" value={q} onChange={(v) => { setQ(v); if (v.trim().length < 2) { setFound([]); setSearched(false) } }} />
        {searched && found.length === 0 && q.trim().length >= 2 && <div className="panel-sub">No customer matches “{q.trim()}”.</div>}
        {q.trim().length >= 2 && found.map((c) => (
          <div className="list-row" key={c.id}>
            <span><strong>{c.name || c.email || c.phone}</strong><small>{[c.phone, c.email, c.area].filter(Boolean).join(' · ')} · {c.orders} order{c.orders === 1 ? '' : 's'} · {kes(shillings(c.spentCents))}</small></span>
            <span className="sp-row"><Btn small onClick={() => navigate(`/orders?customer=${c.id}`)}>Orders</Btn>{can('Customers', 'View') && <Btn small onClick={() => navigate(`/customers/${c.id}`)}>Profile</Btn>}<Btn small variant="primary" disabled={!can('Support', 'Create')} onClick={() => void startChat(c)}>Start a chat</Btn></span>
          </div>
        ))}
      </Panel>
    </>
  )
}
