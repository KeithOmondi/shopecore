import { useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, Stat, Tabs, Toggle, type Column } from '../components/ui'
import { KEY_SCOPES, SERVICES, TEMPLATE_VARS, type ApiKey, type Channel, type Integration, type Template } from '../data/seed'
import { useStore } from '../lib/store'

function MaintenancePanel() {
  const { maintenance, setMaintenance, openModal, toast, log } = useStore()
  const [message, setMessage] = useState(maintenance.message)
  const [eta, setEta] = useState(String(maintenance.etaMinutes))
  const [err, setErr] = useState('')
  const save = (on: boolean) => {
    const n = Number(eta)
    if (!Number.isInteger(n) || n < 1 || n > 600) return setErr('Enter the minutes remaining, from 1 to 600.')
    setErr('')
    setMaintenance({ on, message: message.trim(), etaMinutes: n })
    log(on ? 'Turned maintenance mode on' : 'Turned maintenance mode off', 'System health', 'Security')
    toast(on ? 'Maintenance mode is on' : 'Maintenance mode is off')
  }
  return (
    <Panel title="Maintenance mode" sub="Show a ‘we’ll be back shortly’ screen to everyone except owners and IT support" right={<Badge tone={maintenance.on ? 'amber' : 'green'}>{maintenance.on ? 'On' : 'Off'}</Badge>}>
      <Field label="Message for staff (optional)" multiline value={message} onChange={setMessage} placeholder="Planned database upgrade. We’ll be back shortly." />
      <Field label="Minutes remaining" type="number" value={eta} onChange={(v) => { setEta(v); setErr('') }} error={err} />
      <div className="actions">
        {maintenance.on ? <Btn variant="primary" onClick={() => save(false)}>Turn off maintenance mode</Btn> : <Btn variant="danger" onClick={() => openModal({ title: 'Turn on maintenance mode?', message: 'Everyone except owners and IT support is shown the maintenance screen straight away. The customer storefront and rider app are not affected.', confirm: 'Turn on', danger: true, onConfirm: () => save(true) })}>Turn on maintenance mode</Btn>}
      </div>
    </Panel>
  )
}

// ---- templates ------------------------------------------------------------------------------------

const CHANNELS: readonly Channel[] = ['Email', 'SMS', 'Push']
const SAMPLE: Record<string, string> = { customer_name: 'Nia', order_number: 'SC-2849', order_total: 'KES 8,450', tracking_link: 'https://shopcore.co/t/2849' }
const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => SAMPLE[k] ?? m)

