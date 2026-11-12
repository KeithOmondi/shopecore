import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { seedFailures, seedIncidents, seedShifts, type Failure, type Incident, type Shift } from '../data/ops'
import {
  CATEGORIES, seedDeposits, seedOrders, seedPayouts, seedProducts, seedRiders, transactionsFrom,
  type CashDeposit, type Order, type Payout, type Product, type Rider, type Transaction,
} from '../data/commerce'
import {
  ACTIONS, MODULES, BUSINESS_DEFAULTS, PAYMENT_DEFAULTS, ROLES, seedAudit, seedBackups, seedCustomers, seedIntegrations, seedKeys, seedPermissions, seedStaff, seedTemplates, seedZones,
  whenLabel, type ApiKey, type AuditEntry, type Backup, type Customer, type Integration, type Permissions, type Role, type Staff, type Template, type Zone,
} from '../data/seed'

export interface ModalSpec {
  title: string
  message?: string
  body?: ReactNode
  confirm?: string
  danger?: boolean
  /** Return false to keep the dialog open. */
  onConfirm?: () => void | boolean
  cancelLabel?: string
  /** The body supplies its own buttons (forms). */
  noActions?: boolean
}

export interface DrawerSpec {
  title: string
  body: ReactNode
}

type Business = typeof BUSINESS_DEFAULTS
type Payments = typeof PAYMENT_DEFAULTS

interface Store {
  // shell
  role: Role
  dark: boolean
  toggleDark: () => void
  collapsed: boolean
  toggleCollapsed: () => void
  toast: (message: string) => void
  toastMessage: string
  drawer: DrawerSpec | null
  openDrawer: (d: DrawerSpec) => void
  closeDrawer: () => void
  modal: ModalSpec | null
  openModal: (m: ModalSpec) => void
  closeModal: () => void
  // session
  user: Staff | null
  login: (email: string, password: string) => string | null
  logout: () => void
  passwords: Record<string, string>
  setPassword: (email: string, password: string) => void
  /** Preview as another role (owners only). */
  previewRole: Role | null
  setPreviewRole: (r: Role | null) => void
  can: (module: (typeof MODULES)[number], action: (typeof ACTIONS)[number]) => boolean
  // commerce
  orders: Order[]
  setOrders: (o: Order[]) => void
  products: Product[]
  setProducts: (p: Product[]) => void
  categories: string[]
  setCategories: (c: string[]) => void
  riders: Rider[]
  setRiders: (r: Rider[]) => void
  transactions: Transaction[]
  payouts: Payout[]
  setPayouts: (p: Payout[]) => void
  deposits: CashDeposit[]
  setDeposits: (d: CashDeposit[]) => void
  failures: Failure[]
  setFailures: (f: Failure[]) => void
  incidents: Incident[]
  setIncidents: (i: Incident[]) => void
  shifts: Shift[]
  setShifts: (s: Shift[]) => void
  /** Put a rider on an order (or take them off with null). */
  assignRider: (orderId: string, riderId: string | null, note?: string) => void
  // data
  staff: Staff[]
  /** Creates the account with a temporary password (returned once). */
  addStaff: (s: Omit<Staff, 'id' | 'lastActive' | 'status' | 'mustChange'>) => { id: string; temp: string }
  /** Gives a staff member a new temporary password (returned once). */
  resetPassword: (id: string) => string
  /** The signed-in person has chosen their own password after a temporary one. */
  completeFirstSignIn: (password: string) => void
  /** Only owners and IT support create accounts and reset passwords. */
  canManageStaff: boolean
  updateStaff: (id: string, patch: Partial<Staff>) => void
  customers: Customer[]
  addNote: (customerId: string, text: string) => void
  updateCustomer: (id: string, patch: Partial<Customer>) => void
  audit: AuditEntry[]
  log: (action: string, module: string, type?: AuditEntry['type']) => void
  permissions: Record<Role, Permissions>
  setPermissions: (role: Role, p: Permissions) => void
  zones: Zone[]
  setZones: (z: Zone[]) => void
  business: Business
  setBusiness: (b: Business) => void
  payments: Payments
  setPayments: (p: Payments) => void
  templates: Template[]
  setTemplates: (t: Template[]) => void
  integrations: Integration[]
  setIntegrations: (i: Integration[]) => void
  keys: ApiKey[]
  setKeys: (k: ApiKey[]) => void
  backups: Backup[]
  addBackup: (type: Backup['type']) => void
  autoBackup: boolean
  setAutoBackup: (on: boolean) => void
}

const StoreContext = createContext<Store | null>(null)

export const DEMO_PASSWORD = 'ShopCore#2025'

