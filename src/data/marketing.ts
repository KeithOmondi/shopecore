import type { Order, Product } from './commerce'
import type { Customer } from './seed'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

// ---- audience segments -------------------------------------------------------------------------------------

export type RuleField = 'area' | 'spend' | 'orders' | 'lastOrder'
export interface Rule {
  field: RuleField
  op: string
  value: string
}
export interface Segment {
  id: string
  name: string
  purpose: 'Campaign audience' | 'Loyalty tier' | 'Internal analysis'
  match: 'all' | 'any'
  rules: Rule[]
  desc: string
  /** Built in, can’t be edited or deleted. */
  system?: boolean
}
export const RULE_FIELDS: Record<RuleField, { label: string; ops: string[] }> = {
  area: { label: 'Delivery area', ops: ['is', 'is not'] },
  spend: { label: 'Lifetime spend (KES)', ops: ['greater than', 'less than'] },
  orders: { label: 'Order count', ops: ['at least', 'at most'] },
  lastOrder: { label: 'Last order', ops: ['within last (days)', 'more than (days) ago', 'never'] },
}

export interface CustomerFacts {
  c: Customer
  lastOrderAt: number | null
}
export const factsOf = (customers: Customer[], orders: Order[]): CustomerFacts[] =>
  customers.map((c) => ({ c, lastOrderAt: orders.filter((o) => o.customerId === c.id).reduce<number | null>((n, o) => (n === null || o.placedAt > n ? o.placedAt : n), null) }))

export function ruleMatches(r: Rule, f: CustomerFacts, now: number): boolean {
  const n = Number(r.value)
  switch (r.field) {
    case 'area': { const eq = f.c.area.toLowerCase() === r.value.trim().toLowerCase(); return r.op === 'is' ? eq : !eq }
    case 'spend': return r.op === 'greater than' ? f.c.spent > n : f.c.spent < n
    case 'orders': return r.op === 'at least' ? f.c.orders >= n : f.c.orders <= n
    case 'lastOrder':
      if (r.op === 'never') return f.lastOrderAt === null
      if (f.lastOrderAt === null) return false
      return r.op.startsWith('within') ? now - f.lastOrderAt <= n * DAY : now - f.lastOrderAt > n * DAY
  }
}
export const inSegment = (s: Segment, f: CustomerFacts, now: number) =>
  s.rules.length === 0 ? true : s.match === 'all' ? s.rules.every((r) => ruleMatches(r, f, now)) : s.rules.some((r) => ruleMatches(r, f, now))

/** Opt-in flags are stable per customer so counts don’t jump around. Real consent comes from the backend. */
const hash = (id: string) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7)
export const optIn = (c: Customer) => ({ push: hash(c.id) % 10 < 7, email: hash(c.id) % 10 < 8, sms: hash(c.id + 's') % 10 < 9 })

export const seedSegments = (): Segment[] => [
  { id: 'sg-all', name: 'All customers', purpose: 'Campaign audience', match: 'all', rules: [], desc: 'Everyone with an account.', system: true },
  { id: 'sg-new', name: 'New customers', purpose: 'Campaign audience', match: 'all', rules: [{ field: 'orders', op: 'at most', value: '3' }], desc: 'Three orders or fewer.' },
  { id: 'sg-reg', name: 'High-value regulars', purpose: 'Campaign audience', match: 'all', rules: [{ field: 'spend', op: 'greater than', value: '20000' }, { field: 'lastOrder', op: 'within last (days)', value: '30' }], desc: 'Frequent customers with recent activity and higher spend.' },
  { id: 'sg-lapsed', name: 'Lapsed customers', purpose: 'Campaign audience', match: 'all', rules: [{ field: 'orders', op: 'at least', value: '4' }, { field: 'lastOrder', op: 'more than (days) ago', value: '14' }], desc: 'Used to order, quiet for two weeks.' },
]

