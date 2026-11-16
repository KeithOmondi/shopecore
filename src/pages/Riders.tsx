import { useEffect, useState } from 'react'

import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, openFile, post, put } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

export interface ApiRider {
  id: string; phone: string; name: string; email: string; nationalId: string; kraPin?: string; emergency?: { name: string; relation: string; phone: string }; county: string; vehicle: 'Motorbike' | 'Bicycle' | 'Car'; plate: string; zoneId: string | null; zone: string | null
  status: 'pending' | 'approved' | 'rejected' | 'suspended'; availability: 'online' | 'offline'; rating: number; deliveries: number; cashHeldCents: number; earningsBalanceCents: number
  activeDeliveries: number; appliedAt: string; joinedAt: string; reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null
  location: { lat: number; lng: number; at: string | null } | null; version: number
}
interface RiderDetailData extends ApiRider {
  documents: { key: string; title: string; state: 'pending' | 'valid' | 'rejected' | 'expired'; note: string; fileRef: string | null; expiresOn: string | null; reviewedBy: string | null }[]
  recentDeliveries: { id: string; order: string; status: string; at: string; fareCents: number }[]
}

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
type Live = 'Online' | 'Busy' | 'Offline' | 'Suspended'
const liveOf = (r: ApiRider): Live => (r.status === 'suspended' ? 'Suspended' : r.availability === 'offline' ? 'Offline' : r.activeDeliveries >= 3 ? 'Busy' : 'Online')
const liveTone = (l: Live) => (l === 'Online' ? 'green' : l === 'Busy' ? 'amber' : l === 'Suspended' ? 'red' : 'gray')
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?'

// ---- directory --------------------------------------------------------------------------------------------------------

export function RidersList() {
  const { can, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: ApiRider[]; counts: Record<string, number> }>('/v1/admin/riders?limit=200', 30_000)
  const [tab, setTab] = useState<'All' | Live>('All')
  const [zone, setZone] = useState('All zones')
  const team = (data?.items ?? []).filter((r) => r.status === 'approved' || r.status === 'suspended')
  const withLive = team.map((r) => ({ r, live: liveOf(r) }))
  const count = (s: Live) => withLive.filter((x) => x.live === s).length
  const zones = [...new Set(team.map((r) => r.zone).filter(Boolean) as string[])].sort()
  const rows = withLive.filter((x) => (tab === 'All' || x.live === tab) && (zone === 'All zones' || x.r.zone === zone))
  type Row = (typeof withLive)[number]
  const columns: Column<Row>[] = [
    { key: 'rider', header: 'Rider', sort: (a, b) => a.r.name.localeCompare(b.r.name), render: ({ r }) => <div className="person"><span className="avatar-tile">{initialsOf(r.name)}</span><div><button className="link-btn" onClick={() => navigate(`/riders/${r.id}`)}>{r.name}</button><div className="subtext">{r.phone}</div></div></div> },
    { key: 'status', header: 'Status', sort: (a, b) => a.live.localeCompare(b.live), render: ({ live }) => <Badge tone={liveTone(live)}>{live}</Badge> },
    { key: 'rating', header: 'Rating', sort: (a, b) => a.r.rating - b.r.rating, render: ({ r }) => (r.deliveries ? `★ ${r.rating.toFixed(2)}` : '—') },
    { key: 'vehicle', header: 'Vehicle', render: ({ r }) => `${r.vehicle}${r.plate ? ` · ${r.plate}` : ''}` },
    { key: 'load', header: 'Active load', sort: (a, b) => a.r.activeDeliveries - b.r.activeDeliveries, render: ({ r }) => `${r.activeDeliveries}/3` },
    { key: 'cash', header: 'Cash held', sort: (a, b) => a.r.cashHeldCents - b.r.cashHeldCents, render: ({ r }) => kes(shillings(r.cashHeldCents)) },
    { key: 'zone', header: 'Zone', render: ({ r }) => r.zone ?? '—' },
  ]
  const pending = data?.counts.pending ?? 0
  return (
    <>
      <PageHead title="Riders list" desc="Monitor rider availability, performance, and access."
        actions={<>
          {pending > 0 && <Btn onClick={() => navigate('/riders/applications')}>{`${pending} application${pending === 1 ? '' : 's'} to review`}</Btn>}
          <Btn onClick={reload}>Refresh</Btn>
          <Btn disabled={!can('Riders', 'Export') || !team.length} onClick={() => { downloadCsv('riders.csv', ['Rider', 'Phone', 'Vehicle', 'Plate', 'Zone', 'Status', 'Rating', 'Deliveries', 'Cash held (KES)'], team.map((r) => [r.name, r.phone, r.vehicle, r.plate, r.zone ?? '', liveOf(r), r.rating, r.deliveries, shillings(r.cashHeldCents)])); toast('Riders exported') }}>Export</Btn>
        </>} />
      <div className="tabs" style={{ padding: 0, margin: '0 0 13px' }} role="tablist">
        {([['All', 'All riders', team.length], ['Online', 'Online', count('Online')], ['Offline', 'Offline', count('Offline')], ['Busy', 'Busy', count('Busy')], ['Suspended', 'Suspended', count('Suspended')]] as const).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id as typeof tab)}>{label} <b>{n}</b></button>
        ))}
      </div>
      <DataTable title="Rider directory" rows={rows} rowKey={({ r }) => r.id} columns={columns} loading={loading} error={failed && !data ? 'We couldn’t load the riders.' : undefined} onRetry={reload}
        searchLabel="Search riders" searchText={({ r }) => `${r.name} ${r.phone} ${r.plate} ${r.zone ?? ''}`} emptyTitle="No riders yet" empty="Riders sign up in the rider app. Approved riders appear here."
        tools={<select className="select" aria-label="Zone" value={zone} onChange={(e) => setZone(e.target.value)}><option>All zones</option>{zones.map((z) => <option key={z}>{z}</option>)}</select>}
        actions={({ r }) => <Btn small onClick={() => navigate(`/riders/${r.id}`)}>View</Btn>} />
    </>
  )
}

