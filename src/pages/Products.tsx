import { useEffect, useRef, useState } from 'react'

import { useDirty, useUnsavedGuard } from '../lib/unsaved'
import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import { ApiError, get, patch, post, put, uploadFile } from '../lib/api'
import { kes, shortDate } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

// ---- what the server sends ----------------------------------------------------------------------------

export interface Variant { name: string; size: string; color: string; sku?: string; barcode?: string }
export interface ApiProduct {
  coverImage?: string | null
  id: string; sku: string; name: string; description: string; priceCents: number; currency: string
  categoryId: string | null; category: string | null; subcategory: string; brandId: string | null; brand: string | null; supplierId: string | null; supplier: string | null
  costCents: number; barcode: string; tax: 'standard' | 'zero'; trackStock: boolean; status: 'active' | 'draft' | 'archived'; reorderAt: number
  variants: Variant[]; groupId: string | null; options: Record<string, string>; specs: Record<string, string | number | boolean>; available: number; reserved: number; version: number; createdAt: string; updatedAt: string
  images?: { id: string; url: string }[]
  levels?: { locationId: string; location: string; onHand: number }[]
}
export interface Attribute { id?: string; key: string; label: string; kind: 'text' | 'number' | 'choice' | 'yes_no'; unit: string; choices: string[]; isOption: boolean; required: boolean; filterable: boolean }
export interface Category { id: string; name: string; handle: string; description: string; products: number; subcategories: string[]; attributes: Attribute[] }
export interface Brand { id: string; name: string; origin: string; status: string; products: number }
export interface Supplier { id: string; name: string; status: string }
export interface Location { id: string; name: string; active: boolean; primary: boolean }

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
const shillings = (c: number) => c / 100
const STATUS_TEXT = { active: 'Active', draft: 'Draft', archived: 'Archived' } as const
const statusTone = (s: ApiProduct['status']) => (s === 'active' ? 'green' : s === 'draft' ? 'blue' : 'gray')
const stockBadge = (p: ApiProduct) => (!p.trackStock ? <Badge tone="gray">Not tracked</Badge> : p.available === 0 ? <Badge tone="red">Out of stock</Badge> : p.available <= p.reorderAt ? <Badge tone="amber">{`Low · ${p.available}`}</Badge> : <Badge tone="green">{`${p.available} in stock`}</Badge>)

/** The catalogue's lookups (categories, brands, suppliers, locations), loaded once per page that needs them. */
function useLookups() {
  const [v, setV] = useState<{ categories: Category[]; brands: Brand[]; suppliers: Supplier[]; locations: Location[] } | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all([
      get<{ items: Category[] }>('/v1/admin/categories'),
      get<{ items: Brand[] }>('/v1/admin/brands'),
      get<{ items: Supplier[] }>('/v1/admin/suppliers').catch(() => ({ items: [] as Supplier[] })),
      get<{ items: Location[] }>('/v1/admin/locations').catch(() => ({ items: [] as Location[] })),
    ]).then(([c, b, s, l]) => { if (live) setV({ categories: c.items, brands: b.items, suppliers: s.items, locations: l.items }) }, () => { if (live) setV({ categories: [], brands: [], suppliers: [], locations: [] }) })
    return () => { live = false }
  }, [])
  return v
}

// ---- the list -----------------------------------------------------------------------------------------

