import { posOf, STORES, type Pt } from './geo'
import { seedCustomers, whenLabel } from './seed'

const DAY = 86_400_000
const MIN = 60_000

/** Small deterministic generator so the demo data is the same on every load. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

// ---- products -------------------------------------------------------------------------------

export const CATEGORIES = ['Bags', 'Clothing', 'Footwear', 'Accessories', 'Home'] as const
export type Category = string
export type ProductStatus = 'Active' | 'Draft' | 'Archived'

export interface Product {
  id: string
  name: string
  sku: string
  category: Category
  price: number
  stock: number
  reorderAt: number
  status: ProductStatus
  description: string
  createdAt: number
}

const P = (id: number, name: string, category: Category, price: number, stock: number, status: ProductStatus = 'Active'): Product => ({
  id: `p${id}`,
  name,
  sku: `SC-${category.slice(0, 3).toUpperCase()}-${String(100 + id)}`,
  category,
  price,
  stock,
  reorderAt: 10,
  status,
  description: `${name}. Quality materials, made to last, delivered across Nairobi.`,
  createdAt: Date.now() - (id * 11 + 20) * DAY,
})

export const seedProducts = (): Product[] => [
  P(1, 'Canvas Weekender Bag', 'Bags', 4500, 46),
  P(2, 'Everyday Leather Tote', 'Bags', 4850, 8),
  P(3, 'Linen Weekend Shirt', 'Clothing', 3200, 64),
  P(4, 'Classic Chino Trousers', 'Clothing', 3600, 31),
  P(5, 'Trail Running Shoes', 'Footwear', 6900, 5),
  P(6, 'Leather Slides', 'Footwear', 2400, 52),
  P(7, 'Minimal Wallet', 'Accessories', 1800, 120),
  P(8, 'Polarised Sunglasses', 'Accessories', 2900, 27),
  P(9, 'Ceramic Mug Set', 'Home', 2200, 0),
  P(10, 'Woven Throw Blanket', 'Home', 3800, 19),
  P(11, 'Packable Rain Jacket', 'Clothing', 5200, 14),
  P(12, 'Travel Backpack 30L', 'Bags', 7400, 23),
  P(13, 'Canvas Sneakers', 'Footwear', 3500, 38),
  P(14, 'Silk Scarf', 'Accessories', 1500, 3),
  P(15, 'Scented Candle Trio', 'Home', 2100, 44, 'Draft'),
  P(16, 'Denim Overshirt', 'Clothing', 4300, 11, 'Archived'),
]

// ---- riders -------------------------------------------------------------------------------------

export type RiderStatus = 'Online' | 'Offline' | 'Suspended' | 'Pending' | 'Rejected'
export type DocState = 'Valid' | 'Expiring' | 'Expired' | 'Pending' | 'Rejected'

export interface RiderDoc {
  key: string
  title: string
  state: DocState
  note: string
}

export interface Rider {
  id: string
  name: string
  phone: string
  vehicle: 'Motorbike' | 'Bicycle' | 'Car'
  plate: string
  zone: string
  status: RiderStatus
  rating: number
  deliveries: number
  earnings: number
  cashHeld: number
  joined: string
  docs: RiderDoc[]
  appliedAt?: number
  reviewNote?: string
  /** Where the rider is on the dispatch map. */
  at: Pt
}

const docs = (state: DocState = 'Valid', insurance: DocState = 'Valid'): RiderDoc[] => [
  { key: 'id', title: 'National ID', state, note: 'Front and back photos' },
  { key: 'license', title: 'Driving license', state, note: 'Valid for the vehicle class' },
  { key: 'insurance', title: 'Vehicle insurance', state: insurance, note: 'Policy certificate' },
  { key: 'photo', title: 'Vehicle photo', state, note: 'Clear photo with plate visible' },
  { key: 'selfie', title: 'Selfie check', state, note: 'Matches the ID photo' },
]

