import type { Order, Product } from './commerce'

const HOUR = 3_600_000
const DAY = 86_400_000

// ---- locations ----------------------------------------------------------------------------------------------------

/** Where stock is kept. These can be your own warehouses or partner stores you collect from. */
export interface Location {
  id: string
  name: string
  city: string
  /** Units it can hold. */
  capacity: number
  active: boolean
}
export const seedLocations = (): Location[] => [
  { id: 'l1', name: 'Nairobi Central', city: 'Nairobi', capacity: 600, active: true },
  { id: 'l2', name: 'Mombasa Hub', city: 'Mombasa', capacity: 300, active: true },
  { id: 'l3', name: 'Kisumu Depot', city: 'Kisumu', capacity: 200, active: true },
]
/** How a product’s stock is first spread across locations. */
const SPLIT = [0.6, 0.25, 0.15]

/** Per product, units on hand at each location. */
export type Levels = Record<string, Record<string, number>>

export function splitStock(total: number, locIds: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  let left = total
  locIds.forEach((id, i) => {
    if (i === locIds.length - 1) out[id] = left
    else {
      const n = Math.floor(total * (SPLIT[i] ?? 0))
      out[id] = n
      left -= n
    }
  })
  return out
}

/**
 * Orders and the product form change a product’s total stock directly. Keep the per-location numbers adding up
 * to that total by moving the difference at the main location (and, if that runs out, the next ones).
 */
export function reconcile(base: Record<string, number> | undefined, total: number, order: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  order.forEach((id) => { out[id] = base?.[id] ?? 0 })
  let diff = total - order.reduce((n, id) => n + out[id]!, 0)
  for (const id of order) {
    if (diff === 0) break
    if (diff > 0) { out[id] = out[id]! + diff; diff = 0 }
    else { const take = Math.min(out[id]!, -diff); out[id] = out[id]! - take; diff += take }
  }
  return out
}

// ---- suppliers and brands ------------------------------------------------------------------------------------------

export interface Supplier {
  id: string
  name: string
  contact: string
  email: string
  phone: string
  city: string
  terms: string
  leadDays: number
  minOrder: number
  status: 'Active' | 'On hold'
  /** On-time delivery shown before there is enough receiving history to work it out. */
  onTime: number
}
export const seedSuppliers = (): Supplier[] => [
  { id: 'su1', name: 'Kilele Leather Works', contact: 'Peter Karanja', email: 'orders@kilele.co.ke', phone: '+254 712 555 018', city: 'Nairobi', terms: 'Net 30', leadDays: 7, minOrder: 50_000, status: 'Active', onTime: 96 },
  { id: 'su2', name: 'Urban Threads Ltd', contact: 'Mercy Achieng', email: 'sales@urbanthreads.co.ke', phone: '+254 722 555 310', city: 'Nairobi', terms: 'Net 30', leadDays: 5, minOrder: 40_000, status: 'Active', onTime: 98 },
  { id: 'su3', name: 'Stride Footwear Co.', contact: 'Hassan Ali', email: 'trade@stride.co.ke', phone: '+254 701 555 204', city: 'Mombasa', terms: 'Net 14', leadDays: 10, minOrder: 60_000, status: 'Active', onTime: 91 },
  { id: 'su4', name: 'Nuru Accessories', contact: 'Grace Wanjiru', email: 'hello@nuru.co.ke', phone: '+254 790 555 511', city: 'Nakuru', terms: 'Net 30', leadDays: 8, minOrder: 25_000, status: 'Active', onTime: 88 },
  { id: 'su5', name: 'Nyumba Home Goods', contact: 'Samuel Otieno', email: 'accounts@nyumba.co.ke', phone: '+254 733 555 902', city: 'Kisumu', terms: 'Net 45', leadDays: 6, minOrder: 30_000, status: 'On hold', onTime: 82 },
]

