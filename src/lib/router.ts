import { useSyncExternalStore } from 'react'

/** Tiny hash router: `#/staff/s1` → `/staff/s1`. No dependency, and every screen has a shareable URL. */
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const raw = () => window.location.hash.replace(/^#/, '') || '/'
const snapshot = () => raw().split('?')[0] || '/'
const queryRaw = () => raw().split('?')[1] ?? ''

export const usePath = () => useSyncExternalStore(subscribe, snapshot)
/** `#/orders?customer=c1` → `{ customer: 'c1' }` */
export function useQuery(): URLSearchParams {
  const q = useSyncExternalStore(subscribe, queryRaw)
  return new URLSearchParams(q)
}

export function navigate(path: string) {
  if (raw() === path) window.scrollTo({ top: 0 })
  else window.location.hash = path
}

export interface NavItem {
  label: string
  icon: string
  path: string
  /** Paths (prefixes) under which this item is highlighted. */
  match: (path: string) => boolean
  /** A live count shown beside the label. */
  badge?: 'tickets' | 'chats'
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'OVERVIEW', items: [{ label: 'Executive overview', icon: '◫', path: '/', match: (p) => p === '/' }] },
  {
    label: 'SUPPORT',
    items: [
      { label: 'Tickets inbox', icon: '▤', path: '/support/tickets', match: (p) => p === '/support/tickets' || p.startsWith('/support/tickets/'), badge: 'tickets' },
      { label: 'Live chat console', icon: '◌', path: '/support/chat', match: (p) => p === '/support/chat' || p.startsWith('/support/chat/'), badge: 'chats' },
      { label: 'Rider support tickets', icon: '↗', path: '/support/rider-tickets', match: (p) => p === '/support/rider-tickets' || p.startsWith('/support/rider-tickets/') },
      { label: 'Disputes', icon: '⚖', path: '/support/disputes', match: (p) => p === '/support/disputes' || p.startsWith('/support/disputes/') },
    ],
  },
  {
    label: 'CLAIMS',
    items: [
      { label: 'Refund requests', icon: '↶', path: '/support/refunds', match: (p) => p === '/support/refunds' || p.startsWith('/support/refunds/') },
      { label: 'Returns requests', icon: '↩', path: '/support/returns', match: (p) => p === '/support/returns' || p.startsWith('/support/returns/') },
      { label: 'Customer lookup', icon: '⌕', path: '/support/lookup', match: (p) => p === '/support/lookup' || p.startsWith('/support/lookup/') },
    ],
  },
  {
    label: 'QUALITY & CONTENT',
    items: [
      { label: 'Reviews and complaints moderation', icon: '☆', path: '/support/reviews', match: (p) => p === '/support/reviews' || p.startsWith('/support/reviews/') },
      { label: 'Knowledge base and FAQ editor', icon: '?', path: '/support/help', match: (p) => p === '/support/help' || p.startsWith('/support/help/') },
      { label: 'Canned responses manager', icon: '≡', path: '/support/canned', match: (p) => p === '/support/canned' || p.startsWith('/support/canned/') },
    ],
  },
  {
    label: 'DISPATCH',
    items: [
      { label: 'Dispatch overview', icon: '◎', path: '/dispatch', match: (p) => p === '/dispatch' },
      { label: 'Order queue', icon: '▤', path: '/dispatch/queue', match: (p) => p === '/dispatch/queue' },
      { label: 'Assign rider', icon: '＋', path: '/dispatch/assign', match: (p) => p.startsWith('/dispatch/assign') },
      { label: 'Live order detail', icon: '↗', path: '/dispatch/live', match: (p) => p.startsWith('/dispatch/live') },
      { label: 'Reassign order', icon: '⇄', path: '/dispatch/reassign', match: (p) => p.startsWith('/dispatch/reassign') },
      { label: 'Delayed and stuck orders', icon: '!', path: '/dispatch/alerts', match: (p) => p === '/dispatch/alerts' },
    ],
  },
  {
    label: 'COMMERCE',
    items: [
      { label: 'Orders', icon: '▣', path: '/orders', match: (p) => p === '/orders' || p.startsWith('/orders/') },
      { label: 'Products', icon: '◈', path: '/products', match: (p) => p === '/products' || p.startsWith('/products/') },
      { label: 'Categories and stock', icon: '▥', path: '/inventory', match: (p) => p === '/inventory' },
    ],
  },
  {
    label: 'RIDER OPERATIONS',
    items: [
      { label: 'Riders list', icon: '♙', path: '/riders', match: (p) => p === '/riders' },
      { label: 'Rider detail', icon: '◉', path: '/riders/r1', match: (p) => p.startsWith('/riders/') && !p.startsWith('/riders/applications') },
      { label: 'Rider application review', icon: '▧', path: '/riders/applications', match: (p) => p.startsWith('/riders/applications') },
      { label: 'Delivery zones', icon: '⌖', path: '/zones', match: (p) => p === '/zones' },
      { label: 'Rider shifts and capacity', icon: '▦', path: '/shifts', match: (p) => p === '/shifts' },
    ],
  },
  {
    label: 'EXCEPTIONS',
    items: [
      { label: 'Cancelled and failed deliveries', icon: '×', path: '/exceptions', match: (p) => p === '/exceptions' },
      { label: 'Incidents and SOS alerts', icon: '⚠', path: '/incidents', match: (p) => p === '/incidents' },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { label: 'Finance overview', icon: '▦', path: '/finance', match: (p) => p === '/finance' },
      { label: 'Payments', icon: '⇄', path: '/payments', match: (p) => p === '/payments' || p.startsWith('/payments/') },
      { label: 'Failed payments and retries', icon: '!', path: '/finance/failed', match: (p) => p === '/finance/failed' },
      { label: 'Reconciliation', icon: '≋', path: '/finance/reconciliation', match: (p) => p === '/finance/reconciliation' },
      { label: 'Refunds ledger', icon: '↶', path: '/finance/refunds', match: (p) => p === '/finance/refunds' },
      { label: 'Taxes and VAT report', icon: '%', path: '/finance/vat', match: (p) => p === '/finance/vat' },
      { label: 'Profit and loss summary', icon: '▤', path: '/finance/pnl', match: (p) => p === '/finance/pnl' },
      { label: 'Accounts and ledger', icon: '▥', path: '/finance/accounts', match: (p) => p === '/finance/accounts' },
    ],
  },
  {
    label: 'COD & PAYOUTS',
    items: [
      { label: 'COD management', icon: '▣', path: '/finance/cod', match: (p) => p === '/finance/cod' },
      { label: 'Record COD deposit', icon: '＋', path: '/finance/cod/deposit', match: (p) => p === '/finance/cod/deposit' },
      { label: 'Rider payouts', icon: '⇧', path: '/payouts', match: (p) => p === '/payouts' },
      { label: 'Payout batch', icon: '▦', path: '/finance/batch', match: (p) => p === '/finance/batch' || p.startsWith('/finance/batch/') },
      { label: 'Rider earnings statements', icon: '≡', path: '/finance/statements', match: (p) => p === '/finance/statements' },
      { label: 'Store settlements', icon: '◈', path: '/finance/settlements', match: (p) => p === '/finance/settlements' },
    ],
  },
  {
    label: 'BILLING & REPORTS',
    items: [
      { label: 'Invoices list', icon: '▤', path: '/finance/invoices', match: (p) => p === '/finance/invoices' || p.startsWith('/finance/invoices/') },
      { label: 'Sales reports', icon: '↗', path: '/finance/sales', match: (p) => p === '/finance/sales' },
      { label: 'Delivery cost report', icon: '⌖', path: '/finance/delivery-cost', match: (p) => p === '/finance/delivery-cost' },
      { label: 'Expense tracking', icon: '−', path: '/finance/expenses', match: (p) => p === '/finance/expenses' },
      { label: 'Export center', icon: '⇩', path: '/finance/exports', match: (p) => p === '/finance/exports' },
    ],
  },
  {
    label: 'PAYROLL',
    items: [
      { label: 'Payroll runs', icon: '₭', path: '/finance/payroll', match: (p) => p === '/finance/payroll' || (p.startsWith('/finance/payroll/') && !p.startsWith('/finance/payroll/employees') && !p.startsWith('/finance/payroll/remittances')) },
      { label: 'Employee pay profiles', icon: '♙', path: '/finance/payroll/employees', match: (p) => p === '/finance/payroll/employees' },
      { label: 'Statutory remittances', icon: '⚖', path: '/finance/payroll/remittances', match: (p) => p === '/finance/payroll/remittances' },
    ],
  },
  {
    label: 'CONTROLS',
    items: [
      { label: 'Financial period close', icon: '✓', path: '/finance/close', match: (p) => p === '/finance/close' },
      { label: 'Finance settings', icon: '⚙', path: '/finance/settings', match: (p) => p === '/finance/settings' },
    ],
  },
  { label: 'INSIGHTS', items: [{ label: 'Reports', icon: '↗', path: '/reports', match: (p) => p === '/reports' }] },
  {
    label: 'PEOPLE',
    items: [
      { label: 'Staff list', icon: '♙', path: '/staff', match: (p) => p === '/staff' },
      { label: 'Add/edit staff', icon: '＋', path: '/staff/new', match: (p) => p.startsWith('/staff/') },
      { label: 'Customers list', icon: '♧', path: '/customers', match: (p) => p === '/customers' },
      { label: 'Customer detail', icon: '◉', path: '/customers/c1', match: (p) => p.startsWith('/customers/') },
    ],
  },
  {
    label: 'ACCESS & AUDIT',
    items: [
      { label: 'Roles and permissions matrix', icon: '▦', path: '/roles', match: (p) => p === '/roles' },
      { label: 'Audit log', icon: '≡', path: '/audit', match: (p) => p === '/audit' },
    ],
  },
  {
    label: 'BUSINESS SETTINGS',
    items: [
      { label: 'Business settings', icon: '⚙', path: '/settings/business', match: (p) => p === '/settings/business' },
      { label: 'Payment gateway settings', icon: '⚿', path: '/settings/payments', match: (p) => p === '/settings/payments' },
      { label: 'Delivery settings', icon: '⌖', path: '/settings/delivery', match: (p) => p === '/settings/delivery' },
    ],
  },
  { label: 'COMMUNICATION', items: [{ label: 'Notification templates', icon: '✉', path: '/templates', match: (p) => p === '/templates' }] },
  {
    label: 'SYSTEM',
    items: [
      { label: 'Integrations and API keys', icon: '⌘', path: '/integrations', match: (p) => p === '/integrations' },
      { label: 'Backup and system health', icon: '◷', path: '/health', match: (p) => p === '/health' },
    ],
  },
]

