import { useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, type Column } from '../components/ui'
import { ApiError, del, patch, post, put } from '../lib/api'
import { dateTime } from '../lib/format'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const fromLocal = (v: string) => new Date(v).toISOString()

interface Segment { id: string; name: string; purpose: string; match: 'all' | 'any'; rules: { field: string; op: string; value: string }[]; description: string; system: boolean; audience: { total: number; push: number; email: number; sms: number }; inUse: boolean; version: number }
const useSegments = () => useGet<{ items: Segment[] }>('/v1/admin/segments')
const statusTone = (s: string) => (s === 'sent' ? 'green' : s === 'scheduled' ? 'blue' : s === 'sending' ? 'amber' : 'gray')

// ---- push -----------------------------------------------------------------------------------------------------------

interface Push { id: string; title: string; body: string; segmentId: string; segment: string; deepLink: string; sendAt: string | null; quiet: boolean; cap: boolean; status: string; sentAt: string | null; stats: { delivered?: number; opened?: number; converted?: number } | null; version: number }

function PushForm({ p, onDone }: { p?: Push; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const segs = useSegments().data?.items ?? []
  const [f, setF] = useState({ title: p?.title ?? '', body: p?.body ?? '', segmentId: p?.segmentId ?? '', deepLink: p?.deepLink ?? '', sendAt: p?.sendAt ? toLocal(p.sendAt) : '', quiet: p?.quiet ?? true, cap: p?.cap ?? true })
  const [err, setErr] = useState('')
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  const go = async (action: 'draft' | 'schedule' | 'now') => {
    if (!f.title.trim() || !f.body.trim()) return setErr('Write a title and a message')
    if (action === 'schedule' && !f.sendAt) return setErr('Choose when to send it')
    const body = { title: f.title.trim(), body: f.body.trim(), segmentId: f.segmentId || segs[0]?.id, deepLink: f.deepLink.trim(), sendAt: action === 'schedule' ? fromLocal(f.sendAt) : null, quiet: f.quiet, cap: f.cap, action }
    try { if (p) await patch(`/v1/admin/pushes/${p.id}`, body); else await post('/v1/admin/pushes', body); onDone(); closeModal(); toast(action === 'now' ? 'Notification is being sent' : action === 'schedule' ? 'Notification scheduled' : 'Draft saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Field label={`Title (${f.title.length}/65)`} value={f.title} onChange={set('title')} error={err} />
      <Field label={`Message (${f.body.length}/240)`} multiline value={f.body} onChange={set('body')} />
      <div className="sp-form2"><Field label="Send to" value={f.segmentId || segs[0]?.id || ''} onChange={set('segmentId')} options={segs.map((s) => ({ value: s.id, label: `${s.name} (${s.audience.push} can get push)` }))} /><Field label="Opens (app path)" value={f.deepLink} onChange={set('deepLink')} placeholder="/product/<id>" /><Field label="Send at" type="datetime-local" value={f.sendAt} onChange={set('sendAt')} /></div>
      <label className="sp-row" style={{ gap: 6 }}><input type="checkbox" checked={f.quiet} onChange={(e) => set('quiet')(e.target.checked)} /> Wait out quiet hours (9 pm to 7 am)</label>
      <label className="sp-row" style={{ gap: 6, marginBottom: 8 }}><input type="checkbox" checked={f.cap} onChange={(e) => set('cap')(e.target.checked)} /> Skip people who already got a message today</label>
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn onClick={() => void go('draft')}>Save draft</Btn><Btn onClick={() => void go('schedule')}>Schedule</Btn><Btn variant="primary" onClick={() => void go('now')}>Send now</Btn></div>
    </>
  )
}

export function PushNotifications() {
  const { can, openModal, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Push[] }>('/v1/admin/pushes', 30_000)
  const cols: Column<Push>[] = [
    { key: 't', header: 'Notification', render: (p) => <div><b>{p.title}</b><div className="subtext">{p.body}</div></div> },
    { key: 's', header: 'To', render: (p) => p.segment },
    { key: 'st', header: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
    { key: 'w', header: 'When', render: (p) => (p.sentAt ? dateTime(Date.parse(p.sentAt)) : p.sendAt ? dateTime(Date.parse(p.sendAt)) : '—') },
    { key: 'r', header: 'Results', render: (p) => (p.stats ? `${p.stats.delivered ?? 0} delivered · ${p.stats.opened ?? 0} opened` : '—') },
  ]
  return (
    <>
      <PageHead title="Push notifications" desc="Messages that pop up on shoppers’ phones." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'New push notification', body: <PushForm onDone={reload} />, noActions: true })}>New notification</Btn>} />
      <Notice mark="i">Shoppers only get what they allowed in the app’s notification settings. Real delivery to phones needs the push provider to be connected.</Notice>
      <div style={{ marginTop: 12 }}><DataTable title="Notifications" rows={data?.items ?? []} rowKey={(p) => p.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the notifications.' : undefined} onRetry={reload} searchLabel="Search notifications" searchText={(p) => `${p.title} ${p.body}`} emptyTitle="Nothing yet" empty="Write a notification to tell shoppers about an offer."
        actions={(p) => <div className="sp-row">{(p.status === 'draft' || p.status === 'scheduled') && <Btn small disabled={!can('Marketing', 'Edit')} onClick={() => openModal({ title: 'Edit notification', body: <PushForm p={p} onDone={reload} />, noActions: true })}>Edit</Btn>}{p.status === 'scheduled' && <Btn small disabled={!can('Marketing', 'Edit')} onClick={() => void post(`/v1/admin/pushes/${p.id}/unschedule`).then(() => { reload(); toast('Back to draft') }, (e) => toast(says(e)))}>Unschedule</Btn>}</div>} /></div>
    </>
  )
}

// ---- email and SMS --------------------------------------------------------------------------------------------------

interface Message { id: string; name: string; channel: 'Email' | 'SMS'; segmentId: string; segment: string; subject: string; body: string; smsParts: number | null; sendAt: string | null; status: string; sentAt: string | null; stats: { delivered?: number; opened?: number; clicks?: number } | null; version: number }

function MessageForm({ m, onDone }: { m?: Message; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const segs = useSegments().data?.items ?? []
  const [f, setF] = useState({ name: m?.name ?? '', channel: m?.channel ?? 'Email', segmentId: m?.segmentId ?? '', subject: m?.subject ?? '', body: m?.body ?? '', sendAt: m?.sendAt ? toLocal(m.sendAt) : '' })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  const go = async (action: 'draft' | 'schedule' | 'now') => {
    if (!f.name.trim() || !f.body.trim()) return setErr('Name it and write the message')
    if (action === 'schedule' && !f.sendAt) return setErr('Choose when to send it')
    const body = { name: f.name.trim(), channel: f.channel, segmentId: f.segmentId || segs[0]?.id, subject: f.subject.trim(), body: f.body.trim(), sendAt: action === 'schedule' ? fromLocal(f.sendAt) : null, action }
    try { if (m) await patch(`/v1/admin/messages/${m.id}`, body); else await post('/v1/admin/messages', body); onDone(); closeModal(); toast(action === 'now' ? 'Message is being sent' : action === 'schedule' ? 'Message scheduled' : 'Draft saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <div className="sp-form2"><Field label="Name (for you)" value={f.name} onChange={set('name')} error={err} /><Field label="Channel" value={f.channel} onChange={set('channel')} options={['Email', 'SMS']} /><Field label="Send to" value={f.segmentId || segs[0]?.id || ''} onChange={set('segmentId')} options={segs.map((s) => ({ value: s.id, label: `${s.name} (${f.channel === 'SMS' ? s.audience.sms : s.audience.email} reachable)` }))} /><Field label="Send at" type="datetime-local" value={f.sendAt} onChange={set('sendAt')} /></div>
      {f.channel === 'Email' && <Field label="Subject" value={f.subject} onChange={set('subject')} />}
      <Field label={f.channel === 'SMS' ? `Message (${f.body.length} characters)` : 'Message'} multiline value={f.body} onChange={set('body')} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn onClick={() => void go('draft')}>Save draft</Btn><Btn onClick={() => void go('schedule')}>Schedule</Btn><Btn variant="primary" onClick={() => void go('now')}>Send now</Btn></div>
    </>
  )
}

export function MessageCampaigns() {
  const { can, openModal, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Message[] }>('/v1/admin/messages', 30_000)
  const cols: Column<Message>[] = [
    { key: 'n', header: 'Message', render: (m) => <div><b>{m.name}</b><div className="subtext">{m.channel}{m.smsParts ? ` · ${m.smsParts} SMS part${m.smsParts === 1 ? '' : 's'}` : ''} · {m.subject || m.body.slice(0, 50)}</div></div> },
    { key: 's', header: 'To', render: (m) => m.segment },
    { key: 'st', header: 'Status', render: (m) => <Badge tone={statusTone(m.status)}>{m.status}</Badge> },
    { key: 'w', header: 'When', render: (m) => (m.sentAt ? dateTime(Date.parse(m.sentAt)) : m.sendAt ? dateTime(Date.parse(m.sendAt)) : '—') },
    { key: 'r', header: 'Results', render: (m) => (m.stats ? `${m.stats.delivered ?? 0} delivered` : '—') },
  ]
  return (
    <>
      <PageHead title="Email and SMS" desc="Messages to groups of customers who agreed to hear from you." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'New message', body: <MessageForm onDone={reload} />, noActions: true })}>New message</Btn>} />
      <DataTable title="Messages" rows={data?.items ?? []} rowKey={(m) => m.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the messages.' : undefined} onRetry={reload} searchLabel="Search messages" searchText={(m) => `${m.name} ${m.subject}`} emptyTitle="No messages yet" empty="Write an email or SMS to a customer group."
        actions={(m) => <div className="sp-row">{(m.status === 'draft' || m.status === 'scheduled') && <Btn small disabled={!can('Marketing', 'Edit')} onClick={() => openModal({ title: 'Edit message', body: <MessageForm m={m} onDone={reload} />, noActions: true })}>Edit</Btn>}{m.status === 'scheduled' && <Btn small disabled={!can('Marketing', 'Edit')} onClick={() => void post(`/v1/admin/messages/${m.id}/unschedule`).then(() => { reload(); toast('Back to draft') }, (e) => toast(says(e)))}>Unschedule</Btn>}</div>} />
    </>
  )
}

// ---- segments -------------------------------------------------------------------------------------------------------

const RULE_OPS: Record<string, string[]> = { area: ['is', 'is not'], spend: ['greater than', 'less than'], orders: ['at least', 'at most'], lastOrder: ['within last (days)', 'more than (days) ago', 'never'] }
const RULE_LABEL: Record<string, string> = { area: 'Area', spend: 'Total spent (KES)', orders: 'Number of orders', lastOrder: 'Last order' }

function SegmentForm({ s, onDone }: { s?: Segment; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ name: s?.name ?? '', description: s?.description ?? '', match: s?.match ?? 'all' })
  const [rules, setRules] = useState(s?.rules ?? [])
  const [preview, setPreview] = useState<{ total: number; push: number; email: number; sms: number } | null>(null)
  const [err, setErr] = useState('')
  const check = async () => { try { setPreview(await post('/v1/admin/segments/preview', { match: f.match, rules })) } catch (e) { setErr(says(e)) } }
  const go = async () => {
    if (!f.name.trim()) return setErr('Name the group')
    try { const body = { name: f.name.trim(), description: f.description.trim(), match: f.match, rules }; if (s) await patch(`/v1/admin/segments/${s.id}`, body); else await post('/v1/admin/segments', body); onDone(); closeModal(); toast('Group saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Field label="Name" value={f.name} onChange={(v) => { setF((x) => ({ ...x, name: v })); setErr('') }} error={err} />
      <Field label="Description" value={f.description} onChange={(v) => setF((x) => ({ ...x, description: v }))} />
      <Field label="A customer belongs when…" value={f.match} onChange={(v) => setF((x) => ({ ...x, match: v as 'all' | 'any' }))} options={[{ value: 'all', label: 'every rule is true' }, { value: 'any', label: 'any rule is true' }]} />
      {rules.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <select aria-label="Field" value={r.field} onChange={(e) => setRules(rules.map((x, k) => (k === i ? { field: e.target.value, op: RULE_OPS[e.target.value]![0]!, value: '' } : x)))}>{Object.keys(RULE_OPS).map((k) => <option key={k} value={k}>{RULE_LABEL[k]}</option>)}</select>
          <select aria-label="Condition" value={r.op} onChange={(e) => setRules(rules.map((x, k) => (k === i ? { ...x, op: e.target.value } : x)))}>{RULE_OPS[r.field]!.map((o) => <option key={o}>{o}</option>)}</select>
          {r.op !== 'never' && <input aria-label="Value" value={r.value} onChange={(e) => setRules(rules.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />}
          <Btn small label="Remove rule" onClick={() => setRules(rules.filter((_, k) => k !== i))}>×</Btn>
        </div>
      ))}
      <Btn small onClick={() => setRules([...rules, { field: 'area', op: 'is', value: '' }])}>+ Add rule</Btn>
      {preview && <Notice mark="i">{`${preview.total} customers match: ${preview.push} can get push, ${preview.email} email, ${preview.sms} SMS.`}</Notice>}
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn onClick={() => void check()}>Count who matches</Btn><Btn variant="primary" onClick={() => void go()}>Save group</Btn></div>
    </>
  )
}

export function AudienceSegments() {
  const { can, openModal, toast } = useStore()
  const { data, failed, loading, reload } = useSegments()
  const cols: Column<Segment>[] = [
    { key: 'n', header: 'Group', render: (s) => <div><b>{s.name}</b><div className="subtext">{s.description || (s.rules.length ? `${s.rules.length} rule${s.rules.length === 1 ? '' : 's'}` : 'Everyone')}</div></div> },
    { key: 't', header: 'Customers', sort: (a, b) => a.audience.total - b.audience.total, render: (s) => s.audience.total },
    { key: 'c', header: 'Reachable by', render: (s) => `${s.audience.push} push · ${s.audience.email} email · ${s.audience.sms} SMS` },
    { key: 'u', header: '', render: (s) => (s.system ? <Badge tone="gray">Built in</Badge> : s.inUse ? <Badge tone="blue">In use</Badge> : null) },
  ]
  return (
    <>
      <PageHead title="Customer groups" desc="Groups you can send offers and messages to." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'New group', body: <SegmentForm onDone={reload} />, noActions: true })}>New group</Btn>} />
      <DataTable title="Groups" rows={data?.items ?? []} rowKey={(s) => s.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the groups.' : undefined} onRetry={reload} searchLabel="Search groups" searchText={(s) => `${s.name} ${s.description}`} emptyTitle="No groups" empty="Create a group to target an offer."
        actions={(s) => (s.system ? null : <div className="sp-row"><Btn small disabled={!can('Marketing', 'Edit')} onClick={() => openModal({ title: `Edit ${s.name}`, body: <SegmentForm s={s} onDone={reload} />, noActions: true })}>Edit</Btn><Btn small disabled={!can('Marketing', 'Delete') || s.inUse} onClick={() => openModal({ title: `Delete ${s.name}?`, confirm: 'Delete', danger: true, onConfirm: () => { void del(`/v1/admin/segments/${s.id}`).then(() => { reload(); toast('Group deleted') }, (e) => toast(says(e))) } })}>Delete</Btn></div>)} />
    </>
  )
}

