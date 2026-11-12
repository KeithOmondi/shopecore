import { useRef, useState } from 'react'

import { ago, Detail, Person, useNow, when } from '../components/support-ui'
import { Badge, Btn, downloadCsv, Field, PageHead, Panel, Stat } from '../components/ui'
import { ARTICLE_CATEGORIES, CANNED_CATEGORIES, isComplaint, TOKENS, type Article, type Canned, type Review } from '../data/support'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useSupport } from '../lib/support'

// ---- reviews and complaints ---------------------------------------------------------------------------------

function ReplyForm({ review }: { review: Review }) {
  const { replyReview } = useSupport()
  const { closeModal, toast } = useStore()
  const [text, setText] = useState(review.reply ?? '')
  const [err, setErr] = useState('')
  return (
    <>
      <div className="sp-note" style={{ marginBottom: 12 }}><b>{review.customerName} · {review.rating}/5</b><br />“{review.text}”</div>
      <Field label="Your public reply" multiline value={text} onChange={(v) => { setText(v); setErr('') }} placeholder="Be kind and specific. Never share personal details." error={err} />
      <div className="sp-row end">
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={() => { if (!text.trim()) return setErr('Write a reply first'); replyReview(review.id, text.trim()); closeModal(); toast('Reply posted') }}>Post reply</Btn>
      </div>
    </>
  )
}

export function Reviews() {
  const { reviews, setReviewState } = useSupport()
  const { openModal, toast, can } = useStore()
  const now = useNow()
  const [tab, setTab] = useState<'All' | 'Complaints' | 'Reviews'>('All')
  const [sort, setSort] = useState<'new' | 'low'>('new')
  const edit = can('Support', 'Edit')
  const complaints = reviews.filter(isComplaint)
  const list = reviews.filter((r) => (tab === 'All' ? true : tab === 'Complaints' ? isComplaint(r) : !isComplaint(r))).sort((a, b) => (sort === 'new' ? b.at - a.at : a.rating - b.rating || b.at - a.at))
  const unanswered = complaints.filter((r) => !r.reply && r.state !== 'Hidden')
  const avg = reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : 0
  const waiting = reviews.filter((r) => !r.checked)

  return (
    <>
      <PageHead title="Reviews and complaints moderation" desc="Review public feedback, route complaints and keep customer conversations respectful." actions={<Btn onClick={() => { downloadCsv('reviews.csv', ['Customer', 'Rating', 'Topic', 'State', 'Review', 'Reply'], reviews.map((r) => [r.customerName, r.rating, r.topic, r.state, r.text, r.reply ?? ''])); toast('Moderation report exported') }}>Export report</Btn>} />
      <div className="sp-stats3">
        <Stat label="Awaiting moderation" value={String(waiting.length)} trend={`${waiting.filter(isComplaint).length} flagged as complaints`} icon="☆" up={waiting.length === 0} />
        <Stat label="Average rating" value={`${avg.toFixed(1)} / 5`} trend={`Across ${reviews.length} reviews`} icon="★" />
        <Stat label="Unanswered complaints" value={String(unanswered.length)} trend={`${unanswered.filter((r) => now - r.at > 86_400_000).length} older than 24 hours`} icon="!" up={unanswered.length === 0} />
      </div>
      <div className="sp-two">
        <Panel>
          <div className="sp-row" style={{ marginBottom: 12 }}>
            {(['All', 'Complaints', 'Reviews'] as const).map((t) => <button key={t} className={`btn small ${tab === t ? 'primary' : ''}`} onClick={() => setTab(t)} aria-pressed={tab === t}>{t} {t === 'All' ? reviews.length : t === 'Complaints' ? complaints.length : reviews.length - complaints.length}</button>)}
            <select className="sp-select auto" style={{ marginLeft: 'auto' }} aria-label="Sort reviews" value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'low')}><option value="new">Newest first</option><option value="low">Lowest rating</option></select>
          </div>
          {list.map((r) => (
            <article key={r.id} className={`sp-review ${r.state === 'Hidden' ? 'hidden' : ''}`}>
              <div className="sp-row">
                <Person name={r.customerName} />
                <div style={{ flex: 1 }}><b style={{ fontSize: 11 }}>{r.customerName}</b><div className="panel-sub">{r.topic} · {ago(r.at, now)}</div></div>
                {r.state !== 'Visible' && <Badge tone={r.state === 'Hidden' ? 'gray' : 'amber'}>{r.state}</Badge>}
                <Badge tone={isComplaint(r) ? 'red' : 'green'}>{isComplaint(r) ? 'Complaint' : 'Positive'}</Badge>
              </div>
              <div className="sp-stars" style={{ marginTop: 8 }} aria-label={`${r.rating} out of 5 stars`}>{'★'.repeat(r.rating)}<span className="off">{'★'.repeat(5 - r.rating)}</span></div>
              <p>“{r.text}”</p>
              {r.reply && <div className="sp-reply"><b>Your reply:</b> {r.reply}</div>}
              <div className="sp-row">
                <Btn small disabled={!edit} onClick={() => openModal({ title: r.reply ? 'Edit your reply' : `Reply to ${r.customerName}`, body: <ReplyForm review={r} />, noActions: true })}>{r.reply ? 'Edit reply' : 'Reply'}</Btn>
                <Btn small disabled={!edit} onClick={() => { setReviewState(r.id, r.state === 'Flagged' ? 'Visible' : 'Flagged'); toast(r.state === 'Flagged' ? 'Flag removed' : 'Feedback flagged for review') }}>{r.state === 'Flagged' ? 'Unflag' : 'Flag'}</Btn>
                <Btn small disabled={!edit} onClick={() => r.state === 'Hidden' ? (setReviewState(r.id, 'Visible'), toast('Review is visible again')) : openModal({ title: 'Hide this review?', message: 'This review will be hidden from public view while the moderation team checks it.', confirm: 'Hide review', danger: true, onConfirm: () => { setReviewState(r.id, 'Hidden'); toast('Review hidden') } })}>{r.state === 'Hidden' ? 'Show again' : 'Hide'}</Btn>
                {isComplaint(r) && r.orderId && <Btn small onClick={() => navigate(`/orders/${r.orderId}`)}>View order</Btn>}
              </div>
            </article>
          ))}
          {!list.length && <p className="panel-sub">Nothing here.</p>}
        </Panel>
        <div className="sp-stack">
          <Panel title="Moderation guide">
            <p className="panel-sub" style={{ margin: '7px 0 12px' }}>Keep feedback visible unless it contains personal information, spam or abusive content.</p>
            <Detail label="Response target">24 hours</Detail>
            <Detail label="Escalate when">Safety or privacy concern</Detail>
            <div style={{ marginTop: 10 }}><Btn small onClick={() => navigate('/support/help')}>Open policy guide</Btn></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- knowledge base -------------------------------------------------------------------------------------------

