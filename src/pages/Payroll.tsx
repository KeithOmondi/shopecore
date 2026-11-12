import { useState } from 'react'

import { Stats, Steps } from '../components/finance-ui'
import { Detail, NotFoundCard, useNow, when } from '../components/support-ui'
import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, Stat, downloadCsv, type Column } from '../components/ui'
import {
  calcSlip, monthKey, monthLabel, REMIT_KINDS, REMIT_TO, remitAmount, remitDue, runTotals, STATUTORY_DEFAULTS,
  type Adjust, type EmployeePay, type PayrollRun, type RemitKind, type RunLine, type RunStatus,
} from '../data/finance'
import { dateTime, kes } from '../lib/format'
import { useFinance } from '../lib/finance'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

const runTone = (s: RunStatus) => (s === 'Paid' ? 'green' : s === 'Approved' ? 'blue' : s === 'Pending approval' ? 'amber' : 'gray')

// ---- runs ----------------------------------------------------------------------------------------------------------

export function PayrollRuns() {
  const f = useFinance()
  const { can, toast, openModal } = useStore()
  const now = useNow()
  const cur = monthKey(now)
  const edit = can('Payroll', 'Create')
  const last = f.runs.find((r) => r.status === 'Paid')
  const unremitted = f.runs.flatMap((r) => REMIT_KINDS.filter((k) => !f.remitted[`${r.id}:${k}`] && r.status === 'Paid').map((k) => ({ r, k })))
  const overdue = unremitted.filter(({ r, k }) => now > remitDue(r.month, k))
  const prepare = () =>
    openModal({
      title: `Prepare payroll for ${monthLabel(cur)}?`,
      message: 'A draft is built from each active employee’s pay profile. You can add bonuses or deductions before submitting it for approval.',
      confirm: 'Prepare run',
      onConfirm: () => { const e = f.prepareRun(cur); if (e) toast(e); else navigate(`/finance/payroll/PR-${cur.replace('-', '')}`) },
    })
  const cols: Column<PayrollRun>[] = [
    { key: 'm', header: 'Month', sort: (a, b) => a.month.localeCompare(b.month), render: (r) => <button className="sp-link" onClick={() => navigate(`/finance/payroll/${r.id}`)}>{monthLabel(r.month)}</button> },
    { key: 's', header: 'Status', render: (r) => <Badge tone={runTone(r.status)}>{r.status}</Badge> },
    { key: 'e', header: 'Employees', render: (r) => r.lines.length },
    { key: 'g', header: 'Gross pay', render: (r) => kes(runTotals(r).gross) },
    { key: 'n', header: 'Net pay', render: (r) => <b>{kes(runTotals(r).net)}</b> },
    { key: 'c', header: 'Employer cost', render: (r) => kes(runTotals(r).employerCost) },
    { key: 'p', header: 'Prepared by', render: (r) => r.preparedBy },
    { key: 'a', header: 'Approved by', render: (r) => r.approvedBy ?? '—' },
  ]
  return (
    <>
      <PageHead title="Payroll runs" desc="Monthly pay for ShopCore’s office staff. Riders are paid per delivery under Rider payouts." actions={<Btn variant="primary" disabled={!edit || f.runs.some((r) => r.month === cur)} onClick={prepare}>{f.runs.some((r) => r.month === cur) ? `${monthLabel(cur)} prepared` : `Prepare ${monthLabel(cur)} run`}</Btn>} />
      <Stats>
        <Stat label="Last net pay" value={last ? kes(runTotals(last).net) : '—'} trend={last ? `${monthLabel(last.month)} · ${last.lines.length} employees` : 'No paid run yet'} icon="₭" />
        <Stat label="Employer cost, last run" value={last ? kes(runTotals(last).employerCost) : '—'} trend="Gross pay plus employer NSSF and housing levy" icon="▤" />
        <Stat label="Statutory payments due" value={kes(unremitted.reduce((n, { r, k }) => n + remitAmount(r, k), 0))} trend={overdue.length ? `${overdue.length} overdue` : `${unremitted.length} to pay`} icon="⚖" up={overdue.length === 0} />
      </Stats>
      {overdue.length > 0 && <div style={{ marginBottom: 12 }}><Notice tone="warning" mark="!"><b>{overdue.length} statutory payment{overdue.length === 1 ? ' is' : 's are'} overdue.</b> Late payment to KRA, NSSF or SHA attracts penalties. <button className="link-btn" onClick={() => navigate('/finance/payroll/remittances')}>Review remittances</button></Notice></div>}
      <DataTable title="Pay runs" rows={f.runs} rowKey={(r) => r.id} columns={cols} searchLabel="Search payroll runs" searchText={(r) => `${monthLabel(r.month)} ${r.status} ${r.preparedBy}`} actions={(r) => <Btn small onClick={() => navigate(`/finance/payroll/${r.id}`)}>Open</Btn>} />
    </>
  )
}

