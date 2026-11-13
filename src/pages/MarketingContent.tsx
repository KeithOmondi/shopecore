import { useRef, useState, type ReactNode } from 'react'

import { fromInput, PhoneFrame, Tag, toInput } from '../components/marketing-ui'
import { Detail, NotFoundCard, useNow, when } from '../components/support-ui'
import { Badge, Btn, Field, Notice, PageHead, Panel, Toggle } from '../components/ui'
import { BANNER_TONES, type Banner, type CategoryContent, type ContentPage } from '../data/marketing'
import { kes, shortDate } from '../lib/format'
import { useMarketing } from '../lib/marketing'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

const DAY = 86_400_000

// ---- banners ----------------------------------------------------------------------------------------------------------------

function BannerForm({ banner }: { banner?: Banner }) {
  const m = useMarketing()
  const { categories, closeModal, toast } = useStore()
  const now = useNow()
  const [v, setV] = useState({ title: banner?.title ?? '', label: banner?.label ?? '', link: banner?.link ?? '/collections/new', platform: banner?.platform ?? 'Web and mobile', start: toInput(banner?.start ?? now), end: toInput(banner?.end ?? now + 14 * DAY), tone: banner?.tone ?? 0, alt: banner?.alt ?? '', published: banner?.published ?? false })
  const [err, setErr] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const links = ['/', '/collections/new', '/collections/sale', '/loyalty', '/referral', ...categories.map((c) => `/categories/${c.toLowerCase()}`)]
  const save = () => {
    const e: Record<string, string> = {}
    if (!v.title.trim()) e.title = 'Give the banner a title'
    if (!v.link.startsWith('/')) e.link = 'A link starts with /'
    else if (v.published && !m.knownLink(v.link)) e.link = 'The storefront has no page at that link. Choose one from the list.'
    if (!(fromInput(v.end) > fromInput(v.start))) e.end = 'The end must be after the start'
    if (v.published && !v.alt.trim()) e.alt = 'Describe the image for screen readers before publishing'
    setErr(e)
    if (Object.keys(e).length) return
    m.saveBanner({ id: banner?.id, title: v.title.trim(), label: v.label.trim() || v.title.trim(), link: v.link.trim(), platform: v.platform as Banner['platform'], start: fromInput(v.start), end: fromInput(v.end), tone: v.tone, alt: v.alt.trim(), published: v.published })
    closeModal()
    toast('Banner saved')
  }
  return (
    <>
      <div className="sp-form2"><Field label="Title" value={v.title} onChange={set('title')} error={err.title} /><Field label="Text on the image" value={v.label} onChange={set('label')} /></div>
      <Field label="Destination link" value={v.link} onChange={set('link')} error={err.link} hint="Pick a page the storefront has, or type one." />
      <div className="sp-row" style={{ marginBottom: 10 }}>{links.map((l) => <button key={l} type="button" className={`btn small ${v.link === l ? 'primary' : ''}`} onClick={() => set('link')(l)}>{l}</button>)}</div>
      <div className="sp-form2"><Field label="Shown on" value={v.platform} onChange={(x) => set('platform')(x as Banner['platform'])} options={['Web and mobile', 'Mobile only', 'Web only']} /><Field label="Starts" type="datetime-local" value={v.start} onChange={set('start')} /><Field label="Ends" type="datetime-local" value={v.end} onChange={set('end')} error={err.end} /></div>
      <Field label="Image description (alt text)" value={v.alt} onChange={set('alt')} error={err.alt} />
      <div className="sp-row" style={{ marginBottom: 10 }}>{BANNER_TONES.map((t, i) => <button key={i} type="button" aria-label={`Colour ${i + 1}`} aria-pressed={v.tone === i} onClick={() => set('tone')(i)} style={{ width: 52, height: 28, borderRadius: 6, border: v.tone === i ? '2px solid var(--blue)' : '1px solid var(--line)', background: t }} />)}</div>
      <label className="sp-row" style={{ fontSize: 11, gap: 6, marginBottom: 12 }}><input type="checkbox" checked={v.published} onChange={(e) => set('published')(e.target.checked)} /> Published</label>
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={save}>Save banner</Btn></div>
    </>
  )
}

