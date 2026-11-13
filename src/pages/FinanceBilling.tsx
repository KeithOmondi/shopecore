import { useState } from 'react'

import { Bars, MonthSelect, monthOptions, saveRows, Stats } from '../components/finance-ui'
import { Detail, NotFoundCard, useNow, when } from '../components/support-ui'
import { PermissionDenied } from '../components/states'
import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, Stat, type Column } from '../components/ui'
import {
  EXPORT_DATASETS, EXPORT_FORMATS, EXPENSE_CATEGORIES, invoiceBalance, invoicePaid, invoiceStatus, invoiceSubtotal, invoiceTotal, invoiceVat, monthEnd, monthKey, monthLabel, monthStart, runTotals,
  type Expense, type ExportDataset, type ExportJob, type Invoice, type InvoiceLine, type InvoiceStatus,
} from '../data/finance'
import { dayKey, dateTime, kes } from '../lib/format'
import { computePnl, pctOf } from '../lib/finance-calc'
import { useFinance, vatIn } from '../lib/finance'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useDirty, useUnsavedGuard } from '../lib/unsaved'

const DAY = 86_400_000
const invTone = (s: InvoiceStatus) => (s === 'Paid' ? 'green' : s === 'Overdue' ? 'red' : s === 'Draft' ? 'gray' : 'blue')

// ---- invoices ----------------------------------------------------------------------------------------------------

export function InvoicesList() {
  const f = useFinance()
  const { can, toast } = useStore()
  const now = useNow()
  const [status, setStatus] = useState('All invoice statuses')
  const live = f.invoices.filter((i) => !i.draft)
  const rows = f.invoices.filter((i) => status === 'All invoice statuses' || invoiceStatus(i, now) === status)
  const cols: Column<Invoice>[] = [
    { key: 'id', header: 'Invoice', sort: (a, b) => a.id.localeCompare(b.id), render: (i) => <button className="sp-link" onClick={() => navigate(`/finance/invoices/${i.id}`)}>{i.id}</button> },
    { key: 'c', header: 'Business', sort: (a, b) => a.customer.localeCompare(b.customer), render: (i) => i.customer },
    { key: 'is', header: 'Issued', sort: (a, b) => a.issued - b.issued, render: (i) => dateTime(i.issued).replace(/, .*/, '') },
    { key: 'd', header: 'Due', render: (i) => dateTime(i.due).replace(/, .*/, '') },
    { key: 'a', header: 'Amount', sort: (a, b) => invoiceTotal(a) - invoiceTotal(b), render: (i) => kes(invoiceTotal(i)) },
    { key: 'b', header: 'Balance', render: (i) => <b>{kes(invoiceBalance(i))}</b> },
    { key: 's', header: 'Status', render: (i) => <Badge tone={invTone(invoiceStatus(i, now))}>{invoiceStatus(i, now)}</Badge> },
  ]
  return (
    <>
      <PageHead title="Invoices list" desc="Issue and track business invoices, payment status and outstanding balances." actions={<><Btn disabled={!can('Payments', 'Export')} onClick={() => { saveRows('invoices', ['Invoice', 'Business', 'Issued', 'Due', 'Total', 'Balance', 'Status'], f.invoices.map((i) => [i.id, i.customer, new Date(i.issued).toISOString().slice(0, 10), new Date(i.due).toISOString().slice(0, 10), invoiceTotal(i), invoiceBalance(i), invoiceStatus(i, now)]), 'CSV'); toast('Invoices exported') }}>Export</Btn><Btn variant="primary" disabled={!can('Payments', 'Create')} onClick={() => navigate('/finance/invoices/new')}>+ Create invoice</Btn></>} />
      <Stats>
        <Stat label="Outstanding" value={kes(live.reduce((n, i) => n + invoiceBalance(i), 0))} trend={`${live.filter((i) => invoiceBalance(i) > 0).length} invoices`} icon="₭" />
        <Stat label="Overdue" value={kes(live.filter((i) => invoiceStatus(i, now) === 'Overdue').reduce((n, i) => n + invoiceBalance(i), 0))} trend={`${live.filter((i) => invoiceStatus(i, now) === 'Overdue').length} invoices`} icon="!" up={false} />
        <Stat label="Collected" value={kes(live.reduce((n, i) => n + invoicePaid(i), 0))} trend="Payments recorded" icon="✓" />
        <Stat label="Drafts" value={String(f.invoices.filter((i) => i.draft).length)} trend="Not sent yet" icon="✎" />
      </Stats>
      <DataTable title="Invoices" rows={rows} rowKey={(i) => i.id} columns={cols} searchLabel="Search invoice or business" emptyTitle="No invoices yet" empty="Create an invoice to bill a business account." emptyAction={can('Payments', 'Create') ? { label: 'Create an invoice', onClick: () => navigate('/finance/invoices/new') } : undefined} searchText={(i) => `${i.id} ${i.customer} ${i.contact}`}
        tools={<select className="sp-select auto" aria-label="Invoice status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All invoice statuses</option>{['Draft', 'Sent', 'Partly paid', 'Paid', 'Overdue'].map((s) => <option key={s}>{s}</option>)}</select>}
        actions={(i) => <Btn small onClick={() => navigate(`/finance/invoices/${i.id}`)}>Open</Btn>} />
    </>
  )
}

export function InvoiceForm() {
  const f = useFinance()
  const { toast, business } = useStore()
  const [customer, setCustomer] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [address, setAddress] = useState('')
  const [terms, setTerms] = useState('30')
  const [lines, setLines] = useState<{ desc: string; qty: string; unit: string }[]>([{ desc: '', qty: '1', unit: '' }])
  const [err, setErr] = useState<Record<string, string>>({})
  const unsaved = useUnsavedGuard(useDirty({ customer, contact, email, pin, address, terms, lines }))
  const parsed: InvoiceLine[] = lines.map((l) => ({ desc: l.desc.trim(), qty: Number(l.qty), unit: Number(l.unit) }))
  const sub = parsed.reduce((n, l) => n + (l.qty > 0 && l.unit > 0 ? l.qty * l.unit : 0), 0)
  const vatRate = Number(business.vat) || 16
  const setLine = (i: number, k: 'desc' | 'qty' | 'unit', v: string) => setLines(lines.map((l, x) => (x === i ? { ...l, [k]: v } : l)))
  const save = (draft: boolean) => {
    const e: Record<string, string> = {}
    if (!customer.trim()) e.customer = 'Enter the business name'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = 'Enter a valid billing email'
    if (parsed.some((l) => !l.desc || !(l.qty > 0) || !(l.unit > 0))) e.lines = 'Every line needs a description, a quantity and a price'
    setErr(e)
    if (Object.keys(e).length) return
    const now = Date.now()
    const id = f.addInvoice({ customer: customer.trim(), contact: contact.trim(), email: email.trim(), pin: pin.trim(), address: address.trim() || 'Nairobi, Kenya', issued: now, due: now + Number(terms) * DAY, lines: parsed, vatRate, draft })
    toast(draft ? 'Draft saved' : 'Invoice created')
    unsaved()
    navigate(`/finance/invoices/${id}`)
  }
  return (
    <>
      <PageHead title="Create invoice" desc="Bill a business account for orders and delivery fees." actions={<><Btn onClick={() => navigate('/finance/invoices')}>Cancel</Btn><Btn onClick={() => save(true)}>Save draft</Btn><Btn variant="primary" onClick={() => save(false)}>Create invoice</Btn></>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Bill to">
            <div className="sp-form2"><Field label="Business name" value={customer} onChange={setCustomer} error={err.customer} /><Field label="Contact person" value={contact} onChange={setContact} /><Field label="Billing email" value={email} onChange={setEmail} error={err.email} /><Field label="KRA PIN" value={pin} onChange={setPin} /></div>
            <Field label="Address" value={address} onChange={setAddress} />
          </Panel>
          <Panel title="Line items" right={<Btn small onClick={() => setLines([...lines, { desc: '', qty: '1', unit: '' }])}>+ Add line</Btn>}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 80px 120px auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <Field label={i === 0 ? 'Description' : ''} value={l.desc} onChange={(v) => setLine(i, 'desc', v)} />
                <Field label={i === 0 ? 'Qty' : ''} value={l.qty} onChange={(v) => setLine(i, 'qty', v)} type="number" />
                <Field label={i === 0 ? 'Unit price' : ''} value={l.unit} onChange={(v) => setLine(i, 'unit', v)} type="number" />
                <Btn small disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, x) => x !== i))} label="Remove line">×</Btn>
              </div>
            ))}
            {err.lines && <div className="sp-err" role="alert">{err.lines}</div>}
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Terms and totals">
            <Field label="Payment terms" value={terms} onChange={setTerms} options={[{ value: '14', label: 'Net 14 days' }, { value: '30', label: 'Net 30 days' }, { value: '45', label: 'Net 45 days' }]} />
            <Detail label="Subtotal">{kes(sub)}</Detail>
            <Detail label={`VAT (${vatRate}%)`}>{kes(Math.round(sub * (vatRate / 100)))}</Detail>
            <div className="sp-detail"><span>Total due</span><b className="fin-total">{kes(sub + Math.round(sub * (vatRate / 100)))}</b></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