export function ProductsList() {
  const { can, openModal, toast } = useStore()
  const lookups = useLookups()
  const [rows, setRows] = useState<ApiProduct[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [more, setMore] = useState(false)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)

  const query = (cursor?: string) => {
    const p = new URLSearchParams({ limit: '100' })
    if (category) p.set('categoryId', category)
    if (status !== 'All statuses') p.set('status', status.toLowerCase())
    if (cursor) p.set('cursor', cursor)
    return get<{ items: ApiProduct[]; nextCursor: string | null }>(`/v1/admin/products?${p}`)
  }
  useEffect(() => {
    const mine = ++seq.current
    void query().then(
      (r) => { if (mine === seq.current) { setRows(r.items); setNext(r.nextCursor); setState('ready') } },
      () => { if (mine === seq.current) setState((cur) => (cur === 'ready' ? cur : 'error')) },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, status, tick])

  const loadMore = async () => {
    if (!next) return
    setMore(true)
    try { const r = await query(next); setRows((x) => [...x, ...r.items]); setNext(r.nextCursor) } catch (e) { toast(says(e)) } finally { setMore(false) }
  }

  const tracked = rows.filter((p) => p.status === 'active' && p.trackStock)
  const low = tracked.filter((p) => p.available <= p.reorderAt).length
  const value = tracked.reduce((n, p) => n + shillings(p.priceCents) * p.available, 0)

  const columns: Column<ApiProduct>[] = [
    {
      key: 'name', header: 'Product', sort: (a, b) => a.name.localeCompare(b.name),
      render: (p) => (
        <div className="product-cell" style={{ minWidth: 180 }}>
          {p.coverImage ? <img className="product-thumb" src={`/v1/files/${p.coverImage}`} alt="" loading="lazy" /> : <AvatarTile text={p.name[0] ?? '?'} />}
          <div>
            <button className="link-btn" onClick={() => navigate(`/products/${p.id}`)}>{p.name}</button>
            <div className="subtext">{p.sku}{Object.values(p.options ?? {}).length > 0 && ` · ${Object.values(p.options).join(' / ')}`}</div>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sort: (a, b) => (a.category ?? '').localeCompare(b.category ?? ''), render: (p) => <>{p.category ?? '—'}{p.subcategory && <span className="subtext" style={{ display: 'block' }}>{p.subcategory}</span>}</> },
    { key: 'brand', header: 'Brand', render: (p) => p.brand ?? '—' },
    { key: 'price', header: 'Price', sort: (a, b) => a.priceCents - b.priceCents, render: (p) => <b>{kes(shillings(p.priceCents))}</b> },
    { key: 'stock', header: 'Stock', sort: (a, b) => a.available - b.available, render: stockBadge },
    { key: 'status', header: 'Status', sort: (a, b) => a.status.localeCompare(b.status), render: (p) => <Badge tone={statusTone(p.status)}>{STATUS_TEXT[p.status]}</Badge> },
  ]

  return (
    <>
      <PageHead
        title="Products"
        desc="Manage your catalogue, prices and availability."
        actions={
          <>
            <Btn onClick={() => setTick((n) => n + 1)}>Refresh</Btn>
            <Btn disabled={!can('Products', 'Export') || !rows.length} onClick={() => { downloadCsv('products.csv', ['SKU', 'Name', 'Category', 'Brand', 'Price (KES)', 'Cost (KES)', 'In stock', 'Status'], rows.map((p) => [p.sku, p.name, p.category ?? '', p.brand ?? '', shillings(p.priceCents), shillings(p.costCents), p.available, STATUS_TEXT[p.status]])); toast('Products exported') }}>Export</Btn>
            <Btn variant="primary" disabled={!can('Products', 'Create')} onClick={() => navigate('/products/new')}>Add product</Btn>
          </>
        }
      />
      <div className="tile-row">
        <Stat label="Products" value={String(rows.length) + (next ? '+' : '')} trend={`${rows.filter((p) => p.status === 'active').length} active`} icon="◈" />
        <Stat label="Low or out of stock" value={String(low)} trend="Needs restocking" icon="▤" up={low === 0} />
        <Stat label="Categories" value={String(lookups?.categories.length ?? '—')} trend="In your catalogue" icon="▦" />
        <Stat label="Stock value" value={kes(value)} trend="At selling price" icon="↗" />
      </div>
      <DataTable
        title="All products"
        rows={rows}
        rowKey={(p) => p.id}
        columns={columns}
        loading={state === 'loading'}
        error={state === 'error' ? 'We couldn’t load the products.' : undefined}
        onRetry={() => { setState('loading'); setTick((n) => n + 1) }}
        searchLabel="Search products"
        emptyTitle="No products yet"
        empty="Add your first product to start selling."
        emptyAction={can('Products', 'Create') ? { label: 'Add a product', onClick: () => navigate('/products/new') } : undefined}
        searchText={(p) => `${p.name} ${p.sku} ${p.category ?? ''} ${p.brand ?? ''} ${p.barcode}`}
        tools={
          <>
            <select className="select" aria-label="Category" value={category} onChange={(e) => { setState('loading'); setCategory(e.target.value) }}>
              <option value="">All categories</option>{lookups?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="select" aria-label="Status" value={status} onChange={(e) => { setState('loading'); setStatus(e.target.value) }}>
              <option>All statuses</option><option>Active</option><option>Draft</option><option>Archived</option>
            </select>
          </>
        }
        bulk={{
          label: 'Archive',
          onClick: (ids) =>
            can('Products', 'Edit')
              ? openModal({
                  title: `Archive ${ids.length} ${ids.length === 1 ? 'product' : 'products'}?`,
                  message: 'Archived products are hidden from the app. You can restore them later.',
                  confirm: 'Archive',
                  onConfirm: () => {
                    void Promise.allSettled(ids.map((id) => { const p = rows.find((r) => r.id === id)!; return patch(`/v1/admin/products/${id}`, { status: 'archived' }, p.version) })).then((res) => {
                      const failed = res.filter((r) => r.status === 'rejected').length
                      toast(failed ? `${ids.length - failed} archived, ${failed} couldn’t be` : `${ids.length} archived`)
                      setTick((n) => n + 1)
                    })
                  },
                })
              : toast('Your role can’t edit products'),
        }}
        actions={(p) => <Btn small onClick={() => navigate(`/products/${p.id}`)}>Edit</Btn>}
      />
      {next && <div style={{ textAlign: 'center', margin: '12px 0' }}><Btn disabled={more} onClick={() => void loadMore()}>{more ? 'Loading…' : 'Load more products'}</Btn></div>}
    </>
  )
}

// ---- add / edit ---------------------------------------------------------------------------------------

const toCents = (v: string) => Math.round(Number(v) * 100)

export function ProductForm({ id }: { id?: string }) {
  const { can, toast } = useStore()
  const lookups = useLookups()
  const [existing, setExisting] = useState<ApiProduct | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>(id ? 'loading' : 'ready')

  useEffect(() => {
    if (!id) return
    void get<ApiProduct>(`/v1/admin/products/${id}`).then(
      (p) => { setExisting(p); setState('ready') },
      (e) => setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error'),
    )
  }, [id])

  if (state === 'loading' || !lookups) return <PageHead title={id ? 'Edit product' : 'Add product'} desc="Loading…" actions={<Btn onClick={() => navigate('/products')}>Back to products</Btn>} />
  if (state !== 'ready') {
    return (
      <>
        <PageHead title="Products" desc={state === 'error' ? 'We couldn’t load this product.' : 'That product doesn’t exist.'} actions={<Btn onClick={() => navigate('/products')}>Back to products</Btn>} />
        <Notice tone="warning" mark="!">{state === 'error' ? 'Check your connection and try again.' : 'We couldn’t find this product.'}</Notice>
      </>
    )
  }
  return <Editor key={existing?.id ?? 'new'} existing={existing} lookups={lookups} onToast={toast} allowed={existing ? can('Products', 'Edit') : can('Products', 'Create')} />
}

function Editor({ existing, lookups, onToast, allowed }: { existing: ApiProduct | null; lookups: NonNullable<ReturnType<typeof useLookups>>; onToast: (m: string) => void; allowed: boolean }) {
  const [f, setF] = useState(() => ({
    name: existing?.name ?? '', sku: existing?.sku ?? '', categoryId: existing?.categoryId ?? '', subcategory: existing?.subcategory ?? '', brandId: existing?.brandId ?? '', supplierId: existing?.supplierId ?? '',
    price: existing ? String(shillings(existing.priceCents)) : '', cost: existing ? String(shillings(existing.costCents)) : '', barcode: existing?.barcode ?? '', tax: existing?.tax ?? 'standard',
    track: existing?.trackStock ?? true, status: existing?.status ?? 'draft', reorderAt: String(existing?.reorderAt ?? 10), description: existing?.description ?? '', stock: '0', locationId: lookups.locations.find((l) => l.primary)?.id ?? '',
  }))
  const [specs, setSpecs] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(existing?.specs ?? {}).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)])))
  const [options, setOptions] = useState<Record<string, string>>(existing?.options ?? {})
  const [images, setImages] = useState<{ id: string; url: string }[]>(existing?.images ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const unsaved = useUnsavedGuard(useDirty({ f, specs, options, images }))
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))
  const cat = lookups.categories.find((c) => c.id === f.categoryId)
  const subs = cat?.subcategories ?? []
  const specAttrs = (cat?.attributes ?? []).filter((a) => !a.isOption)
  const optAttrs = (cat?.attributes ?? []).filter((a) => a.isOption)

  const addPhotos = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files).slice(0, 10 - images.length)) {
      if (file.size > 5 * 1024 * 1024) { onToast(`${file.name} is over 5 MB`); continue }
      try { const up = await uploadFile('product-image', file); setImages((x) => [...x, up]) } catch (e) { onToast(says(e)) }
    }
  }

  const save = async () => {
    const e: Record<string, string> = {}
    if (f.name.trim().length < 2) e.name = 'Name the product'
    const sku = f.sku.trim().toUpperCase()
    if (!existing && !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(sku)) e.sku = 'Use capital letters, numbers, dashes (for example TOTE-001)'
    const price = Number(f.price)
    if (!(price > 0)) e.price = 'Enter the price in shillings'
    const cost = f.cost === '' ? 0 : Number(f.cost)
    if (!(cost >= 0)) e.cost = 'Enter the cost in shillings'
    else if (cost > price) e.cost = 'The cost is more than the selling price'
    const reorder = Number(f.reorderAt)
    if (!Number.isInteger(reorder) || reorder < 0) e.reorderAt = 'Enter 0 or more'
    const stock = Number(f.stock)
    if (!existing && (!Number.isInteger(stock) || stock < 0)) e.stock = 'Stock must be 0 or more'
    if (f.status === 'active' && f.description.trim().length < 10) e.description = 'Add a short description before publishing'
    for (const a of specAttrs) if (a.required && !(specs[a.key] ?? '').trim()) e[`spec:${a.key}`] = `${a.label} is required`
    for (const a of specAttrs) if (a.kind === 'number' && (specs[a.key] ?? '').trim() && !Number.isFinite(Number(specs[a.key]))) e[`spec:${a.key}`] = `${a.label} must be a number`
    for (const a of optAttrs) if (!(options[a.key] ?? '').trim()) e[`opt:${a.key}`] = `Choose ${a.label.toLowerCase()}`
    setErrors(e)
    if (Object.keys(e).length) return
    const specsOut: Record<string, string | number | boolean> = {}
    for (const a of specAttrs) { const v = (specs[a.key] ?? '').trim(); if (v) specsOut[a.key] = a.kind === 'number' ? Number(v) : a.kind === 'yes_no' ? v === 'yes' : v }
    const optionsOut: Record<string, string> = {}
    for (const a of optAttrs) optionsOut[a.key] = (options[a.key] ?? '').trim()
    const body = {
      name: f.name.trim(), description: f.description.trim(), priceCents: toCents(f.price), costCents: toCents(f.cost || '0'), categoryId: f.categoryId || null, subcategory: f.subcategory,
      brandId: f.brandId || null, supplierId: f.supplierId || null, barcode: f.barcode.trim(), tax: f.tax, trackStock: f.track, status: f.status, reorderAt: reorder,
      specs: specsOut, options: optionsOut,
    }
    setBusy(true)
    try {
      let saved: ApiProduct
      if (existing) saved = await patch<ApiProduct>(`/v1/admin/products/${existing.id}`, body, existing.version)
      else saved = await post<ApiProduct>('/v1/admin/products', { ...body, sku, initialStock: stock, ...(f.locationId ? { locationId: f.locationId } : {}) })
      const before = existing?.images?.map((i) => i.id).join(',') ?? ''
      if (images.map((i) => i.id).join(',') !== before) await put(`/v1/admin/products/${saved.id}/images`, { uploadIds: images.map((i) => i.id) })
      unsaved()
      onToast(existing ? 'Product saved' : 'Product added')
      navigate(!existing && optAttrs.length ? `/products/${saved.id}` : '/products')
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) setErrors({ form: 'Someone else changed this product. Reload the page to see their changes, then try again.' })
      else if (err instanceof ApiError && /sku/i.test(err.message)) setErrors({ sku: err.message })
      else setErrors({ form: says(err) })
    } finally { setBusy(false) }
  }

  const price = Number(f.price)
  return (
    <>
      <PageHead
        title={existing ? 'Edit product' : 'Add product'}
        desc={existing ? `Added ${shortDate(Date.parse(existing.createdAt))}` : 'Create a new product for the app.'}
        actions={<Btn onClick={() => navigate('/products')}>Back to products</Btn>}
      />
      {!allowed && <div style={{ marginBottom: 14 }}><Notice tone="warning" mark="!">Your role can view this product but not change it.</Notice></div>}
      {errors.form && <div style={{ marginBottom: 14 }}><Notice tone="error" mark="!">{errors.form}</Notice></div>}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(260px,.8fr)', alignItems: 'start' }}>
        <section className="card form-card">
          <h2>Product details</h2>
          <Field label="Product name" value={f.name} onChange={set('name')} error={errors.name} placeholder="e.g. Canvas Weekender Bag" />
          <div className="form-grid">
            <Field label="SKU" value={f.sku} onChange={set('sku')} error={errors.sku} disabled={!!existing} placeholder="e.g. TOTE-001" hint={existing ? 'A SKU can’t change once the product exists.' : undefined} />
            <Field label="Category" value={f.categoryId} onChange={(v) => { set('categoryId')(v); set('subcategory')('') }} options={[{ value: '', label: 'No category' }, ...lookups.categories.map((c) => ({ value: c.id, label: c.name }))]} />
            <Field label="Price (KES)" value={f.price} onChange={set('price')} error={errors.price} />
            <Field label="Status" value={f.status} onChange={(v) => set('status')(v as typeof f.status)} options={[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
            {existing ? (
              <Field label="Stock available" value={String(existing.available)} onChange={() => undefined} disabled hint="Change stock from Stock adjustment so it is recorded." />
            ) : (
              <Field label="Opening stock" value={f.stock} onChange={set('stock')} error={errors.stock} />
            )}
            <Field label="Reorder level" value={f.reorderAt} onChange={set('reorderAt')} error={errors.reorderAt} hint="You’ll be warned when stock falls to this number." />
          </div>
          {!existing && lookups.locations.length > 1 && (
            <Field label="Opening stock location" value={f.locationId} onChange={set('locationId')} options={lookups.locations.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name }))} />
          )}
          <h3 style={{ fontSize: 12, margin: '6px 0 8px' }}>Inventory details</h3>
          <div className="form-grid">
            <Field label="Brand" value={f.brandId} onChange={set('brandId')} options={[{ value: '', label: 'No brand' }, ...lookups.brands.map((b) => ({ value: b.id, label: b.name }))]} />
            <Field label="Subcategory" value={f.subcategory} onChange={set('subcategory')} options={[{ value: '', label: 'None' }, ...subs.map((s) => ({ value: s, label: s }))]} />
            <Field label="Supplier" value={f.supplierId} onChange={set('supplierId')} options={[{ value: '', label: 'No supplier' }, ...lookups.suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
            <Field label="Cost per unit (KES)" value={f.cost} onChange={set('cost')} error={errors.cost} hint="What you pay. Used for stock value and profit." />
            <Field label="Barcode" value={f.barcode} onChange={set('barcode')} placeholder="Optional" />
            <Field label="Tax category" value={f.tax} onChange={(v) => set('tax')(v as typeof f.tax)} options={[{ value: 'standard', label: 'Standard VAT' }, { value: 'zero', label: 'Zero-rated' }]} />
            <Field label="Inventory tracking" value={f.track ? 'Track quantity' : 'Do not track'} onChange={(v) => set('track')(v === 'Track quantity')} options={['Track quantity', 'Do not track']} />
          </div>
          <Field label="Description" multiline value={f.description} onChange={set('description')} error={errors.description} />

          {cat && specAttrs.length > 0 && (
            <>
              <h3 style={{ fontSize: 12, margin: '6px 0 8px' }}>{`${cat.name} details`}</h3>
              <div className="form-grid">
                {specAttrs.map((a) => <AttrField key={a.key} attr={a} value={specs[a.key] ?? ''} onChange={(v) => setSpecs((x) => ({ ...x, [a.key]: v }))} error={errors[`spec:${a.key}`]} />)}
              </div>
            </>
          )}
          {cat && optAttrs.length > 0 && (
            <>
              <h3 style={{ fontSize: 12, margin: '6px 0 8px' }}>{existing?.groupId ? 'Which one is this?' : 'Options shoppers choose'}</h3>
              <div className="form-grid">
                {optAttrs.map((a) => <AttrField key={a.key} attr={a} value={options[a.key] ?? ''} onChange={(v) => setOptions((x) => ({ ...x, [a.key]: v }))} error={errors[`opt:${a.key}`]} />)}
              </div>
              <div className="panel-sub">{existing ? 'This product is one choice. Add the other choices (sizes, colours, storage) under Variants.' : 'This product is one choice. Save it, then add the other choices as variants.'}</div>
            </>
          )}
          {!cat && <div className="panel-sub">Pick a category to see the details its products carry (for example size and colour for clothes, storage and RAM for phones).</div>}
          {existing && cat && optAttrs.length > 0 && <VariantsPanel product={existing} attrs={optAttrs} ready={optAttrs.every((a) => (existing.options[a.key] ?? '') !== '')} onChanged={() => onToast('Variants updated')} />}

          <div className="field">
            <label>Photos</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {images.map((img, i) => (
                <div key={img.id} style={{ position: 'relative' }}>
                  <img src={img.url} alt={`Product photo ${i + 1}`} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8 }} />
                  <button type="button" className="btn" style={{ position: 'absolute', top: -6, right: -6, padding: '0 6px' }} aria-label={`Remove photo ${i + 1}`} onClick={() => setImages(images.filter((x) => x.id !== img.id))}>×</button>
                </div>
              ))}
            </div>
            {images.length < 10 && (
              <label className="drop" style={{ cursor: 'pointer' }}>
                Click to add photos (JPG, PNG or WebP, up to 5 MB each). The first one is the cover.
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(e) => { void addPhotos(e.target.files); e.target.value = '' }} />
              </label>
            )}
          </div>
          <div className="form-actions">
            <Btn onClick={() => navigate('/products')}>Cancel</Btn>
            <Btn variant="primary" disabled={!allowed || busy} onClick={() => void save()}>{busy ? 'Saving…' : existing ? 'Save product' : 'Add product'}</Btn>
          </div>
        </section>
        <Panel title="Summary" sub="How it will appear">
          <SettingRow title="Status" right={<Badge tone={statusTone(f.status)}>{STATUS_TEXT[f.status]}</Badge>} />
          <SettingRow title="Price" right={<b>{price > 0 ? kes(price) : '—'}</b>} />
          <SettingRow title="Stock" right={<span className="prod-name">{existing ? existing.available : f.stock || 0}</span>} />
          <SettingRow title="Category" right={<span className="prod-name">{lookups.categories.find((c) => c.id === f.categoryId)?.name ?? '—'}</span>} />
          {existing?.levels && existing.levels.length > 0 && existing.levels.map((l) => <SettingRow key={l.locationId} title={l.location} right={<span className="prod-name">{l.onHand}</span>} />)}
        </Panel>
      </div>
    </>
  )
}