export function BannersManager() {
  const m = useMarketing()
  const { openModal, toast, can } = useStore()
  const now = useNow()
  const [device, setDevice] = useState<'Web' | 'Mobile'>('Web')
  const [sel, setSel] = useState('')
  const [s, setS] = useState(m.bannerSettings)
  const edit = can('Marketing', 'Edit')
  const live = m.banners.filter((b) => b.published)
  const cur = m.banners.find((b) => b.id === sel) ?? live[0] ?? m.banners[0]
  const state = (b: Banner) => (!b.published ? 'Draft' : now < b.start ? 'Scheduled' : now > b.end ? 'Expired' : 'Live')
  const altMissing = live.filter((b) => !b.alt.trim())
  const broken = live.filter((b) => !m.knownLink(b.link))
  return (
    <>
      <PageHead title="Banners manager" desc="Schedule home carousel banners and manage where each banner links." actions={<><Btn onClick={() => navigate('/marketing/homepage')}>Preview storefront</Btn><Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'Add banner', body: <BannerForm />, noActions: true })}>Add banner</Btn></>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Home carousel" sub="Use the arrows to change the display order" right={<Badge tone="green">{`${live.length} published`}</Badge>}>
            {m.banners.map((b, i) => { const st = state(b); const ok = m.knownLink(b.link); return (
              <div className="list-row" key={b.id} style={cur?.id === b.id ? { background: 'var(--blue-soft)' } : undefined}>
                <div className="sp-row" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ width: 84, height: 42, borderRadius: 6, background: BANNER_TONES[b.tone], display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, flex: 'none' }}>{b.label}</div>
                  <div style={{ minWidth: 0 }}><button className="sp-link" onClick={() => setSel(b.id)}>{b.title}</button><div className="panel-sub">{b.platform} · {b.link}</div><div className="panel-sub">{shortDate(b.start)} – {shortDate(b.end)}</div>
                    <div className="sp-row" style={{ marginTop: 4 }}><Badge tone={st === 'Live' ? 'green' : st === 'Scheduled' ? 'blue' : 'gray'}>{st}</Badge>{!ok && <Badge tone="red">Broken link</Badge>}{!b.alt.trim() && <Badge tone="amber">No alt text</Badge>}</div></div>
                </div>
                <div className="sp-row"><Btn small disabled={!edit || i === 0} onClick={() => m.moveBanner(b.id, -1)} label={`Move ${b.title} up`}>↑</Btn><Btn small disabled={!edit || i === m.banners.length - 1} onClick={() => m.moveBanner(b.id, 1)} label={`Move ${b.title} down`}>↓</Btn>
                  <Btn small disabled={!edit} onClick={() => openModal({ title: `Edit ${b.title}`, body: <BannerForm banner={b} />, noActions: true })}>Edit</Btn>
                  <Btn small disabled={!edit} onClick={() => { if (!b.published && !b.alt.trim()) return toast('Add alt text before publishing'); if (!b.published && !ok) return toast('Fix the link before publishing'); m.setBannerPublished(b.id, !b.published); toast(b.published ? 'Banner unpublished' : 'Banner published') }}>{b.published ? 'Unpublish' : 'Publish'}</Btn>
                  <Btn small disabled={!edit} onClick={() => openModal({ title: `Delete ${b.title}?`, message: 'The banner is removed from the carousel.', confirm: 'Delete', danger: true, onConfirm: () => { m.deleteBanner(b.id); toast('Banner deleted') } })} label={`Delete ${b.title}`}>×</Btn></div>
              </div>) })}
            {!m.banners.length && <p className="panel-sub">No banners yet.</p>}
          </Panel>
          <Panel title="Banner settings">
            <div className="sp-form2"><Field label="Carousel interval" value={s.interval} onChange={(x) => setS({ ...s, interval: x })} options={['5 seconds', '7 seconds', 'Manual only']} /><Field label="Image ratio" value={s.ratio} onChange={(x) => setS({ ...s, ratio: x })} options={['16:5 desktop · 4:3 mobile', '16:6 desktop · 1:1 mobile']} /></div>
            <Btn small disabled={!edit} onClick={() => { m.setBannerSettings(s); toast('Banner settings saved') }}>Save settings</Btn>
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Storefront preview" sub="Selected banner · responsive" right={<div className="sp-row">{(['Web', 'Mobile'] as const).map((d) => <button key={d} className={`btn small ${device === d ? 'primary' : ''}`} aria-pressed={device === d} onClick={() => setDevice(d)}>{d}</button>)}</div>}>
            {cur ? (
              <>
                <div style={{ width: device === 'Mobile' ? 200 : '100%', margin: '0 auto', transition: 'width .2s' }}><div style={{ height: device === 'Mobile' ? 150 : 150, borderRadius: 8, background: BANNER_TONES[cur.tone], display: 'grid', placeItems: 'center', fontWeight: 700, letterSpacing: '.5px' }}>{cur.label.toUpperCase()}</div><div style={{ marginTop: 8 }}><b style={{ fontSize: 12 }}>{cur.title}</b></div></div>
                <Detail label="Destination link">{cur.link}</Detail><Detail label="Link health">{m.knownLink(cur.link) ? <Badge tone="green">Working</Badge> : <Badge tone="red">Broken</Badge>}</Detail>
              </>
            ) : <p className="panel-sub">Nothing to preview.</p>}
          </Panel>
          <Panel title="Accessibility and links">
            <div className="list-row"><div><b style={{ fontSize: 11 }}>Alt text</b><div className="panel-sub">{altMissing.length ? `${altMissing.length} published banner${altMissing.length === 1 ? ' has' : 's have'} no description.` : 'All published images have descriptive alt text.'}</div></div><Badge tone={altMissing.length ? 'amber' : 'green'}>{altMissing.length ? 'Review' : 'Passed'}</Badge></div>
            <div className="list-row"><div><b style={{ fontSize: 11 }}>Link health</b><div className="panel-sub">{broken.length ? `${broken.map((b) => b.title).join(', ')} point${broken.length === 1 ? 's' : ''} to a missing page.` : 'Every published link goes to a real page.'}</div></div><Badge tone={broken.length ? 'red' : 'green'}>{broken.length ? 'Broken' : 'Passed'}</Badge></div>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- homepage builder --------------------------------------------------------------------------------------------------------------

