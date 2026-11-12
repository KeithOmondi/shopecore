import { useState } from 'react'

import { Badge, Btn, DataTable, downloadCsv, Notice, PageHead, Stat, Tabs, type Column } from '../components/ui'
import type { CashDeposit, Order, Payout, Transaction } from '../data/commerce'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

const txTone = (s: Transaction['status']) => (s === 'Success' ? 'green' : s === 'Pending' ? 'amber' : s === 'Failed' ? 'red' : 'gray')

export function Payments() {
  const { transactions, orders, setOrders, can, openModal, toast, log } = useStore()
  const [tab, setTab] = useState<'Transactions' | 'Refunds'>('Transactions')
  const [method, setMethod] = useState('All methods')
  const [status, setStatus] = useState('All statuses')

  const collected = transactions.filter((t) => t.status === 'Success').reduce((n, t) => n + t.amount, 0)
  const pending = transactions.filter((t) => t.status === 'Pending')
  const refunded = orders.reduce((n, o) => n + o.refunded, 0)
  const rows = transactions.filter((t) => (method === 'All methods' || t.method === method) && (status === 'All statuses' || t.status === status))
  const refunds = orders.filter((o) => o.refunded > 0)

  const markPaid = (t: Transaction) =>
    openModal({
      title: `Mark ${t.id} as paid?`,
      message: `Confirm that ${kes(t.amount)} from ${t.customer} reached your account. The order will move on to fulfilment.`,
      confirm: 'Mark as paid',
      onConfirm: () => {
        setOrders(orders.map((o) => (o.id === t.orderId ? { ...o, pay: 'Paid' } : o)))
        log(`Reconciled payment ${t.id} · ${t.orderId}`, 'Payments')
        toast('Payment marked as paid')
      },
    })

  const columns: Column<Transaction>[] = [
    { key: 'id', header: 'Transaction', sort: (a, b) => a.at - b.at, render: (t) => <b>{t.id}</b> },
    { key: 'order', header: 'Order', render: (t) => <button className="link-btn" onClick={() => navigate(`/orders/${t.orderId}`)}>{t.orderId}</button> },
    { key: 'customer', header: 'Customer', sort: (a, b) => a.customer.localeCompare(b.customer), render: (t) => t.customer },
    { key: 'method', header: 'Method', render: (t) => t.method },
    { key: 'amount', header: 'Amount', sort: (a, b) => a.amount - b.amount, render: (t) => <b>{kes(t.amount)}</b> },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={txTone(t.status)}>{t.status}</Badge> },
    { key: 'ref', header: 'Reference', render: (t) => <code>{t.ref}</code> },
    { key: 'at', header: 'Date', render: (t) => dateTime(t.at) },
  ]

  return (
    <>
      <PageHead
        title="Payments"
        desc="Money in: every M-Pesa and card transaction, and the refunds sent back."
        actions={
          <>
            <Btn disabled={!can('Payments', 'Export')} onClick={() => { downloadCsv('transactions.csv', ['Transaction', 'Order', 'Customer', 'Method', 'Amount (KES)', 'Status', 'Reference', 'Date'], rows.map((t) => [t.id, t.orderId, t.customer, t.method, t.amount, t.status, t.ref, new Date(t.at).toISOString()])); toast('Transactions exported') }}>Export</Btn>
            <Btn onClick={() => navigate('/settings/payments')}>Gateway settings</Btn>
          </>
        }
      />
      <div className="tile-row">
        <Stat label="Collected" value={kes(collected)} trend="Successful payments" icon="↗" />
        <Stat label="Awaiting payment" value={String(pending.length)} trend={kes(pending.reduce((n, t) => n + t.amount, 0))} icon="◷" up={pending.length === 0} />
        <Stat label="Failed" value={String(transactions.filter((t) => t.status === 'Failed').length)} trend="Needs follow-up" icon="!" up={false} />
        <Stat label="Refunded" value={kes(refunded)} trend={`${refunds.length} orders`} icon="↺" up={false} />
      </div>
      <section className="card" style={{ marginBottom: 14 }}>
        <Tabs tabs={['Transactions', 'Refunds'] as const} value={tab} onChange={setTab} />
      </section>
      {tab === 'Transactions' ? (
        <DataTable
          title="Transactions"
          rows={rows}
          rowKey={(t) => t.id}
          columns={columns}
          searchLabel="Search transactions"
          searchText={(t) => `${t.id} ${t.orderId} ${t.customer} ${t.ref}`}
          tools={
            <>
              <select className="select" aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}><option>All methods</option><option>M-Pesa</option><option>Card</option></select>
              <select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option><option>Success</option><option>Pending</option><option>Refunded</option><option>Failed</option></select>
            </>
          }
          actions={(t) => (t.status === 'Pending' ? <Btn small disabled={!can('Payments', 'Edit')} onClick={() => markPaid(t)}>Mark as paid</Btn> : <Btn small onClick={() => navigate(`/orders/${t.orderId}`)}>Order</Btn>)}
        />
      ) : (
        <DataTable
          title="Refunds"
          rows={refunds}
          rowKey={(o: Order) => o.id}
          columns={[
            { key: 'order', header: 'Order', render: (o: Order) => <button className="link-btn" onClick={() => navigate(`/orders/${o.id}`)}>{o.id}</button> },
            { key: 'customer', header: 'Customer', render: (o: Order) => o.customer },
            { key: 'method', header: 'Refunded to', render: (o: Order) => o.method },
            { key: 'amount', header: 'Amount', sort: (a: Order, b: Order) => a.refunded - b.refunded, render: (o: Order) => <b>{kes(o.refunded)}</b> },
            { key: 'kind', header: 'Type', render: (o: Order) => <Badge tone={o.refunded >= o.total ? 'red' : 'amber'}>{o.refunded >= o.total ? 'Full' : 'Partial'}</Badge> },
          ]}
          searchLabel="Search refunds"
          searchText={(o) => `${o.id} ${o.customer}`}
          empty="No refunds have been issued."
        />
      )}
    </>
  )
}

