import type { Customer, Staff } from './seed'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export const monthKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}
export const monthStart = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y!, m! - 1, 1).getTime()
}
export const monthEnd = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y!, m!, 1).getTime()
}
/** The month before / after a key. */
export const shiftMonth = (key: string, by: number) => {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y!, m! - 1 + by, 1).getTime())
}

// ---- tax and cost assumptions ----------------------------------------------------------------------------------

export const vatIn = (gross: number, rate: number) => gross - gross / (1 + rate / 100)

export interface FinanceSettings {
  /** Product cost as a share of product sales (%). Until real costs come from the backend. */
  cogsRate: number
  /** Share of product sales that ShopCore keeps from partner stores (%). */
  storeCommission: number
  /** Payment processing cost (% of card and M-Pesa sales). */
  processingFee: number
  /** A rider must hand in cash within this many hours. */
  codWindowHours: number
  /** Staff may approve an expense up to this amount; above it needs an owner. */
  expenseLimit: number
}
export const FINANCE_DEFAULTS: FinanceSettings = { cogsRate: 68, storeCommission: 12, processingFee: 1.5, codWindowHours: 24, expenseLimit: 100_000 }

// ---- expenses ------------------------------------------------------------------------------------------------------

export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected'
export const EXPENSE_CATEGORIES = ['Marketing', 'Fuel & fleet', 'Software', 'Office & hub', 'Professional fees', 'Insurance', 'Other'] as const
export interface Expense {
  id: string
  date: number
  category: string
  payee: string
  description: string
  amount: number
  status: ExpenseStatus
  by: string
  decidedBy?: string
  decidedAt?: number
  note?: string
}

export const seedExpenses = (now: number): Expense[] => {
  const e = (n: number, days: number, category: string, payee: string, description: string, amount: number, status: ExpenseStatus, by: string): Expense => ({
    id: `EX-${n}`, date: now - days * DAY, category, payee, description, amount, status, by,
    ...(status !== 'Pending' ? { decidedBy: 'Amara Mwangi', decidedAt: now - (days - 1) * DAY } : {}),
  })
  return [
    e(1040, 2, 'Marketing', 'Meta Platforms', 'Customer acquisition campaign', 248_000, 'Approved', 'Samuel Kimani'),
    e(1039, 4, 'Fuel & fleet', 'PetroCity Kenya', 'Rider fuel reimbursements', 86_400, 'Approved', 'Samuel Kimani'),
    e(1038, 5, 'Software', 'CloudRoute Ltd', 'Monthly platform subscription', 54_000, 'Pending', 'Samuel Kimani'),
    e(1037, 7, 'Office & hub', 'Nairobi Workspaces', 'Hub utilities and rent', 186_000, 'Approved', 'Samuel Kimani'),
    e(1036, 9, 'Professional fees', 'Mwangi & Co. Advocates', 'Rider contract review', 72_000, 'Approved', 'Samuel Kimani'),
    e(1035, 12, 'Insurance', 'Jubilee Insurance', 'Rider accident cover (monthly)', 64_500, 'Approved', 'Samuel Kimani'),
    e(1034, 16, 'Marketing', 'Radio Africa', 'Weekend radio spots', 120_000, 'Rejected', 'Samuel Kimani'),
    e(1033, 22, 'Software', 'Safaricom', 'Bulk SMS credits', 38_000, 'Approved', 'Samuel Kimani'),
    e(1032, 31, 'Marketing', 'Meta Platforms', 'Customer acquisition campaign', 231_000, 'Approved', 'Samuel Kimani'),
    e(1031, 34, 'Office & hub', 'Nairobi Workspaces', 'Hub utilities and rent', 186_000, 'Approved', 'Samuel Kimani'),
    e(1030, 38, 'Fuel & fleet', 'PetroCity Kenya', 'Rider fuel reimbursements', 79_800, 'Approved', 'Samuel Kimani'),
  ]
}

// ---- invoices (business accounts) ---------------------------------------------------------------------------------------

