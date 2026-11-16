import { useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, del, patch, post, postForText } from '../lib/api'
import { dateTime, kes } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
const money = (c: number) => kes(shillings(c))
const monthName = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
const thisMonth = () => new Date().toISOString().slice(0, 7)

// ---- invoices -------------------------------------------------------------------------------------------------------

interface Invoice { id: string; number: string; customer: string; contact: string; email: string; pin: string; address: string; issuedAt: string; dueAt: string; vatRate: number; draft: boolean; createdBy: string; version: number; subtotalCents: number; vatCents: number; totalCents: number; paidCents: number; balanceCents: number; status: 'Draft' | 'Sent' | 'Partly paid' | 'Paid' | 'Overdue' }
interface InvoiceFull extends Invoice { lines: { description: string; quantity: number; unitCents: number; amountCents: number }[]; payments: { amountCents: number; method: string; ref: string; by: string; at: string }[]; reminders: { at: string; by: string }[] }
const invTone = (s: Invoice['status']) => (s === 'Paid' ? 'green' : s === 'Overdue' ? 'red' : s === 'Draft' ? 'gray' : 'amber')

export function InvoicesList() {
  const { can } = useStore()
  const [status, setStatus] = useState('')
  const { data, failed, loading, reload } = useGet<{ items: Invoice[]; outstandingCents: number; overdueCents: number; overdueCount: number }>(`/v1/admin/invoices?limit=300${status ? `&status=${encodeURIComponent(status)}` : ''}`, 60_000)
  const cols: Column<Invoice>[] = [
    { key: 'n', header: 'Invoice', render: (i) => <button className="link-btn" onClick={() => navigate(`/finance/invoices/${i.id}`)}>{i.number}</button> },
    { key: 'c', header: 'Customer', render: (i) => <div><b>{i.customer}</b><div className="subtext">{i.contact}</div></div> },
    { key: 'd', header: 'Due', sort: (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt), render: (i) => dateTime(Date.parse(i.dueAt)).split(',')[0] },
    { key: 't', header: 'Total', sort: (a, b) => a.totalCents - b.totalCents, render: (i) => <b>{money(i.totalCents)}</b> },
    { key: 'b', header: 'Balance', render: (i) => money(i.balanceCents) },
    { key: 's', header: 'Status', render: (i) => <Badge tone={invTone(i.status)}>{i.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="Invoices" desc="Invoices for business customers." actions={<><Btn onClick={reload}>Refresh</Btn><Btn variant="primary" disabled={!can('Payments', 'Create')} onClick={() => navigate('/finance/invoices/new')}>New invoice</Btn></>} />
      <div className="tile-row"><Stat label="Outstanding" value={data ? money(data.outstandingCents) : '—'} trend="Not yet paid" icon="◈" /><Stat label="Overdue" value={data ? money(data.overdueCents) : '—'} trend={`${data?.overdueCount ?? 0} invoices`} icon="!" up={(data?.overdueCount ?? 0) === 0} /></div>
      <DataTable title="Invoices" rows={data?.items ?? []} rowKey={(i) => i.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the invoices.' : undefined} onRetry={reload} searchLabel="Search invoices" searchText={(i) => `${i.number} ${i.customer} ${i.contact}`} emptyTitle="No invoices yet" empty="Create an invoice for a business customer."
        tools={<select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['Draft', 'Sent', 'Partly paid', 'Paid', 'Overdue'].map((s) => <option key={s}>{s}</option>)}</select>}
        actions={(i) => <Btn small onClick={() => navigate(`/finance/invoices/${i.id}`)}>Open</Btn>} />
    </>
  )
}

export function InvoiceForm() {
  const { can, toast } = useStore()
  const [f, setF] = useState({ customer: '', contact: '', email: '', pin: '', address: '', dueInDays: '30' })
  const [lines, setLines] = useState([{ description: '', quantity: '1', unit: '' }])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const sub = lines.reduce((n, l) => n + (Number(l.quantity) || 0) * (Number(l.unit) || 0), 0)
  const save = async (draft: boolean) => {
    const e: Record<string, string> = {}
    if (!f.customer.trim()) e.customer = 'Who is this for?'
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email'
    const clean = lines.filter((l) => l.description.trim() || l.unit)
    if (!clean.length) e.lines = 'Add at least one line'
    if (clean.some((l) => !l.description.trim() || !Number.isInteger(Number(l.quantity)) || Number(l.quantity) < 1 || !(Number(l.unit) >= 0) || l.unit === '')) e.lines = 'Each line needs a description, a whole quantity and a price'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try { const r = await post<{ id: string }>('/v1/admin/invoices', { ...f, dueInDays: Number(f.dueInDays) || 30, draft, lines: clean.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitCents: Math.round(Number(l.unit) * 100) })) }); toast(draft ? 'Draft saved' : 'Invoice created'); navigate(`/finance/invoices/${r.id}`) } catch (err) { setErrors({ form: says(err) }) } finally { setBusy(false) }
  }
  if (!can('Payments', 'Create')) return <PageHead title="New invoice" desc="Your role can’t create invoices." actions={<Btn onClick={() => navigate('/finance/invoices')}>Back</Btn>} />
  return (
    <>
      <PageHead title="New invoice" desc="VAT is added to the total." actions={<Btn onClick={() => navigate('/finance/invoices')}>Cancel</Btn>} />
      {errors.form && <Notice tone="error" mark="!">{errors.form}</Notice>}
      <div className="sp-two">
        <Panel title="Customer">
          <Field label="Business or customer name" value={f.customer} onChange={set('customer')} error={errors.customer} />
          <div className="sp-form2"><Field label="Contact person" value={f.contact} onChange={set('contact')} /><Field label="Email" value={f.email} onChange={set('email')} error={errors.email} /><Field label="KRA PIN" value={f.pin} onChange={set('pin')} /><Field label="Due in (days)" value={f.dueInDays} onChange={set('dueInDays')} /></div>
          <Field label="Address" value={f.address} onChange={set('address')} />
        </Panel>
        <Panel title="Lines">
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input style={{ flex: 1 }} aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
              <input className="qty" aria-label="Quantity" value={l.quantity} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))} />
              <input className="qty" aria-label="Unit price (KES)" placeholder="Price" value={l.unit} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, unit: e.target.value } : x)))} />
              <Btn small disabled={lines.length === 1} label="Remove line" onClick={() => setLines(lines.filter((_, k) => k !== i))}>×</Btn>
            </div>
          ))}
          <Btn small onClick={() => setLines([...lines, { description: '', quantity: '1', unit: '' }])}>+ Add line</Btn>
          {errors.lines && <div className="field-error">{errors.lines}</div>}
          <SettingRow title="Subtotal" right={<b>{kes(sub)}</b>} />
          <div className="sp-row end"><Btn disabled={busy} onClick={() => void save(true)}>Save draft</Btn><Btn variant="primary" disabled={busy} onClick={() => void save(false)}>Create invoice</Btn></div>
        </Panel>
      </div>
    </>
  )
}

