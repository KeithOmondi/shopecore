import { useState } from 'react'

import { Badge, Btn, DataTable, Field, Notice, PageHead, Panel, type Column } from '../components/ui'
import { ApiError, del, patch, post, uploadFile } from '../lib/api'
import { dateTime } from '../lib/format'
import { useStore } from '../lib/store'
import { useGet } from '../lib/use-get'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const fromLocal = (v: string) => new Date(v).toISOString()

// ---- banners --------------------------------------------------------------------------------------------------------

interface Banner { id: string; title: string; label: string; link: string; linkOk: boolean; platform: string; startsAt: string; endsAt: string; tone: number; alt: string; imageRef: string | null; published: boolean; position: number; status: string; version: number }

function BannerForm({ b, onDone }: { b?: Banner; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ title: b?.title ?? '', label: b?.label ?? '', link: b?.link ?? '/deals', platform: b?.platform ?? 'Web and mobile', startsAt: toLocal(b?.startsAt ?? new Date().toISOString()), endsAt: toLocal(b?.endsAt ?? new Date(Date.now() + 14 * 86_400_000).toISOString()), alt: b?.alt ?? '', published: b?.published ?? false })
  const [image, setImage] = useState<string | null>(b?.imageRef ?? null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  const pick = async (file?: File) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return setErr('That image is over 5 MB')
    try { setImage((await uploadFile('banner', file)).id) } catch (e) { setErr(says(e)) }
  }
  const go = async () => {
    if (!f.title.trim()) return setErr('Give the banner a headline')
    if (!f.link.trim().startsWith('/')) return setErr('The link must start with / (for example /product/<id> or /categories/bags)')
    if (f.published && !f.alt.trim()) return setErr('Describe the picture in a few words before showing the banner in the app')
    setBusy(true)
    try { const body = { ...f, title: f.title.trim(), label: f.label.trim(), link: f.link.trim(), startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt), imageRef: image }; if (b) await patch(`/v1/admin/banners/${b.id}`, body); else await post('/v1/admin/banners', body); onDone(); closeModal(); toast('Banner saved') } catch (e) { setErr(says(e)) } finally { setBusy(false) }
  }
  // Show each message beside the field it is about; anything else goes above the buttons.
  const about = /headline/i.test(err) ? 'title' : /picture|alt text|describe/i.test(err) ? 'alt' : /link|\//i.test(err) ? 'link' : 'other'
  return (
    <>
      <Field label="Headline" value={f.title} onChange={set('title')} error={about === 'title' ? err : undefined} />
      <div className="sp-form2"><Field label="Small label above the headline (optional)" value={f.label} onChange={set('label')} /><Field label="Where tapping it goes" value={f.link} onChange={set('link')} error={about === 'link' ? err : undefined} hint="For example /categories/bags or /product/… (a page inside the app)." /><Field label="Shows on" value={f.platform} onChange={set('platform')} options={['Web and mobile', 'Mobile only', 'Web only']} /><Field label="Describe the picture" value={f.alt} onChange={set('alt')} error={about === 'alt' ? err : undefined} hint="A few words for people who can’t see it, such as “Flash sale, up to 50% off”. Needed to show the banner." /><Field label="Starts" type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /><Field label="Ends" type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></div>
      <div className="field"><label>Picture</label>{image && <img src={`/v1/files/${image}`} alt="Banner preview" style={{ maxHeight: 100, borderRadius: 6, display: 'block', marginBottom: 6 }} />}<label className="drop" style={{ cursor: 'pointer' }}>Click to choose a picture (JPG, PNG or WebP, up to 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} /></label></div>
      <label className="sp-row" style={{ gap: 6, marginBottom: 8 }}><input type="checkbox" checked={f.published} onChange={(e) => set('published')(e.target.checked)} /> Show it in the app</label>
      {about === 'other' && err && <div className="field-error" role="alert" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={() => void go()}>Save banner</Btn></div>
    </>
  )
}

