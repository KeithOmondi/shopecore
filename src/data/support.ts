import type { Order, Rider } from './commerce'
import type { Customer, Staff } from './seed'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

// ---- tickets ---------------------------------------------------------------------------------------

export type TicketStatus = 'Open' | 'Pending' | 'Escalated' | 'Resolved'
export type Priority = 'Urgent' | 'High' | 'Normal' | 'Low'
export const PRIORITIES: Priority[] = ['Urgent', 'High', 'Normal', 'Low']
export const TICKET_STATUSES: TicketStatus[] = ['Open', 'Pending', 'Escalated', 'Resolved']

/** First-response target in minutes, by priority. */
export const SLA_MIN: Record<Priority, number> = { Urgent: 15, High: 60, Normal: 240, Low: 1440 }

export interface TicketMessage {
  id: string
  from: 'customer' | 'rider' | 'agent' | 'note'
  by: string
  text: string
  at: number
}

export interface Ticket {
  id: string
  kind: 'Customer' | 'Rider'
  subject: string
  category: string
  priority: Priority
  assignee: string | null
  status: TicketStatus
  /** Customer id or rider id. */
  personId: string
  personName: string
  orderId?: string
  createdAt: number
  updatedAt: number
  firstResponseAt?: number
  /** Customer satisfaction (1–5) once resolved. */
  csat?: number
  messages: TicketMessage[]
  activity: { text: string; sub: string; at: number }[]
}

export const dueAt = (t: Ticket) => t.createdAt + SLA_MIN[t.priority] * MIN
export const isLive = (t: Ticket) => t.status !== 'Resolved'
/** Open with no reply and past its first-response target. */
export const breached = (t: Ticket, now: number) => isLive(t) && !t.firstResponseAt && now > dueAt(t)
export const atRisk = (t: Ticket, now: number) => isLive(t) && !t.firstResponseAt && now <= dueAt(t) && dueAt(t) - now <= HOUR

// ---- live chat ---------------------------------------------------------------------------------------

export interface ChatMessage {
  id: string
  from: 'customer' | 'agent'
  by: string
  text: string
  at: number
}
export interface Chat {
  id: string
  customerId: string
  name: string
  orderId?: string
  messages: ChatMessage[]
  unread: number
  assignee: string | null
  closed: boolean
}

// ---- refunds, returns, disputes -----------------------------------------------------------------------------

export type RefundStatus = 'Needs review' | 'Approved' | 'Partly approved' | 'Rejected'
export interface Refund {
  id: string
  orderId: string
  customerId: string
  customerName: string
  amount: number
  reason: string
  note: string
  submittedAt: number
  priority: Priority
  status: RefundStatus
  ticketId?: string
  /** Names of order items the customer says are affected. */
  itemNames: string[]
  notes: string[]
  decision?: { by: string; at: number; amount: number; reason: string }
}

export type ReturnStatus = 'New' | 'Review' | 'Pending' | 'Evidence requested' | 'Approved' | 'Rejected'
export interface ReturnRequest {
  id: string
  orderId: string
  customerId: string
  customerName: string
  item: string
  itemValue: number
  qty: number
  reason: string
  statement: string
  submittedAt: number
  photos: number
  status: ReturnStatus
  inspection: 'confirmed' | 'more'
  note: string
  ticketId?: string
}

export type DisputeStatus = 'Awaiting decision' | 'Escalated' | 'Resolved for customer' | 'Resolved for rider'
export interface Dispute {
  id: string
  orderId: string
  customerId: string
  customerName: string
  riderId: string | null
  riderName: string
  claimBy: 'Customer' | 'Rider'
  category: string
  priority: Priority
  status: DisputeStatus
  customerStatement: string
  customerTag: string
  riderStatement: string
  riderTag: string
  evidence: { text: string; sub: string; tone: 'blue' | 'amber' | 'gray' }[]
  openedAt: number
  slaDueAt: number
  ticketId?: string
  notes: string
  assignee: string
  outcome?: { by: string; at: number; note: string }
}

// ---- reviews, knowledge base, canned replies ---------------------------------------------------------------------

export type ReviewState = 'Visible' | 'Flagged' | 'Hidden'
export interface Review {
  id: string
  customerName: string
  rating: number
  text: string
  topic: string
  at: number
  state: ReviewState
  reply?: string
  orderId?: string
  /** Moderated: a person has looked at it. */
  checked: boolean
}
export const isComplaint = (r: Review) => r.rating <= 2