export function InvoiceDetail({ id }: { id: string }) {
  const { can, toast, openModal } = useStore()
  const { data: i, failed, reload } = useGet<InvoiceFull>(`/v1/admin/invoices/${id}`)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('M-Pesa')
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  if (!i) return <PageHead title="Invoice" desc={failed ? 'We couldn’t load this invoice.' : 'Loading…'} actions={<Btn onClick={() => navigate('/finance/invoices')}>Back</Btn>} />
  const edit = can('Payments', 'Edit')
  const run = async (what: () => Promise<unknown>, done: string) => { try { await what(); toast(done); reload() } catch (e) { toast(says(e)) } }
  const pay = async () => {
    const n = Number(amount)
    if (!(n > 0) || Math.round(n * 100) > i.balanceCents) return setErr(`Enter an amount up to ${money(i.balanceCents)}`)
    if (!ref.trim()) return setErr('Enter the payment reference')
    try { await post(`/v1/admin/invoices/${id}/payments`, { amountCents: Math.round(n * 100), method, ref: ref.trim() }); setAmount(''); setRef(''); setErr(''); toast('Payment recorded'); reload() } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <PageHead title={i.number} desc={`${i.customer} · due ${dateTime(Date.parse(i.dueAt)).split(',')[0]}`}
        actions={<>
          <Btn onClick={() => navigate('/finance/invoices')}>Back</Btn>
          <Btn onClick={() => window.print()}>Print</Btn>
          {i.draft && <Btn variant="primary" disabled={!edit} onClick={() => void run(() => post(`/v1/admin/invoices/${id}/send`), 'Invoice sent')}>Send</Btn>}
          {!i.draft && i.balanceCents > 0 && <Btn disabled={!edit} onClick={() => void run(() => post(`/v1/admin/invoices/${id}/remind`), 'Reminder sent')}>Send a reminder</Btn>}
          {i.draft && <Btn variant="danger" disabled={!edit} onClick={() => openModal({ title: `Delete ${i.number}?`, confirm: 'Delete draft', danger: true, onConfirm: () => { void del(`/v1/admin/invoices/${id}`).then(() => { toast('Draft deleted'); navigate('/finance/invoices') }, (e) => toast(says(e))) } })}>Delete draft</Btn>}
        </>} />
      <div className="sp-two">
        <section className="card table-card">
          <div className="table-head"><h2>Items</h2><Badge tone={invTone(i.status)}>{i.status}</Badge></div>
          <div className="table-wrap"><table><thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>{i.lines.map((l, k) => <tr key={k}><td>{l.description}</td><td>{l.quantity}</td><td>{money(l.unitCents)}</td><td><b>{money(l.amountCents)}</b></td></tr>)}</tbody></table></div>
          <div style={{ padding: '10px 15px' }}><SettingRow title="Subtotal" right={<span className="prod-name">{money(i.subtotalCents)}</span>} /><SettingRow title={`VAT ${i.vatRate}%`} right={<span className="prod-name">{money(i.vatCents)}</span>} /><SettingRow title="Total" right={<b>{money(i.totalCents)}</b>} /><SettingRow title="Paid" right={<span className="prod-name">{money(i.paidCents)}</span>} /><SettingRow title="Balance" right={<b>{money(i.balanceCents)}</b>} /></div>
        </section>
        <div className="sp-stack">
          <Panel title="Customer"><SettingRow title="Name" right={<span className="prod-name">{i.customer}</span>} /><SettingRow title="Contact" sub={i.email} right={<span className="prod-name">{i.contact || '—'}</span>} /><SettingRow title="KRA PIN" right={<span className="prod-name">{i.pin || '—'}</span>} /><SettingRow title="Address" sub={i.address} /></Panel>
          {!i.draft && i.balanceCents > 0 && (
            <Panel title="Record a payment">
              <div className="sp-form2"><Field label="Amount (KES)" value={amount} onChange={(v) => { setAmount(v); setErr('') }} /><Field label="Method" value={method} onChange={setMethod} options={['M-Pesa', 'Bank transfer', 'Cheque', 'Cash']} /></div>
              <Field label="Reference" value={ref} onChange={(v) => { setRef(v); setErr('') }} error={err} />
              <div className="sp-row end"><Btn variant="primary" disabled={!edit} onClick={() => void pay()}>Record payment</Btn></div>
            </Panel>
          )}
          <Panel title="Payments">{i.payments.length === 0 && <div className="panel-sub">None yet.</div>}{i.payments.map((p, k) => <SettingRow key={k} title={`${money(p.amountCents)} · ${p.method}`} sub={`${p.ref} · ${p.by} · ${dateTime(Date.parse(p.at))}`} />)}</Panel>
          {i.reminders.length > 0 && <Panel title="Reminders">{i.reminders.map((r, k) => <SettingRow key={k} title={dateTime(Date.parse(r.at))} sub={r.by} />)}</Panel>}
        </div>
      </div>
    </>
  )
}

