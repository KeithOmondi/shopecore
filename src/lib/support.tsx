import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import {
  seedSupport, type Article, type Canned, type Chat, type Dispute, type Priority, type Refund, type ReturnRequest, type ReturnStatus, type Review, type ReviewState, type Ticket, type TicketMessage, type TicketStatus,
} from '../data/support'
import { kes } from './format'
import { useStore } from './store'

/** Support agents can refund up to this much on their own; more needs someone with payments access. */
export const REFUND_LIMIT = 5000

interface NewTicket {
  kind: 'Customer' | 'Rider'
  personId: string
  personName: string
  subject: string
  category: string
  priority: Priority
  orderId?: string
  body: string
}

interface Support {
  me: string
  tickets: Ticket[]
  setTicketStatus: (id: string, status: TicketStatus) => void
  setTicketPriority: (id: string, p: Priority) => void
  assignTicket: (id: string, to: string | null) => void
  replyTicket: (id: string, text: string, internal: boolean) => void
  createTicket: (t: NewTicket) => string
  chats: Chat[]
  markChatRead: (id: string) => void
  sendChat: (id: string, text: string) => void
  assignChat: (id: string) => void
  closeChat: (id: string) => void
  /** Opens (or reuses) a chat with a customer; returns its id. */
  startChat: (customerId: string) => string
  refunds: Refund[]
  addRefundNote: (id: string, text: string) => void
  /** Returns an error message, or null when the decision was recorded. */
  decideRefund: (id: string, decision: 'approve' | 'reject', amount: number, reason: string) => string | null
  createRefund: (orderId: string, amount: number, reason: string, ticketId?: string) => string
  returns: ReturnRequest[]
  decideReturn: (id: string, decision: Extract<ReturnStatus, 'Approved' | 'Rejected' | 'Evidence requested'>, note: string, inspection: ReturnRequest['inspection']) => void
  disputes: Dispute[]
  createDispute: (orderId: string, ticketId?: string) => string | null
  setDisputeNotes: (id: string, notes: string) => void
  escalateDispute: (id: string) => void
  resolveDispute: (id: string, inFavourOf: 'customer' | 'rider', note: string, openRefund: boolean) => void
  reviews: Review[]
  replyReview: (id: string, text: string) => void
  setReviewState: (id: string, state: ReviewState) => void
  articles: Article[]
  saveArticle: (a: Partial<Article> & { title: string; category: string; body: string }, live: boolean) => string
  canned: Canned[]
  saveCanned: (c: Partial<Canned> & { title: string; category: string; text: string }) => string
  bumpCanned: (id: string) => void
  deleteCanned: (id: string) => void
  missingSearches: { q: string; count: number }[]
  addMissingToBacklog: () => void
}

const Ctx = createContext<Support | null>(null)

