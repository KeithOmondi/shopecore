import { useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, patch, post } from '../lib/api'
import { dateTime } from '../lib/format'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')

// ---- reviews --------------------------------------------------------------------------------------------------------

interface Review { id: string; customer: string; rating: number; text: string; topic: string; state: 'visible' | 'flagged' | 'hidden'; reply: string | null; repliedBy: string | null; checked: boolean; order: string | null; at: string; complaint: boolean }
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

function ReplyForm({ r, onDone }: { r: Review; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [text, setText] = useState(r.reply ?? '')
  const [err, setErr] = useState('')
  const go = async () => {
    if (!text.trim()) return setErr('Write a reply')
    try { await post(`/v1/admin/reviews/${r.id}/reply`, { text: text.trim() }); onDone(); closeModal(); toast('Reply published') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Notice mark="i">{`${r.customer}: “${r.text || 'No comment'}”`}</Notice>
      <Field label="Your public reply" multiline value={text} onChange={(v) => { setText(v); setErr('') }} error={err} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Publish reply</Btn></div>
    </>
  )
}

export function Reviews() {
  const { can, openModal, toast } = useStore()
  const [state, setState] = useState('')
  const [complaints, setComplaints] = useState(false)
  const { data, failed, loading, reload } = useGet<{ items: Review[]; summary: { count: number; average: number | null; complaints: number } }>(`/v1/admin/reviews?limit=100${state ? `&state=${state}` : ''}${complaints ? '&complaints=true' : ''}`, 60_000)
  const edit = can('Support', 'Edit')
  const mark = async (r: Review, s: Review['state']) => { try { await post(`/v1/admin/reviews/${r.id}/state`, { state: s }); toast(s === 'hidden' ? 'Review hidden' : s === 'flagged' ? 'Review flagged' : 'Review is visible'); reload() } catch (e) { toast(says(e)) } }
  const cols: Column<Review>[] = [
    { key: 'r', header: 'Rating', sort: (a, b) => a.rating - b.rating, render: (r) => <span style={{ color: r.complaint ? 'var(--red)' : undefined }}>{stars(r.rating)}</span> },
    { key: 'c', header: 'Customer', render: (r) => <div><b>{r.customer}</b><div className="subtext">{r.order ?? ''}{r.topic ? ` · ${r.topic}` : ''}</div></div> },
    { key: 't', header: 'Review', render: (r) => <div style={{ maxWidth: 320 }}>{r.text || <span className="subtext">No comment</span>}{r.reply && <div className="subtext">{`Reply: ${r.reply}`}</div>}</div> },
    { key: 's', header: 'State', render: (r) => <Badge tone={r.state === 'visible' ? 'green' : r.state === 'flagged' ? 'amber' : 'gray'}>{r.state}</Badge> },
    { key: 'a', header: 'Date', sort: (a, b) => Date.parse(a.at) - Date.parse(b.at), render: (r) => dateTime(Date.parse(r.at)) },
  ]
  return (
    <>
      <PageHead title="Reviews" desc="What shoppers say about their orders. Reply publicly, or hide anything that breaks your rules." actions={<Btn onClick={reload}>Refresh</Btn>} />
      <div className="tile-row">
        <Stat label="Reviews" value={String(data?.summary.count ?? '—')} trend="Not counting hidden" icon="★" />
        <Stat label="Average" value={data?.summary.average == null ? '—' : data.summary.average.toFixed(2)} trend="Out of 5" icon="◈" />
        <Stat label="Complaints" value={String(data?.summary.complaints ?? '—')} trend="1 or 2 stars" icon="!" up={(data?.summary.complaints ?? 0) === 0} />
      </div>
      <DataTable title="Reviews" rows={data?.items ?? []} rowKey={(r) => r.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the reviews.' : undefined} onRetry={reload}
        searchLabel="Search reviews" searchText={(r) => `${r.customer} ${r.text} ${r.order ?? ''}`} emptyTitle="No reviews" empty="Reviews appear when shoppers rate a delivered order."
        tools={<>
          <select className="select" aria-label="State" value={state} onChange={(e) => setState(e.target.value)}><option value="">All states</option><option value="visible">Visible</option><option value="flagged">Flagged</option><option value="hidden">Hidden</option></select>
          <select className="select" aria-label="Kind" value={complaints ? 'c' : ''} onChange={(e) => setComplaints(e.target.value === 'c')}><option value="">All ratings</option><option value="c">Complaints only</option></select>
        </>}
        actions={(r) => (
          <div className="sp-row">
            <Btn small disabled={!edit} onClick={() => openModal({ title: r.reply ? 'Edit your reply' : 'Reply to review', body: <ReplyForm r={r} onDone={reload} />, noActions: true })}>{r.reply ? 'Edit reply' : 'Reply'}</Btn>
            {r.state !== 'hidden' ? <Btn small disabled={!edit} onClick={() => void mark(r, 'hidden')}>Hide</Btn> : <Btn small disabled={!edit} onClick={() => void mark(r, 'visible')}>Show</Btn>}
            {r.state === 'visible' && <Btn small disabled={!edit} onClick={() => void mark(r, 'flagged')}>Flag</Btn>}
          </div>
        )} />
    </>
  )
}

// ---- help articles --------------------------------------------------------------------------------------------------

interface Article { id: string; title: string; category: string; body: string; live: boolean; views: number; author: string; updatedAt: string }

function ArticleForm({ a, categories, onDone }: { a?: Article; categories: string[]; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ title: a?.title ?? '', category: a?.category ?? categories[0] ?? 'General', body: a?.body ?? '', live: a?.live ?? false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const full = useGet<{ body: string }>(a ? `/v1/admin/articles/${a.id}` : null)
  const body = a && full.data && f.body === '' && !(a.body) ? full.data.body : f.body
  const save = async () => {
    if (!f.title.trim()) return setErr('Give the article a title')
    if (f.live && body.trim().length < 20) return setErr('Write the article before publishing')
    setBusy(true)
    try { const payload = { title: f.title.trim(), category: f.category.trim() || 'General', body, live: f.live }; if (a) await patch(`/v1/admin/articles/${a.id}`, payload); else await post('/v1/admin/articles', payload); onDone(); closeModal(); toast('Article saved') } catch (e) { setErr(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <Field label="Title (the question)" value={f.title} onChange={(v) => setF((x) => ({ ...x, title: v }))} />
      <Field label="Topic" value={f.category} onChange={(v) => setF((x) => ({ ...x, category: v }))} hint="Shoppers see articles grouped by topic. Existing topics: " />
      <div className="sp-row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>{categories.map((c) => <button key={c} className="pill" onClick={() => setF((x) => ({ ...x, category: c }))}>{c}</button>)}</div>
      <Field label="Answer" multiline value={body} onChange={(v) => setF((x) => ({ ...x, body: v }))} error={err} />
      <label className="sp-row" style={{ gap: 6, marginBottom: 8 }}><input type="checkbox" checked={f.live} onChange={(e) => setF((x) => ({ ...x, live: e.target.checked }))} /> Show in the app</label>
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={() => void save()}>Save article</Btn></div>
    </>
  )
}

export function KnowledgeBase() {
  const { can, openModal } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Article[] }>('/v1/admin/articles')
  const missed = useGet<{ items: { q: string; count: number }[] }>('/v1/admin/help/missed-searches')
  const rows = data?.items ?? []
  const categories = [...new Set(rows.map((a) => a.category))]
  const cols: Column<Article>[] = [
    { key: 't', header: 'Article', sort: (a, b) => a.title.localeCompare(b.title), render: (a) => <div><b>{a.title}</b><div className="subtext">{a.category}</div></div> },
    { key: 's', header: 'In the app', render: (a) => <Badge tone={a.live ? 'green' : 'gray'}>{a.live ? 'Live' : 'Draft'}</Badge> },
    { key: 'v', header: 'Views', sort: (a, b) => a.views - b.views, render: (a) => a.views },
    { key: 'u', header: 'Updated', render: (a) => dateTime(Date.parse(a.updatedAt)) },
  ]
  return (
    <>
      <PageHead title="Help centre articles" desc="The answers shoppers read in the app." actions={<Btn variant="primary" disabled={!can('Support', 'Create')} onClick={() => openModal({ title: 'New article', body: <ArticleForm categories={categories} onDone={reload} />, noActions: true })}>New article</Btn>} />
      <div className="sp-two">
        <DataTable title="Articles" rows={rows} rowKey={(a) => a.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the articles.' : undefined} onRetry={reload} searchLabel="Search articles" searchText={(a) => `${a.title} ${a.category}`} emptyTitle="No articles yet" empty="Write answers to the questions shoppers ask most."
          actions={(a) => <Btn small disabled={!can('Support', 'Edit')} onClick={() => openModal({ title: 'Edit article', body: <ArticleForm a={a} categories={categories} onDone={reload} />, noActions: true })}>Edit</Btn>} />
        <Panel title="Searches with no answer" sub="What shoppers looked for and didn’t find. Write these next.">
          {missed.data?.items.length === 0 && <div className="panel-sub">Nothing missing so far.</div>}
          {missed.data?.items.slice(0, 12).map((m) => <SettingRow key={m.q} title={m.q} right={<Badge tone="gray">{`${m.count}×`}</Badge>} />)}
        </Panel>
      </div>
    </>
  )
}

// ---- canned replies -------------------------------------------------------------------------------------------------

interface Canned { id: string; title: string; category: string; text: string; uses: number; live: boolean }

function CannedForm({ c, onDone }: { c?: Canned; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ title: c?.title ?? '', category: c?.category ?? 'General', text: c?.text ?? '', live: c?.live ?? true })
  const [err, setErr] = useState('')
  const save = async () => {
    if (!f.title.trim() || !f.text.trim()) return setErr('Add a title and the reply text')
    try { if (c) await patch(`/v1/admin/canned-replies/${c.id}`, f); else await post('/v1/admin/canned-replies', f); onDone(); closeModal(); toast('Reply saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <div className="sp-form2"><Field label="Title" value={f.title} onChange={(v) => setF((x) => ({ ...x, title: v }))} /><Field label="Group" value={f.category} onChange={(v) => setF((x) => ({ ...x, category: v }))} /></div>
      <Field label="Reply text" multiline value={f.text} onChange={(v) => { setF((x) => ({ ...x, text: v })); setErr('') }} error={err} />
      <label className="sp-row" style={{ gap: 6, marginBottom: 8 }}><input type="checkbox" checked={f.live} onChange={(e) => setF((x) => ({ ...x, live: e.target.checked }))} /> Available to the team</label>
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void save()}>Save reply</Btn></div>
    </>
  )
}

export function CannedResponses() {
  const { can, openModal } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Canned[] }>('/v1/admin/canned-replies')
  const cols: Column<Canned>[] = [
    { key: 't', header: 'Reply', render: (c) => <div><b>{c.title}</b><div className="subtext">{c.category}</div></div> },
    { key: 'x', header: 'Text', render: (c) => <div style={{ maxWidth: 380 }}>{c.text}</div> },
    { key: 'u', header: 'Used', sort: (a, b) => a.uses - b.uses, render: (c) => c.uses },
    { key: 's', header: 'Status', render: (c) => <Badge tone={c.live ? 'green' : 'gray'}>{c.live ? 'Available' : 'Off'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Saved replies" desc="Answers the team uses again and again. Pick one while replying to a ticket." actions={<Btn variant="primary" disabled={!can('Support', 'Create')} onClick={() => openModal({ title: 'New saved reply', body: <CannedForm onDone={reload} />, noActions: true })}>New reply</Btn>} />
      <DataTable title="Saved replies" rows={data?.items ?? []} rowKey={(c) => c.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the replies.' : undefined} onRetry={reload} searchLabel="Search replies" searchText={(c) => `${c.title} ${c.text}`} emptyTitle="No saved replies yet" empty="Add the answers you give most often."
        actions={(c) => <Btn small disabled={!can('Support', 'Edit')} onClick={() => openModal({ title: 'Edit saved reply', body: <CannedForm c={c} onDone={reload} />, noActions: true })}>Edit</Btn>} />
    </>
  )
}