function ArticleEditor({ article, onDone }: { article: Article | null; onDone: (id: string) => void }) {
  const { saveArticle } = useSupport()
  const { openModal, toast, can } = useStore()
  const [title, setTitle] = useState(article?.title ?? '')
  const [category, setCategory] = useState(article?.category ?? ARTICLE_CATEGORIES[0])
  const [body, setBody] = useState(article?.body ?? '')
  const [err, setErr] = useState<Record<string, string>>({})
  const edit = can('Support', 'Edit') || (!article && can('Support', 'Create'))
  const check = (needBody: boolean) => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Give the article a clear title'
    if (needBody && !body.trim()) e.body = 'Write the answer before publishing'
    setErr(e)
    return !Object.keys(e).length
  }
  const save = (live: boolean) => { const id = saveArticle({ id: article?.id, title: title.trim(), category, body: body.trim() }, live); toast(live ? 'Article published' : 'Article saved as draft'); onDone(id) }
  return (
    <Panel title={article ? 'Article editor' : 'New article'} sub={article ? 'Edit the selected article.' : 'Write a new help article.'}>
      <Field label="Title" value={title} onChange={(v) => { setTitle(v); setErr({}) }} error={err.title} />
      <Field label="Category" value={category} onChange={setCategory} options={ARTICLE_CATEGORIES} />
      <Field label="Answer" multiline value={body} onChange={(v) => { setBody(v); setErr({}) }} error={err.body} hint="Plain, short sentences. Say what to tap in the app." />
      <div className="sp-row end">
        <Btn disabled={!edit} onClick={() => check(false) && save(false)}>Save draft</Btn>
        <Btn variant="primary" disabled={!edit} onClick={() => check(true) && openModal({ title: 'Publish article?', message: 'This answer will be visible to customers in the ShopCore app.', confirm: 'Publish', onConfirm: () => save(true) })}>Publish</Btn>
      </div>
    </Panel>
  )
}