function AdjustForm({ run, line }: { run: PayrollRun; line: RunLine }) {
  const f = useFinance()
  const { closeModal, toast } = useStore()
  const [bonus, setBonus] = useState(String(line.adj.bonus))
  const [ded, setDed] = useState(String(line.adj.otherDeduction))
  const [note, setNote] = useState(line.adj.note)
  const [err, setErr] = useState('')
  const e = f.employeePay.find((p) => p.staffId === line.staffId)
  const adj: Adjust = { bonus: Math.max(0, Number(bonus) || 0), otherDeduction: Math.max(0, Number(ded) || 0), note }
  const preview = e ? calcSlip(e, f.statutory, adj) : line.slip
  return (
    <>
      <div className="sp-form2"><Field label="Bonus or overtime (KES)" type="number" value={bonus} onChange={setBonus} /><Field label="Other deduction (KES)" type="number" value={ded} onChange={setDed} hint="Salary advance, loan repayment" /></div>
      <Field label="Reason" value={note} onChange={(v) => { setNote(v); setErr('') }} error={err} />
      <Detail label="Gross pay">{kes(preview.gross)}</Detail><Detail label="PAYE">{kes(preview.paye)}</Detail><Detail label="Net pay">{kes(preview.net)}</Detail>
      <div className="sp-row end sp-gap"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { if ((adj.bonus || adj.otherDeduction) && !note.trim()) return setErr('Say why, so the change can be audited'); if (preview.net < 0) return setErr('Deductions are more than the pay.'); f.setRunAdjust(run.id, line.staffId, adj); closeModal(); toast('Pay line updated') }}>Save</Btn></div>
    </>
  )
}

function Payslip({ run, line }: { run: PayrollRun; line: RunLine }) {
  const s = line.slip
  const rows: [string, number, boolean?][] = [['Basic salary', s.basic], ['Allowances', s.allowances], ['Bonus or overtime', s.bonus], ['Gross pay', s.gross, true], ['NSSF', -s.nssf], ['SHIF', -s.shif], ['Housing levy', -s.housing], ['PAYE (after relief)', -s.paye], ['Other deductions', -s.otherDeduction], ['Net pay', s.net, true]]
  return (
    <>
      <p className="panel-sub" style={{ marginBottom: 8 }}>{line.name} · {line.role} · {monthLabel(run.month)}</p>
      {rows.filter(([, v]) => v !== 0 || false).map(([l, v, b]) => <div className="sp-detail" key={l}><span style={b ? { color: 'var(--ink)', fontWeight: 700 } : undefined}>{l}</span><b>{v < 0 ? `− ${kes(-v)}` : kes(v)}</b></div>)}
      <div className="sp-detail"><span>Taxable pay</span><b>{kes(s.taxable)}</b></div>
      <div className="sp-row" style={{ marginTop: 12 }}><Btn onClick={() => downloadCsv(`payslip-${line.name.replace(/\s/g, '-')}-${run.month}.csv`, ['Item', 'Amount (KES)'], rows.map(([l, v]) => [l, v]))}>Download</Btn><Btn onClick={() => window.print()}>Print</Btn></div>
    </>
  )
}