// ---- loyalty and referrals ------------------------------------------------------------------------------------------

interface Loyalty { active: boolean; earnRate: number; pointValueCents: number; minOrderCents: number; expiry: string; awardOnFees: boolean; excludeRefunded: boolean; minRedeem: number; maxRedeemPct: number; step: number; stackCoupons: boolean; bonuses: { id: string; name: string; sub: string; on: boolean }[] }

function LoyaltyEditor({ l, onSaved }: { l: Loyalty; onSaved: () => void }) {
  const { can, toast } = useStore()
  const [f, setF] = useState({ ...l, minOrder: String(l.minOrderCents / 100), pointValue: String(l.pointValueCents / 100) })
  const [err, setErr] = useState('')
  const save = async () => {
    try { await put('/v1/admin/loyalty', { active: f.active, earnRate: Number(f.earnRate), pointValueCents: Math.round(Number(f.pointValue) * 100), minOrderCents: Math.round(Number(f.minOrder) * 100), expiry: f.expiry, awardOnFees: f.awardOnFees, excludeRefunded: f.excludeRefunded, minRedeem: Number(f.minRedeem), maxRedeemPct: Number(f.maxRedeemPct), step: Number(f.step), stackCoupons: f.stackCoupons, bonuses: f.bonuses }); onSaved(); toast('Loyalty rules saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <Panel title="Points programme" right={<Badge tone={f.active ? 'green' : 'gray'}>{f.active ? 'On' : 'Off'}</Badge>}>
      <Notice mark="i">These rules are saved now. Points balances and redeeming points in the customer app are still to come.</Notice>
      <label className="sp-row" style={{ gap: 6, margin: '8px 0' }}><input type="checkbox" checked={f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))} /> Programme is on</label>
      <div className="sp-form2">
        <Field label="Points earned per KES 100 spent" value={String(f.earnRate)} onChange={(v) => setF((x) => ({ ...x, earnRate: v as unknown as number }))} />
        <Field label="One point is worth (KES)" value={f.pointValue} onChange={(v) => setF((x) => ({ ...x, pointValue: v }))} />
        <Field label="Smallest order that earns (KES)" value={f.minOrder} onChange={(v) => setF((x) => ({ ...x, minOrder: v }))} />
        <Field label="Points expire after" value={f.expiry} onChange={(v) => setF((x) => ({ ...x, expiry: v }))} />
        <Field label="Smallest redemption (points)" value={String(f.minRedeem)} onChange={(v) => setF((x) => ({ ...x, minRedeem: v as unknown as number }))} />
        <Field label="Most of an order points can pay (%)" value={String(f.maxRedeemPct)} onChange={(v) => setF((x) => ({ ...x, maxRedeemPct: v as unknown as number }))} />
        <Field label="Redeem in steps of (points)" value={String(f.step)} onChange={(v) => setF((x) => ({ ...x, step: v as unknown as number }))} error={err} />
      </div>
      {([['awardOnFees', 'Earn points on delivery fees'], ['excludeRefunded', 'Don’t award points on refunded items'], ['stackCoupons', 'Points can be used together with a coupon']] as const).map(([k, label]) => <label key={k} className="sp-row" style={{ gap: 6 }}><input type="checkbox" checked={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.checked }))} /> {label}</label>)}
      <div className="sp-row end"><Btn variant="primary" disabled={!can('Marketing', 'Edit')} onClick={() => void save()}>Save rules</Btn></div>
    </Panel>
  )
}

