import { useState } from 'react'

import { Stats, Steps } from '../components/finance-ui'
import { Detail, NotFoundCard, Person, useNow, when } from '../components/support-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, Stat, type Column } from '../components/ui'
import type { Order, Payout, Rider } from '../data/commerce'
import { COD_ACCOUNTS, COD_METHODS, monthKey, monthLabel, type PayoutBatch, type Settlement } from '../data/finance'
import { dateTime, kes } from '../lib/format'
import { useFinance } from '../lib/finance'
import { navigate, useQuery } from '../lib/router'
import { useStore } from '../lib/store'

const DAY = 86_400_000
const mask = (phone: string) => { const d = phone.replace(/\D/g, '').replace(/^254/, '0'); return `${d.slice(0, 4)} ••• ${d.slice(-3)}` }

// ---- COD -----------------------------------------------------------------------------------------------------

export function CodManagement() {
  const { riders, deposits, can } = useStore()
  const f = useFinance()
  const now = useNow()
  const [zone, setZone] = useState('All zones')
  const [bal, setBal] = useState('All balances')
  const edit = can('Payments', 'Edit')
  const held = riders.reduce((n, r) => n + r.cashHeld, 0)
  const due = deposits.filter((d) => d.status === 'Due')
  const today = f.codRecords.filter((c) => now - c.at < DAY)
  const rows = riders.filter((r) => (r.cashHeld > 0 || f.codRecords.some((c) => c.riderId === r.id)) && (zone === 'All zones' || r.zone === zone) && (bal === 'All balances' || (bal === 'Outstanding' ? r.cashHeld > 0 : r.cashHeld === 0)))
  const zones = [...new Set(riders.map((r) => r.zone))]
  const paid = (r: Rider) => f.codRecords.filter((c) => c.riderId === r.id).reduce((n, c) => n + c.amount, 0)
  const last = (r: Rider) => f.codRecords.find((c) => c.riderId === r.id)?.at

  const cols: Column<Rider>[] = [
    { key: 'r', header: 'Rider', sort: (a, b) => a.name.localeCompare(b.name), render: (r) => <>{can('Riders', 'View') ? <button className="sp-link" onClick={() => navigate(`/riders/${r.id}`)}>{r.name}</button> : <b>{r.name}</b>}<span className="sp-sub">{r.id.toUpperCase()}</span></> },
    { key: 'z', header: 'Zone', render: (r) => r.zone },
    { key: 'h', header: 'Cash held', sort: (a, b) => a.cashHeld - b.cashHeld, render: (r) => <b style={{ color: r.cashHeld ? 'var(--amber)' : 'var(--green)' }}>{kes(r.cashHeld)}</b> },
    { key: 'd', header: 'Handed in (recorded)', render: (r) => kes(paid(r)) },
    { key: 'l', header: 'Last deposit', render: (r) => { const l = last(r); return l ? dateTime(l) : '—' } },
    { key: 's', header: 'Status', render: (r) => deposits.some((d) => d.riderId === r.id && d.status === 'Due') ? <Badge tone="red">Due</Badge> : r.cashHeld > 0 ? <Badge tone="amber">Holding cash</Badge> : <Badge tone="green">Clear</Badge> },
  ]
  return (
    <>
      <PageHead title="COD management" desc="Track cash held by riders, deposits received and outstanding balances." actions={<><Btn onClick={() => navigate('/finance/statements')}>Rider statements</Btn><Btn variant="primary" disabled={!edit} onClick={() => navigate('/finance/cod/deposit')}>+ Record deposit</Btn></>} />
      <Stats>
        <Stat label="Cash held by riders" value={kes(held)} trend={due.length ? `${kes(due.reduce((n, d) => n + d.owed, 0))} due` : 'Nothing overdue'} icon="₭" up={due.length === 0} />
        <Stat label="Deposited in the last 24h" value={kes(today.reduce((n, c) => n + c.amount, 0))} trend={`${today.length} deposits`} icon="↓" />
        <Stat label="Riders holding cash" value={String(riders.filter((r) => r.cashHeld > 0).length)} trend={`${due.length} past the ${f.settings.codWindowHours}-hour window`} icon="♙" up={due.length === 0} />
        <Stat label="Deposits recorded" value={String(f.codRecords.length)} trend="In this demo session" icon="✓" />
      </Stats>
      {due.length > 0 && <div style={{ marginBottom: 12 }}><Notice tone="warning" mark="!"><b>{due.length} rider{due.length === 1 ? ' is' : 's are'} past the deposit window.</b> Riders must hand in cash within {f.settings.codWindowHours} hours.</Notice></div>}
      <DataTable
        title="Rider cash balances"
        rows={rows}
        rowKey={(r) => r.id}
        columns={cols}
        searchLabel="Search rider"
        searchText={(r) => `${r.name} ${r.zone} ${r.id}`}
        tools={<><select className="sp-select auto" aria-label="Zone" value={zone} onChange={(e) => setZone(e.target.value)}><option>All zones</option>{zones.map((z) => <option key={z}>{z}</option>)}</select><select className="sp-select auto" aria-label="Balance" value={bal} onChange={(e) => setBal(e.target.value)}><option>All balances</option><option>Outstanding</option><option>Cleared</option></select></>}
        actions={(r) => <Btn small disabled={!edit || r.cashHeld === 0} onClick={() => navigate(`/finance/cod/deposit?rider=${r.id}`)}>Record deposit</Btn>}
      />
      <div style={{ height: 14 }} />
      <Panel title="Deposit history" sub="Cash and transfers recorded against rider balances">
        <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Rider</th><th>Amount</th><th>Method</th><th>Received into</th><th>When</th><th>By</th></tr></thead>
          <tbody>{f.codRecords.map((c) => <tr key={c.id}><td><code>{c.ref}</code></td><td>{c.rider}</td><td><b>{kes(c.amount)}</b></td><td>{c.method}</td><td>{c.account}</td><td>{dateTime(c.at)}</td><td>{c.by}</td></tr>)}
            {!f.codRecords.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>No deposits recorded yet.</td></tr>}</tbody></table></div>
      </Panel>
    </>
  )
}