export interface Brand { id: string; name: string; origin: string; status: 'Active' | 'Draft'; updatedAt: number }
export const seedBrands = (now: number): Brand[] => [
  { id: 'br1', name: 'Kilele', origin: 'Nairobi, Kenya', status: 'Active', updatedAt: now - 2 * DAY },
  { id: 'br2', name: 'Urban Threads', origin: 'Nairobi, Kenya', status: 'Active', updatedAt: now - 3 * DAY },
  { id: 'br3', name: 'Stride', origin: 'Mombasa, Kenya', status: 'Active', updatedAt: now - 5 * DAY },
  { id: 'br4', name: 'Nuru', origin: 'Nakuru, Kenya', status: 'Active', updatedAt: now - 6 * DAY },
  { id: 'br5', name: 'Nyumba', origin: 'Kisumu, Kenya', status: 'Draft', updatedAt: now - 9 * DAY },
]

// ---- product details kept with inventory ---------------------------------------------------------------------------------

export interface Variant { name: string; size: string; color: string; sku: string; barcode: string }
export interface ProductMeta {
  brandId: string
  supplierId: string
  cost: number
  barcode: string
  tax: 'Standard VAT' | 'Zero-rated'
  track: boolean
  subcategory: string
  handle: string
  seoTitle: string
  seoDesc: string
  variants: Variant[]
}

/** A valid EAN-13 barcode for a number. */
export function ean13(seed: number): string {
  const body = `616${String(seed).padStart(9, '0').slice(-9)}`
  const sum = body.split('').reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return body + String((10 - (sum % 10)) % 10)
}
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const CAT_BRAND: Record<string, [string, string]> = { Bags: ['br1', 'su1'], Clothing: ['br2', 'su2'], Footwear: ['br3', 'su3'], Accessories: ['br4', 'su4'], Home: ['br5', 'su5'] }
const SUB: Record<string, string> = { p1: 'Weekenders', p2: 'Totes', p3: 'Shirts', p4: 'Trousers', p5: 'Running', p6: 'Sandals', p7: 'Wallets', p8: 'Eyewear', p9: 'Kitchen', p10: 'Throws', p11: 'Outerwear', p12: 'Backpacks', p13: 'Sneakers', p14: 'Scarves', p15: 'Candles', p16: 'Shirts' }

export const defaultMeta = (p: Product, index: number): ProductMeta => {
  const [brandId, supplierId] = CAT_BRAND[p.category] ?? ['', '']
  return {
    brandId, supplierId, cost: Math.round((p.price * 0.58) / 10) * 10, barcode: ean13(index + 1 + Number(p.id.replace(/\D/g, '') || 0) * 7919), tax: 'Standard VAT', track: true,
    subcategory: SUB[p.id] ?? '', handle: slug(p.name), seoTitle: '', seoDesc: '', variants: [],
  }
}

export interface CategoryNode { handle: string; description: string; subs: string[] }
export const seedTree = (categories: string[]): Record<string, CategoryNode> => {
  const subs: Record<string, string[]> = { Bags: ['Totes', 'Backpacks', 'Weekenders'], Clothing: ['Shirts', 'Trousers', 'Outerwear'], Footwear: ['Sneakers', 'Sandals', 'Running'], Accessories: ['Wallets', 'Eyewear', 'Scarves'], Home: ['Throws', 'Kitchen', 'Candles'] }
  return Object.fromEntries(categories.map((c) => [c, { handle: slug(c), description: `${c} for everyday life, delivered across Nairobi.`, subs: subs[c] ?? [] }]))
}

// ---- stock movements --------------------------------------------------------------------------------------------------------

export type MoveType = 'Sale' | 'Transfer in' | 'Transfer out' | 'Adjustment' | 'PO receipt' | 'Write-off' | 'Return restock' | 'Opening stock'
export const MOVE_TYPES: MoveType[] = ['Sale', 'Transfer in', 'Transfer out', 'Adjustment', 'PO receipt', 'Write-off', 'Return restock', 'Opening stock']
export interface Movement { id: string; at: number; productId: string; locationId: string; type: MoveType; qty: number; ref: string; by: string; balance: number; note?: string }
export interface Move { productId: string; locationId: string; delta: number; type: MoveType; ref: string; note?: string }