// ---- one rider --------------------------------------------------------------------------------------------------------

function ReasonForm({ title, label, confirm, onSubmit }: { title: string; label: string; confirm: string; onSubmit: (text: string) => Promise<string | null> }) {
  const { closeModal, toast } = useStore()
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (text.trim().length < 3) return setErr('Write a short reason')
    setBusy(true)
    const e = await onSubmit(text.trim())
    setBusy(false)
    if (e) return setErr(e)
    closeModal()
    toast(title)
  }
  return (
    <>
      <Field label={label} multiline value={text} onChange={(v) => { setText(v); setErr('') }} error={err} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={() => void go()}>{confirm}</Btn></div>
    </>
  )
}

/** What customers said about this rider, newest first. */
function RiderReviews({ id }: { id: string }) {
  const { data, failed } = useGet<{ average: number; count: number; fiveStarStreak: number; items: { stars: number; comment: string; customer: string; order: string; at: string }[] }>(`/v1/admin/riders/${id}/ratings?limit=30`)
  return (
    <Panel title="Customer ratings" sub={data ? (data.count ? `${data.average.toFixed(2)} average from ${data.count} rating${data.count === 1 ? '' : 's'}` : 'No ratings yet') : failed ? 'We couldn’t load the ratings.' : 'Loading…'}>
      {data?.items.map((x) => (
        <div className="list-row" key={`${x.order}-${x.at}`}><span><strong>{'★'.repeat(x.stars)}{'☆'.repeat(5 - x.stars)} · {x.customer} · {x.order}</strong><small>{x.comment || 'No comment'} · {dateTime(Date.parse(x.at))}</small></span></div>
      ))}
    </Panel>
  )
}

