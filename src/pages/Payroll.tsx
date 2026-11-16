import { useState } from 'react'

import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, patch, post } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
const money = (c: number) => kes(shillings(c))
const monthName = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleString('en-GB', { month: 'long', year: 'numeric' })

interface RunRow { id: string; month: string; status: string; state: 'draft' | 'pending_approval' | 'approved' | 'paid'; preparedBy: string; approvedBy: string | null; paidAt: string | null; people: number; grossCents: number; netCents: number }
interface Slip { basicCents: number; allowancesCents: number; bonusCents: number; grossCents: number; nssfCents: number; shifCents: number; housingCents: number; taxableCents: number; payeCents: number; netCents: number; employerNssfCents: number; employerHousingCents: number; [k: string]: number }
interface Line { staffId: string; name: string; role: string; note: string; payTo: string; adjust: { bonusCents: number; otherDeductionCents: number }; slip: Slip }
interface Run extends Omit<RunRow, 'people' | 'grossCents' | 'netCents'> { preparedById: string; version: number; lines: Line[]; totals: { grossCents: number; netCents: number; payeCents: number; nssfCents: number; shifCents: number; housingCents: number; employerCostCents: number }; remittances: { kind: string; to: string; amountCents: number; dueAt: string; paid: { ref: string; at: string; by: string } | null }[] }
const stateTone = (s: RunRow['state']) => (s === 'paid' ? 'green' : s === 'approved' ? 'blue' : s === 'pending_approval' ? 'amber' : 'gray')

// ---- runs -----------------------------------------------------------------------------------------------------------

export function PayrollRuns() {
  const { can, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: RunRow[] }>('/v1/admin/payroll/runs')
  const [month, setMonth] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) })
  const start = async () => { try { const r = await post<{ id: string }>('/v1/admin/payroll/runs', { month }); toast('Payroll run prepared'); navigate(`/finance/payroll/${r.id}`) } catch (e) { toast(says(e)) } }
  const cols: Column<RunRow>[] = [
    { key: 'm', header: 'Month', render: (r) => <button className="link-btn" onClick={() => navigate(`/finance/payroll/${r.id}`)}>{monthName(r.month)}</button> },
    { key: 'p', header: 'People', render: (r) => r.people },
    { key: 'g', header: 'Gross pay', render: (r) => money(r.grossCents) },
    { key: 'n', header: 'Net pay', render: (r) => <b>{money(r.netCents)}</b> },
    { key: 's', header: 'Status', render: (r) => <Badge tone={stateTone(r.state)}>{r.status}</Badge> },
    { key: 'b', header: 'Prepared by', render: (r) => r.preparedBy },
  ]
  return (
    <>
      <PageHead title="Payroll runs" desc="Prepare each month’s pay, have someone else approve it, then mark it paid." actions={<><Field label="" type="month" value={month} onChange={setMonth} /><Btn variant="primary" disabled={!can('Payroll', 'Create')} onClick={() => void start()}>Prepare a run</Btn></>} />
      <DataTable title="Runs" rows={data?.items ?? []} rowKey={(r) => r.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the payroll runs.' : undefined} onRetry={reload} searchLabel="Search runs" searchText={(r) => r.month} emptyTitle="No payroll runs yet" empty="Set up each person’s pay profile, then prepare the first run."
        actions={(r) => <Btn small onClick={() => navigate(`/finance/payroll/${r.id}`)}>Open</Btn>} />
    </>
  )
}