// ---- coupons -------------------------------------------------------------------------------------------------------

export type CouponType = 'Percentage discount' | 'Fixed amount' | 'Free delivery'
export const COUPON_TYPES: CouponType[] = ['Percentage discount', 'Fixed amount', 'Free delivery']
export type CouponState = 'Draft' | 'Live' | 'Paused'
export type CouponStatus = 'Draft' | 'Scheduled' | 'Active' | 'Paused' | 'Exhausted' | 'Ended'
export interface Coupon {
  id: string
  name: string
  code: string
  type: CouponType
  value: number
  minSpend: number
  /** Cap on the discount for percentage coupons; 0 means no cap. */
  maxDiscount: number
  limit: number
  perCustomer: number
  start: number
  end: number
  state: CouponState
  categories: string[]
  customers: 'All customers' | 'New customers only' | 'Selected segment'
  segmentId?: string
  combine: boolean
  note: string
  redemptions: number
  discountGiven: number
  createdBy: string
}
export const couponStatus = (c: Coupon, now: number): CouponStatus =>
  c.state === 'Draft' ? 'Draft' : c.state === 'Paused' ? 'Paused' : c.redemptions >= c.limit ? 'Exhausted' : now < c.start ? 'Scheduled' : now > c.end ? 'Ended' : 'Active'

export interface Basket { subtotal: number; delivery: number; newCustomer: boolean; categories: string[] }
/** What a coupon would take off a basket, or why it can’t be used. */
export function applyCoupon(c: Coupon, b: Basket, now: number): { ok: true; discount: number } | { ok: false; reason: string } {
  const st = couponStatus(c, now)
  if (st !== 'Active') return { ok: false, reason: `This coupon is ${st.toLowerCase()}.` }
  if (b.subtotal < c.minSpend) return { ok: false, reason: `Spend at least KES ${c.minSpend.toLocaleString('en-US')} to use this coupon.` }
  if (c.customers === 'New customers only' && !b.newCustomer) return { ok: false, reason: 'This coupon is for new customers only.' }
  if (c.categories.length && !b.categories.some((x) => c.categories.includes(x))) return { ok: false, reason: `It only applies to ${c.categories.join(', ')}.` }
  if (c.type === 'Free delivery') return { ok: true, discount: b.delivery }
  if (c.type === 'Fixed amount') return { ok: true, discount: Math.min(c.value, b.subtotal) }
  const raw = Math.round((b.subtotal * c.value) / 100)
  return { ok: true, discount: c.maxDiscount > 0 ? Math.min(raw, c.maxDiscount) : raw }
}

export const seedCoupons = (now: number): Coupon[] => {
  const c = (id: string, name: string, code: string, type: CouponType, value: number, minSpend: number, limit: number, redemptions: number, startDays: number, endDays: number, extra: Partial<Coupon> = {}): Coupon => ({
    id, name, code, type, value, minSpend, maxDiscount: 0, limit, perCustomer: 1, start: now + startDays * DAY, end: now + endDays * DAY, state: 'Live', categories: [], customers: 'All customers', combine: false, note: '', redemptions,
    discountGiven: type === 'Free delivery' ? redemptions * 220 : type === 'Fixed amount' ? redemptions * value : Math.round(redemptions * (minSpend * 1.8 * value) / 100), createdBy: 'Ruth Njoki', ...extra,
  })
  return [
    c('cp1', 'Fresh start offer', 'FRESH10', 'Percentage discount', 10, 1000, 5000, 3482, -20, 9),
    c('cp2', 'Nairobi 500 off', 'NAIROBI500', 'Fixed amount', 500, 2500, 2000, 1122, -12, 6),
    c('cp3', 'Welcome offer', 'WELCOME15', 'Percentage discount', 15, 1000, 3000, 2486, -30, 2, { maxDiscount: 750, customers: 'New customers only' }),
    c('cp4', 'Bundle week', 'BUNDLE20', 'Percentage discount', 20, 2000, 1000, 0, 5, 12, { categories: ['Bags', 'Accessories'] }),
    c('cp5', 'Free delivery weekend', 'FREESHIP', 'Free delivery', 0, 1500, 5000, 5000, -40, -3),
    c('cp6', 'Payday treat', 'PAYDAY200', 'Fixed amount', 200, 1200, 4000, 640, -6, 14, { state: 'Paused' }),
  ]
}

