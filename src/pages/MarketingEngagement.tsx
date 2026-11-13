import { useState } from 'react'

import { Stats } from '../components/finance-ui'
import { fromInput, PhoneFrame, toInput } from '../components/marketing-ui'
import { Detail, Person, useNow, when } from '../components/support-ui'
import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, Stat, Toggle, type Column } from '../components/ui'
import { factsOf, inSegment, optIn, pointsFor, RULE_FIELDS, smsParts, type Message, type Push, type Rule, type RuleField, type Segment } from '../data/marketing'
import { isComplaint } from '../data/support'
import { kes } from '../lib/format'
import { useMarketing } from '../lib/marketing'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useSupport } from '../lib/support'

const DAY = 86_400_000
const SMS_PRICE = 0.8
const tomorrow9 = (now: number) => { const d = new Date(now + DAY); d.setHours(9, 0, 0, 0); return d.getTime() }
const stTone = (s: string) => (s === 'Sent' ? 'green' : s === 'Scheduled' ? 'blue' : 'gray')

// ---- push notifications --------------------------------------------------------------------------------------------------

function PushComposer({ initial }: { initial?: Push }) {
  const m = useMarketing()
  const { openModal, toast, can } = useStore()
  const now = useNow()
  const [v, setV] = useState({ title: initial?.title ?? '', body: initial?.body ?? '', segmentId: initial?.segmentId ?? 'sg-all', deepLink: initial?.deepLink ?? 'shopcore://collection/new', at: toInput(initial?.at ?? tomorrow9(now)), quiet: initial?.quiet ?? true, cap: initial?.cap ?? true, now: false })
  const [err, setErr] = useState<Record<string, string>>({})
  const edit = can('Marketing', 'Edit') || can('Marketing', 'Create')
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const a = m.audience(v.segmentId)
  const at = v.now ? null : fromInput(v.at)
  const clash = v.cap ? m.pushConflict(at ?? now, v.segmentId, initial?.id) : undefined
  const suppressed = clash ? a.push : 0
  const sent = m.pushes.filter((p) => p.stats)
  const rate = (k: 'opened' | 'converted') => sent.reduce((n, p) => n + p.stats![k], 0) / Math.max(1, sent.reduce((n, p) => n + p.stats!.sent, 0))
  const build = (): Omit<Push, 'id' | 'stats' | 'status'> => ({ title: v.title.trim(), body: v.body.trim(), segmentId: v.segmentId, deepLink: v.deepLink.trim(), at, quiet: v.quiet, cap: v.cap })
  const check = (draft: boolean) => {
    const e: Record<string, string> = {}
    if (!v.title.trim()) e.title = 'Write a title'
    if (!draft) {
      if (!v.body.trim()) e.body = 'Write the message'
      if (!/^shopcore:\/\/\S+$/.test(v.deepLink.trim())) e.deepLink = 'A deep link starts with shopcore://'
      if (!v.now && !(fromInput(v.at) > Date.now())) e.at = 'Choose a time in the future, or send now'
      if (clash) e.at = `“${clash.title}” already goes to this audience that day. Pick another day or turn off the one-a-day limit.`
      if (a.push === 0) e.segmentId = 'Nobody in this audience has push turned on'
    }
    setErr(e)
    return !Object.keys(e).length
  }
  const draft = () => { if (!check(true)) return; m.savePush({ ...build(), id: initial?.id, status: 'Draft' }, 'draft'); toast('Draft saved') }
  const send = () => {
    if (!check(false)) return
    const nowMode = v.now
    openModal({ title: nowMode ? 'Send push notification now?' : 'Schedule push notification?', message: `${a.push.toLocaleString('en-US')} devices will get “${v.title.trim()}”${nowMode ? ' straight away.' : ` at ${when(fromInput(v.at))}.`}`, confirm: nowMode ? 'Send now' : 'Schedule', onConfirm: () => { m.savePush({ ...build(), id: initial?.id, status: 'Draft' }, nowMode ? 'now' : 'schedule'); toast(nowMode ? 'Push sent' : 'Push scheduled') } })
  }
  return (
    <>
      <div className="sp-row end" style={{ marginBottom: 12 }}><Btn disabled={!edit} onClick={draft}>Save draft</Btn><Btn variant="primary" disabled={!edit} onClick={send}>{v.now ? 'Send push' : 'Schedule push'}</Btn></div>
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Message details" sub="Keep the title short and the body action-oriented" right={<Badge tone={stTone(initial?.status ?? 'Draft')}>{initial?.status ?? 'Draft'}</Badge>}>
            <Field label="Notification title" value={v.title} onChange={(x) => set('title')(x.slice(0, 45))} error={err.title} hint={`${v.title.length} / 45 characters`} />
            <Field label="Message" multiline value={v.body} onChange={(x) => set('body')(x.slice(0, 120))} error={err.body} hint={`${v.body.length} / 120 characters`} />
            <div className="sp-form2">
              <Field label="Audience segment" value={v.segmentId} onChange={set('segmentId')} error={err.segmentId} options={m.segments.map((s) => ({ value: s.id, label: `${s.name} · ${m.audience(s.id).push.toLocaleString('en-US')} with push` }))} />
              <Field label="Deep link" value={v.deepLink} onChange={set('deepLink')} error={err.deepLink} />
              <Field label="When" value={v.now ? 'now' : 'later'} onChange={(x) => set('now')(x === 'now')} options={[{ value: 'later', label: 'Schedule for later' }, { value: 'now', label: 'Send immediately' }]} />
              {!v.now && <Field label="Delivery date and time" type="datetime-local" value={v.at} onChange={set('at')} error={err.at} />}
            </div>
            {v.now && err.at && <div className="sp-err">{err.at}</div>}
            <div className="sp-row" style={{ marginTop: 4 }}>
              <label className="sp-row" style={{ fontSize: 11, gap: 6 }}><input type="checkbox" checked={v.quiet} onChange={(e) => set('quiet')(e.target.checked)} /> Respect customer quiet hours</label>
              <label className="sp-row" style={{ fontSize: 11, gap: 6 }}><input type="checkbox" checked={v.cap} onChange={(e) => set('cap')(e.target.checked)} /> Limit to one campaign a day</label>
            </div>
          </Panel>
          <Panel title="Audience summary">
            <Detail label="Estimated reach">{a.push.toLocaleString('en-US')} devices</Detail>
            <Detail label="Push permission rate">{a.total ? Math.round((a.push / a.total) * 100) : 0}%</Detail>
            <Detail label="Held back by the daily limit">{suppressed.toLocaleString('en-US')}</Detail>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Phone preview" sub="ShopCore app notification">
            <PhoneFrame label="Notification preview"><div style={{ background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginTop: 14 }}><div className="sp-row" style={{ fontSize: 9, color: 'var(--muted)', gap: 6 }}><Person name="ShopCore" size={20} /> SHOPCORE <span style={{ marginLeft: 'auto' }}>now</span></div><div style={{ fontSize: 11, fontWeight: 700, marginTop: 8 }}>{v.title || 'Your title appears here'}</div><div style={{ fontSize: 10, marginTop: 3 }}>{v.body || 'Your message appears here.'}</div></div></PhoneFrame>
          </Panel>
          <Panel title="Recent performance" sub={`Last ${sent.length} sent pushes`}>
            <Detail label="Average open rate">{(rate('opened') * 100).toFixed(1)}%</Detail><Detail label="Average conversion">{(rate('converted') * 100).toFixed(1)}%</Detail>
            <div style={{ marginTop: 8 }}><Btn small onClick={() => navigate('/marketing/analytics')}>View report</Btn></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

export function PushNotifications() {
  const m = useMarketing()
  const [editing, setEditing] = useState<Push | undefined>()
  const [n, setN] = useState(0)
  const cols: Column<Push>[] = [
    { key: 't', header: 'Notification', render: (p) => <><b>{p.title}</b><span className="sp-sub">{p.body.slice(0, 70)}</span></> },
    { key: 'a', header: 'Audience', render: (p) => m.segments.find((s) => s.id === p.segmentId)?.name ?? '—' },
    { key: 'w', header: 'When', sort: (a, b) => (a.at ?? 0) - (b.at ?? 0), render: (p) => (p.at ? when(p.at) : '—') },
    { key: 's', header: 'Sent', render: (p) => p.stats?.sent.toLocaleString('en-US') ?? '—' },
    { key: 'o', header: 'Opened', render: (p) => (p.stats ? `${((p.stats.opened / Math.max(1, p.stats.sent)) * 100).toFixed(1)}%` : '—') },
    { key: 'st', header: 'Status', render: (p) => <Badge tone={stTone(p.status)}>{p.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="Push notifications" desc="Compose a customer-app notification, choose an audience and schedule delivery." />
      <PushComposer key={`${editing?.id ?? 'new'}-${n}`} initial={editing} />
      <div style={{ height: 14 }} />
      <DataTable title="Push history" rows={m.pushes} rowKey={(p) => p.id} columns={cols} searchLabel="Search notifications" searchText={(p) => `${p.title} ${p.body}`} pageSize={5}
        actions={(p) => (p.status === 'Sent' ? <span className="subtext">Sent</span> : <Btn small onClick={() => { setEditing(p); setN(n + 1); window.scrollTo({ top: 0 }) }}>Edit</Btn>)} />
    </>
  )
}

// ---- sms and email --------------------------------------------------------------------------------------------------------

function MessageForm({ channel }: { channel: 'Email' | 'SMS' }) {
  const m = useMarketing()
  const { closeModal, toast } = useStore()
  const now = useNow()
  const [v, setV] = useState({ name: '', segmentId: 'sg-all', subject: '', body: '', when: 'draft' as 'draft' | 'now' | 'later', at: toInput(tomorrow9(now)) })
  const [err, setErr] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const a = m.audience(v.segmentId)
  const reach = channel === 'Email' ? a.email : a.sms
  const parts = smsParts(v.body)
  const save = () => {
    const e: Record<string, string> = {}
    if (!v.name.trim()) e.name = 'Name the campaign'
    if (v.when !== 'draft') {
      if (channel === 'Email' && !v.subject.trim()) e.subject = 'Write a subject line'
      if (!v.body.trim()) e.body = 'Write the message'
      if (reach === 0) e.segmentId = `Nobody in this audience has ${channel === 'Email' ? 'subscribed to email' : 'opted in to SMS'}`
      if (v.when === 'later' && !(fromInput(v.at) > Date.now())) e.at = 'Choose a time in the future'
    }
    setErr(e)
    if (Object.keys(e).length) return
    m.saveMessage({ name: v.name.trim(), channel, segmentId: v.segmentId, subject: v.subject.trim(), body: v.body.trim(), at: v.when === 'later' ? fromInput(v.at) : null, status: 'Draft' }, v.when === 'draft' ? 'draft' : v.when === 'now' ? 'now' : 'schedule')
    closeModal()
    toast(v.when === 'draft' ? 'Draft saved' : v.when === 'now' ? `${channel} sent` : `${channel} scheduled`)
  }
  return (
    <>
      <Field label="Campaign name" value={v.name} onChange={set('name')} error={err.name} />
      <Field label="Audience" value={v.segmentId} onChange={set('segmentId')} error={err.segmentId} options={m.segments.map((s) => ({ value: s.id, label: `${s.name} · ${(channel === 'Email' ? m.audience(s.id).email : m.audience(s.id).sms).toLocaleString('en-US')} reachable` }))} />
      {channel === 'Email' && <Field label="Subject line" value={v.subject} onChange={set('subject')} error={err.subject} />}
      <Field label="Message" multiline value={v.body} onChange={set('body')} error={err.body} hint={channel === 'SMS' ? `${v.body.length} characters · ${parts} SMS part${parts === 1 ? '' : 's'} · about ${kes(Math.round(reach * parts * SMS_PRICE))} to send` : undefined} />
      <div className="sp-form2"><Field label="When" value={v.when} onChange={(x) => set('when')(x as 'draft' | 'now' | 'later')} options={[{ value: 'draft', label: 'Save as draft' }, { value: 'now', label: 'Send now' }, { value: 'later', label: 'Schedule' }]} />{v.when === 'later' && <Field label="Send at" type="datetime-local" value={v.at} onChange={set('at')} error={err.at} />}</div>
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={save}>{v.when === 'draft' ? 'Save draft' : v.when === 'now' ? `Send ${channel}` : 'Schedule'}</Btn></div>
    </>
  )
}

export function MessageCampaigns() {
  const m = useMarketing()
  const { openModal, can } = useStore()
  const [channel, setChannel] = useState('All channels')
  const [status, setStatus] = useState('All statuses')
  const rows = m.messages.filter((x) => (channel === 'All channels' || x.channel === channel) && (status === 'All statuses' || x.status === status))
  const sentEmail = m.messages.filter((x) => x.channel === 'Email' && x.stats)
  const sentSms = m.messages.filter((x) => x.channel === 'SMS' && x.stats)
  const frac = (list: Message[], k: 'delivered' | 'clicks') => list.reduce((n, x) => n + x.stats![k], 0) / Math.max(1, list.reduce((n, x) => n + x.stats!.sent, 0))
  const cols: Column<Message>[] = [
    { key: 'n', header: 'Campaign', sort: (a, b) => a.name.localeCompare(b.name), render: (x) => <b>{x.name}</b> },
    { key: 'c', header: 'Channel', render: (x) => x.channel },
    { key: 'a', header: 'Audience', render: (x) => m.segments.find((s) => s.id === x.segmentId)?.name ?? '—' },
    { key: 's', header: 'Sent', render: (x) => x.stats?.sent.toLocaleString('en-US') ?? '—' },
    { key: 'o', header: 'Open / delivery', render: (x) => (x.stats ? `${((x.stats.delivered / Math.max(1, x.stats.sent)) * 100).toFixed(1)}%` : '—') },
    { key: 'k', header: 'Clicks', render: (x) => x.stats?.clicks ?? '—' },
    { key: 'st', header: 'Status', render: (x) => <Badge tone={stTone(x.status)}>{x.status}</Badge> },
  ]
  return (
    <>
      <PageHead title="SMS and email campaigns" desc="Plan customer messaging across SMS and email, with delivery and engagement reporting." actions={<><Btn disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'Create email', body: <MessageForm channel="Email" />, noActions: true })}>Create email</Btn><Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'Create SMS', body: <MessageForm channel="SMS" />, noActions: true })}>Create SMS</Btn></>} />
      <Stats>
        <Stat label="Messages sent" value={m.messages.reduce((n, x) => n + (x.stats?.sent ?? 0), 0).toLocaleString('en-US')} trend={`${m.messages.filter((x) => x.status === 'Sent').length} campaigns`} icon="✉" />
        <Stat label="Email open rate" value={`${(frac(sentEmail, 'delivered') * 100).toFixed(1)}%`} trend={`${sentEmail.length} sent`} icon="↗" />
        <Stat label="SMS delivery rate" value={`${(frac(sentSms, 'delivered') * 100).toFixed(1)}%`} trend={`${sentSms.length} sent`} icon="✓" />
      </Stats>
      <DataTable title={`${rows.length} campaigns`} rows={rows} rowKey={(x) => x.id} columns={cols} searchLabel="Search campaigns" searchText={(x) => `${x.name} ${x.channel}`}
        tools={<><select className="sp-select auto" aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)}><option>All channels</option><option>Email</option><option>SMS</option></select><select className="sp-select auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option><option>Draft</option><option>Scheduled</option><option>Sent</option></select></>} />
    </>
  )
}

