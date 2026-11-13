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

/** Forms with unsaved changes register a check here, and the app asks before leaving them. */
let guard: (() => boolean) | null = null
let leavePrompt: ((proceed: () => void) => void) | null = null
export const setNavGuard = (g: (() => boolean) | null) => { guard = g }
export const setLeavePrompt = (p: ((proceed: () => void) => void) | null) => { leavePrompt = p }

export function navigate(path: string) {
  const go = () => {
    if (raw() === path) window.scrollTo({ top: 0 })
    else window.location.hash = path
  }
  if (raw() !== path && guard && leavePrompt && guard()) {
    leavePrompt(() => { guard = null; go() })
    return
  }
  go()
}

export interface NavItem {
  label: string
  icon: string
  path: string
  /** Paths (prefixes) under which this item is highlighted. */
  match: (path: string) => boolean
  /** A live count shown beside the label. */
  badge?: 'tickets' | 'chats' | 'alerts'
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
    label: 'CAMPAIGNS',
    items: [
      { label: 'Marketing overview', icon: '▦', path: '/marketing', match: (p) => p === '/marketing' },
      { label: 'Coupons list', icon: '%', path: '/marketing/coupons', match: (p) => p === '/marketing/coupons' || p.startsWith('/marketing/coupons/') },
      { label: 'Flash sales', icon: 'ϟ', path: '/marketing/flash', match: (p) => p === '/marketing/flash' },
      { label: 'Promotions and bundles', icon: '◇', path: '/marketing/bundles', match: (p) => p === '/marketing/bundles' },
      { label: 'Campaign analytics', icon: '▥', path: '/marketing/analytics', match: (p) => p === '/marketing/analytics' || p.startsWith('/marketing/analytics/') },
    ],
  },
  {
    label: 'CUSTOMER ENGAGEMENT',
    items: [
      { label: 'Push notifications', icon: '↗', path: '/marketing/push', match: (p) => p === '/marketing/push' },
      { label: 'SMS and email campaigns', icon: '✉', path: '/marketing/messages', match: (p) => p === '/marketing/messages' },
      { label: 'Audience segments', icon: '◎', path: '/marketing/segments', match: (p) => p === '/marketing/segments' },
      { label: 'Loyalty points rules', icon: '✧', path: '/marketing/loyalty', match: (p) => p === '/marketing/loyalty' },
      { label: 'Referral program settings', icon: '⇄', path: '/marketing/referrals', match: (p) => p === '/marketing/referrals' },
      { label: 'Reviews highlights', icon: '☆', path: '/marketing/highlights', match: (p) => p === '/marketing/highlights' },
    ],
  },
  {
    label: 'CONTENT',
    items: [
      { label: 'Banners manager', icon: '▧', path: '/marketing/banners', match: (p) => p === '/marketing/banners' },
      { label: 'Homepage layout builder', icon: '▤', path: '/marketing/homepage', match: (p) => p === '/marketing/homepage' },
      { label: 'Content pages editor', icon: '¶', path: '/marketing/pages', match: (p) => p === '/marketing/pages' },
      { label: 'Category and landing page content', icon: '▣', path: '/marketing/categories', match: (p) => p === '/marketing/categories' },
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
    ],
  },
  {
    label: 'INVENTORY',
    items: [
      { label: 'Inventory overview', icon: '▦', path: '/stock', match: (p) => p === '/stock' },
      { label: 'Products', icon: '▧', path: '/products', match: (p) => p === '/products' || p.startsWith('/products/') },
      { label: 'Categories and subcategories', icon: '☷', path: '/inventory/categories', match: (p) => p === '/inventory/categories' || p === '/inventory' },
      { label: 'Brands', icon: '◈', path: '/inventory/brands', match: (p) => p === '/inventory/brands' },
      { label: 'Stock levels by warehouse', icon: '▥', path: '/inventory/levels', match: (p) => p === '/inventory/levels' },
      { label: 'Low-stock alerts and reorder settings', icon: '!', path: '/inventory/alerts', match: (p) => p === '/inventory/alerts', badge: 'alerts' },
    ],
  },
  {
    label: 'PURCHASING',
    items: [
      { label: 'Purchase orders list', icon: '▤', path: '/purchasing', match: (p) => p === '/purchasing' || (p.startsWith('/purchasing/') && !p.startsWith('/purchasing/new') && !p.startsWith('/purchasing/receive') && !p.startsWith('/purchasing/suppliers')) },
      { label: 'Create purchase order', icon: '＋', path: '/purchasing/new', match: (p) => p === '/purchasing/new' },
      { label: 'Receive stock', icon: '↓', path: '/purchasing/receive', match: (p) => p === '/purchasing/receive' || p.startsWith('/purchasing/receive/') },
      { label: 'Suppliers list and detail', icon: '♙', path: '/purchasing/suppliers', match: (p) => p === '/purchasing/suppliers' || p.startsWith('/purchasing/suppliers/') },
    ],
  },
  {
    label: 'FULFILMENT',
    items: [
      { label: 'Order packing queue', icon: '□', path: '/inventory/packing', match: (p) => p === '/inventory/packing' },
      { label: 'Returns restock', icon: '↶', path: '/inventory/returns', match: (p) => p === '/inventory/returns' || p.startsWith('/inventory/returns/') },
      { label: 'Stock take / cycle count', icon: '✓', path: '/inventory/counts', match: (p) => p === '/inventory/counts' },
    ],
  },
  {
    label: 'STOCK TOOLS',
    items: [
      { label: 'Stock movement history', icon: '⇄', path: '/inventory/movements', match: (p) => p === '/inventory/movements' },
      { label: 'Stock adjustment', icon: '±', path: '/inventory/adjust', match: (p) => p === '/inventory/adjust' },
      { label: 'Bulk import and export', icon: '⇅', path: '/inventory/import', match: (p) => p === '/inventory/import' },
      { label: 'Barcode and label printing', icon: '▥', path: '/inventory/labels', match: (p) => p === '/inventory/labels' },
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
      { label: 'System states', icon: '◌', path: '/system/states', match: (p) => p === '/system/states' },
    ],
  },
]

