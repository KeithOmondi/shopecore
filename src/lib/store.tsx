import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { setLeavePrompt } from './router'
import * as server from './api'
import { ApiError, type ApiMe } from './api'

import {
  whenLabel,
  ACTIONS, MODULES, ROLES,
  type AuditEntry, type Permissions, type Role, type Staff,
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
  /** The icon beside the title: a warning by default for confirmations, a cross for destructive ones. */
  tone?: 'warning' | 'danger'
}

export interface Maintenance {
  on: boolean
  message: string
  etaMinutes: number
}

export interface DrawerSpec {
  title: string
  body: ReactNode
}

interface Store {
  // shell
  role: Role
  dark: boolean
  toggleDark: () => void
  collapsed: boolean
  toggleCollapsed: () => void
  toast: (message: string, kind?: 'success' | 'error') => void
  toastMessage: string
  toastKind: 'success' | 'error'
  /** The browser lost its connection (or an owner is previewing it). */
  offline: boolean
  setForceOffline: (on: boolean) => void
  maintenance: Maintenance
  setMaintenance: (m: Maintenance) => void
  requestAccess: (what: string) => void
  requestedAccess: string[]
  drawer: DrawerSpec | null
  openDrawer: (d: DrawerSpec) => void
  closeDrawer: () => void
  modal: ModalSpec | null
  openModal: (m: ModalSpec) => void
  closeModal: () => void
  // session
  user: Staff | null
  /** True while we check whether a session cookie is still good (first paint). */
  booting: boolean
  /** Returns an error message, or null when signed in. */
  login: (email: string, password: string) => Promise<string | null>
  logout: () => void
  /** Changes the signed-in person's own password. Returns an error message, or null. */
  changeOwnPassword: (current: string, next: string) => Promise<string | null>
  /** The roles that exist, with their descriptions and how many people hold each. */
  roles: RoleInfo[]
  reloadStaff: () => Promise<void>
  reloadRoles: () => Promise<void>
  saveRole: (name: string, patch: { blurb?: string; permissions?: Permissions }) => Promise<string | null>
  createRole: (name: string, blurb: string, permissions: Permissions) => Promise<string | null>
  deleteRole: (name: string) => Promise<string | null>
  /** Preview as another role (owners only). */
  previewRole: Role | null
  setPreviewRole: (r: Role | null) => void
  can: (module: (typeof MODULES)[number], action: (typeof ACTIONS)[number]) => boolean
  // data
  staff: Staff[]
  /** Creates the account with a temporary password (returned once). */
  addStaff: (s: Omit<Staff, 'id' | 'lastActive' | 'status' | 'mustChange'>) => Promise<{ id: string; temp: string }>
  /** Gives a staff member a new temporary password (returned once). */
  resetPassword: (id: string) => Promise<string>
  /** The signed-in person has chosen their own password after a temporary one. Returns an error message, or null. */
  completeFirstSignIn: (password: string) => Promise<string | null>
  /** Is this the temporary password the person just signed in with? */
  sameAsTemporary: (password: string) => boolean
  /** Only owners and IT support create accounts and reset passwords. */
  canManageStaff: boolean
  /** Returns an error message, or null when it saved. */
  updateStaff: (id: string, patch: Partial<Staff>) => Promise<string | null>
  audit: AuditEntry[]
  log: (action: string, module: string, type?: AuditEntry['type']) => void
  permissions: Record<Role, Permissions>
}

const StoreContext = createContext<Store | null>(null)

export interface RoleInfo { name: string; blurb: string; system: boolean; staffCount: number }