function PayForm({ inv }: { inv: Invoice }) {
  const f = useFinance()
  const { closeModal, toast } = useStore()
  const [amount, setAmount] = useState(String(invoiceBalance(inv)))
  const [method, setMethod] = useState('Bank transfer')
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <Field label="Amount received (KES)" type="number" value={amount} onChange={(v) => { setAmount(v); setErr('') }} hint={`Balance ${kes(invoiceBalance(inv))}`} />
      <Field label="Method" value={method} onChange={setMethod} options={['Bank transfer', 'M-Pesa', 'Cheque', 'Cash']} />
      <Field label="Reference" value={ref} onChange={(v) => { setRef(v); setErr('') }} error={err} />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { const n = Number(amount); if (!Number.isInteger(n) || n <= 0) return setErr('Enter the amount in whole shillings'); if (!ref.trim()) return setErr('Enter a reference'); const e = f.recordInvoicePayment(inv.id, { amount: n, method, ref: ref.trim() }); if (e) return setErr(e); closeModal(); toast('Payment recorded') }}>Record payment</Btn></div>
    </>
  )
}

export function InvoiceDetail({ id }: { id: string }) {
  const f = useFinance()
  const { openModal, toast, can } = useStore()
  const now = useNow()
  const inv = f.invoices.find((i) => i.id === id)
  if (!inv) return <NotFoundCard what="Invoice" back="Back to invoices" onBack={() => navigate('/finance/invoices')} />
  const edit = can('Payments', 'Edit')
  const st = invoiceStatus(inv, now)
  return (
    <>
      <PageHead title="Invoice detail" desc="Business account invoice with line items and payment history." actions={<><Btn onClick={() => navigate('/finance/invoices')}>← Invoices</Btn><Btn onClick={() => { saveRows(inv.id, ['Description', 'Qty', 'Unit price', 'Amount'], [...inv.lines.map((l) => [l.desc, l.qty, l.unit, l.qty * l.unit]), ['VAT', '', '', invoiceVat(inv)], ['Total', '', '', invoiceTotal(inv)]], 'CSV'); toast('Invoice downloaded') }}>Download</Btn><Btn onClick={() => window.print()}>Print</Btn>
        {inv.draft ? <Btn variant="primary" disabled={!edit} onClick={() => { f.sendInvoice(inv.id); toast(`Invoice sent to ${inv.email}`) }}>Send invoice</Btn> : <><Btn disabled={!edit || invoiceBalance(inv) === 0} onClick={() => openModal({ title: 'Send invoice reminder?', message: `A payment reminder will be sent to ${inv.email}.`, confirm: 'Send reminder', onConfirm: () => { f.remindInvoice(inv.id); toast('Reminder sent') } })}>Send reminder</Btn><Btn variant="primary" disabled={!edit || invoiceBalance(inv) === 0} onClick={() => openModal({ title: `Record a payment for ${inv.id}`, body: <PayForm inv={inv} />, noActions: true })}>Record payment</Btn></>}</>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel>
            <div className="sp-row between"><div><b style={{ fontSize: 16, letterSpacing: '.5px' }}>SHOPCORE</b><div className="panel-sub">Tax invoice · {inv.id}</div></div><Badge tone={invTone(st)}>{st}</Badge></div>
            <div className="sp-form2" style={{ margin: '16px 0' }}>
              <div><div className="sp-label">Bill to</div><b>{inv.customer}</b><div className="panel-sub">{inv.address}<br />{inv.pin && <>PIN: {inv.pin}</>}</div></div>
              <div><div className="sp-label">Invoice details</div><b>Issued {dateTime(inv.issued).replace(/, .*/, '')}</b><div className="panel-sub">Due {dateTime(inv.due).replace(/, .*/, '')}<br />Currency: KES</div></div>
            </div>
            <div className="table-wrap"><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th className="fin-num">Amount</th></tr></thead>
              <tbody>{inv.lines.map((l, i) => <tr key={i}><td>{l.desc}</td><td>{l.qty}</td><td>{kes(l.unit)}</td><td className="fin-num">{kes(l.qty * l.unit)}</td></tr>)}</tbody></table></div>
            <div style={{ marginLeft: 'auto', maxWidth: 260, marginTop: 10 }}>
              <Detail label="Subtotal">{kes(invoiceSubtotal(inv))}</Detail><Detail label={`VAT (${inv.vatRate}%)`}>{kes(invoiceVat(inv))}</Detail><Detail label="Total due">{kes(invoiceTotal(inv))}</Detail>
            </div>
          </Panel>
          <Panel title="Payment history">
            {inv.payments.map((p, i) => <div className="list-row" key={i}><div><b style={{ fontSize: 11 }}>{kes(p.amount)} · {p.method}</b><div className="panel-sub">Ref {p.ref} · {dateTime(p.at)}</div></div><Badge tone="green">Received</Badge></div>)}
            {!inv.payments.length && <div className="list-row"><div><b style={{ fontSize: 11 }}>No payment recorded</b><div className="panel-sub">{inv.draft ? 'This invoice is still a draft.' : `Invoice sent to ${inv.email}`}</div></div><Badge tone="amber">Awaiting</Badge></div>}
            {inv.reminders.map((r, i) => <div className="list-row" key={`r${i}`}><span className="panel-sub">Reminder sent {dateTime(r)}</span></div>)}
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Invoice status">
            <Detail label="Invoice total">{kes(invoiceTotal(inv))}</Detail><Detail label="Amount paid">{kes(invoicePaid(inv))}</Detail>
            <Detail label="Balance due"><span style={{ color: invoiceBalance(inv) ? 'var(--amber)' : 'var(--green)' }}>{kes(invoiceBalance(inv))}</span></Detail><Detail label="Due date">{dateTime(inv.due).replace(/, .*/, '')}</Detail>
          </Panel>
          <Panel title="Customer account"><b>{inv.customer}</b><div className="panel-sub">Business account</div><Detail label="Billing contact">{inv.contact || '—'}</Detail><Detail label="Contact email">{inv.email}</Detail></Panel>
        </div>
      </div>
    </>
  )
}

// ---- sales and delivery cost ---------------------------------------------------------------------------------------------

export function SalesReports() {
  const { orders, products, can, toast } = useStore()
  const now = useNow()
  const [days, setDays] = useState(30)
  const [area, setArea] = useState('All areas')
  const since = now - days * DAY
  const sold = orders.filter((o) => o.status !== 'Cancelled' && o.placedAt >= since && (area === 'All areas' || o.area === area))
  const gross = sold.reduce((n, o) => n + o.total, 0)
  const units = sold.reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0)
  const dayList = Array.from({ length: days }, (_, i) => dayKey(now - (days - 1 - i) * DAY))
  const byDay = dayList.map((d) => sold.filter((o) => dayKey(o.placedAt) === d).reduce((n, o) => n + o.total, 0))
  const cat = new Map<string, number>()
  const prod = new Map<string, number>()
  const where = new Map<string, number>()
  for (const o of sold) {
    where.set(o.area, (where.get(o.area) ?? 0) + o.total)
    for (const i of o.items) {
      const c = products.find((p) => p.id === i.productId)?.category ?? 'Other'
      cat.set(c, (cat.get(c) ?? 0) + i.price * i.qty)
      prod.set(i.name, (prod.get(i.name) ?? 0) + i.price * i.qty)
    }
  }
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
  const areas = [...new Set(orders.map((o) => o.area))].sort()
  const maxArea = Math.max(1, ...where.values())
  const catTotal = [...cat.values()].reduce((n, v) => n + v, 0)
  return (
    <>
      <PageHead title="Sales reports" desc="Analyse sales by date, product, category and delivery area." actions={<><Btn disabled={!can('Payments', 'Export')} onClick={() => { saveRows('sales-report', ['Order', 'Date', 'Area', 'Customer', 'Total (KES)'], sold.map((o) => [o.id, new Date(o.placedAt).toISOString().slice(0, 10), o.area, o.customer, o.total]), 'CSV'); toast('Sales report exported') }}>Export report</Btn><Btn variant="primary" onClick={() => navigate('/finance/exports')}>Export center</Btn></>} />
      <div className="sp-row" style={{ marginBottom: 12 }}>
        <select className="sp-select auto" aria-label="Date range" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select>
        <select className="sp-select auto" aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)}><option>All areas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
      </div>
      <Stats>
        <Stat label="Gross sales" value={kes(gross)} trend="VAT included" icon="↗" />
        <Stat label="Orders" value={sold.length.toLocaleString('en-US')} trend={`${sold.filter((o) => o.status === 'Delivered').length} delivered`} icon="▤" />
        <Stat label="Average order value" value={kes(sold.length ? gross / sold.length : 0)} trend="Per order" icon="₭" />
        <Stat label="Units sold" value={units.toLocaleString('en-US')} trend={`${prod.size} products`} icon="▦" />
      </Stats>
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Sales by day" sub="Gross value · KES"><Bars values={byDay} labels={dayList.map((d) => d.slice(5))} /></Panel>
          <Panel title="Top categories" sub="Share of product sales">
            {top(cat, 6).map(([n, v]) => <div className="list-row" key={n}><div><b style={{ fontSize: 11 }}>{n}</b><div className="panel-sub">{kes(v)}</div></div><b>{pctOf(v, catTotal)}</b></div>)}
            {!cat.size && <p className="panel-sub">No sales in this range.</p>}
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Sales by area" sub="Top delivery areas">
            {top(where, 6).map(([n, v]) => <div className="list-row" key={n}><div style={{ flex: 1 }}><b style={{ fontSize: 11 }}>{n}</b><div className="panel-sub">{kes(v)}</div><div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${(v / maxArea) * 100}%` }} /></div></div></div>)}
          </Panel>
          <Panel title="Top products">{top(prod, 5).map(([n, v]) => <Detail key={n} label={n}>{kes(v)}</Detail>)}</Panel>
        </div>
      </div>
    </>
  )
}

export function DeliveryCost() {
  const { orders, zones, can, toast } = useStore()
  const f = useFinance()
  const now = useNow()
  const [mk, setMk] = useState(monthKey(now))
  const k = 1 + f.vatRate / 100
  const done = orders.filter((o) => o.status === 'Delivered' && monthKey(o.placedAt) === mk)
  const areas = [...new Set(done.map((o) => o.area))]
  const rows = areas.map((a) => {
    const os = done.filter((o) => o.area === a)
    const share = (zones.find((z) => z.name === a)?.commission ?? 85) / 100
    const fees = os.reduce((n, o) => n + o.fee, 0) / k
    const rider = os.reduce((n, o) => n + o.fee * share, 0)
    return { area: a, n: os.length, fees, rider, margin: fees - rider, share }
  }).sort((a, b) => b.n - a.n)
  const totals = rows.reduce((t, r) => ({ n: t.n + r.n, fees: t.fees + r.fees, rider: t.rider + r.rider }), { n: 0, fees: 0, rider: 0 })
  const low = rows.filter((r) => r.margin / Math.max(1, r.fees) < 0.05)
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'a', header: 'Area', sort: (a, b) => a.area.localeCompare(b.area), render: (r) => <b>{r.area}</b> },
    { key: 'n', header: 'Deliveries', sort: (a, b) => a.n - b.n, render: (r) => r.n },
    { key: 'f', header: 'Customer fees (ex VAT)', render: (r) => kes(r.fees) },
    { key: 'r', header: `Rider payouts`, render: (r) => `${kes(r.rider)} (${Math.round(r.share * 100)}%)` },
    { key: 'm', header: 'Net margin', sort: (a, b) => a.margin - b.margin, render: (r) => kes(r.margin) },
    { key: 'p', header: 'Margin', render: (r) => <Badge tone={r.margin / Math.max(1, r.fees) < 0.05 ? 'red' : 'green'}>{pctOf(r.margin, r.fees)}</Badge> },
  ]
  return (
    <>
      <PageHead title="Delivery cost report" desc="Compare rider costs, delivery fees and margin by delivery area." actions={<><MonthSelect value={mk} onChange={setMk} now={now} /><Btn disabled={!can('Payments', 'Export')} onClick={() => { saveRows('delivery-cost', ['Area', 'Deliveries', 'Fees ex VAT', 'Rider payouts', 'Margin'], rows.map((r) => [r.area, r.n, Math.round(r.fees), Math.round(r.rider), Math.round(r.margin)]), 'CSV'); toast('Report exported') }}>Export</Btn></>} />
      <Stats>
        <Stat label="Delivery revenue" value={kes(totals.fees)} trend={`${totals.n} completed deliveries`} icon="↗" />
        <Stat label="Rider payouts" value={kes(totals.rider)} trend={`About ${kes(totals.rider / Math.max(1, totals.n))} per delivery`} icon="⇧" />
        <Stat label="Net delivery margin" value={kes(totals.fees - totals.rider)} trend={`${pctOf(totals.fees - totals.rider, totals.fees)} blended`} icon="%" up={totals.fees - totals.rider > 0} />
      </Stats>
      {low.length > 0 && <div style={{ marginBottom: 12 }}><Notice tone="warning" mark="!"><b>Margin watch:</b> {low.map((r) => r.area).join(', ')} keep less than 5% of the delivery fee. Review the zone fee and rider share in Delivery settings.</Notice></div>}
      <DataTable title="Margin by area" rows={rows} rowKey={(r) => r.area} columns={cols} searchLabel="Search delivery area" searchText={(r) => r.area} empty="No delivered orders in this month." />
    </>
  )
}

// ---- expenses ---------------------------------------------------------------------------------------------------------------

function ExpenseForm() {
  const f = useFinance()
  const { closeModal, toast } = useStore()
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0])
  const [payee, setPayee] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState<Record<string, string>>({})
  const submit = () => {
    const e: Record<string, string> = {}
    const n = Number(amount)
    if (!payee.trim()) e.payee = 'Who was paid?'
    if (!description.trim()) e.description = 'Say what it was for'
    if (!Number.isInteger(n) || n <= 0) e.amount = 'Enter the amount in whole shillings'
    if (!date || date > new Date().toLocaleDateString('en-CA')) e.date = 'Choose today or an earlier date'
    setErr(e)
    if (Object.keys(e).length) return
    const bad = f.addExpense({ date: new Date(`${date}T12:00:00`).getTime(), category, payee: payee.trim(), description: description.trim(), amount: n })
    if (bad) return setErr({ date: bad })
    closeModal()
    toast('Expense added')
  }
  return (
    <>
      <div className="sp-form2"><Field label="Date" type="date" value={date} onChange={setDate} error={err.date} /><Field label="Category" value={category} onChange={setCategory} options={EXPENSE_CATEGORIES} /></div>
      <Field label="Vendor or payee" value={payee} onChange={setPayee} error={err.payee} />
      <Field label="Description" value={description} onChange={setDescription} error={err.description} />
      <Field label="Amount (KES)" type="number" value={amount} onChange={setAmount} error={err.amount} hint={`Expenses above ${kes(f.settings.expenseLimit)} need an owner’s approval.`} />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={submit}>Add expense</Btn></div>
    </>
  )
}

function DecideForm({ e, to }: { e: Expense; to: 'Approved' | 'Rejected' }) {
  const f = useFinance()
  const { closeModal, toast } = useStore()
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <Detail label="Expense">{e.id} · {e.payee}</Detail><Detail label="Amount">{kes(e.amount)}</Detail>
      <div style={{ marginTop: 10 }}><Field label={to === 'Rejected' ? 'Reason' : 'Note (optional)'} multiline value={note} onChange={(v) => { setNote(v); setErr('') }} error={err} /></div>
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant={to === 'Rejected' ? 'danger' : 'primary'} onClick={() => { if (to === 'Rejected' && !note.trim()) return setErr('Give a reason so the person knows why'); const bad = f.decideExpense(e.id, to, note.trim()); if (bad) return setErr(bad); closeModal(); toast(`Expense ${to.toLowerCase()}`) }}>{to === 'Approved' ? 'Approve' : 'Reject'}</Btn></div>
    </>
  )
}

export function Expenses() {
  const f = useFinance()
  const { openModal, can, toast } = useStore()
  const now = useNow()
  const [cat, setCat] = useState('All categories')
  const [st, setSt] = useState('All statuses')
  const edit = can('Payments', 'Edit')
  const from = monthStart(monthKey(now))
  const mtd = f.expenses.filter((e) => e.date >= from && e.status !== 'Rejected')
  const byCat = new Map<string, number>()
  for (const e of mtd) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount)
  const largest = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]
  const rows = f.expenses.filter((e) => (cat === 'All categories' || e.category === cat) && (st === 'All statuses' || e.status === st))
  const pending = f.expenses.filter((e) => e.status === 'Pending')
  const cols: Column<Expense>[] = [
    { key: 'id', header: 'Expense', render: (e) => <b>{e.id}</b> },
    { key: 'd', header: 'Date', sort: (a, b) => a.date - b.date, render: (e) => dateTime(e.date).replace(/, .*/, '') },
    { key: 'c', header: 'Category', render: (e) => e.category },
    { key: 'p', header: 'Vendor or payee', render: (e) => <>{e.payee}<span className="sp-sub">{e.description}</span></> },
    { key: 'a', header: 'Amount', sort: (a, b) => a.amount - b.amount, render: (e) => <b>{kes(e.amount)}</b> },
    { key: 'by', header: 'Entered by', render: (e) => e.by },
    { key: 's', header: 'Status', render: (e) => <Badge tone={e.status === 'Approved' ? 'green' : e.status === 'Rejected' ? 'red' : 'amber'}>{e.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="Expense tracking" desc="Record and review operating costs with approval and audit history." actions={<><Btn disabled={!can('Payments', 'Export')} onClick={() => { saveRows('expenses', ['Expense', 'Date', 'Category', 'Payee', 'Description', 'Amount', 'Status'], rows.map((e) => [e.id, new Date(e.date).toISOString().slice(0, 10), e.category, e.payee, e.description, e.amount, e.status]), 'CSV'); toast('Expenses exported') }}>Export expenses</Btn><Btn variant="primary" disabled={!can('Payments', 'Create')} onClick={() => openModal({ title: 'Add expense', body: <ExpenseForm />, noActions: true })}>+ Add expense</Btn></>} />
      <Stats>
        <Stat label="Month-to-date expenses" value={kes(mtd.reduce((n, e) => n + e.amount, 0))} trend={`${mtd.length} entries`} icon="−" up={false} />
        <Stat label="Awaiting approval" value={kes(pending.reduce((n, e) => n + e.amount, 0))} trend={`${pending.length} expense${pending.length === 1 ? '' : 's'}`} icon="!" up={pending.length === 0} />
        <Stat label="Largest category" value={largest?.[0] ?? '—'} trend={largest ? `${kes(largest[1])} this month` : 'Nothing yet'} icon="▤" />
      </Stats>
      <DataTable title="Expenses" rows={rows} rowKey={(e) => e.id} columns={cols} searchLabel="Search expense or payee" searchText={(e) => `${e.id} ${e.payee} ${e.description} ${e.category}`}
        tools={<><select className="sp-select auto" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option>All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select><select className="sp-select auto" aria-label="Status" value={st} onChange={(e) => setSt(e.target.value)}><option>All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option></select></>}
        actions={(e) => e.status === 'Pending' ? <div className="sp-row"><Btn small disabled={!edit} onClick={() => openModal({ title: `Approve ${e.id}?`, body: <DecideForm e={e} to="Approved" />, noActions: true })}>Approve</Btn><Btn small disabled={!edit} onClick={() => openModal({ title: `Reject ${e.id}?`, body: <DecideForm e={e} to="Rejected" />, noActions: true })}>Reject</Btn></div> : <span className="subtext">{e.decidedBy ? `${e.status} by ${e.decidedBy}` : ''}</span>} />
    </>
  )
}

// ---- export center ----------------------------------------------------------------------------------------------------------------

export function ExportCenter() {
  const store = useStore()
  const { orders, payouts, riders, can, toast } = store
  const f = useFinance()
  const now = useNow()
  const [dataset, setDataset] = useState<ExportDataset>('Payments')
  const [format, setFormat] = useState<'CSV' | 'Excel'>('CSV')
  const allowed = EXPORT_DATASETS.filter((d) => (d === 'Payroll summary' ? can('Payroll', 'Export') : can('Payments', 'Export')))

  const build = (d: ExportDataset): [string[], (string | number)[][]] => {
    switch (d) {
      case 'Payments': return [['Payment', 'Order', 'Customer', 'Method', 'Amount', 'Status', 'Reference', 'Date'], f.payments.map((t) => [t.id, t.orderId, t.customer, t.method, t.amount, t.status, t.ref, new Date(t.at).toISOString()])]
      case 'Refunds': return [['Order', 'Customer', 'Refunded', 'Method'], orders.filter((o) => o.refunded > 0).map((o) => [o.id, o.customer, o.refunded, o.method])]
      case 'Rider payouts': return [['Payout', 'Rider', 'Amount', 'Status', 'Requested'], payouts.map((p) => [p.id, p.rider, p.amount, p.status, new Date(p.requestedAt).toISOString()])]
      case 'COD balances': return [['Rider', 'Zone', 'Cash held'], riders.filter((r) => r.cashHeld > 0).map((r) => [r.name, r.zone, r.cashHeld])]
      case 'Expenses': return [['Expense', 'Date', 'Category', 'Payee', 'Amount', 'Status'], f.expenses.map((e) => [e.id, new Date(e.date).toISOString().slice(0, 10), e.category, e.payee, e.amount, e.status])]
      case 'Invoices': return [['Invoice', 'Business', 'Total', 'Paid', 'Balance', 'Status'], f.invoices.map((i) => [i.id, i.customer, invoiceTotal(i), invoicePaid(i), invoiceBalance(i), invoiceStatus(i, now)])]
      case 'VAT summary': return [['Month', 'VAT collected', 'Refund adjustments', 'Net payable'], monthOptions(now, 5).map((k) => { const m = f.month(k); return [monthLabel(k), Math.round(vatIn(m.gross, f.vatRate)), Math.round(vatIn(m.refunds, f.vatRate)), Math.round(vatIn(m.gross, f.vatRate) - vatIn(m.refunds, f.vatRate))] })]
      case 'Profit and loss': return [['Month', 'Revenue', 'Gross profit', 'Operating costs', 'Net profit'], monthOptions(now, 5).map((k) => { const p = computePnl(f.month(k), f.settings, f.vatRate, f.expenses, f.runs); return [monthLabel(k), Math.round(p.revenue), Math.round(p.grossProfit), Math.round(p.opex), Math.round(p.net)] })]
      case 'Payroll summary': return [['Month', 'Status', 'Employees', 'Gross', 'Net', 'PAYE', 'NSSF', 'SHIF', 'Housing levy'], f.runs.map((r) => { const t = runTotals(r); return [monthLabel(r.month), r.status, r.lines.length, t.gross, t.net, t.paye, t.nssf, t.shif, t.housing] })]
      case 'Store settlements': return [['Store', 'Month', 'Sales', 'Commission', 'Net', 'Status'], f.settlements.map((s) => [s.store, s.month, s.sales, s.commission, s.net, s.paid ? 'Paid' : 'Payable'])]
    }
  }
  const run = (d: ExportDataset, fmt: 'CSV' | 'Excel', job?: ExportJob) => {
    const [h, rows] = build(d)
    saveRows(d.toLowerCase().replaceAll(' ', '-'), h, rows, fmt)
    toast(job ? 'Download started' : `${d} export ready`)
  }
  const create = () => { const job = f.addExport(dataset, format); run(dataset, format, undefined); void job }
  const cols: Column<ExportJob>[] = [
    { key: 'n', header: 'Export', render: (j) => <b>{j.name}</b> },
    { key: 'd', header: 'Data', render: (j) => j.dataset },
    { key: 'f', header: 'Format', render: (j) => j.format },
    { key: 'b', header: 'Requested by', render: (j) => j.by },
    { key: 'c', header: 'Created', sort: (a, b) => a.at - b.at, render: (j) => when(j.at) },
    { key: 's', header: 'Status', render: (j) => <Badge tone={j.status === 'Ready' ? 'green' : 'gray'}>{j.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="Export center" desc="Prepare and download finance data as CSV or Excel." />
      <Panel title="New export" sub="Pick the data and format. The file downloads straight away and is listed below.">
        <div className="sp-row" style={{ alignItems: 'end' }}>
          <div style={{ minWidth: 230 }}><Field label="Data" value={dataset} onChange={(v) => setDataset(v as ExportDataset)} options={allowed} /></div>
          <div style={{ minWidth: 140 }}><Field label="Format" value={format} onChange={(v) => setFormat(v as 'CSV' | 'Excel')} options={EXPORT_FORMATS} /></div>
          <div style={{ marginBottom: 12 }}><Btn variant="primary" disabled={!allowed.length} onClick={create}>Create export</Btn></div>
        </div>
        <p className="panel-sub">PDF exports and scheduled exports arrive with the backend.</p>
      </Panel>
      <div style={{ height: 14 }} />
      <DataTable title="Export history" rows={f.exportsLog} rowKey={(j) => j.id} columns={cols} searchLabel="Search export history" searchText={(j) => `${j.name} ${j.dataset}`}
        actions={(j) => <Btn small disabled={!allowed.includes(j.dataset)} onClick={() => run(j.dataset, j.format, j)}>{j.status === 'Ready' ? 'Download' : 'Recreate'}</Btn>} />
    </>
  )
}

// ---- period close --------------------------------------------------------------------------------------------------------------

export function PeriodClose() {
  const f = useFinance()
  const { deposits, payouts, openModal, toast, role } = useStore()
  const now = useNow()
  const [mk, setMk] = useState(() => monthOptions(Date.now(), 5)[1]!)
  const [note, setNote] = useState('')
  const from = monthStart(mk), to = monthEnd(mk)
  const closed = f.closed[mk]
  const openLines = f.statement.lines.filter((l) => !l.resolution && (l.ours === null || l.gateway !== l.ours)).length
  const run = f.runs.find((r) => r.month === mk)
  const checks: { title: string; detail: string; ok: boolean; to: string }[] = [
    { title: 'Reconcile gateway settlements', detail: f.statement.completed && !openLines ? 'Statement reconciled with no open lines' : `${openLines} open line${openLines === 1 ? '' : 's'}${f.statement.completed ? '' : ' · not completed'}`, ok: f.statement.completed && openLines === 0, to: '/finance/reconciliation' },
    { title: 'Review COD balances', detail: deposits.some((d) => d.status === 'Due') ? `${deposits.filter((d) => d.status === 'Due').length} rider balances still due` : 'No overdue cash', ok: !deposits.some((d) => d.status === 'Due'), to: '/finance/cod' },
    { title: 'Approve and send rider payouts', detail: payouts.some((p) => p.status !== 'Paid') ? `${payouts.filter((p) => p.status !== 'Paid').length} payouts not sent` : 'Every payout sent', ok: !payouts.some((p) => p.status !== 'Paid'), to: '/finance/batch' },
    { title: 'Review expense submissions', detail: f.expenses.some((e) => e.status === 'Pending' && e.date >= from && e.date < to) ? 'Expenses waiting for a decision' : 'All expenses decided', ok: !f.expenses.some((e) => e.status === 'Pending' && e.date >= from && e.date < to), to: '/finance/expenses' },
    { title: 'Prepare and file the VAT return', detail: f.filings[mk]?.status === 'Filed' ? `Filed · ${f.filings[mk]!.ack}` : f.filings[mk] ? 'Draft prepared, not filed' : 'No return prepared', ok: f.filings[mk]?.status === 'Filed', to: '/finance/vat' },
    { title: 'Pay payroll for the month', detail: run ? `Run is ${run.status.toLowerCase()}` : 'No payroll run for this month', ok: run?.status === 'Paid', to: '/finance/payroll' },
  ]
  const done = checks.filter((c) => c.ok).length
  const p = computePnl(f.month(mk), f.settings, f.vatRate, f.expenses, f.runs)
  const close = () => openModal({ title: `Close ${monthLabel(mk)}?`, message: 'The period will be locked. Expenses, deposits and payroll can’t be added to it until an owner reopens it. This is recorded in the audit log.', confirm: 'Close period', onConfirm: () => { f.closePeriod(mk, note.trim()); toast(`${monthLabel(mk)} closed`) } })
  const reopen = () => openModal({ title: `Reopen ${monthLabel(mk)}?`, message: 'Anyone with access can add entries to this period again. The reopening is recorded.', confirm: 'Reopen', danger: true, onConfirm: () => { f.reopenPeriod(mk); toast('Period reopened') } })
  return (
    <>
      <PageHead title="Financial period close" desc="Complete finance controls and lock the accounting period with an audit trail." actions={<><MonthSelect value={mk} onChange={setMk} now={now} /><Btn variant="primary" disabled={!!closed || done < checks.length || role === 'Customer support'} onClick={close}>Close period</Btn></>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Close checklist" sub={`${done} of ${checks.length} controls complete`} right={closed ? <Badge tone="gray">Closed</Badge> : <Badge tone={done === checks.length ? 'green' : 'amber'}>{done === checks.length ? 'Ready to close' : 'In progress'}</Badge>}>
            <div className="progress" style={{ marginBottom: 10 }}><i style={{ width: `${(done / checks.length) * 100}%` }} /></div>
            {checks.map((c, i) => (
              <div className="list-row" key={c.title}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}><span className="fin-steps" style={{ margin: 0 }}><li className={c.ok ? 'done' : ''} style={{ padding: 0, border: 0, background: 'none' }}><b>{c.ok ? '✓' : i + 1}</b></li></span><div><b style={{ fontSize: 11 }}>{c.title}</b><div className="panel-sub">{c.detail}</div></div></div>
                {c.ok ? <Badge tone="green">Done</Badge> : <Btn small onClick={() => navigate(c.to)}>Review</Btn>}
              </div>
            ))}
          </Panel>
          <Panel title="Period notes">
            <textarea className="sp-text" aria-label="Close notes" placeholder="Add close notes for the audit record" value={closed ? closed.note : note} disabled={!!closed} onChange={(e) => setNote(e.target.value)} />
            <p className="panel-sub" style={{ marginTop: 6 }}>Changes are recorded in the audit log.</p>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title={`${monthLabel(mk)} snapshot`}>
            <Detail label="Total revenue">{kes(p.revenue)}</Detail><Detail label="Refunds">{kes(f.month(mk).refunds)}</Detail><Detail label="Operating costs">{kes(p.opex)}</Detail><Detail label="Net profit">{kes(p.net)}</Detail>
          </Panel>
          {closed ? (
            <Notice tone="success" mark="✓">Closed by {closed.by} on {dateTime(closed.at)}.{closed.note && ` “${closed.note}”`} {role === 'Owner admin' && <button className="link-btn" onClick={reopen}>Reopen</button>}</Notice>
          ) : done < checks.length ? <Notice tone="error" mark="!"><b>Resolve open controls before locking.</b> {checks.length - done} still need attention.</Notice> : <Notice tone="success" mark="✓">Every control is complete. You can close the period.</Notice>}
        </div>
      </div>
    </>
  )
}

// ---- finance settings -----------------------------------------------------------------------------------------------------------------

export function FinanceSettingsPage() {
  const f = useFinance()
  const { toast, can, log, business, role, requestAccess, requestedAccess } = useStore()
  const [v, setV] = useState({ cogsRate: String(f.settings.cogsRate), storeCommission: String(f.settings.storeCommission), processingFee: String(f.settings.processingFee), codWindowHours: String(f.settings.codWindowHours), expenseLimit: String(f.settings.expenseLimit) })
  const [err, setErr] = useState<Record<string, string>>({})
  const edit = can('Payments', 'Edit')
  const set = (k: keyof typeof v) => (x: string) => { setV({ ...v, [k]: x }); setErr({}) }
  const save = () => {
    const e: Record<string, string> = {}
    const n = (k: keyof typeof v) => Number(v[k])
    for (const k of ['cogsRate', 'storeCommission'] as const) if (!(n(k) >= 0 && n(k) <= 100)) e[k] = 'Enter a percentage from 0 to 100'
    if (!(n('processingFee') >= 0 && n('processingFee') <= 10)) e.processingFee = 'Enter a percentage from 0 to 10'
    if (!(n('codWindowHours') >= 1 && n('codWindowHours') <= 168)) e.codWindowHours = 'Enter hours from 1 to 168'
    if (!(n('expenseLimit') >= 0)) e.expenseLimit = 'Enter an amount in shillings'
    setErr(e)
    if (Object.keys(e).length) return
    f.setSettings({ cogsRate: n('cogsRate'), storeCommission: n('storeCommission'), processingFee: n('processingFee'), codWindowHours: n('codWindowHours'), expenseLimit: n('expenseLimit') })
    log('Updated finance settings', 'Payments', 'Security')
    toast('Finance settings saved')
  }
  return (
    <>
      <PageHead title="Finance settings" desc="The rates and limits behind the finance reports." actions={<Btn variant="primary" disabled={!edit} onClick={save}>Save changes</Btn>} />
      {!edit && <section className="card panel" style={{ marginBottom: 14 }}><PermissionDenied title="You can read these settings but not change them" body="Only finance staff and owners can edit rates and limits." yourRole={role} requiredRole="Finance analyst or Owner admin" onRequest={() => requestAccess('Finance settings')} requested={requestedAccess.includes('Finance settings')} /></section>}
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Margins and fees">
            <div className="sp-form2">
              <Field label="Product cost (% of product sales)" type="number" value={v.cogsRate} onChange={set('cogsRate')} error={err.cogsRate} hint="Used for gross profit until real product costs are tracked." />
              <Field label="Store commission (%)" type="number" value={v.storeCommission} onChange={set('storeCommission')} error={err.storeCommission} hint="What ShopCore keeps from partner stores’ product sales." />
              <Field label="Payment processing cost (%)" type="number" value={v.processingFee} onChange={set('processingFee')} error={err.processingFee} />
            </div>
          </Panel>
          <Panel title="Controls">
            <div className="sp-form2">
              <Field label="COD deposit window (hours)" type="number" value={v.codWindowHours} onChange={set('codWindowHours')} error={err.codWindowHours} hint="Riders must hand in cash within this time." />
              <Field label="Expense approval limit (KES)" type="number" value={v.expenseLimit} onChange={set('expenseLimit')} error={err.expenseLimit} hint="Above this, only an owner can approve." />
            </div>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Set elsewhere">
            <Detail label="VAT rate">{business.vat}%</Detail>
            <Detail label="KRA PIN">{business.kra}</Detail>
            <div style={{ marginTop: 10 }}><Btn small onClick={() => navigate('/settings/business')}>Business settings</Btn></div>
            <p className="panel-sub" style={{ marginTop: 10 }}>Zone fees and rider shares are in Delivery settings. Payroll rates are on the Payroll pages.</p>
          </Panel>
        </div>
      </div>
    </>
  )
}