export const seedMovements = (now: number, products: Product[], levels: Levels, staff: string[]): Movement[] => {
  const raw: Omit<Movement, 'id' | 'balance'>[] = []
  const by = (i: number) => staff[i % staff.length] ?? 'System'
  const picks = products.filter((p) => p.stock >= 20 && p.status === 'Active').slice(0, 6)
  picks.forEach((p, i) => {
    const loc = i % 2 ? 'l2' : 'l1'
    raw.push({ at: now - (5 * DAY - i * 3 * HOUR), productId: p.id, locationId: loc, type: 'PO receipt', qty: 20, ref: `PO-10${30 + i}`, by: by(i) })
    raw.push({ at: now - (3 * DAY - i * 2 * HOUR), productId: p.id, locationId: loc, type: 'Sale', qty: -2, ref: `SC-${4880 + i}`, by: 'System' })
    raw.push({ at: now - (2 * DAY - i * HOUR), productId: p.id, locationId: loc, type: 'Sale', qty: -1 - (i % 2), ref: `SC-${4900 + i}`, by: 'System' })
    if (i % 3 === 0) raw.push({ at: now - (1 * DAY + i * HOUR), productId: p.id, locationId: loc, type: 'Adjustment', qty: 3, ref: `ADJ-${880 + i}`, by: by(i + 1), note: 'Found during cycle count' })
    if (i === 1) raw.push({ at: now - 20 * HOUR, productId: p.id, locationId: 'l1', type: 'Transfer in', qty: 6, ref: 'TR-1042', by: by(2) })
    if (i === 4) raw.push({ at: now - 9 * HOUR, productId: p.id, locationId: loc, type: 'Write-off', qty: -2, ref: 'RT-2071', by: by(0), note: 'Damaged in storage' })
  })
  raw.sort((a, b) => a.at - b.at)
  // work out the balance after each movement, so the last one matches what is on the shelf today
  const total: Record<string, number> = {}
  raw.forEach((m) => { const k = `${m.productId}|${m.locationId}`; total[k] = (total[k] ?? 0) + m.qty })
  const run: Record<string, number> = {}
  const out = raw.map((m, i) => {
    const k = `${m.productId}|${m.locationId}`
    if (run[k] === undefined) run[k] = Math.max(0, (levels[m.productId]?.[m.locationId] ?? 0) - total[k]!)
    run[k] = run[k]! + m.qty
    return { ...m, id: `mv${i}`, balance: run[k]! }
  })
  return out.reverse()
}

// ---- purchase orders ---------------------------------------------------------------------------------------------------------

export type POStatus = 'Draft' | 'Pending approval' | 'Approved' | 'In transit' | 'Partially received' | 'Received' | 'Cancelled'
export const PO_STATUSES: POStatus[] = ['Draft', 'Pending approval', 'Approved', 'In transit', 'Partially received', 'Received', 'Cancelled']
export interface POLine { productId: string; qty: number; cost: number; received: number; damaged: number }
export interface PurchaseOrder {
  id: string
  supplierId: string
  locationId: string
  expected: number
  status: POStatus
  lines: POLine[]
  shipping: number
  notes: string
  createdBy: string
  createdAt: number
  approvedBy?: string
  deliveryRef?: string
  receivedAt?: number
}
/** Orders above this total need someone other than the creator to approve them. */
export const PO_APPROVAL_LIMIT = 100_000
export const poSubtotal = (p: PurchaseOrder) => p.lines.reduce((n, l) => n + l.qty * l.cost, 0)
export const poTax = (p: PurchaseOrder, rate: number) => Math.round(poSubtotal(p) * (rate / 100))
export const poTotal = (p: PurchaseOrder, rate: number) => poSubtotal(p) + p.shipping + poTax(p, rate)
export const poOpen = (p: PurchaseOrder) => ['Approved', 'In transit', 'Partially received'].includes(p.status)

