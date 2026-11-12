import { Fragment, useState } from 'react'

import { MapView, type MapPin } from '../components/MapView'
import { Badge, Btn, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat } from '../components/ui'
import type { Zone } from '../data/seed'
import { SHIFT_WINDOWS, type Shift } from '../data/ops'
import type { Pt } from '../data/geo'
import { zoneOf } from '../data/geo'
import { kes } from '../lib/format'
import { isUnassigned } from '../lib/dispatch'
import { useStore } from '../lib/store'

const COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#7C3AED', '#DC2626', '#0891B2']
const num = (v: string) => (/^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN)

// ---- delivery zones ----------------------------------------------------------------------------------------

function ZoneForm({ zone, points, onSave }: { zone?: Zone; points?: Pt[]; onSave: (z: Omit<Zone, 'id'>) => void }) {
  const { closeModal, zones } = useStore()
  const [name, setName] = useState(zone?.name ?? '')
  const [fee, setFee] = useState(String(zone?.fee ?? 250))
  const [share, setShare] = useState(String(zone?.commission ?? 82))
  const [active, setActive] = useState(zone?.active ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submit = () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Name the zone'
    else if (zones.some((z) => z.name.toLowerCase() === name.trim().toLowerCase() && z.id !== zone?.id)) e.name = 'A zone with this name already exists'
    if (!(num(fee) >= 0)) e.fee = 'Enter the fee in whole shillings'
    const s = num(share)
    if (!(s > 0 && s <= 100)) e.share = 'Enter a share between 1 and 100'
    setErrors(e)
    if (Object.keys(e).length) return
    onSave({ name: name.trim(), fee: num(fee), commission: s, note: zone?.note ?? '', active, points: zone?.points ?? (points ?? []).map((p) => [p.lat, p.lng] as [number, number]) })
    closeModal()
  }
  return (
    <>
      <Field label="Zone name" value={name} onChange={setName} error={errors.name} />
      <div className="form-grid">
        <Field label="Customer delivery fee (KES)" value={fee} onChange={setFee} error={errors.fee} />
        <Field label="Rider share of the fee (%)" value={share} onChange={setShare} error={errors.share} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 12 }}>
        <input className="table-check" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Accept orders in this zone
      </label>
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={submit}>{zone ? 'Save zone' : 'Add zone'}</Btn>
      </div>
    </>
  )
}

