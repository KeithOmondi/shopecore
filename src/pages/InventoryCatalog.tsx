import { useCallback, useEffect, useState } from 'react'

import { Stats, Steps } from '../components/finance-ui'
import { Detail } from '../components/support-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, Toggle, type Column } from '../components/ui'
import { ApiError, del, get, patch, post, put } from '../lib/api'
import { shortDate } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import type { ApiProduct, Attribute, Brand, Category } from './Products'

const says = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.')

/** Loads a list from the server and lets the page reload it after a change. */
function useList<T>(path: string) {
  const [items, setItems] = useState<T[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    void get<{ items: T[] }>(path).then((r) => { if (live) { setItems(r.items); setFailed(false) } }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [path, tick])
  return { items, failed, reload: useCallback(() => setTick((n) => n + 1), []) }
}

// ---- categories ---------------------------------------------------------------------------------------------------

function NameForm({ title, initial, onSave, label = 'Name' }: { title: string; initial?: string; onSave: (name: string) => Promise<string | null>; label?: string }) {
  const { closeModal, toast } = useStore()
  const [v, setV] = useState(initial ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!v.trim()) return setErr('Enter a name')
    setBusy(true)
    const e = await onSave(v.trim())
    setBusy(false)
    if (e) return setErr(e)
    closeModal()
    toast(`${title} saved`)
  }
  return (
    <>
      <Field label={label} value={v} onChange={(x) => { setV(x); setErr('') }} error={err} />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={() => void submit()}>Save</Btn></div>
    </>
  )
}

const KIND_TEXT = { text: 'Text', number: 'Number', choice: 'Choose from a list', yes_no: 'Yes or no' } as const

/** The fields products in this category carry: facts like RAM or material, and choices shoppers make like size or colour. */
function CategoryFields({ cat, edit, reload }: { cat: Category; edit: boolean; reload: () => void }) {
  const { openModal, closeModal, toast } = useStore()
  const list = cat.attributes ?? []
  const save = async (next: Attribute[]): Promise<string | null> => {
    try {
      await put(`/v1/admin/categories/${cat.id}/attributes`, { attributes: next.map((a) => ({ label: a.label, kind: a.kind, unit: a.unit, choices: a.choices, isOption: a.isOption, required: a.required, filterable: a.filterable })) })
      reload()
      return null
    } catch (e) { return says(e) }
  }
  const form = (initial: Attribute | null, index: number) => openModal({
    title: initial ? `Edit ${initial.label}` : `Add a field to ${cat.name}`,
    body: <AttributeForm initial={initial} onSave={async (a) => { const e = await save(initial ? list.map((x, i) => (i === index ? a : x)) : [...list, a]); if (!e) { closeModal(); toast('Field saved') } return e }} />,
    noActions: true,
  })
  const move = (i: number, d: -1 | 1) => { const next = [...list]; const j = i + d; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j]!, next[i]!]; void save(next).then((e) => e && toast(e)) }
  return (
    <Panel title="Product fields" sub={`What a product in ${cat.name} carries. Fields marked “shoppers choose” make variants (each choice has its own stock and price).`}
      right={<Btn small variant="primary" disabled={!edit} onClick={() => form(null, -1)}>Add field</Btn>}>
      {list.length === 0 && <div className="panel-sub">No fields yet. Add the details products in this category need, for example Size and Colour for clothes, or Storage and RAM for phones.</div>}
      {list.map((a, i) => (
        <div className="list-row" key={a.key}>
          <div>
            <b>{a.label}{a.unit ? ` (${a.unit})` : ''}</b>
            <div className="panel-sub">{KIND_TEXT[a.kind]}{a.kind === 'choice' ? `: ${a.choices.join(', ')}` : ''}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
              {a.isOption && <Badge tone="blue">Shoppers choose</Badge>}
              {a.required && !a.isOption && <Badge tone="amber">Required</Badge>}
              {a.filterable && <Badge tone="green">Filter</Badge>}
            </div>
          </div>
          <div className="sp-row">
            <Btn small disabled={!edit || i === 0} label={`Move ${a.label} up`} onClick={() => move(i, -1)}>↑</Btn>
            <Btn small disabled={!edit || i === list.length - 1} label={`Move ${a.label} down`} onClick={() => move(i, 1)}>↓</Btn>
            <Btn small disabled={!edit} onClick={() => form(a, i)}>Edit</Btn>
            <Btn small disabled={!edit} label={`Remove ${a.label}`} onClick={() => openModal({ title: `Remove ${a.label}?`, message: 'Products keep what was entered, but it is no longer shown or asked for.', confirm: 'Remove', danger: true, onConfirm: () => { void save(list.filter((_, k) => k !== i)).then((e) => toast(e ?? 'Field removed')) } })}>×</Btn>
          </div>
        </div>
      ))}
    </Panel>
  )
}

