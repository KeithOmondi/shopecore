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
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'OVERVIEW', items: [{ label: 'Executive overview', icon: '◫', path: '/', match: (p) => p === '/' }] },
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
      { label: 'Payments', icon: '⇄', path: '/payments', match: (p) => p === '/payments' },
      { label: 'Payouts and cash', icon: '◉', path: '/payouts', match: (p) => p === '/payouts' },
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
  Payments: 'Payments', 'Payouts and cash': 'Payments', Reports: 'Reports',
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
