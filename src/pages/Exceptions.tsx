import { useState } from 'react'

import { MapView } from '../components/MapView'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { zoneOf } from '../data/geo'
import { INCIDENT_TYPES, type Incident, type IncidentStatus, type Severity } from '../data/ops'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

interface Exception {
  id: string
  orderId: string
  customer: string
  rider: string
  reason: string
  zone: string
  kind: 'Cancelled' | 'Failed'
  at: number
  resolved: boolean
  refunded: boolean
  fromOrder: boolean
}

// ---- cancelled and failed deliveries ----------------------------------------------------------------------

export function FailedDeliveries() {
  const { failures, setFailures, orders, setOrders, riders, openDrawer, closeDrawer, toast, log, can } = useStore()
  const [tab, setTab] = useState<'All' | 'Cancelled' | 'Failed' | 'Refunded'>('All')
  const [reason, setReason] = useState('All reasons')
  const [date, setDate] = useState('')
  const edit = can('Dispatch', 'Edit')

  const fromOrders: Exception[] = orders
    .filter((o) => o.status === 'Cancelled' || o.status === 'Refunded')
    .filter((o) => !failures.some((f) => f.orderId === o.id))
    .map((o) => ({
      id: `O-${o.id}`, orderId: o.id, customer: o.customer, rider: riders.find((r) => r.id === o.riderId)?.name ?? '—',
      reason: o.events.find((e) => e.note && (e.status === 'Cancelled' || e.status === 'Refunded'))?.note ?? 'Customer asked to cancel', zone: zoneOf(o.area), kind: 'Cancelled' as const,
      at: o.events[o.events.length - 1]!.at, resolved: true, refunded: o.pay === 'Refunded', fromOrder: true,
    }))
  const fromFailures: Exception[] = failures.map((f) => ({ ...f, refunded: orders.find((o) => o.id === f.orderId)?.pay === 'Refunded', fromOrder: false }))
  const all = [...fromFailures, ...fromOrders].sort((a, b) => b.at - a.at)
  const reasons = ['All reasons', ...new Set(all.map((e) => e.reason))]
  const rows = all.filter((e) => (tab === 'All' || (tab === 'Refunded' ? e.refunded : e.kind === tab)) && (reason === 'All reasons' || e.reason === reason) && (!date || new Date(e.at).toLocaleDateString('en-CA') === date))

  const dayStart = new Date().setHours(0, 0, 0, 0)
  const today = all.filter((e) => e.at >= dayStart)
  const refundedToday = orders.filter((o) => o.refunded > 0).reduce((n, o) => n + o.refunded, 0)

  const review = (e: Exception) => {
    const order = orders.find((o) => o.id === e.orderId)
    openDrawer({
      title: `Delivery ${e.orderId}`,
      body: (
        <>
          <Notice tone={e.kind === 'Failed' ? 'error' : 'warning'} mark="!">{`${e.kind} · ${e.reason}`}</Notice>
          <SettingRow title="Customer" sub={e.customer} />
          <SettingRow title="Rider" sub={e.rider} />
          <SettingRow title="Zone and time" sub={`${e.zone} · ${dateTime(e.at)}`} />
          {order && <SettingRow title="Order value" sub={`${order.method} · ${order.pay}`} right={<b>{kes(order.total)}</b>} />}
          <div className="actions" style={{ marginTop: 16 }}>
            {order && <Btn onClick={() => { closeDrawer(); navigate(`/orders/${order.id}`) }}>Open order</Btn>}
            {order && order.pay === 'Paid' && order.refunded === 0 && (
              <Btn disabled={!edit} onClick={() => {
                setOrders(orders.map((o) => (o.id === order.id ? { ...o, pay: 'Refunded', refunded: o.total, status: o.status === 'Delivered' ? 'Refunded' : o.status, events: [...o.events, { status: 'Refunded', at: Date.now(), by: 'Dispatch', note: `Full refund · ${e.reason}` }] } : o)))
                log(`Refunded ${order.id} after failed delivery`, 'Orders', 'Refund')
                closeDrawer()
                toast(`${kes(order.total)} refunded`)
              }}>Issue refund</Btn>
            )}
            {!e.fromOrder && !e.resolved && (
              <Btn variant="primary" disabled={!edit} onClick={() => { setFailures(failures.map((f) => (f.id === e.id ? { ...f, resolved: true } : f))); log(`Resolved delivery exception · ${e.orderId}`, 'Orders'); closeDrawer(); toast('Marked as resolved') }}>Mark resolved</Btn>
            )}
          </div>
        </>
      ),
    })
  }

  const columns: Column<Exception>[] = [
    { key: 'order', header: 'Order', sort: (a, b) => a.at - b.at, render: (e) => <div><strong>{e.orderId}</strong><div className="subtext">{dateTime(e.at)}</div></div> },
    { key: 'customer', header: 'Customer', sort: (a, b) => a.customer.localeCompare(b.customer), render: (e) => e.customer },
    { key: 'rider', header: 'Rider', render: (e) => e.rider },
    { key: 'reason', header: 'Failure reason', sort: (a, b) => a.reason.localeCompare(b.reason), render: (e) => e.reason },
    { key: 'zone', header: 'Zone', render: (e) => e.zone },
    { key: 'status', header: 'Status', render: (e) => <Badge tone={e.kind === 'Failed' ? 'red' : 'gray'}>{e.kind}</Badge> },
  ]

  return (
    <>
      <PageHead title="Cancelled and failed deliveries" desc="Review unsuccessful deliveries, reasons, and recovery actions." actions={<Btn onClick={() => { downloadCsv('delivery-exceptions.csv', ['Order', 'Customer', 'Rider', 'Reason', 'Zone', 'Type', 'When'], rows.map((e) => [e.orderId, e.customer, e.rider, e.reason, e.zone, e.kind, new Date(e.at).toISOString()])); toast('Delivery report exported') }}>Export report</Btn>} />
      <div className="tabs" style={{ padding: 0, margin: '0 0 13px' }} role="tablist">
        {(['All', 'Cancelled', 'Failed', 'Refunded'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'All' ? 'All exceptions' : t} <b>{t === 'All' ? all.length : t === 'Refunded' ? all.filter((e) => e.refunded).length : all.filter((e) => e.kind === t).length}</b>
          </button>
        ))}
      </div>
      <div className="grid stats" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <Stat label="Exceptions today" value={String(today.length)} trend="Cancelled and failed" icon="×" up={today.length === 0} />
        <Stat label="Customer cancelled" value={String(today.filter((e) => e.kind === 'Cancelled').length)} trend="Before handoff" icon="!" up={false} />
        <Stat label="Failed delivery" value={String(failures.filter((f) => f.kind === 'Failed' && !f.resolved).length)} trend="Requires follow-up" icon="↗" up={false} />
        <Stat label="Refunds issued" value={kes(refundedToday)} trend="All time in demo data" icon="$" />
      </div>
      <DataTable
        title="Delivery exceptions"
        rows={rows}
        rowKey={(e) => e.id}
        columns={columns}
        searchLabel="Search order"
        searchText={(e) => `${e.orderId} ${e.customer} ${e.rider} ${e.reason}`}
        tools={
          <>
            <input className="select" type="date" aria-label="Filter exceptions by date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select className="select" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map((r) => <option key={r}>{r}</option>)}</select>
          </>
        }
        actions={(e) => <Btn small onClick={() => review(e)}>Review</Btn>}
      />
    </>
  )
}