export interface InvoiceLine {
  desc: string
  qty: number
  unit: number
}
export interface InvoicePayment {
  at: number
  amount: number
  method: string
  ref: string
}
export interface Invoice {
  id: string
  customer: string
  contact: string
  email: string
  pin: string
  address: string
  issued: number
  due: number
  lines: InvoiceLine[]
  vatRate: number
  draft: boolean
  payments: InvoicePayment[]
  reminders: number[]
}
export const invoiceSubtotal = (i: Invoice) => i.lines.reduce((n, l) => n + l.qty * l.unit, 0)
export const invoiceVat = (i: Invoice) => Math.round(invoiceSubtotal(i) * (i.vatRate / 100))
export const invoiceTotal = (i: Invoice) => invoiceSubtotal(i) + invoiceVat(i)
export const invoicePaid = (i: Invoice) => i.payments.reduce((n, p) => n + p.amount, 0)
export const invoiceBalance = (i: Invoice) => Math.max(0, invoiceTotal(i) - invoicePaid(i))
export type InvoiceStatus = 'Draft' | 'Sent' | 'Partly paid' | 'Paid' | 'Overdue'
export const invoiceStatus = (i: Invoice, now: number): InvoiceStatus =>
  i.draft ? 'Draft' : invoiceBalance(i) === 0 ? 'Paid' : now > i.due ? 'Overdue' : invoicePaid(i) > 0 ? 'Partly paid' : 'Sent'

export const seedInvoices = (now: number): Invoice[] => {
  const inv = (n: number, customer: string, contact: string, email: string, ago: number, terms: number, lines: InvoiceLine[], paidShare = 0, draft = false): Invoice => {
    const issued = now - ago * DAY
    const base: Invoice = { id: `INV-${n}`, customer, contact, email, pin: `P05${n}${n % 7}81M`.slice(0, 11), address: 'Nairobi, Kenya', issued, due: issued + terms * DAY, lines, vatRate: 16, draft, payments: [], reminders: [] }
    if (paidShare > 0) base.payments = [{ at: issued + 6 * DAY, amount: Math.round(invoiceTotal(base) * paidShare), method: 'Bank transfer', ref: `BK-${n}71` }]
    return base
  }
  return [
    inv(2318, 'Kifaru Roasters Ltd', 'Joseph Kariuki', 'accounts@kifaru.co.ke', 14, 30, [{ desc: 'Marketplace orders · month to date', qty: 118, unit: 1300 }, { desc: 'Delivery service fees', qty: 118, unit: 180 }], 1),
    inv(2317, 'Coastline Home Ltd', 'Mercy Wanjiru', 'accounts@coastlinehome.co.ke', 17, 30, [{ desc: 'Marketplace orders · month to date', qty: 42, unit: 1500 }, { desc: 'Delivery service fees', qty: 42, unit: 180 }], 0.11),
    inv(2315, 'Amani Grocers', 'Peter Ouma', 'finance@amanigrocers.co.ke', 52, 30, [{ desc: 'Bulk delivery contract', qty: 1, unit: 36_640 }]),
    inv(2312, 'Nairobi Office Hub', 'Lydia Wambui', 'ap@nairobihub.co.ke', 30, 14, [{ desc: 'Office supplies delivery', qty: 20, unit: 780 }], 1),
    inv(2311, 'Savannah Bakers', 'Daniel Ouma', 'daniel@savannahbakers.co.ke', 9, 30, [{ desc: 'Marketplace orders · month to date', qty: 64, unit: 1100 }, { desc: 'Delivery service fees', qty: 64, unit: 180 }]),
    inv(2310, 'Rift Valley Foods', 'Winnie Auma', 'winnie@riftfoods.co.ke', 3, 30, [{ desc: 'Marketplace orders · month to date', qty: 30, unit: 1250 }], 0, true),
  ]
}

// ---- failed payments -------------------------------------------------------------------------------------------------------

export interface FailedPayment {
  id: string
  orderId: string
  customer: string
  method: 'M-Pesa' | 'Card'
  amount: number
  reason: string
  attempts: number
  status: 'Failed' | 'Recovered' | 'Manual review'
  at: number
  ref: string
}
/** Reasons that usually clear on a second try. */
export const RETRYABLE = ['Customer not reachable', 'Timeout at gateway', 'Network error']

