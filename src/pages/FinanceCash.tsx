import { useState } from 'react'

import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, del, post } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'
import type { ApiRider } from './Riders'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
const money = (c: number) => kes(shillings(c))
const monthName = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleString('en-GB', { month: 'long', year: 'numeric' })

// ---- cash on delivery -----------------------------------------------------------------------------------------------

interface Cash {
  owed: { riderId: string; rider: string; phone: string; heldCents: number; since: string | null; orders: number; overdue: boolean }[]; windowHours: number; totalHeldCents: number
  deposits: { id: string; riderId: string; rider: string; amountCents: number; ref: string; method: string | null; account: string | null; note: string; receivedBy: string; at: string }[]
}

export function CodManagement() {
  const { can } = useStore()
  const { data, failed, loading, reload } = useGet<Cash>('/v1/admin/cash', 60_000)
  const owed = data?.owed ?? []
  const cols: Column<Cash['owed'][number]>[] = [
    { key: 'r', header: 'Rider', sort: (a, b) => a.rider.localeCompare(b.rider), render: (r) => <div><b>{r.rider}</b><div className="subtext">{r.phone}</div></div> },
    { key: 'h', header: 'Cash held', sort: (a, b) => a.heldCents - b.heldCents, render: (r) => <b>{money(r.heldCents)}</b> },
    { key: 'o', header: 'Orders', render: (r) => r.orders },
    { key: 's', header: 'Holding since', render: (r) => (r.since ? dateTime(Date.parse(r.since)) : '—') },
    { key: 'st', header: 'Status', render: (r) => <Badge tone={r.overdue ? 'red' : 'green'}>{r.overdue ? 'Overdue' : 'Within the window'}</Badge> },
  ]
  return (
    <>
      <PageHead title="COD management" desc={`Cash riders collected from customers. They should hand it in within ${data?.windowHours ?? 24} hours.`} actions={<><Btn onClick={reload}>Refresh</Btn><Btn variant="primary" disabled={!can('Payments', 'Edit')} onClick={() => navigate('/finance/cod/deposit')}>Record a deposit</Btn></>} />
      <div className="tile-row">
        <Stat label="Cash out with riders" value={data ? money(data.totalHeldCents) : '—'} trend={`${owed.length} riders`} icon="◈" up={owed.length === 0} />
        <Stat label="Overdue" value={String(owed.filter((r) => r.overdue).length)} trend="Past the hand-in window" icon="!" up={owed.every((r) => !r.overdue)} />
      </div>
      <DataTable title="Cash held by riders" rows={owed} rowKey={(r) => r.riderId} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the cash balances.' : undefined} onRetry={reload} searchLabel="Search riders" searchText={(r) => `${r.rider} ${r.phone}`} emptyTitle="No cash is out" empty="Riders have handed in everything they collected."
        actions={(r) => <Btn small disabled={!can('Payments', 'Edit')} onClick={() => navigate(`/finance/cod/deposit?rider=${r.riderId}`)}>Record deposit</Btn>} />
      <div style={{ marginTop: 14 }}>
        <Panel title="Recent deposits">
          {data?.deposits.length === 0 && <div className="panel-sub">No deposits yet.</div>}
          {data?.deposits.slice(0, 12).map((d) => <SettingRow key={d.id} title={`${d.rider} · ${money(d.amountCents)}`} sub={`${d.method ?? ''} · ${d.ref} · received by ${d.receivedBy} · ${dateTime(Date.parse(d.at))}`} />)}
        </Panel>
      </div>
    </>
  )
}

