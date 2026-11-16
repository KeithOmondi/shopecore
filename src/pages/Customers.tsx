import { useEffect, useRef, useState } from 'react'

import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, get, patch, post } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

interface Row {
  id: string; name: string; email: string; phone: string; area: string; street: string; orders: number; spentCents: number
  segment: 'new' | 'returning'; lastOrderAt: string | null; joinedAt: string; version: number
}
interface Detail extends Row {
  addresses: { id: string; label: string; name: string; phone: string; county: string; area: string; street: string; isDefault: boolean }[]
  recentOrders: { id: string; number: string; totalCents: number; status: string; at: string }[]
  notes: { id: string; text: string; by: string; at: string }[]
}

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?'
const display = (c: { name: string; email: string; phone: string }) => c.name || c.email || c.phone || 'Customer'
const segmentLabel = (s: Row['segment']) => (s === 'returning' ? 'Returning' : 'New')
const statusTone = (s: string) => (s === 'Delivered' ? 'green' : s === 'Cancelled' ? 'red' : s === 'Pending' ? 'amber' : 'blue')

export function CustomersList() {
  const { toast, can } = useStore()
  const [rows, setRows] = useState<Row[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [segment, setSegment] = useState('All segments')
  const [more, setMore] = useState(false)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    const mine = ++seq.current
    const params = new URLSearchParams({ limit: '100' })
    if (segment !== 'All segments') params.set('segment', segment.toLowerCase())
    void get<{ items: Row[]; nextCursor: string | null }>(`/v1/admin/customers?${params}`).then(
      (r) => { if (mine === seq.current) { setRows(r.items); setNext(r.nextCursor); setState('ready') } },
      () => { if (mine === seq.current) setState((cur) => (cur === 'ready' ? cur : 'error')) },
    )
  }, [segment, tick])

  const loadMore = async () => {
    if (!next) return
    setMore(true)
    try {
      const params = new URLSearchParams({ limit: '100', cursor: next })
      if (segment !== 'All segments') params.set('segment', segment.toLowerCase())
      const r = await get<{ items: Row[]; nextCursor: string | null }>(`/v1/admin/customers?${params}`)
      setRows((x) => [...x, ...r.items])
      setNext(r.nextCursor)
    } catch (e) { toast(says(e)) } finally { setMore(false) }
  }

  const columns: Column<Row>[] = [
    {
      key: 'customer', header: 'Customer', sort: (a, b) => display(a).localeCompare(display(b)),
      render: (c) => (
        <div className="product-cell">
          <AvatarTile text={initialsOf(display(c))} />
          <div>
            <div className="prod-name">{display(c)}</div>
            <div className="subtext">{c.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (c) => c.phone },
    { key: 'area', header: 'Area', render: (c) => c.area || '—' },
    { key: 'orders', header: 'Orders', sort: (a, b) => a.orders - b.orders, render: (c) => c.orders },
    { key: 'spent', header: 'Total spent', sort: (a, b) => a.spentCents - b.spentCents, render: (c) => <b>{kes(shillings(c.spentCents))}</b> },
    { key: 'segment', header: 'Segment', sort: (a, b) => a.segment.localeCompare(b.segment), render: (c) => <Badge tone={c.segment === 'returning' ? 'green' : 'blue'}>{segmentLabel(c.segment)}</Badge> },
  ]

  return (
    <>
      <PageHead
        title="Customers list"
        desc="People who have signed up in the ShopCore app, with their orders and lifetime value."
        actions={
          <>
            <Btn onClick={() => setTick((n) => n + 1)}>Refresh</Btn>
            <Btn disabled={!can('Customers', 'Export') || !rows.length} onClick={() => { downloadCsv('customers.csv', ['Name', 'Email', 'Phone', 'Area', 'Orders', 'Total spent (KES)', 'Segment'], rows.map((c) => [c.name, c.email, c.phone, c.area, c.orders, shillings(c.spentCents), segmentLabel(c.segment)])); toast('Customers exported') }}>
              Export customers
            </Btn>
          </>
        }
      />
      <DataTable
        title="All customers"
        rows={rows}
        rowKey={(c) => c.id}
        columns={columns}
        loading={state === 'loading'}
        error={state === 'error' ? 'We couldn’t load the customers.' : undefined}
        onRetry={() => { setState('loading'); setTick((n) => n + 1) }}
        searchLabel="Search customers"
        emptyTitle="No customers yet"
        empty="Customers appear here when they sign up in the app."
        searchText={(c) => `${c.name} ${c.email} ${c.phone} ${c.area}`}
        tools={
          <select className="select" aria-label="Segment" value={segment} onChange={(e) => { setState('loading'); setSegment(e.target.value) }}>
            <option>All segments</option><option>Returning</option><option>New</option>
          </select>
        }
        actions={(c) => <Btn small onClick={() => navigate(`/customers/${c.id}`)}>View</Btn>}
      />
      {next && <div style={{ textAlign: 'center', margin: '12px 0' }}><Btn disabled={more} onClick={() => void loadMore()}>{more ? 'Loading…' : 'Load more customers'}</Btn></div>}
    </>
  )
}

function NoteForm({ customer, onSaved }: { customer: Detail; onSaved: (d: Detail) => void }) {
  const { closeModal, toast } = useStore()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (text.trim().length < 3) return setError('Write a note first')
    setBusy(true)
    try { onSaved(await post<Detail>(`/v1/admin/customers/${customer.id}/notes`, { text: text.trim() })); closeModal(); toast('Note added') } catch (e) { setError(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <Field label="Private note" multiline value={text} onChange={(v) => { setText(v); setError('') }} placeholder={`Add a private note to ${display(customer)}’s profile`} error={error} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" disabled={busy} onClick={() => void save()}>Save note</Btn>
      </div>
    </>
  )
}

function DetailsForm({ customer, onSaved }: { customer: Detail; onSaved: (d: Detail) => void }) {
  const { closeModal, toast } = useStore()
  const [name, setName] = useState(customer.name)
  const [area, setArea] = useState(customer.area)
  const [street, setStreet] = useState(customer.street)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { onSaved(await patch<Detail>(`/v1/admin/customers/${customer.id}`, { name: name.trim(), area: area.trim(), street: street.trim() })); closeModal(); toast('Customer updated') } catch (e) { setError(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Area" value={area} onChange={setArea} />
      <Field label="Street and landmark" value={street} onChange={(v) => { setStreet(v); setError('') }} error={error} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" disabled={busy} onClick={() => void save()}>Save</Btn>
      </div>
    </>
  )
}

export function CustomerDetail({ id }: { id: string }) {
  const { openModal, openDrawer, closeDrawer, can } = useStore()
  const [c, setC] = useState<Detail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  useEffect(() => {
    void get<Detail>(`/v1/admin/customers/${id}`).then(
      (d) => { setC(d); setState('ready') },
      (e) => setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error'),
    )
  }, [id])

  if (state === 'loading') return <PageHead title="Customer detail" desc="Loading…" actions={<Btn onClick={() => navigate('/customers')}>Back to customers</Btn>} />
  if (!c) {
    return (
      <>
        <PageHead title="Customer detail" desc={state === 'error' ? 'We couldn’t load this customer.' : 'That customer doesn’t exist.'} actions={<Btn onClick={() => navigate('/customers')}>Back to customers</Btn>} />
        <Notice tone="warning" mark="!">{state === 'error' ? 'Check your connection and try again.' : 'We couldn’t find this customer.'}</Notice>
      </>
    )
  }
  const edit = can('Customers', 'Edit')
  const addNote = () => openModal({ title: 'Add customer note', message: 'Visible to your staff only.', body: <NoteForm customer={c} onSaved={setC} />, noActions: true })

  return (
    <>
      <PageHead
        title="Customer detail"
        desc={`Customer profile · Joined ${dateTime(Date.parse(c.joinedAt))}`}
        actions={
          <>
            <Btn onClick={() => navigate('/customers')}>Back to customers</Btn>
            <Btn disabled={!edit} onClick={() => openModal({ title: 'Edit customer', body: <DetailsForm customer={c} onSaved={setC} />, noActions: true })}>Edit</Btn>
            <Btn disabled={!edit} onClick={addNote}>Add note</Btn>
            <Btn
              onClick={() =>
                openDrawer({
                  title: 'Customer actions',
                  body: (
                    <>
                      {!!c.email && <SettingRow title="Email customer" sub={c.email} right={<Btn small onClick={() => { closeDrawer(); window.location.href = `mailto:${c.email}` }}>Open</Btn>} />}
                      {!!c.phone && <SettingRow title="Call customer" sub={c.phone} right={<Btn small onClick={() => { closeDrawer(); window.location.href = `tel:${c.phone.replace(/\s/g, '')}` }}>Call</Btn>} />}
                      <SettingRow title="Export profile" sub="Download this customer as CSV" right={<Btn small onClick={() => { downloadCsv(`${display(c)}.csv`, ['Name', 'Email', 'Phone', 'Orders', 'Total spent (KES)'], [[c.name, c.email, c.phone, c.orders, shillings(c.spentCents)]]); closeDrawer() }}>Download</Btn>} />
                    </>
                  ),
                })
              }>
              More actions
            </Btn>
          </>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.55fr) minmax(270px,.8fr)', alignItems: 'start' }}>
        <div className="grid">
          <Panel right={<Badge tone={c.segment === 'returning' ? 'green' : 'blue'}>{segmentLabel(c.segment)}</Badge>} title="" className="">
            <div className="product-cell" style={{ marginBottom: 14 }}>
              <AvatarTile text={initialsOf(display(c))} size={42} />
              <div>
                <h2 style={{ fontSize: 14 }}>{display(c)}</h2>
                <div className="panel-sub">{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div className="grid stats" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', margin: 0 }}>
              <Stat label="Orders" value={String(c.orders)} trend="Not counting cancelled" icon="▣" />
              <Stat label="Lifetime spend" value={kes(shillings(c.spentCents))} trend="Paid orders" icon="◈" />
              <Stat label="Last order" value={c.lastOrderAt ? dateTime(Date.parse(c.lastOrderAt)) : 'None yet'} trend="Most recent" icon="◉" />
            </div>
          </Panel>

          <section className="card table-card">
            <div className="table-head">
              <h2>Recent orders</h2>
              {can('Orders', 'View') && <Btn small onClick={() => navigate(`/orders?customer=${c.id}`)}>View all</Btn>}
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {c.recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td>{can('Orders', 'View') ? <button className="link-btn" onClick={() => navigate(`/orders/${o.id}`)}>{o.number}</button> : o.number}</td>
                      <td>{dateTime(Date.parse(o.at))}</td>
                      <td>{kes(shillings(o.totalCents))}</td>
                      <td><Badge tone={statusTone(o.status)}>{o.status}</Badge></td>
                    </tr>
                  ))}
                  {c.recentOrders.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 22, color: 'var(--muted)' }}>No orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <Panel title="Private notes" sub="Visible to your staff only" right={<Btn small disabled={!edit} onClick={addNote}>+ Add note</Btn>}>
            {c.notes.length === 0 ? <div className="panel-sub">No notes yet.</div> : c.notes.map((n) => (
              <div key={n.id} style={{ marginBottom: 8 }}>
                <Notice mark={n.by.slice(0, 2).toUpperCase()}>{n.text} Added by {n.by} · {dateTime(Date.parse(n.at))}</Notice>
              </div>
            ))}
          </Panel>
        </div>

        <div className="grid">
          <Panel title="Saved addresses">
            {c.addresses.length === 0 && <div className="panel-sub">{c.street ? `${c.street}, ${c.area}` : 'No saved addresses.'}</div>}
            {c.addresses.map((a) => (
              <div key={a.id} style={{ marginBottom: 10 }}>
                <div className="list-row">
                  <span><strong>{a.label}</strong><small>{a.area}, {a.county}</small></span>
                  {a.isDefault && <Badge tone="blue">Default</Badge>}
                </div>
                <div className="subtext" style={{ paddingTop: 4 }}>{a.street}</div>
                <div className="subtext">{a.name} · {a.phone}</div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  )
}