const SECTION_TEMPLATES: [string, string, number][] = [['Flash sale strip', 'Live sale countdown', 6], ['Trending now', 'Product carousel', 10], ['Brand story', 'Editorial block', 1], ['Customer reviews', 'Featured reviews', 3]]

export function HomepageBuilder() {
  const m = useMarketing()
  const { products, categories, openModal, closeModal, toast, can, role } = useStore()
  const now = useNow()
  const [mode, setMode] = useState<'now' | 'later'>('now')
  const [at, setAt] = useState(() => toInput(now + DAY))
  const [err, setErr] = useState('')
  const edit = can('Marketing', 'Edit')
  const active = products.filter((p) => p.status === 'Active')
  const liveBanners = m.banners.filter((b) => b.published).length
  const editSection = (id: string) => {
    const sec = m.sections.find((x) => x.id === id)!
    const F = () => {
      const [name, setName] = useState(sec.name)
      const [count, setCount] = useState(String(sec.count))
      const [e, setE] = useState('')
      return (
        <>
          <Field label="Section title" value={name} onChange={(x) => { setName(x); setE('') }} error={e} /><Field label="Items shown" type="number" value={count} onChange={setCount} hint="Between 1 and 24." />
          <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { const n = Number(count); if (!name.trim()) return setE('Give the section a title'); if (!Number.isInteger(n) || n < 1 || n > 24) return setE('Items shown must be 1 to 24'); m.patchSection(id, { name: name.trim(), count: n }); closeModal() }}>Save section</Btn></div>
        </>
      )
    }
    openModal({ title: `${sec.name} settings`, body: <F />, noActions: true })
  }
  const publish = () => { const e = m.publishLayout({ mode, at }); setErr(e ?? ''); if (!e) toast(mode === 'now' ? 'Homepage layout published' : 'Homepage layout scheduled') }
  const block = (id: string, name: string, count: number): ReactNode => {
    if (name === 'Hero banners') return <div style={{ height: 70, borderRadius: 8, background: BANNER_TONES[m.banners.find((b) => b.published)?.tone ?? 0], display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>{(m.banners.find((b) => b.published)?.label ?? 'No banners').toUpperCase()}</div>
    if (name === 'Shop by category') return <div className="sp-row" style={{ gap: 4 }}>{categories.slice(0, 4).map((c) => <Tag key={c}>{c}</Tag>)}</div>
    return <div style={{ display: 'flex', gap: 6 }}>{active.slice(0, Math.min(2, count)).map((p) => <div key={p.id} style={{ flex: 1, background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 6, padding: 5 }}><div style={{ height: 34, borderRadius: 4, background: '#E5E7EB' }} /><div style={{ fontSize: 9, marginTop: 3 }}>{p.name.slice(0, 16)}</div><div style={{ fontSize: 9, fontWeight: 700 }}>{kes(p.price)}</div></div>)}{id && null}</div>
  }
  return (
    <>
      <PageHead title="Homepage layout builder" desc="Arrange storefront sections and preview the customer app home page." actions={<><Btn onClick={() => toast(`${m.unpublished} unpublished change${m.unpublished === 1 ? '' : 's'}`)}>Check changes</Btn><Btn variant="primary" disabled={!edit} onClick={publish}>{mode === 'now' ? 'Save and publish' : 'Schedule layout'}</Btn></>} />
      <div className="sp-two">
        <div className="sp-stack">
          <Panel title="Home page sections" sub="Reorder with the arrows; switch a section on or off" right={<Btn small disabled={!edit} onClick={() => openModal({ title: 'Add section', body: <div>{SECTION_TEMPLATES.map(([n, s, c]) => <div className="list-row" key={n}><div><b style={{ fontSize: 11 }}>{n}</b><div className="panel-sub">{s}</div></div><Btn small onClick={() => { m.addSection(n, s, c); closeModal(); toast('Section added') }}>Add</Btn></div>)}</div>, noActions: true })}>Add section</Btn>}>
            {m.sections.map((sec, i) => (
              <div className="list-row" key={sec.id}>
                <div><b style={{ fontSize: 12 }}>{sec.name}</b><div className="panel-sub">{sec.sub} · {sec.name === 'Hero banners' ? `${liveBanners} active banners` : `${sec.count} items`}</div></div>
                <div className="sp-row"><Btn small disabled={!edit || i === 0} onClick={() => m.moveSection(sec.id, -1)} label={`Move ${sec.name} up`}>↑</Btn><Btn small disabled={!edit || i === m.sections.length - 1} onClick={() => m.moveSection(sec.id, 1)} label={`Move ${sec.name} down`}>↓</Btn>
                  <Toggle on={sec.enabled} label={`Show ${sec.name}`} onChange={(on) => { if (edit) m.patchSection(sec.id, { enabled: on }) }} />
                  <Btn small disabled={!edit} onClick={() => editSection(sec.id)}>Edit</Btn>
                  <Btn small disabled={!edit || m.sections.length <= 1} onClick={() => openModal({ title: `Remove ${sec.name}?`, message: 'The section leaves the layout when you next publish.', confirm: 'Remove', danger: true, onConfirm: () => m.removeSection(sec.id) })} label={`Remove ${sec.name}`}>×</Btn></div>
              </div>
            ))}
          </Panel>
          <Panel title="Publish schedule" sub="Choose when the new layout goes live" right={<Badge tone={m.unpublished ? 'amber' : 'green'}>{m.unpublished ? `${m.unpublished} unpublished` : 'Current version live'}</Badge>}>
            <div className="sp-row">
              <label className="sp-row" style={{ fontSize: 11, gap: 6 }}><input type="radio" name="publish" checked={mode === 'now'} onChange={() => { setMode('now'); setErr('') }} /> Publish now</label>
              <label className="sp-row" style={{ fontSize: 11, gap: 6 }}><input type="radio" name="publish" checked={mode === 'later'} onChange={() => setMode('later')} /> Schedule</label>
              {mode === 'later' && <input type="datetime-local" className="sp-input" style={{ width: 210 }} aria-label="Scheduled publish time" value={at} onChange={(e) => { setAt(e.target.value); setErr('') }} />}
            </div>
            {err && <div className="sp-err" role="alert">{err}</div>}
            {m.pendingLayout && <div style={{ marginTop: 10 }}><Notice>A new layout is scheduled for {when(m.pendingLayout.at)}.</Notice></div>}
          </Panel>
        </div>
        <div className="sp-stack">
          <Panel title="Customer app preview" sub="Homepage · Nairobi delivery zone" right={<Tag>Mobile</Tag>}>
            <PhoneFrame label="Homepage preview"><div className="panel-sub" style={{ marginBottom: 6 }}>GOOD MORNING</div>
              {m.sections.filter((x) => x.enabled).map((sec) => <div key={sec.id} style={{ marginBottom: 10 }}><div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{sec.name}</div>{block(sec.id, sec.name, sec.count)}</div>)}
              {!m.sections.some((x) => x.enabled) && <p className="panel-sub">Every section is switched off.</p>}</PhoneFrame>
          </Panel>
          <Panel title="Layout status"><Detail label="Last published">{when(m.liveAt)}</Detail><Detail label="Edited by">{m.me}</Detail><Detail label="Unpublished changes">{m.unpublished ? <Badge tone="amber">{`${m.unpublished} sections`}</Badge> : 'None'}</Detail>{role === 'Customer support' && null}</Panel>
        </div>
      </div>
    </>
  )
}

// ---- content pages --------------------------------------------------------------------------------------------------------------------

/** A very small renderer: lines starting with "# " are headings, "- " are bullets, **bold** is bold. Everything else is text. */
function Rich({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p))
  return (
    <>
      {text.split('\n').map((l, i) => l.startsWith('# ') ? <h4 key={i} style={{ fontSize: 12, margin: '12px 0 4px' }}>{bold(l.slice(2))}</h4> : l.startsWith('- ') ? <div key={i} style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 10 }}>• {bold(l.slice(2))}</div> : l.trim() ? <p key={i} style={{ fontSize: 10, lineHeight: 1.8, color: 'var(--muted)', margin: '0 0 6px' }}>{bold(l)}</p> : null)}
    </>
  )
}

