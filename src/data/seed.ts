/** Access-control vocabulary and small helpers shared by the staff and access pages. Nothing here is sample data. */

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-US')}`

export const ROLES = ['Owner admin', 'Operations manager', 'Dispatch manager', 'Finance analyst', 'Customer support', 'Rider manager', 'IT support', 'Marketing manager', 'Inventory manager', 'Warehouse lead', 'Purchasing agent'] as const
export type Role = (typeof ROLES)[number]

export const MODULES = ['Overview', 'Orders', 'Dispatch', 'Products', 'Customers', 'Riders', 'Payments', 'Payroll', 'Reports', 'Support', 'Claims', 'Marketing', 'Inventory', 'Purchasing', 'Staff', 'Access', 'System', 'Settings'] as const
export const ACTIONS = ['View', 'Create', 'Edit', 'Delete', 'Export'] as const
export type Module = (typeof MODULES)[number]
export type Permissions = Record<Module, boolean[]>

export type StaffStatus = 'Active' | 'Invited' | 'Suspended'

export interface Staff {
  id: string
  name: string
  email: string
  phone: string
  role: string
  status: StaffStatus
  lastActive: string
  /** Signed in with a temporary password: must choose their own before using the admin. */
  mustChange?: boolean
}

export const TOTAL_SEATS = 20

export interface AuditEntry {
  id: string
  user: string
  action: string
  module: string
  when: string
  at: number
  type: 'Updated' | 'Security' | 'Refund' | 'Access' | 'Backup'
}

export const whenLabel = (ms: number) => {
  const d = new Date(ms)
  const today = new Date()
  const y = new Date(Date.now() - 86_400_000)
  const hh = d.getHours()
  const time = `${hh % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`
  const day = d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${day}, ${time}`
}