export interface Article {
  id: string
  title: string
  category: string
  body: string
  live: boolean
  views: number
  updatedAt: number
  author: string
}
export const ARTICLE_CATEGORIES = ['Delivery and tracking', 'Payments', 'Returns and refunds', 'Account'] as const

export interface Canned {
  id: string
  title: string
  category: string
  text: string
  uses: number
  live: boolean
}
export const CANNED_CATEGORIES = ['Delivery', 'Refunds', 'Order issue', 'Rider support'] as const
export const TOKENS: { label: string; token: string }[] = [
  { label: 'Customer name', token: '{{customer_name}}' },
  { label: 'Order ID', token: '{{order_id}}' },
  { label: 'Agent name', token: '{{agent_name}}' },
]

// ---- seed ------------------------------------------------------------------------------------------------------

export interface SupportData {
  tickets: Ticket[]
  chats: Chat[]
  refunds: Refund[]
  returns: ReturnRequest[]
  disputes: Dispute[]
  reviews: Review[]
  articles: Article[]
  canned: Canned[]
  missingSearches: { q: string; count: number }[]
}

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const CUSTOMER_TOPICS: [string, string, Priority, string][] = [
  ['Package marked delivered but not received', 'Delivery', 'Urgent', 'My order shows as delivered but I have not received anything. I checked with my neighbour and they do not have it either.'],
  ['Refund for missing item', 'Refund', 'High', 'One item was missing from my bag. I would like a refund for it.'],
  ['Rider could not find delivery address', 'Delivery', 'Normal', 'The rider called three times and could not find my gate. Can you share my exact pin with them?'],
  ['Order arrived later than estimated', 'Delivery', 'Low', 'The order took almost an hour longer than the estimate. Is something wrong with delivery today?'],
  ['Charged twice for one order', 'Payments', 'Urgent', 'I got two M-Pesa confirmation messages for the same order. Please reverse the extra charge.'],
  ['Promo code did not apply', 'Payments', 'Normal', 'I entered my welcome code at checkout and it said invalid, but it should still be active.'],
  ['Wrong item delivered', 'Order issue', 'High', 'I ordered one thing and received another. Please arrange a swap.'],
  ['Cannot update my phone number', 'Account', 'Low', 'The app keeps showing an error when I try to change my phone number.'],
  ['Item arrived damaged', 'Order issue', 'High', 'The packaging was crushed and the product inside is damaged.'],
  ['Order stuck on processing', 'Delivery', 'Normal', 'My order has been on processing for a long time and nobody has called me.'],
  ['Need to change delivery address', 'Delivery', 'Normal', 'I typed the wrong estate. Can the rider be redirected to the correct address?'],
  ['Payment failed but money deducted', 'Payments', 'Urgent', 'My payment failed in the app but the money left my account.'],
]

const REPLIES = [
  'Thanks for reaching out. I’m looking into this right now and will update you shortly.',
  'I’m sorry about the trouble. I’ve checked the order and I’m following up with the team.',
  'I’ve passed this to the delivery team and will come back to you as soon as I hear from them.',
]

const RIDER_TOPICS: [string, string, Priority, string][] = [
  ['Rider app froze at pickup', 'Rider app', 'High', 'The app froze when I reached the store and I could not confirm pickup.'],
  ['Unable to upload delivery proof', 'Payouts', 'Urgent', 'The delivery photo will not upload. The customer is waiting.'],
  ['Wrong route shown in app', 'Navigation', 'Normal', 'The map sent me to the wrong side of the estate.'],
  ['Cash collection mismatch', 'Payments', 'High', 'The cash I collected does not match what the app expects.'],
  ['Customer phone unreachable', 'Delivery', 'Low', 'I have called the customer five times and nobody picks up.'],
  ['Payout not received', 'Payouts', 'High', 'I withdrew yesterday and the money has not reached my M-Pesa.'],
  ['Cannot go online after shift start', 'Rider app', 'Normal', 'The Go online button does nothing since this morning.'],
  ['Pickup store refused to hand over order', 'Delivery', 'Normal', 'The store says the order is not ready and told me to wait outside.'],
]