// ---- incidents and SOS ---------------------------------------------------------------------------------------------

const sevTone = (s: Severity) => (s === 'Critical' ? 'red' : s === 'High' ? 'amber' : 'gray')
const statTone = (s: IncidentStatus) => (s === 'Open' ? 'red' : s === 'Investigating' ? 'amber' : 'green')

function ReportForm() {
  const { riders, incidents, setIncidents, closeModal, toast, log } = useStore()
  const team = riders.filter((r) => r.status === 'Online' || r.status === 'Offline')
  const [rid, setRid] = useState(team[0]!.id)
  const [type, setType] = useState<string>(INCIDENT_TYPES[0])
  const [severity, setSeverity] = useState<Severity>('Medium')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  return (
    <>
      <Field label="Rider" value={rid} onChange={setRid} options={team.map((r) => ({ value: r.id, label: r.name }))} />
      <div className="form-grid">
        <Field label="Incident type" value={type} onChange={setType} options={INCIDENT_TYPES} />
        <Field label="Severity" value={severity} onChange={(v) => setSeverity(v as Severity)} options={['Medium', 'High', 'Critical']} />
      </div>
      <Field label="What happened" multiline value={text} onChange={(v) => { setText(v); setError('') }} error={error} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={() => {
          if (text.trim().length < 5) return setError('Describe what happened')
          const r = riders.find((x) => x.id === rid)!
          const at = Date.now()
          const id = `INC-${300 + incidents.length}`
          setIncidents([{ id, riderId: rid, rider: r.name, type, zone: zoneOf(r.zone), at, severity, status: 'Open', pos: r.at, sos: false, log: [{ at, by: 'Dispatch', text: text.trim() }] }, ...incidents])
          log(`Logged incident ${id} · ${r.name}`, 'Riders', 'Security')
          closeModal()
          toast(`${id} logged`)
        }}>Log incident</Btn>
      </div>
    </>
  )
}