// ---- category-driven fields and variants --------------------------------------------------------------

/** One field for a category attribute: a list for choices, yes/no, a number or text. */
function AttrField({ attr, value, onChange, error }: { attr: Attribute; value: string; onChange: (v: string) => void; error?: string }) {
  const label = `${attr.label}${attr.unit ? ` (${attr.unit})` : ''}${attr.required || attr.isOption ? ' *' : ''}`
  if (attr.kind === 'choice') return <Field label={label} value={value} onChange={onChange} error={error} options={[{ value: '', label: 'Select…' }, ...attr.choices.map((c) => ({ value: c, label: c }))]} />
  if (attr.kind === 'yes_no') return <Field label={label} value={value} onChange={onChange} error={error} options={[{ value: '', label: 'Not set' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
  return <Field label={label} value={value} onChange={onChange} error={error} type={attr.kind === 'number' ? 'number' : 'text'} />
}

const abbr = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)

/** The choices of one item (other sizes, colours, storage...): each is its own product with its own SKU, price and stock. */
function VariantsPanel({ product, attrs, ready, onChanged }: { product: ApiProduct; attrs: Attribute[]; ready: boolean; onChanged: () => void }) {
  const { toast, can } = useStore()
  const [items, setItems] = useState<ApiProduct[] | null>(null)
  const [tick, setTick] = useState(0)
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    let live = true
    void get<{ items: ApiProduct[] }>(`/v1/admin/products/${product.id}/variants`).then((r) => { if (live) setItems(r.items) }, () => { if (live) setItems([]) })
    return () => { live = false }
  }, [product.id, tick])
  const label = (p: ApiProduct) => attrs.map((a) => p.options[a.key]).filter(Boolean).join(' / ') || '—'
  const group = (items ?? []).filter((p) => p.groupId && p.groupId === product.groupId)
  return (
    <div className="field">
      <label>Variants</label>
      {items === null && <div className="panel-sub">Loading…</div>}
      {items !== null && group.length === 0 && <div className="panel-sub">No other variants yet. Add the other sizes, colours or storage options shoppers can buy.</div>}
      {group.length > 0 && (
        <table style={{ width: '100%', fontSize: 12, marginBottom: 8 }}>
          <thead><tr><th align="left">Choice</th><th align="left">SKU</th><th align="right">Price</th><th align="right">Stock</th><th /></tr></thead>
          <tbody>
            {group.map((p) => (
              <tr key={p.id} style={p.id === product.id ? { fontWeight: 600 } : undefined}>
                <td>{label(p)}{p.status !== 'active' && <span className="subtext">{STATUS_TEXT[p.status]}</span>}</td>
                <td>{p.sku}</td>
                <td align="right">{kes(shillings(p.priceCents))}</td>
                <td align="right">{p.available}</td>
                <td align="right">{p.id === product.id ? <span className="subtext">this one</span> : <Btn small onClick={() => navigate(`/products/${p.id}`)}>Edit</Btn>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!ready && <Notice tone="warning" mark="!">Choose this product’s own options above and save before adding variants.</Notice>}
      {ready && !adding && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn small disabled={!can('Products', 'Create')} onClick={() => setAdding(true)}>+ Add variants</Btn>
          {group.length > 1 && <Btn small disabled={!can('Products', 'Edit')} onClick={() => { void post<{ copied: number }>(`/v1/admin/products/${product.id}/copy-images`).then((r) => { toast(r.copied ? `Photos copied to ${r.copied} variant${r.copied === 1 ? '' : 's'}` : 'The other variants already have photos'); setTick((n) => n + 1) }, () => toast('Couldn’t copy the photos')) }}>Use these photos on the other variants</Btn>}
        </div>
      )}
      {ready && adding && (
        <VariantBuilder product={product} attrs={attrs} existing={group} onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); setTick((n) => n + 1); onChanged() }} onError={(m) => toast(m)} />
      )}
      <div className="hint">The name, description, category and details are shared by all variants. Each variant has its own SKU, price, stock and photos.</div>
    </div>
  )
}

function VariantBuilder({ product, attrs, existing, onClose, onDone, onError }: { product: ApiProduct; attrs: Attribute[]; existing: ApiProduct[]; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [rows, setRows] = useState<{ options: Record<string, string>; sku: string; price: string; stock: string }[] | null>(null)
  const [price, setPrice] = useState(String(shillings(product.priceCents)))
  const [stock, setStock] = useState('0')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const valuesFor = (a: Attribute): string[] => (a.kind === 'choice' ? picked[a.key] ?? [] : (typed[a.key] ?? '').split(',').map((x) => x.trim()).filter(Boolean))
  const preview = () => {
    const lists = attrs.map((a) => valuesFor(a))
    if (lists.some((l) => l.length === 0)) return setErr('Choose at least one value for every option')
    let combos: Record<string, string>[] = [{}]
    attrs.forEach((a, i) => { combos = combos.flatMap((c) => lists[i]!.map((v) => ({ ...c, [a.key]: v }))) })
    const have = new Set(existing.map((p) => JSON.stringify(attrs.map((a) => (p.options[a.key] ?? '').toLowerCase()))))
    const fresh = combos.filter((c) => !have.has(JSON.stringify(attrs.map((a) => c[a.key]!.toLowerCase()))))
    if (!fresh.length) return setErr('All of those combinations already exist')
    setErr('')
    setRows(fresh.map((o) => ({ options: o, sku: [product.sku, ...attrs.map((a) => abbr(o[a.key]!))].join('-').slice(0, 64), price, stock })))
  }
  const create = async () => {
    if (!rows) return
    const skus = rows.map((r) => r.sku.trim().toUpperCase())
    if (skus.some((x) => !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(x))) return setErr('Every SKU needs capital letters, numbers or dashes')
    if (new Set(skus).size !== skus.length) return setErr('Two variants have the same SKU. Make each one different.')
    if (rows.some((r) => !(Number(r.price) > 0) || !Number.isInteger(Number(r.stock)) || Number(r.stock) < 0)) return setErr('Check the price and stock of every row')
    setBusy(true)
    try {
      await post(`/v1/admin/products/${product.id}/variants`, { variants: rows.map((r, i) => ({ sku: skus[i], options: r.options, priceCents: toCents(r.price), initialStock: Number(r.stock) })) })
      onDone()
    } catch (e) { setErr(says(e)); onError(says(e)) } finally { setBusy(false) }
  }
  const setRow = (i: number, k: 'sku' | 'price' | 'stock', v: string) => setRows((x) => x && x.map((r, n) => (n === i ? { ...r, [k]: v } : r)))

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12 }}>
      {!rows && (
        <>
          {attrs.map((a) => (
            <div key={a.key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{a.label}</div>
              {a.kind === 'choice' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {a.choices.map((c) => (
                    <label key={c} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
                      <input type="checkbox" checked={(picked[a.key] ?? []).includes(c)} onChange={(e) => setPicked((x) => ({ ...x, [a.key]: e.target.checked ? [...(x[a.key] ?? []), c] : (x[a.key] ?? []).filter((y) => y !== c) }))} />{c}
                    </label>
                  ))}
                </div>
              ) : (
                <Field label="" value={typed[a.key] ?? ''} onChange={(v) => setTyped((x) => ({ ...x, [a.key]: v }))} placeholder="Separate with commas, e.g. 500 ml, 1 L" />
              )}
            </div>
          ))}
          <div className="form-grid">
            <Field label="Price of each (KES)" value={price} onChange={setPrice} />
            <Field label="Opening stock of each" value={stock} onChange={setStock} />
          </div>
          {err && <div className="field-error">{err}</div>}
          <div className="sp-row end"><Btn small onClick={onClose}>Cancel</Btn><Btn small variant="primary" onClick={preview}>Preview variants</Btn></div>
        </>
      )}
      {rows && (
        <>
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead><tr><th align="left">Choice</th><th align="left">SKU</th><th align="left">Price (KES)</th><th align="left">Stock</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{attrs.map((a) => r.options[a.key]).join(' / ')}</td>
                  <td><input aria-label="SKU" value={r.sku} onChange={(e) => setRow(i, 'sku', e.target.value)} style={{ width: 150 }} /></td>
                  <td><input aria-label="Price" value={r.price} onChange={(e) => setRow(i, 'price', e.target.value)} style={{ width: 90 }} /></td>
                  <td><input aria-label="Stock" value={r.stock} onChange={(e) => setRow(i, 'stock', e.target.value)} style={{ width: 60 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {err && <div className="field-error">{err}</div>}
          <div className="sp-row end" style={{ marginTop: 8 }}><Btn small onClick={() => setRows(null)}>Back</Btn><Btn small variant="primary" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : `Create ${rows.length} variant${rows.length === 1 ? '' : 's'}`}</Btn></div>
        </>
      )}
    </div>
  )
}