export function CodDeposit() {
  const { can, toast } = useStore()
  const q = useQuery()
  const { data } = useGet<Cash>('/v1/admin/cash')
  const [riderId, setRiderId] = useState(q.get('rider') ?? '')
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const [method, setMethod] = useState('Cash at hub')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const owed = data?.owed ?? []
  const picked = owed.find((r) => r.riderId === riderId)
  const submit = async () => {
    const e: Record<string, string> = {}
    const n = Number(amount)
    if (!riderId) e.rider = 'Choose a rider'
    if (!(n > 0)) e.amount = 'Enter the amount in shillings'
    else if (picked && Math.round(n * 100) > picked.heldCents) e.amount = `They only hold ${money(picked.heldCents)}`
    if (ref.trim().length < 3) e.ref = 'Enter the receipt or transaction reference'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try { await post(`/v1/admin/cash/${riderId}/deposit`, { amountCents: Math.round(n * 100), ref: ref.trim(), method, note: note.trim() }); toast('Deposit recorded'); navigate('/finance/cod') } catch (err) { setErrors({ form: says(err) }) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title="Record COD deposit" desc="When a rider hands in the cash they collected." actions={<Btn onClick={() => navigate('/finance/cod')}>Back</Btn>} />
      {errors.form && <Notice tone="error" mark="!">{errors.form}</Notice>}
      <Panel title="Deposit">
        <Field label="Rider" value={riderId} onChange={setRiderId} error={errors.rider} options={[{ value: '', label: owed.length ? 'Choose a rider…' : 'No rider is holding cash' }, ...owed.map((r) => ({ value: r.riderId, label: `${r.rider} · holds ${money(r.heldCents)}` }))]} />
        <div className="sp-form2"><Field label="Amount received (KES)" value={amount} onChange={setAmount} error={errors.amount} /><Field label="Reference" value={ref} onChange={setRef} error={errors.ref} placeholder="Receipt or M-Pesa code" /></div>
        <Field label="How it was handed in" value={method} onChange={setMethod} options={['Cash at hub', 'M-Pesa transfer', 'Bank deposit']} />
        <Field label="Note" value={note} onChange={setNote} />
        <div className="sp-row end"><Btn variant="primary" disabled={!can('Payments', 'Edit') || busy} onClick={() => void submit()}>Record deposit</Btn></div>
      </Panel>
    </>
  )
}

// ---- rider payouts --------------------------------------------------------------------------------------------------

interface Payout { id: string; number: string; riderId: string; rider: string; phone: string; amountCents: number; feeCents: number; status: 'pending' | 'paid' | 'failed'; requestedAt: string; paidAt: string | null; paidBy: string | null; providerRef: string | null; failureReason: string | null }

function PayForm({ p, onDone }: { p: Payout; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  const go = async () => { try { await post(`/v1/admin/payouts/${p.id}/paid`, { providerRef: ref.trim() }); onDone(); closeModal(); toast('Marked as paid') } catch (e) { setErr(says(e)) } }
  return (
    <>
      <Notice mark="i">{`Pay ${p.rider} ${money(p.amountCents)} to ${p.phone} from the M-Pesa portal, then enter the M-Pesa code here.`}</Notice>
      <Field label="M-Pesa transaction code" value={ref} onChange={(v) => { setRef(v); setErr('') }} error={err} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Mark as paid</Btn></div>
    </>
  )
}
function FailForm({ p, onDone }: { p: Payout; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const go = async () => { try { await post(`/v1/admin/payouts/${p.id}/failed`, { reason: reason.trim() }); onDone(); closeModal(); toast('Marked as failed. The money is back in their balance.') } catch (e) { setErr(says(e)) } }
  return (
    <>
      <Field label="What went wrong?" value={reason} onChange={(v) => { setReason(v); setErr('') }} error={err} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="danger" onClick={() => void go()}>Mark as failed</Btn></div>
    </>
  )
}

export function RiderPayouts() {
  const { can, openModal } = useStore()
  const [status, setStatus] = useState('pending')
  const { data, failed, loading, reload } = useGet<{ items: Payout[]; totals: Record<string, { count: number; cents: number }> }>(`/v1/admin/payouts?limit=200${status ? `&status=${status}` : ''}`, 60_000)
  const edit = can('Payments', 'Edit')
  const cols: Column<Payout>[] = [
    { key: 'n', header: 'Payout', render: (p) => p.number },
    { key: 'r', header: 'Rider', render: (p) => <div><b>{p.rider}</b><div className="subtext">{p.phone}</div></div> },
    { key: 'a', header: 'Amount', sort: (a, b) => a.amountCents - b.amountCents, render: (p) => <b>{money(p.amountCents)}</b> },
    { key: 'f', header: 'Fee', render: (p) => money(p.feeCents) },
    { key: 's', header: 'Status', render: (p) => <Badge tone={p.status === 'paid' ? 'green' : p.status === 'failed' ? 'red' : 'amber'}>{p.status}</Badge> },
    { key: 'w', header: 'Requested', render: (p) => dateTime(Date.parse(p.requestedAt)) },
    { key: 'ref', header: 'Reference', render: (p) => p.providerRef ?? p.failureReason ?? '—' },
  ]
  return (
    <>
      <PageHead title="Rider payouts" desc="Riders ask to withdraw their earnings. Pay them from the M-Pesa portal and record the code here." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <div className="tile-row"><Stat label="Waiting to be paid" value={money(data?.totals.pending?.cents ?? 0)} trend={`${data?.totals.pending?.count ?? 0} requests`} icon="◷" up={(data?.totals.pending?.count ?? 0) === 0} /><Stat label="Paid" value={money(data?.totals.paid?.cents ?? 0)} trend={`${data?.totals.paid?.count ?? 0} payouts`} icon="✓" /></div>
      <DataTable title="Payouts" rows={data?.items ?? []} rowKey={(p) => p.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the payouts.' : undefined} onRetry={reload} searchLabel="Search payouts" searchText={(p) => `${p.number} ${p.rider} ${p.phone}`} emptyTitle="No payouts" empty="Withdrawal requests from riders appear here."
        tools={<select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="pending">Waiting</option><option value="paid">Paid</option><option value="failed">Failed</option></select>}
        actions={(p) => (p.status === 'pending' ? <div className="sp-row"><Btn small variant="primary" disabled={!edit} onClick={() => openModal({ title: `Pay ${p.number}`, body: <PayForm p={p} onDone={reload} />, noActions: true })}>Mark paid</Btn><Btn small disabled={!edit} onClick={() => openModal({ title: `Fail ${p.number}`, body: <FailForm p={p} onDone={reload} />, noActions: true })}>It failed</Btn></div> : null)} />
    </>
  )
}

// ---- payout batches -------------------------------------------------------------------------------------------------

interface Batch { id: string; number: string; status: string; note: string; createdBy: string; createdAt: string; approvedBy: string | null; sentAt: string | null; payouts: number; totalCents: number; failed: number }
interface BatchFull { id: string; number: string; status: string; note: string; createdBy: string; createdById: string; sentAt: string | null; totalCents: number; items: { payoutId: string; number: string; rider: string; phone: string; amountCents: number; status: string; outcome: string | null; providerRef: string | null; failureReason: string | null }[] }

export function PayoutBatches({ id }: { id?: string }) {
  const { can, toast } = useStore()
  const list = useGet<{ items: Batch[] }>('/v1/admin/payout-batches')
  const open = useGet<{ items: Payout[] }>(id ? null : '/v1/admin/payouts?status=pending&limit=200')
  const one = useGet<BatchFull>(id ? `/v1/admin/payout-batches/${id}` : null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const edit = can('Payments', 'Edit')
  const run = async (what: () => Promise<unknown>, done: string, then?: () => void) => { setBusy(true); try { await what(); toast(done); list.reload(); one.reload(); open.reload(); then?.() } catch (e) { toast(says(e)) } finally { setBusy(false) } }

  if (id) {
    const b = one.data
    if (!b) return <PageHead title="Payout batch" desc={one.failed ? 'We couldn’t load this batch.' : 'Loading…'} actions={<Btn onClick={() => navigate('/finance/batch')}>Back</Btn>} />
    return (
      <>
        <PageHead title={b.number} desc={`${b.items.length} payouts · ${money(b.totalCents)} · prepared by ${b.createdBy}`}
          actions={<><Btn onClick={() => navigate('/finance/batch')}>Back to batches</Btn>
            {b.status !== 'sent' && <Btn variant="danger" disabled={!edit || busy} onClick={() => void run(() => del(`/v1/admin/payout-batches/${id}`), 'Batch deleted', () => navigate('/finance/batch'))}>Delete</Btn>}
            {b.status !== 'sent' && <Btn variant="primary" disabled={!edit || busy} onClick={() => void run(() => post(`/v1/admin/payout-batches/${id}/send`), 'Batch sent')}>Approve and send</Btn>}</>} />
        <Notice mark="i">Someone other than the person who prepared a batch must approve it. If sending money from here isn’t connected yet, pay each rider from the M-Pesa portal and mark it paid on the Rider payouts page.</Notice>
        <div style={{ marginTop: 12 }}><Panel title="Payouts in this batch">{b.items.map((i) => <SettingRow key={i.payoutId} title={`${i.rider} · ${money(i.amountCents)}`} sub={`${i.number} · ${i.phone}${i.providerRef ? ` · ${i.providerRef}` : ''}${i.failureReason ? ` · ${i.failureReason}` : ''}`} right={<Badge tone={i.outcome === 'paid' || i.status === 'paid' ? 'green' : i.outcome === 'failed' ? 'red' : 'amber'}>{i.outcome ?? i.status}</Badge>} />)}</Panel></div>
      </>
    )
  }
  const available = open.data?.items ?? []
  const chosen = available.filter((p) => picked[p.id])
  const cols: Column<Batch>[] = [
    { key: 'n', header: 'Batch', render: (b) => <button className="link-btn" onClick={() => navigate(`/finance/batch/${b.id}`)}>{b.number}</button> },
    { key: 'p', header: 'Payouts', render: (b) => b.payouts },
    { key: 't', header: 'Total', render: (b) => <b>{money(b.totalCents)}</b> },
    { key: 's', header: 'Status', render: (b) => <Badge tone={b.status === 'sent' ? (b.failed ? 'amber' : 'green') : 'blue'}>{b.status === 'sent' ? (b.failed ? `Sent · ${b.failed} failed` : 'Sent') : 'Ready to approve'}</Badge> },
    { key: 'c', header: 'Prepared by', render: (b) => b.createdBy },
    { key: 'a', header: 'Created', render: (b) => dateTime(Date.parse(b.createdAt)) },
  ]
  return (
    <>
      <PageHead title="Payout batches" desc="Group rider payouts, have a second person approve them, and send." />
      <DataTable title="Batches" rows={list.data?.items ?? []} rowKey={(b) => b.id} columns={cols} loading={list.loading} error={list.failed && !list.data ? 'We couldn’t load the batches.' : undefined} onRetry={list.reload} searchLabel="Search batches" searchText={(b) => `${b.number} ${b.createdBy}`} emptyTitle="No batches yet" empty="Create one from the waiting payouts below."
        actions={(b) => <Btn small onClick={() => navigate(`/finance/batch/${b.id}`)}>Open</Btn>} />
      <div style={{ marginTop: 14 }}>
        <Panel title="Waiting payouts" sub="Tick the ones to put in a new batch">
          {available.length === 0 && <div className="panel-sub">No payouts are waiting.</div>}
          {available.map((p) => <label key={p.id} className="list-row" style={{ cursor: 'pointer' }}><span><strong>{p.rider}</strong><small>{p.number} · {p.phone}</small></span><span className="sp-row"><b>{money(p.amountCents)}</b><input type="checkbox" aria-label={`Include ${p.number}`} checked={!!picked[p.id]} onChange={(e) => setPicked((x) => ({ ...x, [p.id]: e.target.checked }))} /></span></label>)}
          {available.length > 0 && <><Field label="Note (optional)" value={note} onChange={setNote} /><div className="sp-row end"><Btn variant="primary" disabled={!edit || busy || !chosen.length} onClick={() => void run(async () => { const b = await post<{ id: string }>('/v1/admin/payout-batches', { payoutIds: chosen.map((p) => p.id), note: note.trim() }); setPicked({}); setNote(''); navigate(`/finance/batch/${b.id}`) }, 'Batch created')}>{`Create a batch of ${chosen.length}`}</Btn></div></>}
        </Panel>
      </div>
    </>
  )
}

// ---- rider earnings -------------------------------------------------------------------------------------------------

export function EarningsStatements() {
  const { toast } = useStore()
  const riders = useGet<{ items: ApiRider[] }>('/v1/admin/riders?status=approved&limit=200')
  const [sel, setSel] = useState<string | null>(null)
  const ledger = useGet<{ items: { id: string; kind: string; amountCents: number; note: string; by: string; at: string }[] }>(sel ? `/v1/admin/riders/${sel}/ledger` : null)
  const cols: Column<ApiRider>[] = [
    { key: 'n', header: 'Rider', render: (r) => <button className="link-btn" onClick={() => setSel(r.id)}>{r.name}</button> },
    { key: 'd', header: 'Deliveries', sort: (a, b) => a.deliveries - b.deliveries, render: (r) => r.deliveries },
    { key: 'e', header: 'Balance to pay out', sort: (a, b) => a.earningsBalanceCents - b.earningsBalanceCents, render: (r) => <b>{money(r.earningsBalanceCents)}</b> },
    { key: 'c', header: 'Cash held', render: (r) => money(r.cashHeldCents) },
  ]
  const rows = riders.data?.items ?? []
  return (
    <>
      <PageHead title="Rider earnings statements" desc="What each rider has earned and what is still to be paid." actions={<Btn disabled={!rows.length} onClick={() => { downloadCsv('rider-earnings.csv', ['Rider', 'Deliveries', 'Balance (KES)', 'Cash held (KES)'], rows.map((r) => [r.name, r.deliveries, shillings(r.earningsBalanceCents), shillings(r.cashHeldCents)])); toast('Exported') }}>Export</Btn>} />
      <div className="sp-two">
        <DataTable title="Riders" rows={rows} rowKey={(r) => r.id} columns={cols} loading={riders.loading} error={riders.failed && !riders.data ? 'We couldn’t load the riders.' : undefined} searchLabel="Search riders" searchText={(r) => r.name} emptyTitle="No riders" empty="Approved riders appear here." actions={(r) => <Btn small onClick={() => setSel(r.id)}>Statement</Btn>} />
        {sel && (
          <Panel title="Statement" sub={rows.find((r) => r.id === sel)?.name}>
            {ledger.loading && <div className="panel-sub">Loading…</div>}
            {ledger.data?.items.length === 0 && <div className="panel-sub">No entries yet.</div>}
            {ledger.data?.items.map((e) => <SettingRow key={e.id} title={`${e.kind}${e.note ? ` · ${e.note}` : ''}`} sub={`${dateTime(Date.parse(e.at))}${e.by ? ` · ${e.by}` : ''}`} right={<b style={{ color: e.amountCents < 0 ? 'var(--red)' : 'var(--green)' }}>{e.amountCents < 0 ? '−' : '+'}{money(Math.abs(e.amountCents))}</b>} />)}
          </Panel>
        )}
      </div>
    </>
  )
}

// ---- store settlements ----------------------------------------------------------------------------------------------

interface Settlement { id: string; store: string; month: string; orders: number; salesCents: number; commissionCents: number; netCents: number; commissionRate: number; paid: { at: string; ref: string; by: string } | null }

function SettleForm({ s, onDone }: { s: Settlement; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  const go = async () => { try { await post(`/v1/admin/settlements/${s.id}/pay`, { ref: ref.trim() }); onDone(); closeModal(); toast('Settlement marked as paid') } catch (e) { setErr(says(e)) } }
  return (
    <>
      <Notice mark="i">{`Pay ${s.store} ${money(s.netCents)} for ${monthName(s.month)}, then enter the payment reference.`}</Notice>
      <Field label="Payment reference" value={ref} onChange={(v) => { setRef(v); setErr('') }} error={err} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Mark as paid</Btn></div>
    </>
  )
}

export function StoreSettlements() {
  const { can, openModal } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Settlement[]; payableCents: number }>('/v1/admin/settlements', 60_000)
  const cols: Column<Settlement>[] = [
    { key: 's', header: 'Store', render: (s) => <div><b>{s.store}</b><div className="subtext">{s.id}</div></div> },
    { key: 'm', header: 'Month', render: (s) => monthName(s.month) },
    { key: 'o', header: 'Orders', render: (s) => s.orders },
    { key: 'sa', header: 'Sales', render: (s) => money(s.salesCents) },
    { key: 'c', header: `Commission`, render: (s) => `${money(s.commissionCents)} (${s.commissionRate}%)` },
    { key: 'n', header: 'To pay', render: (s) => <b>{money(s.netCents)}</b> },
    { key: 'p', header: 'Status', render: (s) => (s.paid ? <Badge tone="green">{`Paid · ${s.paid.ref}`}</Badge> : <Badge tone="amber">To pay</Badge>) },
  ]
  return (
    <>
      <PageHead title="Store settlements" desc="What each store is owed for the orders it fulfilled, after ShopCore’s commission." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <div className="tile-row"><Stat label="To pay stores" value={data ? money(data.payableCents) : '—'} trend="Unpaid settlements" icon="◈" up={(data?.payableCents ?? 0) === 0} /></div>
      <DataTable title="Settlements" rows={data?.items ?? []} rowKey={(s) => s.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the settlements.' : undefined} onRetry={reload} searchLabel="Search settlements" searchText={(s) => `${s.store} ${s.month}`} emptyTitle="Nothing to settle" empty="Settlements appear once orders are delivered."
        actions={(s) => (s.paid ? null : <Btn small variant="primary" disabled={!can('Payments', 'Edit')} onClick={() => openModal({ title: `Pay ${s.store}`, body: <SettleForm s={s} onDone={reload} />, noActions: true })}>Mark paid</Btn>)} />
    </>
  )
}