export const seedFailed = (customers: Customer[], now: number): FailedPayment[] => {
  const rows: [string, 'M-Pesa' | 'Card', number, string, number, number][] = [
    ['M-Pesa', 'M-Pesa', 6700, 'Customer not reachable', 1, 18], ['Card', 'Card', 3500, 'Insufficient funds', 2, 43],
    ['M-Pesa', 'M-Pesa', 2100, 'Timeout at gateway', 1, 66], ['Card', 'Card', 8200, 'Authentication failed', 3, 190],
    ['M-Pesa', 'M-Pesa', 1850, 'Network error', 1, 240], ['M-Pesa', 'M-Pesa', 4350, 'Timeout at gateway', 2, 330],
  ]
  return rows.map(([, method, amount, reason, attempts, ago], i) => ({
    id: `PM-${10480 - i * 11}`, orderId: `SC-${4960 + i}`, customer: customers[(i * 7 + 3) % customers.length]!.name, method, amount, reason, attempts,
    status: attempts >= 3 ? ('Manual review' as const) : ('Failed' as const), at: now - ago * MIN, ref: `QGH${8000 + i * 37}K${i}X`,
  }))
}

// ---- reconciliation ---------------------------------------------------------------------------------------------------------------

export interface StatementLine {
  id: string
  ref: string
  orderId: string | null
  gateway: number
  ours: number | null
  resolution?: 'adjusted' | 'written-off' | 'matched-manually'
  note?: string
}
export interface Statement {
  file: string
  importedAt: number
  period: string
  lines: StatementLine[]
  completed: boolean
}
export type MatchState = 'Matched' | 'Mismatch' | 'Unmatched' | 'Resolved'
export const matchState = (l: StatementLine): MatchState =>
  l.resolution ? 'Resolved' : l.ours === null ? 'Unmatched' : l.gateway === l.ours ? 'Matched' : 'Mismatch'

// ---- COD, payout batches, store settlements ----------------------------------------------------------------------------------------

export interface CodRecord {
  id: string
  riderId: string
  rider: string
  amount: number
  method: string
  ref: string
  account: string
  note: string
  at: number
  by: string
}
export const COD_ACCOUNTS = ['Co-op Bank · ShopCore Collections', 'M-Pesa Paybill · 523810'] as const
export const COD_METHODS = ['Bank deposit', 'M-Pesa transfer', 'Cash at hub'] as const

export type BatchStatus = 'Draft' | 'Sent'
export interface PayoutBatch {
  id: string
  period: string
  payoutIds: string[]
  status: BatchStatus
  createdBy: string
  createdAt: number
  approvedBy?: string
  sentAt?: number
  note: string
}

export interface Settlement {
  id: string
  store: string
  month: string
  sales: number
  orders: number
  commission: number
  net: number
  paid?: { at: number; ref: string; by: string }
}

// ---- VAT filings ------------------------------------------------------------------------------------------------------------------

export interface Filing {
  status: 'Draft' | 'Filed'
  preparedBy: string
  preparedAt: number
  ack?: string
  filedAt?: number
}
/** Past months with fixed figures so the report has history before the backend exists. */
export const HISTORY: Record<string, { sales: number; vat: number; refunds: number }> = {}

// ---- exports ----------------------------------------------------------------------------------------------------------------------------

export const EXPORT_DATASETS = ['Payments', 'Refunds', 'Rider payouts', 'COD balances', 'Expenses', 'Invoices', 'VAT summary', 'Profit and loss', 'Payroll summary', 'Store settlements'] as const
export type ExportDataset = (typeof EXPORT_DATASETS)[number]
export const EXPORT_FORMATS = ['CSV', 'Excel'] as const
export interface ExportJob {
  id: string
  name: string
  dataset: ExportDataset
  format: 'CSV' | 'Excel'
  by: string
  at: number
  status: 'Ready' | 'Expired'
}
export const seedExports = (now: number): ExportJob[] => [
  { id: 'XP-12', name: 'Payments · last month', dataset: 'Payments', format: 'CSV', by: 'Amara Mwangi', at: now - 2 * HOUR, status: 'Ready' },
  { id: 'XP-11', name: 'Rider payouts · last period', dataset: 'Rider payouts', format: 'Excel', by: 'Samuel Kimani', at: now - 4 * HOUR, status: 'Ready' },
  { id: 'XP-10', name: 'VAT summary · last month', dataset: 'VAT summary', format: 'CSV', by: 'Amara Mwangi', at: now - DAY, status: 'Ready' },
  { id: 'XP-09', name: 'Expenses · quarter', dataset: 'Expenses', format: 'CSV', by: 'Samuel Kimani', at: now - 9 * DAY, status: 'Expired' },
]