export const seedPOs = (now: number, products: Product[], staff: string[]): PurchaseOrder[] => {
  const mk = (n: number, supplierId: string, locationId: string, expectedDays: number, status: POStatus, items: [string, number][], received: 'none' | 'part' | 'all' = 'none', by = staff[0] ?? 'Kevin Oloo'): PurchaseOrder => ({
    id: `PO-${1030 + n}`, supplierId, locationId, expected: now + expectedDays * DAY, status, shipping: 4500, notes: '', createdBy: by, createdAt: now - (8 - n) * DAY, approvedBy: ['Approved', 'In transit', 'Partially received', 'Received'].includes(status) ? 'Amara Mwangi' : undefined,
    lines: items.map(([productId, qty]) => { const p = products.find((x) => x.id === productId); return { productId, qty, cost: Math.round(((p?.price ?? 1000) * 0.58) / 10) * 10, received: received === 'all' ? qty : received === 'part' ? Math.floor(qty / 2) : 0, damaged: 0 } }),
    receivedAt: received === 'all' ? now - 2 * DAY : undefined,
  })
  return [
    mk(8, 'su1', 'l1', 1, 'In transit', [['p1', 30], ['p2', 20], ['p12', 12]]),
    mk(7, 'su3', 'l2', 2, 'In transit', [['p5', 24], ['p13', 30]]),
    mk(6, 'su2', 'l1', 4, 'Approved', [['p3', 40], ['p4', 30], ['p11', 16]]),
    mk(5, 'su4', 'l3', -2, 'Partially received', [['p7', 60], ['p14', 40]], 'part'),
    mk(4, 'su2', 'l1', -4, 'Received', [['p3', 50], ['p11', 20]], 'all', staff[1] ?? 'Sarah Wekesa'),
    mk(3, 'su1', 'l1', 3, 'Pending approval', [['p12', 40], ['p1', 25]], 'none', staff[2] ?? 'Dennis Kibet'),
    mk(2, 'su3', 'l1', 6, 'Draft', [['p5', 18]], 'none', staff[2] ?? 'Dennis Kibet'),
  ]
}

// ---- packing, returns, counts -------------------------------------------------------------------------------------------------

export interface PackState { picked: string[]; stage: 'pick' | 'packed'; startedAt: number; packedAt?: number }

export type Disposition = 'Restock · sellable' | 'Restock · clearance' | 'Write off · damaged' | 'Return to supplier'
export const DISPOSITIONS: Disposition[] = ['Restock · sellable', 'Restock · clearance', 'Write off · damaged', 'Return to supplier']
export interface WarehouseReturn { id: string; orderId: string; customer: string; productId: string; productName: string; qty: number; reason: string; condition: string; receivedAt: number; value: number }
export interface Decision { disposition: Disposition; locationId: string; notes: string; refund: string; by: string; at: number }

export const seedWarehouseReturns = (now: number, orders: Order[]): WarehouseReturn[] => {
  const done = orders.filter((o) => o.status === 'Delivered' && o.items.length)
  const pick = (i: number): WarehouseReturn | null => {
    const o = done[i * 3 + 1]
    const it = o?.items[0]
    return o && it ? { id: `RT-30${81 - i * 4}`, orderId: o.id, customer: o.customer, productId: it.productId, productName: it.name, qty: 1, reason: ['Arrived damaged', 'Wrong item', 'Changed mind'][i % 3]!, condition: ['Cracked', 'Sealed', 'Good'][i % 3]!, receivedAt: now - (i + 1) * 5 * HOUR, value: it.price } : null
  }
  return [0, 1, 2].map(pick).filter((x): x is WarehouseReturn => !!x)
}

export interface CountLine { productId: string; expected: number; c1?: number; c2?: number }
export interface CycleCount { id: string; locationId: string; zone: string; owner: string; startedAt: number; status: 'Counting' | 'Pending approval' | 'Reconciled'; lines: CountLine[]; approvedBy?: string }
/** What a line shows: matched when the counts agree with the system, recount when the first count is off and there is no second. */
export const countState = (l: CountLine): 'Not counted' | 'Matched' | 'Recount' | 'Variance' => {
  if (l.c1 === undefined) return 'Not counted'
  const final = l.c2 ?? l.c1
  if (final === l.expected) return 'Matched'
  return l.c2 === undefined ? 'Recount' : 'Variance'
}
export const countFinal = (l: CountLine) => l.c2 ?? l.c1

export interface AlertRules { when: 'Reorder point' | 'Below safety stock'; digest: string; leadDays: number; bufferPct: number }
export const ALERT_DEFAULTS: AlertRules = { when: 'Reorder point', digest: 'Daily at 8:00 AM', leadDays: 7, bufferPct: 15 }
