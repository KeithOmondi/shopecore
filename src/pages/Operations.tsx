import { useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, type Column } from '../components/ui'
import { ApiError, del, patch, post, put } from '../lib/api'
import { kes } from '../lib/format'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'
import type { ApiRider } from './Riders'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100

// ---- delivery zones and fees ----------------------------------------------------------------------------------------

interface Zone { id: string; county: string; name: string; feeCents: number; commissionPct: number; areas: string[]; note: string; active: boolean; riders: number }
interface ZonesData { items: Zone[]; settings: { baseFeeCents: number; minBasketCents: number } }

function ZoneForm({ zone, onSaved }: { zone?: Zone; onSaved: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ name: zone?.name ?? '', county: zone?.county ?? 'Nairobi', fee: String(shillings(zone?.feeCents ?? 25000)), commission: String(zone?.commissionPct ?? 20), areas: (zone?.areas ?? []).join(', '), note: zone?.note ?? '', active: zone?.active ?? true })
  const [err, setErr] = useState('')
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.name.trim()) return setErr('Name the zone')
    const fee = Number(f.fee)
    if (!(fee >= 0)) return setErr('Enter the delivery fee in shillings')
    const body = { name: f.name.trim(), county: f.county.trim() || 'Nairobi', feeCents: Math.round(fee * 100), commissionPct: Number(f.commission) || 0, areas: f.areas.split(',').map((a) => a.trim()).filter(Boolean), note: f.note.trim(), active: f.active }
    try { if (zone) await patch(`/v1/admin/zones/${zone.id}`, body); else await post('/v1/admin/zones', body); onSaved(); closeModal(); toast('Zone saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Field label="Zone name" value={f.name} onChange={(v) => { set('name')(v); setErr('') }} error={err} />
      <div className="sp-form2">
        <Field label="County" value={f.county} onChange={set('county')} />
        <Field label="Delivery fee (KES)" value={f.fee} onChange={set('fee')} />
        <Field label="Rider commission taken (%)" value={f.commission} onChange={set('commission')} hint="ShopCore keeps this share of the fee." />
        <Field label="Status" value={f.active ? 'Active' : 'Paused'} onChange={(v) => set('active')(v === 'Active')} options={['Active', 'Paused']} />
      </div>
      <Field label="Areas it covers (comma separated)" multiline value={f.areas} onChange={set('areas')} placeholder="Kilimani, Lavington, Hurlingham" hint="An area can belong to one zone only." />
      <Field label="Note" value={f.note} onChange={set('note')} />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void save()}>Save zone</Btn></div>
    </>
  )
}