const ALL = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label))

/** Legacy pages (from the first design) each role can open. Newer pages follow the permission matrix instead. */
const LEGACY: Record<string, ReadonlySet<string>> = {
  'Owner admin': new Set(ALL),
  'Operations manager': new Set(['Executive overview', 'Staff list', 'Add/edit staff', 'Customers list', 'Customer detail', 'Delivery settings', 'Notification templates', 'Backup and system health']),
  'IT support': new Set(['Executive overview', 'Staff list', 'Add/edit staff', 'Roles and permissions matrix', 'Audit log', 'Integrations and API keys', 'Backup and system health']),
  'Dispatch manager': new Set(['Executive overview', 'Customers list', 'Customer detail', 'Delivery settings', 'Notification templates']),
  'Finance analyst': new Set(['Executive overview', 'Customers list', 'Customer detail', 'Business settings', 'Payment gateway settings', 'Audit log', 'Backup and system health']),
  'Customer support': new Set(['Executive overview', 'Customers list', 'Customer detail', 'Notification templates']),
  'Rider manager': new Set(['Executive overview', 'Staff list', 'Delivery settings']),
}

/** The permission-matrix module a newer page belongs to. */
export const PAGE_MODULE: Record<string, string> = {
  'Dispatch overview': 'Orders', 'Order queue': 'Orders', 'Assign rider': 'Orders', 'Live order detail': 'Orders', 'Reassign order': 'Orders', 'Delayed and stuck orders': 'Orders',
  'Cancelled and failed deliveries': 'Orders', Orders: 'Orders', Products: 'Products', 'Categories and stock': 'Products',
  'Riders list': 'Riders', 'Rider detail': 'Riders', 'Rider application review': 'Riders', 'Delivery zones': 'Riders', 'Rider shifts and capacity': 'Riders', 'Incidents and SOS alerts': 'Riders',
  Payments: 'Payments', 'Rider payouts': 'Payments',
  'Finance overview': 'Payments', 'Failed payments and retries': 'Payments', Reconciliation: 'Payments', 'Refunds ledger': 'Payments', 'Taxes and VAT report': 'Payments', 'Profit and loss summary': 'Payments', 'Accounts and ledger': 'Payments',
  'COD management': 'Payments', 'Record COD deposit': 'Payments', 'Payout batch': 'Payments', 'Rider earnings statements': 'Payments', 'Store settlements': 'Payments',
  'Invoices list': 'Payments', 'Sales reports': 'Payments', 'Delivery cost report': 'Payments', 'Expense tracking': 'Payments', 'Export center': 'Payments', 'Financial period close': 'Payments', 'Finance settings': 'Payments',
  'Payroll runs': 'Payroll', 'Employee pay profiles': 'Payroll', 'Statutory remittances': 'Payroll', Reports: 'Reports',
  'Tickets inbox': 'Support', 'Live chat console': 'Support', 'Rider support tickets': 'Support', Disputes: 'Support', 'Refund requests': 'Support', 'Returns requests': 'Support', 'Customer lookup': 'Support',
  'Reviews and complaints moderation': 'Support', 'Knowledge base and FAQ editor': 'Support', 'Canned responses manager': 'Support',
}