export function KnowledgeBase() {
  const { articles, missingSearches, addMissingToBacklog } = useSupport()
  const { openModal, closeModal, can } = useStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string>(articles[0]?.id ?? 'new')
  const shown = articles.filter((a) => `${a.title} ${a.category}`.toLowerCase().includes(q.trim().toLowerCase()))
  const current = sel === 'new' ? null : articles.find((a) => a.id === sel) ?? null

  return (
    <>
      <PageHead
        title="Knowledge base and FAQ editor"
        desc="Keep customer help content accurate across the ShopCore apps."
        actions={
          <>
            <Btn disabled={!current} onClick={() => current && openModal({ title: `Preview · ${current.title}`, body: <><Badge tone={current.live ? 'green' : 'amber'}>{current.live ? 'Live' : 'Draft'}</Badge><h3 style={{ margin: '10px 0 6px', fontSize: 15 }}>{current.title}</h3><p style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{current.body || 'No answer written yet.'}</p><div className="sp-row end sp-gap"><Btn variant="primary" onClick={closeModal}>Done</Btn></div></>, noActions: true })}>Preview</Btn>
            <Btn variant="primary" disabled={!can('Support', 'Create')} onClick={() => setSel('new')}>+ New article</Btn>
          </>
        }
      />
      <div className="sp-editor">
        <div className="sp-stack">
          <Panel title="Help articles" sub="Content currently available in the customer app" right={<input className="sp-input" style={{ width: 210 }} aria-label="Search articles" placeholder="Search articles" value={q} onChange={(e) => setQ(e.target.value)} />}>
            {shown.map((a) => (
              <div className={`sp-list-row ${a.id === sel ? 'active' : ''}`} key={a.id}>
                <div><b>{a.title}</b><span className="sp-sub">{a.category}</span></div>
                <span><Badge tone={a.live ? 'green' : 'amber'}>{a.live ? 'Live' : 'Draft'}</Badge></span>
                <span className="panel-sub">{a.live ? `${a.views.toLocaleString('en-US')} views` : '—'}</span>
                <Btn small onClick={() => setSel(a.id)}>Edit</Btn>
              </div>
            ))}
            {!shown.length && <p className="panel-sub">No articles match.</p>}
          </Panel>
          <Panel title="Popular searches with no answer" sub="Ideas from recent customer searches" right={<Btn small disabled={!missingSearches.length || !can('Support', 'Create')} onClick={addMissingToBacklog}>Add to backlog</Btn>}>
            {missingSearches.map((m) => <div className="sp-detail" key={m.q}><b>{m.q}</b><span>{m.count} searches</span></div>)}
            {!missingSearches.length && <p className="panel-sub">Nothing missing right now. The suggestions were added as drafts above.</p>}
          </Panel>
        </div>
        <div className="sp-stack">
          <ArticleEditor key={sel} article={current} onDone={setSel} />
          {current && (
            <Panel title="Publishing status">
              <Detail label="Status">{current.live ? 'Live' : 'Draft'}</Detail>
              <Detail label="Last saved">{when(current.updatedAt)}</Detail>
              <Detail label="Locale">English (Kenya)</Detail>
              <Detail label="Author">{current.author}</Detail>
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}

// ---- canned responses --------------------------------------------------------------------------------------------

function CannedEditor({ item, onDone }: { item: Canned | null; onDone: (id: string) => void }) {
  const { saveCanned, deleteCanned } = useSupport()
  const { openModal, toast, can } = useStore()
  const [title, setTitle] = useState(item?.title ?? '')
  const [category, setCategory] = useState(item?.category ?? CANNED_CATEGORIES[0])
  const [text, setText] = useState(item?.text ?? '')
  const [err, setErr] = useState<Record<string, string>>({})
  const area = useRef<HTMLTextAreaElement>(null)
  const edit = can('Support', 'Edit')
  const insert = (token: string) => {
    const el = area.current
    const at = el?.selectionStart ?? text.length
    setText(`${text.slice(0, at)}${token}${text.slice(el?.selectionEnd ?? at)}`)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length) })
  }
  const save = (live: boolean) => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Give the response a short title'
    if (!text.trim()) e.text = 'Write the message'
    setErr(e)
    if (Object.keys(e).length) return
    const id = saveCanned({ id: item?.id, title: title.trim(), category, text: text.trim(), live })
    toast(live ? 'Canned response published' : 'Response saved as draft')
    onDone(id)
  }
  return (
    <Panel title="Response editor" sub={item ? 'Edit this response.' : 'Create a new response.'}>
      <Field label="Response title" value={title} onChange={(v) => { setTitle(v); setErr({}) }} error={err.title} />
      <Field label="Category" value={category} onChange={setCategory} options={CANNED_CATEGORIES} />
      <div className="field">
        <label htmlFor="canned-text">Message</label>
        <textarea id="canned-text" ref={area} className="sp-text" style={{ minHeight: 150 }} value={text} onChange={(e) => { setText(e.target.value); setErr({}) }} aria-invalid={!!err.text} />
        {err.text && <div className="field-error">{err.text}</div>}
      </div>
      <div className="panel-sub sp-row" style={{ marginBottom: 12 }}>Personalisation: {TOKENS.map((t) => <Btn small key={t.token} onClick={() => insert(t.token)}>{t.label}</Btn>)}</div>
      <div className="sp-row end">
        {item && <Btn variant="danger" disabled={!can('Support', 'Edit')} onClick={() => openModal({ title: 'Delete this response?', message: `“${item.title}” will no longer be offered to agents.`, confirm: 'Delete', danger: true, onConfirm: () => { deleteCanned(item.id); toast('Response deleted'); onDone('new') } })}>Delete</Btn>}
        <Btn disabled={!edit} onClick={() => save(false)}>Save draft</Btn>
        <Btn variant="primary" disabled={!edit} onClick={() => save(true)}>Publish response</Btn>
      </div>
    </Panel>
  )
}