export function CodDeposit() {
  const { riders, openModal, toast, can } = useStore()
  const f = useFinance()
  const now = useNow()
  const wanted = useQuery().get('rider')
  const owing = riders.filter((r) => r.cashHeld > 0)
  const [riderId, setRiderId] = useState(owing.find((r) => r.id === wanted)?.id ?? owing[0]?.id ?? '')
  const [amount, setAmount] = useState(() => String(owing.find((r) => r.id === wanted)?.cashHeld ?? owing[0]?.cashHeld ?? ''))
  const [method, setMethod] = useState<string>(COD_METHODS[0])
  const [ref, setRef] = useState('')
  const [account, setAccount] = useState<string>(COD_ACCOUNTS[0])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const edit = can('Payments', 'Edit')
  const rider = riders.find((r) => r.id === riderId)
  const n = Number(amount)
  const checks: [string, boolean][] = [
    ['Amount does not exceed the rider’s balance', !!rider && Number.isInteger(n) && n > 0 && n <= rider.cashHeld],
    ['Reference is unique', ref.trim() !== '' && !f.codRecords.some((c) => c.ref.toLowerCase() === ref.trim().toLowerCase())],
  ]
  const pick = (id: string) => { setRiderId(id); setAmount(String(riders.find((r) => r.id === id)?.cashHeld ?? '')); setError('') }
  const save = () => {
    const bad = checks.find(([, ok]) => !ok)
    if (!rider) return setError('There are no riders holding cash.')
    if (bad) return setError(bad[0] + ' (check the amount and reference).')
    openModal({
      title: 'Confirm deposit record?',
      message: `${kes(n)} will be applied to ${rider.name}’s cash balance.`,
      confirm: 'Record deposit',
      onConfirm: () => {
        const e = f.recordCod(rider.id, n, method, ref, account, note)
        if (e) return setError(e)
        toast(`${kes(n)} recorded for ${rider.name}`)
        navigate('/finance/cod')
      },
    })
  }
  if (!owing.length) return <><PageHead title="Record COD deposit" desc="Log cash or bank deposits from a rider." actions={<Btn onClick={() => navigate('/finance/cod')}>← COD management</Btn>} /><Notice mark="✓" tone="success">No rider is holding cash right now.</Notice></>
  return (
    <>
      <PageHead title="Record COD deposit" desc="Log cash or bank deposits from a rider against their outstanding balance." actions={<><Btn onClick={() => navigate('/finance/cod')}>← COD management</Btn><Btn variant="primary" disabled={!edit} onClick={save}>Save deposit</Btn></>} />
      {!edit && <div style={{ marginBottom: 12 }}><Notice>Your role can view cash balances but not record deposits.</Notice></div>}
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Deposit details">
            <div className="sp-form2">
              <Field label="Rider" value={riderId} onChange={pick} options={owing.map((r) => ({ value: r.id, label: `${r.name} · holds ${kes(r.cashHeld)}` }))} />
              <Field label="Deposit date" value={new Date(now).toLocaleDateString('en-CA')} onChange={() => undefined} type="date" hint="Deposits are dated today." />
              <Field label="Amount received (KES)" value={amount} onChange={(v) => { setAmount(v); setError('') }} type="number" />
              <Field label="Deposit method" value={method} onChange={setMethod} options={COD_METHODS} />
              <Field label="Reference or receipt number" value={ref} onChange={(v) => { setRef(v); setError('') }} placeholder="For example BK-884120" />
              <Field label="Received into" value={account} onChange={setAccount} options={COD_ACCOUNTS} />
            </div>
            <Field label="Notes" multiline value={note} onChange={setNote} placeholder="Optional" />
            {error && <div className="sp-err" role="alert">{error}</div>}
          </Panel>
        </div>
        <div className="sp-stack">
          {rider && (
            <Panel title="Rider balance">
              <div className="sp-row" style={{ marginBottom: 6 }}><Person name={rider.name} size={40} /><div><b>{rider.name}</b><div className="panel-sub">{rider.id.toUpperCase()} · {rider.zone}</div></div></div>
              <Detail label="Cash held">{kes(rider.cashHeld)}</Detail>
              <Detail label="This deposit">{Number.isFinite(n) ? kes(n) : '—'}</Detail>
              <Detail label="After this deposit"><span style={{ color: 'var(--green)' }}>{kes(Math.max(0, rider.cashHeld - (Number.isFinite(n) ? n : 0)))}</span></Detail>
            </Panel>
          )}
          <Panel title="Deposit checks">
            {checks.map(([l, ok]) => <div className="list-row" key={l}><span style={{ fontSize: 11 }}>{l}</span><Badge tone={ok ? 'green' : 'amber'}>{ok ? 'Passed' : 'Check'}</Badge></div>)}
            <div className="list-row"><span style={{ fontSize: 11 }}>Receipt attachment</span><Badge tone="gray">Optional</Badge></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- rider payouts ------------------------------------------------------------------------------------------------

export function RiderPayouts() {
  const { payouts, riders, can, toast } = useStore()
  const f = useFinance()
  const [status, setStatus] = useState('All payout statuses')
  const edit = can('Payments', 'Edit')
  const inDraft = new Map(f.batches.filter((b) => b.status === 'Draft').flatMap((b) => b.payoutIds.map((id) => [id, b.id] as const)))
  const batchOf = (p: Payout) => f.batches.find((b) => b.payoutIds.includes(p.id))
  const label = (p: Payout) => (p.status === 'Paid' ? 'Paid' : p.status === 'Failed' ? 'Failed' : inDraft.has(p.id) ? 'In a batch' : 'Pending')
  const rows = payouts.filter((p) => status === 'All payout statuses' || label(p) === status)
  const waiting = payouts.filter((p) => label(p) === 'Pending' || label(p) === 'Failed')

  const batch = (ids: string[]) => {
    const id = f.createBatch(ids)
    if (!id) return toast('Those payouts are already paid or in another batch')
    navigate(`/finance/batch/${id}`)
  }
  const cols: Column<Payout>[] = [
    { key: 'id', header: 'Payout', render: (p) => <b>{p.id}</b> },
    { key: 'r', header: 'Rider', sort: (a, b) => a.rider.localeCompare(b.rider), render: (p) => (can('Riders', 'View') ? <button className="link-btn" onClick={() => navigate(`/riders/${p.riderId}`)}>{p.rider}</button> : p.rider) },
    { key: 'm', header: 'M-Pesa number', render: (p) => mask(riders.find((r) => r.id === p.riderId)?.phone ?? '') },
    { key: 'a', header: 'Net payout', sort: (a, b) => a.amount - b.amount, render: (p) => <b>{kes(p.amount)}</b> },
    { key: 'req', header: 'Requested', sort: (a, b) => a.requestedAt - b.requestedAt, render: (p) => dateTime(p.requestedAt) },
    { key: 'b', header: 'Batch', render: (p) => { const b = batchOf(p); return b ? <button className="link-btn" onClick={() => navigate(`/finance/batch/${b.id}`)}>{b.id}</button> : '—' } },
    { key: 's', header: 'Status', render: (p) => <Badge tone={label(p) === 'Paid' ? 'green' : label(p) === 'Failed' ? 'red' : label(p) === 'In a batch' ? 'blue' : 'amber'}>{label(p)}</Badge> },
  ]
  return (
    <>
      <PageHead title="Rider payouts" desc="Review earnings, group them into a batch and send them to M-Pesa." actions={<><Btn onClick={() => navigate('/finance/statements')}>Statements</Btn><Btn variant="primary" disabled={!edit || !waiting.filter((p) => !inDraft.has(p.id)).length} onClick={() => batch(waiting.map((p) => p.id))}>Create payout batch</Btn></>} />
      <Stats>
        <Stat label="Awaiting a batch" value={kes(waiting.filter((p) => !inDraft.has(p.id)).reduce((n, p) => n + p.amount, 0))} trend={`${waiting.filter((p) => !inDraft.has(p.id)).length} riders`} icon="₭" up={false} />
        <Stat label="In a batch, awaiting approval" value={kes(payouts.filter((p) => inDraft.has(p.id)).reduce((n, p) => n + p.amount, 0))} trend={`${f.batches.filter((b) => b.status === 'Draft').length} batches`} icon="✓" />
        <Stat label="Paid" value={kes(payouts.filter((p) => p.status === 'Paid').reduce((n, p) => n + p.amount, 0))} trend={`${payouts.filter((p) => p.status === 'Paid').length} riders`} icon="↗" />
        <Stat label="Failed" value={String(payouts.filter((p) => p.status === 'Failed').length)} trend="Add to a new batch to retry" icon="!" up={payouts.every((p) => p.status !== 'Failed')} />
      </Stats>
      <DataTable
        title="Rider payouts"
        rows={rows}
        rowKey={(p) => p.id}
        columns={cols}
        searchLabel="Search rider name or ID"
        searchText={(p) => `${p.id} ${p.rider}`}
        tools={<select className="sp-select auto" aria-label="Payout status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All payout statuses</option><option>Pending</option><option>In a batch</option><option>Paid</option><option>Failed</option></select>}
        bulk={{ label: 'Add to batch', onClick: (ids) => (edit ? batch(ids) : toast('Your role can’t create batches')) }}
        actions={(p) => (label(p) === 'Pending' || label(p) === 'Failed' ? <Btn small disabled={!edit} onClick={() => batch([p.id])}>{p.status === 'Failed' ? 'Retry' : 'Batch'}</Btn> : <span className="subtext">{label(p) === 'Paid' ? 'Sent' : 'In batch'}</span>)}
      />
    </>
  )
}

export function PayoutBatches({ id }: { id?: string }) {
  const f = useFinance()
  const { payouts, riders, openModal, toast, can } = useStore()
  const b = f.batches.find((x) => x.id === id)
  const edit = can('Payments', 'Edit')
  if (id && !b) return <NotFoundCard what="Payout batch" back="All batches" onBack={() => navigate('/finance/batch')} />
  if (!b) {
    return (
      <>
        <PageHead title="Payout batch" desc="Review rider totals and send approved earnings to M-Pesa." actions={<Btn variant="primary" onClick={() => navigate('/payouts')}>Create from rider payouts</Btn>} />
        {!f.batches.length ? <Notice>No batches yet. Choose riders on the Rider payouts page and create one.</Notice> : (
          <Panel title="Batches">
            <div className="table-wrap"><table><thead><tr><th>Batch</th><th>Riders</th><th>Total</th><th>Prepared by</th><th>Status</th><th /></tr></thead>
              <tbody>{f.batches.map((x) => <tr key={x.id}><td><b>{x.id}</b></td><td>{x.payoutIds.length}</td><td>{kes(payouts.filter((p) => x.payoutIds.includes(p.id)).reduce((n, p) => n + p.amount, 0))}</td><td>{x.createdBy}</td><td><Badge tone={x.status === 'Sent' ? 'green' : 'blue'}>{x.status === 'Sent' ? 'Sent' : 'Ready for approval'}</Badge></td><td><Btn small onClick={() => navigate(`/finance/batch/${x.id}`)}>Open</Btn></td></tr>)}</tbody></table></div>
          </Panel>
        )}
      </>
    )
  }
  return <BatchDetail b={b} edit={edit} riders={riders} payouts={payouts} send={() => openModal({ title: 'Approve and send payout batch?', message: `${kes(payouts.filter((p) => b.payoutIds.includes(p.id)).reduce((n, p) => n + p.amount, 0))} will be sent to ${b.payoutIds.length} riders’ M-Pesa accounts. This can’t be reversed.`, confirm: 'Approve and send', onConfirm: () => { const e = f.sendBatch(b.id); toast(e ?? 'Batch sent to M-Pesa') } })} />
}

function BatchDetail({ b, edit, riders, payouts, send }: { b: PayoutBatch; edit: boolean; riders: Rider[]; payouts: Payout[]; send: () => void }) {
  const f = useFinance()
  const { toast } = useStore()
  const [all] = useState(() => b.payoutIds)
  const list = payouts.filter((p) => all.includes(p.id))
  const [included, setIncluded] = useState<Set<string>>(() => new Set(b.payoutIds))
  const chosen = list.filter((p) => included.has(p.id))
  const total = chosen.reduce((n, p) => n + p.amount, 0)
  const sent = b.status === 'Sent'
  const toggle = (id: string, on: boolean) => {
    const next = new Set(included)
    if (on) next.add(id)
    else next.delete(id)
    setIncluded(next)
    f.updateBatch(b.id, { payoutIds: all.filter((x) => next.has(x)) })
  }
  return (
    <>
      <PageHead title="Payout batch" desc="Review rider totals and send approved earnings to M-Pesa." actions={<><Btn onClick={() => navigate('/finance/batch')}>← All batches</Btn><Btn variant="primary" disabled={!edit || sent || !chosen.length} onClick={send}>{sent ? 'Sent' : 'Approve and send'}</Btn></>} />
      <Steps steps={[{ label: 'Select riders', done: true }, { label: 'Review batch', done: true }, { label: 'Send to M-Pesa', done: sent }]} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title={`Batch ${b.id}`} sub={`Prepared by ${b.createdBy} · ${when(b.createdAt)}`} right={<Badge tone={sent ? 'green' : 'blue'}>{sent ? 'Sent' : 'Ready for approval'}</Badge>}>
            <div className="table-wrap"><table><thead><tr><th /><th>Rider</th><th>Net payout</th><th>M-Pesa number</th><th>Result</th></tr></thead>
              <tbody>{(sent ? payouts.filter((p) => b.payoutIds.includes(p.id)) : list).map((p) => (
                <tr key={p.id}><td><input type="checkbox" className="table-check" checked={included.has(p.id) || sent} disabled={sent || !edit} aria-label={`Include ${p.rider}`} onChange={(e) => toggle(p.id, e.target.checked)} /></td><td>{p.rider}</td><td><b>{kes(p.amount)}</b></td><td>{mask(riders.find((r) => r.id === p.riderId)?.phone ?? '')}</td><td>{sent ? <Badge tone={p.status === 'Paid' ? 'green' : 'red'}>{p.status === 'Paid' ? 'Paid' : 'Failed'}</Badge> : '—'}</td></tr>
              ))}</tbody></table></div>
          </Panel>
          <Panel title="Approver notes">
            <textarea className="sp-text" aria-label="Approver notes" placeholder="Add a note for the audit trail" value={b.note} disabled={sent || !edit} onChange={(e) => f.updateBatch(b.id, { note: e.target.value })} />
            <p className="panel-sub" style={{ marginTop: 6 }}>Notes are visible to finance staff.</p>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Batch summary">
            <Detail label="Riders selected">{chosen.length}</Detail>
            <Detail label="Processing fee">KES 0</Detail>
            <div className="sp-detail"><span>Total to send</span><b className="fin-total">{kes(total)}</b></div>
            {sent && <Detail label="Approved by">{b.approvedBy}</Detail>}
          </Panel>
          {!sent && <Notice tone="warning" mark="!">Check rider numbers and amounts before approving. M-Pesa payouts can’t be recalled once sent. The person who prepared a batch can’t approve it unless they’re an owner.</Notice>}
          {sent && list.some((p) => p.status === 'Failed') && <Notice tone="error" mark="!">Some payouts failed. Add them to a new batch from Rider payouts after checking the rider’s number.</Notice>}
          <Btn onClick={() => { downloadCsv(`${b.id}.csv`, ['Rider', 'M-Pesa', 'Amount (KES)'], chosen.map((p) => [p.rider, mask(riders.find((r) => r.id === p.riderId)?.phone ?? ''), p.amount])); toast('Batch file downloaded') }}>Download batch file</Btn>
        </div>
      </div>
    </>
  )
}

// ---- earnings statements ----------------------------------------------------------------------------------------------

interface Statement { id: string; rider: Rider; period: string; idx: number; trips: Order[]; earnings: number }

export function EarningsStatements() {
  const { orders, riders, zones, payouts, openDrawer, toast, can } = useStore()
  const now = useNow()
  const [period, setPeriod] = useState('All periods')
  const [paid, setPaid] = useState('All payment statuses')
  const d = new Date(now)
  const halves = (() => {
    const y = d.getFullYear(), m = d.getMonth()
    const mk = (yy: number, mm: number, h: 1 | 2) => ({ from: new Date(yy, mm, h === 1 ? 1 : 16).getTime(), to: h === 1 ? new Date(yy, mm, 16).getTime() : new Date(yy, mm + 1, 1).getTime(), label: `${monthLabel(monthKey(new Date(yy, mm, 1).getTime())).slice(0, 3)} ${h === 1 ? '1–15' : '16–end'}` })
    const list = d.getDate() >= 16 ? [mk(y, m, 2), mk(y, m, 1)] : [mk(y, m, 1)]
    const prev = new Date(y, m - 1, 1)
    return [...list, mk(prev.getFullYear(), prev.getMonth(), 2), mk(prev.getFullYear(), prev.getMonth(), 1)]
  })()
  const rows: Statement[] = halves.flatMap((h, idx) =>
    riders.flatMap((r) => {
      const trips = orders.filter((o) => o.riderId === r.id && o.status === 'Delivered' && o.placedAt >= h.from && o.placedAt < h.to)
      if (!trips.length) return []
      const earnings = trips.reduce((n, o) => n + o.fee * ((zones.find((z) => z.name === o.area)?.commission ?? 85) / 100), 0)
      return [{ id: `ES-${monthKey(h.from).replace('-', '')}${h.label.includes('1–15') ? 'A' : 'B'}-${r.id.toUpperCase()}`, rider: r, period: h.label, idx, trips, earnings: Math.round(earnings) }]
    }),
  )
  const state = (s: Statement) => (s.idx === 0 ? 'Accruing' : payouts.some((p) => p.riderId === s.rider.id && p.status !== 'Paid') && s.idx === 1 ? 'Pending' : 'Paid')
  const shown = rows.filter((s) => (period === 'All periods' || s.period === period) && (paid === 'All payment statuses' || state(s) === paid))
  const csv = (s: Statement) => { downloadCsv(`${s.id}.csv`, ['Order', 'Area', 'Delivery fee (KES)', 'Rider earning (KES)'], s.trips.map((o) => [o.id, o.area, o.fee, Math.round(o.fee * ((zones.find((z) => z.name === o.area)?.commission ?? 85) / 100))])); toast('Statement downloaded') }
  const cols: Column<Statement>[] = [
    { key: 'id', header: 'Statement', render: (s) => <b>{s.id}</b> },
    { key: 'r', header: 'Rider', sort: (a, b) => a.rider.name.localeCompare(b.rider.name), render: (s) => s.rider.name },
    { key: 'p', header: 'Period', render: (s) => s.period },
    { key: 'd', header: 'Deliveries', sort: (a, b) => a.trips.length - b.trips.length, render: (s) => s.trips.length },
    { key: 'e', header: 'Delivery earnings', sort: (a, b) => a.earnings - b.earnings, render: (s) => <b>{kes(s.earnings)}</b> },
    { key: 's', header: 'Payment', render: (s) => <Badge tone={state(s) === 'Paid' ? 'green' : state(s) === 'Pending' ? 'amber' : 'blue'}>{state(s)}</Badge> },
  ]
  return (
    <>
      <PageHead title="Rider earnings statements" desc="Rider-level earnings from delivery fees, with payment status." actions={<><Btn disabled={!can('Payments', 'Export')} onClick={() => { downloadCsv('earnings-statements.csv', ['Statement', 'Rider', 'Period', 'Deliveries', 'Earnings (KES)', 'Payment'], shown.map((s) => [s.id, s.rider.name, s.period, s.trips.length, s.earnings, state(s)])); toast('Statements exported') }}>Export statements</Btn><Btn variant="primary" onClick={() => navigate('/payouts')}>Review payouts</Btn></>} />
      <div style={{ marginBottom: 12 }}><Notice>Earnings are the rider’s share of each delivery fee, set per zone. Tips and incentives will be added once the rider app reports them.</Notice></div>
      <DataTable
        title={`${shown.length} statements`}
        rows={shown}
        rowKey={(s) => s.id}
        columns={cols}
        searchLabel="Search rider or statement ID"
        searchText={(s) => `${s.id} ${s.rider.name}`}
        tools={<><select className="sp-select auto" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}><option>All periods</option>{halves.map((h) => <option key={h.label}>{h.label}</option>)}</select><select className="sp-select auto" aria-label="Payment status" value={paid} onChange={(e) => setPaid(e.target.value)}><option>All payment statuses</option><option>Accruing</option><option>Pending</option><option>Paid</option></select></>}
        actions={(s) => <Btn small onClick={() => openDrawer({ title: `Statement ${s.id}`, body: <><Detail label="Rider">{s.rider.name}</Detail><Detail label="Period">{s.period}</Detail><Detail label="Deliveries">{s.trips.length}</Detail><Detail label="Earnings">{kes(s.earnings)}</Detail><div className="table-wrap" style={{ marginTop: 10 }}><table><thead><tr><th>Order</th><th>Area</th><th>Fee</th></tr></thead><tbody>{s.trips.map((o) => <tr key={o.id}><td>{o.id}</td><td>{o.area}</td><td>{kes(o.fee)}</td></tr>)}</tbody></table></div><div style={{ marginTop: 10 }}><Btn onClick={() => csv(s)}>Download CSV</Btn></div></> })}>View</Btn>}
      />
    </>
  )
}

// ---- store settlements ----------------------------------------------------------------------------------------------------

function PayStoreForm({ s }: { s: Settlement }) {
  const f = useFinance()
  const { closeModal, toast } = useStore()
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <Detail label="Store">{s.store}</Detail><Detail label="Period">{monthLabel(s.month)}</Detail><Detail label="Net payable">{kes(s.net)}</Detail>
      <div style={{ marginTop: 12 }}><Field label="Bank or M-Pesa reference" value={ref} onChange={(v) => { setRef(v); setErr('') }} error={err} /></div>
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { if (!ref.trim()) return setErr('Enter the payment reference'); f.paySettlement(s.id, ref.trim()); closeModal(); toast(`${s.store} marked as paid`) }}>Mark as paid</Btn></div>
    </>
  )
}