// ---- flash sales and bundles --------------------------------------------------------------------------------------------------

export interface FlashSale {
  id: string
  name: string
  start: number
  end: number
  kind: 'percent' | 'fixed'
  value: number
  productIds: string[]
  placement: string
  /** Products at or below this stock are left out of the sale. */
  guard: number
  state: 'Draft' | 'Live'
  salesToday: number
}
export type SaleStatus = 'Draft' | 'Scheduled' | 'Live' | 'Ended'
export const saleStatus = (s: FlashSale, now: number): SaleStatus => (s.state === 'Draft' ? 'Draft' : now < s.start ? 'Scheduled' : now > s.end ? 'Ended' : 'Live')
export const salePrice = (s: FlashSale, p: Product) => Math.max(1, s.kind === 'percent' ? Math.round(p.price * (1 - s.value / 100)) : p.price - s.value)
export const saleBadge = (s: FlashSale) => (s.kind === 'percent' ? `${s.value}% off` : `KES ${s.value.toLocaleString('en-US')} off`)
export const PLACEMENTS = ['Home carousel', 'Category pages', 'Product pages only']

export const seedFlash = (now: number, products: Product[]): FlashSale[] => {
  const ids = products.filter((p) => p.status === 'Active').map((p) => p.id)
  return [
    { id: 'fs1', name: 'Weekend Style Finds', start: now - 2 * HOUR, end: now + 5 * HOUR, kind: 'percent', value: 20, productIds: ids.slice(0, 5), placement: 'Home carousel', guard: 10, state: 'Live', salesToday: 482_000 },
    { id: 'fs2', name: 'Footwear Stock-up', start: now + 2 * HOUR + 14 * MIN, end: now + 8 * HOUR, kind: 'percent', value: 15, productIds: ids.slice(5, 8), placement: 'Category pages', guard: 10, state: 'Live', salesToday: 0 },
    { id: 'fs3', name: 'Payday Home Essentials', start: now + 3 * DAY, end: now + 5 * DAY, kind: 'fixed', value: 300, productIds: ids.slice(8, 11), placement: 'Home carousel', guard: 5, state: 'Live', salesToday: 0 },
  ]
}

export interface Bundle {
  id: string
  name: string
  kind: 'Bundle' | 'Multi-buy' | 'Cross-sell'
  desc: string
  items: { productId: string; qty: number }[]
  /** Fixed price for a Bundle or Cross-sell. */
  price: number
  /** Multi-buy: percent off when the customer takes at least `minItems`. */
  percent: number
  minItems: number
  state: 'Draft' | 'Live'
  start: number
  unitsSold: number
  conversion: number
}
export const bundleStandalone = (b: Bundle, products: Product[]) => b.items.reduce((n, i) => n + (products.find((p) => p.id === i.productId)?.price ?? 0) * i.qty, 0)
export const bundleStatus = (b: Bundle, now: number) => (b.state === 'Draft' ? 'Draft' : now < b.start ? 'Scheduled' : 'Live')