export function CannedResponses() {
  const { canned } = useSupport()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string>(canned[0]?.id ?? 'new')
  const { can } = useStore()
  const shown = canned.filter((c) => `${c.title} ${c.text} ${c.category}`.toLowerCase().includes(q.trim().toLowerCase()))
  const current = canned.find((c) => c.id === sel) ?? null
  const top = Math.max(1, ...canned.map((c) => c.uses))
  const used = [...canned].sort((a, b) => b.uses - a.uses).slice(0, 5)

  return (
    <>
      <PageHead title="Canned responses manager" desc="Create consistent, helpful replies for common customer and rider questions." actions={<Btn variant="primary" disabled={!can('Support', 'Edit')} onClick={() => setSel('new')}>+ New response</Btn>} />
      <div className="sp-editor">
        <div className="sp-stack">
          <Panel title="Saved responses" sub={`${canned.filter((c) => c.live).length} active responses · Used by support`} right={<input className="sp-input" style={{ width: 210 }} aria-label="Search canned responses" placeholder="Search responses" value={q} onChange={(e) => setQ(e.target.value)} />}>
            {shown.map((c) => (
              <div className={`sp-list-row ${c.id === sel ? 'active' : ''}`} key={c.id}>
                <div><b>{c.title}</b><span className="sp-sub">{c.text.length > 90 ? `${c.text.slice(0, 90)}…` : c.text}</span></div>
                <span>{c.category}{!c.live && <> · <Badge tone="amber">Draft</Badge></>}</span>
                <span className="panel-sub">Used {c.uses} times</span>
                <Btn small onClick={() => setSel(c.id)}>Edit</Btn>
              </div>
            ))}
            {!shown.length && <p className="panel-sub">No responses match.</p>}
          </Panel>
          <Panel title="Response usage" sub="This month">
            {used.map((c) => (
              <div className="sp-sla" key={c.id}><span>{c.title}</span><b>{c.uses} uses</b><div className="sp-progress"><span style={{ width: `${(c.uses / top) * 100}%` }} /></div></div>
            ))}
          </Panel>
        </div>
        <div className="sp-stack">
          <CannedEditor key={sel} item={current} onDone={setSel} />
          <Panel title="Usage guidance"><p className="panel-sub">Use a saved reply as a starting point. Personalise it before sending, especially for sensitive payment or delivery issues. Words in double braces are filled in automatically when an agent inserts the reply.</p></Panel>
        </div>
      </div>
    </>
  )
}

