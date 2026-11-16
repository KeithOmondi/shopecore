import { useEffect, useRef, useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, post } from '../lib/api'
import { dateTime } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

interface Overview {
  tickets: { open: number; urgent: number; breached: number; atRisk: number; unassigned: number; escalated: number; resolvedToday: number; avgFirstResponseMin: number | null; csat: number | null }
  chats: { open: number; waiting: number }
  claims: { refundsToReview: number; returnsToReview: number; openDisputes: number }
  reviews: { flagged: number; complaintsToCheck: number }
}
interface Ticket {
  id: string; number: string; kind: 'customer' | 'rider'; subject: string; category: string; priority: 'urgent' | 'high' | 'normal' | 'low'; status: 'open' | 'pending' | 'escalated' | 'resolved'
  assigneeId: string | null; assignee: string | null; personId: string; person: string; orderId: string | null; order: string | null; createdAt: string; updatedAt: string
  firstResponseAt: string | null; resolvedAt: string | null; csat: number | null; dueAt: string; breached: boolean; atRisk: boolean; messages: number
}
interface ThreadMessage { id: string; from: string; by: string; text: string; at: string }
interface TicketData extends Omit<Ticket, 'messages'> { messages: ThreadMessage[]; activity: { text: string; by: string; at: string }[] }

const STATUS_TEXT = { open: 'Open', pending: 'Waiting on customer', escalated: 'Escalated', resolved: 'Resolved' } as const
const statusTone = (s: Ticket['status']) => (s === 'resolved' ? 'green' : s === 'escalated' ? 'red' : s === 'pending' ? 'blue' : 'amber')
const priorityTone = (p: Ticket['priority']) => (p === 'urgent' ? 'red' : p === 'high' ? 'amber' : 'gray')

// ---- overview -------------------------------------------------------------------------------------------------------

export function SupportOverview() {
  const { data: o, failed, reload } = useGet<Overview>('/v1/admin/support/overview', 30_000)
  if (!o) return <PageHead title="Support overview" desc={failed ? 'We couldn’t load the overview.' : 'Loading…'} actions={<Btn onClick={reload}>Try again</Btn>} />
  return (
    <>
      <PageHead title="Support overview" desc="What needs a reply, and how the team is doing." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <div className="tile-row">
        <Stat label="Open tickets" value={String(o.tickets.open)} trend={`${o.tickets.unassigned} unassigned`} icon="▤" />
        <Stat label="Past reply deadline" value={String(o.tickets.breached)} trend={`${o.tickets.atRisk} due within the hour`} icon="!" up={o.tickets.breached === 0} />
        <Stat label="Chats waiting" value={String(o.chats.waiting)} trend={`${o.chats.open} open`} icon="✉" up={o.chats.waiting === 0} />
        <Stat label="Resolved today" value={String(o.tickets.resolvedToday)} trend={o.tickets.avgFirstResponseMin === null ? 'No replies yet' : `Replies in ${o.tickets.avgFirstResponseMin} min`} icon="✓" />
      </div>
      <div className="sp-two" style={{ marginTop: 14 }}>
        <Panel title="Claims to review">
          <SettingRow title="Refund requests" right={<Btn small onClick={() => navigate('/support/refunds')}>{String(o.claims.refundsToReview)}</Btn>} />
          <SettingRow title="Return requests" right={<Btn small onClick={() => navigate('/support/returns')}>{String(o.claims.returnsToReview)}</Btn>} />
          <SettingRow title="Open disputes" right={<Btn small onClick={() => navigate('/support/disputes')}>{String(o.claims.openDisputes)}</Btn>} />
        </Panel>
        <Panel title="Reviews and satisfaction">
          <SettingRow title="Flagged reviews" right={<Btn small onClick={() => navigate('/support/reviews')}>{String(o.reviews.flagged)}</Btn>} />
          <SettingRow title="Complaints to check" right={<b>{o.reviews.complaintsToCheck}</b>} />
          <SettingRow title="Customer rating (30 days)" right={<b>{o.tickets.csat === null ? '—' : `★ ${o.tickets.csat.toFixed(2)}`}</b>} />
          <SettingRow title="Escalated tickets" right={<b>{o.tickets.escalated}</b>} />
        </Panel>
      </div>
    </>
  )
}

