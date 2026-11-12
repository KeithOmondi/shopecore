import type { Expense, FinanceSettings, PayrollRun } from '../data/finance'
import { monthEnd, monthStart, runTotals } from '../data/finance'
import type { MonthStats } from './finance'

export interface Pnl {
  productNet: number
  deliveryNet: number
  refundsNet: number
  revenue: number
  cogs: number
  grossProfit: number
  riderPay: number
  processing: number
  expenses: number
  expenseByCategory: [string, number][]
  payroll: number
  opex: number
  net: number
}

/** Profit and loss for one month, with VAT taken out of the prices customers paid. */
export function computePnl(m: MonthStats, s: FinanceSettings, vatRate: number, expenses: Expense[], runs: PayrollRun[]): Pnl {
  const k = 1 + vatRate / 100
  const productNet = m.productSales / k
  const deliveryNet = m.delivery / k
  const refundsNet = m.refunds / k
  const revenue = productNet + deliveryNet - refundsNet
  const cogs = (productNet * s.cogsRate) / 100
  const riderPay = m.riderPay
  const processing = (m.gross * s.processingFee) / 100
  const from = monthStart(m.key)
  const to = monthEnd(m.key)
  const exp = expenses.filter((e) => e.status === 'Approved' && e.date >= from && e.date < to)
  const byCat = new Map<string, number>()
  for (const e of exp) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount)
  const expTotal = exp.reduce((n, e) => n + e.amount, 0)
  const payroll = runs.filter((r) => r.month === m.key && (r.status === 'Approved' || r.status === 'Paid')).reduce((n, r) => n + runTotals(r).employerCost, 0)
  const grossProfit = revenue - cogs
  const opex = riderPay + processing + expTotal + payroll
  return { productNet, deliveryNet, refundsNet, revenue, cogs, grossProfit, riderPay, processing, expenses: expTotal, expenseByCategory: [...byCat.entries()].sort((a, b) => b[1] - a[1]), payroll, opex, net: grossProfit - opex }
}

export const pctOf = (n: number, d: number) => (d === 0 ? '0%' : `${((n / d) * 100).toFixed(1)}%`)