const ALL = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label))

/** The one permission area each page belongs to. If a role doesn’t have the area, the page and its links are hidden. */
export const PAGE_MODULE: Record<string, string> = {
  // orders and dispatch
  'Dispatch overview': 'Dispatch', 'Order queue': 'Dispatch', 'Assign rider': 'Dispatch', 'Live order detail': 'Dispatch', 'Reassign order': 'Dispatch', 'Delayed and stuck orders': 'Dispatch', 'Cancelled and failed deliveries': 'Dispatch', Orders: 'Orders',
  // catalogue and stock
  'Order packing queue': 'Orders', 'Returns restock': 'Orders',
  Products: 'Products', 'Categories and subcategories': 'Products', Brands: 'Products', 'Bulk import and export': 'Products',
  'Inventory overview': 'Inventory', 'Stock levels by warehouse': 'Inventory', 'Low-stock alerts and reorder settings': 'Inventory', 'Stock take / cycle count': 'Inventory',
  'Stock movement history': 'Inventory', 'Stock adjustment': 'Inventory', 'Barcode and label printing': 'Inventory', 'Receive stock': 'Inventory',
  'Purchase orders list': 'Purchasing', 'Create purchase order': 'Purchasing', 'Suppliers list and detail': 'Purchasing',
  // riders
  'Riders list': 'Riders', 'Rider detail': 'Riders', 'Rider application review': 'Riders', 'Delivery zones': 'Riders', 'Rider shifts and capacity': 'Riders', 'Incidents and SOS alerts': 'Riders', 'Delivery settings': 'Riders',
  // money
  Payments: 'Payments', 'Rider payouts': 'Payments', 'Finance overview': 'Payments', 'Failed payments and retries': 'Payments', Reconciliation: 'Payments', 'Refunds ledger': 'Payments', 'Taxes and VAT report': 'Payments', 'Profit and loss summary': 'Payments',
  'Accounts and ledger': 'Payments', 'COD management': 'Payments', 'Record COD deposit': 'Payments', 'Payout batch': 'Payments', 'Rider earnings statements': 'Payments', 'Store settlements': 'Payments', 'Invoices list': 'Payments',
  'Sales reports': 'Payments', 'Delivery cost report': 'Payments', 'Expense tracking': 'Payments', 'Export center': 'Payments', 'Financial period close': 'Payments', 'Finance settings': 'Payments', 'Payment gateway settings': 'Payments',
  'Payroll runs': 'Payroll', 'Employee pay profiles': 'Payroll', 'Statutory remittances': 'Payroll',
  Reports: 'Reports',
  // customer care
  'Tickets inbox': 'Support', 'Live chat console': 'Support', 'Rider support tickets': 'Support', 'Customer lookup': 'Support', 'Reviews and complaints moderation': 'Support', 'Knowledge base and FAQ editor': 'Support', 'Canned responses manager': 'Support',
  'Refund requests': 'Claims', 'Returns requests': 'Claims', Disputes: 'Claims',
  'Customers list': 'Customers', 'Customer detail': 'Customers',
  // marketing
  'Marketing overview': 'Marketing', 'Coupons list': 'Marketing', 'Flash sales': 'Marketing', 'Promotions and bundles': 'Marketing', 'Campaign analytics': 'Marketing', 'Push notifications': 'Marketing', 'SMS and email campaigns': 'Marketing',
  'Audience segments': 'Marketing', 'Loyalty points rules': 'Marketing', 'Referral program settings': 'Marketing', 'Reviews highlights': 'Marketing', 'Banners manager': 'Marketing', 'Homepage layout builder': 'Marketing', 'Content pages editor': 'Marketing',
  'Category and landing page content': 'Marketing', 'Notification templates': 'Marketing',
  // people, access and system
  'Staff list': 'Staff', 'Add/edit staff': 'Staff', 'Roles and permissions matrix': 'Access', 'Audit log': 'Access', 'Integrations and API keys': 'System', 'System states': 'System', 'Backup and system health': 'System', 'Business settings': 'Settings',
}