export function StoreSettlements() {
  const f = useFinance()
  const { openModal, can, toast } = useStore()
  const edit = can('Payments', 'Edit')
  const unpaid = f.settlements.filter((s) => !s.paid)
  const cols: Column<Settlement>[] = [
    { key: 's', header: 'Store', sort: (a, b) => a.store.localeCompare(b.store), render: (s) => <><b>{s.store}</b><span className="sp-sub">{s.id}</span></> },
    { key: 'm', header: 'Month', render: (s) => monthLabel(s.month) },
    { key: 'o', header: 'Delivered orders', render: (s) => s.orders },
    { key: 'g', header: 'Product sales', sort: (a, b) => a.sales - b.sales, render: (s) => kes(s.sales) },
    { key: 'c', header: `Commission (${f.settings.storeCommission}%)`, render: (s) => kes(s.commission) },
    { key: 'n', header: 'Net payable', sort: (a, b) => a.net - b.net, render: (s) => <b>{kes(s.net)}</b> },
    { key: 'st', header: 'Status', render: (s) => (s.paid ? <Badge tone="green">{`Paid · ${s.paid.ref}`}</Badge> : <Badge tone="amber">Payable</Badge>) },
  ]
  return (
    <>
      <PageHead title="Store settlements" desc="What ShopCore owes the partner stores it collects orders from, after its commission." actions={<><Btn onClick={() => navigate('/finance/settings')}>Commission settings</Btn><Btn disabled={!can('Payments', 'Export')} onClick={() => { downloadCsv('store-settlements.csv', ['Store', 'Month', 'Orders', 'Sales', 'Commission', 'Net payable', 'Status'], f.settlements.map((s) => [s.store, s.month, s.orders, s.sales, s.commission, s.net, s.paid ? 'Paid' : 'Payable'])); toast('Settlements exported') }}>Export</Btn></>} />
      <Stats>
        <Stat label="Payable to stores" value={kes(unpaid.reduce((n, s) => n + s.net, 0))} trend={`${unpaid.length} settlements`} icon="◈" up={unpaid.length === 0} />
        <Stat label="Commission earned" value={kes(f.settlements.reduce((n, s) => n + s.commission, 0))} trend={`${f.settings.storeCommission}% of product sales`} icon="%" />
        <Stat label="Paid out" value={kes(f.settlements.filter((s) => s.paid).reduce((n, s) => n + s.net, 0))} trend={`${f.settlements.filter((s) => s.paid).length} settlements`} icon="✓" />
      </Stats>
      <DataTable
        title="Settlements"
        rows={f.settlements}
        rowKey={(s) => s.id}
        columns={cols}
        searchLabel="Search store"
        searchText={(s) => `${s.store} ${s.month}`}
        actions={(s) => (s.paid ? <span className="subtext">{when(s.paid.at)}</span> : <Btn small disabled={!edit} onClick={() => openModal({ title: `Pay ${s.store}`, body: <PayStoreForm s={s} />, noActions: true })}>Mark paid</Btn>)}
        empty="No delivered orders to settle yet."
      />
    </>
  )
}