function PageEditor({ page, onDone }: { page: ContentPage | null; onDone: (id: string) => void }) {
  const m = useMarketing()
  const { openModal, toast, can } = useStore()
  const area = useRef<HTMLTextAreaElement>(null)
  const [v, setV] = useState({ title: page?.title ?? '', slug: page?.slug ?? '/', audience: page?.audience ?? 'Website and mobile app', status: page?.status ?? 'Draft', body: page?.body ?? '', seoTitle: page?.seoTitle ?? '', seoDesc: page?.seoDesc ?? '' })
  const [err, setErr] = useState<Record<string, string>>({})
  const edit = can('Marketing', 'Edit') || (!page && can('Marketing', 'Create'))
  const set = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const wrap = (pre: string, post = '') => {
    const el = area.current
    const a = el?.selectionStart ?? v.body.length, b = el?.selectionEnd ?? a
    set('body')(`${v.body.slice(0, a)}${pre}${v.body.slice(a, b)}${post}${v.body.slice(b)}`)
    requestAnimationFrame(() => el?.focus())
  }
  const checks: [string, boolean, string][] = [
    ['SEO title and description added', !!v.seoTitle.trim() && !!v.seoDesc.trim(), 'Add both so search engines show the page well.'],
    ['Links use https', !/http:\/\//i.test(v.body), 'Replace any http:// links with https://.'],
    ['Page has content', v.body.trim().length >= 40, 'Write at least a couple of sentences.'],
  ]
  const save = (status: 'Draft' | 'Published') => {
    const e: Record<string, string> = {}
    if (!v.title.trim()) e.title = 'Give the page a title'
    if (!/^\/[a-z0-9\-/]*$/.test(v.slug.trim()) || v.slug.trim() === '/') e.slug = 'Use lowercase letters, numbers and dashes after a /, for example /faq'
    if (status === 'Published' && v.body.trim().length < 40) e.body = 'Write the page before publishing'
    setErr(e)
    if (Object.keys(e).length) return
    const r = m.savePage({ id: page?.id, title: v.title.trim(), slug: v.slug.trim(), audience: v.audience, status, body: v.body, seoTitle: v.seoTitle.trim(), seoDesc: v.seoDesc.trim() })
    if (r.error) return setErr({ slug: r.error })
    toast(status === 'Published' ? 'Page published' : 'Page saved as a draft')
    onDone(r.id!)
  }
  return (
    <div className="sp-two" style={{ marginTop: 14 }}>
      <div className="sp-stack">
        <Panel title={page ? 'Edit page' : 'New page'}>
          <div className="sp-form2"><Field label="Page title" value={v.title} onChange={set('title')} error={err.title} /><Field label="URL slug" value={v.slug} onChange={set('slug')} error={err.slug} /><Field label="Visible on" value={v.audience} onChange={set('audience')} options={['Website and mobile app', 'Website only', 'Mobile app only']} /></div>
          <div className="field"><label htmlFor="pg-body">Page content</label>
            <div className="sp-row" style={{ marginBottom: 4 }}><Btn small onClick={() => wrap('**', '**')} label="Bold"><b>B</b></Btn><Btn small onClick={() => wrap('# ')} label="Heading">H</Btn><Btn small onClick={() => wrap('- ')} label="Bulleted list">•</Btn></div>
            <textarea id="pg-body" ref={area} className="sp-text" style={{ minHeight: 190 }} value={v.body} aria-invalid={!!err.body} onChange={(e) => set('body')(e.target.value)} />
            {err.body && <div className="field-error">{err.body}</div>}
            <div className="panel-sub">Start a line with “# ” for a heading or “- ” for a bullet. Wrap words in **double stars** for bold.</div>
          </div>
          <div className="sp-form2"><Field label="SEO title" value={v.seoTitle} onChange={(x) => set('seoTitle')(x.slice(0, 60))} hint={`${v.seoTitle.length} / 60`} /><Field label="Meta description" value={v.seoDesc} onChange={(x) => set('seoDesc')(x.slice(0, 160))} hint={`${v.seoDesc.length} / 160`} /></div>
          <div className="sp-row end"><Btn disabled={!edit} onClick={() => save('Draft')}>Save draft</Btn><Btn variant="primary" disabled={!edit} onClick={() => openModal({ title: 'Publish this page?', message: `“${v.title.trim() || 'This page'}” becomes visible at ${v.slug} for customers.`, confirm: 'Publish', onConfirm: () => save('Published') })}>Publish</Btn></div>
        </Panel>
      </div>
      <div className="sp-stack">
        <Panel title="Page preview"><div className="sp-note" style={{ background: 'var(--white)', border: '1px solid var(--line)' }}><div className="sp-label">shopcore.co.ke{v.slug}</div><h3 style={{ fontSize: 17, margin: '8px 0' }}>{v.title || 'Page title'}</h3><Rich text={v.body} /></div></Panel>
        <Panel title="Publishing checklist">
          {checks.map(([l, ok, hint]) => <div className="list-row" key={l}><div><b style={{ fontSize: 11 }}>{l}</b>{!ok && <div className="panel-sub">{hint}</div>}</div><Badge tone={ok ? 'green' : 'amber'}>{ok ? 'Complete' : 'To do'}</Badge></div>)}
          <div className="list-row"><b style={{ fontSize: 11 }}>Legal review</b><Badge tone="amber">Recommended</Badge></div>
        </Panel>
      </div>
    </div>
  )
}

export function ContentPages() {
  const m = useMarketing()
  const { can } = useStore()
  const [sel, setSel] = useState(m.pages[1]?.id ?? 'new')
  const page = m.pages.find((p) => p.id === sel) ?? null
  return (
    <>
      <PageHead title="Content pages editor" desc="Edit legal and informational pages shown in the ShopCore app and website." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => setSel('new')}>＋ New page</Btn>} />
      <Panel title="Pages" sub="Published content and legal pages">
        {m.pages.map((p) => <div className="list-row" key={p.id} style={p.id === sel ? { background: 'var(--blue-soft)', paddingInline: 9, borderRadius: 6 } : undefined}><div><button className="sp-link" onClick={() => setSel(p.id)}>{p.title}</button><div className="panel-sub">{p.slug} · Last updated {shortDate(p.updatedAt)}</div></div><Badge tone={p.status === 'Published' ? 'green' : 'gray'}>{p.id === sel ? 'Editing' : p.status}</Badge></div>)}
      </Panel>
      <PageEditor key={sel} page={page} onDone={setSel} />
    </>
  )
}