export function Templates() {
  const { templates, setTemplates, openDrawer, openModal, closeModal, toast, log } = useStore()
  const [channel, setChannel] = useState<Channel>('Email')
  const [editingId, setEditingId] = useState('t1')
  const current = templates.find((t) => t.id === editingId) ?? templates[0]!
  const [draft, setDraft] = useState<Template>(current)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const load = (t: Template) => {
    setEditingId(t.id)
    setDraft(t)
    setChannel(t.channel)
    setErrors({})
  }
  const forChannel = templates.filter((t) => t.channel === channel)
  const dirty = JSON.stringify(draft) !== JSON.stringify(current)

  const save = () => {
    const e: Record<string, string> = {}
    if (draft.name.trim().length < 2) e.name = 'Name the template'
    if (draft.channel !== 'SMS' && draft.subject.trim().length < 2) e.subject = 'Add a subject line'
    if (draft.body.trim().length < 5) e.body = 'Write the message'
    const unknown = [...draft.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!).filter((v) => !(TEMPLATE_VARS as readonly string[]).includes(v))
    if (unknown.length) e.body = `Unknown variable: {{${unknown[0]}}}`
    if (draft.channel === 'SMS' && draft.body.length > 320) e.body = 'SMS messages are limited to 320 characters'
    setErrors(e)
    if (Object.keys(e).length) return
    setTemplates(templates.map((t) => (t.id === draft.id ? draft : t)))
    log(`Edited notification template · ${draft.name} (${draft.channel})`, 'Notification templates')
    toast('Template saved')
  }

  const preview = () =>
    openDrawer({
      title: 'Template preview',
      body: (
        <>
          <Notice>Shown with sample data (Nia · SC-2849).</Notice>
          <div className="card panel" style={{ marginTop: 14 }}>
            {draft.channel !== 'SMS' && <div className="prod-name" style={{ marginBottom: 8 }}>{fill(draft.subject)}</div>}
            <div style={{ fontSize: 11, lineHeight: 1.6 }}>{fill(draft.body)}</div>
          </div>
          <div className="panel-sub" style={{ marginTop: 10 }}>{draft.channel} · {fill(draft.body).length} characters</div>
        </>
      ),
    })

  const addTemplate = () => {
    const id = `t${Date.now()}`
    const t: Template = { id, name: 'New template', channel, trigger: 'Manual', status: 'Paused', subject: channel === 'SMS' ? '' : 'Subject', body: 'Hi {{customer_name}}, ' }
    setTemplates([...templates, t])
    load(t)
    toast('New template added. Fill it in and save.')
  }

  const toggleStatus = (t: Template) => {
    const status = t.status === 'Active' ? 'Paused' : 'Active'
    setTemplates(templates.map((x) => (x.id === t.id ? { ...x, status } : x)))
    if (draft.id === t.id) setDraft((d) => ({ ...d, status }))
    toast(`${t.name} ${status === 'Active' ? 'activated' : 'paused'}`)
  }

  return (
    <>
      <PageHead title="Notification templates" desc="Manage customer and rider messages across every channel." actions={<Btn variant="primary" disabled={!dirty} onClick={save}>Save templates</Btn>} />
      <section className="card">
        <Tabs tabs={CHANNELS} value={channel} onChange={(c) => { const first = templates.find((t) => t.channel === c); if (first) load(first); else setChannel(c) }} />
        {draft.channel !== channel ? (
          <div className="panel"><Notice>No {channel} templates yet. <button className="link-btn" onClick={addTemplate}>Create one</button></Notice></div>
        ) : (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>{draft.name}</h2>
                <div className="panel-sub">Sent when: {draft.trigger.toLowerCase()}</div>
              </div>
              <Badge>{draft.status}</Badge>
            </div>
            <div className="form-grid">
              <Field label="Template name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} error={errors.name} />
              {draft.channel !== 'SMS' && <Field label={draft.channel === 'Push' ? 'Title' : 'Subject line'} value={draft.subject} onChange={(v) => setDraft({ ...draft, subject: v })} error={errors.subject} />}
            </div>
            <Field label="Message content" multiline value={draft.body} onChange={(v) => setDraft({ ...draft, body: v })} error={errors.body} />
            <div className="panel-sub">Available variables: {TEMPLATE_VARS.map((v) => `{{${v}}}`).join(', ')}</div>
            <div className="form-actions">
              <Btn onClick={preview}>Preview</Btn>
              <Btn variant="primary" onClick={save}>Save template</Btn>
            </div>
          </div>
        )}
      </section>

      <section className="card table-card" style={{ marginTop: 14 }}>
        <div className="table-head">
          <h2>{channel} templates</h2>
          <Btn small onClick={addTemplate}>+ Add template</Btn>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Template</th><th>Channel</th><th>Trigger</th><th>Status</th><th /></tr></thead>
            <tbody>
              {forChannel.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td>{t.channel}</td>
                  <td>{t.trigger}</td>
                  <td><button className="link-btn" style={{ textDecoration: 'none' }} onClick={() => openModal({ title: `${t.status === 'Active' ? 'Pause' : 'Activate'} “${t.name}”?`, message: t.status === 'Active' ? 'Customers will stop receiving this message.' : 'Customers will start receiving this message.', confirm: t.status === 'Active' ? 'Pause' : 'Activate', onConfirm: () => { toggleStatus(t); closeModal() } })}><Badge>{t.status}</Badge></button></td>
                  <td><Btn small onClick={() => load(t)}>Edit</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

// ---- integrations -----------------------------------------------------------------------------------

function KeyForm({ onCreate }: { onCreate: (name: string, scopes: string[]) => void }) {
  const { closeModal } = useStore()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['Reports: read'])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submit = () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 3) e.name = 'Give the key a name'
    if (!scopes.length) e.scopes = 'Choose at least one permission'
    setErrors(e)
    if (Object.keys(e).length) return
    onCreate(name.trim(), scopes)
  }
  return (
    <>
      <Field label="Key name" value={name} onChange={setName} placeholder="e.g. Accounting sync" error={errors.name} />
      <div className="field">
        <label>Permissions</label>
        {KEY_SCOPES.map((s) => (
          <label key={s} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, fontWeight: 400 }}>
            <input className="table-check" type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((l) => (e.target.checked ? [...l, s] : l.filter((x) => x !== s)))} /> {s}
          </label>
        ))}
        {errors.scopes && <div className="field-error">{errors.scopes}</div>}
      </div>
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={submit}>Create key</Btn>
      </div>
    </>
  )
}