const RIDER_NAMES: [string, string, string, string][] = [
  ['James Mutua', 'Motorbike', 'Westlands', 'KDA 284G'], ['Grace Wambui', 'Motorbike', 'Kilimani', 'KMC 190B'], ['David Kariuki', 'Motorbike', 'Parklands', 'KMF 771K'],
  ['Faith Njeri', 'Motorbike', 'Lavington', 'KMD 305L'], ['Brian Otieno', 'Bicycle', 'CBD', '—'], ['Miriam Kilonzo', 'Motorbike', 'Karen', 'KMG 618C'],
  ['Vincent Ouma', 'Motorbike', 'Westlands', 'KME 224D'], ['Collins Mutua', 'Car', 'Kilimani', 'KDA 903M'], ['Elijah Maina', 'Motorbike', 'South B', 'KMH 456P'],
  ['Felix Wekesa', 'Motorbike', 'Eastleigh', 'KMJ 872R'], ['George Kariuki', 'Motorbike', 'Lavington', 'KMD 119T'], ['Isaac Barasa', 'Bicycle', 'CBD', '—'],
  ['Kevin Achieng', 'Motorbike', 'Parklands', 'KMF 340V'], ['Moses Langat', 'Motorbike', 'Karen', 'KMC 587W'], ['Nelson Wafula', 'Motorbike', 'Westlands', 'KMG 702Y'],
  ['Oscar Mugo', 'Motorbike', 'Kilimani', 'KME 913Z'], ['Patrick Kimani', 'Motorbike', 'Eastleigh', 'KMH 128A'], ['Ronald Cheruiyot', 'Car', 'Lavington', 'KDB 461N'],
  ['Stephen Muriuki', 'Motorbike', 'South B', 'KMJ 653B'], ['Titus Omondi', 'Motorbike', 'CBD', 'KMD 874C'], ['Victor Nyaga', 'Motorbike', 'Westlands', 'KMF 215D'],
  ['Walter Kibe', 'Motorbike', 'Parklands', 'KMC 396E'], ['Yusuf Salim', 'Motorbike', 'Kilimani', 'KMG 547F'], ['Zachary Rono', 'Motorbike', 'Karen', 'KME 688G'],
]

export const seedRiders = (): Rider[] => {
  const r = rng(7)
  const list: Rider[] = RIDER_NAMES.map(([name, vehicle, zone, plate], i) => {
    const status: RiderStatus = i === 4 ? 'Suspended' : [3, 8, 11, 14, 17, 20].includes(i) ? 'Offline' : 'Online'
    const base = posOf(zone)
    return {
      id: `r${i + 1}`,
      name,
      phone: `+254 7${10 + ((i * 13) % 40)} ${200 + ((i * 71) % 700)} ${100 + ((i * 37) % 900)}`,
      vehicle: vehicle as Rider['vehicle'],
      plate,
      zone,
      status,
      rating: Math.round((4.4 + r() * 0.6) * 10) / 10,
      deliveries: 80 + Math.floor(r() * 1200),
      earnings: 12000 + Math.floor(r() * 38000),
      cashHeld: i % 4 === 1 ? 1500 + Math.floor(r() * 3000) : 0,
      joined: ['Mar 2024', 'Jun 2024', 'Sep 2024', 'Jan 2025', 'Apr 2025'][i % 5]!,
      docs: docs('Valid', i === 3 ? 'Expiring' : i === 9 ? 'Expired' : 'Valid'),
      at: { lat: Math.max(2, Math.min(73, base.lat + (r() - 0.5) * 14)), lng: Math.max(2, Math.min(98, base.lng + (r() - 0.5) * 14)) },
    }
  })
  const pending: [string, string, string, string][] = [
    ['Allan Odhiambo', 'Motorbike', 'Eastleigh', 'KMK 201H'], ['Bernard Kosgei', 'Bicycle', 'CBD', '—'], ['Cyrus Wambugu', 'Motorbike', 'Lavington', 'KMK 318J'], ['Daniel Mbithi', 'Car', 'Karen', 'KDC 772P'],
  ]
  pending.forEach(([name, vehicle, zone, plate], i) =>
    list.push({
      id: `r${100 + i}`, name, phone: `+254 7${20 + i} 555 ${300 + i * 11}`, vehicle: vehicle as Rider['vehicle'], plate, zone, status: 'Pending', rating: 0, deliveries: 0, earnings: 0, cashHeld: 0,
      joined: 'Pending', docs: docs('Pending'), appliedAt: Date.now() - (i * 7 + 2) * 3_600_000, at: posOf(zone),
    }),
  )
  return list
}

