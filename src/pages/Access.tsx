import { useState } from 'react'

import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Notice, PageHead, SettingRow, type Column } from '../components/ui'
import { ACTIONS, initials, MODULES, ROLE_BLURB, ROLES, type AuditEntry, type Permissions, type Role } from '../data/seed'
import { useStore } from '../lib/store'

const clone = (p: Permissions): Permissions => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [...v]])) as Permissions

export function Roles() {
  const { permissions, setPermissions, staff, toast, log } = useStore()
  const [role, setRole] = useState<Role>('Operations manager')
  const [draft, setDraft] = useState<Permissions>(() => clone(permissions['Operations manager']))
  const dirty = JSON.stringify(draft) !== JSON.stringify(permissions[role])

  const pick = (r: Role) => {
    setRole(r)
    setDraft(clone(permissions[r]))
  }
  const owner = role === 'Owner admin'
  const set = (m: (typeof MODULES)[number], j: number, on: boolean) => {
    const next = clone(draft)
    next[m][j] = on
    // View is required for everything else.
    if (j > 0 && on) next[m][0] = true
    if (j === 0 && !on) next[m] = next[m].map(() => false)
    setDraft(next)
  }
  const save = () => {
    setPermissions(role, draft)
    log(`Updated permissions · ${role}`, 'Roles', 'Access')
    toast('Permissions saved')
  }
  const members = (r: Role) => staff.filter((s) => s.role === r).length

  return (
    <>
      <PageHead title="Roles and permissions matrix" desc="Control which modules each role can view, create, edit, or delete." actions={<Btn variant="primary" disabled={!dirty || owner} onClick={save}>Save permissions</Btn>} />
      <section className="card panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Permission matrix</h2>
            <div className="panel-sub">Changes apply to all members assigned to that role.</div>
          </div>
          <select className="select" aria-label="Select role" value={role} onChange={(e) => pick(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        {owner && <div style={{ marginBottom: 12 }}><Notice>Owner admins always have full access. Their permissions can’t be changed.</Notice></div>}
        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr><th>Module</th>{ACTIONS.map((a) => <th key={a}>{a}</th>)}</tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m}>
                  <td><b style={{ fontSize: 10 }}>{m}</b></td>
                  {ACTIONS.map((a, j) => (
                    <td key={a}>
                      <input type="checkbox" aria-label={`${m} ${a.toLowerCase()}`} checked={draft[m][j]!} disabled={owner || (m === 'Settings' && j > 0)} onChange={(e) => set(m, j, e.target.checked)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        {ROLES.filter((r) => r !== role).slice(0, 3).map((r) => (
          <article className="card panel" key={r}>
            <div className="panel-head">
              <div>
                <h2>{r}</h2>
                <div className="panel-sub">{ROLE_BLURB[r]}</div>
              </div>
              <button className="icon-btn" onClick={() => pick(r)} aria-label={`Edit ${r} permissions`} title="Edit permissions">···</button>
            </div>
            <Badge tone="gray">{`${members(r)} ${members(r) === 1 ? 'member' : 'members'}`}</Badge>
          </article>
        ))}
      </div>
    </>
  )
}


export function AuditLog() {
  const { audit, openDrawer, toast } = useStore()
  const [user, setUser] = useState('All users')
  const [module, setModule] = useState('All modules')
  const [date, setDate] = useState('')

  const users = ['All users', ...new Set(audit.map((a) => a.user))]
  const modules = ['All modules', ...new Set(audit.map((a) => a.module))]
  const rows = audit.filter((a) => (user === 'All users' || a.user === user) && (module === 'All modules' || a.module === module) && (!date || new Date(a.at).toLocaleDateString('en-CA') === date))

  const columns: Column<AuditEntry>[] = [
    {
      key: 'user', header: 'User', sort: (a, b) => a.user.localeCompare(b.user),
      render: (a) => (
        <div className="product-cell">
          <AvatarTile text={a.user === 'System' ? 'SY' : initials(a.user)} />
          <div>
            <div className="prod-name">{a.user}</div>
            <div className="subtext">{a.when}</div>
          </div>
        </div>
      ),
    },
    { key: 'action', header: 'Action', sort: (a, b) => a.action.localeCompare(b.action), render: (a) => a.action },
    { key: 'module', header: 'Module', sort: (a, b) => a.module.localeCompare(b.module), render: (a) => a.module },
    { key: 'type', header: 'Event type', render: (a) => <Badge>{a.type}</Badge> },
  ]

  return (
    <>
      <PageHead title="Audit log" desc="A secure, chronological record of administrative activity." actions={<Btn onClick={() => { downloadCsv('audit-log.csv', ['When', 'User', 'Action', 'Module', 'Type'], rows.map((a) => [new Date(a.at).toISOString(), a.user, a.action, a.module, a.type])); toast('Audit log export started') }}>Download log</Btn>} />
      <div style={{ marginBottom: 14 }}>
        <Notice>Audit records are retained for 365 days. All timestamps are shown in East Africa Time (EAT).</Notice>
      </div>
      <DataTable
        title="Activity history"
        rows={rows}
        rowKey={(a) => a.id}
        columns={columns}
        searchLabel="Search audit log"
        searchText={(a) => `${a.user} ${a.action} ${a.module} ${a.type}`}
        tools={
          <>
            <select className="select" aria-label="User" value={user} onChange={(e) => setUser(e.target.value)}>{users.map((u) => <option key={u}>{u}</option>)}</select>
            <select className="select" aria-label="Module" value={module} onChange={(e) => setModule(e.target.value)}>{modules.map((m) => <option key={m}>{m}</option>)}</select>
            <input className="select" type="date" aria-label="Filter by date" value={date} onChange={(e) => setDate(e.target.value)} />
          </>
        }
        actions={(a) => (
          <Btn small onClick={() => openDrawer({
            title: 'Audit record details',
            body: (
              <>
                <Notice>This record can’t be edited or deleted.</Notice>
                <SettingRow title="Action" sub={a.action} />
                <SettingRow title="Performed by" sub={a.user} />
                <SettingRow title="Module" sub={a.module} />
                <SettingRow title="When" sub={`${new Date(a.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} EAT`} />
                <SettingRow title="Event type" right={<Badge>{a.type}</Badge>} />
              </>
            ),
          })}>Details</Btn>
        )}
      />
    </>
  )
}