export const seedBundles = (now: number, products: Product[]): Bundle[] => {
  const ids = products.filter((p) => p.status === 'Active').map((p) => p.id)
  const price = (list: string[], pct: number) => Math.round(list.reduce((n, id) => n + (products.find((p) => p.id === id)?.price ?? 0), 0) * (1 - pct) / 10) * 10
  const a = [ids[0]!, ids[6]!], c = [ids[2]!, ids[3]!, ids[7]!]
  return [
    { id: 'bd1', name: 'Weekender set', kind: 'Bundle', desc: 'A weekender bag with a minimal wallet at one price.', items: a.map((productId) => ({ productId, qty: 1 })), price: price(a, 0.12), percent: 0, minItems: 0, state: 'Live', start: now - 20 * DAY, unitsSold: 428, conversion: 6.2 },
    { id: 'bd2', name: 'Mix and match clothing', kind: 'Multi-buy', desc: 'Buy any 3 clothing items and save 15%.', items: [], price: 0, percent: 15, minItems: 3, state: 'Live', start: now - 15 * DAY, unitsSold: 306, conversion: 4.8 },
    { id: 'bd3', name: 'Smart casual kit', kind: 'Cross-sell', desc: 'A shirt, chinos and sunglasses for new customers.', items: c.map((productId) => ({ productId, qty: 1 })), price: price(c, 0.16), percent: 0, minItems: 0, state: 'Live', start: now + 4 * DAY, unitsSold: 0, conversion: 0 },
  ]
}

// ---- banners and the homepage ---------------------------------------------------------------------------------------------------

export interface Banner {
  id: string
  title: string
  label: string
  link: string
  platform: 'Web and mobile' | 'Mobile only' | 'Web only'
  start: number
  end: number
  tone: number
  alt: string
  published: boolean
}
export const BANNER_TONES = ['linear-gradient(130deg,#BFDBFE,#93C5FD)', 'linear-gradient(130deg,#FDE68A,#FCA5A5)', 'linear-gradient(130deg,#BBF7D0,#86EFAC)', 'linear-gradient(130deg,#DDD6FE,#A5B4FC)']
/** Where a banner may point. Anything else is a broken link. */
export const knownLinks = (categories: string[]) => ['/', '/collections/new', '/collections/sale', '/loyalty', '/referral', ...categories.map((c) => `/categories/${c.toLowerCase()}`)]
export const linkOk = (b: Banner, links: string[]) => links.includes(b.link.trim())

export const seedBanners = (now: number): Banner[] => [
  { id: 'bn1', title: 'New arrivals this week', label: 'New arrivals', link: '/collections/new', platform: 'Web and mobile', start: now - 4 * DAY, end: now + 20 * DAY, tone: 0, alt: 'Models wearing this week’s new arrivals', published: true },
  { id: 'bn2', title: 'Refresh your home', label: 'Home refresh', link: '/categories/home', platform: 'Web and mobile', start: now - 8 * DAY, end: now + 12 * DAY, tone: 1, alt: 'A living room with woven throws and ceramics', published: true },
  { id: 'bn3', title: 'Join ShopCore Rewards', label: 'Member perks', link: '/loyalty', platform: 'Mobile only', start: now - 12 * DAY, end: now + 40 * DAY, tone: 2, alt: 'ShopCore Rewards member card', published: true },
  { id: 'bn4', title: 'Summer sale preview', label: 'Summer sale', link: '/collections/summer', platform: 'Web and mobile', start: now + 6 * DAY, end: now + 30 * DAY, tone: 3, alt: '', published: false },
]

export interface HomeSection { id: string; name: string; sub: string; enabled: boolean; count: number }
export const seedSections = (): HomeSection[] => [
  { id: 'hs1', name: 'Hero banners', sub: 'Carousel', enabled: true, count: 4 },
  { id: 'hs2', name: 'Shop by category', sub: 'Category tiles', enabled: true, count: 8 },
  { id: 'hs3', name: 'Featured this week', sub: 'Product grid', enabled: true, count: 8 },
  { id: 'hs4', name: 'New arrivals', sub: 'Product carousel', enabled: true, count: 12 },
  { id: 'hs5', name: 'Member benefits', sub: 'Loyalty callout', enabled: false, count: 1 },
]