export function PayrollRunDetail({ id }: { id: string }) {
  const f = useFinance()
  const { openModal, openDrawer, toast, can, role } = useStore()
  const run = f.runs.find((r) => r.id === id)
  if (!run) return <NotFoundCard what="Payroll run" back="All payroll runs" onBack={() => navigate('/finance/payroll')} />
  const edit = can('Payroll', 'Edit')
  const t = runTotals(run)
  const act = (a: 'submit' | 'return' | 'approve' | 'pay', ok: string) => { const e = f.runAction(run.id, a); toast(e ?? ok) }
  const confirm = (a: 'submit' | 'return' | 'approve' | 'pay', title: string, message: string, ok: string, label: string) => openModal({ title, message, confirm: label, onConfirm: () => act(a, ok) })
  const cols: Column<RunLine>[] = [
    { key: 'n', header: 'Employee', sort: (a, b) => a.name.localeCompare(b.name), render: (l) => <><b>{l.name}</b><span className="sp-sub">{l.role}{l.adj.bonus || l.adj.otherDeduction ? ' · adjusted' : ''}</span></> },
    { key: 'g', header: 'Gross', sort: (a, b) => a.slip.gross - b.slip.gross, render: (l) => kes(l.slip.gross) },
    { key: 'ns', header: 'NSSF', render: (l) => kes(l.slip.nssf) },
    { key: 'sh', header: 'SHIF', render: (l) => kes(l.slip.shif) },
    { key: 'h', header: 'Housing', render: (l) => kes(l.slip.housing) },
    { key: 'p', header: 'PAYE', render: (l) => kes(l.slip.paye) },
    { key: 'o', header: 'Other', render: (l) => (l.slip.otherDeduction ? kes(l.slip.otherDeduction) : '—') },
    { key: 'net', header: 'Net pay', sort: (a, b) => a.slip.net - b.slip.net, render: (l) => <b>{kes(l.slip.net)}</b> },
  ]
  return (
    <>
      <PageHead
        title={`Payroll · ${monthLabel(run.month)}`}
        desc={`Prepared by ${run.preparedBy}${run.approvedBy ? ` · approved by ${run.approvedBy}` : ''}`}
        actions={
          <>
            <Btn onClick={() => navigate('/finance/payroll')}>← All runs</Btn>
            <Btn onClick={() => downloadCsv(`payroll-${run.month}.csv`, ['Employee', 'Role', 'Gross', 'NSSF', 'SHIF', 'Housing levy', 'PAYE', 'Other deductions', 'Net pay'], run.lines.map((l) => [l.name, l.role, l.slip.gross, l.slip.nssf, l.slip.shif, l.slip.housing, l.slip.paye, l.slip.otherDeduction, l.slip.net]))}>Download register</Btn>
            {run.status === 'Draft' && <Btn variant="primary" disabled={!edit} onClick={() => confirm('submit', 'Submit for approval?', 'An owner will review the run. You won’t be able to change pay lines until it’s returned.', 'Submitted for approval', 'Submit')}>Submit for approval</Btn>}
            {run.status === 'Pending approval' && <><Btn disabled={role !== 'Owner admin'} onClick={() => confirm('return', 'Return for changes?', 'The run goes back to draft so the preparer can fix it.', 'Returned to draft', 'Return')}>Return</Btn><Btn variant="primary" disabled={role !== 'Owner admin'} onClick={() => confirm('approve', 'Approve this payroll?', `Net pay of ${kes(t.net)} for ${run.lines.length} employees will be approved for payment.`, 'Payroll approved', 'Approve')}>Approve</Btn></>}
            {run.status === 'Approved' && <Btn variant="primary" disabled={!edit} onClick={() => confirm('pay', 'Mark as paid?', `Confirm that ${kes(t.net)} has been sent to staff through your bank or M-Pesa bulk payment. Statutory payments then fall due.`, 'Payroll marked as paid', 'Mark as paid')}>Mark as paid</Btn>}
          </>
        }
      />
      <Steps steps={[{ label: 'Draft', done: true }, { label: 'Submitted', done: run.status !== 'Draft' }, { label: 'Approved', done: run.status === 'Approved' || run.status === 'Paid' }, { label: 'Paid', done: run.status === 'Paid' }]} />
      {run.status === 'Pending approval' && role !== 'Owner admin' && <div style={{ marginBottom: 12 }}><Notice>This run is waiting for an owner to approve it.</Notice></div>}
      <div className="sp-two">
        <DataTable title={`${run.lines.length} employees`} rows={run.lines} rowKey={(l) => l.staffId} columns={cols} searchLabel="Search employee" searchText={(l) => `${l.name} ${l.role}`} pageSize={10}
          actions={(l) => <div className="sp-row"><Btn small onClick={() => openDrawer({ title: `Payslip · ${l.name}`, body: <Payslip run={run} line={l} /> })}>Payslip</Btn>{run.status === 'Draft' && <Btn small disabled={!edit} onClick={() => openModal({ title: `Adjust ${l.name}`, body: <AdjustForm run={run} line={l} />, noActions: true })}>Adjust</Btn>}</div>} />
        <div className="sp-stack">
          <Panel title="Run summary" right={<Badge tone={runTone(run.status)}>{run.status}</Badge>}>
            <Detail label="Gross pay">{kes(t.gross)}</Detail>
            <Detail label="Total deductions">{kes(t.gross - t.net)}</Detail>
            <div className="sp-detail"><span>Net pay to staff</span><b className="fin-total">{kes(t.net)}</b></div>
            <Detail label="Employer cost">{kes(t.employerCost)}</Detail>
            {run.paidAt && <Detail label="Paid">{dateTime(run.paidAt)}</Detail>}
          </Panel>
          <Panel title="Statutory payments" sub="Employee and employer shares together">
            <Detail label="PAYE (KRA)">{kes(t.paye)}</Detail><Detail label="NSSF">{kes(t.nssf)}</Detail><Detail label="SHIF (SHA)">{kes(t.shif)}</Detail><Detail label="Housing levy (KRA)">{kes(t.housing)}</Detail>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- employee pay profiles -------------------------------------------------------------------------------------------------

function ProfileForm({ staffId, name }: { staffId: string; name: string }) {
  const f = useFinance()
  const { closeModal, toast } = useStore()
  const cur = f.employeePay.find((p) => p.staffId === staffId)
  const [v, setV] = useState({ basic: String(cur?.basic ?? ''), house: String(cur?.house ?? 0), transport: String(cur?.transport ?? 0), kraPin: cur?.kraPin ?? '', nssfNo: cur?.nssfNo ?? '', shaNo: cur?.shaNo ?? '', payTo: cur?.payTo ?? '', start: cur?.start ?? '' })
  const [err, setErr] = useState<Record<string, string>>({})
  const set = (k: keyof typeof v) => (x: string) => { setV({ ...v, [k]: x }); setErr({}) }
  const save = () => {
    const e: Record<string, string> = {}
    if (!(Number(v.basic) > 0)) e.basic = 'Enter the monthly basic salary'
    if (!(Number(v.house) >= 0)) e.house = 'Enter 0 or more'
    if (!(Number(v.transport) >= 0)) e.transport = 'Enter 0 or more'
    if (v.kraPin && !/^[AP]\d{9}[A-Z]$/i.test(v.kraPin.trim())) e.kraPin = 'A KRA PIN looks like A123456789Z'
    if (!v.payTo.trim()) e.payTo = 'Where should the net pay go?'
    setErr(e)
    if (Object.keys(e).length) return
    f.setEmployeePay(staffId, { basic: Number(v.basic), house: Number(v.house), transport: Number(v.transport), kraPin: v.kraPin.trim().toUpperCase(), nssfNo: v.nssfNo.trim(), shaNo: v.shaNo.trim(), payTo: v.payTo.trim(), start: v.start })
    closeModal()
    toast(`${name}’s pay profile saved`)
  }
  return (
    <>
      <div className="sp-form2"><Field label="Basic salary (KES / month)" type="number" value={v.basic} onChange={set('basic')} error={err.basic} /><Field label="Start date" type="date" value={v.start} onChange={set('start')} /><Field label="House allowance" type="number" value={v.house} onChange={set('house')} error={err.house} /><Field label="Transport allowance" type="number" value={v.transport} onChange={set('transport')} error={err.transport} /></div>
      <div className="sp-form2"><Field label="KRA PIN" value={v.kraPin} onChange={set('kraPin')} error={err.kraPin} /><Field label="NSSF number" value={v.nssfNo} onChange={set('nssfNo')} /><Field label="SHA number" value={v.shaNo} onChange={set('shaNo')} /><Field label="Pay net salary to" value={v.payTo} onChange={set('payTo')} error={err.payTo} placeholder="Bank account or M-Pesa number" /></div>
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={save}>Save profile</Btn></div>
    </>
  )
}

function RatesForm() {
  const f = useFinance()
  const { toast, can } = useStore()
  const s = f.statutory
  const [v, setV] = useState({ nssfRate: String(s.nssfRate), nssfUpper: String(s.nssfUpper), shifRate: String(s.shifRate), shifMin: String(s.shifMin), housingRate: String(s.housingRate), relief: String(s.relief) })
  const [err, setErr] = useState('')
  const edit = can('Payroll', 'Edit')
  const set = (k: keyof typeof v) => (x: string) => { setV({ ...v, [k]: x }); setErr('') }
  const save = () => {
    const n = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)])) as Record<keyof typeof v, number>
    if (Object.values(n).some((x) => !Number.isFinite(x) || x < 0)) return setErr('Every rate needs a number of 0 or more.')
    if (n.nssfRate > 20 || n.shifRate > 10 || n.housingRate > 10) return setErr('One of the percentages looks too high. Check it.')
    f.setStatutory({ ...s, ...n })
    toast('Statutory rates saved. They apply to runs prepared from now on.')
  }
  return (
    <Panel title="Statutory rates" sub="Set by law and revised from time to time. Confirm these with your accountant.">
      <div className="sp-form2">
        <Field label="NSSF rate (%)" type="number" value={v.nssfRate} onChange={set('nssfRate')} /><Field label="NSSF upper earnings limit (KES)" type="number" value={v.nssfUpper} onChange={set('nssfUpper')} />
        <Field label="SHIF rate (%)" type="number" value={v.shifRate} onChange={set('shifRate')} /><Field label="SHIF minimum (KES)" type="number" value={v.shifMin} onChange={set('shifMin')} />
        <Field label="Housing levy, employee (%)" type="number" value={v.housingRate} onChange={set('housingRate')} /><Field label="Personal relief (KES / month)" type="number" value={v.relief} onChange={set('relief')} />
      </div>
      <p className="panel-sub">PAYE bands: {s.bands.map(([size, rate], i) => `${i === s.bands.length - 1 ? 'above that' : `next ${size.toLocaleString('en-US')}`} at ${rate}%`).join(', ')}. NSSF, SHIF and the housing levy are deducted before PAYE.</p>
      {err && <div className="sp-err" role="alert">{err}</div>}
      <div className="sp-row end sp-gap"><Btn disabled={!edit} onClick={() => { f.setStatutory(STATUTORY_DEFAULTS); toast('Defaults restored') }}>Restore defaults</Btn><Btn variant="primary" disabled={!edit} onClick={save}>Save rates</Btn></div>
    </Panel>
  )
}