export function seedSupport(orders: Order[], customers: Customer[], riders: Rider[], staff: Staff[]): SupportData {
  const now = Date.now()
  const r = rng(29)
  const agents = staff.filter((s) => s.role === 'Customer support' && s.status === 'Active').map((s) => s.name)
  const agent = (i: number) => agents[i % agents.length] ?? 'Support team'
  const byCustomer = (id: string) => orders.find((o) => o.customerId === id && o.status !== 'Pending')
  const delivered = orders.filter((o) => o.status === 'Delivered' && o.pay === 'Paid' && o.riderId)
  const pick = <T,>(list: T[], i: number): T => list[i % list.length]!
  const riderOf = (o: Order) => riders.find((x) => x.id === o.riderId)

  // customer tickets
  const tickets: Ticket[] = []
  for (let i = 0; i < 36; i++) {
    const [subject, category, priority, body] = CUSTOMER_TOPICS[i % CUSTOMER_TOPICS.length]!
    const c = i === 0 ? customers.find((x) => x.id === delivered[0]?.customerId) ?? customers[0]! : customers[(i * 5 + 2) % customers.length]!
    const order = i === 0 ? delivered[0] : byCustomer(c.id)
    const age = i < 5 ? [2, 8, 14, 31, 42][i]! * MIN : (i - 4) * 9 * HOUR + Math.floor(r() * 4) * HOUR
    const createdAt = now - age
    const older = age > 2 * DAY
    const status: TicketStatus = older ? (i % 9 === 0 ? 'Pending' : 'Resolved') : i % 7 === 4 ? 'Pending' : i === 4 ? 'Escalated' : i % 5 === 3 ? 'Resolved' : 'Open'
    const answered = i % 6 !== 3 || status === 'Resolved'
    const assignee: string | null = i % 8 === 3 && status === 'Open' ? null : agent(i)
    const messages: TicketMessage[] = [{ id: `m${i}-0`, from: 'customer', by: c.name, text: body, at: createdAt }]
    const activity: Ticket['activity'] = [{ text: 'Ticket created from customer app', sub: 'In-app support', at: createdAt }]
    let firstResponseAt: number | undefined
    if (answered && assignee) {
      firstResponseAt = createdAt + (4 + Math.floor(r() * 22)) * MIN
      if (firstResponseAt > now) firstResponseAt = now - MIN
      messages.push({ id: `m${i}-1`, from: 'agent', by: assignee, text: pick(REPLIES, i), at: firstResponseAt })
      activity.unshift({ text: `Ticket assigned to ${assignee}`, sub: 'Auto-assigned by delivery queue', at: createdAt + MIN })
    }
    if (status === 'Resolved') activity.unshift({ text: 'Ticket resolved', sub: assignee ?? 'Support team', at: Math.min(now, createdAt + 3 * HOUR) })
    tickets.push({
      id: `TK-${2941 - i}`, kind: 'Customer', subject, category, priority, assignee, status,
      personId: c.id, personName: c.name, orderId: order?.id, createdAt, updatedAt: Math.min(now, firstResponseAt ?? createdAt) + (status === 'Resolved' ? 3 * HOUR : 0), firstResponseAt, csat: status === 'Resolved' ? (i % 6 === 0 ? 3 : i % 4 === 0 ? 4 : 5) : undefined,
      messages, activity,
    })
  }
  // the first ticket tells the full story from the design
  const t0 = tickets[0]!
  t0.status = 'Open'
  t0.assignee = agent(0)
  t0.messages = [
    { id: 'm0-0', from: 'customer', by: t0.personName, text: 'Hi, my order shows as delivered but I haven’t received anything. I checked with my neighbour and they don’t have it either.', at: t0.createdAt },
    { id: 'm0-1', from: 'agent', by: agent(1), text: `I’m sorry about this, ${t0.personName.split(' ')[0]}. I’m checking the delivery proof and will get back to you shortly.`, at: t0.createdAt + 5 * MIN },
    { id: 'm0-2', from: 'note', by: agent(0), text: 'Rider uploaded a doorstep photo. Customer says the building has two entrances. Please verify the GPS pin before refunding.', at: t0.createdAt + 8 * MIN },
  ]
  t0.firstResponseAt = t0.createdAt + 5 * MIN
  t0.activity = [
    { text: `Ticket assigned to ${agent(0)}`, sub: 'Auto-assigned by delivery queue', at: t0.createdAt + 4 * MIN },
    { text: 'Priority set to Urgent', sub: 'SLA at risk', at: t0.createdAt + 2 * MIN },
    { text: 'Ticket created from customer app', sub: 'In-app support', at: t0.createdAt },
  ]
  t0.updatedAt = t0.createdAt + 8 * MIN

  // rider tickets
  RIDER_TOPICS.forEach(([subject, category, priority, body], i) => {
    const rider = riders[(i * 2) % Math.max(riders.length, 1)]
    if (!rider) return
    const createdAt = now - (i < 4 ? [6, 12, 24, 62][i]! * MIN : (i - 3) * 7 * HOUR)
    const status: TicketStatus = i === 3 ? 'Escalated' : i === 1 ? 'Pending' : i === 4 || i > 5 ? 'Resolved' : 'Open'
    const assignee = i === 2 ? null : agent(i + 1)
    const messages: TicketMessage[] = [{ id: `rm${i}-0`, from: 'rider', by: rider.name, text: body, at: createdAt }]
    let firstResponseAt: number | undefined
    if (assignee && status !== 'Open') {
      firstResponseAt = createdAt + 9 * MIN
      messages.push({ id: `rm${i}-1`, from: 'agent', by: assignee, text: 'Thanks for flagging this. I’m checking and will update you here.', at: firstResponseAt })
    }
    tickets.push({
      id: `RS-${String(816 - i * 5).padStart(4, '0')}`, kind: 'Rider', subject, category, priority, assignee, status, personId: rider.id, personName: rider.name,
      createdAt, updatedAt: firstResponseAt ?? createdAt, firstResponseAt, messages, activity: [{ text: 'Ticket created from rider app', sub: 'In-app support', at: createdAt }],
    })
  })

  // live chats
  const chatOrders = orders.filter((o) => o.status === 'Out for delivery' || o.status === 'Processing')
  const chatSeed: [string, string[], number][] = [
    ['The rider is at the wrong gate.', ['Hi, the rider is at the wrong gate. We’re at the apartment entrance on the other side.', 'It’s the blue gate next to the pharmacy.'], 2],
    ['Can I update my delivery address?', ['Can I update my delivery address? I typed the wrong block.'], 1],
    ['Thank you, that worked.', ['Hello, my coupon would not apply.', 'Thank you, that worked.'], 0],
    ['My order is missing an item.', ['My order is missing an item. I ordered two and got one.'], 0],
  ]
  const chats: Chat[] = chatSeed.map(([, lines, unread], i) => {
    const o = chatOrders[i % Math.max(chatOrders.length, 1)]
    const c = customers.find((x) => x.id === o?.customerId) ?? customers[i]!
    const base = now - [1, 2, 9, 18][i]! * MIN
    const messages: ChatMessage[] = []
    lines.forEach((text, k) => {
      messages.push({ id: `c${i}-${k}`, from: 'customer', by: c.name, text, at: base - (lines.length - k) * MIN })
      if (k === 0 && lines.length > 1) messages.push({ id: `c${i}-a${k}`, from: 'agent', by: agent(i), text: 'Thanks for letting us know. I’m checking now. Could you confirm a few details?', at: base - (lines.length - k) * MIN + 30_000 })
    })
    return { id: `CH-${100 + i}`, customerId: c.id, name: c.name, orderId: o?.id, messages, unread, assignee: i === 2 ? agent(0) : null, closed: false }
  })

  // refunds
  const refundSeed: [number, string, string, Priority, number][] = [
    [0, 'Missing item', 'The order was delivered but one item was not in the bag.', 'Urgent', 9],
    [1, 'Damaged product', 'The product was damaged when I opened it.', 'High', 45],
    [2, 'Wrong item', 'I received a different item from what I ordered.', 'Normal', 26 * 60],
    [3, 'Quality issue', 'The quality is not what I expected from the photos.', 'Normal', 31 * 60],
    [4, 'Late delivery', 'The order was more than an hour late.', 'Low', 3 * 24 * 60],
  ]
  const refunds: Refund[] = refundSeed.map(([k, reason, note, priority, agoMin], i) => {
    const o = pick(delivered, k)
    const it = o.items[0]!
    return {
      id: `RF-${1058 - i * 6}`, orderId: o.id, customerId: o.customerId, customerName: o.customer, amount: it.price * it.qty, reason, note, submittedAt: now - agoMin * MIN, priority, status: 'Needs review',
      ticketId: i === 0 ? t0.id : undefined, itemNames: [it.name], notes: [],
    }
  })
  const doneOrder = pick(delivered, 6)
  refunds.push({
    id: 'RF-1010', orderId: doneOrder.id, customerId: doneOrder.customerId, customerName: doneOrder.customer, amount: doneOrder.items[0]!.price, reason: 'Missing item', note: 'One item missing.', submittedAt: now - 4 * DAY, priority: 'Normal', status: 'Approved',
    itemNames: [doneOrder.items[0]!.name], notes: [], decision: { by: agent(1), at: now - 4 * DAY + 3 * HOUR, amount: doneOrder.items[0]!.price, reason: 'Missing item confirmed' },
  })

  // returns
  const returnSeed: [string, string, number, number, ReturnRequest['status']][] = [
    ['Damaged on arrival', 'The box was crushed and the item inside is damaged. I have not used it.', 1, 12, 'New'],
    ['Wrong size / variant', 'I ordered the black one and received the grey one.', 2, 55, 'Review'],
    ['Product quality issue', 'The stitching came apart after one day.', 1, 20 * 60, 'Review'],
    ['Item not as described', 'The product looks different from the listing photos.', 0, 3 * 24 * 60, 'Pending'],
    ['Wrong item received', 'I received a different item altogether.', 1, 4 * 24 * 60, 'Approved'],
  ]
  const returns: ReturnRequest[] = returnSeed.map(([reason, statement, photos, agoMin, status], i) => {
    const o = pick(delivered, i + 7)
    const it = o.items[0]!
    return {
      id: `RT-${2064 - i * 8}`, orderId: o.id, customerId: o.customerId, customerName: o.customer, item: it.name, itemValue: it.price * it.qty, qty: it.qty, reason, statement, submittedAt: now - agoMin * MIN, photos, status,
      inspection: 'confirmed', note: status === 'Approved' ? 'Damage confirmed from the photo.' : '',
    }
  })

  // disputes
  const d0 = delivered[0]
  const disputes: Dispute[] = []
  const disputeSeed: [Order | undefined, string, Priority, 'Customer' | 'Rider', string, string, string, string][] = [
    [d0, 'Delivery location', 'Urgent', 'Customer', 'I didn’t receive the order. The delivery photo is not my entrance.', 'Delivery not received', 'I left it at the gate next to the pharmacy as noted.', 'Drop-off completed'],
    [pick(delivered, 3), 'Missing item', 'High', 'Customer', 'One of my items was not in the bag.', 'Item missing', 'The bag was sealed at the store and I did not open it.', 'Sealed at pickup'],
    [pick(delivered, 4), 'Proof of delivery', 'Normal', 'Rider', 'The customer says they never received the order.', 'Delivery not received', 'The photo app failed to upload, but I delivered to the customer in person.', 'Proof upload failed'],
    [pick(delivered, 5), 'Rider payout', 'Normal', 'Rider', 'The order was delivered on time.', 'On time', 'My payout for this trip was lower than the fee shown in the app.', 'Payout mismatch'],
  ]
  disputeSeed.forEach(([o, category, priority, claimBy, cs, ct, rs, rt], i) => {
    if (!o) return
    const rider = riderOf(o)
    const openedAt = now - [14, 55, 3 * 60, 26 * 60][i]! * MIN
    disputes.push({
      id: `DSP-${318 - i * 3}`, orderId: o.id, customerId: o.customerId, customerName: o.customer, riderId: rider?.id ?? null, riderName: rider?.name ?? 'Unassigned', claimBy, category, priority,
      status: i === 3 ? 'Escalated' : 'Awaiting decision', customerStatement: cs, customerTag: ct, riderStatement: rs, riderTag: rt,
      evidence: [
        { text: 'Rider GPS pin recorded', sub: `${clockOf(openedAt - 14 * MIN)} · 34 m from the saved address pin`, tone: 'blue' },
        { text: 'Delivery photo uploaded', sub: `${clockOf(openedAt - 14 * MIN)} · Customer says the location does not match`, tone: 'amber' },
        { text: claimBy === 'Customer' ? 'Customer opened dispute' : 'Rider opened dispute', sub: `${clockOf(openedAt)} · In-app support`, tone: 'gray' },
      ],
      openedAt, slaDueAt: openedAt + [60, 120, 240, 480][i]! * MIN, ticketId: i === 0 ? t0.id : undefined, notes: '', assignee: i === 0 ? agent(0) : agent(i),
    })
  })

  // reviews
  const reviewSeed: [number, string, string, number][] = [
    [5, 'The rider was kind and kept me updated. The delivery was quick.', 'Delivery', 20],
    [2, 'The order arrived late and one item was missing.', 'Order quality', 60],
    [1, 'My package was left outside in the rain.', 'Delivery', 26 * 60],
    [4, 'Good selection, checkout was easy.', 'App experience', 28 * 60],
    [5, 'Everything was packed neatly. Will order again.', 'Order quality', 2 * 24 * 60],
    [2, 'The app logged me out three times during checkout.', 'App experience', 2 * 24 * 60 + 300],
    [3, 'Delivery was fine but the fee felt high for such a short distance.', 'Pricing', 3 * 24 * 60],
    [5, 'Quick and polite rider, thank you!', 'Delivery', 4 * 24 * 60],
    [1, 'I was charged for an item that never arrived and nobody has replied.', 'Order quality', 4 * 24 * 60 + 200],
    [4, 'Nice products and fast delivery.', 'Delivery', 5 * 24 * 60],
  ]
  const reviews: Review[] = reviewSeed.map(([rating, text, topic, agoMin], i) => {
    const o = pick(delivered, i + 2)
    return { id: `rv${i + 1}`, customerName: o.customer, rating, text, topic, at: now - agoMin * MIN, state: 'Visible', orderId: o.id, checked: i > 5 }
  })

  // knowledge base
  const articles: Article[] = [
    ['Delivery and tracking', 'Where is my order?', 'Track your order in the ShopCore app. Open Orders, choose your active order, and tap Track delivery to see the latest status and rider details.', true, 18240],
    ['Payments', 'How do I pay with M-Pesa?', 'At checkout choose M-Pesa, confirm your number and approve the prompt on your phone. Your order is placed as soon as the payment goes through.', true, 12802],
    ['Returns and refunds', 'How do I request a refund?', 'Open the order in the app, tap Report a problem and choose what went wrong. Our support team reviews every request, usually within a few hours.', true, 9113],
    ['Account', 'How can I update my phone number?', 'Go to Profile, then Personal details, and tap the edit icon next to your phone number. You will be asked to confirm it with a code.', false, 0],
    ['Delivery and tracking', 'What are your delivery hours?', 'We deliver every day from 7:00 AM to 10:00 PM in the areas listed in the app.', true, 6420],
    ['Payments', 'Why was I charged twice?', 'A second message can be a duplicate notification. If the money left your account twice, contact support and we will reverse the extra charge.', true, 4180],
  ].map(([category, title, body, live, views], i) => ({ id: `a${i + 1}`, category: category as string, title: title as string, body: body as string, live: live as boolean, views: views as number, updatedAt: now - (i + 1) * 5 * HOUR, author: agent(i) }))

  const canned: Canned[] = [
    ['Delivery delay update', 'Delivery', 'Hi {{customer_name}}, I’m sorry your order {{order_id}} is taking longer than expected. I’m checking with the rider now and will update you shortly.', 184],
    ['Refund processing time', 'Refunds', 'Hi {{customer_name}}, your refund has been approved. It may take 3–5 business days to appear in your original payment account.', 92],
    ['Missing item follow-up', 'Order issue', 'Thanks for letting us know, {{customer_name}}. I’m reviewing order {{order_id}} and will get back to you shortly.', 68],
    ['Request delivery photo', 'Delivery', 'Could you share a photo of the delivery location so we can investigate this quickly? — {{agent_name}}', 34],
    ['Rider app restart steps', 'Rider support', 'Please close the rider app fully, reopen it, and check you are on the latest version. If it still fails, reply here and we will escalate. — {{agent_name}}', 21],
  ].map(([title, category, text, uses], i) => ({ id: `cr${i + 1}`, title: title as string, category: category as string, text: text as string, uses: uses as number, live: true }))

  return {
    tickets, chats, refunds, returns, disputes, reviews, articles, canned,
    missingSearches: [{ q: 'Can I change my delivery pin?', count: 184 }, { q: 'What happens if my rider is late?', count: 126 }, { q: 'How do I update my M-Pesa number?', count: 83 }],
  }
}

function clockOf(ms: number) {
  const d = new Date(ms)
  const h = d.getHours()
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** Replace {{tokens}} in a canned reply. */
export function fillTokens(text: string, vals: { customer_name?: string; order_id?: string; agent_name?: string }) {
  return text
    .replaceAll('{{customer_name}}', vals.customer_name ?? 'there')
    .replaceAll('{{order_id}}', vals.order_id ?? 'your order')
    .replaceAll('{{agent_name}}', vals.agent_name ?? 'ShopCore Support')
}
