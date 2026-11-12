import { useState } from 'react'

import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, Tabs, type Column } from '../components/ui'
import type { DocState, Rider, RiderDoc } from '../data/commerce'
import { distKm, posOf } from '../data/geo'
import { dateTime, kes } from '../lib/format'
import { isUnassigned, liveStatus, pickupArea, riderLoad, type RiderLive } from '../lib/dispatch'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { normalizePhone } from '../lib/phone'

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
const liveTone = (s: RiderLive | string) => (s === 'Online' ? 'green' : s === 'Busy' ? 'amber' : s === 'Suspended' || s === 'Rejected' ? 'red' : s === 'Pending' ? 'amber' : 'gray') as 'green' | 'amber' | 'red' | 'gray'
const docTone = (s: DocState) => (s === 'Valid' ? 'green' : s === 'Expiring' || s === 'Pending' ? 'amber' : 'red')
const riderId = (r: Rider) => `RD-${1000 + Number(r.id.replace(/\D/g, ''))}`

// ---- riders list --------------------------------------------------------------------------------------------

function InviteForm() {
  const { closeModal, toast, log } = useStore()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  return (
    <>
      <Field label="Mobile number" value={phone} onChange={(v) => { setPhone(v); setError('') }} placeholder="0712 345 678" error={error} hint="They’ll get a link to download the rider app and apply." />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={() => {
          const p = normalizePhone(phone)
          if (!p) return setError('Enter a valid Kenyan mobile number')
          log(`Invited rider · ${p}`, 'Riders', 'Access')
          closeModal()
          toast(`Invitation sent to ${p}`)
        }}>Send invitation</Btn>
      </div>
    </>
  )
}

export function RidersList() {
  const { riders, orders, can, openModal, toast } = useStore()
  const [tab, setTab] = useState<'All' | RiderLive>('All')
  const [zone, setZone] = useState('All zones')

  const team = riders.filter((r) => r.status !== 'Pending' && r.status !== 'Rejected')
  const withLive = team.map((r) => ({ r, load: riderLoad(orders, r.id), live: liveStatus(r, riderLoad(orders, r.id)) }))
  const waiting = orders.filter(isUnassigned)
  const nearest = (r: Rider) => (waiting.length ? Math.min(...waiting.map((o) => distKm(r.at, posOf(pickupArea(o))))) : null)
  const count = (s: RiderLive) => withLive.filter((x) => x.live === s).length
  const zones = [...new Set(team.map((r) => r.zone))].sort()
  const rows = withLive.filter((x) => (tab === 'All' || x.live === tab) && (zone === 'All zones' || x.r.zone === zone))

  type Row = (typeof withLive)[number]
  const columns: Column<Row>[] = [
    {
      key: 'rider', header: 'Rider', sort: (a, b) => a.r.name.localeCompare(b.r.name),
      render: ({ r }) => (
        <div className="person">
          <span className="avatar-tile">{initials(r.name)}</span>
          <div>
            <button className="link-btn" onClick={() => navigate(`/riders/${r.id}`)}>{r.name}</button>
            <div className="subtext">{`ID ${riderId(r)}`}</div>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', sort: (a, b) => a.live.localeCompare(b.live), render: ({ live }) => <Badge tone={liveTone(live)}>{live}</Badge> },
    { key: 'rating', header: 'Rating', sort: (a, b) => a.r.rating - b.r.rating, render: ({ r }) => `★ ${r.rating.toFixed(2)}` },
    { key: 'distance', header: 'Distance', sort: (a, b) => (nearest(a.r) ?? 99) - (nearest(b.r) ?? 99), render: ({ r, live }) => (live === 'Offline' || live === 'Suspended' || nearest(r) === null ? '—' : `${nearest(r)} km`) },
    { key: 'load', header: 'Active load', sort: (a, b) => a.load - b.load, render: ({ load }) => `${load}/3` },
    { key: 'zone', header: 'Zone', render: ({ r }) => r.zone },
  ]

  return (
    <>
      <PageHead
        title="Riders list"
        desc="Monitor rider availability, performance, and access."
        actions={
          <>
            <Btn disabled={!can('Riders', 'Export')} onClick={() => { downloadCsv('riders.csv', ['Rider', 'ID', 'Phone', 'Vehicle', 'Plate', 'Zone', 'Status', 'Rating', 'Deliveries'], rows.map(({ r, live }) => [r.name, riderId(r), r.phone, r.vehicle, r.plate, r.zone, live, r.rating, r.deliveries])); toast('Rider list exported') }}>Export riders</Btn>
            <Btn variant="primary" disabled={!can('Riders', 'Create')} onClick={() => openModal({ title: 'Invite rider', message: 'Send a rider application invitation by SMS.', body: <InviteForm />, noActions: true })}>Invite rider</Btn>
          </>
        }
      />
      <div className="tabs" style={{ padding: 0, margin: '0 0 13px' }} role="tablist">
        {([['All', 'All riders', team.length], ['Online', 'Online', count('Online')], ['Offline', 'Offline', count('Offline')], ['Busy', 'Busy', count('Busy')], ['Suspended', 'Suspended', count('Suspended')]] as const).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label} <b>{n}</b></button>
        ))}
      </div>
      <DataTable
        title="Rider directory"
        rows={rows}
        rowKey={({ r }) => r.id}
        columns={columns}
        searchLabel="Search riders"
        searchText={({ r }) => `${r.name} ${r.phone} ${r.plate} ${r.zone} ${riderId(r)}`}
        tools={<select className="select" aria-label="Zone" value={zone} onChange={(e) => setZone(e.target.value)}><option>All zones</option>{zones.map((z) => <option key={z}>{z}</option>)}</select>}
        actions={({ r }) => <Btn small onClick={() => navigate(`/riders/${r.id}`)}>View</Btn>}
      />
    </>
  )
}