export function BannersManager() {
  const { can, openModal, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Banner[]; settings: { interval: string; ratio: string } }>('/v1/admin/banners', 60_000)
  const edit = can('Marketing', 'Edit')
  const act = async (what: () => Promise<unknown>) => { try { await what(); reload() } catch (e) { toast(says(e)) } }
  const cols: Column<Banner>[] = [
    { key: 'i', header: '', render: (b) => (b.imageRef ? <img src={`/v1/files/${b.imageRef}`} alt="" style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 4 }} /> : <span className="subtext">No picture</span>) },
    { key: 't', header: 'Banner', render: (b) => <div><b>{b.title}</b><div className="subtext">{b.label}{b.label ? ' · ' : ''}{b.link}{!b.linkOk && ' · link looks broken'}</div></div> },
    { key: 'p', header: 'Shows on', render: (b) => b.platform },
    { key: 's', header: 'Status', render: (b) => <Badge tone={b.status === 'Live' ? 'green' : b.status === 'Scheduled' ? 'blue' : 'gray'}>{b.status}</Badge> },
    { key: 'r', header: 'Runs', render: (b) => `${dateTime(Date.parse(b.startsAt)).split(',')[0]} – ${dateTime(Date.parse(b.endsAt)).split(',')[0]}` },
  ]
  return (
    <>
      <PageHead title="Banners" desc="The pictures at the top of the app’s home screen." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'New banner', body: <BannerForm onDone={reload} />, noActions: true })}>New banner</Btn>} />
      {data && <Notice mark="i">{`Banners rotate every ${data.settings.interval}. Recommended picture shape: ${data.settings.ratio}.`}</Notice>}
      <div style={{ marginTop: 12 }}><DataTable title="Banners" rows={data?.items ?? []} rowKey={(b) => b.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the banners.' : undefined} onRetry={reload} searchLabel="Search banners" searchText={(b) => `${b.title} ${b.label}`} emptyTitle="No banners yet" empty="Add a banner to promote an offer on the home screen."
        actions={(b) => (
          <div className="sp-row">
            <Btn small disabled={!edit} label="Move up" onClick={() => void act(() => post(`/v1/admin/banners/${b.id}/move`, { dir: -1 }))}>↑</Btn>
            <Btn small disabled={!edit} label="Move down" onClick={() => void act(() => post(`/v1/admin/banners/${b.id}/move`, { dir: 1 }))}>↓</Btn>
            <Btn small disabled={!edit} onClick={() => openModal({ title: 'Edit banner', body: <BannerForm b={b} onDone={reload} />, noActions: true })}>Edit</Btn>
            <Btn small disabled={!can('Marketing', 'Delete')} onClick={() => openModal({ title: `Delete “${b.title}”?`, confirm: 'Delete', danger: true, onConfirm: () => { void act(() => del(`/v1/admin/banners/${b.id}`)) } })}>Delete</Btn>
          </div>
        )} /></div>
    </>
  )
}

// ---- homepage -------------------------------------------------------------------------------------------------------

interface Section { id: string; name: string; sub: string; enabled: boolean; count: number }

function SectionForm({ s, onDone }: { s?: Section; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ name: s?.name ?? '', sub: s?.sub ?? '', count: String(s?.count ?? 4) })
  const [err, setErr] = useState('')
  const go = async () => {
    if (!f.name.trim()) return setErr('Name the section')
    const body = { name: f.name.trim(), sub: f.sub.trim(), count: Number(f.count) || 0 }
    try { if (s) await patch(`/v1/admin/homepage/sections/${s.id}`, body); else await post('/v1/admin/homepage/sections', body); onDone(); closeModal(); toast('Section saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <Field label="Title shoppers see" value={f.name} onChange={(v) => { setF((x) => ({ ...x, name: v })); setErr('') }} error={err} hint="Titles with “flash”, “new”, “featured” or “top rated” in them fill with matching products in the app." />
      <div className="sp-form2"><Field label="Small description" value={f.sub} onChange={(v) => setF((x) => ({ ...x, sub: v }))} /><Field label="How many items" value={f.count} onChange={(v) => setF((x) => ({ ...x, count: v }))} /></div>
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Save</Btn></div>
    </>
  )
}

export function HomepageBuilder() {
  const { can, openModal, toast } = useStore()
  const { data, failed, reload } = useGet<{ sections: Section[]; liveAt: string | null; liveBy: string | null; unpublished: number; pending: { at: string } | null }>('/v1/admin/homepage')
  const edit = can('Marketing', 'Edit')
  const act = async (what: () => Promise<unknown>, done?: string) => { try { await what(); if (done) toast(done); reload() } catch (e) { toast(says(e)) } }
  if (!data) return <PageHead title="Homepage layout" desc={failed ? 'We couldn’t load the layout.' : 'Loading…'} actions={<Btn onClick={reload}>Try again</Btn>} />
  return (
    <>
      <PageHead title="Homepage layout" desc="Which sections the app’s home screen shows, and in what order. Changes go live when you publish." actions={<><Btn disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'Add a section', body: <SectionForm onDone={reload} />, noActions: true })}>Add section</Btn><Btn variant="primary" disabled={!edit || data.unpublished === 0} onClick={() => void act(() => post('/v1/admin/homepage/publish', { mode: 'now' }), 'Homepage published')}>{data.unpublished ? `Publish ${data.unpublished} change${data.unpublished === 1 ? '' : 's'}` : 'Nothing to publish'}</Btn></>} />
      {data.liveAt && <Notice mark="✓">{`Live layout published ${dateTime(Date.parse(data.liveAt))}${data.liveBy ? ` by ${data.liveBy}` : ''}.`}</Notice>}
      <div style={{ marginTop: 12 }}>
        <Panel title="Sections, top to bottom">
          {data.sections.length === 0 && <div className="panel-sub">No sections yet. With none, the app shows every section it knows.</div>}
          {data.sections.map((s) => (
            <div className="list-row" key={s.id}>
              <span><strong>{s.name}</strong><small>{s.sub || 'No description'} · {s.count} items</small></span>
              <span className="sp-row">
                <Btn small disabled={!edit} label={`Move ${s.name} up`} onClick={() => void act(() => post(`/v1/admin/homepage/sections/${s.id}/move`, { dir: -1 }))}>↑</Btn>
                <Btn small disabled={!edit} label={`Move ${s.name} down`} onClick={() => void act(() => post(`/v1/admin/homepage/sections/${s.id}/move`, { dir: 1 }))}>↓</Btn>
                <Btn small disabled={!edit} onClick={() => void act(() => patch(`/v1/admin/homepage/sections/${s.id}`, { enabled: !s.enabled }))}>{s.enabled ? 'Hide' : 'Show'}</Btn>
                <Btn small disabled={!edit} onClick={() => openModal({ title: `Edit ${s.name}`, body: <SectionForm s={s} onDone={reload} />, noActions: true })}>Edit</Btn>
                <Btn small disabled={!can('Marketing', 'Delete')} onClick={() => openModal({ title: `Remove ${s.name}?`, confirm: 'Remove', danger: true, onConfirm: () => { void act(() => del(`/v1/admin/homepage/sections/${s.id}`)) } })}>Remove</Btn>
              </span>
            </div>
          ))}
        </Panel>
      </div>
    </>
  )
}

