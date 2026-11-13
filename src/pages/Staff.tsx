import { useState } from 'react'

import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Field, isEmail, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ACTIONS, initials, MODULES, TOTAL_SEATS, type Staff } from '../data/seed'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useDirty, useUnsavedGuard } from '../lib/unsaved'

/** The one-time password, with a copy button. */
export function TempPassword({ value }: { value: string }) {
  const { toast } = useStore()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <code style={{ flex: 1, padding: 10, fontSize: 13, letterSpacing: 1, wordBreak: 'break-all' }}>{value}</code>
      <Btn small onClick={() => { navigator.clipboard?.writeText(value).then(() => toast('Copied'), () => toast('Copy it manually')) }}>Copy</Btn>
    </div>
  )
}

export function StaffList() {
  const { staff, roles: roleList, openDrawer, closeDrawer, openModal, updateStaff, toast, canManageStaff, resetPassword } = useStore()
  const [roleFilter, setRoleFilter] = useState('All roles')

  const rows = roleFilter === 'All roles' ? staff : staff.filter((s) => s.role === roleFilter)
  const active = staff.filter((s) => s.status === 'Active').length
  const invited = staff.filter((s) => s.status === 'Invited').length
  const roles = new Set(staff.map((s) => s.role)).size

  const columns: Column<Staff>[] = [
    {
      key: 'name', header: 'Name', sort: (a, b) => a.name.localeCompare(b.name),
      render: (s) => (
        <div className="product-cell">
          <AvatarTile text={initials(s.name)} />
          <div>
            <div className="prod-name">{s.name}</div>
            <div className="subtext">{s.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', sort: (a, b) => a.role.localeCompare(b.role), render: (s) => s.role },
    { key: 'status', header: 'Status', sort: (a, b) => a.status.localeCompare(b.status), render: (s) => <Badge>{s.status}</Badge> },
    { key: 'last', header: 'Last active', render: (s) => s.lastActive },
  ]

  const confirmReset = (s: Staff) =>
    openModal({
      title: `Reset password for ${s.name}?`,
      message: 'A temporary password is created and shown once. Share it with them securely. They must choose their own at the next sign-in.',
      confirm: 'Reset password',
      onConfirm: () => {
        resetPassword(s.id).then(
          (temp) => setTimeout(() => openModal({ title: 'Temporary password', message: `For ${s.name} (${s.email}). It won’t be shown again.`, body: <TempPassword value={temp} />, confirm: 'Done', cancelLabel: 'Close' }), 0),
          (e: Error) => toast(`Couldn’t reset the password: ${e.message}`, 'error'),
        )
      },
    })

  const view = (s: Staff) =>
    openDrawer({
      title: `Staff member · ${s.name}`,
      body: (
        <>
          <Notice>Quick details and recent activity for this team member.</Notice>
          <SettingRow title="Role" sub={s.email} right={<span className="prod-name">{s.role}</span>} />
          <SettingRow title="Phone" right={<span className="prod-name">{s.phone}</span>} />
          <SettingRow title="Status" sub="Current workspace status" right={<Badge>{s.status}</Badge>} />
          <SettingRow title="Last active" right={<span className="prod-name">{s.lastActive}</span>} />
          <div className="actions" style={{ marginTop: 16 }}>
            <Btn variant="primary" onClick={() => { closeDrawer(); navigate(`/staff/${s.id}`) }}>Edit staff member</Btn>
            {canManageStaff && (
              <Btn onClick={() => { closeDrawer(); confirmReset(s) }}>Reset password</Btn>
            )}
            {s.role !== 'Owner admin' && (
              <Btn
                variant="danger"
                onClick={() => {
                  closeDrawer()
                  const suspend = s.status !== 'Suspended'
                  openModal({
                    title: suspend ? `Suspend ${s.name}?` : `Restore ${s.name}?`,
                    message: suspend ? 'They will lose access to the admin immediately.' : 'They will be able to sign in again.',
                    confirm: suspend ? 'Suspend' : 'Restore',
                    danger: suspend,
                    onConfirm: () => {
                      updateStaff(s.id, { status: suspend ? 'Suspended' : 'Active' }).then((err) => toast(err ?? (suspend ? `${s.name} suspended` : `${s.name} restored`), err ? 'error' : 'success'))
                    },
                  })
                }}>
                {s.status === 'Suspended' ? 'Restore access' : 'Suspend'}
              </Btn>
            )}
          </div>
        </>
      ),
    })

  return (
    <>
      <PageHead
        title="Staff list"
        desc="Manage team access and responsibilities."
        actions={
          <>
            <Btn onClick={() => { downloadCsv('staff.csv', ['Name', 'Email', 'Role', 'Status', 'Last active'], staff.map((s) => [s.name, s.email, s.role, s.status, s.lastActive])); toast('Staff CSV downloaded') }}>Export</Btn>
            <Btn variant="primary" disabled={!canManageStaff} onClick={() => navigate('/staff/new')}>Create account</Btn>
          </>
        }
      />
      <div className="grid stats" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <Stat label="Active staff" value={String(active)} trend={`Across ${roles} roles`} icon="♙" />
        <Stat label="Awaiting first sign-in" value={String(invited)} trend="Temporary password not changed" icon="✉" />
        <Stat label="Available seats" value={String(TOTAL_SEATS - staff.length)} trend={`Of ${TOTAL_SEATS} total seats`} icon="＋" />
      </div>
      <DataTable
        title="All staff"
        rows={rows}
        rowKey={(s) => s.id}
        columns={columns}
        searchLabel="Search staff"
        searchText={(s) => `${s.name} ${s.email} ${s.role} ${s.status}`}
        tools={
          <select className="select" aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option>All roles</option>
            {roleList.map((r) => <option key={r.name}>{r.name}</option>)}
          </select>
        }
        bulk={{
          label: 'Bulk actions',
          onClick: (ids) =>
            openModal({
              title: `Suspend ${ids.length} staff ${ids.length === 1 ? 'member' : 'members'}?`,
              message: 'Owner admins are skipped. Suspended staff lose access immediately.',
              confirm: 'Suspend',
              danger: true,
              onConfirm: () => {
                const hit = staff.filter((s) => ids.includes(s.id) && s.role !== 'Owner admin')
                Promise.all(hit.map((s) => updateStaff(s.id, { status: 'Suspended' }))).then((r) => {
                  const failed = r.filter(Boolean).length
                  toast(failed ? `${hit.length - failed} suspended, ${failed} couldn’t be` : `${hit.length} suspended`, failed ? 'error' : 'success')
                })
              },
            }),
        }}
        actions={(s) => <Btn small onClick={() => view(s)}>View</Btn>}
      />
    </>
  )
}

/** Create a staff account (`/staff/new`) or edit one (`/staff/:id`). Staff don't sign themselves up. */
export function StaffForm({ id }: { id?: string }) {
  const { staff, roles, permissions, addStaff, updateStaff, resetPassword, canManageStaff, toast, openModal, user } = useStore()
  const roleOptions = roles.filter((r) => r.name !== 'Owner admin' || user?.role === 'Owner admin').map((r) => r.name)
  const [busy, setBusy] = useState(false)
  const existing = id ? staff.find((s) => s.id === id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [role, setRole] = useState(existing?.role ?? roleOptions[0] ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const unsaved = useUnsavedGuard(useDirty({ name, email, phone, role }))

  if (id && !existing) {
    return (
      <>
        <PageHead title="Add/edit staff" desc="That staff member doesn’t exist." actions={<Btn onClick={() => navigate('/staff')}>Back to staff</Btn>} />
        <Notice tone="warning" mark="!">We couldn’t find this team member. They may have been removed.</Notice>
      </>
    )
  }
  if (!canManageStaff) {
    return (
      <>
        <PageHead title="Add/edit staff" desc="Staff accounts are created by the IT team or an owner." actions={<Btn onClick={() => navigate('/staff')}>Back to staff</Btn>} />
        <Notice tone="warning" mark="!">Your role can view the team but not create or change accounts. Ask IT support.</Notice>
      </>
    )
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (name.trim().split(/\s+/).length < 2) e.name = 'Enter their first and last name'
    if (!existing && !isEmail(email)) e.email = 'Enter a valid work email'
    else if (!existing && staff.some((s) => s.email.toLowerCase() === email.trim().toLowerCase())) e.email = 'A team member with this email already exists'
    if (!role) e.role = 'Choose a role'
    if (phone.trim() && !/^\+?[\d\s]{9,16}$/.test(phone.trim())) e.phone = 'Enter a valid phone number'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = async () => {
    if (busy || !validate()) return
    if (existing) {
      setBusy(true)
      const err = await updateStaff(existing.id, { name: name.trim(), phone: phone.trim(), role })
      setBusy(false)
      if (err) return setErrors({ name: err })
      toast('Staff member updated')
      unsaved()
      navigate('/staff')
      return
    }
    openModal({
      title: 'Create account?',
      message: `${name.trim().split(' ')[0]} gets an account with a temporary password. They must choose their own the first time they sign in.`,
      confirm: 'Create account',
      onConfirm: () => {
        addStaff({ name: name.trim(), email: email.trim(), phone: phone.trim(), role }).then(
          ({ temp }) => {
            unsaved()
            navigate('/staff')
            setTimeout(() => openModal({ title: 'Account created', message: `Temporary password for ${email.trim()}. Share it securely. It won’t be shown again.`, body: <TempPassword value={temp} />, confirm: 'Done', cancelLabel: 'Close' }), 0)
          },
          (e: Error) => toast(`Couldn’t create the account: ${e.message}`, 'error'),
        )
      },
    })
  }

  const reset = () =>
    openModal({
      title: `Reset password for ${existing!.name}?`,
      message: 'A temporary password is created and shown once. They must choose their own at the next sign-in.',
      confirm: 'Reset password',
      onConfirm: () => {
        resetPassword(existing!.id).then(
          (temp) => setTimeout(() => openModal({ title: 'Temporary password', message: `For ${existing!.email}. It won’t be shown again.`, body: <TempPassword value={temp} />, confirm: 'Done', cancelLabel: 'Close' }), 0),
          (e: Error) => toast(`Couldn’t reset the password: ${e.message}`, 'error'),
        )
      },
    })

  const matrix = (permissions as Record<string, Record<string, boolean[]>>)[role]
  const preview: [string, string][] = matrix ? MODULES.filter((m) => matrix[m]?.[0]).map((m): [string, string] => [m, ACTIONS.filter((_, j) => matrix[m]?.[j]).join(', ')]) : []

  return (
    <>
      <PageHead
        title="Add/edit staff"
        desc="Create a team member’s account and choose their access level."
        actions={
          <>
            {existing && <Btn onClick={reset}>Reset password</Btn>}
            <Btn onClick={() => navigate('/staff')}>Back to staff</Btn>
          </>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.45fr) minmax(260px,.8fr)', alignItems: 'start' }}>
        <section className="card form-card">
          <h2>{existing ? `Edit ${existing.name}` : 'Staff details'}</h2>
          <div className="form-grid">
            <Field label="Full name" value={name} onChange={setName} placeholder="Enter full name" error={errors.name} />
            <Field label="Work email" type="email" value={email} onChange={setEmail} placeholder="name@shopcore.co" error={errors.email} hint={existing ? 'A work email can’t be changed. Create a new account if it has changed.' : undefined} disabled={!!existing} />
            <Field label="Phone number" value={phone} onChange={setPhone} placeholder="+254 712 555 104" error={errors.phone} />
            <Field label="Role" value={role} onChange={setRole} error={errors.role} options={existing && !roleOptions.includes(existing.role) ? [existing.role, ...roleOptions] : roleOptions} />
          </div>
          <div style={{ margin: '3px 0 15px' }}>
            <Notice>{existing ? 'Role permissions can be reviewed and adjusted in Roles and permissions.' : 'Accounts are created here, not by the staff member. A temporary password is shown once after you create the account.'}</Notice>
          </div>
          <div className="form-actions">
            <Btn onClick={() => navigate('/staff')}>Cancel</Btn>
            <Btn variant="primary" disabled={busy} onClick={save}>{existing ? 'Save changes' : 'Create account'}</Btn>
          </div>
        </section>
        <Panel title="Role access preview" sub={`${role} permissions`}>
          {preview.map(([m, d]) => <SettingRow key={m} title={m} sub={d} right={<Badge>Included</Badge>} />)}
        </Panel>
      </div>
    </>
  )
}