function AdjustForm({ runId, line, onDone }: { runId: string; line: Line; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [bonus, setBonus] = useState(String(shillings(line.adjust.bonusCents)))
  const [other, setOther] = useState(String(shillings(line.adjust.otherDeductionCents)))
  const [note, setNote] = useState(line.note)
  const [err, setErr] = useState('')
  const go = async () => {
    if (!(Number(bonus) >= 0) || !(Number(other) >= 0)) return setErr('Enter amounts in shillings')
    try { await post(`/v1/admin/payroll/runs/${runId}/adjust/${line.staffId}`, { bonusCents: Math.round(Number(bonus) * 100), otherDeductionCents: Math.round(Number(other) * 100), note: note.trim() }); onDone(); closeModal(); toast('Pay adjusted') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <div className="sp-form2"><Field label="Bonus (KES)" value={bonus} onChange={setBonus} /><Field label="Other deductions (KES)" value={other} onChange={setOther} /></div>
      <Field label="Why?" value={note} onChange={setNote} error={err} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Save</Btn></div>
    </>
  )
}

export function PayrollRunDetail({ id }: { id: string }) {
  const { can, toast, openModal } = useStore()
  const { data: r, failed, reload } = useGet<Run>(`/v1/admin/payroll/runs/${id}`)
  const [slip, setSlip] = useState<string | null>(null)
  const payslip = useGet<Line & { month: string }>(slip ? `/v1/admin/payroll/runs/${id}/payslips/${slip}` : null)
  if (!r) return <PageHead title="Payroll run" desc={failed ? 'We couldn’t load this run.' : 'Loading…'} actions={<Btn onClick={() => navigate('/finance/payroll')}>Back</Btn>} />
  const edit = can('Payroll', 'Edit')
  const act = async (action: 'submit' | 'return' | 'approve' | 'pay', done: string) => { try { await post(`/v1/admin/payroll/runs/${id}/action`, { action }); toast(done); reload() } catch (e) { toast(says(e)) } }
  const cols: Column<Line>[] = [
    { key: 'n', header: 'Employee', render: (l) => <div><b>{l.name}</b><div className="subtext">{l.role}</div></div> },
    { key: 'g', header: 'Gross', render: (l) => money(l.slip.grossCents) },
    { key: 'p', header: 'PAYE', render: (l) => money(l.slip.payeCents) },
    { key: 'd', header: 'NSSF · SHIF · Housing', render: (l) => money(l.slip.nssfCents + l.slip.shifCents + l.slip.housingCents) },
    { key: 'nt', header: 'Net pay', render: (l) => <b>{money(l.slip.netCents)}</b> },
  ]
  return (
    <>
      <PageHead title={`Payroll · ${monthName(r.month)}`} desc={`Prepared by ${r.preparedBy}`}
        actions={<>
          <Btn onClick={() => navigate('/finance/payroll')}>Back to runs</Btn>
          <Btn disabled={!r.lines.length} onClick={() => { downloadCsv(`payroll-${r.month}.csv`, ['Employee', 'Role', 'Gross', 'PAYE', 'NSSF', 'SHIF', 'Housing levy', 'Net'], r.lines.map((l) => [l.name, l.role, shillings(l.slip.grossCents), shillings(l.slip.payeCents), shillings(l.slip.nssfCents), shillings(l.slip.shifCents), shillings(l.slip.housingCents), shillings(l.slip.netCents)])) }}>Export</Btn>
          {r.state === 'draft' && <Btn variant="primary" disabled={!edit} onClick={() => void act('submit', 'Submitted for approval')}>Submit for approval</Btn>}
          {r.state === 'pending_approval' && <><Btn disabled={!edit} onClick={() => void act('return', 'Returned to draft')}>Send back</Btn><Btn variant="primary" disabled={!edit} onClick={() => void act('approve', 'Run approved')}>Approve</Btn></>}
          {r.state === 'approved' && <Btn variant="primary" disabled={!edit} onClick={() => openModal({ title: 'Mark as paid?', message: 'Do this once salaries have been sent.', confirm: 'Mark as paid', onConfirm: () => { void act('pay', 'Run marked as paid') } })}>Mark as paid</Btn>}
        </>} />
      <div className="tile-row">
        <Stat label="Status" value={r.status} trend={r.approvedBy ? `Approved by ${r.approvedBy}` : 'Not approved'} icon="◈" />
        <Stat label="Net pay" value={money(r.totals.netCents)} trend={`${r.lines.length} people`} icon="↗" />
        <Stat label="Gross pay" value={money(r.totals.grossCents)} trend="Before deductions" icon="▤" />
        <Stat label="Cost to the business" value={money(r.totals.employerCostCents)} trend="Gross plus employer contributions" icon="=" />
      </div>
      <DataTable title="Pay for the month" rows={r.lines} rowKey={(l) => l.staffId} columns={cols} searchLabel="Search employees" searchText={(l) => `${l.name} ${l.role}`} emptyTitle="Nobody is on this run" empty="Add pay profiles for your staff first."
        actions={(l) => <div className="sp-row"><Btn small onClick={() => setSlip(l.staffId)}>Payslip</Btn>{r.state === 'draft' && <Btn small disabled={!edit} onClick={() => openModal({ title: `Adjust ${l.name}`, body: <AdjustForm runId={id} line={l} onDone={reload} />, noActions: true })}>Adjust</Btn>}</div>} />
      {slip && payslip.data && (
        <div style={{ marginTop: 14 }}>
          <Panel title={`Payslip · ${payslip.data.name}`} sub={monthName(r.month)} right={<span className="sp-row"><Btn small onClick={() => window.print()}>Print</Btn><Btn small onClick={() => setSlip(null)}>Close</Btn></span>}>
            {([['Basic pay', 'basicCents'], ['Allowances', 'allowancesCents'], ['Bonus', 'bonusCents'], ['Gross pay', 'grossCents'], ['NSSF', 'nssfCents'], ['SHIF', 'shifCents'], ['Housing levy', 'housingCents'], ['Taxable pay', 'taxableCents'], ['PAYE', 'payeCents']] as const).map(([label, key]) => <SettingRow key={key} title={label} right={<span className="prod-name">{money(payslip.data!.slip[key]!)}</span>} />)}
            <SettingRow title="Net pay" right={<b>{money(payslip.data.slip.netCents)}</b>} />
          </Panel>
        </div>
      )}
    </>
  )
}

// ---- pay profiles ---------------------------------------------------------------------------------------------------

interface Profile { staffId: string; name: string; role: string; status: string; basicCents: number; houseCents: number; transportCents: number; kraPin: string; nssfNo: string; shaNo: string; payTo: string; startDate: string | null; hasProfile: boolean }

function ProfileForm({ p, onDone }: { p: Profile; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ basic: String(shillings(p.basicCents)), house: String(shillings(p.houseCents)), transport: String(shillings(p.transportCents)), kraPin: p.kraPin, nssfNo: p.nssfNo, shaNo: p.shaNo, payTo: p.payTo, startDate: p.startDate ?? '' })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  const go = async () => {
    if (![f.basic, f.house, f.transport].every((v) => Number(v) >= 0 && v !== '')) return setErr('Enter pay amounts in shillings (0 if none)')
    try { await patch(`/v1/admin/payroll/profiles/${p.staffId}`, { basicCents: Math.round(Number(f.basic) * 100), houseCents: Math.round(Number(f.house) * 100), transportCents: Math.round(Number(f.transport) * 100), kraPin: f.kraPin, nssfNo: f.nssfNo, shaNo: f.shaNo, payTo: f.payTo, startDate: f.startDate || null }); onDone(); closeModal(); toast('Pay profile saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <div className="sp-form2"><Field label="Basic pay (KES a month)" value={f.basic} onChange={set('basic')} error={err} /><Field label="House allowance" value={f.house} onChange={set('house')} /><Field label="Transport allowance" value={f.transport} onChange={set('transport')} /><Field label="Start date" type="date" value={f.startDate} onChange={set('startDate')} /><Field label="KRA PIN" value={f.kraPin} onChange={set('kraPin')} /><Field label="NSSF number" value={f.nssfNo} onChange={set('nssfNo')} /><Field label="SHA number" value={f.shaNo} onChange={set('shaNo')} /><Field label="Pay to (M-Pesa or bank)" value={f.payTo} onChange={set('payTo')} /></div>
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Save profile</Btn></div>
    </>
  )
}

export function EmployeePayProfiles() {
  const { can, openModal } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Profile[] }>('/v1/admin/payroll/profiles')
  const cols: Column<Profile>[] = [
    { key: 'n', header: 'Employee', render: (p) => <div><b>{p.name}</b><div className="subtext">{p.role}</div></div> },
    { key: 'b', header: 'Basic', sort: (a, b) => a.basicCents - b.basicCents, render: (p) => (p.hasProfile ? money(p.basicCents) : <Badge tone="amber">Not set up</Badge>) },
    { key: 'a', header: 'Allowances', render: (p) => money(p.houseCents + p.transportCents) },
    { key: 'k', header: 'KRA PIN', render: (p) => p.kraPin || '—' },
    { key: 'pt', header: 'Pay to', render: (p) => p.payTo || '—' },
  ]
  return (
    <>
      <PageHead title="Employee pay profiles" desc="Each person’s pay and tax details. Payroll runs use these." />
      <DataTable title="Employees" rows={(data?.items ?? []).filter((p) => p.status !== 'suspended')} rowKey={(p) => p.staffId} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the profiles.' : undefined} onRetry={reload} searchLabel="Search employees" searchText={(p) => `${p.name} ${p.role}`} emptyTitle="No staff" empty="Add your team under Staff first."
        actions={(p) => <Btn small disabled={!can('Payroll', 'Edit')} onClick={() => openModal({ title: `Pay profile · ${p.name}`, body: <ProfileForm p={p} onDone={reload} />, noActions: true })}>{p.hasProfile ? 'Edit' : 'Set up'}</Btn>} />
    </>
  )
}

// ---- remittances ----------------------------------------------------------------------------------------------------

function RemitForm({ runId, kind, onDone }: { runId: string; kind: string; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  const go = async () => { try { await post(`/v1/admin/payroll/runs/${runId}/remittances`, { kind, ref: ref.trim() }); onDone(); closeModal(); toast(`${kind} recorded as paid`) } catch (e) { setErr(says(e)) } }
  return (
    <>
      <Field label="Payment reference" value={ref} onChange={(v) => { setRef(v); setErr('') }} error={err} hint="From the KRA, NSSF or SHA payment you made." />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Record payment</Btn></div>
    </>
  )
}

export function Remittances() {
  const { can, openModal } = useStore()
  const runs = useGet<{ items: RunRow[] }>('/v1/admin/payroll/runs')
  const [runId, setRunId] = useState('')
  const paid = (runs.data?.items ?? []).filter((r) => r.state === 'approved' || r.state === 'paid')
  const id = runId || paid[0]?.id || ''
  const run = useGet<Run>(id ? `/v1/admin/payroll/runs/${id}` : null)
  return (
    <>
      <PageHead title="Statutory remittances" desc="What you owe KRA, NSSF and SHA after each payroll, and when it is due." actions={paid.length > 0 ? <Field label="" value={id} onChange={setRunId} options={paid.map((r) => ({ value: r.id, label: monthName(r.month) }))} /> : undefined} />
      {runs.data && paid.length === 0 && <Notice mark="i">Remittances appear once a payroll run has been approved.</Notice>}
      {run.data && (
        <Panel title={monthName(run.data.month)}>
          {run.data.remittances.map((m) => (
            <div className="list-row" key={m.kind}>
              <span><strong>{m.kind}</strong><small>{`To ${m.to} · due ${dateTime(Date.parse(m.dueAt)).split(',')[0]}`}</small></span>
              <span className="sp-row"><b>{money(m.amountCents)}</b>{m.paid ? <Badge tone="green">{`Paid · ${m.paid.ref}`}</Badge> : <Btn small disabled={!can('Payroll', 'Edit') || run.data!.state === 'draft'} onClick={() => openModal({ title: `Record ${m.kind} payment`, body: <RemitForm runId={run.data!.id} kind={m.kind} onDone={run.reload} />, noActions: true })}>Record payment</Btn>}</span>
            </div>
          ))}
        </Panel>
      )}
    </>
  )
}