function SettingsForm({ s, onSaved }: { s: ZonesData['settings']; onSaved: () => void }) {
  const { toast, can } = useStore()
  const [base, setBase] = useState(String(shillings(s.baseFeeCents)))
  const [min, setMin] = useState(String(shillings(s.minBasketCents)))
  const [err, setErr] = useState('')
  const save = async () => {
    if (!(Number(base) >= 0) || !(Number(min) >= 0)) return setErr('Enter amounts in shillings')
    try { await put('/v1/admin/delivery-settings', { baseFeeCents: Math.round(Number(base) * 100), minBasketCents: Math.round(Number(min) * 100) }); onSaved(); toast('Delivery settings saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <Panel title="Delivery settings" sub="Used when an address isn’t in any zone, and for the smallest order we’ll deliver">
      <div className="sp-form2"><Field label="Fee outside every zone (KES)" value={base} onChange={setBase} /><Field label="Smallest basket (KES)" value={min} onChange={setMin} error={err} /></div>
      <div className="sp-row end"><Btn variant="primary" disabled={!can('Settings', 'Edit')} onClick={() => void save()}>Save settings</Btn></div>
    </Panel>
  )
}

export function DeliveryZones() {
  const { can, openModal, toast } = useStore()
  const { data, failed, loading, reload } = useGet<ZonesData>('/v1/admin/zones')
  const edit = can('Settings', 'Edit')
  const cols: Column<Zone>[] = [
    { key: 'n', header: 'Zone', sort: (a, b) => a.name.localeCompare(b.name), render: (z) => <div><b>{z.name}</b><div className="subtext">{z.county}</div></div> },
    { key: 'a', header: 'Areas', render: (z) => (z.areas.length ? z.areas.join(', ') : '—') },
    { key: 'f', header: 'Fee', sort: (a, b) => a.feeCents - b.feeCents, render: (z) => <b>{kes(shillings(z.feeCents))}</b> },
    { key: 'c', header: 'Commission', render: (z) => `${z.commissionPct}%` },
    { key: 'r', header: 'Riders', render: (z) => z.riders },
    { key: 's', header: 'Status', render: (z) => <Badge tone={z.active ? 'green' : 'gray'}>{z.active ? 'Active' : 'Paused'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Delivery zones and fees" desc="Where you deliver, and what each area pays." actions={<Btn variant="primary" disabled={!edit} onClick={() => openModal({ title: 'Add zone', body: <ZoneForm onSaved={reload} />, noActions: true })}>Add zone</Btn>} />
      {data && data.items.length === 0 && <Notice tone="warning" mark="!">No zones yet. Customers can’t choose a delivery area until you add one.</Notice>}
      <DataTable title="Zones" rows={data?.items ?? []} rowKey={(z) => z.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the zones.' : undefined} onRetry={reload} searchLabel="Search zones" searchText={(z) => `${z.name} ${z.county} ${z.areas.join(' ')}`} emptyTitle="No zones yet" empty="Add the areas you deliver to."
        actions={(z) => (
          <div className="sp-row">
            <Btn small disabled={!edit} onClick={() => openModal({ title: `Edit ${z.name}`, body: <ZoneForm zone={z} onSaved={reload} />, noActions: true })}>Edit</Btn>
            <Btn small disabled={!edit} onClick={() => openModal({ title: `Delete ${z.name}?`, message: 'Its areas stop being deliverable unless another zone covers them.', confirm: 'Delete zone', danger: true, onConfirm: () => { void del(`/v1/admin/zones/${z.id}`).then(() => { reload(); toast('Zone deleted') }, (e) => toast(says(e))) } })}>Delete</Btn>
          </div>
        )} />
      <div style={{ marginTop: 14 }}>{data && <SettingsForm key={`${data.settings.baseFeeCents}:${data.settings.minBasketCents}`} s={data.settings} onSaved={reload} />}</div>
    </>
  )
}

// ---- shifts ---------------------------------------------------------------------------------------------------------

interface Shift { id: string; riderId: string; rider: string; day: string; window: string; zoneId: string | null; zone: string | null }
const WINDOWS = ['6:00 AM – 2:00 PM', '10:00 AM – 6:00 PM', '2:00 PM – 10:00 PM']
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mondayOf = (offset: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7); return d }

export function ShiftPlanner() {
  const { can, toast } = useStore()
  const [week, setWeek] = useState(0)
  const mon = mondayOf(week)
  const days = Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * 86_400_000))
  const from = isoDay(days[0]!)
  const to = isoDay(days[6]!)
  const riders = (useGet<{ items: ApiRider[] }>('/v1/admin/riders?status=approved&limit=200').data?.items ?? [])
  const { data, failed, reload } = useGet<{ items: Shift[] }>(`/v1/admin/shifts?from=${from}&to=${to}`)
  const edit = can('Riders', 'Edit')
  const at = (riderId: string, day: string) => data?.items.find((s) => s.riderId === riderId && s.day === day)

  const change = async (riderId: string, day: string, window: string) => {
    try {
      if (!window) await del(`/v1/admin/shifts?riderId=${riderId}&day=${day}`)
      else await put('/v1/admin/shifts', { riderId, day, window, zoneId: riders.find((r) => r.id === riderId)?.zoneId ?? null })
      reload()
    } catch (e) { toast(says(e)) }
  }
  return (
    <>
      <PageHead title="Shift planner" desc={`Week of ${days[0]!.getDate()} ${days[0]!.toLocaleString('en-GB', { month: 'long' })} ${days[0]!.getFullYear()}. Choose when each rider works.`}
        actions={<><Btn onClick={() => setWeek(week - 1)}>← Previous week</Btn><Btn onClick={() => setWeek(0)}>This week</Btn><Btn onClick={() => setWeek(week + 1)}>Next week →</Btn></>} />
      {failed && !data && <Notice tone="warning" mark="!">We couldn’t load the shifts. <button className="link-btn" onClick={reload}>Try again</button></Notice>}
      {riders.length === 0 && <Notice mark="i">No approved riders yet. Approve riders first, then roster them here.</Notice>}
      <Panel title="Roster">
        <div className="table-wrap"><table>
          <thead><tr><th>Rider</th>{days.map((d) => <th key={isoDay(d)}>{d.toLocaleString('en-GB', { weekday: 'short' })} {d.getDate()}</th>)}</tr></thead>
          <tbody>
            {riders.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b><div className="subtext">{r.zone ?? 'No zone'}</div></td>
                {days.map((d) => {
                  const day = isoDay(d)
                  return (
                    <td key={day}>
                      <select className="select" aria-label={`${r.name} on ${day}`} disabled={!edit} value={at(r.id, day)?.window ?? ''} onChange={(e) => void change(r.id, day, e.target.value)}>
                        <option value="">Off</option>{WINDOWS.map((w) => <option key={w}>{w}</option>)}
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table></div>
      </Panel>
      <SettingRow title="Shifts this week" right={<b>{data?.items.length ?? 0}</b>} />
    </>
  )
}
