import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import type { Order, Transaction } from '../data/commerce'
import { STORES } from '../data/geo'
import {
  calcSlip, FINANCE_DEFAULTS, monthKey, RETRYABLE, seedEmployeePay, seedExpenses, seedExports, seedFailed, seedInvoices, seedRemitted, seedRuns, shiftMonth, STATUTORY_DEFAULTS, vatIn,
  type Adjust, type CodRecord, type EmployeePay, type Expense, type ExportDataset, type ExportJob, type FailedPayment, type FinanceSettings, type Filing, type Invoice, type InvoicePayment, type PayoutBatch, type PayrollRun,
  type RemitKind, type Settlement, type Statement, type StatementLine, type Statutory,
} from '../data/finance'
import { kes } from './format'
import { useStore } from './store'

export type Payment = Transaction & { failure?: string; attempts?: number }

export interface MonthStats {
  key: string
  orders: number
  /** Everything customers paid for orders that weren't cancelled (VAT included). */
  gross: number
  refunds: number
  productSales: number
  delivery: number
  riderPay: number
  /** True when the month comes from sample figures, not the demo orders. */
  sample: boolean
}

interface Finance {
  settings: FinanceSettings
  setSettings: (s: FinanceSettings) => void
  closed: Record<string, { by: string; at: number; note: string }>
  closePeriod: (month: string, note: string) => void
  reopenPeriod: (month: string) => void
  isClosed: (ms: number) => boolean
  vatRate: number
  month: (key: string) => MonthStats
  // payments
  failed: FailedPayment[]
  payments: Payment[]
  retryFailed: (id: string) => 'recovered' | 'failed' | 'manual'
  statement: Statement
  importStatement: (file: string, text: string) => string | null
  resolveLine: (id: string, how: StatementLine['resolution'], note: string, orderId?: string) => void
  completeReconciliation: () => void
  // cash
  codRecords: CodRecord[]
  recordCod: (riderId: string, amount: number, method: string, ref: string, account: string, note: string) => string | null
  batches: PayoutBatch[]
  createBatch: (payoutIds: string[]) => string | null
  updateBatch: (id: string, patch: Partial<PayoutBatch>) => void
  sendBatch: (id: string) => string | null
  settlements: Settlement[]
  paySettlement: (id: string, ref: string) => void
  // expenses and invoices
  expenses: Expense[]
  addExpense: (e: Omit<Expense, 'id' | 'status' | 'by'>) => string | null
  decideExpense: (id: string, to: 'Approved' | 'Rejected', note: string) => string | null
  invoices: Invoice[]
  addInvoice: (i: Omit<Invoice, 'id' | 'payments' | 'reminders'>) => string
  recordInvoicePayment: (id: string, p: Omit<InvoicePayment, 'at'>) => string | null
  remindInvoice: (id: string) => void
  sendInvoice: (id: string) => void
  filings: Record<string, Filing>
  prepareFiling: (month: string) => void
  fileReturn: (month: string, ack: string) => string | null
  exportsLog: ExportJob[]
  addExport: (dataset: ExportDataset, format: 'CSV' | 'Excel') => ExportJob
  // payroll
  employeePay: EmployeePay[]
  setEmployeePay: (staffId: string, patch: Partial<EmployeePay>) => void
  statutory: Statutory
  setStatutory: (s: Statutory) => void
  runs: PayrollRun[]
  prepareRun: (month: string) => string | null
  setRunAdjust: (runId: string, staffId: string, adj: Adjust) => void
  runAction: (runId: string, action: 'submit' | 'return' | 'approve' | 'pay') => string | null
  remitted: Record<string, { ref: string; at: number }>
  remit: (runId: string, kind: RemitKind, ref: string) => void
}

const Ctx = createContext<Finance | null>(null)