// ---- push and message campaigns ------------------------------------------------------------------------------------------------------

export interface Push {
  id: string
  title: string
  body: string
  segmentId: string
  deepLink: string
  at: number | null
  quiet: boolean
  cap: boolean
  status: 'Draft' | 'Scheduled' | 'Sent'
  stats?: { sent: number; opened: number; converted: number }
}
export interface Message {
  id: string
  name: string
  channel: 'Email' | 'SMS'
  segmentId: string
  subject: string
  body: string
  at: number | null
  status: 'Draft' | 'Scheduled' | 'Sent'
  stats?: { sent: number; delivered: number; clicks: number }
}
/** An SMS up to 160 characters is one part; longer messages are split and billed per part. */
export const smsParts = (s: string) => (s.length <= 160 ? 1 : Math.ceil(s.length / 153))

export const seedPushes = (now: number): Push[] => [
  { id: 'pu1', title: 'New arrivals just landed', body: 'Fresh styles picked for you. Shop today and get delivery in as little as 45 minutes.', segmentId: 'sg-all', deepLink: 'shopcore://collection/new', at: now - 6 * DAY, quiet: true, cap: true, status: 'Sent', stats: { sent: 1840, opened: 526, converted: 76 } },
  { id: 'pu2', title: 'Your cart is waiting', body: 'The items you saved are still available. Check out before they sell out.', segmentId: 'sg-reg', deepLink: 'shopcore://cart', at: now - 3 * DAY, quiet: true, cap: true, status: 'Sent', stats: { sent: 420, opened: 134, converted: 31 } },
]
export const seedMessages = (now: number): Message[] => [
  { id: 'ms1', name: 'March member update', channel: 'Email', segmentId: 'sg-reg', subject: 'What’s new for members', body: 'Here’s what’s new at ShopCore this month.', at: now - 9 * DAY, status: 'Sent', stats: { sent: 482, delivered: 206, clicks: 61 } },
  { id: 'ms2', name: 'Welcome to ShopCore', channel: 'SMS', segmentId: 'sg-new', subject: '', body: 'Welcome to ShopCore! Use WELCOME15 for 15% off your first order.', at: now - 7 * DAY, status: 'Sent', stats: { sent: 120, delivered: 118, clicks: 18 } },
  { id: 'ms3', name: 'Basket reminder', channel: 'SMS', segmentId: 'sg-lapsed', subject: '', body: 'We miss you! Come back and use FRESH10 for 10% off.', at: null, status: 'Draft' },
]

// ---- loyalty, referrals, highlights, content ----------------------------------------------------------------------------------------------

export interface Loyalty {
  earnRate: number
  pointValue: number
  minOrder: number
  expiry: string
  awardOnFees: boolean
  excludeRefunded: boolean
  minRedeem: number
  maxRedeemPct: number
  step: number
  stackCoupons: boolean
  bonuses: { id: string; name: string; sub: string; on: boolean }[]
  active: boolean
}
export const LOYALTY_DEFAULTS: Loyalty = {
  earnRate: 1, pointValue: 1, minOrder: 500, expiry: '12 months of inactivity', awardOnFees: true, excludeRefunded: true, minRedeem: 100, maxRedeemPct: 30, step: 100, stackCoupons: true, active: true,
  bonuses: [{ id: 'lb1', name: 'Double points Tuesdays', sub: 'All categories', on: true }, { id: 'lb2', name: 'First order bonus', sub: '500 points for new customers', on: true }],
}
export const pointsFor = (l: Loyalty, subtotal: number, fee: number) => (subtotal + (l.awardOnFees ? fee : 0) < l.minOrder ? 0 : Math.floor(((subtotal + (l.awardOnFees ? fee : 0)) / 100) * l.earnRate))