interface ApiStaff { id: string; name: string; email: string; phone: string; role: string; status: 'invited' | 'active' | 'suspended'; mustChangePassword: boolean; lastLoginAt: string | null }
const STATUS: Record<ApiStaff['status'], Staff['status']> = { invited: 'Invited', active: 'Active', suspended: 'Suspended' }
const ago = (iso: string | null) => (iso ? whenLabel(Date.parse(iso)) : '—')
const toStaff = (v: ApiStaff): Staff => ({ id: v.id, name: v.name, email: v.email, phone: v.phone, role: v.role, status: STATUS[v.status], lastActive: ago(v.lastLoginAt), mustChange: v.mustChangePassword })
const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const auditType = (action: string, module: string): AuditEntry['type'] =>
  /refund/i.test(action) ? 'Refund' : /backup/i.test(action) ? 'Backup' : /password|signed|suspend|reactivat|session|locked/i.test(action) ? 'Security' : /role|permission|account|access|owner/i.test(action) || module === 'Access' ? 'Access' : 'Updated'

const readDark = () => {
  try {
    // The dark brown finish is the default; people who switched to light keep light.
    return localStorage.getItem('shopcore-admin-dark') !== '0'
  } catch {
    return true
  }
}

/** The admin's shared state: who is signed in and what they may do, plus small interface state. Everything else is loaded by the pages from the server. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<ApiMe | null>(null)
  const [booting, setBooting] = useState(true)
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [roleMatrices, setRoleMatrices] = useState<Record<string, Permissions>>({})
  const [previewRole, setPreviewRole] = useState<Role | null>(null)
  const [dark, setDark] = useState(readDark)
  const [collapsed, setCollapsed] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success')
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [forceOffline, setForceOffline] = useState(false)
  const [requestedAccess, setRequestedAccess] = useState<string[]>([])
  const [maintenance, setMaintenanceState] = useState<Maintenance>({ on: false, message: '', etaMinutes: 15 })
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [drawer, setDrawer] = useState<DrawerSpec | null>(null)
  const [modal, setModal] = useState<ModalSpec | null>(null)

  const [staff, setStaff] = useState<Staff[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])

  const tempRef = useRef('')
  const user: Staff | null = me ? toStaff({ ...me, lastLoginAt: me.lastLoginAt }) : null
  const role = (previewRole ?? me?.role ?? ROLES[0]) as Role
  const permissions = useMemo(() => {
    const own = me ? { [me.role]: me.permissions as Permissions } : {}
    return { ...own, ...roleMatrices, ...(me ? { [me.role]: me.permissions as Permissions } : {}) } as Record<Role, Permissions>
  }, [me, roleMatrices])

  const reloadStaff = useCallback(async () => {
    try { setStaff(((await server.get<{ items: ApiStaff[] }>('/v1/staff')).items).map(toStaff)) } catch { /* this role may not see the team */ }
  }, [])
  const reloadRoles = useCallback(async () => {
    try {
      const r = (await server.get<{ items: (RoleInfo & { permissions: Permissions })[] }>('/v1/roles')).items
      setRoles(r.map(({ permissions: _p, ...info }) => info))
      setRoleMatrices(Object.fromEntries(r.map((x) => [x.name, x.permissions])))
    } catch { /* this role may not see roles */ }
  }, [])
  const reloadAudit = useCallback(async () => {
    try {
      const r = await server.get<{ items: { id: string; actor: string; action: string; module: string; at: string }[] }>('/v1/audit?limit=50')
      setAudit(r.items.map((a) => ({ id: a.id, user: a.actor, action: a.action, module: a.module, at: Date.parse(a.at), when: whenLabel(Date.parse(a.at)), type: auditType(a.action, a.module) })))
    } catch { /* this role may not see the audit log */ }
  }, [])

  /** Everything a signed-in person's pages start from. */
  const signedIn = useCallback((who: ApiMe, mustChangeNow: boolean) => {
    setMe(who)
    setPreviewRole(null)
    if (mustChangeNow) return
    void reloadStaff()
    void reloadRoles()
    void reloadAudit()
  }, [reloadStaff, reloadRoles, reloadAudit])

  // First paint: is there a session cookie that is still good?
  useEffect(() => {
    let live = true
    server.setSignedOutHandler(() => { setMe(null); setStaff([]); setRoles([]); setRoleMatrices({}); setAudit([]); setDrawer(null); setModal(null) })
    server.restoreSession().then((r) => { if (live && r) signedIn(r.me, r.mustChange) }).finally(() => { if (live) setBooting(false) })
    return () => { live = false; server.setSignedOutHandler(null) }
  }, [signedIn])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const r = await server.signIn(email, password)
      tempRef.current = r.mustChange ? password : ''
      signedIn(r.me, r.mustChange)
      return null
    } catch (e) { return message(e) }
  }, [signedIn])
  const logout = useCallback(() => {
    void server.signOut()
    setMe(null); setStaff([]); setRoles([]); setRoleMatrices({}); setAudit([])
    setPreviewRole(null)
    setDrawer(null)
    setModal(null)
  }, [])
  const can = useCallback((m: (typeof MODULES)[number], a: (typeof ACTIONS)[number]) => !!permissions[role]?.[m]?.[ACTIONS.indexOf(a)], [permissions, role])

  const changeOwnPassword = useCallback(async (current: string, next: string) => {
    try { await server.changePassword(current, next); return null } catch (e) { return message(e) }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('dark', dark)
    try {
      localStorage.setItem('shopcore-admin-dark', dark ? '1' : '0')
    } catch {
      /* private mode: the theme just won't be remembered */
    }
  }, [dark])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])


  const toast = useCallback((message: string, kind?: 'success' | 'error') => {
    // Messages that explain why something didn't happen read as errors even when the caller didn't say so.
    const looksWrong = /(^(Enter|Choose|Add|Fix|Check|Select|Pick|Write|Name|Describe|Use|Give|Count|Pack|Mark all|Turn on) )|can’t|cannot|couldn’t|failed|not enough|no access|isn’t|doesn’t|already|must be|needs? /i.test(message)
    setToastKind(kind ?? (looksWrong ? 'error' : 'success'))
    setToastMessage(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMessage(''), 2400)
  }, [])

  // Maintenance mode is the shop's real setting: it also stops the shopper app, so it lives on the server.
  const setMaintenance = useCallback((m: Maintenance) => {
    setMaintenanceState(m)
    void server.put('/v1/admin/app-status', { maintenance: m.on, message: m.message, returnAt: m.on ? new Date(Date.now() + m.etaMinutes * 60_000).toISOString() : null }).catch(() => {
      setMaintenanceState((cur) => ({ ...cur, on: !m.on }))
      toast('We couldn’t change maintenance mode. Check your permissions and try again.', 'error')
    })
  }, [toast])
  useEffect(() => {
    if (!me) return
    let live = true
    void server.get<{ maintenance: boolean; message: string; returnAt: string | null }>('/v1/admin/app-status').then((a) => {
      if (live) setMaintenanceState({ on: a.maintenance, message: a.message, etaMinutes: a.returnAt ? Math.max(1, Math.round((Date.parse(a.returnAt) - Date.now()) / 60_000)) : 15 })
    }, () => undefined)
    return () => { live = false }
  }, [me])

  useEffect(() => {
    setLeavePrompt((proceed) => setModal({ title: 'Discard unsaved changes?', message: 'Your edits haven’t been saved. If you leave now, they will be lost.', confirm: 'Discard changes', cancelLabel: 'Keep editing', tone: 'warning', onConfirm: proceed }))
    return () => setLeavePrompt(null)
  }, [])

  // Connected modules are audited by the server itself; this only exists for pages that are not connected yet.
  const log = useCallback((_action: string, _module: string, _type: AuditEntry['type'] = 'Updated') => {}, [])

  const requestAccess = useCallback((what: string) => {
    setRequestedAccess((l) => (l.includes(what) ? l : [...l, what]))
    log(`Asked for access to ${what}`, 'Access', 'Access')
    toast('Access request sent to your workspace owner', 'success')
  }, [log, toast])

  const addStaff = useCallback(async (s: Omit<Staff, 'id' | 'lastActive' | 'status' | 'mustChange'>) => {
    const out = await server.post<{ staff: ApiStaff; temporaryPassword: string }>('/v1/staff', { name: s.name, email: s.email, phone: s.phone, role: s.role })
    await reloadStaff()
    void reloadRoles()
    return { id: out.staff.id, temp: out.temporaryPassword }
  }, [reloadStaff, reloadRoles])
  const resetPassword = useCallback(async (id: string) => {
    const out = await server.post<{ temporaryPassword: string }>(`/v1/staff/${id}/reset-password`)
    await reloadStaff()
    return out.temporaryPassword
  }, [reloadStaff])
  const completeFirstSignIn = useCallback(async (password: string) => {
    try {
      await server.changePassword(tempRef.current, password)
      tempRef.current = ''
      const r = await server.get<ApiMe>('/v1/me')
      signedIn(r, false)
      return null
    } catch (e) { return message(e) }
  }, [signedIn])
  const sameAsTemporary = useCallback((pw: string) => !!tempRef.current && pw === tempRef.current, [])
  const canManageStaff = user?.role === 'Owner admin' || user?.role === 'IT support'
  const updateStaff = useCallback(async (id: string, patch: Partial<Staff>) => {
    try {
      const body: Record<string, unknown> = {}
      if (patch.name !== undefined) body.name = patch.name
      if (patch.phone !== undefined) body.phone = patch.phone
      if (patch.role !== undefined) body.role = patch.role
      if (patch.status === 'Suspended') body.status = 'suspended'
      else if (patch.status === 'Active') body.status = 'active'
      if (id === me?.id) {
        await server.patch('/v1/me', { ...(body.name !== undefined ? { name: body.name } : {}), ...(body.phone !== undefined ? { phone: body.phone } : {}) })
        signedIn(await server.get<ApiMe>('/v1/me'), false)
      } else await server.patch(`/v1/staff/${id}`, body)
      await reloadStaff()
      void reloadRoles()
      return null
    } catch (e) { return message(e) }
  }, [me, reloadStaff, reloadRoles, signedIn])

  const saveRole = useCallback(async (name: string, patch: { blurb?: string; permissions?: Permissions }) => {
    try { await server.patch(`/v1/roles/${encodeURIComponent(name)}`, patch); await reloadRoles(); return null } catch (e) { return message(e) }
  }, [reloadRoles])
  const createRole = useCallback(async (name: string, blurb: string, perms: Permissions) => {
    try { await server.post('/v1/roles', { name, blurb, permissions: perms }); await reloadRoles(); return null } catch (e) { return message(e) }
  }, [reloadRoles])
  const deleteRole = useCallback(async (name: string) => {
    try { await server.del(`/v1/roles/${encodeURIComponent(name)}`); await reloadRoles(); return null } catch (e) { return message(e) }
  }, [reloadRoles])


  const value = useMemo<Store>(
    () => ({
      role, user, booting, login, logout, changeOwnPassword, roles, reloadStaff, reloadRoles, saveRole, createRole, deleteRole, previewRole, setPreviewRole, can, dark, toggleDark: () => setDark((d) => !d), collapsed, toggleCollapsed: () => setCollapsed((c) => !c), toast, toastMessage, toastKind, offline: !online || forceOffline, setForceOffline, maintenance, setMaintenance, requestAccess, requestedAccess,
      drawer, openDrawer: setDrawer, closeDrawer: () => setDrawer(null), modal, openModal: setModal, closeModal: () => setModal(null),
      staff, addStaff, resetPassword, completeFirstSignIn, sameAsTemporary, canManageStaff, updateStaff, audit, log, permissions,
    }),
    [role, user, booting, login, logout, changeOwnPassword, roles, reloadStaff, reloadRoles, saveRole, createRole, deleteRole, previewRole, can, dark, collapsed, toast, toastMessage, toastKind, online, forceOffline, maintenance, setMaintenance, requestAccess, requestedAccess, drawer, modal, staff, addStaff, resetPassword, completeFirstSignIn, sameAsTemporary, canManageStaff, updateStaff, audit, log, permissions],
  )

  return <StoreContext value={value}>{children}</StoreContext>
}

export function useStore(): Store {
  const ctx = use(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