function AttributeForm({ initial, onSave }: { initial: Attribute | null; onSave: (a: Attribute) => Promise<string | null> }) {
  const { closeModal } = useStore()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [kind, setKind] = useState<Attribute['kind']>(initial?.kind ?? 'text')
  const [unit, setUnit] = useState(initial?.unit ?? '')
  const [choices, setChoices] = useState((initial?.choices ?? []).join(', '))
  const [isOption, setIsOption] = useState(initial?.isOption ?? false)
  const [required, setRequired] = useState(initial?.required ?? false)
  const [filterable, setFilterable] = useState(initial?.filterable ?? false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const list = choices.split(/[,\n]/).map((c) => c.trim()).filter(Boolean)
  const submit = async () => {
    if (!label.trim()) return setErr('Give the field a name, for example Size')
    if (kind === 'choice' && list.length < 2) return setErr('List at least two choices, separated by commas')
    setBusy(true)
    const e = await onSave({ key: initial?.key ?? '', label: label.trim(), kind, unit: kind === 'number' ? unit.trim() : '', choices: kind === 'choice' ? list : [], isOption, required: required || isOption, filterable })
    setBusy(false)
    if (e) setErr(e)
  }
  return (
    <>
      <Field label="Name" value={label} onChange={(v) => { setLabel(v); setErr('') }} placeholder="e.g. Size, Colour, RAM, Material" />
      <Field label="Type" value={kind} onChange={(v) => { setKind(v as Attribute['kind']); if (v === 'yes_no') setIsOption(false) }} options={[{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'choice', label: 'Choose from a list' }, { value: 'yes_no', label: 'Yes or no' }]} />
      {kind === 'number' && <Field label="Unit (optional)" value={unit} onChange={setUnit} placeholder="e.g. in, W, kg, GB" />}
      {kind === 'choice' && <Field label="Choices" multiline value={choices} onChange={(v) => { setChoices(v); setErr('') }} hint="Separate with commas, e.g. S, M, L, XL" />}
      {kind !== 'yes_no' && <SettingRow title="Shoppers choose this" sub="Size, colour or storage. Each choice becomes a variant with its own stock and price." right={<Toggle on={isOption} onChange={setIsOption} label="Shoppers choose this" />} />}
      {!isOption && <SettingRow title="Required" sub="Staff must fill it in for every product." right={<Toggle on={required} onChange={setRequired} label="Required" />} />}
      <SettingRow title="Offer as a filter" sub="Shoppers can narrow a category by this." right={<Toggle on={filterable} onChange={setFilterable} label="Offer as a filter" />} />
      {err && <div className="field-error">{err}</div>}
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={() => void submit()}>Save field</Btn></div>
    </>
  )
}

export function CategoriesPage() {
  const { openModal, toast, can } = useStore()
  const { items: categories, failed, reload } = useList<Category>('/v1/admin/categories')
  const [sel, setSel] = useState('')
  const [draft, setDraft] = useState<{ id: string; v: string } | null>(null)
  const edit = can('Products', 'Edit')
  const list = categories ?? []
  const cat = list.find((c) => c.id === sel) ?? list[0]
  const description = draft && draft.id === cat?.id ? draft.v : cat?.description ?? ''
  const subTotal = list.reduce((n, c) => n + c.subcategories.length, 0)

  const run = async (what: () => Promise<unknown>): Promise<string | null> => {
    try { await what(); reload(); return null } catch (e) { return says(e) }
  }

  return (
    <>
      <PageHead
        title="Categories and subcategories"
        desc="Organise products into a navigable catalogue."
        actions={
          <>
            <Btn disabled={!list.length} onClick={() => { downloadCsv('categories.csv', ['Category', 'Subcategory', 'Products'], list.flatMap((c) => (c.subcategories.length ? c.subcategories.map((s) => [c.name, s, c.products]) : [[c.name, '', c.products]]))); toast('Categories exported') }}>Export</Btn>
            <Btn variant="primary" disabled={!can('Products', 'Create')} onClick={() => openModal({ title: 'Add category', body: <NameForm title="Category" onSave={(n) => run(() => post('/v1/admin/categories', { name: n }))} />, noActions: true })}>Add category</Btn>
          </>
        }
      />
      {failed && !categories && <Notice tone="warning" mark="!">We couldn’t load the categories. <button className="link-btn" onClick={reload}>Try again</button></Notice>}
      <div className="sp-two">
        <Panel title="Catalogue structure" sub="Pick a category to edit it">
          {categories === null && !failed && <div className="panel-sub">Loading…</div>}
          {categories && list.length === 0 && <div className="panel-sub">No categories yet. Add your first one.</div>}
          {list.map((c) => (
            <div key={c.id}>
              <div className="list-row" style={c.id === cat?.id ? { background: 'var(--blue-soft)', paddingInline: 8, borderRadius: 6 } : undefined}>
                <div><button className="sp-link" onClick={() => setSel(c.id)}>{c.name}</button><div className="panel-sub">/{c.handle}</div></div>
                <Badge tone="gray">{`${c.products} products`}</Badge>
              </div>
              {c.id === cat?.id && c.subcategories.map((s) => <div className="list-row" key={s} style={{ marginLeft: 22 }}><span style={{ fontSize: 11 }}>• {s}</span></div>)}
            </div>
          ))}
        </Panel>
        <div className="sp-stack">
          {cat && (
            <Panel title="Category details">
              <Detail label="Selected category"><b>{cat.name}</b></Detail>
              <Detail label="URL handle">/{cat.handle}</Detail>
              <div style={{ marginTop: 10 }}>
                <Field label="Description" multiline value={description} onChange={(v) => setDraft({ id: cat.id, v })} />
                <Btn small disabled={!edit || description === cat.description} onClick={() => void run(() => patch(`/v1/admin/categories/${cat.id}`, { description })).then((e) => toast(e ?? 'Description saved'))}>Save description</Btn>
              </div>
              <div className="sp-label">Subcategories</div>
              <div className="sp-row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                {cat.subcategories.map((s) => (
                  <span key={s} className="sp-row" style={{ gap: 2, border: '1px solid var(--line)', borderRadius: 99, padding: '2px 4px 2px 10px', fontSize: 11 }}>
                    {s}
                    <Btn small disabled={!edit} label={`Remove ${s}`} onClick={() => void run(() => patch(`/v1/admin/categories/${cat.id}`, { subcategories: cat.subcategories.filter((x) => x !== s) })).then((e) => e && toast(e))}>×</Btn>
                  </span>
                ))}
                <Btn small disabled={!edit} onClick={() => openModal({ title: `Add subcategory to ${cat.name}`, body: <NameForm title="Subcategory" label="Subcategory name" onSave={(n) => (cat.subcategories.some((s) => s.toLowerCase() === n.toLowerCase()) ? Promise.resolve('That subcategory already exists') : run(() => patch(`/v1/admin/categories/${cat.id}`, { subcategories: [...cat.subcategories, n] })))} />, noActions: true })}>+ Add</Btn>
              </div>
              <div className="sp-row between">
                <Btn variant="danger" disabled={!can('Products', 'Delete')} onClick={() => openModal({ title: `Delete ${cat.name}?`, message: 'Products must be moved out first. The category and its subcategories are removed.', confirm: 'Delete category', danger: true, onConfirm: () => { void run(() => del(`/v1/admin/categories/${cat.id}`)).then((e) => toast(e ?? 'Category deleted')) } })}>Delete</Btn>
                <Btn disabled={!edit} onClick={() => openModal({ title: `Rename ${cat.name}`, body: <NameForm title="Category" initial={cat.name} onSave={(n) => run(() => patch(`/v1/admin/categories/${cat.id}`, { name: n }))} />, noActions: true })}>Rename</Btn>
              </div>
            </Panel>
          )}
          {cat && <CategoryFields cat={cat} edit={edit} reload={reload} />}
          <Panel title="Catalogue summary">
            <Detail label="Categories">{list.length}</Detail>
            <Detail label="Subcategories">{subTotal}</Detail>
            <Detail label="Products in categories">{list.reduce((n, c) => n + c.products, 0)}</Detail>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- brands -----------------------------------------------------------------------------------------------------------