export interface Referral {
  active: boolean
  advocate: string
  friend: string
  minSpend: number
  limit: number
  window: string
  expiry: string
  selfExclude: boolean
  fraudReview: boolean
  message: string
}
export const REFERRAL_DEFAULTS: Referral = {
  active: true, advocate: 'KES 300 ShopCore credit', friend: '15% off first order', minSpend: 1500, limit: 20, window: 'After the first order is delivered', expiry: '30 days', selfExclude: true, fraudReview: true,
  message: 'Give a friend 15% off their first ShopCore order. You’ll get KES 300 in credit after their order is delivered.',
}

export interface Highlight { reviewId: string; placement: string; published: boolean }
export const PLACEMENT_OPTIONS = ['Home · Featured', 'Category page', 'App · New']

export interface ContentPage { id: string; title: string; slug: string; audience: string; status: 'Published' | 'Draft'; body: string; seoTitle: string; seoDesc: string; updatedAt: number }
export const seedPages = (now: number): ContentPage[] => [
  { id: 'pg1', title: 'About ShopCore', slug: '/about', audience: 'Website and mobile app', status: 'Published', body: 'ShopCore brings Nairobi’s best fashion and home labels to your door, fast.\n\nWe work with partner stores and deliver with our own riders.', seoTitle: 'About ShopCore | Fast delivery in Nairobi', seoDesc: 'Meet ShopCore, the delivery-first shop for fashion and home in Nairobi.', updatedAt: now - 22 * DAY },
  { id: 'pg2', title: 'Terms of service', slug: '/terms', audience: 'Website and mobile app', status: 'Published', body: 'These terms explain how ShopCore provides online shopping and delivery services. By placing an order, you agree to the conditions described here.\n\nOrders and payment\nPrices are displayed in Kenyan shillings. Orders are confirmed once payment or cash-on-delivery details are accepted.', seoTitle: 'Terms of service | ShopCore', seoDesc: 'The terms that apply when you order from ShopCore.', updatedAt: now - 90 * DAY },
  { id: 'pg3', title: 'Privacy policy', slug: '/privacy', audience: 'Website and mobile app', status: 'Published', body: 'We collect only what we need to deliver your order and improve ShopCore.\n\nYour data\nYou can ask us to export or delete your data at any time.', seoTitle: '', seoDesc: '', updatedAt: now - 90 * DAY },
  { id: 'pg4', title: 'Delivery and returns', slug: '/delivery-returns', audience: 'Website and mobile app', status: 'Published', body: 'We deliver every day from 7:00 AM to 10:00 PM.\n\nReturns\nReport a problem in the app within 48 hours of delivery.', seoTitle: 'Delivery and returns | ShopCore', seoDesc: 'How delivery and returns work at ShopCore.', updatedAt: now - 70 * DAY },
]

export interface CategoryContent { heading: string; intro: string; cta: string; collection: string; seoTitle: string; seoDesc: string; canonical: string; published: boolean }
export const seedCategoryContent = (categories: string[]): Record<string, CategoryContent> =>
  Object.fromEntries(categories.map((c, i) => [c, {
    heading: i === 0 ? 'Bags built for every day' : `${c}, made to last`, intro: i === 0 ? 'From weekenders to totes, find a bag that goes wherever you do. Delivered across Nairobi.' : '', cta: `Shop ${c.toLowerCase()}`, collection: 'Featured',
    seoTitle: i === 0 ? 'Bags in Nairobi | ShopCore' : '', seoDesc: i === 0 ? 'Shop weekenders, totes and backpacks delivered fresh to your door in Nairobi with ShopCore.' : '', canonical: `https://shopcore.co.ke/categories/${c.toLowerCase()}`, published: i < 2,
  }]))

// ---- campaigns (performance) -----------------------------------------------------------------------------------------------------------