// ---- tickets --------------------------------------------------------------------------------------------------------

export function TicketsInbox({ rider = false }: { rider?: boolean }) {
  const [status, setStatus] = useState('')
  const [mine, setMine] = useState(false)
  const base = rider ? '/support/rider-tickets' : '/support/tickets'
  const { data, failed, loading, reload } = useGet<{ items: Ticket[] }>(`/v1/admin/tickets?kind=${rider ? 'rider' : 'customer'}&limit=100${status ? `&status=${status}` : ''}${mine ? '&assignee=me' : ''}`, 30_000)
  const cols: Column<Ticket>[] = [
    { key: 'n', header: 'Ticket', render: (t) => <button className="link-btn" onClick={() => navigate(`${base}/${t.id}`)}>{t.number}</button> },
    { key: 's', header: 'Subject', render: (t) => <div><b>{t.subject}</b><div className="subtext">{t.person}{t.order ? ` · ${t.order}` : ''}</div></div> },
    { key: 'p', header: 'Priority', render: (t) => <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge> },
    { key: 'st', header: 'Status', render: (t) => <Badge tone={statusTone(t.status)}>{STATUS_TEXT[t.status]}</Badge> },
    { key: 'a', header: 'Assigned to', render: (t) => t.assignee ?? <span className="subtext">Nobody</span> },
    { key: 'sla', header: 'Reply due', render: (t) => (t.status === 'resolved' || t.firstResponseAt ? '—' : t.breached ? <Badge tone="red">Late</Badge> : t.atRisk ? <Badge tone="amber">Soon</Badge> : dateTime(Date.parse(t.dueAt))) },
    { key: 'u', header: 'Updated', sort: (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt), render: (t) => ago(t.updatedAt) },
  ]
  return (
    <>
      <PageHead title={rider ? 'Rider tickets' : 'Customer tickets'} desc="Requests waiting for a reply, newest first." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <DataTable title="Tickets" rows={data?.items ?? []} rowKey={(t) => t.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the tickets.' : undefined} onRetry={reload}
        searchLabel="Search tickets" searchText={(t) => `${t.number} ${t.subject} ${t.person} ${t.order ?? ''}`} emptyTitle="No tickets" empty="Support requests from the app appear here."
        tools={<>
          <select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{(Object.keys(STATUS_TEXT) as Ticket['status'][]).map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}</select>
          <select className="select" aria-label="Owner" value={mine ? 'me' : ''} onChange={(e) => setMine(e.target.value === 'me')}><option value="">Everyone’s</option><option value="me">Assigned to me</option></select>
        </>}
        actions={(t) => <Btn small onClick={() => navigate(`${base}/${t.id}`)}>Open</Btn>} />
    </>
  )
}

export function TicketDetail({ id }: { id: string }) {
  const { can, toast } = useStore()
  const { data: t, failed, reload } = useGet<TicketData>(`/v1/admin/tickets/${id}`, 20_000)
  const agents = useGet<{ items: { id: string; name: string; role: string }[] }>('/v1/admin/support/agents').data?.items ?? []
  const canned = useGet<{ items: { id: string; title: string; text: string; live: boolean }[] }>('/v1/admin/canned-replies').data?.items.filter((c) => c.live) ?? []
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!t) return <PageHead title="Ticket" desc={failed ? 'We couldn’t load this ticket.' : 'Loading…'} actions={<Btn onClick={() => navigate('/support/tickets')}>Back to tickets</Btn>} />
  const edit = can('Support', 'Edit')
  const run = async (what: () => Promise<unknown>, done: string) => { setBusy(true); try { await what(); toast(done); reload() } catch (e) { toast(says(e)) } finally { setBusy(false) } }
  const send = () => run(async () => { await post(`/v1/admin/tickets/${id}/reply`, { text: text.trim(), internal }); setText('') }, internal ? 'Note added' : 'Reply sent')
  return (
    <>
      <PageHead title={`${t.number} · ${t.subject}`} desc={`${t.person} · ${t.category}${t.order ? ` · ${t.order}` : ''}`}
        actions={<>
          <Btn onClick={() => navigate(t.kind === 'rider' ? '/support/rider-tickets' : '/support/tickets')}>Back to tickets</Btn>
          {t.orderId && can('Orders', 'View') && <Btn onClick={() => navigate(`/orders/${t.orderId}`)}>Open the order</Btn>}
          {t.status !== 'resolved' ? <Btn variant="primary" disabled={!edit || busy} onClick={() => void run(() => post(`/v1/admin/tickets/${id}/status`, { status: 'resolved' }), 'Ticket resolved')}>Resolve</Btn> : <Btn disabled={!edit || busy} onClick={() => void run(() => post(`/v1/admin/tickets/${id}/status`, { status: 'open' }), 'Ticket reopened')}>Reopen</Btn>}
        </>} />
      <div className="sp-two">
        <Panel title="Conversation">
          {t.messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: m.from === 'note' ? 'var(--amber-soft, #FEF3C7)' : m.from === 'agent' ? 'var(--blue-soft)' : 'var(--soft, #F3F4F6)' }}>
              <div className="subtext">{m.from === 'note' ? 'Internal note' : m.by} · {ago(m.at)}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
          ))}
          {(
            <>
              <Field label={internal ? 'Internal note (the customer won’t see it)' : 'Reply to the customer'} multiline value={text} onChange={setText} />
              {canned.length > 0 && !internal && <div className="sp-row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>{canned.slice(0, 6).map((c) => <button key={c.id} className="pill" onClick={() => { setText(c.text); void post(`/v1/admin/canned-replies/${c.id}/use`).catch(() => undefined) }}>{c.title}</button>)}</div>}
              <div className="sp-row end">
                <label className="sp-row" style={{ gap: 6 }}><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note</label>
                <Btn variant="primary" disabled={!edit || busy || !text.trim()} onClick={() => void send()}>{internal ? 'Add note' : 'Send reply'}</Btn>
              </div>
            </>
          )}
        </Panel>
        <div className="sp-stack">
          <Panel title="Ticket" right={<Badge tone={statusTone(t.status)}>{STATUS_TEXT[t.status]}</Badge>}>
            <Field label="Assigned to" value={t.assigneeId ?? ''} onChange={(v) => void run(() => post(`/v1/admin/tickets/${id}/assign`, { assigneeId: v || null }), 'Assignment saved')} disabled={!edit || busy} options={[{ value: '', label: 'Nobody' }, ...agents.map((a) => ({ value: a.id, label: a.name }))]} />
            <Field label="Priority" value={t.priority} onChange={(v) => void run(() => post(`/v1/admin/tickets/${id}/status`, { status: t.status, priority: v }), 'Priority changed')} disabled={!edit || busy} options={['urgent', 'high', 'normal', 'low']} />
            <Field label="Status" value={t.status} onChange={(v) => void run(() => post(`/v1/admin/tickets/${id}/status`, { status: v }), 'Status changed')} disabled={!edit || busy} options={(Object.keys(STATUS_TEXT) as string[]).map((s) => ({ value: s, label: STATUS_TEXT[s as keyof typeof STATUS_TEXT] }))} />
            <SettingRow title="Opened" right={<span className="prod-name">{dateTime(Date.parse(t.createdAt))}</span>} />
            {t.csat !== null && <SettingRow title="Customer rating" right={<b>{`★ ${t.csat}`}</b>} />}
          </Panel>
          <Panel title="Activity">
            {t.activity.length === 0 && <div className="panel-sub">Nothing yet.</div>}
            {t.activity.map((a, i) => <SettingRow key={i} title={a.text} sub={`${a.by} · ${ago(a.at)}`} />)}
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- live chat ------------------------------------------------------------------------------------------------------

interface ChatRow { id: string; customerId: string; name: string; assignee: string | null; unread: number; lastAt: string; order: string | null; lastMessage: string | null }
interface ChatFull { id: string; name: string; assignee: string | null; closed: boolean; order: string | null; messages: ThreadMessage[] }

export function LiveChat() {
  const { can, toast } = useStore()
  const [state, setState] = useState<'open' | 'closed'>('open')
  const list = useGet<{ items: ChatRow[] }>(`/v1/admin/chats?state=${state}`, 5_000)
  const [sel, setSel] = useState<string | null>(null)
  const chat = useGet<ChatFull>(sel ? `/v1/admin/chats/${sel}` : null, 4_000)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const count = chat.data?.messages.length ?? 0
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [count])
  const edit = can('Support', 'Edit')
  const send = async () => {
    setBusy(true)
    try { await post(`/v1/admin/chats/${sel}/messages`, { text: text.trim() }); setText(''); chat.reload(); list.reload() } catch (e) { toast(says(e)) } finally { setBusy(false) }
  }
  const act = async (what: 'take' | 'close') => {
    try { await post(`/v1/admin/chats/${sel}/${what}`); toast(what === 'take' ? 'You took the chat' : 'Chat closed'); chat.reload(); list.reload() } catch (e) { toast(says(e)) }
  }
  const c = chat.data
  return (
    <>
      <PageHead title="Live chat" desc="Talk to customers who message from the app." actions={<select className="select" aria-label="Chats" value={state} onChange={(e) => { setState(e.target.value as typeof state); setSel(null) }}><option value="open">Open chats</option><option value="closed">Closed chats</option></select>} />
      <div className="sp-two">
        <Panel title={state === 'open' ? 'Open chats' : 'Closed chats'}>
          {list.loading && <div className="panel-sub">Loading…</div>}
          {list.data?.items.length === 0 && <div className="panel-sub">No {state} chats.</div>}
          {list.data?.items.map((r) => (
            <div className="list-row" key={r.id} style={r.id === sel ? { background: 'var(--blue-soft)', paddingInline: 8, borderRadius: 6 } : undefined}>
              <span><button className="sp-link" onClick={() => setSel(r.id)}>{r.name || 'Customer'}</button><small>{r.lastMessage ?? ''}{r.order ? ` · ${r.order}` : ''}</small></span>
              <span className="sp-row">{r.unread > 0 && <Badge tone="red">{`${r.unread} new`}</Badge>}<span className="subtext">{ago(r.lastAt)}</span></span>
            </div>
          ))}
        </Panel>
        <Panel title={c ? c.name : 'Chat'} sub={c ? `${c.assignee ? `With ${c.assignee}` : 'Not taken yet'}${c.order ? ` · ${c.order}` : ''}` : 'Choose a chat on the left'}
          right={c && !c.closed ? <span className="sp-row"><Btn small disabled={!edit} onClick={() => void act('take')}>Take</Btn><Btn small disabled={!edit} onClick={() => void act('close')}>Close</Btn></span> : undefined}>
          {c && (
            <>
              <div style={{ maxHeight: 360, overflow: 'auto', marginBottom: 10 }}>
                {c.messages.map((m) => (
                  <div key={m.id} style={{ marginBottom: 8, textAlign: m.from === 'agent' ? 'right' : 'left' }}>
                    <span style={{ display: 'inline-block', padding: '8px 11px', borderRadius: 10, background: m.from === 'agent' ? 'var(--blue-soft)' : 'var(--soft, #F3F4F6)', maxWidth: '85%', textAlign: 'left' }}>{m.text}</span>
                    <div className="subtext">{m.by} · {ago(m.at)}</div>
                  </div>
                ))}
                <div ref={end} />
              </div>
              {c.closed ? <Notice mark="i">This chat has ended.</Notice> : (
                <div className="sp-row"><input style={{ flex: 1 }} aria-label="Message" value={text} placeholder="Write a message…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim() && !busy && edit) void send() }} /><Btn variant="primary" disabled={!edit || busy || !text.trim()} onClick={() => void send()}>Send</Btn></div>
              )}
            </>
          )}
        </Panel>
      </div>
    </>
  )
}

