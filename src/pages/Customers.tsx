import { useState } from 'react'

import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { initials, kes, type Customer } from '../data/seed'
import { dateTime } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

export function CustomersList() {
  const { customers, toast, can } = useStore()
  const [segment, setSegment] = useState('All segments')
  const [spend, setSpend] = useState('Any spend')

  const rows = customers.filter((c) => (segment === 'All segments' || c.segment === segment) && (spend === 'Any spend' || c.spent > 20000))

  const columns: Column<Customer>[] = [
    {
      key: 'customer', header: 'Customer', sort: (a, b) => a.name.localeCompare(b.name),
      render: (c) => (
        <div className="product-cell">
          <AvatarTile text={initials(c.name)} />
          <div>
            <div className="prod-name">{c.name}</div>
            <div className="subtext">{c.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (c) => c.phone },
    { key: 'orders', header: 'Orders', sort: (a, b) => a.orders - b.orders, render: (c) => c.orders },
    { key: 'spent', header: 'Total spent', sort: (a, b) => a.spent - b.spent, render: (c) => <b>{kes(c.spent)}</b> },
    { key: 'segment', header: 'Segment', sort: (a, b) => a.segment.localeCompare(b.segment), render: (c) => <Badge tone={c.segment === 'Returning' ? 'green' : 'blue'}>{c.segment}</Badge> },
  ]

  return (
    <>
      <PageHead
        title="Customers list"
        desc="View customer profiles, activity, and lifetime value."
        actions={
          <Btn disabled={!can('Customers', 'Export')} onClick={() => { downloadCsv('customers.csv', ['Name', 'Email', 'Phone', 'Orders', 'Total spent (KES)', 'Segment'], rows.map((c) => [c.name, c.email, c.phone, c.orders, c.spent, c.segment])); toast('Customer export started') }}>
            Export customers
          </Btn>
        }
      />
      <DataTable
        title="All customers"
        rows={rows}
        rowKey={(c) => c.id}
        columns={columns}
        searchLabel="Search customers"
        searchText={(c) => `${c.name} ${c.email} ${c.phone}`}
        tools={
          <>
            <select className="select" aria-label="Segment" value={segment} onChange={(e) => setSegment(e.target.value)}>
              <option>All segments</option><option>Returning</option><option>New</option>
            </select>
            <select className="select" aria-label="Spend" value={spend} onChange={(e) => setSpend(e.target.value)}>
              <option>Any spend</option><option>Over KES 20,000</option>
            </select>
          </>
        }
        actions={(c) => <Btn small onClick={() => navigate(`/customers/${c.id}`)}>View</Btn>}
      />
    </>
  )
}

function NoteForm({ customer }: { customer: Customer }) {
  const { addNote, closeModal, toast } = useStore()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const save = () => {
    if (text.trim().length < 3) return setError('Write a note first')
    addNote(customer.id, text.trim())
    closeModal()
    toast('Note added')
  }
  return (
    <>
      <Field label="Private note" multiline value={text} onChange={(v) => { setText(v); setError('') }} placeholder={`Add a private note to ${customer.name}’s profile`} error={error} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={save}>Save note</Btn>
      </div>
    </>
  )
}

function AddressForm({ customer, onSave }: { customer: Customer; onSave: (p: Partial<Customer>) => void }) {
  const { closeModal } = useStore()
  const [street, setStreet] = useState(customer.street)
  const [area, setArea] = useState(customer.area)
  const [error, setError] = useState('')
  return (
    <>
      <Field label="Area" value={area} onChange={setArea} />
      <Field label="Street and landmark" value={street} onChange={(v) => { setStreet(v); setError('') }} error={error} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={() => { if (street.trim().length < 3 || area.trim().length < 2) return setError('Enter the area and street'); onSave({ street: street.trim(), area: area.trim() }); closeModal() }}>Save address</Btn>
      </div>
    </>
  )
}

function WalletActivity({ customer }: { customer: Customer }) {
  const rows: [string, number, string][] = [
    ['Refund · ' + (customer.recent[2]?.id ?? 'SC-2630'), 625, 'Today, 8:32 AM'],
    ['Order payment · ' + (customer.recent[1]?.id ?? 'SC-2701'), -400, '18 Oct, 5:10 PM'],
    ['Top-up via M-Pesa', 1000, '12 Oct, 11:02 AM'],
  ]
  return (
    <>
      <Notice>Balance {kes(customer.wallet)}. Wallet credits come from refunds and top-ups.</Notice>
      <div style={{ marginTop: 12 }}>
        {rows.map(([t, a, w]) => <SettingRow key={t} title={t} sub={w} right={<b style={{ color: a < 0 ? 'var(--red)' : 'var(--green)' }}>{a < 0 ? '−' : '+'}{kes(Math.abs(a))}</b>} />)}
      </div>
    </>
  )
}

export function CustomerDetail({ id }: { id: string }) {
  const { customers, openModal, openDrawer, closeDrawer, toast, orders, can, updateCustomer, log } = useStore()
  const c = customers.find((x) => x.id === id)
  if (!c) {
    return (
      <>
        <PageHead title="Customer detail" desc="That customer doesn’t exist." actions={<Btn onClick={() => navigate('/customers')}>Back to customers</Btn>} />
        <Notice tone="warning" mark="!">We couldn’t find this customer.</Notice>
      </>
    )
  }
  const theirs = orders.filter((o) => o.customerId === c.id).slice(0, 5)
  const addNote = () => openModal({ title: 'Add customer note', message: `Visible to your staff only.`, body: <NoteForm customer={c} />, noActions: true })

  return (
    <>
      <PageHead
        title="Customer detail"
        desc={`Customer profile · Added ${c.added}`}
        actions={
          <>
            <Btn disabled={!can('Customers', 'Edit')} onClick={addNote}>Add note</Btn>
            <Btn
              onClick={() =>
                openDrawer({
                  title: 'Customer actions',
                  body: (
                    <>
                      <SettingRow title="Email customer" sub={c.email} right={<Btn small onClick={() => { closeDrawer(); window.location.href = `mailto:${c.email}` }}>Open</Btn>} />
                      <SettingRow title="Call customer" sub={c.phone} right={<Btn small onClick={() => { closeDrawer(); window.location.href = `tel:${c.phone.replace(/\s/g, '')}` }}>Call</Btn>} />
                      <SettingRow title="Export profile" sub="Download this customer as CSV" right={<Btn small onClick={() => { downloadCsv(`${c.name}.csv`, ['Name', 'Email', 'Phone', 'Orders', 'Total spent (KES)'], [[c.name, c.email, c.phone, c.orders, c.spent]]); closeDrawer(); toast('Profile exported') }}>Export</Btn>} />
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
          <Panel
            right={<Badge tone={c.segment === 'Returning' ? 'green' : 'blue'}>{c.segment}</Badge>}
            title=""
            className="">
            <div className="product-cell" style={{ marginBottom: 14 }}>
              <AvatarTile text={initials(c.name)} size={42} />
              <div>
                <h2 style={{ fontSize: 14 }}>{c.name}</h2>
                <div className="panel-sub">{c.email} · {c.phone}</div>
              </div>
            </div>
            <div className="grid stats" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', margin: 0 }}>
              <Stat label="Orders" value={String(c.orders)} trend="Lifetime" icon="▣" />
              <Stat label="Lifetime spend" value={kes(c.spent)} trend="Across all orders" icon="◈" />
              <Stat label="Wallet balance" value={kes(c.wallet)} trend="Available" icon="◉" />
            </div>
          </Panel>

          <section className="card table-card">
            <div className="table-head">
              <h2>Recent orders</h2>
              <Btn small onClick={() => navigate(`/orders?customer=${c.id}`)}>View all</Btn>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {theirs.map((o) => (
                    <tr key={o.id}>
                      <td><button className="link-btn" onClick={() => navigate(`/orders/${o.id}`)}>{o.id}</button></td>
                      <td>{dateTime(o.placedAt)}</td>
                      <td>{kes(o.total)}</td>
                      <td><Badge tone={o.status === 'Delivered' ? 'green' : o.status === 'Cancelled' || o.status === 'Refunded' ? 'red' : 'amber'}>{o.status}</Badge></td>
                    </tr>
                  ))}
                  {theirs.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 22, color: 'var(--muted)' }}>No orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <Panel title="Private notes" sub="Visible to your staff only" right={<Btn small disabled={!can('Customers', 'Edit')} onClick={addNote}>+ Add note</Btn>}>
            {c.notes.length === 0 ? <div className="panel-sub">No notes yet.</div> : c.notes.map((n, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <Notice mark={n.by.slice(0, 2).toUpperCase()}>{n.text} Added by {n.by} · {n.at}</Notice>
              </div>
            ))}
          </Panel>
        </div>

        <div className="grid">
          <Panel title="Saved addresses" right={<Btn small disabled={!can('Customers', 'Edit')} onClick={() => openModal({ title: 'Edit saved address', body: <AddressForm customer={c} onSave={(patch) => { updateCustomer(c.id, patch); log(`Edited address · ${c.name}`, 'Customers'); toast('Address updated') }} />, noActions: true })}>Edit</Btn>}>
            <div className="list-row">
              <span><strong>Home</strong><small>{c.area}, Nairobi</small></span>
              <Badge tone="blue">Default</Badge>
            </div>
            <div className="subtext" style={{ paddingTop: 8 }}>{c.street}</div>
          </Panel>
          <Panel title="Wallet" right={<span className="stat-icon">K</span>}>
            <div className="stat-value">{kes(c.wallet)}</div>
            <div className="panel-sub">Last updated today at 8:32 AM</div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => openDrawer({ title: `${c.name} · wallet`, body: <WalletActivity customer={c} /> })}>View wallet activity</button>
          </Panel>
        </div>
      </div>
    </>
  )
}