// ---- category content ----------------------------------------------------------------------------------------------------------------------

function CategoryEditor({ cat }: { cat: string }) {
  const m = useMarketing()
  const { products, toast, can } = useStore()
  const cur = m.categoryContent[cat]
  const [v, setV] = useState<CategoryContent>(() => cur ?? { heading: '', intro: '', cta: `Shop ${cat.toLowerCase()}`, collection: 'Featured', seoTitle: '', seoDesc: '', canonical: `https://shopcore.co.ke/categories/${cat.toLowerCase()}`, published: false })
  const [err, setErr] = useState<Record<string, string>>({})
  const edit = can('Marketing', 'Edit')
  const set = <K extends keyof CategoryContent>(k: K) => (x: CategoryContent[K]) => { setV({ ...v, [k]: x }); setErr({}) }
  const items = products.filter((p) => p.category === cat && p.status === 'Active')
  const save = () => {
    const e: Record<string, string> = {}
    if (v.published && !v.heading.trim()) e.heading = 'Add a heading before publishing'
    if (v.published && !v.intro.trim()) e.intro = 'Add introductory copy before publishing'
    if (!/^https:\/\/\S+$/.test(v.canonical.trim())) e.canonical = 'The canonical URL must start with https://'
    setErr(e)
    if (Object.keys(e).length) return
    m.saveCategoryContent(cat, { ...v, heading: v.heading.trim(), intro: v.intro.trim(), cta: v.cta.trim() || `Shop ${cat.toLowerCase()}`, canonical: v.canonical.trim() })
    toast('Category content saved')
  }
  return (
    <div className="sp-two" style={{ marginTop: 14 }}>
      <div className="sp-stack">
        <Panel title={`${cat} content`} sub="Landing page" right={<div className="sp-row"><Badge tone={v.published ? 'green' : 'gray'}>{v.published ? 'Published' : 'Draft'}</Badge><Toggle on={v.published} label="Published" onChange={(on) => { if (edit) set('published')(on) }} /></div>}>
          <Field label="Page heading" value={v.heading} onChange={set('heading')} error={err.heading} />
          <Field label="Introductory copy" multiline value={v.intro} onChange={set('intro')} error={err.intro} />
          <div className="sp-form2"><Field label="Call-to-action text" value={v.cta} onChange={set('cta')} /><Field label="Featured collection" value={v.collection} onChange={set('collection')} options={['Featured', 'New arrivals', 'Best sellers', 'On sale']} /></div>
        </Panel>
        <Panel title="SEO settings">
          <Field label="SEO title" value={v.seoTitle} onChange={(x) => set('seoTitle')(x.slice(0, 60))} hint={`${v.seoTitle.length} / 60 characters`} />
          <Field label="Meta description" multiline value={v.seoDesc} onChange={(x) => set('seoDesc')(x.slice(0, 160))} hint={`${v.seoDesc.length} / 160 characters`} />
          <Field label="Canonical URL" value={v.canonical} onChange={set('canonical')} error={err.canonical} />
          <div className="sp-row end"><Btn variant="primary" disabled={!edit} onClick={save}>Save content</Btn></div>
        </Panel>
      </div>
      <div className="sp-stack">
        <Panel title="Web preview">
          <div style={{ height: 90, borderRadius: 8, background: BANNER_TONES[0], display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11 }}>{cat.toUpperCase()}</div>
          <h3 style={{ fontSize: 14, margin: '10px 0 4px' }}>{v.heading || `${cat}`}</h3><p className="panel-sub">{v.intro || 'Introductory copy appears here.'}</p>
          <button className="btn small primary" type="button">{v.cta || `Shop ${cat.toLowerCase()}`}</button>
          <div style={{ marginTop: 10 }}>{items.slice(0, 3).map((p) => <Detail key={p.id} label={p.name}>{kes(p.price)}</Detail>)}{!items.length && <p className="panel-sub">No active products in this category yet.</p>}</div>
        </Panel>
        <Panel title="Search preview"><div style={{ fontSize: 12, color: '#1a0dab' }}>{v.seoTitle || `${cat} | ShopCore`}</div><div style={{ fontSize: 10, color: 'var(--green)' }}>{v.canonical}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>{v.seoDesc || 'Add a meta description to control what search engines show.'}</div></Panel>
      </div>
    </div>
  )
}

export function CategoryContentPage() {
  const { categories, products } = useStore()
  const m = useMarketing()
  const [sel, setSel] = useState(categories[0] ?? '')
  if (!categories.length) return <NotFoundCard what="Category" back="Products" onBack={() => navigate('/products')} />
  return (
    <>
      <PageHead title="Category and landing page content" desc="Manage category descriptions and landing page merchandising copy." />
      <Panel title="Content tree" sub="Choose a category to edit">
        {categories.map((c) => <div className="list-row" key={c} style={c === sel ? { background: 'var(--blue-soft)', paddingInline: 9, borderRadius: 6 } : undefined}><div><button className="sp-link" onClick={() => setSel(c)}>{c}</button><div className="panel-sub">/categories/{c.toLowerCase()} · {products.filter((p) => p.category === c && p.status === 'Active').length} products</div></div><Badge tone={m.categoryContent[c]?.published ? 'green' : 'gray'}>{c === sel ? 'Editing' : m.categoryContent[c]?.published ? 'Published' : 'Draft'}</Badge></div>)}
      </Panel>
      <CategoryEditor key={sel} cat={sel} />
    </>
  )
}