export interface Campaign {
  id: string
  name: string
  type: 'Coupon' | 'Push' | 'Bundle' | 'Banner' | 'Flash sale'
  channels: { name: string; reach: number; clicks: number; conversions: number; sales: number }[]
  spend: number
  start: number
  end: number
  offer: string
  audience: string
  status: 'Active' | 'Scheduled' | 'Ended'
}
const ch = (name: string, reach: number, clicks: number, conversions: number, sales: number) => ({ name, reach, clicks, conversions, sales })
export const seedCampaigns = (now: number): Campaign[] => [
  { id: 'ca1', name: 'New arrivals launch', type: 'Push', channels: [ch('Push notification', 18_420, 3812, 764, 1_820_000), ch('Email', 9600, 1288, 382, 940_000), ch('In-app banner', 24_800, 2014, 426, 1_080_000)], spend: 800_000, start: now - 30 * DAY, end: now - DAY, offer: '10% off selected arrivals', audience: 'All customers', status: 'Ended' },
  { id: 'ca2', name: 'Weekender weekend', type: 'Coupon', channels: [ch('Coupon FRESH10', 12_300, 2480, 612, 1_420_000), ch('Push notification', 8200, 1500, 288, 660_000)], spend: 420_000, start: now - 18 * DAY, end: now + 9 * DAY, offer: 'FRESH10 · 10% off over KES 1,000', audience: 'High-value regulars', status: 'Active' },
  { id: 'ca3', name: 'New Nairobi customers', type: 'Push', channels: [ch('Push notification', 4200, 1090, 310, 720_000), ch('SMS', 2186, 560, 142, 340_000)], spend: 160_000, start: now - 25 * DAY, end: now + 2 * DAY, offer: 'WELCOME15 · 15% off first order', audience: 'New customers', status: 'Active' },
  { id: 'ca4', name: 'Smart casual kit', type: 'Bundle', channels: [ch('In-app banner', 10_400, 920, 188, 560_000), ch('Email', 3800, 410, 96, 240_000)], spend: 90_000, start: now + 4 * DAY, end: now + 30 * DAY, offer: 'Bundle at 16% under standalone', audience: 'All customers', status: 'Scheduled' },
  { id: 'ca5', name: 'Home refresh', type: 'Banner', channels: [ch('In-app banner', 14_100, 1210, 255, 610_000)], spend: 70_000, start: now - 40 * DAY, end: now - 12 * DAY, offer: 'Home category banner', audience: 'All customers', status: 'Ended' },
]
export const campaignTotals = (c: Campaign) => ({
  sales: c.channels.reduce((n, x) => n + x.sales, 0), reach: c.channels.reduce((n, x) => n + x.reach, 0), clicks: c.channels.reduce((n, x) => n + x.clicks, 0), conversions: c.channels.reduce((n, x) => n + x.conversions, 0),
})
/** A believable daily curve for a campaign, stable per campaign. */
export const campaignSeries = (c: Campaign, now: number) => {
  const t = campaignTotals(c)
  const days = Math.max(2, Math.min(30, Math.round((Math.min(c.end, now) - c.start) / DAY)))
  const weights = Array.from({ length: days }, (_, i) => 0.6 + Math.abs(Math.sin((i + hash(c.id) % 7) * 0.9)) + i / days)
  const sum = weights.reduce((n, w) => n + w, 0)
  return weights.map((w) => Math.round((t.sales * w) / sum))
}

export interface MarketingData {
  segments: Segment[]
  coupons: Coupon[]
  flash: FlashSale[]
  bundles: Bundle[]
  banners: Banner[]
  sections: HomeSection[]
  pushes: Push[]
  messages: Message[]
  campaigns: Campaign[]
  pages: ContentPage[]
}
export const seedMarketing = (now: number, products: Product[]): MarketingData => ({
  segments: seedSegments(), coupons: seedCoupons(now), flash: seedFlash(now, products), bundles: seedBundles(now, products), banners: seedBanners(now), sections: seedSections(),
  pushes: seedPushes(now), messages: seedMessages(now), campaigns: seedCampaigns(now), pages: seedPages(now),
})