// ---- pages ----------------------------------------------------------------------------------------------------------

interface Page { id: string; title: string; slug: string; audience: string; status: 'draft' | 'published'; seoTitle: string; seoDesc: string; updatedBy: string | null; updatedAt: string; words: number; version: number }

function PageForm({ p, onDone }: { p?: Page; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const full = useGet<{ body: string }>(p ? `/v1/admin/pages/${p.id}` : null)
  const [f, setF] = useState({ title: p?.title ?? '', slug: p?.slug ?? '/', status: p?.status ?? 'draft', seoTitle: p?.seoTitle ?? '', seoDesc: p?.seoDesc ?? '' })
  const [body, setBody] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const text = body ?? full.data?.body ?? ''
  const go = async () => {
    if (!f.title.trim()) return setErr('Give the page a title')
    try { const payload = { ...f, title: f.title.trim(), slug: f.slug.trim().toLowerCase(), body: text }; if (p) await patch(`/v1/admin/pages/${p.id}`, payload); else await post('/v1/admin/pages', payload); onDone(); closeModal(); toast('Page saved') } catch (e) { setErr(says(e)) }
  }
  return (
    <>
      <div className="sp-form2"><Field label="Title" value={f.title} onChange={(v) => { setF((x) => ({ ...x, title: v })); setErr('') }} error={err} /><Field label="Address in the app" value={f.slug} onChange={(v) => setF((x) => ({ ...x, slug: v }))} hint="For example /terms or /privacy. The app reads /terms and /privacy." /></div>
      <Field label="Text" multiline value={text} onChange={setBody} hint="Leave a blank line between paragraphs. A short line on its own becomes a heading." />
      <div className="sp-form2"><Field label="Status" value={f.status} onChange={(v) => setF((x) => ({ ...x, status: v as Page['status'] }))} options={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }]} /><Field label="Search title" value={f.seoTitle} onChange={(v) => setF((x) => ({ ...x, seoTitle: v }))} /></div>
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Save page</Btn></div>
    </>
  )
}