export function SupportProvider({ children }: { children: ReactNode }) {
  const { user, orders, setOrders, customers, riders, staff, log, toast, can } = useStore()
  const [seed] = useState(() => seedSupport(orders, customers, riders, staff))
  const [tickets, setTickets] = useState(seed.tickets)
  const [chats, setChats] = useState(seed.chats)
  const [refunds, setRefunds] = useState(seed.refunds)
  const [returns, setReturns] = useState(seed.returns)
  const [disputes, setDisputes] = useState(seed.disputes)
  const [reviews, setReviews] = useState(seed.reviews)
  const [articles, setArticles] = useState(seed.articles)
  const [canned, setCanned] = useState(seed.canned)
  const [missing, setMissing] = useState(seed.missingSearches)
  const me = user?.name ?? 'Support team'

  const touch = (id: string, fn: (t: Ticket) => Ticket) => setTickets((list) => list.map((t) => (t.id === id ? fn(t) : t)))
  const entry = (text: string, sub: string) => ({ text, sub, at: Date.now() })

  const setTicketStatus = useCallback((id: string, status: TicketStatus) => {
    touch(id, (t) => ({ ...t, status, updatedAt: Date.now(), activity: [entry(`Status set to ${status}`, me), ...t.activity] }))
    log(`Ticket ${id} set to ${status}`, 'Support')
  }, [me, log])
  const setTicketPriority = useCallback((id: string, priority: Priority) => {
    touch(id, (t) => ({ ...t, priority, updatedAt: Date.now(), activity: [entry(`Priority set to ${priority}`, me), ...t.activity] }))
  }, [me])
  const assignTicket = useCallback((id: string, to: string | null) => {
    touch(id, (t) => ({ ...t, assignee: to, updatedAt: Date.now(), activity: [entry(to ? `Ticket assigned to ${to}` : 'Ticket unassigned', me), ...t.activity] }))
    log(`Ticket ${id} ${to ? `assigned to ${to}` : 'unassigned'}`, 'Support')
  }, [me, log])
  const replyTicket = useCallback((id: string, text: string, internal: boolean) => {
    const at = Date.now()
    touch(id, (t) => {
      const msg: TicketMessage = { id: `m${at}`, from: internal ? 'note' : 'agent', by: me, text, at }
      return {
        ...t, messages: [...t.messages, msg], updatedAt: at,
        firstResponseAt: internal ? t.firstResponseAt : (t.firstResponseAt ?? at),
        status: !internal && t.status === 'Open' ? 'Pending' : t.status,
        assignee: t.assignee ?? me,
        activity: [entry(internal ? 'Internal note added' : 'Reply sent', me), ...t.activity],
      }
    })
  }, [me])
  const createTicket = useCallback((n: NewTicket) => {
    const at = Date.now()
    const id = `${n.kind === 'Customer' ? 'TK' : 'RS'}-${String(at).slice(-4)}`
    const msg: TicketMessage = { id: `m${at}`, from: n.kind === 'Customer' ? 'customer' : 'rider', by: n.personName, text: n.body, at }
    setTickets((list) => [{
      id, kind: n.kind, subject: n.subject, category: n.category, priority: n.priority, assignee: me, status: 'Open', personId: n.personId, personName: n.personName, orderId: n.orderId,
      createdAt: at, updatedAt: at, messages: [msg], activity: [entry('Ticket created by staff', me)],
    }, ...list])
    log(`Created ticket ${id}`, 'Support')
    return id
  }, [me, log])

  const markChatRead = useCallback((id: string) => setChats((l) => l.map((c) => (c.id === id && c.unread ? { ...c, unread: 0 } : c))), [])
  const sendChat = useCallback((id: string, text: string) => {
    const at = Date.now()
    setChats((l) => l.map((c) => (c.id === id ? { ...c, assignee: c.assignee ?? me, messages: [...c.messages, { id: `c${at}`, from: 'agent', by: me, text, at }] } : c)))
  }, [me])
  const assignChat = useCallback((id: string) => setChats((l) => l.map((c) => (c.id === id ? { ...c, assignee: me } : c))), [me])
  const startChat = useCallback((customerId: string) => {
    const existing = chats.find((c) => c.customerId === customerId && !c.closed)
    if (existing) return existing.id
    const c = customers.find((x) => x.id === customerId)
    const at = Date.now()
    const id = 'CH-' + String(at).slice(-5)
    setChats((l) => [{ id, customerId, name: c?.name ?? 'Customer', messages: [{ id: 'c' + at, from: 'agent', by: me, text: 'Hi ' + (c?.name.split(' ')[0] ?? 'there') + ', this is ' + me.split(' ')[0] + ' from ShopCore support. How can I help?', at }], unread: 0, assignee: me, closed: false }, ...l])
    return id
  }, [chats, customers, me])
  const closeChat = useCallback((id: string) => setChats((l) => l.map((c) => (c.id === id ? { ...c, closed: true } : c))), [])

  const addRefundNote = useCallback((id: string, text: string) => setRefunds((l) => l.map((r) => (r.id === id ? { ...r, notes: [`${me}: ${text}`, ...r.notes] } : r))), [me])

  const decideRefund = useCallback((id: string, decision: 'approve' | 'reject', amount: number, reason: string) => {
    const refund = refunds.find((r) => r.id === id)
    if (!refund) return 'That request no longer exists.'
    if (refund.status !== 'Needs review') return 'This request has already been decided.'
    const at = Date.now()
    if (decision === 'reject') {
      setRefunds((l) => l.map((r) => (r.id === id ? { ...r, status: 'Rejected', decision: { by: me, at, amount: 0, reason } } : r)))
      log(`Rejected refund ${id}`, 'Support', 'Refund')
      return null
    }
    const order = orders.find((o) => o.id === refund.orderId)
    if (!order) return 'The order for this request could not be found.'
    if (order.pay !== 'Paid') return 'This order was not paid, so there is nothing to refund.'
    const max = order.total - order.refunded
    if (!Number.isInteger(amount) || amount <= 0) return 'Enter the refund amount in whole shillings.'
    if (amount > max) return `The most that can still be refunded on this order is ${kes(max)}.`
    if (amount > REFUND_LIMIT && !can('Payments', 'Edit')) return `Refunds above ${kes(REFUND_LIMIT)} need approval from someone with payments access. Add a note and ask finance.`
    const full = amount === max
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, refunded: o.refunded + amount, pay: full ? 'Refunded' : o.pay, status: full ? 'Refunded' : o.status, events: [...o.events, { status: 'Refunded', at, by: me, note: `${kes(amount)} · ${reason}` }] } : o)))
    setRefunds((l) => l.map((r) => (r.id === id ? { ...r, status: amount >= refund.amount ? 'Approved' : 'Partly approved', decision: { by: me, at, amount, reason } } : r)))
    log(`Approved refund ${id} (${kes(amount)})`, 'Support', 'Refund')
    return null
  }, [refunds, orders, setOrders, me, log, can])

  const createRefund = useCallback((orderId: string, amount: number, reason: string, ticketId?: string) => {
    const order = orders.find((o) => o.id === orderId)
    const at = Date.now()
    const id = `RF-${String(at).slice(-4)}`
    setRefunds((l) => [{
      id, orderId, customerId: order?.customerId ?? '', customerName: order?.customer ?? 'Customer', amount, reason, note: `Opened by ${me}.`, submittedAt: at, priority: 'High', status: 'Needs review', ticketId,
      itemNames: order?.items.map((i) => i.name) ?? [], notes: [],
    }, ...l])
    log(`Opened refund request ${id}`, 'Support')
    return id
  }, [orders, me, log])

  const decideReturn = useCallback((id: string, decision: Extract<ReturnStatus, 'Approved' | 'Rejected' | 'Evidence requested'>, note: string, inspection: ReturnRequest['inspection']) => {
    setReturns((l) => l.map((r) => (r.id === id ? { ...r, status: decision, note, inspection } : r)))
    log(`Return ${id}: ${decision.toLowerCase()}`, 'Support', 'Updated')
  }, [log])

  const createDispute = useCallback((orderId: string, ticketId?: string) => {
    const order = orders.find((o) => o.id === orderId)
    if (!order) return null
    const rider = riders.find((x) => x.id === order.riderId)
    const at = Date.now()
    const id = `DSP-${String(at).slice(-4)}`
    setDisputes((l) => [{
      id, orderId, customerId: order.customerId, customerName: order.customer, riderId: rider?.id ?? null, riderName: rider?.name ?? 'Unassigned', claimBy: 'Customer', category: 'Delivery location', priority: 'High', status: 'Awaiting decision',
      customerStatement: 'Statement not recorded yet.', customerTag: 'To be collected', riderStatement: 'Statement not recorded yet.', riderTag: 'To be collected',
      evidence: [{ text: 'Dispute opened by staff', sub: me, tone: 'gray' }], openedAt: at, slaDueAt: at + 2 * 3_600_000, ticketId, notes: '', assignee: me,
    }, ...l])
    log(`Opened dispute ${id}`, 'Support')
    return id
  }, [orders, riders, me, log])

  const setDisputeNotes = useCallback((id: string, notes: string) => setDisputes((l) => l.map((d) => (d.id === id ? { ...d, notes } : d))), [])
  const escalateDispute = useCallback((id: string) => {
    setDisputes((l) => l.map((d) => (d.id === id ? { ...d, status: 'Escalated' } : d)))
    log(`Escalated dispute ${id}`, 'Support', 'Updated')
  }, [log])
  const resolveDispute = useCallback((id: string, inFavourOf: 'customer' | 'rider', note: string, openRefund: boolean) => {
    const d = disputes.find((x) => x.id === id)
    if (!d) return
    setDisputes((l) => l.map((x) => (x.id === id ? { ...x, status: inFavourOf === 'customer' ? 'Resolved for customer' : 'Resolved for rider', notes: note, outcome: { by: me, at: Date.now(), note } } : x)))
    log(`Resolved dispute ${id} for the ${inFavourOf}`, 'Support', 'Updated')
    if (inFavourOf === 'customer' && openRefund) {
      const order = orders.find((o) => o.id === d.orderId)
      if (order && order.pay === 'Paid') createRefund(order.id, order.total - order.refunded, `Dispute ${id} resolved for the customer`, d.ticketId)
    }
  }, [disputes, orders, me, log, createRefund])

  const replyReview = useCallback((id: string, text: string) => {
    setReviews((l) => l.map((r) => (r.id === id ? { ...r, reply: text, checked: true } : r)))
    log(`Replied to review ${id}`, 'Support')
  }, [log])
  const setReviewState = useCallback((id: string, state: ReviewState) => {
    setReviews((l) => l.map((r) => (r.id === id ? { ...r, state, checked: true } : r)))
    log(`Review ${id} marked ${state.toLowerCase()}`, 'Support')
  }, [log])

  const saveArticle = useCallback((a: Partial<Article> & { title: string; category: string; body: string }, live: boolean) => {
    const at = Date.now()
    const id = a.id ?? `a${at}`
    setArticles((l) => (l.some((x) => x.id === id)
      ? l.map((x) => (x.id === id ? { ...x, ...a, live, updatedAt: at, author: me } : x))
      : [{ id, title: a.title, category: a.category, body: a.body, live, views: 0, updatedAt: at, author: me }, ...l]))
    log(`${live ? 'Published' : 'Saved draft of'} help article · ${a.title}`, 'Support')
    return id
  }, [me, log])

  const saveCanned = useCallback((c: Partial<Canned> & { title: string; category: string; text: string }) => {
    const id = c.id ?? `cr${Date.now()}`
    setCanned((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...x, ...c } : x)) : [...l, { id, title: c.title, category: c.category, text: c.text, uses: 0, live: true }]))
    log(`Saved canned response · ${c.title}`, 'Support')
    return id
  }, [log])
  const bumpCanned = useCallback((id: string) => setCanned((l) => l.map((c) => (c.id === id ? { ...c, uses: c.uses + 1 } : c))), [])
  const deleteCanned = useCallback((id: string) => setCanned((l) => l.filter((c) => c.id !== id)), [])

  const addMissingToBacklog = useCallback(() => {
    const at = Date.now()
    setArticles((l) => [...missing.map((m, i) => ({ id: `a${at + i}`, title: m.q, category: 'Delivery and tracking', body: '', live: false, views: 0, updatedAt: at, author: me })), ...l])
    setMissing([])
    toast('Added to the content backlog as drafts')
  }, [missing, me, toast])

  const value = useMemo<Support>(
    () => ({
      me, tickets, setTicketStatus, setTicketPriority, assignTicket, replyTicket, createTicket, chats, markChatRead, sendChat, assignChat, closeChat, startChat, refunds, addRefundNote, decideRefund, createRefund, returns, decideReturn,
      disputes, createDispute, setDisputeNotes, escalateDispute, resolveDispute, reviews, replyReview, setReviewState, articles, saveArticle, canned, saveCanned, bumpCanned, deleteCanned, missingSearches: missing, addMissingToBacklog,
    }),
    [me, tickets, setTicketStatus, setTicketPriority, assignTicket, replyTicket, createTicket, chats, markChatRead, sendChat, assignChat, closeChat, startChat, refunds, addRefundNote, decideRefund, createRefund, returns, decideReturn, disputes, createDispute, setDisputeNotes, escalateDispute, resolveDispute, reviews, replyReview, setReviewState, articles, saveArticle, canned, saveCanned, bumpCanned, deleteCanned, missing, addMissingToBacklog],
  )
  return <Ctx value={value}>{children}</Ctx>
}

export function useSupport(): Support {
  const ctx = use(Ctx)
  if (!ctx) throw new Error('useSupport must be used inside <SupportProvider>')
  return ctx
}
