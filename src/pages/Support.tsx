import { useEffect, useRef, useState } from 'react'

import { ago, Detail, NotFoundCard, Person, PriorityTag, TimelineItem, useNow, when } from '../components/support-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, Stat, type Column } from '../components/ui'
import { atRisk, breached, dueAt, fillTokens, isLive, PRIORITIES, SLA_MIN, TICKET_STATUSES, type Priority, type Ticket, type TicketStatus } from '../data/support'
import { clock, kes, shortDate } from '../lib/format'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'
import { useSupport } from '../lib/support'

const DAY = 86_400_000
const ticketPath = (t: Ticket) => `/support/${t.kind === 'Rider' ? 'rider-tickets' : 'tickets'}/${t.id}`
const statusTone = (s: TicketStatus) => (s === 'Open' ? 'red' : s === 'Resolved' ? 'green' : 'amber')

const mmss = (ms: number) => `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`

// ---- overview -----------------------------------------------------------------------------------------

export function SupportOverview() {
  const { tickets, reviews } = useSupport()
  const { staff } = useStore()
  const now = useNow()
  const [range, setRange] = useState<'12' | '30'>('12')
  const customer = tickets.filter((t) => t.kind === 'Customer')
  const live = customer.filter(isLive)
  const answered = customer.filter((t) => t.firstResponseAt)
  const avg = answered.length ? answered.reduce((n, t) => n + (t.firstResponseAt! - t.createdAt), 0) / answered.length : 0
  const rated = customer.filter((t) => t.csat)
  const csat = rated.length ? (rated.reduce((n, t) => n + t.csat!, 0) / rated.length / 5) * 100 : 0
  const breaches = tickets.filter((t) => breached(t, now))
  const urgentBreaches = breaches.filter((t) => t.priority === 'Urgent').length
  const risk = tickets.filter((t) => atRisk(t, now)).length
  const inSla = answered.length ? answered.filter((t) => t.firstResponseAt! - t.createdAt <= SLA_MIN[t.priority] * 60_000).length / answered.length : 1
  const resolved = customer.filter((t) => t.status === 'Resolved')
  const resInSla = resolved.length ? resolved.filter((t) => t.updatedAt - t.createdAt <= 24 * 3_600_000).length / resolved.length : 1
  const days = Number(range)
  const bars = Array.from({ length: days }, (_, i) => {
    const start = now - (days - i) * DAY
    const inDay = (ms: number) => ms >= start && ms < start + DAY
    return { opened: customer.filter((t) => inDay(t.createdAt)).length, resolved: customer.filter((t) => t.status === 'Resolved' && inDay(t.updatedAt)).length, label: shortDate(start + DAY).slice(0, 6) }
  })
  const top = Math.max(1, ...bars.map((b) => b.opened))
  const recent = [...tickets].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4)
  const team = staff.filter((s) => s.role === 'Customer support' && s.status === 'Active').map((s) => ({ name: s.name, open: live.filter((t) => t.assignee === s.name).length }))
  const rating = reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : 0

  return (
    <>
      <PageHead
        title="Support overview"
        desc="Live pulse across customer support, chat and delivery quality."
        actions={
          <>
            <Btn onClick={() => { downloadCsv('support-tickets.csv', ['Ticket', 'Subject', 'Priority', 'Status', 'Assignee'], tickets.map((t) => [t.id, t.subject, t.priority, t.status, t.assignee ?? ''])); }}>Export</Btn>
            <Btn variant="primary" onClick={() => navigate('/support/tickets')}>Open ticket queue</Btn>
          </>
        }
      />
      <div className="grid stats">
        <Stat label="Open tickets" value={String(live.length)} trend={`${live.filter((t) => !t.assignee).length} unassigned`} icon="▤" up={live.length < 20} />
        <Stat label="Average response time" value={answered.length ? mmss(avg) : '—'} trend={`${answered.length} tickets answered`} icon="◷" />
        <Stat label="Satisfaction score" value={rated.length ? `${csat.toFixed(1)}%` : '—'} trend={`${rating.toFixed(1)} / 5 average review`} icon="☆" />
        <Stat label="SLA breaches" value={String(breaches.length)} trend={`${urgentBreaches} urgent · ${breaches.length - urgentBreaches} need attention`} icon="!" up={breaches.length === 0} />
      </div>
      <div className="sp-two" style={{ gridTemplateColumns: 'minmax(0,1.45fr) minmax(260px,.9fr)' }}>
        <div className="sp-stack">
          <Panel
            title="Ticket volume"
            sub={`Inbound conversations across the last ${days} days`}
            right={
              <div className="sp-row">
                <div className="legend"><i /> Opened <i style={{ background: '#BFDBFE', marginLeft: 8 }} /> Resolved</div>
                <select className="sp-select auto" aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as '12' | '30')}>
                  <option value="12">Last 12 days</option>
                  <option value="30">Last 30 days</option>
                </select>
              </div>
            }
          >
            <div className="sp-bars" role="img" aria-label="Tickets opened and resolved per day">
              {bars.map((b, i) => (
                <div className="sp-bar-group" key={i} title={`${b.label}: ${b.opened} opened, ${b.resolved} resolved`}>
                  <div className="sp-bar" style={{ height: `${Math.max(2, (b.resolved / top) * 100)}%` }} />
                  <div className="sp-bar on" style={{ height: `${Math.max(2, (b.opened / top) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="chart-labels"><span>{bars[0]?.label}</span><span>{bars[Math.floor(bars.length / 2)]?.label}</span><span>{bars[bars.length - 1]?.label}</span></div>
          </Panel>
          <Panel title="Recently updated tickets" sub="Latest activity from your support team" right={<Btn small onClick={() => navigate('/support/tickets')}>View inbox</Btn>}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ticket</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {recent.map((t) => (
                    <tr key={t.id}>
                      <td><button className="sp-link" onClick={() => navigate(ticketPath(t))}>#{t.id}</button><span className="sp-sub">{t.subject}</span></td>
                      <td><PriorityTag p={t.priority} /></td>
                      <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                      <td>{ago(t.updatedAt, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="SLA health" sub="First response targets by priority" right={<Badge tone={inSla >= 0.9 ? 'green' : 'amber'}>{inSla >= 0.9 ? 'On track' : 'Slipping'}</Badge>}>
            <div className="sp-sla"><span>First response within SLA</span><b>{Math.round(inSla * 100)}%</b><div className="sp-progress"><span style={{ width: `${inSla * 100}%` }} /></div></div>
            <div className="sp-sla"><span>Resolved within 24 hours</span><b>{Math.round(resInSla * 100)}%</b><div className="sp-progress amber"><span style={{ width: `${resInSla * 100}%` }} /></div></div>
            <div className="sp-sla"><span>At risk in the next hour</span><b style={{ color: 'var(--red)' }}>{risk} ticket{risk === 1 ? '' : 's'}</b><div className="sp-progress red"><span style={{ width: `${Math.min(100, risk * 14)}%` }} /></div></div>
            <div className="panel-head" style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <div><h2>Team snapshot</h2><div className="panel-sub">Active agents today</div></div>
              <span className="panel-sub">{team.length} online</span>
            </div>
            {team.map((m) => <div className="sp-detail" key={m.name}><span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}><Person name={m.name} /><b>{m.name}</b></span><span>{m.open} open</span></div>)}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- ticket inbox ---------------------------------------------------------------------------------------

function NewTicketForm({ kind }: { kind: 'Customer' | 'Rider' }) {
  const { customers, riders, orders, closeModal, toast } = useStore()
  const { createTicket } = useSupport()
  const [person, setPerson] = useState('')
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState(kind === 'Customer' ? 'Delivery' : 'Rider app')
  const [priority, setPriority] = useState<Priority>('Normal')
  const [orderId, setOrderId] = useState('')
  const [body, setBody] = useState('')
  const [err, setErr] = useState<Record<string, string>>({})
  const people = kind === 'Customer' ? customers.map((c) => ({ value: c.id, label: c.name })) : riders.filter((r) => r.status !== 'Suspended').map((r) => ({ value: r.id, label: r.name }))

  const submit = () => {
    const e: Record<string, string> = {}
    if (!person) e.person = kind === 'Customer' ? 'Choose the customer' : 'Choose the rider'
    if (!subject.trim()) e.subject = 'Describe the issue in a few words'
    if (!body.trim()) e.body = 'Add what the person told you'
    const order = orderId.trim() ? orders.find((o) => o.id.toLowerCase() === orderId.trim().toLowerCase()) : undefined
    if (orderId.trim() && !order) e.order = 'No order has that number'
    setErr(e)
    if (Object.keys(e).length) return
    const name = people.find((p) => p.value === person)!.label
    const id = createTicket({ kind, personId: person, personName: name, subject: subject.trim(), category, priority, orderId: order?.id, body: body.trim() })
    closeModal()
    toast(`Ticket ${id} created`)
    navigate(`/support/${kind === 'Rider' ? 'rider-tickets' : 'tickets'}/${id}`)
  }
  return (
    <>
      <Field label={kind === 'Customer' ? 'Customer' : 'Rider'} value={person} onChange={(v) => setPerson(v)} options={[{ value: '', label: 'Choose…' }, ...people]} error={err.person} />
      <Field label="Subject" value={subject} onChange={setSubject} placeholder={kind === 'Customer' ? 'What does the customer need?' : 'What is the rider reporting?'} error={err.subject} />
      <div className="sp-form2">
        <Field label="Category" value={category} onChange={setCategory} options={kind === 'Customer' ? ['Delivery', 'Refund', 'Payments', 'Order issue', 'Account'] : ['Rider app', 'Payouts', 'Navigation', 'Payments', 'Delivery']} />
        <Field label="Priority" value={priority} onChange={(v) => setPriority(v as Priority)} options={PRIORITIES} />
      </div>
      <Field label="Order number (optional)" value={orderId} onChange={setOrderId} placeholder="For example SC-4928" error={err.order} />
      <Field label="What they said" multiline value={body} onChange={setBody} error={err.body} />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={submit}>Create ticket</Btn></div>
    </>
  )
}

export function TicketsInbox({ rider = false }: { rider?: boolean }) {
  const { tickets, assignTicket, me } = useSupport()
  const { openModal, toast, can, staff } = useStore()
  const now = useNow()
  const [status, setStatus] = useState('All statuses')
  const [priority, setPriority] = useState('All priorities')
  const [assignee, setAssignee] = useState('All assignees')
  const edit = can('Support', 'Edit')
  const create = can('Support', 'Create')
  const kind = rider ? 'Rider' : 'Customer'
  const all = tickets.filter((t) => t.kind === kind)
  const names = staff.filter((s) => s.role === 'Customer support' && s.status === 'Active').map((s) => s.name)
  const rows = all.filter((t) => (status === 'All statuses' || t.status === status) && (priority === 'All priorities' || t.priority === priority) && (assignee === 'All assignees' || (assignee === 'Unassigned' ? !t.assignee : t.assignee === assignee)))
  const order: Record<Priority, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 }

  const cols: Column<Ticket>[] = [
    { key: 'id', header: 'Ticket', sort: (a, b) => a.id.localeCompare(b.id), render: (t) => <><button className="sp-link" onClick={() => navigate(ticketPath(t))}>#{t.id}</button><span className="sp-sub">{t.personName}{t.status === 'Escalated' ? ' · Escalated queue' : t.orderId ? ` · Order ${t.orderId}` : ''}</span></> },
    { key: 'subject', header: 'Topic', sort: (a, b) => a.subject.localeCompare(b.subject), render: (t) => <span style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 260 }}>{t.subject}</span> },
    { key: 'cat', header: 'Category', render: (t) => t.category },
    { key: 'pri', header: 'Priority', sort: (a, b) => order[a.priority] - order[b.priority], render: (t) => <PriorityTag p={t.priority} /> },
    { key: 'who', header: 'Assignee', render: (t) => t.assignee ?? <span style={{ color: 'var(--muted)' }}>Unassigned</span> },
    { key: 'status', header: 'Status', sort: (a, b) => a.status.localeCompare(b.status), render: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
    { key: 'upd', header: 'Updated', sort: (a, b) => a.updatedAt - b.updatedAt, render: (t) => (breached(t, now) ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{ago(t.updatedAt, now)} · late</span> : ago(t.updatedAt, now)) },
  ]
  const live = all.filter(isLive)

  return (
    <>
      <PageHead
        title={rider ? 'Rider support tickets' : 'Tickets inbox'}
        desc={rider ? 'Rider-reported app, delivery and payout issues.' : 'Triage customer requests, keep response times within SLA and route work to the right person.'}
        actions={
          <>
            <Btn onClick={() => { downloadCsv(`${kind.toLowerCase()}-tickets.csv`, ['Ticket', 'Subject', 'Category', 'Priority', 'Assignee', 'Status'], rows.map((t) => [t.id, t.subject, t.category, t.priority, t.assignee ?? '', t.status])); toast('Ticket export is ready') }}>Export</Btn>
            <Btn variant="primary" disabled={!create} onClick={() => openModal({ title: 'Create support ticket', body: <NewTicketForm kind={kind} />, noActions: true })}>+ Create ticket</Btn>
          </>
        }
      />
      <DataTable
        title={`${live.length} open · ${live.filter((t) => breached(t, now) || atRisk(t, now)).length} SLA at risk`}
        rows={rows}
        rowKey={(t) => t.id}
        columns={cols}
        searchLabel="Search tickets"
        searchText={(t) => `${t.id} ${t.subject} ${t.personName} ${t.category} ${t.orderId ?? ''}`}
        tools={
          <>
            <select className="sp-select auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option>{TICKET_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            <select className="sp-select auto" aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option>All priorities</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
            <select className="sp-select auto" aria-label="Filter by assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option>All assignees</option><option>Unassigned</option>{names.map((n) => <option key={n}>{n}</option>)}</select>
          </>
        }
        actions={(t) => <Btn small onClick={() => navigate(ticketPath(t))}>Open</Btn>}
        bulk={edit ? { label: 'Assign to me', onClick: (ids) => { ids.forEach((id) => assignTicket(id, me)); toast(`${ids.length} ticket${ids.length === 1 ? '' : 's'} assigned to you`) } } : undefined}
        empty="No tickets match these filters."
      />
    </>
  )
}

// ---- ticket detail ---------------------------------------------------------------------------------------

export function TicketDetail({ id }: { id: string }) {
  const { tickets, setTicketStatus, setTicketPriority, assignTicket, replyTicket, refunds, createRefund, disputes, createDispute, canned, bumpCanned, me } = useSupport()
  const { customers, riders, orders, openModal, closeModal, toast, can, staff } = useStore()
  const now = useNow()
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)
  const [error, setError] = useState('')
  const t = tickets.find((x) => x.id === id)
  if (!t) return <NotFoundCard what="Ticket" back="Back to the inbox" onBack={() => navigate('/support/tickets')} />
  const edit = can('Support', 'Edit')
  const customer = t.kind === 'Customer' ? customers.find((c) => c.id === t.personId) : undefined
  const rider = t.kind === 'Rider' ? riders.find((r) => r.id === t.personId) : undefined
  const order = t.orderId ? orders.find((o) => o.id === t.orderId) : undefined
  const back = t.kind === 'Rider' ? '/support/rider-tickets' : '/support/tickets'
  const names = staff.filter((s) => s.role === 'Customer support' && s.status === 'Active').map((s) => s.name)
  const due = dueAt(t)
  const first = t.personName.split(' ')[0]!

  const send = () => {
    if (!reply.trim()) return setError(internal ? 'Write the note first.' : 'Write a reply first.')
    replyTicket(t.id, reply.trim(), internal)
    toast(internal ? 'Internal note added' : `Reply sent to ${first}`)
    setReply('')
    setError('')
  }
  const resolve = () =>
    openModal({
      title: 'Close ticket?',
      message: 'This ticket will be marked resolved and removed from the open queue.',
      confirm: 'Resolve ticket',
      onConfirm: () => { setTicketStatus(t.id, 'Resolved'); toast(`Ticket ${t.id} resolved`) },
    })
  const escalate = () =>
    openModal({
      title: 'Escalate this ticket?',
      message: 'It moves to the escalated queue and the delivery team is told.',
      confirm: 'Escalate',
      onConfirm: () => { setTicketStatus(t.id, 'Escalated'); toast('Escalated to the delivery team') },
    })
  const refundFor = order ? refunds.find((r) => r.orderId === order.id) : undefined
  const disputeFor = order ? disputes.find((d) => d.orderId === order.id) : undefined
  const startRefund = () => {
    if (!order) return
    if (refundFor) return navigate(`/support/refunds/${refundFor.id}`)
    if (order.pay !== 'Paid') return toast('This order wasn’t paid, so there is nothing to refund')
    openModal({
      title: 'Start a refund review?',
      message: `A refund request for ${order.id} (up to ${kes(order.total - order.refunded)}) will be added to the review queue.`,
      confirm: 'Start review',
      onConfirm: () => { const rid = createRefund(order.id, order.total - order.refunded, t.subject, t.id); navigate(`/support/refunds/${rid}`) },
    })
  }
  const openDispute = () => {
    if (!order) return
    if (disputeFor) return navigate(`/support/disputes/${disputeFor.id}`)
    openModal({
      title: 'Open a rider dispute?',
      message: `The rider and customer statements for ${order.id} will be compared side by side.`,
      confirm: 'Open dispute',
      onConfirm: () => { const did = createDispute(order.id, t.id); if (did) navigate(`/support/disputes/${did}`) },
    })
  }
  const insertCanned = () =>
    openModal({
      title: 'Insert a saved reply',
      noActions: true,
      body: (
        <>
          {canned.filter((c) => c.live).map((c) => (
            <div className="sp-detail" key={c.id}>
              <span style={{ color: 'var(--ink)', flex: 1 }}><b>{c.title}</b><span className="sp-sub">{c.text.slice(0, 90)}…</span></span>
              <Btn small onClick={() => { setReply(fillTokens(c.text, { customer_name: first, order_id: t.orderId, agent_name: me })); bumpCanned(c.id); closeModal() }}>Use</Btn>
            </div>
          ))}
        </>
      ),
    })
  const notify = Math.max(0, Math.round((due - now) / 60_000))

  return (
    <>
      <PageHead
        title={`Ticket #${t.id}`}
        desc={t.subject}
        actions={
          <>
            <select className="sp-select auto" aria-label="Ticket status" value={t.status} disabled={!edit} onChange={(e) => { setTicketStatus(t.id, e.target.value as TicketStatus); toast(`Status set to ${e.target.value}`) }}>{TICKET_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            <Btn disabled={!edit || t.status === 'Resolved'} onClick={resolve}>Resolve ticket</Btn>
            <Btn onClick={() => navigate(back)}>Back</Btn>
          </>
        }
      />
      {!edit && <div style={{ marginBottom: 12 }}><Notice>Your role can read tickets but not reply to them.</Notice></div>}
      <div className="sp-two">
        <div className="sp-stack">
          <Panel>
            <div className="sp-ticket-head">
              <div>
                <h2 className="sp-ticket-title">{t.subject}</h2>
                <span className="panel-sub">#{t.id} · {t.category} · Created {when(t.createdAt)}</span>
              </div>
              <PriorityTag p={t.priority} />
            </div>
            <div className="sp-conv" aria-label="Conversation">
              {t.messages.map((m) =>
                m.from === 'note' ? (
                  <div className="sp-note" key={m.id}><b>Internal note · {m.by} · {clock(m.at)}</b><br />{m.text}</div>
                ) : (
                  <div className={`sp-msg ${m.from === 'agent' ? 'agent' : ''}`} key={m.id}>
                    <Person name={m.by} />
                    <div className="sp-bubble">
                      <div className="sp-bubble-meta"><b>{m.by} · {m.from === 'agent' ? 'Support' : m.from === 'rider' ? 'Rider' : 'Customer'}</b><span>{clock(m.at)}</span></div>
                      {m.text}
                    </div>
                  </div>
                ),
              )}
            </div>
            <div className="sp-row" style={{ marginBottom: 8 }}>
              <Btn small disabled={!edit} onClick={insertCanned}>Insert canned reply</Btn>
              {order && <Btn small onClick={() => navigate(`/orders/${order.id}`)}>View order</Btn>}
              <Btn small disabled={!edit || t.status === 'Escalated' || t.status === 'Resolved'} onClick={escalate}>Escalate</Btn>
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <textarea className="sp-text" aria-label={`Reply to ${first}`} placeholder={`Reply to ${first}…`} value={reply} disabled={!edit} onChange={(e) => { setReply(e.target.value); setError('') }} />
              {error && <div className="sp-err" role="alert">{error}</div>}
            </div>
            <div className="sp-row between">
              <label className="sp-row" style={{ fontSize: 11, gap: 6 }}><input type="checkbox" checked={internal} disabled={!edit} onChange={(e) => setInternal(e.target.checked)} /> Add as internal note</label>
              <Btn variant="primary" disabled={!edit} onClick={send}>{internal ? 'Add note' : 'Send reply'}</Btn>
            </div>
          </Panel>
          <Panel title="Activity" right={<span className="panel-sub">{t.activity.length} events</span>}>
            <div className="sp-tl">{t.activity.map((a, i) => <TimelineItem key={i} tone={i === t.activity.length - 1 ? 'gray' : undefined} title={a.text} sub={`${clock(a.at)} · ${a.sub}`} />)}</div>
          </Panel>
        </div>
        <div className="sp-stack">
          {customer && (
            <Panel title="Customer" right={<Btn small onClick={() => navigate(`/support/lookup?customer=${customer.id}`)}>Profile</Btn>}>
              <div className="sp-row" style={{ marginBottom: 6 }}><Person name={customer.name} size={44} /><div><b style={{ fontSize: 14 }}>{customer.name}</b><div className="panel-sub">Customer since {customer.added}</div></div></div>
              <Detail label="Email">{customer.email}</Detail>
              <Detail label="Phone">{customer.phone}</Detail>
              <Detail label="Orders">{customer.orders}</Detail>
              <Detail label="Prior tickets">{tickets.filter((x) => x.personId === customer.id && x.id !== t.id).length}</Detail>
            </Panel>
          )}
          {rider && (
            <Panel title="Rider" right={<Btn small onClick={() => navigate(`/riders/${rider.id}`)}>Profile</Btn>}>
              <div className="sp-row" style={{ marginBottom: 6 }}><Person name={rider.name} size={44} /><div><b style={{ fontSize: 14 }}>{rider.name}</b><div className="panel-sub">{rider.vehicle} · {rider.zone}</div></div></div>
              <Detail label="Phone">{rider.phone}</Detail>
              <Detail label="Status">{rider.status}</Detail>
              <Detail label="Rating">{rider.rating.toFixed(1)}</Detail>
              <Detail label="Deliveries">{rider.deliveries}</Detail>
            </Panel>
          )}
          {order && (
            <Panel title="Related order" right={<Btn small onClick={() => navigate(`/orders/${order.id}`)}>Open</Btn>}>
              <Detail label="Order">{order.id}</Detail>
              <Detail label="Total">{kes(order.total)}</Detail>
              <Detail label="Placed">{when(order.placedAt)}</Detail>
              <Detail label="Delivery"><Badge>{order.status}</Badge></Detail>
              <Detail label="Rider">{riders.find((r) => r.id === order.riderId)?.name ?? 'Not assigned'}</Detail>
            </Panel>
          )}
          <Panel title="Ticket details">
            <div className="field"><label htmlFor="assignee">Assigned to</label>
              <select id="assignee" className="sp-select" value={t.assignee ?? ''} disabled={!edit} onChange={(e) => { assignTicket(t.id, e.target.value || null); toast(e.target.value ? `Assigned to ${e.target.value}` : 'Ticket unassigned') }}>
                <option value="">Unassigned</option>{[...new Set([...names, ...(t.assignee ? [t.assignee] : []), me])].map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="prio">Priority</label>
              <select id="prio" className="sp-select" value={t.priority} disabled={!edit} onChange={(e) => setTicketPriority(t.id, e.target.value as Priority)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
            </div>
            <Detail label="First response">{t.firstResponseAt ? `${Math.max(1, Math.round((t.firstResponseAt - t.createdAt) / 60_000))} min` : breached(t, now) ? <span style={{ color: 'var(--red)' }}>Overdue</span> : isLive(t) ? `Due in ${notify} min` : '—'}</Detail>
            <Detail label="Updated">{ago(t.updatedAt, now)}</Detail>
          </Panel>
          {t.kind === 'Customer' && order && (
            <Panel title="Quick actions">
              <div style={{ display: 'grid', gap: 8 }}>
                <Btn disabled={!can('Support', 'Edit')} onClick={startRefund}>{refundFor ? `Open refund ${refundFor.id}` : 'Start refund review'}</Btn>
                <Btn disabled={!can('Support', 'Edit')} onClick={openDispute}>{disputeFor ? `Open dispute ${disputeFor.id}` : 'Open rider dispute'}</Btn>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}

// ---- live chat -------------------------------------------------------------------------------------------

function NoteForm({ customerId }: { customerId: string }) {
  const { addNote, closeModal, toast } = useStore()
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <Field label="Customer note" multiline value={text} onChange={(v) => { setText(v); setErr('') }} placeholder="Only staff can see this" error={err} />
      <div className="sp-row end">
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={() => { if (!text.trim()) return setErr('Write the note first'); addNote(customerId, text.trim()); closeModal(); toast('Customer note saved') }}>Save note</Btn>
      </div>
    </>
  )
}

export function LiveChat() {
  const { chats, markChatRead, sendChat, assignChat, closeChat, me } = useSupport()
  const { orders, customers, riders, openModal, can, toast } = useStore()
  const wanted = useQuery().get('chat')
  const [activeId, setActiveId] = useState(wanted ?? chats[0]?.id ?? '')
  const [tab, setTab] = useState<'Active' | 'Mine'>('Active')
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const edit = can('Support', 'Edit')
  const open = chats.filter((c) => !c.closed)
  const shown = open.filter((c) => (tab === 'Active' || c.assignee === me) && `${c.name} ${c.messages.at(-1)?.text ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  const chat = chats.find((c) => c.id === activeId && !c.closed) ?? shown[0]
  const now = useNow()
  const count = chat?.messages.length ?? 0

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [count, chat?.id])

  const pick = (id: string) => { setActiveId(id); markChatRead(id) }
  const send = () => {
    if (!chat || !text.trim()) return
    sendChat(chat.id, text.trim())
    setText('')
  }
  const order = chat?.orderId ? orders.find((o) => o.id === chat.orderId) : undefined
  const customer = chat ? customers.find((c) => c.id === chat.customerId) : undefined
  const unread = open.reduce((n, c) => n + c.unread, 0)

  return (
    <>
      <PageHead title="Live chat console" desc="Reply to customers in real time and see their order next to each conversation." actions={<Badge tone="green">{`${open.filter((c) => c.assignee).length || 1} agents online`}</Badge>} />
      <div className="card sp-chat">
        <aside className="sp-chat-list" aria-label="Conversations">
          <div className="sp-chat-search">
            <input className="sp-input" placeholder="Search chats" aria-label="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="sp-row" style={{ marginTop: 9 }}>
              <button className={`btn small ${tab === 'Active' ? 'primary' : ''}`} onClick={() => setTab('Active')}>Active {open.length}</button>
              <button className={`btn small ${tab === 'Mine' ? 'primary' : ''}`} onClick={() => setTab('Mine')}>Mine {open.filter((c) => c.assignee === me).length}</button>
            </div>
          </div>
          {shown.map((c) => {
            const last = c.messages.at(-1)
            return (
              <button key={c.id} className={`sp-person ${c.id === chat?.id ? 'active' : ''}`} onClick={() => pick(c.id)} aria-current={c.id === chat?.id ? 'true' : undefined}>
                <Person name={c.name} />
                <span className="sp-person-copy"><b>{c.name}</b><p>{last?.text}</p></span>
                <span style={{ textAlign: 'right' }}><small className="panel-sub">{last ? ago(last.at, now).replace(' ago', '') : ''}</small>{c.unread > 0 && <span className="sp-count" style={{ display: 'block' }}>{c.unread}</span>}</span>
              </button>
            )
          })}
          {!shown.length && <div style={{ padding: 20, color: 'var(--muted)', fontSize: 11 }}>{open.length ? 'No chats match.' : 'No open chats. New ones will appear here.'}</div>}
        </aside>
        {chat ? (
          <section className="sp-thread" aria-label={`Chat with ${chat.name}`}>
            <div className="sp-thread-head">
              <Person name={chat.name} />
              <div><b style={{ fontSize: 12 }}>{chat.name}</b><div className="panel-sub">Online now{chat.orderId ? ` · Order ${chat.orderId}` : ''}{chat.assignee ? ` · ${chat.assignee}` : ' · Unassigned'}</div></div>
              <div className="sp-row" style={{ marginLeft: 'auto' }}>
                <Btn small disabled={!edit || chat.assignee === me} onClick={() => { assignChat(chat.id); toast('Chat assigned to you') }}>{chat.assignee === me ? 'Assigned to you' : 'Assign to me'}</Btn>
                <Btn small disabled={!edit} onClick={() => openModal({ title: 'Close this chat?', message: `${chat.name} will be told the chat has ended. You can still find the conversation in their history.`, confirm: 'Close chat', onConfirm: () => { closeChat(chat.id); toast('Chat closed') } })}>Close</Btn>
              </div>
            </div>
            <div className="sp-thread-msgs" role="log" aria-live="polite">
              {chat.messages.map((m) => (
                <div className={`sp-cb ${m.from === 'agent' ? 'mine' : ''}`} key={m.id}>{m.text}<div className="sp-cb-time">{m.from === 'agent' ? m.by.split(' ')[0] : 'Customer'} · {clock(m.at)}</div></div>
              ))}
              <div ref={end} />
            </div>
            <div className="sp-compose">
              <input className="sp-input" aria-label="Write a reply" placeholder={edit ? 'Write a reply…' : 'Your role can’t reply to chats'} value={text} disabled={!edit} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }} />
              <Btn variant="primary" disabled={!edit} onClick={send}>Send</Btn>
            </div>
          </section>
        ) : (
          <section className="sp-thread" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 12 }}>{unread ? 'Choose a conversation' : 'All caught up. No open chats.'}</section>
        )}
        {chat ? (
          <aside className="sp-chat-details" aria-label="Customer details">
            <div className="sp-center"><Person name={chat.name} /><b style={{ display: 'block', fontSize: 12 }}>{chat.name}</b><small className="panel-sub">Customer{customer ? ` · Since ${customer.added.slice(-4)}` : ''}</small></div>
            <h3>Current order</h3>
            {order ? (
              <>
                <Detail label="Order ID">{order.id}</Detail>
                <Detail label="Status"><Badge>{order.status}</Badge></Detail>
                <Detail label="Total">{kes(order.total)}</Detail>
                <Detail label="Rider">{riders.find((r) => r.id === order.riderId)?.name ?? 'Not assigned'}</Detail>
                <div style={{ marginTop: 10 }}><Btn small onClick={() => navigate(`/orders/${order.id}`)}>View order</Btn></div>
              </>
            ) : <p className="panel-sub">No active order.</p>}
            <h3>Customer notes</h3>
            {customer?.notes.length ? customer.notes.slice(0, 3).map((n, i) => <p className="panel-sub" key={i} style={{ marginBottom: 6 }}>{n.text} <i>— {n.by}, {n.at}</i></p>) : <p className="panel-sub">No notes yet.</p>}
            <div className="sp-row" style={{ marginTop: 8 }}>
              <Btn small disabled={!edit || !customer} onClick={() => customer && openModal({ title: `Note for ${customer.name}`, body: <NoteForm customerId={customer.id} />, noActions: true })}>+ Add note</Btn>
              {customer && <Btn small onClick={() => navigate(`/support/lookup?customer=${customer.id}`)}>Profile</Btn>}
            </div>
          </aside>
        ) : <aside className="sp-chat-details" />}
      </div>
    </>
  )
}

