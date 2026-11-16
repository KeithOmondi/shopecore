import { useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, type Column } from '../components/ui'
import { ApiError, post } from '../lib/api'
import { dateTime } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')

// ---- failed deliveries ----------------------------------------------------------------------------------------------

interface Failure { id: string; orderId: string; order: string; customer: string; rider: string | null; reason: string | null; kind: string | null; zone: string | null; at: string; resolved: boolean; note: string; resolvedBy: string | null }

function ResolveForm({ f, onDone }: { f: Failure; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (note.trim().length < 3) return setErr('Say what you did about it')
    setBusy(true)
    try { await post(`/v1/admin/exceptions/${f.id}/resolve`, { note: note.trim() }); onDone(); closeModal(); toast('Marked as resolved') } catch (e) { setErr(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <Field label="What was done?" multiline value={note} onChange={(v) => { setNote(v); setErr('') }} error={err} placeholder="e.g. Called the customer, redelivered tomorrow" />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={() => void go()}>Mark resolved</Btn></div>
    </>
  )
}

export function FailedDeliveries() {
  const { can, openModal } = useStore()
  const [state, setState] = useState<'open' | 'resolved'>('open')
  const { data, failed, loading, reload } = useGet<{ items: Failure[] }>(`/v1/admin/exceptions?state=${state}&limit=100`)
  const cols: Column<Failure>[] = [
    { key: 'o', header: 'Order', render: (f) => <button className="link-btn" onClick={() => navigate(`/orders/${f.orderId}`)}>{f.order}</button> },
    { key: 'c', header: 'Customer', render: (f) => f.customer },
    { key: 'r', header: 'Rider', render: (f) => f.rider ?? '—' },
    { key: 'w', header: 'Why', render: (f) => <div>{f.reason ?? '—'}{f.kind && <div className="subtext">{f.kind}</div>}</div> },
    { key: 'z', header: 'Zone', render: (f) => f.zone ?? '—' },
    { key: 'a', header: 'When', sort: (a, b) => Date.parse(a.at) - Date.parse(b.at), render: (f) => dateTime(Date.parse(f.at)) },
    { key: 's', header: 'Status', render: (f) => (f.resolved ? <Badge tone="green">{`Resolved${f.resolvedBy ? ` by ${f.resolvedBy}` : ''}`}</Badge> : <Badge tone="red">Needs action</Badge>) },
  ]
  return (
    <>
      <PageHead title="Failed deliveries" desc="Deliveries that didn’t go through, and what was done about them." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <DataTable title={state === 'open' ? 'Needs action' : 'Resolved'} rows={data?.items ?? []} rowKey={(f) => f.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the failed deliveries.' : undefined} onRetry={reload}
        searchLabel="Search failures" searchText={(f) => `${f.order} ${f.customer} ${f.rider ?? ''} ${f.reason ?? ''}`} emptyTitle={state === 'open' ? 'No failed deliveries' : 'Nothing resolved yet'} empty="Good news: every delivery has gone through."
        tools={<select className="select" aria-label="State" value={state} onChange={(e) => setState(e.target.value as typeof state)}><option value="open">Needs action</option><option value="resolved">Resolved</option></select>}
        actions={(f) => (f.resolved ? <span className="subtext">{f.note}</span> : <div className="sp-row"><Btn small onClick={() => navigate(`/dispatch/assign/${f.orderId}`)}>Redispatch</Btn><Btn small variant="primary" disabled={!can('Dispatch', 'Edit')} onClick={() => openModal({ title: `Resolve ${f.order}`, body: <ResolveForm f={f} onDone={reload} />, noActions: true })}>Resolve</Btn></div>)} />
    </>
  )
}

// ---- incidents ------------------------------------------------------------------------------------------------------

interface Incident { id: string; number: string; riderId: string; rider: string; type: string; severity: string; status: 'open' | 'investigating' | 'resolved'; sos: boolean; zone: string | null; location: { lat: number; lng: number } | null; at: string }
interface IncidentFull extends Incident { log: { text: string; by: string; at: string }[] }

function IncidentPanel({ id, onChange }: { id: string; onChange: () => void }) {
  const { can, toast } = useStore()
  const { data: i, reload } = useGet<IncidentFull>(`/v1/admin/incidents/${id}`)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async (body: { status?: 'investigating' | 'resolved'; note?: string }) => {
    setBusy(true)
    try { await post(`/v1/admin/incidents/${id}`, body); setNote(''); reload(); onChange() } catch (e) { toast(says(e)) } finally { setBusy(false) }
  }
  if (!i) return <Panel title="Incident"><div className="panel-sub">Loading…</div></Panel>
  const edit = can('Dispatch', 'Edit')
  return (
    <Panel title={i.number} sub={`${i.type} · ${i.rider}${i.zone ? ` · ${i.zone}` : ''}`} right={<Badge tone={i.status === 'resolved' ? 'green' : i.sos ? 'red' : 'amber'}>{i.status}</Badge>}>
      {i.location && <SettingRow title="Location" right={<a className="link-btn" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${i.location.lat},${i.location.lng}`}>Open map</a>} />}
      {i.log.map((l, k) => <SettingRow key={k} title={l.text} sub={`${l.by} · ${dateTime(Date.parse(l.at))}`} />)}
      {i.status !== 'resolved' && (
        <>
          <Field label="Add a note" multiline value={note} onChange={setNote} />
          <div className="sp-row end">
            <Btn disabled={!edit || busy || !note.trim()} onClick={() => void send({ note: note.trim() })}>Add note</Btn>
            {i.status === 'open' && <Btn disabled={!edit || busy} onClick={() => void send({ status: 'investigating' })}>Start investigating</Btn>}
            <Btn variant="primary" disabled={!edit || busy} onClick={() => void send({ status: 'resolved', ...(note.trim() ? { note: note.trim() } : {}) })}>Mark resolved</Btn>
          </div>
        </>
      )}
    </Panel>
  )
}

export function Incidents() {
  const [status, setStatus] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const { data, failed, loading, reload } = useGet<{ items: Incident[] }>(`/v1/admin/incidents?limit=100${status ? `&status=${status}` : ''}`, 20_000)
  const cols: Column<Incident>[] = [
    { key: 'n', header: 'Incident', render: (i) => <button className="link-btn" onClick={() => setSel(i.id)}>{i.number}</button> },
    { key: 't', header: 'Type', render: (i) => <>{i.sos && <Badge tone="red">SOS</Badge>} {i.type}</> },
    { key: 'r', header: 'Rider', render: (i) => i.rider },
    { key: 's', header: 'Severity', render: (i) => <Badge tone={i.severity === 'critical' ? 'red' : i.severity === 'high' ? 'amber' : 'gray'}>{i.severity}</Badge> },
    { key: 'st', header: 'Status', render: (i) => <Badge tone={i.status === 'resolved' ? 'green' : 'amber'}>{i.status}</Badge> },
    { key: 'a', header: 'Reported', render: (i) => dateTime(Date.parse(i.at)) },
  ]
  return (
    <>
      <PageHead title="Incidents and SOS alerts" desc="Problems riders report from the road. SOS alerts come first." actions={<Btn onClick={reload}>Refresh</Btn>} />
      {data?.items.some((i) => i.sos && i.status !== 'resolved') && <Notice tone="error" mark="!">There is an open SOS alert. Open it and call the rider.</Notice>}
      <div className="sp-two" style={{ marginTop: 12 }}>
        <DataTable title="Incidents" rows={data?.items ?? []} rowKey={(i) => i.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the incidents.' : undefined} onRetry={reload}
          searchLabel="Search incidents" searchText={(i) => `${i.number} ${i.rider} ${i.type}`} emptyTitle="No incidents" empty="Riders report problems from the rider app."
          tools={<select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select>}
          actions={(i) => <Btn small onClick={() => setSel(i.id)}>Open</Btn>} />
        {sel && <IncidentPanel key={sel} id={sel} onChange={reload} />}
      </div>
    </>
  )
}