export function RiderDetail({ id }: { id: string }) {
  const { can, openModal, toast } = useStore()
  const { data: r, failed, reload } = useGet<RiderDetailData>(`/v1/admin/riders/${id}`)
  const [busy, setBusy] = useState(false)
  if (!r) return <PageHead title="Rider" desc={failed ? 'We couldn’t load this rider.' : 'Loading…'} actions={<Btn onClick={() => navigate('/riders')}>Back to riders</Btn>} />
  const edit = can('Riders', 'Edit')
  const act = async (body: unknown, done: string): Promise<string | null> => {
    setBusy(true)
    try { await post(`/v1/admin/riders/${id}/actions`, body); toast(done); reload(); return null } catch (e) { return says(e) } finally { setBusy(false) }
  }
  const review = async (key: string, state: 'valid' | 'rejected', note = '') => {
    try { await put(`/v1/admin/riders/${id}/documents/${key}`, { state, note }); toast(state === 'valid' ? 'Document accepted' : 'Document rejected'); reload() } catch (e) { toast(says(e)) }
  }
  return (
    <>
      <PageHead title={r.name} desc={`${r.vehicle}${r.plate ? ` · ${r.plate}` : ''} · ${r.zone ?? 'No zone'}`}
        actions={<>
          <Btn onClick={() => navigate('/riders')}>Back to riders</Btn>
          {r.status === 'pending' && <Btn variant="primary" disabled={!edit || busy} onClick={() => void act({ action: 'approve' }, 'Rider approved')}>Approve</Btn>}
          {r.status === 'approved' && <Btn variant="danger" disabled={!edit || busy} onClick={() => openModal({ title: 'Suspend rider', body: <ReasonForm title="Rider suspended" label="Why are you suspending them?" confirm="Suspend" onSubmit={(t) => act({ action: 'suspend', reason: t }, 'Rider suspended')} />, noActions: true })}>Suspend</Btn>}
          {r.status === 'suspended' && <Btn variant="primary" disabled={!edit || busy} onClick={() => void act({ action: 'reinstate' }, 'Rider reinstated')}>Reinstate</Btn>}
        </>} />
      {r.status === 'suspended' && r.reviewNote && <Notice tone="warning" mark="!">{`Suspended: ${r.reviewNote}`}</Notice>}
      <div className="tile-row" style={{ marginTop: 12 }}>
        <Stat label="Status" value={r.status === 'approved' ? liveOf(r) : r.status[0]!.toUpperCase() + r.status.slice(1)} trend={`${r.activeDeliveries} active`} icon="⌖" />
        <Stat label="Deliveries" value={String(r.deliveries)} trend={r.deliveries ? `★ ${r.rating.toFixed(2)}` : 'No ratings yet'} icon="▣" />
        <Stat label="Cash held" value={kes(shillings(r.cashHeldCents))} trend="To hand in" icon="◈" />
        <Stat label="Earnings balance" value={kes(shillings(r.earningsBalanceCents))} trend="Not yet paid out" icon="↗" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,.8fr)', alignItems: 'start', marginTop: 14 }}>
        <div className="grid">
          <Panel title="Identity and contact" sub="As the rider entered them">
            <div className="list-row"><span><strong>National ID number</strong><small>{r.nationalId || 'Not given'}</small></span></div>
            <div className="list-row"><span><strong>KRA PIN</strong><small>{r.kraPin || 'Not given'}</small></span></div>
            <div className="list-row"><span><strong>Emergency contact</strong><small>{r.emergency?.name ? `${r.emergency.name} (${r.emergency.relation}) · ${r.emergency.phone}` : 'Not given'}</small></span></div>
            <div className="list-row"><span><strong>Phone and email</strong><small>{r.phone}{r.email ? ` · ${r.email}` : ''}</small></span></div>
          </Panel>
          <Panel title="Documents" sub="Open each one and check it against the rider’s details before approving">
            {r.documents.map((d) => (
              <div className="list-row" key={d.key}>
                <span><strong>{d.title}</strong><small>{d.note || (d.expiresOn ? `Expires ${d.expiresOn}` : d.fileRef ? 'Uploaded' : 'Not uploaded yet')}{d.note && d.expiresOn ? ` · Expires ${d.expiresOn}` : ''}</small></span>
                <span className="sp-row">
                  {d.fileRef && d.fileRef.split(',').map((f, i, all) => <Btn small key={f} onClick={() => void openFile(`/v1/files/${f}`).catch(() => toast('Couldn’t open that file'))}>{all.length > 1 ? (i === 0 ? 'Front' : 'Back') : 'View'}</Btn>)}
                  <Badge tone={d.state === 'valid' ? 'green' : d.state === 'pending' ? 'amber' : 'red'}>{d.state}</Badge>
                  {edit && d.fileRef && d.state !== 'valid' && <Btn small onClick={() => void review(d.key, 'valid')}>Accept</Btn>}
                  {edit && d.fileRef && d.state !== 'rejected' && <Btn small onClick={() => openModal({ title: `Reject ${d.title}`, body: <ReasonForm title="Document rejected" label="What is wrong with it?" confirm="Reject" onSubmit={async (t) => { try { await put(`/v1/admin/riders/${id}/documents/${d.key}`, { state: 'rejected', note: t }); reload(); return null } catch (e) { return says(e) } }} />, noActions: true })}>Reject</Btn>}
                </span>
              </div>
            ))}
          </Panel>
          <RiderReviews id={id} />
          <section className="card table-card">
            <div className="table-head"><h2>Recent deliveries</h2></div>
            <div className="table-wrap"><table>
              <thead><tr><th>Order</th><th>When</th><th>Status</th><th>Fare</th></tr></thead>
              <tbody>
                {r.recentDeliveries.map((d) => <tr key={d.id}><td>{d.order}</td><td>{dateTime(Date.parse(d.at))}</td><td><Badge tone={d.status === 'delivered' ? 'green' : d.status === 'failed' ? 'red' : 'blue'}>{d.status.replace('_', ' ')}</Badge></td><td>{kes(shillings(d.fareCents))}</td></tr>)}
                {r.recentDeliveries.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 22, color: 'var(--muted)' }}>No deliveries yet.</td></tr>}
              </tbody>
            </table></div>
          </section>
        </div>
        <div className="grid">
          <Panel title="Contact"><SettingRow title="Phone" right={<span className="prod-name">{r.phone}</span>} /><SettingRow title="Email" right={<span className="prod-name">{r.email || '—'}</span>} /><SettingRow title="National ID" right={<span className="prod-name">{r.nationalId || '—'}</span>} /><SettingRow title="County" right={<span className="prod-name">{r.county || '—'}</span>} /></Panel>
          <Panel title="Account"><SettingRow title="Applied" right={<span className="prod-name">{dateTime(Date.parse(r.appliedAt))}</span>} />{r.reviewedAt && <SettingRow title="Reviewed" sub={r.reviewedBy ?? ''} right={<span className="prod-name">{dateTime(Date.parse(r.reviewedAt))}</span>} />}{r.location && <SettingRow title="Last seen" right={<span className="prod-name">{r.location.at ? dateTime(Date.parse(r.location.at)) : '—'}</span>} />}</Panel>
        </div>
      </div>
    </>
  )
}