export function LoyaltyRules() {
  const { data, failed, reload } = useGet<Loyalty>('/v1/admin/loyalty')
  return (
    <>
      <PageHead title="Loyalty rules" desc="How shoppers earn and spend points." />
      {!data && <div className="panel-sub">{failed ? 'We couldn’t load the rules.' : 'Loading…'}</div>}
      {data && <LoyaltyEditor key={JSON.stringify(data)} l={{ ...data, earnRate: Number(data.earnRate), minRedeem: Number(data.minRedeem), maxRedeemPct: Number(data.maxRedeemPct), step: Number(data.step) }} onSaved={reload} />}
    </>
  )
}

interface Referral { active: boolean; advocate: string; friend: string; minSpendCents: number; limit: number; window: string; expiry: string; selfExclude: boolean; fraudReview: boolean; message: string }

function ReferralEditor({ r, onSaved }: { r: Referral; onSaved: () => void }) {
  const { can, toast } = useStore()
  const [f, setF] = useState({ ...r, minSpend: String(r.minSpendCents / 100), limit: String(r.limit) })
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    try { await put('/v1/admin/referrals', { active: f.active, advocate: f.advocate, friend: f.friend, minSpendCents: Math.round(Number(f.minSpend) * 100), limit: Number(f.limit), window: f.window, expiry: f.expiry, selfExclude: f.selfExclude, fraudReview: f.fraudReview, message: f.message }); onSaved(); toast('Referral settings saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <Panel title="Refer a friend" right={<Badge tone={f.active ? 'green' : 'gray'}>{f.active ? 'On' : 'Off'}</Badge>}>
      <Notice mark="i">These settings are saved now. Referral codes and rewards in the customer app are still to come.</Notice>
      <label className="sp-row" style={{ gap: 6, margin: '8px 0' }}><input type="checkbox" checked={f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))} /> Programme is on</label>
      <div className="sp-form2"><Field label="What the referrer gets" value={f.advocate} onChange={set('advocate')} /><Field label="What the friend gets" value={f.friend} onChange={set('friend')} /><Field label="Friend’s smallest order (KES)" value={f.minSpend} onChange={set('minSpend')} /><Field label="Most rewards per person" value={f.limit} onChange={set('limit')} /><Field label="Reward is released" value={f.window} onChange={set('window')} /><Field label="Reward expires after" value={f.expiry} onChange={set('expiry')} /></div>
      <Field label="Message shoppers see" multiline value={f.message} onChange={set('message')} error={err} />
      {([['selfExclude', 'Don’t reward referring yourself'], ['fraudReview', 'Review suspicious referrals before rewarding']] as const).map(([k, label]) => <label key={k} className="sp-row" style={{ gap: 6 }}><input type="checkbox" checked={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.checked }))} /> {label}</label>)}
      <div className="sp-row end"><Btn variant="primary" disabled={!can('Marketing', 'Edit')} onClick={() => void save()}>Save settings</Btn></div>
    </Panel>
  )
}