export function ContentPages() {
  const { can, openModal, toast } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: Page[] }>('/v1/admin/pages')
  const cols: Column<Page>[] = [
    { key: 't', header: 'Page', render: (p) => <div><b>{p.title}</b><div className="subtext">{p.slug}</div></div> },
    { key: 's', header: 'Status', render: (p) => <Badge tone={p.status === 'published' ? 'green' : 'gray'}>{p.status === 'published' ? 'Published' : 'Draft'}</Badge> },
    { key: 'w', header: 'Words', render: (p) => p.words },
    { key: 'u', header: 'Updated', render: (p) => `${dateTime(Date.parse(p.updatedAt))}${p.updatedBy ? ` · ${p.updatedBy}` : ''}` },
  ]
  return (
    <>
      <PageHead title="Pages" desc="Terms, privacy and other pages the app shows. Shoppers see the published ones." actions={<Btn variant="primary" disabled={!can('Marketing', 'Create')} onClick={() => openModal({ title: 'New page', body: <PageForm onDone={reload} />, noActions: true })}>New page</Btn>} />
      <DataTable title="Pages" rows={data?.items ?? []} rowKey={(p) => p.id} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the pages.' : undefined} onRetry={reload} searchLabel="Search pages" searchText={(p) => `${p.title} ${p.slug}`} emptyTitle="No pages yet" empty="Add your terms and privacy pages."
        actions={(p) => <div className="sp-row"><Btn small disabled={!can('Marketing', 'Edit')} onClick={() => openModal({ title: `Edit ${p.title}`, body: <PageForm p={p} onDone={reload} />, noActions: true })}>Edit</Btn><Btn small disabled={!can('Marketing', 'Delete')} onClick={() => openModal({ title: `Delete ${p.title}?`, confirm: 'Delete', danger: true, onConfirm: () => { void del(`/v1/admin/pages/${p.id}`).then(() => { reload(); toast('Page deleted') }, (e) => toast(says(e))) } })}>Delete</Btn></div>} />
    </>
  )
}

// ---- category copy --------------------------------------------------------------------------------------------------

interface CatCopy { categoryId: string; name: string; handle: string; heading: string; intro: string; cta: string; collection: string; seoTitle: string; seoDesc: string; canonical: string; published: boolean }

function CatForm({ c, onDone }: { c: CatCopy; onDone: () => void }) {
  const { closeModal, toast } = useStore()
  const [f, setF] = useState({ heading: c.heading, intro: c.intro, cta: c.cta, collection: c.collection, seoTitle: c.seoTitle, seoDesc: c.seoDesc, published: c.published })
  const [err, setErr] = useState('')
  const go = async () => { try { await patch(`/v1/admin/category-content/${c.categoryId}`, f); onDone(); closeModal(); toast('Category page saved') } catch (e) { setErr(says(e)) } }
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErr('') }
  return (
    <>
      <Field label="Heading" value={f.heading} onChange={set('heading')} error={err} />
      <Field label="Introduction" multiline value={f.intro} onChange={set('intro')} />
      <div className="sp-form2"><Field label="Button text" value={f.cta} onChange={set('cta')} /><Field label="Collection" value={f.collection} onChange={set('collection')} /><Field label="Search title" value={f.seoTitle} onChange={set('seoTitle')} /><Field label="Search description" value={f.seoDesc} onChange={set('seoDesc')} /></div>
      <label className="sp-row" style={{ gap: 6, marginBottom: 8 }}><input type="checkbox" checked={f.published} onChange={(e) => setF((x) => ({ ...x, published: e.target.checked }))} /> Published</label>
      <div className="actions" style={{ justifyContent: 'flex-end' }}><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => void go()}>Save</Btn></div>
    </>
  )
}

export function CategoryContentPage() {
  const { can, openModal } = useStore()
  const { data, failed, loading, reload } = useGet<{ items: CatCopy[] }>('/v1/admin/category-content')
  const cols: Column<CatCopy>[] = [
    { key: 'n', header: 'Category', render: (c) => <div><b>{c.name}</b><div className="subtext">/{c.handle}</div></div> },
    { key: 'h', header: 'Heading', render: (c) => c.heading || <span className="subtext">Not written</span> },
    { key: 'p', header: 'Status', render: (c) => <Badge tone={c.published ? 'green' : 'gray'}>{c.published ? 'Published' : 'Draft'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Category pages" desc="The heading and introduction shown on each category." />
      <DataTable title="Categories" rows={data?.items ?? []} rowKey={(c) => c.categoryId} columns={cols} loading={loading} error={failed && !data ? 'We couldn’t load the categories.' : undefined} onRetry={reload} searchLabel="Search categories" searchText={(c) => `${c.name} ${c.heading}`} emptyTitle="No categories" empty="Add categories under Inventory first."
        actions={(c) => <Btn small disabled={!can('Marketing', 'Edit')} onClick={() => openModal({ title: `${c.name} page`, body: <CatForm c={c} onDone={reload} />, noActions: true })}>Edit</Btn>} />
    </>
  )
}