// ---- applications -----------------------------------------------------------------------------------------------------

export function Applications({ id }: { id?: string }) {
  const { can } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: ApiRider[] }>('/v1/admin/riders?status=pending&limit=100')
  const rows = data?.items ?? []
  const cols: Column<ApiRider>[] = [
    { key: 'n', header: 'Applicant', render: (r) => <div><b>{r.name}</b><div className="subtext">{r.phone}</div></div> },
    { key: 'v', header: 'Vehicle', render: (r) => `${r.vehicle}${r.plate ? ` · ${r.plate}` : ''}` },
    { key: 'z', header: 'Zone', render: (r) => r.zone ?? '—' },
    { key: 'a', header: 'Applied', render: (r) => dateTime(Date.parse(r.appliedAt)) },
  ]
  useEffect(() => { if (id) navigate(`/riders/${id}`) }, [id])
  if (id) return null
  return (
    <>
      <PageHead title="Rider applications" desc="New riders waiting to be reviewed. Open one to check their documents and approve them." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <DataTable title="Waiting for review" rows={rows} rowKey={(r) => r.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the applications.' : undefined} onRetry={reload}
        searchLabel="Search applications" searchText={(r) => `${r.name} ${r.phone} ${r.plate}`} emptyTitle="No applications waiting" empty="New riders show up here after they sign up in the rider app."
        actions={(r) => <Btn small variant="primary" disabled={!can('Riders', 'Edit')} onClick={() => navigate(`/riders/${r.id}`)}>Review</Btn>} />
    </>
  )
}

