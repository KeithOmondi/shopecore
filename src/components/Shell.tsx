import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { useFocusTrap } from '../lib/focus-trap'

import { ROLES, type Role } from '../data/seed'
import { canOpen, displayLabel, navigate, NAV_GROUPS, pageFor, ROLE_PAGE_COUNT, usePath } from '../lib/router'
import { useStore } from '../lib/store'
import { useSupport } from '../lib/support'
import { AvatarTile, Badge, Btn, Notice, SettingRow } from './ui'

const nameInitials = (n: string) => n.split(/s+/).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase()

export function Sidebar() {
  const { role, collapsed, toggleCollapsed, permissions, user } = useStore()
  const path = usePath()
  const allowed = { has: (label: string) => canOpen(role, label, permissions[role]) }
  const { tickets, chats } = useSupport()
  const counts = { tickets: tickets.filter((t) => t.kind === 'Customer' && t.status !== 'Resolved').length, chats: chats.filter((c) => !c.closed).reduce((n, c) => n + c.unread, 0) }

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">S</span>
        <span className="brand-name">ShopCore Admin</span>
        <button className="collapse-btn" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title="Collapse sidebar">‹</button>
      </div>
      <div className="nav-scroll">
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter((i) => allowed.has(i.label))
          if (!items.length) return null
          return (
            <section className="nav-group" key={g.label}>
              <div className="nav-label">{g.label}</div>
              <div className="nav">
                {items.map((i) => (
                  <button key={i.label} className={i.match(path) ? 'active' : ''} aria-current={i.match(path) ? 'page' : undefined} aria-label={displayLabel(i.label, role, permissions[role])} title={displayLabel(i.label, role, permissions[role])} onClick={() => navigate(i.path)}>
                    <span className="ic" aria-hidden="true">{i.icon}</span>
                    <span className="nav-text">{displayLabel(i.label, role, permissions[role])}</span>
                    {i.badge && counts[i.badge] > 0 && <span className="nav-count">{counts[i.badge]}</span>}
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <div className="sidebar-foot">
        <div className="workspace">
          <span className="avatar">{nameInitials(user?.name ?? 'Amara Mwangi')}</span>
          <div>
            <strong>{user?.name ?? 'Amara Mwangi'}</strong>
            <small>{user?.role ?? 'Workspace owner'}</small>
          </div>
        </div>
      </div>
    </aside>
  )
}

export function Topbar() {
  const { role, dark, toggleDark, openDrawer, toast, customers, staff, orders, products, riders, permissions, user } = useStore()
  const path = usePath()
  const [q, setQ] = useState('')

  const search = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const needle = q.trim().toLowerCase()
    if (!needle) return toast('Enter a search term')
    const c = customers.filter((x) => `${x.name} ${x.email} ${x.phone}`.toLowerCase().includes(needle)).slice(0, 6)
    const s = staff.filter((x) => `${x.name} ${x.email} ${x.role}`.toLowerCase().includes(needle)).slice(0, 6)
    const pages = NAV_GROUPS.flatMap((g) => g.items).filter((i) => canOpen(role, i.label, permissions[role]) && i.label.toLowerCase().includes(needle))
    const o = canOpen(role, 'Orders', permissions[role]) ? orders.filter((x) => `${x.id} ${x.customer}`.toLowerCase().includes(needle)).slice(0, 6) : []
    const pr = canOpen(role, 'Products', permissions[role]) ? products.filter((x) => `${x.name} ${x.sku}`.toLowerCase().includes(needle)).slice(0, 6) : []
    const rd = canOpen(role, 'Riders', permissions[role]) ? riders.filter((x) => `${x.name} ${x.plate}`.toLowerCase().includes(needle)).slice(0, 6) : []
    openDrawer({
      title: `Results for “${q.trim()}”`,
      body: (
        <ResultList
          groups={[
            { title: 'Pages', rows: pages.map((p) => ({ key: p.label, label: p.label, sub: '', go: p.path })) },
            { title: 'Customers', rows: c.map((x) => ({ key: x.id, label: x.name, sub: x.email, go: `/customers/${x.id}` })) },
            { title: 'Staff', rows: s.map((x) => ({ key: x.id, label: x.name, sub: x.role, go: `/staff/${x.id}` })) },
            { title: 'Orders', rows: o.map((x) => ({ key: x.id, label: x.id, sub: `${x.customer} · ${x.status}`, go: `/orders/${x.id}` })) },
            { title: 'Products', rows: pr.map((x) => ({ key: x.id, label: x.name, sub: x.sku, go: `/products/${x.id}` })) },
            { title: 'Riders', rows: rd.map((x) => ({ key: x.id, label: x.name, sub: `${x.vehicle} · ${x.zone}`, go: `/riders/${x.id}` })) },
          ]}
        />
      ),
    })
  }

  return (
    <header className="topbar">
      <div className="crumb">
        <span>ShopCore</span>
        <span style={{ padding: '0 7px', color: '#D1D5DB' }}>/</span>
        <b>{displayLabel(pageFor(path)?.label ?? (path === '/account' ? 'My account' : 'Not found'), role, permissions[role])}</b>
      </div>
      <div className="top-actions">
        <label className="global-search">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Global search" placeholder="Search anything..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={search} />
        </label>
        {user?.role === 'Owner admin' ? (
          <button className="role-badge" style={{ cursor: 'pointer' }} onClick={() => openDrawer({ title: 'Preview as another role', body: <RoleSwitcher /> })} aria-label={`Viewing as ${role}. Switch role`}>
            {role}
          </button>
        ) : (
          <span className="role-badge">{role}</span>
        )}
        <button className="icon-btn" onClick={toggleDark} aria-label="Toggle dark mode" title="Toggle dark mode">{dark ? '☼' : '◐'}</button>
        <button className="icon-btn" onClick={() => openDrawer({ title: 'Notifications', body: <Notifications /> })} aria-label="Open notifications" title="Notifications">
          ♧<i className="notice-dot" />
        </button>
        <button className="user-trigger" onClick={() => openDrawer({ title: 'Account menu', body: <AccountMenu /> })} aria-label="Open user menu">
          <span className="avatar">{nameInitials(user?.name ?? 'Amara Mwangi')}</span>
          <span>{(user?.name ?? 'Amara').split(' ')[0]}</span>
        </button>
      </div>
    </header>
  )
}

function ResultList({ groups }: { groups: { title: string; rows: { key: string; label: string; sub: string; go: string }[] }[] }) {
  const { closeDrawer } = useStore()
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  if (!total) return <Notice>No matches. Try a name, an email or a page title.</Notice>
  return (
    <>
      {groups.filter((g) => g.rows.length).map((g) => (
        <div key={g.title} style={{ marginBottom: 14 }}>
          <div className="nav-label" style={{ paddingLeft: 0 }}>{g.title}</div>
          {g.rows.map((r) => (
            <div className="list-row" key={r.key}>
              <span>
                <strong style={{ fontSize: 11, display: 'block' }}>{r.label}</strong>
                {r.sub && <small className="panel-sub">{r.sub}</small>}
              </span>
              <Btn small onClick={() => { closeDrawer(); navigate(r.go) }}>Open</Btn>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function Notifications() {
  const { closeDrawer, integrations, staff } = useStore()
  const degraded = integrations.filter((i) => i.status !== 'Connected')
  const invites = staff.filter((s) => s.status === 'Invited')
  const go = (p: string) => () => { closeDrawer(); navigate(p) }
  return (
    <>
      {degraded.map((i) => (
        <SettingRow key={i.id} title={`${i.name} is ${i.status.toLowerCase()}`} sub={i.note} right={<Btn small onClick={go('/integrations')}>Review</Btn>} />
      ))}
      {invites.length > 0 && <SettingRow title={`${invites.length} staff haven’t signed in yet`} sub={invites.map((s) => s.name).join(', ')} right={<Btn small onClick={go('/staff')}>View</Btn>} />}
      <SettingRow title="Backup completed" sub="Today at 02:00 EAT · 1.2 GB" right={<Badge>Complete</Badge>} />
      {!degraded.length && !invites.length && <Notice mark="✓" tone="success">You’re all caught up.</Notice>}
    </>
  )
}

function AccountMenu() {
  const { dark, toggleDark, closeDrawer, openDrawer, role, user, logout, toast, previewRole, setPreviewRole } = useStore()
  const go = (p: string) => () => { closeDrawer(); navigate(p) }
  return (
    <>
      <div className="list-row" style={{ paddingTop: 0 }}>
        <div className="list-main">
          <AvatarTile text={nameInitials(user?.name ?? 'Amara Mwangi')} size={40} />
          <span>
            <strong>{user?.name}</strong>
            <small>{user?.email} · {user?.role}</small>
          </span>
        </div>
      </div>
      <SettingRow title="My account" sub="Profile, password and sessions" right={<Btn small onClick={go('/account')}>Open</Btn>} />
      {user?.role === 'Owner admin' && <SettingRow title="Viewing as" sub="Preview the admin as another role" right={<Btn small onClick={() => openDrawer({ title: 'Preview as another role', body: <RoleSwitcher /> })}>{role}</Btn>} />}
      {previewRole && <SettingRow title="Stop previewing" sub="Go back to your own role" right={<Btn small onClick={() => { setPreviewRole(null); closeDrawer(); toast('Back to your own role') }}>Stop</Btn>} />}
      <SettingRow title="Dark mode" sub="Easier on the eyes at night" right={<Btn small onClick={toggleDark}>{dark ? 'Turn off' : 'Turn on'}</Btn>} />
      <SettingRow title="Audit log" sub="See what you and your team changed" right={<Btn small onClick={go('/audit')}>Open</Btn>} />
      <div style={{ marginTop: 16 }}>
        <Btn variant="danger" onClick={() => { closeDrawer(); logout(); toast('Signed out') }}>Sign out</Btn>
      </div>
    </>
  )
}

function RoleSwitcher() {
  const { role, setPreviewRole, closeDrawer, toast, permissions } = useStore()
  const [choice, setChoice] = useState<Role>(role)
  return (
    <>
      <Notice>Preview the admin as another role. Menu items the role can’t open are hidden.</Notice>
      <div style={{ margin: '14px 0' }}>
        {ROLES.map((r) => (
          <label key={r} className="setting-row" style={{ cursor: 'pointer' }}>
            <span>
              <strong>{r}</strong>
              <small>{ROLE_PAGE_COUNT(r, permissions[r])} pages</small>
            </span>
            <input type="radio" name="role" className="table-check" checked={choice === r} onChange={() => setChoice(r)} />
          </label>
        ))}
      </div>
      <Btn
        variant="primary"
        onClick={() => {
          setPreviewRole(choice === 'Owner admin' ? null : choice)
          closeDrawer()
          toast(`Now viewing as ${choice}`)
        }}>
        Switch role
      </Btn>
    </>
  )
}

export function Drawer() {
  const { drawer, closeDrawer } = useStore()
  const ref = useRef<HTMLElement>(null)
  useFocusTrap(ref, !!drawer)
  useEffect(() => {
    if (!drawer) return
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && closeDrawer()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [drawer, closeDrawer])
  if (!drawer) return null
  return (
    <div className="drawer-backdrop open" onClick={(e) => e.target === e.currentTarget && closeDrawer()}>
      <aside ref={ref} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
        <div className="drawer-head">
          <h2 id="drawerTitle">{drawer.title}</h2>
          <button className="icon-btn" onClick={closeDrawer} aria-label="Close drawer">×</button>
        </div>
        <div>{drawer.body}</div>
      </aside>
    </div>
  )
}

export function Modal() {
  const { modal, closeModal, toast } = useStore()
  const ref = useRef<HTMLElement>(null)
  useFocusTrap(ref, !!modal)
  useEffect(() => {
    if (!modal) return
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && closeModal()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [modal, closeModal])
  if (!modal) return null
  const confirm = () => {
    const res = modal.onConfirm?.()
    if (res === false) return
    closeModal()
    if (!modal.onConfirm) toast('Action confirmed')
  }
  return (
    <div className="modal-backdrop open" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <section ref={ref} tabIndex={-1} className="modal" role="alertdialog" aria-modal="true" aria-labelledby="modalTitle">
        <h2 id="modalTitle">{modal.title}</h2>
        {modal.message && <p>{modal.message}</p>}
        {modal.body && <div className="modal-body">{modal.body}</div>}
        {!modal.noActions && (
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Btn onClick={closeModal}>{modal.cancelLabel ?? 'Cancel'}</Btn>
            <Btn variant={modal.danger ? 'danger' : 'primary'} onClick={confirm}>{modal.confirm ?? 'Confirm'}</Btn>
          </div>
        )}
      </section>
    </div>
  )
}

export function Toast() {
  const { toastMessage } = useStore()
  return (
    <div className={`toast ${toastMessage ? 'show' : ''}`} role="status" aria-live="polite">
      {toastMessage}
    </div>
  )
}