// ---- segments ----------------------------------------------------------------------------------------------------------------

function SegmentEditor({ seg }: { seg: Segment | null }) {
  const m = useMarketing()
  const { customers, orders, toast, openModal, can } = useStore()
  const now = useNow()
  const [v, setV] = useState({ name: seg?.name ?? '', purpose: seg?.purpose ?? 'Campaign audience', desc: seg?.desc ?? '', match: seg?.match ?? 'all', rules: seg?.rules ?? ([{ field: 'area', op: 'is', value: 'Westlands' }] as Rule[]) })
  const [err, setErr] = useState('')
  const facts = factsOf(customers, orders)
  const probe: Segment = { id: 'probe', name: v.name, purpose: v.purpose, desc: v.desc, match: v.match, rules: v.rules }
  const hit = facts.filter((f) => inSegment(probe, f, now))
  const reach = { push: hit.filter((f) => optIn(f.c).push).length, email: hit.filter((f) => optIn(f.c).email).length, sms: hit.filter((f) => optIn(f.c).sms).length }
  const readOnly = !!seg?.system || !can('Marketing', 'Edit')
  const setRule = (i: number, patch: Partial<Rule>) => { setV({ ...v, rules: v.rules.map((r, x) => (x === i ? { ...r, ...patch } : r)) }); setErr('') }
  const changeField = (i: number, f: RuleField) => setRule(i, { field: f, op: RULE_FIELDS[f].ops[0]!, value: f === 'area' ? 'Westlands' : f === 'lastOrder' ? '30' : '5000' })
  const save = () => {
    if (!v.name.trim()) return setErr('Name the segment')
    if (m.segments.some((s) => s.id !== seg?.id && s.name.toLowerCase() === v.name.trim().toLowerCase())) return setErr('Another segment already has that name')
    const bad = v.rules.find((r) => r.op !== 'never' && !r.value.trim())
    if (bad) return setErr('Every rule needs a value')
    const num = v.rules.find((r) => r.field !== 'area' && r.op !== 'never' && !(Number(r.value) >= 0))
    if (num) return setErr(`“${RULE_FIELDS[num.field].label}” needs a number`)
    m.saveSegment({ id: seg?.id, name: v.name.trim(), purpose: v.purpose, desc: v.desc.trim(), match: v.match, rules: v.rules })
    toast('Audience segment saved')
  }
  return (
    <div className="sp-two">
      <div className="sp-stack">
        <Panel title="Segment rules" sub={v.match === 'all' ? 'Customers match all rules below' : 'Customers match any rule below'} right={<select className="sp-select auto" aria-label="Match" value={v.match} disabled={readOnly} onChange={(e) => setV({ ...v, match: e.target.value as 'all' | 'any' })}><option value="all">Match all rules (AND)</option><option value="any">Match any rule (OR)</option></select>}>
          {v.rules.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 1fr auto', gap: 8, marginBottom: 8 }}>
              <select className="sp-select" aria-label="Rule field" value={r.field} disabled={readOnly} onChange={(e) => changeField(i, e.target.value as RuleField)}>{Object.entries(RULE_FIELDS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select>
              <select className="sp-select" aria-label="Operator" value={r.op} disabled={readOnly} onChange={(e) => setRule(i, { op: e.target.value })}>{RULE_FIELDS[r.field].ops.map((o) => <option key={o}>{o}</option>)}</select>
              {r.field === 'area' ? <select className="sp-select" aria-label="Area" value={r.value} disabled={readOnly} onChange={(e) => setRule(i, { value: e.target.value })}>{[...new Set(customers.map((c) => c.area))].sort().map((a) => <option key={a}>{a}</option>)}</select> : <input className="sp-input" aria-label="Value" value={r.op === 'never' ? '' : r.value} disabled={readOnly || r.op === 'never'} onChange={(e) => setRule(i, { value: e.target.value })} />}
              <Btn small disabled={readOnly} onClick={() => setV({ ...v, rules: v.rules.filter((_, x) => x !== i) })} label="Remove rule">×</Btn>
            </div>
          ))}
          <Btn small disabled={readOnly} onClick={() => setV({ ...v, rules: [...v.rules, { field: 'spend', op: 'greater than', value: '5000' }] })}>＋ Add rule</Btn>
          {!v.rules.length && <p className="panel-sub" style={{ marginTop: 8 }}>With no rules, everyone matches.</p>}
        </Panel>
        <Panel title="Segment details">
          <div className="sp-form2"><Field label="Segment name" value={v.name} onChange={(x) => { setV({ ...v, name: x }); setErr('') }} /><Field label="Purpose" value={v.purpose} onChange={(x) => setV({ ...v, purpose: x as Segment['purpose'] })} options={['Campaign audience', 'Loyalty tier', 'Internal analysis']} /></div>
          <Field label="Description" value={v.desc} onChange={(x) => setV({ ...v, desc: x })} />
          {err && <div className="sp-err" role="alert">{err}</div>}
          <div className="sp-row end sp-gap">
            {seg && !seg.system && <Btn variant="danger" disabled={readOnly} onClick={() => openModal({ title: `Delete ${seg.name}?`, message: 'This can’t be undone.', confirm: 'Delete', danger: true, onConfirm: () => { const e = m.deleteSegment(seg.id); toast(e ?? 'Segment deleted') } })}>Delete</Btn>}
            <Btn variant="primary" disabled={readOnly} onClick={save}>Save segment</Btn>
          </div>
          {seg?.system && <p className="panel-sub">This built-in segment can’t be changed.</p>}
        </Panel>
      </div>
      <div className="sp-stack">
        <Panel title="Estimated audience" sub="Updates as you change the rules" right={<Badge tone="green">Live estimate</Badge>}>
          <div className="fin-total">{hit.length.toLocaleString('en-US')} <span className="panel-sub">customers</span></div>
          <div className="progress" style={{ margin: '10px 0' }}><i style={{ width: `${(hit.length / Math.max(1, customers.length)) * 100}%` }} /></div>
          <Detail label="Share of all customers">{((hit.length / Math.max(1, customers.length)) * 100).toFixed(1)}%</Detail>
          <Detail label="Average lifetime spend">{kes(hit.reduce((n, f) => n + f.c.spent, 0) / Math.max(1, hit.length))}</Detail>
          <Detail label="Average orders">{(hit.reduce((n, f) => n + f.c.orders, 0) / Math.max(1, hit.length)).toFixed(1)}</Detail>
        </Panel>
        <Panel title="Reachability">
          <Detail label="Push enabled">{reach.push}</Detail><Detail label="Email subscribed">{reach.email}</Detail><Detail label="SMS opted in">{reach.sms}</Detail>
          <div style={{ marginTop: 10 }}><Btn small onClick={() => openModal({ title: 'Matching customers', body: <div>{hit.slice(0, 12).map((f) => <div className="list-row" key={f.c.id}><div className="sp-row"><Person name={f.c.name} /><div><b style={{ fontSize: 11 }}>{f.c.name}</b><div className="panel-sub">{f.c.area} · {kes(f.c.spent)} · {f.c.orders} orders</div></div></div></div>)}{hit.length > 12 && <p className="panel-sub">and {hit.length - 12} more</p>}{!hit.length && <p className="panel-sub">Nobody matches yet.</p>}</div>, noActions: true })}>Preview matching customers</Btn></div>
        </Panel>
      </div>
    </div>
  )
}