// ---- payroll -------------------------------------------------------------------------------------------------------------------------

export interface EmployeePay {
  staffId: string
  basic: number
  house: number
  transport: number
  kraPin: string
  nssfNo: string
  shaNo: string
  /** Where the net pay goes. */
  payTo: string
  start: string
}

/** Kenya statutory deductions. Rates are settings, not code, because they change by law. Confirm them with your accountant. */
export interface Statutory {
  nssfRate: number
  nssfLower: number
  nssfUpper: number
  shifRate: number
  shifMin: number
  housingRate: number
  relief: number
  /** Monthly PAYE bands: [band size, rate %]. The last band has no upper limit. */
  bands: [number, number][]
}
export const STATUTORY_DEFAULTS: Statutory = {
  nssfRate: 6, nssfLower: 9000, nssfUpper: 108_000, shifRate: 2.75, shifMin: 300, housingRate: 1.5, relief: 2400,
  bands: [[24_000, 10], [8_333, 25], [467_667, 30], [300_000, 32.5], [Number.MAX_SAFE_INTEGER, 35]],
}

export interface Adjust {
  bonus: number
  otherDeduction: number
  note: string
}
export interface Slip {
  basic: number
  allowances: number
  bonus: number
  gross: number
  nssf: number
  shif: number
  housing: number
  taxable: number
  paye: number
  otherDeduction: number
  net: number
  employerNssf: number
  employerHousing: number
}

function bandTax(taxable: number, bands: [number, number][]) {
  let left = taxable
  let tax = 0
  for (const [size, rate] of bands) {
    if (left <= 0) break
    const part = Math.min(left, size)
    tax += (part * rate) / 100
    left -= part
  }
  return tax
}

export function calcSlip(e: EmployeePay, st: Statutory, adj: Adjust): Slip {
  const allowances = e.house + e.transport
  const gross = e.basic + allowances + adj.bonus
  const nssf = Math.round((Math.min(gross, st.nssfUpper) * st.nssfRate) / 100)
  const shif = Math.round(Math.max(st.shifMin, (gross * st.shifRate) / 100))
  const housing = Math.round((gross * st.housingRate) / 100)
  const taxable = Math.max(0, gross - nssf - shif - housing)
  const paye = Math.max(0, Math.round(bandTax(taxable, st.bands) - st.relief))
  const net = gross - nssf - shif - housing - paye - adj.otherDeduction
  return { basic: e.basic, allowances, bonus: adj.bonus, gross, nssf, shif, housing, taxable, paye, otherDeduction: adj.otherDeduction, net, employerNssf: nssf, employerHousing: housing }
}

export type RunStatus = 'Draft' | 'Pending approval' | 'Approved' | 'Paid'
export interface RunLine {
  staffId: string
  name: string
  role: string
  adj: Adjust
  slip: Slip
}
export interface PayrollRun {
  id: string
  month: string
  status: RunStatus
  preparedBy: string
  submittedAt?: number
  approvedBy?: string
  approvedAt?: number
  paidAt?: number
  lines: RunLine[]
}
export const runTotals = (r: PayrollRun) => ({
  gross: r.lines.reduce((n, l) => n + l.slip.gross, 0),
  net: r.lines.reduce((n, l) => n + l.slip.net, 0),
  paye: r.lines.reduce((n, l) => n + l.slip.paye, 0),
  nssf: r.lines.reduce((n, l) => n + l.slip.nssf * 2, 0),
  shif: r.lines.reduce((n, l) => n + l.slip.shif, 0),
  housing: r.lines.reduce((n, l) => n + l.slip.housing * 2, 0),
  employerCost: r.lines.reduce((n, l) => n + l.slip.gross + l.slip.employerNssf + l.slip.employerHousing, 0),
})