// ---- rider detail ----------------------------------------------------------------------------------------------------

function MessageForm({ rider }: { rider: Rider }) {
  const { closeModal, toast, log } = useStore()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  return (
    <>
      <Field label="Message" multiline value={text} onChange={(v) => { setText(v); setError('') }} placeholder="Sent to the rider’s app as a notification" error={error} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={() => {
          if (text.trim().length < 3) return setError('Write a message first')
          log(`Messaged rider · ${rider.name}`, 'Riders')
          closeModal()
          toast(`Message sent to ${rider.name.split(' ')[0]}`)
        }}>Send message</Btn>
      </div>
    </>
  )
}

export function RiderDetail({ id }: { id: string }) {
  const { riders, setRiders, orders, can, openModal, openDrawer, closeDrawer, toast, log } = useStore()
  const [tab, setTab] = useState<'Overview' | 'Documents' | 'Performance' | 'Trip history'>('Overview')
  const rider = riders.find((r) => r.id === id)
  if (!rider) {
    return (
      <>
        <PageHead title="Rider detail" desc="That rider doesn’t exist." actions={<Btn onClick={() => navigate('/riders')}>Back to riders</Btn>} />
        <Notice tone="warning" mark="!">We couldn’t find this rider.</Notice>
      </>
    )
  }
  const edit = can('Riders', 'Edit')
  const mine = orders.filter((o) => o.riderId === rider.id)
  const done = mine.filter((o) => o.status === 'Delivered')
  const suspended = rider.status === 'Suspended'
  const live = liveStatus(rider, riderLoad(orders, rider.id))
  const update = (patch: Partial<Rider>) => setRiders(riders.map((r) => (r.id === rider.id ? { ...r, ...patch } : r)))
  const completion = mine.length ? Math.round((done.length / Math.max(1, mine.filter((o) => o.status !== 'Pending' && o.status !== 'Processing' && o.status !== 'Out for delivery').length)) * 1000) / 10 : 98.4
  const onTime = Math.round((94 + (rider.rating - 4.4) * 4) * 10) / 10

  const toggleSuspend = () =>
    openModal({
      title: suspended ? 'Reinstate rider?' : 'Suspend rider?',
      message: suspended ? `${rider.name.split(' ')[0]} will be able to go online and accept orders again.` : `${rider.name.split(' ')[0]} will be unable to accept new orders while suspended.`,
      confirm: suspended ? 'Reinstate' : 'Suspend',
      danger: !suspended,
      onConfirm: () => {
        update({ status: suspended ? 'Offline' : 'Suspended' })
        log(`${suspended ? 'Reinstated' : 'Suspended'} rider account · ${rider.name}`, 'Riders', 'Security')
        toast(suspended ? 'Rider reinstated' : 'Rider suspended')
      },
    })

  const setDoc = (key: string, state: DocState) => {
    update({ docs: rider.docs.map((d) => (d.key === key ? { ...d, state } : d)) })
    log(`${state === 'Valid' ? 'Verified' : 'Rejected'} ${rider.docs.find((d) => d.key === key)?.title} · ${rider.name}`, 'Riders')
    toast(state === 'Valid' ? 'Document verified' : 'Document sent back for resubmission')
  }

  const tripRows = (list: typeof mine) => list.map((o) => (
    <div className="setting-row" key={o.id}>
      <span><strong>{`${o.id} · ${o.pickup.split(', ')[1] ?? ''} → ${o.area}`}</strong><small>{`${o.status} · ${dateTime(o.placedAt)}`}</small></span>
      <b style={{ fontSize: 10 }}>{kes(o.fee)}</b>
    </div>
  ))

  return (
    <>
      <PageHead
        title="Rider detail"
        desc={`Rider ID ${riderId(rider)} · Joined ${rider.joined}`}
        actions={
          <>
            <Btn onClick={() => navigate('/riders')}>Back to riders</Btn>
            {rider.status !== 'Pending' && <Btn variant={suspended ? 'primary' : 'danger'} disabled={!edit} onClick={toggleSuspend}>{suspended ? 'Reinstate rider' : 'Suspend rider'}</Btn>}
            <Btn
              variant="primary"
              onClick={() =>
                openDrawer({
                  title: 'Rider actions',
                  body: (
                    <>
                      <SettingRow title="Message rider" sub="Sent as an app notification" right={<Btn small disabled={!edit} onClick={() => { closeDrawer(); openModal({ title: `Message ${rider.name}`, body: <MessageForm rider={rider} />, noActions: true }) }}>Write</Btn>} />
                      <SettingRow title="Call rider" sub={rider.phone} right={<a className="btn small" href={`tel:${rider.phone.replace(/\s/g, '')}`}>Call</a>} />
                      <SettingRow title="Cash held" sub="Open the cash deposit list" right={<Btn small onClick={() => { closeDrawer(); navigate('/payouts') }}>Open</Btn>} />
                    </>
                  ),
                })
              }>
              More actions
            </Btn>
          </>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(280px,.8fr)', alignItems: 'start' }}>
        <div className="grid">
          <section className="card panel">
            <div className="panel-head">
              <div className="person">
                <img src="/rider-profile.png" alt={rider.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '50%' }} />
                <div>
                  <h2 style={{ fontSize: 15 }}>{rider.name}</h2>
                  <div className="panel-sub">{`${rider.phone} · ${rider.name.split(' ')[0]!.toLowerCase()}.${rider.name.split(' ')[1]?.[0]?.toLowerCase() ?? 'm'}@example.com`}</div>
                  <div style={{ marginTop: 5 }}><Badge tone={liveTone(live)}>{live}</Badge> <span className="panel-sub">{`★ ${rider.rating.toFixed(2)} (${Math.round(rider.deliveries / 5)} reviews)`}</span></div>
                </div>
              </div>
              <a className="btn" href={`tel:${rider.phone.replace(/\s/g, '')}`}>Call rider</a>
            </div>
            <div className="grid stats" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', margin: '15px 0 0' }}>
              <Stat label="Completion" value={`${Math.min(100, completion)}%`} trend="Last 30 days" icon="✓" />
              <Stat label="On-time" value={`${Math.min(100, onTime)}%`} trend="Last 30 days" icon="◷" />
              <Stat label="Trips" value={rider.deliveries.toLocaleString('en-US')} trend="All time" icon="↗" />
              <Stat label="Earnings" value={kes(rider.earnings)} trend="This month" icon="$" />
            </div>
          </section>
          <section className="card panel">
            <div style={{ margin: '-4px -4px 12px' }}>
              <Tabs tabs={['Overview', 'Documents', 'Performance', 'Trip history'] as const} value={tab} onChange={setTab} />
            </div>
            {tab === 'Overview' && (
              <>
                <h2>Recent trips</h2>
                {tripRows(mine.slice(0, 3))}
                {mine.length === 0 && <div className="panel-sub" style={{ marginTop: 8 }}>No trips yet.</div>}
              </>
            )}
            {tab === 'Documents' &&
              rider.docs.map((d: RiderDoc) => (
                <div className="setting-row" key={d.key}>
                  <span><strong>{d.title}</strong><small>{d.note}</small></span>
                  <span className="actions">
                    <Badge tone={docTone(d.state)}>{d.state}</Badge>
                    {d.state !== 'Valid' && (
                      <>
                        <Btn small disabled={!edit} onClick={() => setDoc(d.key, 'Valid')}>Verify</Btn>
                        <Btn small variant="danger" disabled={!edit} onClick={() => setDoc(d.key, 'Rejected')}>Reject</Btn>
                      </>
                    )}
                  </span>
                </div>
              ))}
            {tab === 'Performance' &&
              [['Acceptance rate', Math.min(100, 90 + Math.round((rider.rating - 4.4) * 15))], ['Completion rate', Math.min(100, Math.round(completion))], ['On-time rate', Math.min(100, Math.round(onTime))]].map(([l, v]) => (
                <div className="setting-row" key={l}>
                  <span style={{ flex: 1 }}><strong>{l}</strong><div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${v}%` }} /></div></span>
                  <b style={{ fontSize: 10 }}>{`${v}%`}</b>
                </div>
              ))}
            {tab === 'Trip history' && (
              <>
                <h2>{`All trips (${mine.length})`}</h2>
                {tripRows(mine.slice(0, 12))}
                {mine.length === 0 && <div className="panel-sub" style={{ marginTop: 8 }}>No trips yet.</div>}
              </>
            )}
          </section>
        </div>
        <div className="grid">
          <Panel title="Verified documents">
            {rider.docs.slice(0, 3).map((d) => <SettingRow key={d.key} title={d.title} sub={d.state === 'Valid' ? 'Verified' : d.state} right={<Badge tone={docTone(d.state)}>{d.state === 'Valid' ? 'Active' : d.state}</Badge>} />)}
          </Panel>
          <Panel title="Vehicle">
            <div className="rider-card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <img src="/rider-motorbike.png" alt={`${rider.vehicle} for ${rider.name}`} style={{ borderRadius: 7, width: 65, height: 48, objectFit: 'cover' }} />
              <span><strong>{rider.vehicle === 'Motorbike' ? 'TVS HLX 150' : rider.vehicle}</strong><small>{`${rider.plate} · ${rider.vehicle}`}</small></span>
            </div>
          </Panel>
          <Panel title="Cash and earnings">
            <SettingRow title="Cash held" sub="Collected on delivery, not yet deposited" right={<b>{kes(rider.cashHeld)}</b>} />
            <SettingRow title="Earned this month" right={<span className="prod-name">{kes(rider.earnings)}</span>} />
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- application review ---------------------------------------------------------------------------------------------

function RejectForm({ rider }: { rider: Rider }) {
  const { riders, setRiders, closeModal, toast, log } = useStore()
  const [reason, setReason] = useState('National ID photo is unclear')
  const [note, setNote] = useState('')
  return (
    <>
      <Field label="Reason" value={reason} onChange={setReason} options={['National ID photo is unclear', 'Driving license expired', 'Insurance is missing', 'Selfie doesn’t match the ID', 'Other']} />
      <Field label="Message to the applicant (optional)" multiline value={note} onChange={setNote} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="danger" onClick={() => {
          setRiders(riders.map((r) => (r.id === rider.id ? { ...r, status: 'Rejected', reviewNote: note.trim() ? `${reason}. ${note.trim()}` : reason } : r)))
          log(`Rejected rider application · ${rider.name}`, 'Riders', 'Security')
          closeModal()
          toast(`${rider.name}’s application was rejected`)
        }}>Reject application</Btn>
      </div>
    </>
  )
}

const CHECKS: [string, string][] = [['Identity matches application', 'Name and face match'], ['Driving license valid', 'Document verified'], ['Vehicle photo matches details', 'Document verified'], ['Insurance is current', 'Document verified']]

export function Applications({ id }: { id?: string }) {
  const { riders, setRiders, can, openModal, openDrawer, toast, log } = useStore()
  const [tab, setTab] = useState<'Pending' | 'Reviewed'>('Pending')
  const [picked, setPicked] = useState<string>()
  const [checks, setChecks] = useState<Record<string, boolean[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const edit = can('Riders', 'Edit')

  const pending = riders.filter((r) => r.status === 'Pending')
  const reviewed = riders.filter((r) => r.status === 'Rejected' || (r.appliedAt && r.status !== 'Pending'))
  const current = pending.find((r) => r.id === (picked ?? id)) ?? pending[0]
  const ticked = current ? (checks[current.id] ?? [false, false, false, false]) : []

  const approve = (r: Rider) => {
    setRiders(riders.map((x) => (x.id === r.id ? { ...x, status: 'Offline', joined: 'This month', reviewNote: notes[r.id] || undefined, docs: x.docs.map((d) => ({ ...d, state: 'Valid' as const })) } : x)))
    log(`Approved rider · ${r.name}`, 'Riders', 'Access')
    toast(`${r.name} approved. They can go online now.`)
    setPicked(undefined)
  }

  return (
    <>
      <PageHead
        title="Rider application review"
        desc="Review the identity, license, and vehicle details before approval."
        actions={
          current && tab === 'Pending' ? (
            <>
              <Btn variant="danger" disabled={!edit} onClick={() => openModal({ title: 'Reject application', message: 'Choose a reason and send it to the applicant.', body: <RejectForm rider={current} />, noActions: true })}>Reject application</Btn>
              <Btn variant="primary" disabled={!edit || !ticked.every(Boolean)} onClick={() => openModal({ title: 'Approve rider application?', message: 'This rider will be activated and can start receiving orders.', confirm: 'Approve rider', onConfirm: () => approve(current) })}>Approve rider</Btn>
            </>
          ) : undefined
        }
      />
      <section className="card" style={{ marginBottom: 14 }}>
        <Tabs tabs={['Pending', 'Reviewed'] as const} value={tab} onChange={setTab} />
      </section>

      {tab === 'Pending' && !current && <Notice mark="✓" tone="success">No applications waiting. You’re all caught up.</Notice>}
      {tab === 'Pending' && current && (
        <>
          {pending.length > 1 && (
            <div className="actions" style={{ marginBottom: 12 }}>
              {pending.map((r) => <button key={r.id} className={`pill ${r.id === current.id ? 'active' : ''}`} onClick={() => setPicked(r.id)}>{r.name}</button>)}
            </div>
          )}
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(280px,.8fr)', alignItems: 'start' }}>
            <div className="grid">
              <section className="card panel">
                <div className="panel-head">
                  <div className="person">
                    <img src="/rider-profile.png" alt="Applicant portrait" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '50%' }} />
                    <div>
                      <h2 style={{ fontSize: 15 }}>{current.name}</h2>
                      <div className="panel-sub">{`Application RAPP-${2000 + Number(current.id.replace(/\D/g, ''))} · Submitted ${dateTime(current.appliedAt ?? 0)}`}</div>
                    </div>
                  </div>
                  <Badge tone="amber">Review</Badge>
                </div>
                <div className="split-2">
                  <div><div className="panel-sub" style={{ marginBottom: 6 }}>Applicant ID portrait</div><img className="review-photo" src="/rider-profile.png" alt="Rider profile portrait" /></div>
                  <div><div className="panel-sub" style={{ marginBottom: 6 }}>Vehicle photo</div><img className="review-photo" src="/rider-motorbike.png" alt="Applicant delivery motorbike" /></div>
                </div>
              </section>
              <section className="card panel">
                <div className="panel-head">
                  <div>
                    <h2>Identity documents</h2>
                    <div className="panel-sub">Uploaded for verification</div>
                  </div>
                  <Btn small onClick={() => openDrawer({ title: 'Document viewer', body: <><Notice>Full-size preview of the uploaded documents.</Notice><img src="/rider-profile.png" alt="Uploaded identity document" style={{ width: '100%', borderRadius: 8, marginTop: 12 }} /></> })}>View full size</Btn>
                </div>
                <div className="split-2">
                  {current.docs.slice(0, 2).map((d) => (
                    <div className="doc-preview" key={d.key}>
                      <span className="doc-icon">ID</span>
                      <span>
                        <strong style={{ fontSize: 10 }}>{d.title}</strong>
                        <small className="subtext" style={{ display: 'block' }}>{d.key === 'id' ? 'Kenya ID · ends 4821' : 'Class A · Valid to 2027'}</small>
                        <small style={{ display: 'block', color: d.state === 'Valid' ? 'var(--green)' : 'var(--amber)', fontSize: 9, marginTop: 3 }}>{d.state === 'Valid' ? '✓ Verified' : '✓ Image clear'}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="grid">
              <Panel title="Applicant details">
                <SettingRow title="Full name" sub={current.name} />
                <SettingRow title="Phone number" sub={current.phone} />
                <SettingRow title="Vehicle" sub={`${current.vehicle}${current.plate !== '—' ? ` · ${current.plate}` : ''}`} />
                <SettingRow title="Insurance" sub="Valid to 18 Nov 2026" right={<Badge tone="green">Active</Badge>} />
              </Panel>
              <Panel title="Review checklist">
                {CHECKS.map(([t, s], i) => (
                  <label className="setting-row" key={t}>
                    <span><strong>{t}</strong><small>{s}</small></span>
                    <input type="checkbox" className="check" checked={ticked[i] ?? false} disabled={!edit} onChange={(e) => setChecks({ ...checks, [current.id]: ticked.map((v, k) => (k === i ? e.target.checked : v)) })} />
                  </label>
                ))}
                <Field label="Internal review note" multiline value={notes[current.id] ?? ''} onChange={(v) => setNotes({ ...notes, [current.id]: v })} placeholder="Add a note for the audit log" />
                {!ticked.every(Boolean) && <div className="panel-sub">Tick every item to enable approval.</div>}
              </Panel>
            </div>
          </div>
        </>
      )}

      {tab === 'Reviewed' && (
        <section className="card table-card">
          <div className="table-head"><h2>Reviewed applications</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Applicant</th><th>Vehicle</th><th>Zone</th><th>Outcome</th><th>Note</th></tr></thead>
              <tbody>
                {reviewed.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.name}</b></td><td>{r.vehicle}</td><td>{r.zone}</td>
                    <td><Badge tone={r.status === 'Rejected' ? 'red' : 'green'}>{r.status === 'Rejected' ? 'Rejected' : 'Approved'}</Badge></td>
                    <td>{r.reviewNote ?? '—'}</td>
                  </tr>
                ))}
                {reviewed.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>No reviewed applications yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