export function Payouts() {
  const { payouts, setPayouts, deposits, setDeposits, riders, setRiders, can, openModal, toast, log } = useStore()
  const [tab, setTab] = useState<'Rider payouts' | 'Cash deposits'>('Rider payouts')
  const edit = can('Payments', 'Edit')

  const pending = payouts.filter((p) => p.status === 'Pending')
  const paid = payouts.filter((p) => p.status === 'Paid').reduce((n, p) => n + p.amount, 0)
  const due = deposits.filter((d) => d.status === 'Due')

  const pay = (ids: string[]) => {
    const hit = payouts.filter((p) => ids.includes(p.id) && p.status !== 'Paid')
    openModal({
      title: `Send ${hit.length} ${hit.length === 1 ? 'payout' : 'payouts'}?`,
      message: `${kes(hit.reduce((n, p) => n + p.amount, 0))} will be sent to riders’ M-Pesa numbers.`,
      confirm: 'Send payouts',
      onConfirm: () => {
        const now = Date.now()
        setPayouts(payouts.map((p) => (ids.includes(p.id) && p.status !== 'Paid' ? { ...p, status: 'Paid', paidAt: now } : p)))
        log(`Sent ${hit.length} rider payouts`, 'Payments')
        toast(`${hit.length} ${hit.length === 1 ? 'payout' : 'payouts'} sent`)
      },
    })
  }

  const receive = (d: CashDeposit) =>
    openModal({
      title: `Receive ${kes(d.owed)} from ${d.rider}?`,
      message: 'Confirm the cash or M-Pesa deposit reached ShopCore. The rider’s cash balance will be cleared.',
      confirm: 'Mark received',
      onConfirm: () => {
        setDeposits(deposits.map((x) => (x.id === d.id ? { ...x, status: 'Received' } : x)))
        setRiders(riders.map((r) => (r.id === d.riderId ? { ...r, cashHeld: 0 } : r)))
        log(`Received cash deposit · ${d.rider} (${kes(d.owed)})`, 'Payments')
        toast('Deposit recorded')
      },
    })

  const payoutCols: Column<Payout>[] = [
    { key: 'id', header: 'Payout', render: (p) => <b>{p.id}</b> },
    { key: 'rider', header: 'Rider', sort: (a, b) => a.rider.localeCompare(b.rider), render: (p) => <button className="link-btn" onClick={() => navigate(`/riders/${p.riderId}`)}>{p.rider}</button> },
    { key: 'amount', header: 'Amount', sort: (a, b) => a.amount - b.amount, render: (p) => <b>{kes(p.amount)}</b> },
    { key: 'method', header: 'To', render: (p) => p.method },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={p.status === 'Paid' ? 'green' : p.status === 'Pending' ? 'amber' : 'red'}>{p.status}</Badge> },
    { key: 'req', header: 'Requested', sort: (a, b) => a.requestedAt - b.requestedAt, render: (p) => dateTime(p.requestedAt) },
    { key: 'paid', header: 'Paid', render: (p) => (p.paidAt ? dateTime(p.paidAt) : '—') },
  ]

  return (
    <>
      <PageHead
        title="Payouts and cash"
        desc="Money out: rider earnings, and cash collected on delivery that riders owe back."
        actions={
          <Btn variant="primary" disabled={!edit || pending.length === 0} onClick={() => pay(pending.map((p) => p.id))}>{`Send all pending (${pending.length})`}</Btn>
        }
      />
      <div className="tile-row">
        <Stat label="Pending payouts" value={kes(pending.reduce((n, p) => n + p.amount, 0))} trend={`${pending.length} riders waiting`} icon="◷" up={pending.length === 0} />
        <Stat label="Paid out" value={kes(paid)} trend="This month" icon="↗" />
        <Stat label="Failed" value={String(payouts.filter((p) => p.status === 'Failed').length)} trend="Retry from the table" icon="!" up={false} />
        <Stat label="Cash owed to ShopCore" value={kes(due.reduce((n, d) => n + d.owed, 0))} trend={`${due.length} riders`} icon="◉" up={due.length === 0} />
      </div>
      <section className="card" style={{ marginBottom: 14 }}>
        <Tabs tabs={['Rider payouts', 'Cash deposits'] as const} value={tab} onChange={setTab} />
      </section>
      {tab === 'Rider payouts' ? (
        <DataTable
          title="Rider payouts"
          rows={payouts}
          rowKey={(p) => p.id}
          columns={payoutCols}
          searchLabel="Search payouts"
          searchText={(p) => `${p.id} ${p.rider} ${p.status}`}
          tools={<Btn small disabled={!can('Payments', 'Export')} onClick={() => { downloadCsv('payouts.csv', ['Payout', 'Rider', 'Amount (KES)', 'Status', 'Requested'], payouts.map((p) => [p.id, p.rider, p.amount, p.status, new Date(p.requestedAt).toISOString()])); toast('Payouts exported') }}>Export</Btn>}
          bulk={{ label: 'Send selected', onClick: (ids) => (edit ? pay(ids) : toast('Your role can’t send payouts')) }}
          actions={(p) => (p.status === 'Paid' ? <span className="subtext">Sent</span> : <Btn small disabled={!edit} onClick={() => pay([p.id])}>{p.status === 'Failed' ? 'Retry' : 'Send'}</Btn>)}
        />
      ) : due.length === 0 && deposits.every((d) => d.status === 'Received') ? (
        <Notice mark="✓" tone="success">No cash is owed. Every rider has deposited what they collected.</Notice>
      ) : (
        <DataTable
          title="Cash deposits"
          rows={deposits}
          rowKey={(d) => d.id}
          columns={[
            { key: 'id', header: 'Reference', render: (d: CashDeposit) => <b>{d.id}</b> },
            { key: 'rider', header: 'Rider', sort: (a: CashDeposit, b: CashDeposit) => a.rider.localeCompare(b.rider), render: (d: CashDeposit) => <button className="link-btn" onClick={() => navigate(`/riders/${d.riderId}`)}>{d.rider}</button> },
            { key: 'owed', header: 'Owed', sort: (a: CashDeposit, b: CashDeposit) => a.owed - b.owed, render: (d: CashDeposit) => <b>{kes(d.owed)}</b> },
            { key: 'due', header: 'Due', render: (d: CashDeposit) => d.due },
            { key: 'status', header: 'Status', render: (d: CashDeposit) => <Badge tone={d.status === 'Received' ? 'green' : 'amber'}>{d.status}</Badge> },
          ]}
          searchLabel="Search deposits"
          searchText={(d) => `${d.id} ${d.rider}`}
          actions={(d) => (d.status === 'Due' ? <Btn small disabled={!edit} onClick={() => receive(d)}>Mark received</Btn> : <span className="subtext">Received</span>)}
        />
      )}
    </>
  )
}