/** Customer support only sees the monitoring side of dispatch (not assignment or rider management). */
const SUPPORT_DISPATCH = new Set(['Dispatch overview', 'Live order detail', 'Delayed and stuck orders', 'Cancelled and failed deliveries', 'Incidents and SOS alerts'])
const DISPATCH_PAGES = new Set(['Dispatch overview', 'Order queue', 'Assign rider', 'Live order detail', 'Reassign order', 'Delayed and stuck orders', 'Cancelled and failed deliveries', 'Incidents and SOS alerts'])

/** Can this role open the page? `perms` is that role's row of the permission matrix. */
export function canOpen(role: string, label: string, perms: Record<string, boolean[]> | undefined): boolean {
  if (role === 'Owner admin') return true
  if (role === 'Customer support' && DISPATCH_PAGES.has(label)) return SUPPORT_DISPATCH.has(label)
  const mod = PAGE_MODULE[label]
  if (mod) return !!perms?.[mod]?.[0]
  return LEGACY[role]?.has(label) ?? false
}

export const ROLE_PAGE_COUNT = (role: string, perms: Record<string, boolean[]> | undefined) => ALL.filter((l) => canOpen(role, l, perms)).length

export const pageFor = (path: string) => NAV_GROUPS.flatMap((g) => g.items).find((i) => i.match(path))

/** The home page is a different page for different people, so its name changes with the role. */
export function displayLabel(label: string, role: string, perms: Record<string, boolean[]> | undefined): string {
  if (label !== 'Executive overview' || role === 'Owner admin' || perms?.Overview?.[0]) return label
  return role === 'IT support' ? 'System overview' : 'Support overview'
}
