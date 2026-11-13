import { useEffect, useState } from 'react'

import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, SettingRow, type Column } from '../components/ui'
import { ACTIONS, initials, MODULES, type AuditEntry, type Permissions } from '../data/seed'
import { get } from '../lib/api'
import { useStore } from '../lib/store'

const clone = (p: Permissions): Permissions => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [...v]])) as Permissions
const blank = (): Permissions => Object.fromEntries(MODULES.map((m) => [m, ACTIONS.map(() => false)])) as Permissions

export function Roles() {
  const { permissions, roles, saveRole, createRole, deleteRole, toast, openModal, can, user } = useStore()
  const [role, setRole] = useState<string>('')
  const [draft, setDraft] = useState<Permissions | null>(null)
  const [busy, setBusy] = useState(false)
  const edit = can('Access', 'Edit')

  // Start on the first role once the list has arrived.
  const current = role || roles.find((r) => r.name !== 'Owner admin')?.name || roles[0]?.name || ''
  const saved = (permissions as Record<string, Permissions>)[current]
  const shown = draft ?? (saved ? clone(saved) : null)
  const info = roles.find((r) => r.name === current)
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved)
  const owner = current === 'Owner admin'

  const pick = (r: string) => { setRole(r); setDraft(null) }
  const set = (m: (typeof MODULES)[number], j: number, on: boolean) => {
    if (!shown) return
    const next = clone(shown)
    next[m][j] = on
    // View is required for everything else.
    if (j > 0 && on) next[m][0] = true
    if (j === 0 && !on) next[m] = next[m].map(() => false)
    setDraft(next)
  }
  const save = async () => {
    if (!draft || busy) return
    setBusy(true)
    const err = await saveRole(current, { permissions: draft })
    setBusy(false)
    if (err) return toast(err, 'error')
    setDraft(null)
    toast('Permissions saved. People in this role pick them up within seconds.')
  }
  const newRole = () => openModal({
    title: 'New role',
    noActions: true,
    body: <NewRole onCreate={async (name, blurb) => {
      const err = await createRole(name, blurb, blank())
      if (err) return err
      pick(name)
      toast(`${name} created. Choose what it can do, then save.`)
      return null
    }} />,
  })
  const remove = () => openModal({
    title: `Delete ${current}?`,
    message: 'The role is removed for good. This only works when nobody holds it.',
    confirm: 'Delete role',
    danger: true,
    onConfirm: () => { deleteRole(current).then((err) => { if (err) toast(err, 'error'); else { toast('Role deleted'); pick('') } }) },
  })

  if (!roles.length || !shown) {
    return (
      <>
        <PageHead title="Roles and permissions matrix" desc="Control which modules each role can view, create, edit, or delete." />
        <Notice>{can('Access', 'View') ? 'Loading roles…' : 'Your role can’t see the roles and permissions.'}</Notice>
      </>
    )
  }

  return (
    <>
      <PageHead title="Roles and permissions matrix" desc="Control which modules each role can view, create, edit, or delete." actions={<>
        {edit && <Btn onClick={newRole}>New role</Btn>}
        <Btn variant="primary" disabled={!dirty || owner || !edit || busy} onClick={save}>Save permissions</Btn>
      </>} />
      <section className="card panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Permission matrix</h2>
            <div className="panel-sub">{info?.blurb || 'Changes apply to all members assigned to that role.'}</div>
          </div>
          <select className="select" aria-label="Select role" value={current} onChange={(e) => pick(e.target.value)}>
            {roles.map((r) => <option key={r.name}>{r.name}</option>)}
          </select>
        </div>
        {owner && <div style={{ marginBottom: 12 }}><Notice>Owner admins always have full access. Their permissions can’t be changed.</Notice></div>}
        {!owner && user?.role !== 'Owner admin' && <div style={{ marginBottom: 12 }}><Notice>You can only give a role permissions that you hold yourself.</Notice></div>}
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
                      <input type="checkbox" aria-label={`${m} ${a.toLowerCase()}`} checked={!!shown[m]?.[j]} disabled={owner || !edit || (m === 'Settings' && j > 0)} onChange={(e) => set(m, j, e.target.checked)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {info && !info.system && edit && <div style={{ marginTop: 12 }}><Btn variant="danger" small disabled={info.staffCount > 0} onClick={remove}>{info.staffCount > 0 ? `${info.staffCount} people hold this role` : 'Delete this role'}</Btn></div>}
      </section>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        {roles.filter((r) => r.name !== current).slice(0, 3).map((r) => (
          <article className="card panel" key={r.name}>
            <div className="panel-head">
              <div>
                <h2>{r.name}</h2>
                <div className="panel-sub">{r.blurb}</div>
              </div>
              <button className="icon-btn" onClick={() => pick(r.name)} aria-label={`Edit ${r.name} permissions`} title="Edit permissions">···</button>
            </div>
            <Badge tone="gray">{`${r.staffCount} ${r.staffCount === 1 ? 'member' : 'members'}`}</Badge>
          </article>
        ))}
      </div>
    </>
  )
}