export function AudienceSegments() {
  const m = useMarketing()
  const { can } = useStore()
  const [sel, setSel] = useState<string>(m.segments[2]?.id ?? 'new')
  const seg = m.segments.find((s) => s.id === sel) ?? null
  return (
    <>
      <PageHead title="Audience segments" desc="Build dynamic customer groups from location, spending and order activity." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => setSel('new')}>New segment</Btn>} />
      <div className="sp-row" style={{ marginBottom: 12 }}>{m.segments.map((s) => <button key={s.id} className={`btn small ${s.id === sel ? 'primary' : ''}`} aria-pressed={s.id === sel} onClick={() => setSel(s.id)}>{s.name} · {m.audience(s.id).total}</button>)}</div>
      <SegmentEditor key={sel} seg={seg} />
    </>
  )
}

// ---- loyalty ------------------------------------------------------------------------------------------------------------------

export function LoyaltyRules() {
  const m = useMarketing()
  const { customers, openModal, closeModal, toast, can } = useStore()
  const l = m.loyalty
  const [v, setV] = useState({ earnRate: String(l.earnRate), pointValue: String(l.pointValue), minOrder: String(l.minOrder), expiry: l.expiry, awardOnFees: l.awardOnFees, excludeRefunded: l.excludeRefunded, minRedeem: String(l.minRedeem), maxRedeemPct: String(l.maxRedeemPct), step: String(l.step), stackCoupons: l.stackCoupons })
  const [err, setErr] = useState<Record<string, string>>({})
  const [basket, setBasket] = useState('3500')
  const edit = can('Marketing', 'Edit')
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const issued = Math.floor((customers.reduce((n, c) => n + c.spent, 0) / 100) * l.earnRate)
  const redeemed = Math.round(issued * 0.4)
  const save = () => {
    const e: Record<string, string> = {}
    const n = (k: 'earnRate' | 'pointValue' | 'minOrder' | 'minRedeem' | 'maxRedeemPct' | 'step') => Number(v[k])
    if (!(n('earnRate') > 0)) e.earnRate = 'Enter points per KES 100, above 0'
    if (!(n('pointValue') > 0)) e.pointValue = 'Enter what a point is worth'
    if (!(n('minOrder') >= 0)) e.minOrder = 'Enter 0 or more'
    if (!(n('minRedeem') >= 1)) e.minRedeem = 'Enter 1 or more'
    if (!(n('maxRedeemPct') > 0 && n('maxRedeemPct') <= 100)) e.maxRedeemPct = 'Enter 1 to 100'
    if (!(n('step') >= 1)) e.step = 'Enter 1 or more'
    if (n('pointValue') * n('earnRate') / 100 > 0.2) e.earnRate = 'That would give back more than 20% of every order. Check the numbers.'
    setErr(e)
    if (Object.keys(e).length) return
    m.setLoyalty({ ...l, earnRate: n('earnRate'), pointValue: n('pointValue'), minOrder: n('minOrder'), expiry: v.expiry, awardOnFees: v.awardOnFees, excludeRefunded: v.excludeRefunded, minRedeem: n('minRedeem'), maxRedeemPct: n('maxRedeemPct'), step: n('step'), stackCoupons: v.stackCoupons })
    toast('Loyalty rules saved')
  }
  const addBonus = () => {
    const BonusForm = () => {
      const [name, setName] = useState('')
      const [sub, setSub] = useState('')
      const [e, setE] = useState('')
      return (
        <>
          <Field label="Bonus name" value={name} onChange={(x) => { setName(x); setE('') }} error={e} /><Field label="Description" value={sub} onChange={setSub} />
          <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { if (!name.trim()) return setE('Name the bonus'); m.setLoyalty({ ...l, bonuses: [...l.bonuses, { id: `lb${Date.now()}`, name: name.trim(), sub: sub.trim(), on: true }] }); closeModal(); toast('Bonus rule added') }}>Add bonus</Btn></div>
        </>
      )
    }
    openModal({ title: 'Add bonus rule', body: <BonusForm />, noActions: true })
  }
  return (
    <>
      <PageHead title="Loyalty points rules" desc="Set how ShopCore Rewards members earn and redeem points." actions={<Btn variant="primary" disabled={!edit} onClick={save}>Save rules</Btn>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Earn points" sub="Default earning rates for eligible purchases" right={<Badge tone={l.active ? 'green' : 'gray'}>{l.active ? 'Program active' : 'Paused'}</Badge>}>
            <div className="sp-form2">
              <Field label="Points per KES 100 spent" type="number" value={v.earnRate} onChange={set('earnRate')} error={err.earnRate} /><Field label="Value per point (KES)" type="number" value={v.pointValue} onChange={set('pointValue')} error={err.pointValue} />
              <Field label="Minimum qualifying order (KES)" type="number" value={v.minOrder} onChange={set('minOrder')} error={err.minOrder} /><Field label="Points expire after" value={v.expiry} onChange={set('expiry')} options={['12 months of inactivity', '6 months of inactivity', 'Never']} />
            </div>
            <label className="sp-row" style={{ fontSize: 11, gap: 6 }}><input type="checkbox" checked={v.awardOnFees} onChange={(e) => set('awardOnFees')(e.target.checked)} /> Award points on delivery fees</label>
            <label className="sp-row" style={{ fontSize: 11, gap: 6, marginTop: 6 }}><input type="checkbox" checked={v.excludeRefunded} onChange={(e) => set('excludeRefunded')(e.target.checked)} /> Exclude refunded or cancelled items</label>
          </Panel>
          <Panel title="Redeem points">
            <div className="sp-form2">
              <Field label="Minimum points to redeem" type="number" value={v.minRedeem} onChange={set('minRedeem')} error={err.minRedeem} /><Field label="Maximum order discount (%)" type="number" value={v.maxRedeemPct} onChange={set('maxRedeemPct')} error={err.maxRedeemPct} />
              <Field label="Redemption increment (points)" type="number" value={v.step} onChange={set('step')} error={err.step} /><Field label="Combine with coupons" value={v.stackCoupons ? 'Allowed' : 'Not allowed'} onChange={(x) => set('stackCoupons')(x === 'Allowed')} options={['Allowed', 'Not allowed']} />
            </div>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Try it" sub="Points on a basket under the saved rules">
            <Field label="Basket (KES)" type="number" value={basket} onChange={setBasket} />
            {(() => { const p = pointsFor(l, Number(basket) || 0, 250); return <Notice tone={p ? 'success' : 'warning'} mark={p ? '✓' : '!'}>{p ? `Earns ${p} points, worth ${kes(p * l.pointValue)} off a later order.` : `Below the ${kes(l.minOrder)} minimum, so no points.`}</Notice> })()}
          </Panel>
          <Panel title="Member summary" sub="Estimated from order history">
            <div className="fin-total">{customers.length.toLocaleString('en-US')}</div><div className="panel-sub">Rewards members</div>
            <Detail label="Points issued">{issued.toLocaleString('en-US')}</Detail><Detail label="Points redeemed">{redeemed.toLocaleString('en-US')}</Detail><Detail label="Outstanding points liability">{kes((issued - redeemed) * l.pointValue)}</Detail>
            <div style={{ marginTop: 8 }}><Btn small onClick={() => navigate('/marketing/analytics')}>View analytics</Btn></div>
          </Panel>
          <Panel title="Bonus earning events">
            {l.bonuses.map((b) => <SettingRow key={b.id} title={b.name} sub={b.sub} right={<Toggle on={b.on} label={`Toggle ${b.name}`} onChange={(on) => { if (edit) m.setLoyalty({ ...l, bonuses: l.bonuses.map((x) => (x.id === b.id ? { ...x, on } : x)) }) }} />} />)}
            <div style={{ marginTop: 8 }}><Btn small disabled={!edit} onClick={addBonus}>Add bonus rule</Btn></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- referrals ------------------------------------------------------------------------------------------------------------------

export function ReferralSettings() {
  const m = useMarketing()
  const { toast, can } = useStore()
  const r = m.referral
  const [v, setV] = useState({ advocate: r.advocate, friend: r.friend, minSpend: String(r.minSpend), limit: String(r.limit), window: r.window, expiry: r.expiry, selfExclude: r.selfExclude, fraudReview: r.fraudReview, message: r.message })
  const [err, setErr] = useState<Record<string, string>>({})
  const edit = can('Marketing', 'Edit')
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const save = () => {
    const e: Record<string, string> = {}
    if (!(Number(v.minSpend) >= 0)) e.minSpend = 'Enter 0 or more'
    if (!(Number(v.limit) >= 1)) e.limit = 'Enter 1 or more'
    if (!v.message.trim()) e.message = 'Write the invite message'
    setErr(e)
    if (Object.keys(e).length) return
    m.setReferral({ ...r, ...v, minSpend: Number(v.minSpend), limit: Number(v.limit) })
    toast('Referral program saved')
  }
  return (
    <>
      <PageHead title="Referral program settings" desc="Reward customers who invite friends to ShopCore." actions={<><Btn onClick={() => navigate('/marketing/segments')}>View referral activity</Btn><Btn variant="primary" disabled={!edit} onClick={save}>Save program</Btn></>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Program configuration" sub="Control when advocates and friends receive rewards" right={<Toggle on={r.active} label="Referral program active" onChange={(on) => { if (edit) { m.setReferral({ ...r, active: on }); toast(on ? 'Referral program on' : 'Referral program paused') } }} />}>
            <div className="sp-form2">
              <Field label="Advocate reward" value={v.advocate} onChange={set('advocate')} options={['KES 300 ShopCore credit', '500 loyalty points', '10% discount coupon']} /><Field label="Friend reward" value={v.friend} onChange={set('friend')} options={['15% off first order', 'KES 300 off', 'Free delivery']} />
              <Field label="Friend minimum spend (KES)" type="number" value={v.minSpend} onChange={set('minSpend')} error={err.minSpend} /><Field label="Maximum referrals per customer" type="number" value={v.limit} onChange={set('limit')} error={err.limit} />
              <Field label="Reward approval window" value={v.window} onChange={set('window')} options={['After the first order is delivered', 'At checkout', 'After 7 days']} /><Field label="Referral code validity" value={v.expiry} onChange={set('expiry')} options={['14 days', '30 days', '60 days']} />
            </div>
            <label className="sp-row" style={{ fontSize: 11, gap: 6 }}><input type="checkbox" checked={v.selfExclude} onChange={(e) => set('selfExclude')(e.target.checked)} /> Exclude self-referrals and duplicate accounts</label>
            <label className="sp-row" style={{ fontSize: 11, gap: 6, marginTop: 6 }}><input type="checkbox" checked={v.fraudReview} onChange={(e) => set('fraudReview')(e.target.checked)} /> Apply fraud review before issuing credit</label>
          </Panel>
          <Panel title="Program message"><Field label="Invite copy" multiline value={v.message} onChange={set('message')} error={err.message} /></Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Program performance" sub="Last 30 days · sample figures until referrals are tracked" right={<Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Paused'}</Badge>}>
            <div className="sp-form2" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>{[['1,842', 'Invites sent'], ['286', 'New customers'], ['15.5%', 'Conversion']].map(([n, l]) => <div key={l}><div className="fin-total">{n}</div><div className="panel-sub">{l}</div></div>)}</div>
            <div style={{ marginTop: 10 }}><Detail label="Credit issued">KES 85,800</Detail><Detail label="Sales attributed">KES 1.28M</Detail><Detail label="Fraud checks flagged">4</Detail></div>
          </Panel>
          <Panel title="Share preview"><div className="sp-note"><div className="sp-label">ShopCore referral</div><b style={{ fontSize: 14 }}>Good things are better shared</b><p style={{ fontSize: 10, margin: '6px 0' }}>{v.message || 'Your invite message appears here.'}</p><Btn small onClick={() => toast('Invite link copied')}>Copy invite link</Btn></div></Panel>
        </div>
      </div>
    </>
  )
}

// ---- review highlights ---------------------------------------------------------------------------------------------------------------

export function ReviewHighlights() {
  const m = useMarketing()
  const { reviews } = useSupport()
  const { openModal, closeModal, toast, can } = useStore()
  const edit = can('Marketing', 'Edit')
  const shown = m.highlights.map((h) => ({ h, r: reviews.find((x) => x.id === h.reviewId) })).filter((x): x is { h: (typeof m.highlights)[number]; r: (typeof reviews)[number] } => !!x.r)
  const eligible = reviews.filter((r) => r.rating >= 4 && r.state === 'Visible' && !m.highlights.some((h) => h.reviewId === r.id))
  const avg = reviews.reduce((n, r) => n + r.rating, 0) / Math.max(1, reviews.length)
  const waiting = reviews.filter((r) => !r.checked)
  const add = () => {
    const AddForm = () => {
      const [id, setId] = useState(eligible[0]?.id ?? '')
      const [pl, setPl] = useState('Home · Featured')
      return eligible.length ? (
        <>
          <Field label="Review" value={id} onChange={setId} options={eligible.map((r) => ({ value: r.id, label: `${'★'.repeat(r.rating)} ${r.customerName}: ${r.text.slice(0, 50)}` }))} />
          <Field label="Placement" value={pl} onChange={setPl} options={['Home · Featured', 'Category page', 'App · New']} />
          <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { m.setHighlight(id, { placement: pl, published: false }); closeModal(); toast('Highlight added. Approve it to publish.') }}>Add highlight</Btn></div>
        </>
      ) : <Notice>No more 4 and 5 star reviews to feature.</Notice>
    }
    openModal({ title: 'Add highlight', body: <AddForm />, noActions: true })
  }
  return (
    <>
      <PageHead title="Reviews highlights" desc="Choose customer reviews to feature across your storefront." actions={<><Btn onClick={() => navigate('/support/reviews')}>Review moderation queue</Btn><Btn variant="primary" disabled={!edit} onClick={add}>Add highlight</Btn></>} />
      <Stats>
        <Stat label="Published highlights" value={String(m.highlights.filter((h) => h.published).length)} trend={`${new Set(m.highlights.filter((h) => h.published).map((h) => h.placement)).size} placements`} icon="☆" />
        <Stat label="Average rating" value={`${avg.toFixed(1)} / 5`} trend={`From ${reviews.length} reviews`} icon="★" />
        <Stat label="Reviews awaiting moderation" value={String(waiting.length)} trend={`${waiting.filter(isComplaint).length} are 1–2 star`} icon="!" up={waiting.length === 0} />
      </Stats>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))' }}>
        {shown.map(({ h, r }) => (
          <section className="card panel" key={h.reviewId}>
            <div className="sp-row between"><span className="panel-sub" style={{ fontWeight: 700 }}>{h.placement.toUpperCase()}</span><Badge tone={h.published ? 'green' : 'amber'}>{h.published ? 'Published' : 'Pending'}</Badge></div>
            <div className="sp-stars" style={{ marginTop: 8 }}>{'★'.repeat(r.rating)}<span className="off">{'★'.repeat(5 - r.rating)}</span></div>
            <blockquote style={{ fontSize: 12, lineHeight: 1.6, margin: '8px 0' }}>“{r.text}”</blockquote>
            <b style={{ fontSize: 11 }}>— {r.customerName}</b><div className="panel-sub">Verified order · {when(r.at)}</div>
            <div className="sp-row sp-gap">
              {!h.published && <Btn small variant="primary" disabled={!edit} onClick={() => { m.setHighlight(h.reviewId, { published: true }); toast('Highlight published') }}>Approve</Btn>}
              <select className="sp-select auto" aria-label="Placement" value={h.placement} disabled={!edit} onChange={(e) => m.setHighlight(h.reviewId, { placement: e.target.value })}>{['Home · Featured', 'Category page', 'App · New'].map((p) => <option key={p}>{p}</option>)}</select>
              <Btn small disabled={!edit} onClick={() => openModal({ title: 'Remove review highlight?', message: 'This review will no longer appear in featured placements.', confirm: 'Remove', danger: true, onConfirm: () => { m.setHighlight(h.reviewId, null); toast('Highlight removed') } })}>Remove</Btn>
            </div>
          </section>
        ))}
        {!shown.length && <Notice>No highlights yet. Add a 4 or 5 star review to feature it.</Notice>}
      </div>
      <p className="panel-sub" style={{ marginTop: 10 }}>Only visible 4 and 5 star reviews can be featured. Hidden or flagged reviews are never shown.</p>
    </>
  )
}