const seedStatement = (txs: Transaction[], now: number): Statement => {
  const base = txs.filter((t) => t.status === 'Success' && t.method === 'M-Pesa').slice(0, 14)
  const lines: StatementLine[] = base.map((t, i) => ({ id: `L${i}`, ref: t.ref, orderId: t.orderId, gateway: i === 2 ? t.amount + 270 : t.amount, ours: t.amount }))
  lines.splice(5, 0, { id: 'Lx', ref: 'QGH8K2P67R', orderId: null, gateway: 1250, ours: null })
  return { file: 'MPESA-STATEMENT-LAST-DAY.csv', importedAt: now - 3 * 3_600_000, period: 'Yesterday', lines, completed: false }
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { user, role, orders, setOrders, riders, setRiders, deposits, setDeposits, payouts, setPayouts, transactions, staff, customers, zones, business, log } = useStore()
  const me = user?.name ?? 'Finance'
  const [now] = useState(() => Date.now())

  const [settings, setSettings] = useState(FINANCE_DEFAULTS)
  const [closed, setClosed] = useState<Finance['closed']>(() => ({ [shiftMonth(monthKey(Date.now()), -2)]: { by: 'Amara Mwangi', at: Date.now() - 30 * 86_400_000, note: 'Closed after VAT filing.' } }))
  const [failed, setFailed] = useState(() => seedFailed(customers, now))
  const [statement, setStatement] = useState(() => seedStatement(transactions, now))
  const [codRecords, setCodRecords] = useState<CodRecord[]>(() => riders.filter((r) => r.cashHeld > 0).slice(0, 2).map((r, i) => ({ id: `CD-${700 + i}`, riderId: r.id, rider: r.name, amount: 1500 + i * 900, method: 'M-Pesa transfer', ref: `MP-${4410 + i}`, account: 'M-Pesa Paybill · 523810', note: '', at: now - (2 + i) * 3_600_000, by: 'Samuel Kimani' })))
  const [batches, setBatches] = useState<PayoutBatch[]>([])
  const [settlePaid, setSettlePaid] = useState<Record<string, NonNullable<Settlement['paid']>>>({})
  const [expenses, setExpenses] = useState(() => seedExpenses(now))
  const [invoices, setInvoices] = useState(() => seedInvoices(now))
  const [filings, setFilings] = useState<Record<string, Filing>>(() => ({
    [shiftMonth(monthKey(now), -2)]: { status: 'Filed', preparedBy: 'Samuel Kimani', preparedAt: now - 40 * 86_400_000, ack: 'KRA-VAT-884201', filedAt: now - 38 * 86_400_000 },
    [shiftMonth(monthKey(now), -3)]: { status: 'Filed', preparedBy: 'Samuel Kimani', preparedAt: now - 70 * 86_400_000, ack: 'KRA-VAT-871144', filedAt: now - 68 * 86_400_000 },
  }))
  const [exportsLog, setExportsLog] = useState(() => seedExports(now))
  const [employeePay, setEmployeePayState] = useState(() => seedEmployeePay(staff))
  const [statutory, setStatutory] = useState(STATUTORY_DEFAULTS)
  const [runs, setRuns] = useState(() => seedRuns(staff, seedEmployeePay(staff), STATUTORY_DEFAULTS, now))
  const [remitted, setRemitted] = useState(() => seedRemitted(runs))

  const vatRate = Number(business.vat) || 16
  const isClosed = useCallback((ms: number) => !!closed[monthKey(ms)], [closed])

  // ---- monthly figures
  const month = useCallback(
    (key: string): MonthStats => {
      const inMonth = orders.filter((o) => monthKey(o.placedAt) === key && o.status !== 'Cancelled')
      const earliest = orders.reduce((n, o) => Math.min(n, o.placedAt), Infinity)
      if (inMonth.length || key >= monthKey(earliest)) {
        const share = (o: Order) => (zones.find((z) => z.name === o.area)?.commission ?? 85) / 100
        return {
          key, orders: inMonth.length, gross: inMonth.reduce((n, o) => n + o.total, 0), refunds: inMonth.reduce((n, o) => n + o.refunded, 0), productSales: inMonth.reduce((n, o) => n + o.subtotal, 0),
          delivery: inMonth.reduce((n, o) => n + o.fee, 0), riderPay: inMonth.filter((o) => o.status === 'Delivered').reduce((n, o) => n + o.fee * share(o), 0), sample: false,
        }
      }
      // earlier months: fixed sample figures so charts have history
      const back = Math.max(1, (Number(monthKey(now).slice(0, 4)) - Number(key.slice(0, 4))) * 12 + Number(monthKey(now).slice(5)) - Number(key.slice(5)))
      const gross = [16_400_000, 15_240_000, 14_880_000, 13_920_000, 12_800_000][Math.min(back - 1, 4)] ?? 12_000_000
      return { key, orders: Math.round(gross / 1438), gross, refunds: Math.round(gross * 0.0045), productSales: Math.round(gross * 0.93), delivery: Math.round(gross * 0.07), riderPay: Math.round(gross * 0.07 * 0.85), sample: true }
    },
    [orders, zones, now],
  )

  // ---- payments
  const payments = useMemo<Payment[]>(
    () => [
      ...failed.map((f): Payment => ({ id: f.id, orderId: f.orderId, customer: f.customer, method: f.method, amount: f.amount, status: f.status === 'Recovered' ? 'Success' : 'Failed', ref: f.ref, at: f.at, failure: f.reason, attempts: f.attempts })),
      ...transactions,
    ].sort((a, b) => b.at - a.at),
    [failed, transactions],
  )

  const retryFailed = useCallback(
    (id: string) => {
      const f = failed.find((x) => x.id === id)
      if (!f || f.status === 'Recovered') return 'failed' as const
      const attempts = f.attempts + 1
      if (RETRYABLE.includes(f.reason)) {
        setFailed((l) => l.map((x) => (x.id === id ? { ...x, attempts, status: 'Recovered' } : x)))
        setOrders(orders.map((o) => (o.id === f.orderId && o.pay !== 'Paid' ? { ...o, pay: 'Paid' } : o)))
        log(`Retried payment ${id}: recovered ${kes(f.amount)}`, 'Payments')
        return 'recovered' as const
      }
      const manual = attempts >= 3
      setFailed((l) => l.map((x) => (x.id === id ? { ...x, attempts, status: manual ? 'Manual review' : 'Failed' } : x)))
      log(`Retried payment ${id}: failed again`, 'Payments')
      return manual ? ('manual' as const) : ('failed' as const)
    },
    [failed, orders, setOrders, log],
  )

  // ---- reconciliation
  const importStatement = useCallback(
    (file: string, text: string) => {
      const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean)
      if (rows.length < 2) return 'The file is empty. It needs a header row and at least one transaction.'
      const head = rows[0]!.toLowerCase().split(',').map((h) => h.replace(/"/g, '').trim())
      const ri = head.findIndex((h) => h.includes('ref'))
      const ai = head.findIndex((h) => h.includes('amount'))
      if (ri < 0 || ai < 0) return 'The header row needs a “reference” column and an “amount” column.'
      const lines: StatementLine[] = []
      for (const [i, row] of rows.slice(1).entries()) {
        const cells = row.split(',').map((c) => c.replace(/"/g, '').trim())
        const amount = Number(cells[ai]?.replace(/[^\d.]/g, ''))
        if (!cells[ri] || !Number.isFinite(amount) || amount <= 0) return `Row ${i + 2} has no valid reference or amount.`
        const tx = transactions.find((t) => t.ref.toLowerCase() === cells[ri]!.toLowerCase())
        lines.push({ id: `L${i}`, ref: cells[ri]!, orderId: tx?.orderId ?? null, gateway: amount, ours: tx?.amount ?? null })
      }
      setStatement({ file, importedAt: Date.now(), period: 'Imported file', lines, completed: false })
      log(`Imported gateway statement ${file} (${lines.length} lines)`, 'Payments')
      return null
    },
    [transactions, log],
  )
  const resolveLine = useCallback(
    (id: string, how: StatementLine['resolution'], note: string, orderId?: string) => {
      setStatement((s) => ({
        ...s,
        lines: s.lines.map((l) => {
          if (l.id !== id) return l
          const o = orderId ? orders.find((x) => x.id === orderId) : undefined
          return { ...l, resolution: how, note, orderId: o?.id ?? l.orderId, ours: o ? o.total : l.ours }
        }),
      }))
      log(`Reconciliation line ${id} ${how}`, 'Payments')
    },
    [orders, log],
  )
  const completeReconciliation = useCallback(() => {
    setStatement((s) => ({ ...s, completed: true }))
    log('Completed reconciliation', 'Payments')
  }, [log])

  // ---- cash
  const recordCod = useCallback(
    (riderId: string, amount: number, method: string, ref: string, account: string, note: string) => {
      const rider = riders.find((r) => r.id === riderId)
      if (!rider) return 'Choose the rider who handed in the cash.'
      if (!Number.isInteger(amount) || amount <= 0) return 'Enter the amount in whole shillings.'
      if (amount > rider.cashHeld) return `${rider.name} only holds ${kes(rider.cashHeld)}. The deposit can’t be more than that.`
      if (!ref.trim()) return 'Enter the receipt or reference number.'
      if (codRecords.some((c) => c.ref.toLowerCase() === ref.trim().toLowerCase())) return 'That reference has already been recorded.'
      if (isClosed(Date.now())) return 'This accounting period is closed. Reopen it before recording deposits.'
      const left = rider.cashHeld - amount
      setRiders(riders.map((r) => (r.id === riderId ? { ...r, cashHeld: left } : r)))
      setDeposits(deposits.map((d) => (d.riderId === riderId ? (left === 0 ? { ...d, status: 'Received' as const, owed: d.owed } : { ...d, owed: left }) : d)))
      setCodRecords((l) => [{ id: `CD-${700 + l.length + 2}`, riderId, rider: rider.name, amount, method, ref: ref.trim(), account, note, at: Date.now(), by: me }, ...l])
      log(`Recorded COD deposit · ${rider.name} (${kes(amount)})`, 'Payments')
      return null
    },
    [riders, deposits, codRecords, isClosed, setRiders, setDeposits, me, log],
  )

  const createBatch = useCallback(
    (payoutIds: string[]) => {
      const taken = new Set(batches.filter((b) => b.status === 'Draft').flatMap((b) => b.payoutIds))
      const ok = payouts.filter((p) => payoutIds.includes(p.id) && p.status !== 'Paid' && !taken.has(p.id)).map((p) => p.id)
      if (!ok.length) return null
      const id = `PB-${String(Date.now()).slice(-5)}`
      setBatches((l) => [{ id, period: 'Pending payouts', payoutIds: ok, status: 'Draft', createdBy: me, createdAt: Date.now(), note: '' }, ...l])
      log(`Created payout batch ${id} (${ok.length} riders)`, 'Payments')
      return id
    },
    [batches, payouts, me, log],
  )
  const updateBatch = useCallback((id: string, patch: Partial<PayoutBatch>) => setBatches((l) => l.map((b) => (b.id === id ? { ...b, ...patch } : b))), [])
  const sendBatch = useCallback(
    (id: string) => {
      const b = batches.find((x) => x.id === id)
      if (!b || b.status !== 'Draft') return 'This batch has already been sent.'
      if (!b.payoutIds.length) return 'Select at least one rider.'
      if (b.createdBy === me && role !== 'Owner admin') return `${b.createdBy} prepared this batch, so someone else must approve it.`
      const at = Date.now()
      let failedCount = 0
      setPayouts(
        payouts.map((p) => {
          if (!b.payoutIds.includes(p.id)) return p
          const phone = riders.find((r) => r.id === p.riderId)?.phone.replace(/\D/g, '') ?? ''
          if (phone.endsWith('0')) { failedCount++; return { ...p, status: 'Failed' as const } }
          return { ...p, status: 'Paid' as const, paidAt: at }
        }),
      )
      setBatches((l) => l.map((x) => (x.id === id ? { ...x, status: 'Sent', approvedBy: me, sentAt: at } : x)))
      log(`Approved and sent payout batch ${id}${b.createdBy === me ? ' (self-approved by owner)' : ''}${failedCount ? ` · ${failedCount} failed` : ''}`, 'Payments')
      return null
    },
    [batches, payouts, riders, setPayouts, me, role, log],
  )

  const settlements = useMemo<Settlement[]>(() => {
    const map = new Map<string, Settlement>()
    for (const o of orders.filter((x) => x.status === 'Delivered')) {
      const store = o.pickup.split(',')[0]!.trim() || STORES[0]!
      const m = monthKey(o.placedAt)
      const id = `ST-${m.replace('-', '')}-${store.replace(/\W/g, '').slice(0, 6).toUpperCase()}`
      const cur = map.get(id) ?? { id, store, month: m, sales: 0, orders: 0, commission: 0, net: 0 }
      cur.sales += o.subtotal - Math.min(o.refunded, o.subtotal)
      cur.orders += 1
      map.set(id, cur)
    }
    return [...map.values()].map((s) => {
      const commission = Math.round((s.sales * settings.storeCommission) / 100)
      return { ...s, commission, net: s.sales - commission, paid: settlePaid[s.id] }
    }).sort((a, b) => b.month.localeCompare(a.month) || a.store.localeCompare(b.store))
  }, [orders, settings.storeCommission, settlePaid])
  const paySettlement = useCallback(
    (id: string, ref: string) => {
      setSettlePaid((p) => ({ ...p, [id]: { at: Date.now(), ref, by: me } }))
      log(`Paid store settlement ${id}`, 'Payments')
    },
    [me, log],
  )

  // ---- expenses, invoices, filings
  const addExpense = useCallback(
    (e: Omit<Expense, 'id' | 'status' | 'by'>) => {
      if (isClosed(e.date)) return 'That date falls in a closed accounting period.'
      const owner = role === 'Owner admin'
      const id = `EX-${1041 + expenses.length}`
      setExpenses((l) => [{ ...e, id, status: owner ? 'Approved' : 'Pending', by: me, ...(owner ? { decidedBy: me, decidedAt: Date.now() } : {}) }, ...l])
      log(`Added expense ${id} (${kes(e.amount)})`, 'Payments', 'Updated')
      return null
    },
    [expenses.length, isClosed, role, me, log],
  )
  const decideExpense = useCallback(
    (id: string, to: 'Approved' | 'Rejected', note: string) => {
      const e = expenses.find((x) => x.id === id)
      if (!e || e.status !== 'Pending') return 'This expense has already been decided.'
      if (to === 'Approved' && e.by === me && role !== 'Owner admin') return 'You can’t approve an expense you entered yourself.'
      if (to === 'Approved' && e.amount > settings.expenseLimit && role !== 'Owner admin') return `Expenses above ${kes(settings.expenseLimit)} need an owner’s approval.`
      setExpenses((l) => l.map((x) => (x.id === id ? { ...x, status: to, decidedBy: me, decidedAt: Date.now(), note } : x)))
      log(`${to} expense ${id}`, 'Payments')
      return null
    },
    [expenses, settings.expenseLimit, me, role, log],
  )

  const addInvoice = useCallback(
    (i: Omit<Invoice, 'id' | 'payments' | 'reminders'>) => {
      const id = `INV-${2319 + invoices.length}`
      setInvoices((l) => [{ ...i, id, payments: [], reminders: [] }, ...l])
      log(`Created invoice ${id}`, 'Payments', 'Updated')
      return id
    },
    [invoices.length, log],
  )
  const recordInvoicePayment = useCallback(
    (id: string, p: Omit<InvoicePayment, 'at'>) => {
      const inv = invoices.find((x) => x.id === id)
      if (!inv) return 'Invoice not found.'
      const balance = inv.lines.reduce((n, l) => n + l.qty * l.unit, 0) * (1 + inv.vatRate / 100) - inv.payments.reduce((n, x) => n + x.amount, 0)
      if (p.amount > Math.round(balance)) return `The balance is only ${kes(Math.round(balance))}.`
      setInvoices((l) => l.map((x) => (x.id === id ? { ...x, draft: false, payments: [...x.payments, { ...p, at: Date.now() }] } : x)))
      log(`Recorded ${kes(p.amount)} against ${id}`, 'Payments')
      return null
    },
    [invoices, log],
  )
  const remindInvoice = useCallback((id: string) => { setInvoices((l) => l.map((x) => (x.id === id ? { ...x, reminders: [...x.reminders, Date.now()] } : x))); log(`Sent reminder for ${id}`, 'Payments') }, [log])
  const sendInvoice = useCallback((id: string) => { setInvoices((l) => l.map((x) => (x.id === id ? { ...x, draft: false, issued: Date.now() } : x))); log(`Sent invoice ${id}`, 'Payments') }, [log])

  const prepareFiling = useCallback((m: string) => { setFilings((f) => ({ ...f, [m]: { status: 'Draft', preparedBy: me, preparedAt: Date.now() } })); log(`Prepared VAT return for ${m}`, 'Payments') }, [me, log])
  const fileReturn = useCallback(
    (m: string, ack: string) => {
      if (!/^[A-Za-z0-9-]{6,}$/.test(ack.trim())) return 'Enter the acknowledgement number KRA gave you (at least 6 letters or digits).'
      setFilings((f) => ({ ...f, [m]: { ...f[m]!, status: 'Filed', ack: ack.trim(), filedAt: Date.now() } }))
      log(`Filed VAT return for ${m}`, 'Payments')
      return null
    },
    [log],
  )
  const addExport = useCallback(
    (dataset: ExportDataset, format: 'CSV' | 'Excel') => {
      const job: ExportJob = { id: `XP-${13 + exportsLog.length}`, name: `${dataset} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, dataset, format, by: me, at: Date.now(), status: 'Ready' }
      setExportsLog((l) => [job, ...l])
      return job
    },
    [exportsLog.length, me],
  )

  const closePeriod = useCallback((m: string, note: string) => { setClosed((c) => ({ ...c, [m]: { by: me, at: Date.now(), note } })); log(`Closed accounting period ${m}`, 'Payments', 'Security') }, [me, log])
  const reopenPeriod = useCallback((m: string) => { setClosed((c) => { const n = { ...c }; delete n[m]; return n }); log(`Reopened accounting period ${m}`, 'Payments', 'Security') }, [log])

  // ---- payroll
  const setEmployeePay = useCallback((staffId: string, patch: Partial<EmployeePay>) => {
    setEmployeePayState((l) => (l.some((p) => p.staffId === staffId) ? l.map((p) => (p.staffId === staffId ? { ...p, ...patch } : p)) : [...l, { staffId, basic: 0, house: 0, transport: 0, kraPin: '', nssfNo: '', shaNo: '', payTo: '', start: '', ...patch }]))
    log('Updated an employee’s pay profile', 'Payroll', 'Security')
  }, [log])

  const prepareRun = useCallback(
    (m: string) => {
      if (runs.some((r) => r.month === m)) return `A payroll run for ${m} already exists.`
      if (isClosed(Date.parse(`${m}-15`))) return 'That accounting period is closed.'
      const lines = staff
        .filter((s) => s.status === 'Active')
        .flatMap((s) => {
          const e = employeePay.find((p) => p.staffId === s.id)
          if (!e || e.basic <= 0) return []
          const adj: Adjust = { bonus: 0, otherDeduction: 0, note: '' }
          return [{ staffId: s.id, name: s.name, role: s.role, adj, slip: calcSlip(e, statutory, adj) }]
        })
      if (!lines.length) return 'No active staff have a pay profile yet.'
      setRuns((l) => [{ id: `PR-${m.replace('-', '')}`, month: m, status: 'Draft', preparedBy: me, lines }, ...l])
      log(`Prepared payroll run for ${m}`, 'Payroll', 'Security')
      return null
    },
    [runs, staff, employeePay, statutory, isClosed, me, log],
  )
  const setRunAdjust = useCallback(
    (runId: string, staffId: string, adj: Adjust) => {
      setRuns((l) => l.map((r) => (r.id !== runId || r.status !== 'Draft' ? r : { ...r, lines: r.lines.map((x) => { const e = employeePay.find((p) => p.staffId === staffId); return x.staffId === staffId && e ? { ...x, adj, slip: calcSlip(e, statutory, adj) } : x }) })))
    },
    [employeePay, statutory],
  )
  const runAction = useCallback(
    (runId: string, action: 'submit' | 'return' | 'approve' | 'pay') => {
      const r = runs.find((x) => x.id === runId)
      if (!r) return 'Run not found.'
      const at = Date.now()
      const set = (patch: Partial<PayrollRun>) => setRuns((l) => l.map((x) => (x.id === runId ? { ...x, ...patch } : x)))
      if (action === 'submit') { if (r.status !== 'Draft') return 'Only a draft can be submitted.'; set({ status: 'Pending approval', submittedAt: at }); log(`Submitted payroll ${r.month} for approval`, 'Payroll', 'Security'); return null }
      if (action === 'return') { if (r.status !== 'Pending approval') return 'Nothing to return.'; set({ status: 'Draft' }); log(`Returned payroll ${r.month} for changes`, 'Payroll', 'Security'); return null }
      if (action === 'approve') {
        if (r.status !== 'Pending approval') return 'This run is not waiting for approval.'
        if (role !== 'Owner admin') return 'Only an owner can approve payroll.'
        if (r.preparedBy === me) return 'You prepared this run, so someone else must approve it.'
        set({ status: 'Approved', approvedBy: me, approvedAt: at }); log(`Approved payroll ${r.month}`, 'Payroll', 'Security'); return null
      }
      if (r.status !== 'Approved') return 'Approve the run before paying it.'
      set({ status: 'Paid', paidAt: at })
      log(`Marked payroll ${r.month} as paid`, 'Payroll', 'Security')
      return null
    },
    [runs, role, me, log],
  )
  const remit = useCallback((runId: string, kind: RemitKind, ref: string) => { setRemitted((m) => ({ ...m, [`${runId}:${kind}`]: { ref, at: Date.now() } })); log(`Remitted ${kind} for ${runId}`, 'Payroll', 'Security') }, [log])

  const value = useMemo<Finance>(
    () => ({
      settings, setSettings, closed, closePeriod, reopenPeriod, isClosed, vatRate, month, failed, payments, retryFailed, statement, importStatement, resolveLine, completeReconciliation,
      codRecords, recordCod, batches, createBatch, updateBatch, sendBatch, settlements, paySettlement, expenses, addExpense, decideExpense, invoices, addInvoice, recordInvoicePayment, remindInvoice, sendInvoice,
      filings, prepareFiling, fileReturn, exportsLog, addExport, employeePay, setEmployeePay, statutory, setStatutory, runs, prepareRun, setRunAdjust, runAction, remitted, remit,
    }),
    [settings, closed, closePeriod, reopenPeriod, isClosed, vatRate, month, failed, payments, retryFailed, statement, importStatement, resolveLine, completeReconciliation, codRecords, recordCod, batches, createBatch, updateBatch, sendBatch, settlements, paySettlement, expenses, addExpense, decideExpense, invoices, addInvoice, recordInvoicePayment, remindInvoice, sendInvoice, filings, prepareFiling, fileReturn, exportsLog, addExport, employeePay, setEmployeePay, statutory, runs, prepareRun, setRunAdjust, runAction, remitted, remit],
  )
  return <Ctx value={value}>{children}</Ctx>
}

export function useFinance(): Finance {
  const ctx = use(Ctx)
  if (!ctx) throw new Error('useFinance must be used inside <FinanceProvider>')
  return ctx
}

export { vatIn }