// ---- reports --------------------------------------------------------------------------------------------------------

interface Sales { from: string; to: string; orders: number; totalCents: number; averageCents: number; byDay: { day: string; orders: number; totalCents: number }[]; byCategory: { name: string; totalCents: number }[]; byArea: { area: string; orders: number; totalCents: number }[]; topProducts: { name: string; units: number; totalCents: number }[] }

export function SalesReports() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const { data: s, failed, reload } = useGet<Sales>(`/v1/admin/reports/sales?from=${from}&to=${to}`)
  const max = Math.max(1, ...(s?.byDay.map((d) => d.totalCents) ?? [1]))
  return (
    <>
      <PageHead title="Sales reports" desc="What sold, where, and when." actions={<><Field label="" type="date" value={from} onChange={setFrom} /><Field label="" type="date" value={to} onChange={setTo} /><Btn onClick={reload}>Refresh</Btn></>} />
      {!s && <div className="panel-sub">{failed ? 'We couldn’t load the report.' : 'Loading…'}</div>}
      {s && (
        <>
          <div className="tile-row"><Stat label="Sales" value={money(s.totalCents)} trend={`${s.orders} orders`} icon="↗" /><Stat label="Average order" value={money(s.averageCents)} trend="Per paid order" icon="◈" /></div>
          <Panel title="Sales by day"><div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 110 }}>{s.byDay.map((d) => <div key={d.day} title={`${d.day}: ${money(d.totalCents)}`} style={{ flex: 1, background: 'var(--blue)', borderRadius: 2, height: `${Math.max(2, (d.totalCents / max) * 100)}%` }} />)}</div>{s.byDay.length === 0 && <div className="panel-sub">No sales in this period.</div>}</Panel>
          <div className="sp-two" style={{ marginTop: 14 }}>
            <Panel title="Top products">{s.topProducts.map((p) => <SettingRow key={p.name} title={p.name} sub={`${p.units} sold`} right={<b>{money(p.totalCents)}</b>} />)}</Panel>
            <Panel title="By category">{s.byCategory.map((c) => <SettingRow key={c.name} title={c.name} right={<b>{money(c.totalCents)}</b>} />)}</Panel>
            <Panel title="By area">{s.byArea.map((a) => <SettingRow key={a.area} title={a.area} sub={`${a.orders} orders`} right={<b>{money(a.totalCents)}</b>} />)}</Panel>
          </div>
        </>
      )}
    </>
  )
}