const randomKey = () => `sc_live_${Array.from({ length: 28 }, () => 'abcdef0123456789'[Math.floor(Math.random() * 16)]).join('')}`

function ApiDocs() {
  const rows = [['GET', '/v1/orders', 'List orders (Orders: read)'], ['POST', '/v1/orders', 'Create an order (Orders: read/write)'], ['PATCH', '/v1/orders/:id', 'Update status (Orders: read/write)'], ['GET', '/v1/customers', 'List customers (Customers: read)'], ['GET', '/v1/reports/sales', 'Sales report (Reports: read)'], ['POST', '/v1/webhooks', 'Register a webhook (Webhooks)']]
  return (
    <>
      <Notice>Send your key as <code>Authorization: Bearer sc_live_…</code>. Requests are limited to 120 per minute.</Notice>
      <div style={{ marginTop: 12 }}>
        {rows.map(([m, p, d]) => <SettingRow key={m + p} title={`${m} ${p}`} sub={d} />)}
      </div>
    </>
  )
}

export function Integrations() {
  const { integrations, setIntegrations, keys, setKeys, openDrawer, closeDrawer, openModal, closeModal, toast, log } = useStore()

  const setStatus = (i: Integration, status: Integration['status']) => {
    setIntegrations(integrations.map((x) => (x.id === i.id ? { ...x, status, last: 'Updated just now', note: status === 'Connected' ? 'Connection verified' : x.note } : x)))
    log(`${status === 'Connected' ? 'Reconnected' : 'Disconnected'} integration · ${i.name}`, 'Integrations', 'Security')
    toast(`${i.name} ${status === 'Connected' ? 'connected' : 'disconnected'}`)
  }

  const manage = (i: Integration) =>
    openDrawer({
      title: `${i.name} integration`,
      body: (
        <>
          <Notice tone={i.status === 'Degraded' ? 'warning' : undefined} mark={i.status === 'Degraded' ? '!' : 'i'}>{i.note}</Notice>
          <SettingRow title="Status" sub={i.last} right={<Badge>{i.status}</Badge>} />
          <SettingRow title="Purpose" right={<span className="prod-name">{i.purpose}</span>} />
          <div className="actions" style={{ marginTop: 16 }}>
            {i.status !== 'Connected' && <Btn variant="primary" onClick={() => { setStatus(i, 'Connected'); closeDrawer() }}>Reconnect</Btn>}
            {i.status === 'Connected' && <Btn variant="danger" onClick={() => { closeDrawer(); openModal({ title: `Disconnect ${i.name}?`, message: 'Features that depend on it will stop working.', confirm: 'Disconnect', danger: true, onConfirm: () => setStatus(i, 'Disconnected') }) }}>Disconnect</Btn>}
          </div>
        </>
      ),
    })

  const create = (name: string, scopes: string[]) => {
    const secret = randomKey()
    const k: ApiKey = { id: `k${Date.now()}`, name, key: `${secret.slice(0, 8)}••••••••••${secret.slice(-4)}`, permissions: scopes.join(' · '), created: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), lastUsed: 'Never', status: 'Active' }
    setKeys([k, ...keys])
    log(`Created API key · ${name}`, 'Integrations', 'Security')
    closeModal()
    openModal({
      title: 'Copy your new key now',
      message: 'This is the only time the full key is shown. Store it somewhere safe.',
      body: <code style={{ display: 'block', wordBreak: 'break-all', padding: 10, fontSize: 11 }}>{secret}</code>,
      confirm: 'Copy and close',
      cancelLabel: 'Close',
      onConfirm: () => { navigator.clipboard?.writeText(secret).then(() => toast('Key copied'), () => toast('Copy it manually')) },
    })
  }

  const columns: Column<Integration>[] = [
    { key: 'name', header: 'Integration', sort: (a, b) => a.name.localeCompare(b.name), render: (i) => <div className="prod-name">{i.name}</div> },
    { key: 'purpose', header: 'Purpose', render: (i) => i.purpose },
    { key: 'status', header: 'Status', sort: (a, b) => a.status.localeCompare(b.status), render: (i) => <Badge>{i.status}</Badge> },
    { key: 'last', header: 'Last activity', render: (i) => i.last },
  ]

  return (
    <>
      <PageHead title="Integrations and API keys" desc="Connect services and securely manage access credentials." actions={<Btn variant="primary" onClick={() => openModal({ title: 'Create API key', message: 'Choose a name and permissions for the new API key.', body: <KeyForm onCreate={create} />, noActions: true })}>+ Create API key</Btn>} />
      <div style={{ marginBottom: 14 }}>
        <Notice tone="warning" mark="!">API keys provide access to your account. Never share secret keys in public or client-side code.</Notice>
      </div>
      <DataTable
        title="Connected services"
        rows={integrations}
        rowKey={(i) => i.id}
        columns={columns}
        searchLabel="Search integrations"
        searchText={(i) => `${i.name} ${i.purpose} ${i.status}`}
        actions={(i) => <Btn small onClick={() => manage(i)}>Manage</Btn>}
      />
      <section className="card table-card" style={{ marginTop: 14 }}>
        <div className="table-head">
          <div>
            <h2>API keys</h2>
            <div className="panel-sub">Keys are shown once when created.</div>
          </div>
          <Btn onClick={() => openDrawer({ title: 'API documentation', body: <ApiDocs /> })}>View API docs</Btn>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Key</th><th>Permissions</th><th>Created</th><th>Last used</th><th>Status</th><th /></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td><b>{k.name}</b></td>
                  <td><code>{k.key}</code></td>
                  <td>{k.permissions}</td>
                  <td>{k.created}</td>
                  <td>{k.lastUsed}</td>
                  <td><Badge>{k.status}</Badge></td>
                  <td>
                    {k.status === 'Active' && (
                      <Btn small variant="danger" onClick={() => openModal({ title: 'Revoke API key?', message: 'Applications using this key will lose access immediately.', confirm: 'Revoke', danger: true, onConfirm: () => { setKeys(keys.map((x) => (x.id === k.id ? { ...x, status: 'Revoked' } : x))); log(`Revoked API key · ${k.name}`, 'Integrations', 'Security'); toast('Key revoked') } })}>Revoke</Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

// ---- health -------------------------------------------------------------------------------------------

export function Health() {
  const { backups, addBackup, autoBackup, setAutoBackup, integrations, openModal, toast, log } = useStore()
  const [running, setRunning] = useState(false)
  const [restoring, setRestoring] = useState('')

  const services = SERVICES.map((s) => (s.name === 'Notifications' && integrations.some((i) => i.status === 'Degraded') ? s : { ...s, status: s.name === 'Notifications' ? ('Healthy' as const) : s.status }))
  const allOk = services.every((s) => s.status === 'Healthy')
  const last = backups[0]!

  const run = () =>
    openModal({
      title: 'Start backup now?',
      message: 'A full encrypted backup will be created. You can continue working while it runs.',
      confirm: 'Start backup',
      onConfirm: () => {
        setRunning(true)
        toast('Backup started…')
        setTimeout(() => {
          addBackup('Manual')
          setRunning(false)
          toast('Backup completed successfully')
        }, 2500)
      },
    })

  return (
    <>
      <PageHead title="Backup and system health" desc="Monitor platform status and protect your business data." actions={<Btn variant="primary" disabled={running} onClick={run}>{running ? 'Backing up…' : 'Run backup now'}</Btn>} />
      {restoring && <div style={{ marginBottom: 14 }}><Notice tone="warning" mark="!">A restore to {restoring} is scheduled for tonight’s maintenance window (02:00 EAT). Changes made after that backup will be lost.</Notice></div>}
      <div className="grid stats" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <Stat label="System status" value={allOk ? 'Healthy' : 'Degraded'} trend={allOk ? 'All services operational' : 'One service is degraded'} icon="✓" up={allOk} />
        <Stat label="Last backup" value={last.type === 'Manual' ? 'Just now' : 'Today, 02:00'} trend="Completed successfully" icon="◷" />
        <Stat label="Backup storage" value="68% used" trend="3.4 GB of 5 GB" icon="▤" />
        <Stat label="API uptime" value="99.98%" trend="Last 30 days" icon="↗" />
      </div>
      <div className="grid analytics">
        <Panel title="Service health" sub="Live status across ShopCore systems" right={<Badge tone={allOk ? 'green' : 'amber'}>{allOk ? 'All systems operational' : 'Attention needed'}</Badge>}>
          {services.map((s) => <SettingRow key={s.name} title={s.name} sub={s.uptime} right={<Badge>{s.status}</Badge>} />)}
        </Panel>
        <Panel title="Backup schedule" sub="Automated encrypted backups" right={<Toggle on={autoBackup} onChange={(v) => { setAutoBackup(v); toast(v ? 'Automatic backups on' : 'Automatic backups paused') }} label="Toggle automatic backups" />}>
          <SettingRow title="Frequency" sub="Every day" right={<span className="prod-name">02:00 EAT</span>} />
          <SettingRow title="Retention" sub="Keep daily backups" right={<span className="prod-name">30 days</span>} />
          <SettingRow title="Encryption" sub="AES-256 at rest" right={<Badge>Active</Badge>} />
        </Panel>
      </div>
      <MaintenancePanel />
      <div style={{ height: 14 }} />
      <section className="card table-card">
        <div className="table-head">
          <h2>Recent backups</h2>
          <Btn small onClick={() => toast(`Backup history refreshed at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)}>Refresh</Btn>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date and time</th><th>Type</th><th>Size</th><th>Duration</th><th>Status</th><th /></tr></thead>
            <tbody>
              {backups.slice(0, 8).map((b) => (
                <tr key={b.id}>
                  <td>{b.when}</td><td>{b.type}</td><td>{b.size}</td><td>{b.duration}</td>
                  <td><Badge>{b.status}</Badge></td>
                  <td><Btn small onClick={() => openModal({ title: 'Restore this backup?', message: `Your data will be restored to ${b.when}. Changes made since then will be lost.`, confirm: 'Prepare restore point', danger: true, onConfirm: () => { setRestoring(b.when); log(`Scheduled restore · ${b.when}`, 'System health', 'Security'); toast('Restore point prepared') } })}>Restore</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