export function EmployeePayProfiles() {
  const f = useFinance()
  const { staff, openModal, can, role } = useStore()
  const edit = can('Payroll', 'Edit')
  const rows = staff.filter((s) => s.status !== 'Suspended')
  const prof = (id: string) => f.employeePay.find((p) => p.staffId === id)
  const est = (p: EmployeePay) => calcSlip(p, f.statutory, { bonus: 0, otherDeduction: 0, note: '' })
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'n', header: 'Employee', sort: (a, b) => a.name.localeCompare(b.name), render: (s) => <><b>{s.name}</b><span className="sp-sub">{s.role}</span></> },
    { key: 'b', header: 'Basic', render: (s) => { const p = prof(s.id); return p ? kes(p.basic) : <Badge tone="amber">No profile</Badge> } },
    { key: 'a', header: 'Allowances', render: (s) => { const p = prof(s.id); return p ? kes(p.house + p.transport) : '—' } },
    { key: 'g', header: 'Est. net pay', render: (s) => { const p = prof(s.id); return p ? <b>{kes(est(p).net)}</b> : '—' } },
    { key: 'k', header: 'KRA PIN', render: (s) => prof(s.id)?.kraPin || '—' },
    { key: 'pt', header: 'Pay to', render: (s) => prof(s.id)?.payTo || '—' },
  ]
  return (
    <>
      <PageHead title="Employee pay profiles" desc="Salary, allowances and statutory numbers for each person on payroll." />
      <div style={{ marginBottom: 12 }}><Notice>Only Finance and owners can see this page. Salaries are never shown elsewhere in the admin.</Notice></div>
      <DataTable title={`${rows.length} staff`} rows={rows} rowKey={(s) => s.id} columns={cols} searchLabel="Search employee" searchText={(s) => `${s.name} ${s.role}`} actions={(s) => <Btn small disabled={!edit} onClick={() => openModal({ title: `Pay profile · ${s.name}`, body: <ProfileForm staffId={s.id} name={s.name} />, noActions: true })}>{prof(s.id) ? 'Edit' : 'Add profile'}</Btn>} />
      <div style={{ height: 14 }} />
      <RatesForm />
      {role !== 'Owner admin' && <p className="panel-sub" style={{ marginTop: 8 }}>Changes to salaries and rates are written to the audit log.</p>}
    </>
  )
}