export function DeliveryCost() {
  const [month, setMonth] = useState(thisMonth)
  const { data, failed, loading, reload } = useGet<{ month: string; items: { area: string; deliveries: number; feesCents: number; riderPayCents: number; marginCents: number }[]; totals: { deliveries: number; feesCents: number; riderPayCents: number; marginCents: number } }>(`/v1/admin/reports/delivery-cost?month=${month}`)
  type R = NonNullable<typeof data>['items'][number]
  const cols: Column<R>[] = [
    { key: 'a', header: 'Area', render: (r) => r.area }, { key: 'd', header: 'Deliveries', render: (r) => r.deliveries },
    { key: 'f', header: 'Fees (without VAT)', render: (r) => money(r.feesCents) }, { key: 'r', header: 'Paid to riders', render: (r) => money(r.riderPayCents) },
    { key: 'm', header: 'Margin', render: (r) => <b style={{ color: r.marginCents < 0 ? 'var(--red)' : undefined }}>{money(r.marginCents)}</b> },
  ]
  return (
    <>
      <PageHead title="Delivery cost report" desc="What deliveries earn against what riders are paid." actions={<><Field label="" type="month" value={month} onChange={setMonth} /><Btn onClick={reload}>Refresh</Btn></>} />
      {data && <div className="tile-row"><Stat label="Deliveries" value={String(data.totals.deliveries)} trend={monthName(month)} icon="⌖" /><Stat label="Fees" value={money(data.totals.feesCents)} trend="Without VAT" icon="↗" /><Stat label="Rider pay" value={money(data.totals.riderPayCents)} trend="Fares, bonuses and tips" icon="◈" /><Stat label="Margin" value={money(data.totals.marginCents)} trend="Fees minus rider pay" icon="=" /></div>}
      <DataTable title="By area" rows={data?.items ?? []} rowKey={(r) => r.area} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the report.' : undefined} onRetry={reload} searchLabel="Search areas" searchText={(r) => r.area} emptyTitle="No deliveries" empty="Delivered orders appear here." />
    </>
  )
}