function NewRole({ onCreate }: { onCreate: (name: string, blurb: string) => Promise<string | null> }) {
  const { closeModal } = useStore()
  const [name, setName] = useState('')
  const [blurb, setBlurb] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (name.trim().length < 2) return setError('Give the role a name')
    setBusy(true)
    const err = await onCreate(name.trim(), blurb.trim())
    setBusy(false)
    if (err) setError(err)
    else closeModal()
  }
  return (
    <>
      <Field label="Role name" value={name} onChange={(v) => { setName(v); setError('') }} error={error} placeholder="e.g. Warehouse supervisor" />
      <Field label="What it is for" value={blurb} onChange={setBlurb} placeholder="A line to help people choose the right role" />
      <div className="form-actions"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>Create role</Btn></div>
    </>
  )
}

interface ApiAudit { id: string; actor: string; action: string; module: string; at: string }
const typeOf = (action: string, module: string): AuditEntry['type'] =>
  /refund/i.test(action) ? 'Refund' : /backup/i.test(action) ? 'Backup' : /password|signed|suspend|reactivat|session|locked/i.test(action) ? 'Security' : /role|permission|account|access|owner/i.test(action) || module === 'Access' ? 'Access' : 'Updated'
const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function AuditLog() {
  const { openDrawer, toast } = useStore()
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [user, setUser] = useState('All users')
  const [module, setModule] = useState('All modules')
  const [date, setDate] = useState('')
  const [q, setQ] = useState('')

  const load = async (cursor?: string) => {
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (cursor) params.set('cursor', cursor)
      if (module !== 'All modules') params.set('module', module)
      const r = await get<{ items: ApiAudit[]; nextCursor: string | null }>(`/v1/audit?${params}`)
      const mapped = r.items.map((a): AuditEntry => ({ id: a.id, user: a.actor, action: a.action, module: a.module, at: Date.parse(a.at), when: when(Date.parse(a.at)), type: typeOf(a.action, a.module) }))
      setRows((cur) => (cursor ? [...cur, ...mapped] : mapped))
      setNext(r.nextCursor)
      setState('ready')
    } catch {
      setState('error')
    }
  }
  useEffect(() => { setState('loading'); void load() }, [module]) // eslint-disable-line react-hooks/exhaustive-deps

  const users = ['All users', ...new Set(rows.map((a) => a.user))]
  const modules = ['All modules', ...new Set([...rows.map((a) => a.module), ...(module === 'All modules' ? [] : [module])])]
  const shown = rows.filter((a) => (user === 'All users' || a.user === user) && (!date || new Date(a.at).toLocaleDateString('en-CA') === date) && (!q || `${a.user} ${a.action} ${a.module}`.toLowerCase().includes(q.toLowerCase())))

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
      <PageHead title="Audit log" desc="A secure, chronological record of administrative activity." actions={<Btn onClick={() => { downloadCsv('audit-log.csv', ['When', 'User', 'Action', 'Module', 'Type'], shown.map((a) => [new Date(a.at).toISOString(), a.user, a.action, a.module, a.type])); toast('Audit log downloaded') }}>Download log</Btn>} />
      <div style={{ marginBottom: 14 }}>
        <Notice>Audit records can’t be edited or deleted. All timestamps are shown in your local time.</Notice>
      </div>
      {state === 'error' && <div style={{ marginBottom: 14 }}><Notice tone="error" mark="!">The audit log couldn’t be loaded. <button className="link-btn" onClick={() => { setState('loading'); void load() }}>Try again</button></Notice></div>}
      <DataTable
        title="Activity history"
        rows={shown}
        rowKey={(a) => a.id}
        columns={columns}
        searchLabel="Search audit log"
        searchText={(a) => `${a.user} ${a.action} ${a.module} ${a.type}`}
        empty={state === 'loading' ? 'Loading…' : 'Nothing matches those filters.'}
        tools={
          <>
            <input className="select" aria-label="Search the whole log" placeholder="Search action or person" value={q} onChange={(e) => setQ(e.target.value)} />
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
                <SettingRow title="When" sub={new Date(a.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} />
                <SettingRow title="Event type" right={<Badge>{a.type}</Badge>} />
              </>
            ),
          })}>Details</Btn>
        )}
      />
      {next && <div style={{ marginTop: 12, textAlign: 'center' }}><Btn onClick={() => void load(next)}>Load older activity</Btn></div>}
    </>
  )
}