function Respond({ id }: { id: string }) {
  const { incidents, setIncidents, riders, closeDrawer, toast, log, can } = useStore()
  const inc = incidents.find((i) => i.id === id)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  if (!inc) return null
  const rider = riders.find((r) => r.id === inc.riderId)
  const edit = can('Riders', 'Edit')
  const update = (status: IncidentStatus, text: string) => {
    const at = Date.now()
    setIncidents(incidents.map((i) => (i.id === id ? { ...i, status, log: [...i.log, { at, by: 'You', text }] } : i)))
    log(`${status === 'Resolved' ? 'Resolved' : 'Updated'} ${id}`, 'Riders', 'Security')
    toast(`${id} ${status === 'Resolved' ? 'resolved' : 'updated'}`)
  }
  return (
    <>
      <Notice tone={inc.severity === 'Critical' ? 'error' : 'warning'} mark="!">{`${inc.severity} · ${inc.type} · ${inc.zone}`}</Notice>
      <SettingRow title="Rider" sub={rider ? `${rider.name} · ${rider.phone}` : inc.rider} right={rider && <a className="btn small" href={`tel:${rider.phone.replace(/\s/g, '')}`}>Call rider</a>} />
      <SettingRow title="Status" right={<Badge tone={statTone(inc.status)}>{inc.status}</Badge>} />
      <div className="nav-label" style={{ paddingLeft: 0, marginTop: 10 }}>Activity</div>
      {inc.log.map((l, i) => <SettingRow key={i} title={l.text} sub={`${l.by} · ${dateTime(l.at)}`} />)}
      {inc.status !== 'Resolved' && (
        <>
          <Field label="Add a note" multiline value={note} onChange={(v) => { setNote(v); setError('') }} error={error} placeholder="Actions taken, who was contacted…" />
          <div className="actions">
            {inc.status === 'Open' && <Btn disabled={!edit} onClick={() => update('Investigating', note.trim() || 'Dispatch is investigating')}>Start investigating</Btn>}
            <Btn disabled={!edit} onClick={() => { if (note.trim().length < 3) return setError('Add a note first'); update(inc.status, note.trim()); setNote('') }}>Add note</Btn>
            <Btn variant="primary" disabled={!edit} onClick={() => { if (note.trim().length < 3) return setError('Add a closing note first'); update('Resolved', `Resolved: ${note.trim()}`); closeDrawer() }}>Resolve</Btn>
          </div>
        </>
      )}
    </>
  )
}