// ---- orders ----------------------------------------------------------------------------------------

export type OrderStatus = 'Pending' | 'Processing' | 'Out for delivery' | 'Delivered' | 'Cancelled' | 'Refunded'
export type PayMethod = 'M-Pesa' | 'Card' | 'Cash on delivery'
export type PayState = 'Paid' | 'Pending' | 'Failed' | 'Refunded'

export const ORDER_FLOW: OrderStatus[] = ['Pending', 'Processing', 'Out for delivery', 'Delivered']

export interface OrderItem {
  productId: string
  name: string
  qty: number
  price: number
}

export interface OrderEvent {
  status: OrderStatus | 'Note'
  at: number
  by: string
  note?: string
}

export interface Order {
  id: string
  customerId: string
  customer: string
  items: OrderItem[]
  subtotal: number
  fee: number
  total: number
  status: OrderStatus
  method: PayMethod
  pay: PayState
  riderId: string | null
  area: string
  address: string
  placedAt: number
  events: OrderEvent[]
  refunded: number
  /** Store the order is collected from. */
  pickup: string
  /** Set when dispatch needs to look at it. */
  alert?: { reason: string; lateMin: number; level: 'Delayed' | 'Stuck' | 'At risk' }
}

export const seedOrders = (): Order[] => {
  const r = rng(11)
  const customers = seedCustomers()
  const products = seedProducts().filter((p) => p.status === 'Active')
  const riders = seedRiders().filter((x) => x.status === 'Online')
  const now = Date.now()
  const orders: Order[] = []
  for (let i = 0; i < 52; i++) {
    const c = customers[i % customers.length]!
    const count = 1 + Math.floor(r() * 3)
    const items: OrderItem[] = Array.from({ length: count }, () => {
      const p = products[Math.floor(r() * products.length)]!
      return { productId: p.id, name: p.name, qty: 1 + Math.floor(r() * 2), price: p.price }
    }).filter((it, idx, all) => all.findIndex((x) => x.productId === it.productId) === idx)
    const subtotal = items.reduce((n, it) => n + it.price * it.qty, 0)
    const fee = subtotal >= 1500 ? 180 + Math.floor(r() * 3) * 35 : 250
    const method: PayMethod = r() < 0.7 ? 'M-Pesa' : r() < 0.6 ? 'Card' : 'Cash on delivery'

    let status: OrderStatus
    let placedAt: number
    let riderId: string | null = null
    if (i < 14) {
      // waiting for a rider
      status = 'Pending'
      placedAt = now - (9 + i * 3 + Math.floor(r() * 3)) * MIN
    } else if (i < 20) {
      status = 'Out for delivery'
      placedAt = now - (25 + (i - 14) * 11) * MIN
      riderId = riders[(i - 14) % riders.length]!.id
    } else if (i < 24) {
      status = 'Processing'
      placedAt = now - (12 + (i - 20) * 6) * MIN
      riderId = riders[(i - 20 + 2) % riders.length]!.id
    } else {
      const age = Math.floor(((i - 24) / 28) * 30 * DAY * (0.9 + r() * 0.1)) + 3 * 3_600_000
      placedAt = now - age
      const roll = r()
      status = roll < 0.78 ? 'Delivered' : roll < 0.88 ? 'Cancelled' : roll < 0.95 ? 'Refunded' : 'Delivered'
      if (status !== 'Cancelled') riderId = riders[Math.floor(r() * riders.length)]!.id
    }
    const total = subtotal + fee
    const pay: PayState =
      status === 'Refunded' ? 'Refunded' : status === 'Cancelled' ? (method === 'Cash on delivery' ? 'Pending' : 'Refunded') : status === 'Pending' ? (method === 'Cash on delivery' ? 'Pending' : 'Paid') : method === 'Cash on delivery' && status !== 'Delivered' ? 'Pending' : 'Paid'
    const events: OrderEvent[] = [{ status: 'Pending', at: placedAt, by: c.name }]
    const flow: OrderStatus[] = ['Processing', 'Out for delivery', 'Delivered']
    const reached = status === 'Pending' ? 0 : status === 'Processing' ? 1 : status === 'Out for delivery' ? 2 : status === 'Delivered' || status === 'Refunded' ? 3 : 1
    flow.slice(0, reached).forEach((st, k) => events.push({ status: st, at: placedAt + (k + 1) * 8 * MIN, by: k === 0 ? 'Dispatch' : 'Rider' }))
    if (status === 'Cancelled') events.push({ status: 'Cancelled', at: placedAt + 20 * MIN, by: 'Customer support', note: 'Customer asked to cancel' })
    if (status === 'Refunded') events.push({ status: 'Refunded', at: placedAt + 3 * DAY, by: 'Customer support', note: 'Item arrived damaged' })
    const order: Order = {
      id: `SC-${4928 - i}`, customerId: c.id, customer: c.name, items, subtotal, fee, total, status, method, pay, riderId, area: c.area, address: `${c.street}, ${c.area}`,
      placedAt, events, refunded: pay === 'Refunded' ? total : 0, pickup: `${STORES[i % STORES.length]}, ${['Westlands', 'Parklands', 'CBD', 'Kilimani', 'Upper Hill'][i % 5]}`,
    }
    if (i === 15) order.alert = { reason: 'Pickup wait · 22 min', lateMin: 18, level: 'Delayed' }
    if (i === 16) order.alert = { reason: 'No movement · 15 min', lateMin: 11, level: 'Stuck' }
    if (i === 20) order.alert = { reason: 'Customer unreachable', lateMin: 8, level: 'At risk' }
    if (i === 18) order.alert = { reason: 'Pickup wait · 19 min', lateMin: 24, level: 'Delayed' }
    orders.push(order)
  }
  return orders.sort((a, b) => b.placedAt - a.placedAt)
}

