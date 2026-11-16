import { useState } from 'react'

import { Badge, Btn, Field, Notice, PageHead, Panel, SettingRow, Stat } from '../components/ui'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

interface Status {
  environment: string; checkedAt: string; responseMs: number; uptimeS: number; health: Record<string, string>
  integrations: { mpesa: { mode: string; connected: boolean }; sms: { provider: string; connected: boolean }; files: { driver: string; connected: boolean }; payouts: { connected: boolean }; push: { connected: boolean }; email: { connected: boolean } }
}
const useStatus = () => useGet<Status>('/v1/admin/system/status', 60_000)
const uptime = (s: number) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86_400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86_400)} days`)

// ---- integrations ---------------------------------------------------------------------------------------------------

export function Integrations() {
  const { data, failed, reload } = useStatus()
  const i = data?.integrations
  const rows = i
    ? [
        { name: 'M-Pesa payments', purpose: 'Customers pay from their phone', ok: i.mpesa.connected, note: i.mpesa.mode === 'production' ? 'Live' : i.mpesa.mode === 'off' ? 'Switched off' : `Test mode (${i.mpesa.mode})` },
        { name: 'SMS', purpose: 'Sign-in codes and rider codes', ok: i.sms.connected, note: i.sms.connected ? 'Africa’s Talking' : 'Test mode: codes are only written to the server log' },
        { name: 'Photos and files', purpose: 'Product, banner and return photos', ok: i.files.connected, note: `Stored on the ${i.files.driver}. Use cloud storage before launch.` },
        { name: 'Paying riders', purpose: 'Sending rider payouts through M-Pesa', ok: i.payouts.connected, note: 'Not connected. Pay from the M-Pesa portal and mark payouts paid.' },
        { name: 'Push notifications', purpose: 'Messages to shoppers’ phones', ok: i.push.connected, note: 'Not connected. Notifications are recorded but not delivered to phones.' },
        { name: 'Email', purpose: 'Receipts and email campaigns', ok: i.email.connected, note: 'Not connected.' },
      ]
    : []
  return (
    <>
      <PageHead title="Integrations" desc="What ShopCore is connected to. Connections and keys are set on the server." actions={<Btn onClick={reload}>Refresh</Btn>} />
      {!data && <div className="panel-sub">{failed ? 'We couldn’t load the status.' : 'Loading…'}</div>}
      <Panel title="Connections">
        {rows.map((r) => <SettingRow key={r.name} title={r.name} sub={`${r.purpose}. ${r.note}`} right={<Badge tone={r.ok ? 'green' : 'amber'}>{r.ok ? 'Connected' : 'Not connected'}</Badge>} />)}
      </Panel>
    </>
  )
}

// ---- health ---------------------------------------------------------------------------------------------------------

export function Health() {
  const { maintenance, setMaintenance, can, openModal } = useStore()
  const { data, failed, reload } = useStatus()
  const [message, setMessage] = useState(maintenance.message)
  const [eta, setEta] = useState(String(maintenance.etaMinutes))
  const checks = data ? Object.entries(data.health) : []
  const allOk = checks.length > 0 && checks.every(([, v]) => v === 'ok')
  return (
    <>
      <PageHead title="System health" desc="Whether the pieces ShopCore depends on are answering." actions={<Btn onClick={reload}>Check now</Btn>} />
      {!data && <div className="panel-sub">{failed ? 'We couldn’t reach the server.' : 'Checking…'}</div>}
      {data && (
        <>
          <div className="tile-row">
            <Stat label="Overall" value={allOk ? 'Healthy' : 'Needs a look'} trend={`Checked ${new Date(data.checkedAt).toLocaleTimeString('en-GB')}`} icon="♥" up={allOk} />
            <Stat label="Server response" value={`${data.responseMs} ms`} trend="For this check" icon="⏱" />
            <Stat label="Running for" value={uptime(data.uptimeS)} trend={data.environment} icon="↑" />
          </div>
          <div className="sp-two" style={{ marginTop: 14 }}>
            <Panel title="Services">{checks.map(([name, v]) => <SettingRow key={name} title={name === 'postgres' ? 'Database' : name === 'redis' ? 'Cache and rate limits' : name} right={<Badge tone={v === 'ok' ? 'green' : v === 'degraded' ? 'amber' : 'red'}>{v === 'ok' ? 'Healthy' : v}</Badge>} />)}</Panel>
            <Panel title="Maintenance mode" sub="Closes the shopper app with a “back soon” screen">
              {maintenance.on && <Notice tone="warning" mark="!">Maintenance mode is on. Shoppers see the maintenance screen.</Notice>}
              <Field label="Message" value={message} onChange={setMessage} />
              <Field label="Back in (minutes)" value={eta} onChange={setEta} />
              <div className="sp-row end">
                {maintenance.on ? <Btn variant="primary" disabled={!can('Settings', 'Edit')} onClick={() => setMaintenance({ on: false, message: '', etaMinutes: 15 })}>Turn off</Btn> : <Btn variant="danger" disabled={!can('Settings', 'Edit')} onClick={() => openModal({ title: 'Close the app for maintenance?', message: 'Shoppers won’t be able to use the app until you turn this off.', confirm: 'Turn on', danger: true, onConfirm: () => setMaintenance({ on: true, message: message.trim(), etaMinutes: Math.max(1, Number(eta) || 15) }) })}>Turn on</Btn>}
              </div>
            </Panel>
          </div>
          <Notice mark="i">Database backups are handled by your hosting setup, not from this page.</Notice>
        </>
      )}
    </>
  )
}