export function Incidents() {
  const { incidents, riders, openDrawer, openModal, toast, can } = useStore()
  const [severity, setSeverity] = useState('All severity')
  const [status, setStatus] = useState('All statuses')
  const sos = incidents.filter((i) => i.sos && i.status === 'Open')
  const rows = incidents.filter((i) => (severity === 'All severity' || i.severity === severity) && (status === 'All statuses' || i.status === status))
  const respond = (i: Incident) => openDrawer({ title: i.sos ? `Active SOS · ${i.rider}` : `Incident ${i.id}`, body: <Respond id={i.id} /> })

  const columns: Column<Incident>[] = [
    { key: 'ref', header: 'Reference', render: (i) => <strong>{i.id}</strong> },
    { key: 'rider', header: 'Rider', sort: (a, b) => a.rider.localeCompare(b.rider), render: (i) => i.rider },
    { key: 'type', header: 'Incident type', render: (i) => i.type },
    { key: 'zone', header: 'Zone', render: (i) => i.zone },
    { key: 'at', header: 'Reported', sort: (a, b) => a.at - b.at, render: (i) => dateTime(i.at) },
    { key: 'sev', header: 'Severity', render: (i) => <Badge tone={sevTone(i.severity)}>{i.severity}</Badge> },
    { key: 'status', header: 'Status', render: (i) => <Badge tone={statTone(i.status)}>{i.status}</Badge> },
  ]

  return (
    <>
      <PageHead
        title="Rider incident reports and SOS alerts"
        desc="Respond to urgent rider safety issues and review incident history."
        actions={
          <>
            <Btn onClick={() => openDrawer({ title: 'Emergency response protocol', body: <Protocol /> })}>Emergency protocol</Btn>
            <Btn disabled={!can('Riders', 'Create')} onClick={() => openModal({ title: 'Log an incident', message: 'Record something a rider reported by phone.', body: <ReportForm />, noActions: true })}>Log incident</Btn>
            <Btn onClick={() => { downloadCsv('incidents.csv', ['Reference', 'Rider', 'Type', 'Zone', 'Reported', 'Severity', 'Status'], rows.map((i) => [i.id, i.rider, i.type, i.zone, new Date(i.at).toISOString(), i.severity, i.status])); toast('Incident list exported') }}>Export incidents</Btn>
          </>
        }
      />
      {sos.map((i) => (
        <div className="incident-banner" key={i.id}>
          <div>
            <strong>1 active SOS alert</strong>
            <span>{`${i.rider} · ${i.type} reported ${dateTime(i.at)} · ${i.zone}`}</span>
          </div>
          <button className="btn danger" onClick={() => respond(i)}>Respond now</button>
        </div>
      ))}
      {sos.length === 0 && <div style={{ marginBottom: 13 }}><Notice mark="✓" tone="success">No active SOS alerts.</Notice></div>}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(280px,.8fr)', alignItems: 'start', marginBottom: 13 }}>
        <Panel title="Incident locations" sub="Active SOS and incidents reported today" right={<Badge tone="green">Live</Badge>}>
          <MapView
            height={330}
            pins={[
              ...incidents.filter((i) => i.status !== 'Resolved').map((i) => ({ id: i.id, at: i.pos, kind: 'sos' as const, label: i.sos ? 'SOS' : '!', title: `${i.id} · ${i.type}`, onClick: () => respond(i) })),
              ...riders.filter((r) => r.status === 'Online').slice(0, 4).map((r) => ({ id: r.id, at: r.at, kind: 'rider' as const, label: r.name[0]!, title: r.name })),
            ]}
          />
        </Panel>
        <Panel title="Emergency contact" sub="ShopCore safety desk" right={<Badge tone="red">24/7</Badge>}>
          <SettingRow title="Safety hotline" sub="+254 700 555 911" right={<a className="btn small" href="tel:+254700555911">Call</a>} />
          <SettingRow title="On-duty dispatcher" sub="Amara Mwangi · Nairobi Central" right={<Badge tone="green">Available</Badge>} />
          <div style={{ marginTop: 12 }}><Notice tone="warning" mark="!">For active SOS alerts, contact emergency services first, then coordinate rider support.</Notice></div>
        </Panel>
      </div>
      <DataTable
        title="Incident and SOS log"
        rows={rows}
        rowKey={(i) => i.id}
        columns={columns}
        searchLabel="Search incidents"
        searchText={(i) => `${i.id} ${i.rider} ${i.type} ${i.zone}`}
        tools={
          <>
            <select className="select" aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>{['All severity', 'Critical', 'High', 'Medium'].map((s) => <option key={s}>{s}</option>)}</select>
            <select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>{['All statuses', 'Open', 'Investigating', 'Resolved'].map((s) => <option key={s}>{s}</option>)}</select>
          </>
        }
        actions={(i) => <Btn small onClick={() => respond(i)}>{i.status === 'Resolved' ? 'View' : 'Respond'}</Btn>}
      />
    </>
  )
}

function Protocol() {
  const steps = [
    ['Stay on the line', 'Call the rider and keep them talking. Ask if they are safe and where they are.'],
    ['Call emergency services', 'If anyone is hurt or in danger, call 999 or 112 with the live location from the map.'],
    ['Alert the safety desk', 'Call the ShopCore safety hotline and tell them the incident reference.'],
    ['Protect the order', 'Reassign the delivery and tell the customer there will be a short delay.'],
    ['Record everything', 'Add each action as a note on the incident so the timeline is complete.'],
  ]
  return (
    <>
      <Notice tone="warning" mark="!">Safety first. Orders and money come second.</Notice>
      <div style={{ marginTop: 12 }}>
        {steps.map(([t, d], i) => <SettingRow key={t} title={`${i + 1}. ${t}`} sub={d} />)}
      </div>
    </>
  )
}