/** Customer support only sees the monitoring side of dispatch (not assignment or rider management). */
const SUPPORT_DISPATCH = new Set(['Dispatch overview', 'Live order detail', 'Delayed and stuck orders', 'Cancelled and failed deliveries', 'Incidents and SOS alerts'])
const DISPATCH_PAGES = new Set(['Dispatch overview', 'Order queue', 'Assign rider', 'Live order detail', 'Reassign order', 'Delayed and stuck orders', 'Cancelled and failed deliveries', 'Incidents and SOS alerts'])

/** Can this role open the page? `perms` is that role’s row of the permission matrix. */
export function canOpen(role: string, label: string, perms: Record<string, boolean[]> | undefined): boolean {
  if (label === 'Executive overview') return true
  if (role === 'Owner admin') return true
  if (role === 'Customer support' && label === 'Incidents and SOS alerts') return true
  if (role === 'Customer support' && DISPATCH_PAGES.has(label)) return SUPPORT_DISPATCH.has(label) && !!perms?.Dispatch?.[0]
  const mod = PAGE_MODULE[label]
  return mod ? !!perms?.[mod]?.[0] : false
}

export const ROLE_PAGE_COUNT = (role: string, perms: Record<string, boolean[]> | undefined) => ALL.filter((l) => l !== 'Executive overview' && canOpen(role, l, perms)).length

export const pageFor = (path: string) => NAV_GROUPS.flatMap((g) => g.items).find((i) => i.match(path))

/** Where each department lands, and what that page is called. Everyone else with the Overview permission sees the company overview. */
export function homeOf(role: string, perms: Record<string, boolean[]> | undefined): { path: string; label: string } {
  if (role === 'Owner admin' || perms?.Overview?.[0]) return { path: '/', label: 'Executive overview' }
  switch (role) {
    case 'IT support': return { path: '/', label: 'System overview' }
    case 'Customer support': return { path: '/', label: 'Support overview' }
    case 'Marketing manager': return { path: '/marketing', label: 'Marketing overview' }
    case 'Finance analyst': return { path: '/finance', label: 'Finance overview' }
    case 'Dispatch manager': return { path: '/dispatch', label: 'Dispatch overview' }
    case 'Rider manager': return { path: '/riders', label: 'Riders list' }
    case 'Inventory manager': case 'Warehouse lead': case 'Purchasing agent': return { path: '/stock', label: 'Inventory overview' }
    default: return { path: '/', label: 'Home' }
  }
}

/** The home page is a different page for different people, so its name changes with the role. */
export function displayLabel(label: string, role: string, perms: Record<string, boolean[]> | undefined): string {
  return label === 'Executive overview' ? homeOf(role, perms).label : label
}

/** The roles that can open a page, so a blocked person knows who to ask. */
export function rolesWith(label: string, all: Record<string, Record<string, boolean[]>>): string[] {
  const mod = PAGE_MODULE[label]
  return Object.keys(all).filter((r) => r === 'Owner admin' || (mod ? !!all[r]?.[mod]?.[0] : false))
}