// ---- remittances ----------------------------------------------------------------------------------------------------------------

interface RemitRow { key: string; run: PayrollRun; kind: RemitKind; amount: number; due: number }

function RemitForm({ row }: { row: RemitRow }) {
  const f = useFinance()
  const { closeModal, toast } = useStore()
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <Detail label="Payable to">{REMIT_TO[row.kind]}</Detail><Detail label="Month">{monthLabel(row.run.month)}</Detail><Detail label="Amount">{kes(row.amount)}</Detail>
      <div style={{ marginTop: 12 }}><Field label="Payment reference" value={ref} onChange={(v) => { setRef(v); setErr('') }} error={err} hint="The reference from iTax, NSSF or SHA." /></div>
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { if (!ref.trim()) return setErr('Enter the payment reference'); f.remit(row.run.id, row.kind, ref.trim()); closeModal(); toast(`${row.kind} marked as paid`) }}>Mark as paid</Btn></div>
    </>
  )
}

export function Remittances() {
  const f = useFinance()
  const { openModal, can } = useStore()
  const now = useNow()
  const edit = can('Payroll', 'Edit')
  const rows: RemitRow[] = f.runs.filter((r) => r.status === 'Paid').flatMap((r) => REMIT_KINDS.map((k) => ({ key: `${r.id}:${k}`, run: r, kind: k, amount: remitAmount(r, k), due: remitDue(r.month, k) }))).sort((a, b) => b.due - a.due)
  const open = rows.filter((r) => !f.remitted[r.key])
  const overdue = open.filter((r) => now > r.due)
  const cols: Column<RemitRow>[] = [
    { key: 'm', header: 'Payroll month', sort: (a, b) => a.run.month.localeCompare(b.run.month), render: (r) => monthLabel(r.run.month) },
    { key: 'k', header: 'Payment', render: (r) => <b>{r.kind}</b> },
    { key: 't', header: 'Payable to', render: (r) => REMIT_TO[r.kind] },
    { key: 'a', header: 'Amount', sort: (a, b) => a.amount - b.amount, render: (r) => <b>{kes(r.amount)}</b> },
    { key: 'd', header: 'Due', sort: (a, b) => a.due - b.due, render: (r) => dateTime(r.due).replace(/, .*/, '') },
    { key: 's', header: 'Status', render: (r) => f.remitted[r.key] ? <Badge tone="green">{`Paid · ${f.remitted[r.key]!.ref}`}</Badge> : now > r.due ? <Badge tone="red">Overdue</Badge> : <Badge tone="amber">Due</Badge> },
  ]
  return (
    <>
      <PageHead title="Statutory remittances" desc="PAYE, NSSF, SHIF and housing levy payments that fall due after each payroll." />
      <Stats>
        <Stat label="To pay" value={kes(open.reduce((n, r) => n + r.amount, 0))} trend={`${open.length} payments`} icon="⚖" up={open.length === 0} />
        <Stat label="Overdue" value={kes(overdue.reduce((n, r) => n + r.amount, 0))} trend={`${overdue.length} payments`} icon="!" up={overdue.length === 0} />
        <Stat label="Paid" value={kes(rows.filter((r) => f.remitted[r.key]).reduce((n, r) => n + r.amount, 0))} trend={`${rows.length - open.length} payments`} icon="✓" />
      </Stats>
      <div style={{ marginBottom: 12 }}><Notice>PAYE, SHIF and the housing levy are due by the 9th of the next month, and NSSF by the 15th. Pay them from the iTax, NSSF and SHA portals, then record the reference here.</Notice></div>
      <DataTable title="Payments" rows={rows} rowKey={(r) => r.key} columns={cols} searchLabel="Search payments" searchText={(r) => `${r.kind} ${monthLabel(r.run.month)}`} actions={(r) => (f.remitted[r.key] ? <span className="subtext">{when(f.remitted[r.key]!.at)}</span> : <Btn small disabled={!edit} onClick={() => openModal({ title: `Record ${r.kind} payment`, body: <RemitForm row={r} />, noActions: true })}>Mark paid</Btn>)} empty="Nothing to pay. Payments appear here once a payroll run is paid." />
    </>
  )
}