// ---- expenses -------------------------------------------------------------------------------------------------------

interface Expense { id: string; number: string; date: string; category: string; payee: string; description: string; amountCents: number; status: 'pending' | 'approved' | 'rejected'; by: string; decidedBy: string | null; note: string }

function ExpenseForm({ categories, onDone }: { categories: string[]; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), category: categories[0] ?? 'Other', payee: '', description: '', amount: '' })
  const [err, setErr] = useState('')
  const go = async () => {
    const n = Number(f.amount)
    if (!f.payee.trim()) return setErr('Who was paid?')
    if (!(n > 0)) return setErr('Enter the amount in shillings')
    try { await post('/v1/admin/expenses', { date: f.date, category: f.category, payee: f.payee.trim(), description: f.description.trim(), amountCents: Math.round(n * 100) }); onDone(); closeModal(); toast('Expense added') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <div className="sp-form2"><Field label="Date" type="date" value={f.date} onChange={(v) => setF((x) => ({ ...x, date: v }))} /><Field label="Category" value={f.category} onChange={(v) => setF((x) => ({ ...x, category: v }))} options={categories} /><Field label="Paid to" value={f.payee} onChange={(v) => { setF((x) => ({ ...x, payee: v })); setErr('') }} /><Field label="Amount (KES)" value={f.amount} onChange={(v) => { setF((x) => ({ ...x, amount: v })); setErr('') }} error={err} /></div>
      <Field label="What was it for?" value={f.description} onChange={(v) => setF((x) => ({ ...x, description: v }))} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Add expense</Btn></div>
    </>
  )
}