export function DeliveryZones() {
  const { zones, setZones, orders, riders, openModal, toast, log, can } = useStore()
  const [selected, setSelected] = useState('All active zones')
  const [drawing, setDrawing] = useState(false)
  const [points, setPoints] = useState<Pt[]>([])
  const edit = can('Settings', 'Edit') || can('Riders', 'Edit')

  const current = zones.find((z) => z.name === selected)
  const live = orders.filter((o) => o.status === 'Processing' || o.status === 'Out for delivery' || isUnassigned(o))
  const perZone = (z: Zone) => live.filter((o) => zoneOf(o.area) === z.name).length
  const ridersIn = (z: Zone) => riders.filter((r) => r.status === 'Online' && zoneOf(r.zone) === z.name).length
  const activeZones = zones.filter((z) => z.active)
  const weighted = (() => {
    const totals = activeZones.map((z) => ({ n: perZone(z) + 1, fee: z.fee }))
    const n = totals.reduce((a, b) => a + b.n, 0)
    return n ? Math.round(totals.reduce((a, b) => a + b.n * b.fee, 0) / n) : 0
  })()

  const save = (z: Omit<Zone, 'id'>, id?: string) => {
    if (id) {
      setZones(zones.map((x) => (x.id === id ? { ...x, ...z } : x)))
      log(`Updated delivery zone · ${z.name}`, 'Delivery settings')
      toast('Zone saved')
    } else {
      setZones([...zones, { ...z, id: `z${Date.now()}` }])
      log(`Added delivery zone · ${z.name}`, 'Delivery settings')
      toast(`${z.name} added`)
    }
  }

  const finish = () => {
    if (points.length < 3) return toast('Place at least three points on the map')
    openModal({ title: 'Name the new zone', message: `Outline with ${points.length} points.`, body: <ZoneForm points={points} onSave={(z) => { save(z); setDrawing(false); setPoints([]) }} />, noActions: true })
  }

  const remove = (z: Zone) =>
    openModal({
      title: `Delete ${z.name}?`,
      message: perZone(z) ? `${perZone(z)} live orders are in this zone. They keep their riders, but new orders here will use the Greater Nairobi fee.` : 'No live orders are in this zone.',
      confirm: 'Delete zone',
      danger: true,
      onConfirm: () => {
        setZones(zones.filter((x) => x.id !== z.id))
        setSelected('All active zones')
        log(`Deleted delivery zone · ${z.name}`, 'Delivery settings', 'Security')
        toast('Zone deleted')
      },
    })

  const pins: MapPin[] = [
    ...riders.filter((r) => r.status === 'Online').map((r) => ({ id: r.id, at: r.at, kind: 'rider' as const, label: r.name[0]!, title: `${r.name} · ${r.zone}` })),
  ]

  return (
    <>
      <PageHead
        title="Delivery zones"
        desc="Manage delivery coverage, zone fees, and service availability."
        actions={
          <>
            <Btn variant={drawing ? 'danger' : 'primary'} disabled={!edit} onClick={() => { setDrawing((d) => !d); setPoints([]); if (!drawing) toast('Click three or more points on the map to draw a zone') }}>{drawing ? 'Cancel drawing' : 'Draw new zone'}</Btn>
            <Btn onClick={() => { log('Saved delivery zones', 'Delivery settings'); toast('Zone changes saved') }}>Save zones</Btn>
          </>
        }
      />
      <div className="grid stats" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <Stat label="Active zones" value={String(activeZones.length)} trend="Across Nairobi County" icon="⌖" />
        <Stat label="Orders in zones" value={String(live.length)} trend="Right now" icon="▤" />
        <Stat label="Riders in zones" value={String(riders.filter((r) => r.status === 'Online').length)} trend="Online now" icon="♙" />
        <Stat label="Avg delivery fee" value={kes(weighted)} trend="Weighted by order volume" icon="$" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.65fr) minmax(280px,.75fr)', alignItems: 'stretch' }}>
        <section className="card map-card">
          <div className="map-toolbar">
            <div>
              <h2>Service area map</h2>
              <div className="panel-sub">{drawing ? `Drawing: ${points.length} points placed` : 'Select a zone to update delivery fees'}</div>
            </div>
            {drawing ? (
              <div className="actions">
                <Btn small disabled={points.length === 0} onClick={() => setPoints(points.slice(0, -1))}>Undo point</Btn>
                <Btn small variant="primary" onClick={finish}>Finish zone</Btn>
              </div>
            ) : (
              <select className="select" aria-label="Select zone" value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option>All active zones</option>{zones.map((z) => <option key={z.id}>{z.name}</option>)}
              </select>
            )}
          </div>
          <MapView
            height={430}
            draw={drawing}
            onPoint={(p) => setPoints((l) => [...l, p])}
            drawn={points}
            pins={pins}
            zones={zones.filter((z) => z.points.length >= 3 && (z.active || z.name === selected)).map((z, i) => ({ id: z.id, points: z.points, color: z.active ? COLORS[i % COLORS.length]! : '#9CA3AF', selected: z.name === selected }))}
          />
        </section>
        <Panel title="Zone fees" sub="Base fee and rider share" right={<Btn small onClick={() => { downloadCsv('zones.csv', ['Zone', 'Fee (KES)', 'Rider share (%)', 'Active'], zones.map((z) => [z.name, z.fee, z.commission, z.active ? 'Yes' : 'No'])); toast('Zone list exported') }}>Export</Btn>}>
          {zones.map((z) => (
            <button key={z.id} type="button" className="setting-row" onClick={() => setSelected(z.name)} style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'inherit', cursor: 'pointer', outline: z.name === selected ? '2px solid #BFDBFE' : undefined, borderRadius: 4 }}>
              <span>
                <strong>{z.name}</strong>
                <small>{`${kes(z.fee)} delivery · ${z.commission}% rider share`}</small>
                <small>{`${perZone(z)} live orders · ${ridersIn(z)} riders`}</small>
              </span>
              <Badge tone={z.active ? 'green' : 'amber'}>{z.active ? 'Active' : 'Paused'}</Badge>
            </button>
          ))}
          <div className="form-actions">
            <Btn disabled={!current || !edit} onClick={() => current && openModal({ title: `Edit ${current.name}`, body: <ZoneForm zone={current} onSave={(z) => save(z, current.id)} />, noActions: true })}>Edit selected zone</Btn>
            <Btn variant="danger" disabled={!current || !edit} onClick={() => current && remove(current)}>Delete</Btn>
          </div>
          {!current && <div className="panel-sub" style={{ marginTop: 8 }}>Choose a zone from the list or the map menu to edit it.</div>}
        </Panel>
      </div>
    </>
  )
}