export function ReferralSettings() {
  const { data, failed, reload } = useGet<Referral>('/v1/admin/referrals')
  return (
    <>
      <PageHead title="Referral settings" desc="The offer for shoppers who bring a friend." />
      {!data && <div className="panel-sub">{failed ? 'We couldn’t load the settings.' : 'Loading…'}</div>}
      {data && <ReferralEditor key={JSON.stringify(data)} r={data} onSaved={reload} />}
    </>
  )
}

// ---- review highlights ----------------------------------------------------------------------------------------------

interface Highlight { reviewId: string; customer: string; rating: number; body: string; topic: string; at: string; highlight: { placement: string; published: boolean } | null }

export function ReviewHighlights() {
  const { can, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Highlight[] }>('/v1/admin/review-highlights')
  const edit = can('Marketing', 'Edit')
  const act = async (what: () => Promise<unknown>) => { try { await what(); reload() } catch (e) { toast(says(e)) } }
  const cols: Column<Highlight>[] = [
    { key: 'r', header: 'Review', render: (h) => <div><span>{'★'.repeat(h.rating)}</span> <b>{h.customer.split(' ')[0]}</b><div className="subtext" style={{ maxWidth: 360 }}>{h.body || 'No comment'}</div></div> },
    { key: 's', header: 'On the app', render: (h) => (h.highlight ? <Badge tone={h.highlight.published ? 'green' : 'gray'}>{`${h.highlight.published ? 'Showing' : 'Hidden'} · ${h.highlight.placement}`}</Badge> : <span className="subtext">Not chosen</span>) },
  ]
  return (
    <>
      <PageHead title="Review highlights" desc="Pick good reviews to feature. Only a customer’s first name is shown." />
      <DataTable title="Reviews (4 stars and up)" rows={data?.items ?? []} rowKey={(h) => h.reviewId} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the reviews.' : undefined} onRetry={reload} searchLabel="Search reviews" searchText={(h) => `${h.customer} ${h.body}`} emptyTitle="No reviews to feature yet" empty="Good reviews appear here once shoppers rate their orders."
        actions={(h) => (h.highlight ? <div className="sp-row"><Btn small disabled={!edit} onClick={() => void act(() => put(`/v1/admin/review-highlights/${h.reviewId}`, { published: !h.highlight!.published }))}>{h.highlight.published ? 'Hide' : 'Show'}</Btn><Btn small disabled={!edit} onClick={() => void act(() => del(`/v1/admin/review-highlights/${h.reviewId}`))}>Remove</Btn></div> : <Btn small variant="primary" disabled={!edit} onClick={() => void act(() => put(`/v1/admin/review-highlights/${h.reviewId}`, { placement: 'Home · Featured', published: true }))}>Feature</Btn>)} />
    </>
  )
}