function BrandForm({ brand, onSaved }: { brand?: Brand; onSaved: () => void }) {
  const { closeModal, toast } = useStore()
  const [name, setName] = useState(brand?.name ?? '')
  const [origin, setOrigin] = useState(brand?.origin ?? '')
  const [status, setStatus] = useState(brand?.status ?? 'active')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) return setErr('Name the brand')
    setBusy(true)
    try {
      const body = { name: name.trim(), origin: origin.trim(), status }
      if (brand) await patch(`/v1/admin/brands/${brand.id}`, body)
      else await post('/v1/admin/brands', body)
      onSaved()
      closeModal()
      toast('Brand saved')
    } catch (e) { setErr(says(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <Field label="Brand name" value={name} onChange={(v) => { setName(v); setErr('') }} error={err} />
      <div className="sp-form2">
        <Field label="Origin" value={origin} onChange={setOrigin} placeholder="Nairobi, Kenya" />
        <Field label="Status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }]} />
      </div>
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={() => void save()}>Save brand</Btn></div>
    </>
  )
}

export function BrandsPage() {
  const { openModal, toast, can } = useStore()
  const { items, failed, reload } = useList<Brand & { updatedAt: string }>('/v1/admin/brands')
  const [status, setStatus] = useState('All statuses')
  const edit = can('Products', 'Edit')
  const rows = (items ?? []).filter((b) => status === 'All statuses' || b.status === status.toLowerCase())
  const cols: Column<Brand & { updatedAt: string }>[] = [
    { key: 'n', header: 'Brand', sort: (a, b) => a.name.localeCompare(b.name), render: (b) => <b>{b.name}</b> },
    { key: 'p', header: 'Products', sort: (a, b) => a.products - b.products, render: (b) => b.products },
    { key: 'o', header: 'Origin', render: (b) => b.origin || '—' },
    { key: 's', header: 'Status', render: (b) => <Badge tone={b.status === 'active' ? 'green' : 'gray'}>{b.status === 'active' ? 'Active' : 'Draft'}</Badge> },
    { key: 'u', header: 'Updated', sort: (a, b) => a.updatedAt.localeCompare(b.updatedAt), render: (b) => shortDate(Date.parse(b.updatedAt)) },
  ]
  return (
    <>
      <PageHead title="Brands" desc="Manage brand profiles and product associations." actions={<Btn variant="primary" disabled={!can('Products', 'Create')} onClick={() => openModal({ title: 'Add brand', body: <BrandForm onSaved={reload} />, noActions: true })}>Add brand</Btn>} />
      <DataTable
        title={`${rows.length} brands`} rows={rows} rowKey={(b) => b.id} columns={cols} loading={items === null && !failed} error={failed && !items ? 'We couldn’t load the brands.' : undefined} onRetry={reload}
        searchLabel="Search brands" searchText={(b) => `${b.name} ${b.origin}`} emptyTitle="No brands yet" empty="Add the brands you sell."
        tools={<select className="sp-select auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option><option>Active</option><option>Draft</option></select>}
        actions={(b) => (
          <div className="sp-row">
            <Btn small disabled={!edit} onClick={() => openModal({ title: `Edit ${b.name}`, body: <BrandForm brand={b} onSaved={reload} />, noActions: true })}>Edit</Btn>
            <Btn small disabled={!can('Products', 'Delete')} onClick={() => openModal({ title: `Delete ${b.name}?`, message: b.products ? `${b.products} products use this brand. They stay, without a brand.` : 'This brand has no products.', confirm: 'Delete brand', danger: true, onConfirm: () => { void del(`/v1/admin/brands/${b.id}`).then(() => { reload(); toast('Brand deleted') }, (e) => toast(says(e))) } })}>Delete</Btn>
          </div>
        )}
      />
    </>
  )
}

// ---- bulk import and export --------------------------------------------------------------------------------------------

/** Splits one CSV line, keeping commas inside quotes. */
const splitCsv = (line: string) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()).slice(0, -1) ?? []

interface ImportRow { name: string; sku: string; price: number; stock: number; categoryId: string; variantOf: string; extra: Record<string, string> }
interface Parsed { row: number; name: string; sku: string; price: string; stock: string; category: string; variantOf: string; error?: string; ok?: ImportRow }

const KNOWN_COLS = ['name', 'sku', 'price', 'stock', 'categ', 'variant']
/** Turns the typed-in text of a category field into the value the server stores. */
const fieldValue = (a: Attribute, raw: string): string | number | boolean => (a.kind === 'number' ? Number(raw) : a.kind === 'yes_no' ? /^(y|yes|true|1)$/i.test(raw) : raw)

export function BulkImport() {
  const { toast, can } = useStore()
  const { items: categories } = useList<Category>('/v1/admin/categories')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ created: number; failed: { row: number; message: string }[] } | null>(null)
  const edit = can('Products', 'Create')
  const cats = categories ?? []

  const parsed = ((): Parsed[] | string => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (!lines.length) return ''
    const head = splitCsv(lines[0]!).map((h) => h.toLowerCase())
    const col = (k: string) => head.findIndex((h) => h.includes(k))
    const [iN, iS, iP, iT, iC, iV] = [col('name'), col('sku'), col('price'), col('stock'), col('categ'), col('variant')]
    if (iN < 0 || iS < 0 || iP < 0) return 'The first row must have “name”, “sku” and “price” columns (and optionally “stock”, “category” and “variant of”).'
    const extraCols = head.map((h, j) => ({ h, j })).filter(({ h }) => h && !KNOWN_COLS.some((k) => h.includes(k)))
    const seen = new Set<string>()
    return lines.slice(1).map((l, i) => {
      const c = splitCsv(l)
      const r: Parsed = { row: i + 2, name: c[iN] ?? '', sku: (c[iS] ?? '').toUpperCase(), price: c[iP] ?? '', stock: iT >= 0 ? c[iT] ?? '0' : '0', category: iC >= 0 ? c[iC] ?? '' : '', variantOf: iV >= 0 ? (c[iV] ?? '').toUpperCase() : '' }
      const price = Number(r.price.replace(/[^\d.]/g, ''))
      const stock = Number(r.stock || 0)
      const cat = r.category ? cats.find((x) => x.name.toLowerCase() === r.category.toLowerCase()) : undefined
      if (!r.name) r.error = 'Missing name'
      else if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(r.sku)) r.error = 'SKU must be capitals, numbers and dashes'
      else if (!(price > 0)) r.error = 'Invalid price'
      else if (!Number.isInteger(stock) || stock < 0) r.error = 'Invalid stock'
      else if (r.category && !cat) r.error = 'Unknown category'
      else if (seen.has(r.sku)) r.error = 'Duplicate SKU in file'
      else {
        seen.add(r.sku)
        const extra: Record<string, string> = {}
        for (const { h, j } of extraCols) if ((c[j] ?? '').trim()) extra[h] = (c[j] ?? '').trim()
        r.ok = { name: r.name, sku: r.sku, price, stock, categoryId: cat?.id ?? '', variantOf: r.variantOf, extra }
      }
      return r
    })
  })()
  const rows = Array.isArray(parsed) ? parsed : []
  const valid = rows.filter((r) => r.ok)
  const bad = rows.length - valid.length

  const load = async (f: File | undefined) => { if (!f) return; setFileName(f.name); setText(await f.text()); setDone(null) }
  const template = () => downloadCsv('products-template.csv', ['name', 'sku', 'price', 'stock', 'category', 'variant of'], [['Example tote', 'EX-001', 3200, 12, cats[0]?.name ?? '', ''], ['Example tote', 'EX-002', 3400, 6, '', 'EX-001']])
  const exportAll = async () => {
    try {
      const all: ApiProduct[] = []
      let cursor: string | null = null
      do {
        const r: { items: ApiProduct[]; nextCursor: string | null } = await get(`/v1/admin/products?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
        all.push(...r.items)
        cursor = r.nextCursor
      } while (cursor && all.length < 5000)
      downloadCsv('products.csv', ['name', 'sku', 'price', 'stock', 'category', 'status', 'brand', 'cost'], all.map((p) => [p.name, p.sku, p.priceCents / 100, p.available, p.category ?? '', p.status, p.brand ?? '', p.costCents / 100]))
    } catch (e) { toast(says(e)) }
  }
  const run = async () => {
    setBusy(true)
    let created = 0
    const failed: { row: number; message: string }[] = []
    // Rows are matched to the category's own fields by their column heading ("Storage", "Colour"...): option fields describe
    // the choice a shopper makes, the rest are details of the product.
    const split = (categoryId: string, extra: Record<string, string>) => {
      const attrs = cats.find((x) => x.id === categoryId)?.attributes ?? []
      const specs: Record<string, string | number | boolean> = {}
      const options: Record<string, string | number> = {}
      for (const [h, raw] of Object.entries(extra)) {
        const a = attrs.find((x) => x.label.toLowerCase() === h)
        if (!a) continue
        if (a.isOption) options[a.key] = a.kind === 'number' ? Number(raw) : raw
        else specs[a.key] = fieldValue(a, raw)
      }
      return { specs, options }
    }
    const baseId = new Map<string, { id: string; categoryId: string }>()
    for (const r of valid.filter((x) => !x.ok!.variantOf)) {
      try {
        const { specs, options } = split(r.ok!.categoryId, r.ok!.extra)
        const made = await post<{ id: string }>('/v1/admin/products', { name: r.ok!.name, sku: r.ok!.sku, priceCents: Math.round(r.ok!.price * 100), categoryId: r.ok!.categoryId || null, initialStock: r.ok!.stock, status: 'draft', specs, options })
        baseId.set(r.ok!.sku, { id: made.id, categoryId: r.ok!.categoryId })
        created++
      } catch (e) { failed.push({ row: r.row, message: says(e) }) }
    }
    for (const r of valid.filter((x) => x.ok!.variantOf)) {
      try {
        let base = baseId.get(r.ok!.variantOf)
        if (!base) {
          const found = await get<{ items: ApiProduct[] }>(`/v1/admin/products?q=${encodeURIComponent(r.ok!.variantOf)}&limit=20`)
          const hit = found.items.find((x) => x.sku === r.ok!.variantOf)
          if (!hit) throw new Error(`No product with SKU ${r.ok!.variantOf} to add this to`)
          base = { id: hit.id, categoryId: hit.categoryId ?? '' }
        }
        const { options } = split(base.categoryId, r.ok!.extra)
        await post(`/v1/admin/products/${base.id}/variants`, { variants: [{ sku: r.ok!.sku, priceCents: Math.round(r.ok!.price * 100), options, initialStock: r.ok!.stock }] })
        created++
      } catch (e) { failed.push({ row: r.row, message: says(e) }) }
    }
    setBusy(false)
    setDone({ created, failed })
  }
  const cols: Column<Parsed>[] = [
    { key: 'r', header: 'Row', render: (r) => r.row },
    { key: 'n', header: 'Product name', render: (r) => r.name || '—' },
    { key: 's', header: 'SKU', render: (r) => r.sku || '—' },
    { key: 'p', header: 'Price', render: (r) => r.price },
    { key: 'st', header: 'Stock', render: (r) => r.stock },
    { key: 'c', header: 'Category', render: (r) => r.category || '—' },
    { key: 'vo', header: 'Variant of', render: (r) => r.variantOf || '—' },
    { key: 'v', header: 'Validation', render: (r) => <Badge tone={r.error ? 'red' : 'green'}>{r.error ?? 'Valid'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Bulk import and export" desc="Upload a CSV to add new products and their variants, or download your catalogue. Add a column named after a category field (such as Colour or Storage) to fill it in, and put a product’s SKU under “variant of” to add a variant." actions={<><Btn onClick={template}>Download template</Btn><Btn disabled={!can('Products', 'Export')} onClick={() => void exportAll()}>Export catalogue</Btn></>} />
      <Steps steps={[{ label: 'Add a file', done: !!text }, { label: 'Check rows', done: rows.length > 0 && bad === 0 }, { label: 'Import', done: !!done }]} />
      <div className="sp-stack">
        <Panel title="Import products" sub="CSV with name, sku, price, and optionally stock and category. New products are created as drafts." right={<Badge tone={done ? 'green' : text ? 'blue' : 'gray'}>{done ? 'Imported' : text ? 'Ready to check' : 'Waiting for a file'}</Badge>}>
          <div className="sp-row" style={{ marginBottom: 8 }}>
            <label className="btn small" style={{ cursor: 'pointer' }}>Choose a CSV file<input type="file" accept=".csv,text/csv" hidden aria-label="CSV file" onChange={(e) => { void load(e.target.files?.[0]) }} /></label>
            {fileName && <span className="panel-sub">{fileName}</span>}
          </div>
          <Field label="Or paste CSV rows here" multiline value={text} onChange={(v) => { setText(v); setDone(null) }} placeholder={'name,sku,price,stock,category\nCanvas tote,BAG-201,3200,25,Bags'} />
          {typeof parsed === 'string' && parsed && <div className="sp-err" role="alert">{parsed}</div>}
        </Panel>
        {rows.length > 0 && (
          <>
            <Stats><Stat label="Rows read" value={String(rows.length)} trend="In the file" icon="▤" /><Stat label="Valid" value={String(valid.length)} trend="Ready to import" icon="✓" /><Stat label="Need fixing" value={String(bad)} trend="Won’t be imported" icon="!" up={bad === 0} /></Stats>
            <DataTable title="Validation preview" rows={rows} rowKey={(r) => String(r.row)} columns={cols} searchLabel="Search rows" searchText={(r) => `${r.name} ${r.sku}`} pageSize={8} />
            <div className="sp-row end">
              <Btn onClick={() => { setText(''); setFileName(''); setDone(null) }}>Clear</Btn>
              <Btn variant="primary" disabled={!edit || !valid.length || !!done || busy} onClick={() => void run()}>{busy ? 'Importing…' : 'Import valid rows'}</Btn>
            </div>
          </>
        )}
        {done && (
          <Notice tone={done.failed.length ? 'warning' : 'success'} mark={done.failed.length ? '!' : '✓'}>
            {done.created} new products added as drafts.{done.failed.length ? ` ${done.failed.length} couldn’t be added: ${done.failed.slice(0, 3).map((f) => `row ${f.row} (${f.message})`).join(', ')}.` : ''} <button className="link-btn" onClick={() => navigate('/products')}>View products</button>
          </Notice>
        )}
        {!edit && <Notice>Your role can export products but not import them.</Notice>}
      </div>
    </>
  )
}