// ---- shifts and capacity ------------------------------------------------------------------------------------------

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const NEED: Record<string, number> = { Westlands: 4, Kilimani: 3, CBD: 4, Karen: 2 }
const PER_DAY = Object.values(NEED).reduce((a, b) => a + b, 0)

function mondayOf(offsetWeeks: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)
  return d
}

function ShiftForm({ week, day, riderId, shift }: { week: number; day: number; riderId?: string; shift?: Shift }) {
  const { riders, shifts, setShifts, closeModal, toast, log } = useStore()
  const team = riders.filter((r) => r.status === 'Online' || r.status === 'Offline')
  const [rid, setRid] = useState(shift?.riderId ?? riderId ?? team[0]!.id)
  const [d, setD] = useState(String(shift?.day ?? day))
  const [zone, setZone] = useState(shift?.zone ?? 'Westlands')
  const [window, setWindow] = useState<string>(shift?.window ?? SHIFT_WINDOWS[0])
  const [error, setError] = useState('')

  const save = () => {
    const dayN = Number(d)
    const clash = shifts.find((s) => s.riderId === rid && s.week === week && s.day === dayN && s.id !== shift?.id)
    if (clash) return setError(`${riders.find((r) => r.id === rid)?.name} already has a shift that day`)
    const next: Shift = { id: shift?.id ?? `sh-${Date.now()}`, riderId: rid, day: dayN, week, zone, window }
    setShifts(shift ? shifts.map((s) => (s.id === shift.id ? next : s)) : [...shifts, next])
    log(`${shift ? 'Updated' : 'Added'} shift · ${riders.find((r) => r.id === rid)?.name} (${DAYS[dayN]})`, 'Riders')
    toast(shift ? 'Shift updated' : 'Shift added')
    closeModal()
  }
  return (
    <>
      {error && <div style={{ marginBottom: 10 }}><Notice tone="error" mark="!">{error}</Notice></div>}
      <Field label="Rider" value={rid} onChange={(v) => { setRid(v); setError('') }} options={team.map((r) => ({ value: r.id, label: r.name }))} />
      <div className="form-grid">
        <Field label="Day" value={d} onChange={(v) => { setD(v); setError('') }} options={DAYS.map((x, i) => ({ value: String(i), label: x }))} />
        <Field label="Zone" value={zone} onChange={setZone} options={Object.keys(NEED)} />
      </div>
      <Field label="Shift window" value={window} onChange={setWindow} options={SHIFT_WINDOWS} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        {shift && <Btn variant="danger" onClick={() => { setShifts(shifts.filter((s) => s.id !== shift.id)); log(`Removed shift · ${riders.find((r) => r.id === shift.riderId)?.name}`, 'Riders'); toast('Shift removed'); closeModal() }}>Remove shift</Btn>}
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={save}>{shift ? 'Save shift' : 'Add shift'}</Btn>
      </div>
    </>
  )
}