// ---- payments ------------------------------------------------------------------------------------------

export interface Transaction {
  id: string
  orderId: string
  customer: string
  method: PayMethod
  amount: number
  status: 'Success' | 'Failed' | 'Refunded' | 'Pending'
  ref: string
  at: number
}

const ref = (seed: number) => {
  const a = rng(seed)
  return Array.from({ length: 10 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(a() * 32)]).join('')
}

export const transactionsFrom = (orders: Order[]): Transaction[] =>
  orders
    .filter((o) => o.method !== 'Cash on delivery' || o.pay === 'Paid')
    .map((o, i) => ({
      id: `TX-${String(9000 + orders.length - i)}`,
      orderId: o.id,
      customer: o.customer,
      method: o.method,
      amount: o.total,
      status: o.pay === 'Paid' ? ('Success' as const) : o.pay === 'Refunded' ? ('Refunded' as const) : o.pay === 'Failed' ? ('Failed' as const) : ('Pending' as const),
      ref: ref(i + 3),
      at: o.placedAt + 2 * MIN,
    }))

export interface Payout {
  id: string
  riderId: string
  rider: string
  amount: number
  method: 'M-Pesa'
  status: 'Pending' | 'Paid' | 'Failed'
  requestedAt: number
  paidAt?: number
}

export const seedPayouts = (riders: Rider[]): Payout[] => {
  const r = rng(21)
  return riders
    .filter((x) => x.status === 'Online' || x.status === 'Offline')
    .slice(0, 14)
    .map((x, i) => ({
      id: `PO-${5100 + i}`,
      riderId: x.id,
      rider: x.name,
      amount: 1200 + Math.floor(r() * 7000),
      method: 'M-Pesa' as const,
      status: i < 5 ? ('Pending' as const) : i === 7 ? ('Failed' as const) : ('Paid' as const),
      requestedAt: Date.now() - (i * 9 + 2) * 3_600_000,
      paidAt: i >= 5 && i !== 7 ? Date.now() - (i * 9) * 3_600_000 : undefined,
    }))
}

export interface CashDeposit {
  id: string
  riderId: string
  rider: string
  owed: number
  due: string
  status: 'Due' | 'Received'
}

export const seedDeposits = (riders: Rider[]): CashDeposit[] =>
  riders
    .filter((x) => x.cashHeld > 0)
    .map((x, i) => ({ id: `CD-${700 + i}`, riderId: x.id, rider: x.name, owed: x.cashHeld, due: 'Today, 8:00 PM', status: 'Due' as const }))

export { whenLabel }