export type RemitKind = 'PAYE' | 'NSSF' | 'SHIF' | 'Housing levy'
export const REMIT_KINDS: RemitKind[] = ['PAYE', 'NSSF', 'SHIF', 'Housing levy']
export const REMIT_TO: Record<RemitKind, string> = { PAYE: 'KRA', NSSF: 'NSSF', SHIF: 'SHA', 'Housing levy': 'KRA (Affordable Housing Levy)' }
/** Day of the next month the payment is due. */
export const REMIT_DAY: Record<RemitKind, number> = { PAYE: 9, NSSF: 15, SHIF: 9, 'Housing levy': 9 }
export const remitAmount = (r: PayrollRun, k: RemitKind) => { const t = runTotals(r); return k === 'PAYE' ? t.paye : k === 'NSSF' ? t.nssf : k === 'SHIF' ? t.shif : t.housing }
export const remitDue = (month: string, k: RemitKind) => { const [y, m] = shiftMonth(month, 1).split('-').map(Number); return new Date(y!, m! - 1, REMIT_DAY[k], 23, 59).getTime() }

const SALARY: Record<string, [number, number, number]> = {
  'Owner admin': [280_000, 40_000, 15_000], 'Operations manager': [150_000, 20_000, 10_000], 'Dispatch manager': [110_000, 15_000, 8000], 'Finance analyst': [120_000, 15_000, 8000],
  'Customer support': [62_000, 8000, 5000], 'Rider manager': [85_000, 10_000, 6000], 'IT support': [95_000, 10_000, 6000],
}
export const seedEmployeePay = (staff: Staff[]): EmployeePay[] =>
  staff.map((s, i) => {
    const [basic, house, transport] = SALARY[s.role] ?? [60_000, 5000, 4000]
    const n = 100 + i * 17
    return {
      staffId: s.id, basic, house, transport, kraPin: `A${String(100_000_000 + n * 7919).slice(0, 9)}${String.fromCharCode(65 + (i % 26))}`, nssfNo: `${210000 + n * 13}`, shaNo: `SHA-${900000 + n * 7}`,
      payTo: i % 3 === 0 ? 'Equity Bank ••• 4417' : `M-Pesa ${s.phone.replace(/\s/g, '').replace('+254', '0').slice(0, 4)} ••• ${s.phone.slice(-3)}`, start: i < 4 ? '2023-02-01' : '2024-06-03',
    }
  })

export const seedRuns = (staff: Staff[], pay: EmployeePay[], st: Statutory, now: number): PayrollRun[] => {
  const cur = monthKey(now)
  return [shiftMonth(cur, -3), shiftMonth(cur, -2), shiftMonth(cur, -1)].map((month, i) => ({
    id: `PR-${month.replace('-', '')}`, month, status: 'Paid' as const, preparedBy: 'Samuel Kimani', approvedBy: 'Amara Mwangi',
    submittedAt: monthEnd(month) - 5 * DAY, approvedAt: monthEnd(month) - 3 * DAY, paidAt: monthEnd(month) - 2 * DAY,
    lines: staff
      .filter((s) => s.status !== 'Suspended' && !(i === 0 && s.id === 's14'))
      .map((s) => {
        const e = pay.find((p) => p.staffId === s.id)!
        const adj: Adjust = { bonus: 0, otherDeduction: 0, note: '' }
        return { staffId: s.id, name: s.name, role: s.role, adj, slip: calcSlip(e, st, adj) }
      }),
  }))
}

export const seedRemitted = (runs: PayrollRun[]): Record<string, { ref: string; at: number }> => {
  const out: Record<string, { ref: string; at: number }> = {}
  runs.forEach((r, i) => {
    REMIT_KINDS.forEach((k) => {
      const last = i === runs.length - 1
      if (last && (k === 'Housing levy' || k === 'SHIF')) return // the most recent month still has levies to pay
      out[`${r.id}:${k}`] = { ref: `${k.slice(0, 3).toUpperCase()}-${r.month.replace('-', '')}-${i + 1}`, at: remitDue(r.month, k) - DAY }
    })
  })
  return out
}