export function ShiftPlanner() {
  const { shifts, riders, openModal, can } = useStore()
  const [week, setWeek] = useState(0)
  const edit = can('Riders', 'Edit')

  const mon = mondayOf(week)
  const sat = new Date(mon.getTime() + 5 * 86_400_000)
  const title = `Week of ${mon.getDate()} ${mon.toLocaleString('en-GB', { month: 'long' })} ${mon.getFullYear()}`
  const dates = DAYS.map((_, i) => new Date(mon.getTime() + i * 86_400_000).getDate())
  const inWeek = shifts.filter((s) => s.week === week)
  const team = [...new Set(inWeek.map((s) => s.riderId))].map((id) => riders.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r).slice(0, 10)
  const today = (new Date().getDay() + 6) % 7
  const day = week === 0 ? Math.min(today, 5) : 0
  const byDay = DAYS.map((_, i) => inWeek.filter((s) => s.day === i).length)
  const gaps = byDay.map((n, i) => ({ i, n })).filter((g) => g.n < PER_DAY - 2)
  const capacity = Math.min(100, Math.round((byDay[day]! / PER_DAY) * 100))
  const zoneToday = Object.entries(NEED).map(([z, need]) => ({ z, pct: Math.min(100, Math.round((inWeek.filter((s) => s.day === day && s.zone === z).length / need) * 100)) }))
  const weakest = [...zoneToday].sort((a, b) => a.pct - b.pct)[0]!

  return (
    <>
      <PageHead
        title="Rider shifts and capacity planner"
        desc="Plan rider coverage and capacity by zone and day."
        actions={
          <>
            <Btn onClick={() => setWeek(week - 1)}>Previous week</Btn>
            <Btn onClick={() => setWeek(0)} disabled={week === 0}>This week</Btn>
            <Btn onClick={() => setWeek(week + 1)}>Next week</Btn>
            <Btn variant="primary" disabled={!edit} onClick={() => openModal({ title: 'Create rider shift', message: 'Choose a rider, zone, and shift window.', body: <ShiftForm week={week} day={day} />, noActions: true })}>Add shift</Btn>
          </>
        }
      />
      <div className="grid stats" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <Stat label="Scheduled riders" value={String(new Set(inWeek.map((s) => s.riderId)).size)} trend="Across all zones" icon="♙" />
        <Stat label="Capacity today" value={`${capacity}%`} trend="Projected utilization" icon="▦" up={capacity >= 80} />
        <Stat label="Coverage gaps" value={String(gaps.length)} trend={gaps[0] ? `${DAYS[gaps[0].i]} is under-staffed` : 'Every day is covered'} icon="!" up={gaps.length === 0} />
        <Stat label="Open shifts" value={String(Math.max(0, PER_DAY * 6 - inWeek.length))} trend="Available for riders" icon="＋" />
      </div>
      <section className="card panel" style={{ overflow: 'auto' }}>
        <div className="panel-head">
          <div>
            <h2>Weekly rider coverage</h2>
            <div className="panel-sub">{`Nairobi · ${title} (${mon.getDate()}–${sat.getDate()})`}</div>
          </div>
          <div className="actions"><Badge tone="blue">Assigned shift</Badge><Badge tone="amber">Peak window</Badge></div>
        </div>
        <div className="shift-grid">
          <div />
          {DAYS.map((d, i) => <div className="shift-hour" key={d}>{`${d} ${dates[i]}`}</div>)}
          {team.map((r) => (
            <Fragment key={r.id}>
              <div className="shift-name">{r.name}</div>
              {DAYS.map((d, i) => {
                const s = inWeek.find((x) => x.riderId === r.id && x.day === i)
                return (
                  <button
                    key={`${r.id}-${i}`}
                    type="button"
                    className={`shift-cell ${s ? (s.window.includes('peak') ? 'busy' : 'booked') : 'off'}`}
                    title={s ? `${r.name} · ${d} · ${s.zone} · ${s.window}` : `${r.name} · ${d} · no shift`}
                    aria-label={s ? `${r.name} ${d}: ${s.zone}, ${s.window}` : `${r.name} ${d}: no shift. Add one`}
                    disabled={!edit}
                    onClick={() => openModal({ title: s ? 'Shift details' : 'Create rider shift', message: s ? `${r.name} · ${d}` : 'Choose a zone and shift window.', body: <ShiftForm week={week} day={i} riderId={r.id} shift={s} />, noActions: true })}>
                    {s && <span style={{ fontSize: 8, color: 'var(--ink)' }}>{s.zone}</span>}
                  </button>
                )
              })}
            </Fragment>
          ))}
        </div>
        {team.length === 0 && <div className="panel-sub" style={{ marginTop: 12 }}>No shifts this week yet. Use “Add shift”.</div>}
        <div className="panel-sub" style={{ marginTop: 12 }}>Select a shift block to view or change it, or an empty block to add one.</div>
      </section>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 13 }}>
        <Panel title="Zone capacity today">
          {zoneToday.map((x) => (
            <div className="setting-row" key={x.z}>
              <span style={{ flex: 1 }}>
                <strong>{x.z}</strong>
                <div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${x.pct}%` }} /></div>
              </span>
              <b style={{ fontSize: 10 }}>{`${x.pct}%`}</b>
            </div>
          ))}
        </Panel>
        <Panel title="Coverage alerts">
          {weakest.pct < 100 ? <Notice tone="warning" mark="!">{`${weakest.z} has only ${weakest.pct}% of the riders it needs ${week === 0 ? 'today' : 'that day'}. Add a shift or open it to riders.`}</Notice> : <Notice mark="✓" tone="success">Every zone is covered.</Notice>}
          {gaps.slice(0, 2).map((g) => <div key={g.i} style={{ marginTop: 8 }}><Notice>{`${DAYS[g.i]} has ${g.n} riders scheduled; ${PER_DAY} are recommended.`}</Notice></div>)}
          <SettingRow title="Planning target" sub="Riders needed per day, all zones" right={<span className="prod-name">{PER_DAY}</span>} />
        </Panel>
      </div>
    </>
  )
}