/** A one-time password: 12 characters with upper, lower, digit and symbol. */
function tempPassword() {
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]!
  const rest = Array.from({ length: 8 }, () => pick('abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'))
  return [pick('ABCDEFGHJKLMNPQRSTUVWXYZ'), pick('abcdefghjkmnpqrstuvwxyz'), pick('23456789'), pick('#@$%!'), ...rest].sort(() => Math.random() - 0.5).join('')
}

const readUser = () => {
  try {
    return sessionStorage.getItem('shopcore-admin-user')
  } catch {
    return null
  }
}

const readDark = () => {
  try {
    return localStorage.getItem('shopcore-admin-dark') === '1'
  } catch {
    return false
  }
}

/** All the admin's in-memory state for the dummy-data phase. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(readUser)
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const setPassword = useCallback((email: string, pw: string) => setPasswords((p) => ({ ...p, [email]: pw })), [])
  const [previewRole, setPreviewRole] = useState<Role | null>(null)
  const [dark, setDark] = useState(readDark)
  const [collapsed, setCollapsed] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [drawer, setDrawer] = useState<DrawerSpec | null>(null)
  const [modal, setModal] = useState<ModalSpec | null>(null)

  const [staff, setStaff] = useState(seedStaff)
  const [orders, setOrders] = useState(seedOrders)
  const [failures, setFailures] = useState(seedFailures)
  const [incidents, setIncidents] = useState(seedIncidents)
  const [shifts, setShifts] = useState(() => seedShifts(seedRiders().filter((r) => r.status === 'Online').map((r) => r.id), ['Westlands', 'Kilimani', 'CBD', 'Karen']))
  const [products, setProducts] = useState(seedProducts)
  const [categories, setCategories] = useState<string[]>([...CATEGORIES])
  const [riders, setRiders] = useState(seedRiders)
  const [payouts, setPayouts] = useState(() => seedPayouts(seedRiders()))
  const [deposits, setDeposits] = useState(() => seedDeposits(seedRiders()))
  const [customers, setCustomers] = useState(seedCustomers)
  const [audit, setAudit] = useState(seedAudit)
  const [permissions, setPermissionsState] = useState(seedPermissions)
  const [zones, setZones] = useState(seedZones)
  const [business, setBusiness] = useState<Business>(BUSINESS_DEFAULTS)
  const [payments, setPayments] = useState<Payments>(PAYMENT_DEFAULTS)
  const [templates, setTemplates] = useState(seedTemplates)
  const [integrations, setIntegrations] = useState(seedIntegrations)
  const [keys, setKeys] = useState(seedKeys)
  const [backups, setBackups] = useState(seedBackups)
  const [autoBackup, setAutoBackup] = useState(true)

  const user = staff.find((x) => x.id === userId && x.status !== 'Suspended') ?? null
  const role = (previewRole ?? (user?.role as Role | undefined) ?? ROLES[0]) as Role
  const transactions = useMemo(() => transactionsFrom(orders), [orders])

  const login = useCallback(
    (email: string, password: string) => {
      const u = staff.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
      if (!u || password !== (passwords[u.email] ?? DEMO_PASSWORD)) return 'Incorrect email or password.'
      if (u.status === 'Suspended') return 'This account is suspended. Contact a workspace owner.'
      setUserId(u.id)
      setPreviewRole(null)
      try {
        sessionStorage.setItem('shopcore-admin-user', u.id)
      } catch {
        /* session just won't survive a refresh */
      }
      return null
    },
    [staff, passwords],
  )
  const logout = useCallback(() => {
    setUserId(null)
    setPreviewRole(null)
    setDrawer(null)
    setModal(null)
    try {
      sessionStorage.removeItem('shopcore-admin-user')
    } catch {
      /* nothing stored */
    }
  }, [])
  const can = useCallback((m: (typeof MODULES)[number], a: (typeof ACTIONS)[number]) => !!permissions[role]?.[m]?.[ACTIONS.indexOf(a)], [permissions, role])

  useEffect(() => {
    document.body.classList.toggle('dark', dark)
    try {
      localStorage.setItem('shopcore-admin-dark', dark ? '1' : '0')
    } catch {
      /* private mode: the theme just won't be remembered */
    }
  }, [dark])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const toast = useCallback((message: string) => {
    setToastMessage(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMessage(''), 2400)
  }, [])

  const userName = staff.find((x) => x.id === userId)?.name ?? 'Amara Mwangi'
  const log = useCallback((action: string, module: string, type: AuditEntry['type'] = 'Updated') => {
    const at = Date.now()
    setAudit((a) => [{ id: `a${at}`, user: userName, action, module, at, when: whenLabel(at), type }, ...a])
  }, [userName])

  const addStaff = useCallback(
    (s: Omit<Staff, 'id' | 'lastActive' | 'status' | 'mustChange'>) => {
      const id = `s${Date.now()}`
      const temp = tempPassword()
      setStaff((list) => [...list, { ...s, id, status: 'Invited', lastActive: '—', mustChange: true }])
      setPasswords((p) => ({ ...p, [s.email]: temp }))
      log(`Created staff account · ${s.name}`, 'Staff', 'Access')
      return { id, temp }
    },
    [log],
  )
  const resetPassword = useCallback(
    (id: string) => {
      const target = staff.find((x) => x.id === id)
      const temp = tempPassword()
      if (target) {
        setPasswords((p) => ({ ...p, [target.email]: temp }))
        setStaff((list) => list.map((x) => (x.id === id ? { ...x, mustChange: true } : x)))
        log(`Reset password · ${target.name}`, 'Staff', 'Security')
      }
      return temp
    },
    [staff, log],
  )
  const completeFirstSignIn = useCallback(
    (password: string) => {
      if (!user) return
      setPasswords((p) => ({ ...p, [user.email]: password }))
      setStaff((list) => list.map((x) => (x.id === user.id ? { ...x, mustChange: false, status: 'Active', lastActive: 'Today' } : x)))
      log('Chose a new password', 'Staff', 'Security')
    },
    [user, log],
  )
  const canManageStaff = user?.role === 'Owner admin' || user?.role === 'IT support'
  const updateStaff = useCallback((id: string, patch: Partial<Staff>) => setStaff((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s))), [])

  const addNote = useCallback((customerId: string, text: string) => {
    const at = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    setCustomers((list) => list.map((c) => (c.id === customerId ? { ...c, notes: [{ by: 'Amara', text, at }, ...c.notes] } : c)))
  }, [])

  const updateCustomer = useCallback((id: string, patch: Partial<Customer>) => setCustomers((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c))), [])
  const assignRider = useCallback(
    (orderId: string, riderId: string | null, note?: string) => {
      const at = Date.now()
      const name = riderId ? riders.find((r) => r.id === riderId)?.name : undefined
      setOrders((list) =>
        list.map((o) => {
          if (o.id !== orderId) return o
          const status = riderId && o.status === 'Pending' ? 'Processing' : o.status
          const events = [...o.events]
          if (status !== o.status) events.push({ status, at, by: userName })
          events.push({ status: 'Note', at, by: userName, note: riderId ? `Assigned to ${name}${note ? ` · ${note}` : ''}` : 'Rider removed' })
          return { ...o, riderId, status, events, alert: riderId === o.riderId ? o.alert : undefined }
        }),
      )
    },
    [riders, userName],
  )
  const setPermissions = useCallback((r: Role, p: Permissions) => setPermissionsState((all) => ({ ...all, [r]: p })), [])

  const addBackup = useCallback(
    (type: Backup['type']) => {
      const d = new Date()
      const when = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} EAT`
      setBackups((b) => [{ id: `b${Date.now()}`, when, type, size: '1.2 GB', duration: '4m 12s', status: 'Complete' }, ...b])
      log(`${type} backup completed`, 'System health', 'Backup')
    },
    [log],
  )

  const value = useMemo<Store>(
    () => ({
      role, user, login, logout, passwords, setPassword, previewRole, setPreviewRole, can, orders, setOrders, failures, setFailures, incidents, setIncidents, shifts, setShifts, assignRider, products, setProducts, categories, setCategories, riders, setRiders, transactions, payouts, setPayouts, deposits, setDeposits, dark, toggleDark: () => setDark((d) => !d), collapsed, toggleCollapsed: () => setCollapsed((c) => !c), toast, toastMessage,
      drawer, openDrawer: setDrawer, closeDrawer: () => setDrawer(null), modal, openModal: setModal, closeModal: () => setModal(null),
      staff, addStaff, resetPassword, completeFirstSignIn, canManageStaff, updateStaff, customers, addNote, updateCustomer, audit, log, permissions, setPermissions, zones, setZones, business, setBusiness, payments, setPayments,
      templates, setTemplates, integrations, setIntegrations, keys, setKeys, backups, addBackup, autoBackup, setAutoBackup,
    }),
    [role, user, login, logout, passwords, setPassword, previewRole, can, orders, failures, incidents, shifts, assignRider, products, categories, riders, transactions, payouts, deposits, dark, collapsed, toast, toastMessage, drawer, modal, staff, addStaff, resetPassword, completeFirstSignIn, canManageStaff, updateStaff, customers, addNote, updateCustomer, audit, log, permissions, setPermissions, zones, business, payments, templates, integrations, keys, backups, addBackup, autoBackup],
  )

  return <StoreContext value={value}>{children}</StoreContext>
}

export function useStore(): Store {
  const ctx = use(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