export function Expenses() {
  const { can, toast, openModal } = useStore()
  const [status, setStatus] = useState('')
  const { data, failed, loading, reload } = useGet<{ items: Expense[]; categories: string[]; limitCents: number; pendingCount: number; pendingCents: number; approvedThisMonthCents: number }>(`/v1/admin/expenses?limit=300${status ? `&status=${status}` : ''}`)
  const decide = async (e: Expense, to: 'approved' | 'rejected') => { try { await post(`/v1/admin/expenses/${e.id}/decision`, { to }); toast(to === 'approved' ? 'Expense approved' : 'Expense rejected'); reload() } catch (x) { toast(says(x)) } }
  const cols: Column<Expense>[] = [
    { key: 'n', header: 'Expense', render: (e) => e.number }, { key: 'd', header: 'Date', render: (e) => e.date },
    { key: 'p', header: 'Paid to', render: (e) => <div><b>{e.payee}</b><div className="subtext">{e.description}</div></div> }, { key: 'c', header: 'Category', render: (e) => e.category },
    { key: 'a', header: 'Amount', sort: (a, b) => a.amountCents - b.amountCents, render: (e) => <b>{money(e.amountCents)}</b> },
    { key: 's', header: 'Status', render: (e) => <Badge tone={e.status === 'approved' ? 'green' : e.status === 'rejected' ? 'red' : 'amber'}>{e.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="Expense tracking" desc={`Expenses above ${data ? money(data.limitCents) : 'the limit'} need a second person to approve.`} actions={<><Btn onClick={reload}>Refresh</Btn><Btn variant="primary" disabled={!can('Payments', 'Create')} onClick={() => openModal({ title: 'Add expense', body: <ExpenseForm categories={data?.categories?.length ? [...new Set([...data.categories, 'Other'])] : ['Marketing', 'Fuel & fleet', 'Software', 'Office & hub', 'Professional fees', 'Insurance', 'Other']} onDone={reload} />, noActions: true })}>Add expense</Btn></>} />
      <div className="tile-row"><Stat label="Approved this month" value={data ? money(data.approvedThisMonthCents) : '—'} trend="Counts against profit" icon="−" /><Stat label="Waiting for approval" value={data ? money(data.pendingCents) : '—'} trend={`${data?.pendingCount ?? 0} expenses`} icon="◷" up={(data?.pendingCount ?? 0) === 0} /></div>
      <DataTable title="Expenses" rows={data?.items ?? []} rowKey={(e) => e.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the expenses.' : undefined} onRetry={reload} searchLabel="Search expenses" searchText={(e) => `${e.number} ${e.payee} ${e.description} ${e.category}`} emptyTitle="No expenses" empty="Record what the business spends."
        tools={<select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="pending">Waiting</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>}
        actions={(e) => (e.status === 'pending' ? <div className="sp-row"><Btn small variant="primary" disabled={!can('Payments', 'Edit')} onClick={() => void decide(e, 'approved')}>Approve</Btn><Btn small disabled={!can('Payments', 'Edit')} onClick={() => void decide(e, 'rejected')}>Reject</Btn></div> : <span className="subtext">{e.decidedBy ?? ''}</span>)} />
    </>
  )
}

// ---- exports --------------------------------------------------------------------------------------------------------

export function ExportCenter() {
  const { can, toast } = useStore()
  const { data, failed, reload } = useGet<{ datasets: string[]; items: { id: string; number: string; name: string; dataset: string; format: string; rows: number; by: string; at: string }[] }>('/v1/admin/exports')
  const [dataset, setDataset] = useState('Payments')
  const [month, setMonth] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) })
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      const csv = await postForText('/v1/admin/exports', { dataset, format: 'CSV', month })
      const blob = new Blob([csv], { type: 'text/csv' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${dataset.toLowerCase().replace(/\s+/g, '-')}-${month}.csv`; a.click()
      toast('Export downloaded'); reload()
    } catch (e) { toast(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHead title="Export center" desc="Download your finance data as CSV. Every export is recorded." />
      <div className="sp-two">
        <Panel title="New export">
          <Field label="What to export" value={dataset} onChange={setDataset} options={data?.datasets ?? ['Payments']} />
          <Field label="Month (for monthly reports)" type="month" value={month} onChange={setMonth} />
          <div className="sp-row end"><Btn variant="primary" disabled={!can('Payments', 'Export') || busy} onClick={() => void go()}>{busy ? 'Preparing…' : 'Download CSV'}</Btn></div>
        </Panel>
        <Panel title="Recent exports">
          {failed && !data && <div className="panel-sub">We couldn’t load the history.</div>}
          {data?.items.length === 0 && <div className="panel-sub">Nothing exported yet.</div>}
          {data?.items.slice(0, 12).map((x) => <SettingRow key={x.id} title={`${x.number} · ${x.dataset}`} sub={`${x.rows} rows · ${x.by} · ${dateTime(Date.parse(x.at))}`} />)}
        </Panel>
      </div>
    </>
  )
}

// ---- period close ---------------------------------------------------------------------------------------------------

interface Close { month: string; checks: { key: string; title: string; ok: boolean; detail: string; to: string }[]; done: number; ready: boolean; closed: { by: string; at: string; note: string } | null; snapshot: { revenueCents: number; refundsCents: number; operatingCostsCents: number; netProfitCents: number } }

export function PeriodClose() {
  const { can, toast } = useStore()
  const [month, setMonth] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) })
  const { data: c, failed, reload } = useGet<Close>(`/v1/admin/periods/${month}`)
  const [note, setNote] = useState('')
  const act = async (what: () => Promise<unknown>, done: string) => { try { await what(); toast(done); reload() } catch (e) { toast(says(e)) } }
  return (
    <>
      <PageHead title="Financial period close" desc="Check everything is settled, then lock the month so its numbers can’t change." actions={<Field label="" type="month" value={month} onChange={setMonth} />} />
      {!c && <div className="panel-sub">{failed ? 'We couldn’t load this month.' : 'Loading…'}</div>}
      {c && (
        <div className="sp-two">
          <Panel title={`${monthName(c.month)} checklist`} right={<Badge tone={c.ready ? 'green' : 'amber'}>{`${c.done}/${c.checks.length} done`}</Badge>}>
            {c.checks.map((k) => <div className="list-row" key={k.key}><span><strong>{k.ok ? '✓ ' : '○ '}{k.title}</strong><small>{k.detail}</small></span>{!k.ok && <Btn small onClick={() => navigate(k.to)}>Open</Btn>}</div>)}
          </Panel>
          <div className="sp-stack">
            <Panel title="Month at a glance"><SettingRow title="Revenue" right={<b>{money(c.snapshot.revenueCents)}</b>} /><SettingRow title="Refunds" right={<span className="prod-name">{money(c.snapshot.refundsCents)}</span>} /><SettingRow title="Operating costs" right={<span className="prod-name">{money(c.snapshot.operatingCostsCents)}</span>} /><SettingRow title="Net profit" right={<b>{money(c.snapshot.netProfitCents)}</b>} /></Panel>
            <Panel title={c.closed ? 'Closed' : 'Close the month'}>
              {c.closed ? (
                <><Notice mark="✓">{`Closed by ${c.closed.by} on ${dateTime(Date.parse(c.closed.at))}${c.closed.note ? `: ${c.closed.note}` : ''}`}</Notice><div className="sp-row end"><Btn disabled={!can('Payments', 'Edit')} onClick={() => void act(() => del(`/v1/admin/periods/${month}`), 'Month reopened')}>Reopen</Btn></div></>
              ) : (
                <><Field label="Note (optional)" value={note} onChange={setNote} /><div className="sp-row end"><Btn variant="primary" disabled={!can('Payments', 'Edit') || !c.ready} onClick={() => void act(() => post(`/v1/admin/periods/${month}/close`, { note: note.trim() }), 'Month closed')}>Close the month</Btn></div>{!c.ready && <div className="panel-sub">Finish the checklist first.</div>}</>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}

// ---- finance settings -----------------------------------------------------------------------------------------------

interface FinSettings { cogsRate: number; storeCommission: number; processingFee: number; codWindowHours: number; expenseLimitCents: number; vatRate: number }

function SettingsEditor({ s, onSaved }: { s: FinSettings; onSaved: () => void }) {
  const { can, toast } = useStore()
  const [f, setF] = useState({ cogsRate: String(s.cogsRate), storeCommission: String(s.storeCommission), processingFee: String(s.processingFee), codWindowHours: String(s.codWindowHours), expenseLimit: String(shillings(s.expenseLimitCents)), vatRate: String(s.vatRate) })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  const save = async () => {
    try { await patch('/v1/admin/finance/settings', { cogsRate: Number(f.cogsRate), storeCommission: Number(f.storeCommission), processingFee: Number(f.processingFee), codWindowHours: Number(f.codWindowHours), expenseLimitCents: Math.round(Number(f.expenseLimit) * 100), vatRate: Number(f.vatRate) }); onSaved(); toast('Finance settings saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <Panel title="Rates and limits">
      <div className="sp-form2">
        <Field label="VAT rate (%)" value={f.vatRate} onChange={set('vatRate')} hint="Already inside your prices." />
        <Field label="Cost of goods (% of product sales)" value={f.cogsRate} onChange={set('cogsRate')} hint="An estimate used in profit and loss." />
        <Field label="Store commission (%)" value={f.storeCommission} onChange={set('storeCommission')} />
        <Field label="Payment processing cost (%)" value={f.processingFee} onChange={set('processingFee')} />
        <Field label="Cash hand-in window (hours)" value={f.codWindowHours} onChange={set('codWindowHours')} />
        <Field label="Expense approval limit (KES)" value={f.expenseLimit} onChange={set('expenseLimit')} error={err} hint="Bigger expenses need a second approver." />
      </div>
      <div className="sp-row end"><Btn variant="primary" disabled={!can('Payments', 'Edit')} onClick={() => void save()}>Save settings</Btn></div>
    </Panel>
  )
}

export function FinanceSettingsPage() {
  const { data, failed, reload } = useGet<FinSettings>('/v1/admin/finance/settings')
  return (
    <>
      <PageHead title="Finance settings" desc="The rates the finance reports use." />
      {!data && <div className="panel-sub">{failed ? 'We couldn’t load the settings.' : 'Loading…'}</div>}
      {data && <SettingsEditor key={JSON.stringify(data)} s={data} onSaved={reload} />}
    </>
  )
}

