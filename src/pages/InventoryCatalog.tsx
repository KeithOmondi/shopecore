import { useState } from 'react'

import { Stats, Steps } from '../components/finance-ui'
import { Detail } from '../components/support-ui'
import { Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, Stat, type Column } from '../components/ui'
import type { Brand } from '../data/inventory'
import { shortDate } from '../lib/format'
import { useInventory, type ImportRow } from '../lib/inventory'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

// ---- categories ---------------------------------------------------------------------------------------------------

function NameForm({ title, initial, onSave, label = 'Name' }: { title: string; initial?: string; onSave: (name: string) => string | null; label?: string }) {
  const { closeModal, toast } = useStore()
  const [v, setV] = useState(initial ?? '')
  const [err, setErr] = useState('')
  return (
    <>
      <Field label={label} value={v} onChange={(x) => { setV(x); setErr('') }} error={err} />
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={() => { const e = onSave(v); if (e) return setErr(e); closeModal(); toast(`${title} saved`) }}>Save</Btn></div>
    </>
  )
}

export function CategoriesPage() {
  const { categories, products, openModal, toast, can } = useStore()
  const inv = useInventory()
  const [sel, setSel] = useState(categories[0] ?? '')
  const cat = categories.includes(sel) ? sel : categories[0] ?? ''
  const node = inv.tree[cat]
  const edit = can('Products', 'Edit')
  const [desc, setDesc] = useState<{ cat: string; v: string }>({ cat, v: node?.description ?? '' })
  const description = desc.cat === cat ? desc.v : node?.description ?? ''
  const count = (c: string) => products.filter((p) => p.category === c && p.status !== 'Archived').length
  const subCount = (c: string, s: string) => products.filter((p) => p.category === c && inv.meta(p).subcategory === s).length
  const unassigned = products.filter((p) => p.status !== 'Archived' && !inv.meta(p).subcategory).length
  return (
    <>
      <PageHead title="Categories and subcategories" desc="Organise products into a navigable catalogue." actions={<><Btn onClick={() => { downloadCsv('categories.csv', ['Category', 'Subcategory', 'Products'], categories.flatMap((c) => (inv.tree[c]?.subs.length ? inv.tree[c]!.subs.map((s) => [c, s, subCount(c, s)]) : [[c, '', count(c)]]))); toast('Categories exported') }}>Export</Btn><Btn variant="primary" disabled={!can('Products', 'Create')} onClick={() => openModal({ title: 'Add category', body: <NameForm title="Category" onSave={(n) => { const e = inv.addCategory(n); if (!e) setSel(n.trim()); return e }} label="Category name" />, noActions: true })}>+ Add category</Btn></>} />
      <div className="sp-two">
        <Panel title="Catalogue structure" sub="Use the arrows to change the order">
          {categories.map((c, i) => (
            <div key={c}>
              <div className="list-row" style={c === cat ? { background: 'var(--blue-soft)', paddingInline: 8, borderRadius: 6 } : undefined}>
                <div><button className="sp-link" onClick={() => setSel(c)}>{c}</button><div className="panel-sub">/{inv.tree[c]?.handle ?? c.toLowerCase()}</div></div>
                <div className="sp-row"><Badge tone="gray">{`${count(c)} products`}</Badge><Btn small disabled={!edit || i === 0} onClick={() => inv.moveCategory(c, -1)} label={`Move ${c} up`}>↑</Btn><Btn small disabled={!edit || i === categories.length - 1} onClick={() => inv.moveCategory(c, 1)} label={`Move ${c} down`}>↓</Btn></div>
              </div>
              {c === cat && (inv.tree[c]?.subs ?? []).map((s) => <div className="list-row" key={s} style={{ marginLeft: 22 }}><span style={{ fontSize: 11 }}>• {s}</span><span className="panel-sub">{subCount(c, s)}</span></div>)}
            </div>
          ))}
        </Panel>
        <div className="sp-stack">
          {cat && (
            <Panel title="Category details">
              <Detail label="Selected category"><b>{cat}</b></Detail>
              <Detail label="URL handle">/{node?.handle}</Detail>
              <div style={{ marginTop: 10 }}><Field label="Description" multiline value={description} onChange={(v) => setDesc({ cat, v })} /></div>
              <div className="sp-label">Subcategories</div>
              <div className="sp-row" style={{ marginBottom: 10 }}>{(node?.subs ?? []).map((s) => <span key={s} className="sp-row" style={{ gap: 2, border: '1px solid var(--line)', borderRadius: 99, padding: '2px 4px 2px 10px', fontSize: 11 }}>{s}<button className="btn small" style={{ border: 0, padding: '0 6px' }} aria-label={`Remove ${s}`} disabled={!edit} onClick={() => { const e = inv.removeSub(cat, s); if (e) toast(e) }}>×</button></span>)}
                <Btn small disabled={!edit} onClick={() => openModal({ title: `Add subcategory to ${cat}`, body: <NameForm title="Subcategory" onSave={(n) => inv.addSub(cat, n)} label="Subcategory name" />, noActions: true })}>+ Add</Btn></div>
              <div className="sp-row between">
                <Btn variant="danger" disabled={!can('Products', 'Delete')} onClick={() => openModal({ title: `Delete ${cat}?`, message: 'Products must be moved out first. The category and its subcategories are removed.', confirm: 'Delete', danger: true, onConfirm: () => { const e = inv.deleteCategory(cat); toast(e ?? 'Category deleted') } })}>Delete</Btn>
                <div className="sp-row"><Btn disabled={!edit} onClick={() => openModal({ title: `Rename ${cat}`, body: <NameForm title="Category" initial={cat} onSave={(n) => { const e = inv.renameCategory(cat, n); if (!e) setSel(n.trim()); return e }} label="Category name" />, noActions: true })}>Rename</Btn><Btn variant="primary" disabled={!edit} onClick={() => { inv.patchCategory(cat, { description: description.trim() }); toast('Category updated') }}>Save changes</Btn></div>
              </div>
            </Panel>
          )}
          <Panel title="Catalogue summary">
            <Detail label="Categories">{categories.length}</Detail>
            <Detail label="Subcategories">{categories.reduce((n, c) => n + (inv.tree[c]?.subs.length ?? 0), 0)}</Detail>
            <Detail label="Products without a subcategory">{unassigned}</Detail>
          </Panel>
        </div>
      </div>
    </>
  )
}

// ---- brands -----------------------------------------------------------------------------------------------------------

function BrandForm({ brand }: { brand?: Brand }) {
  const inv = useInventory()
  const { closeModal, toast } = useStore()
  const [name, setName] = useState(brand?.name ?? '')
  const [origin, setOrigin] = useState(brand?.origin ?? '')
  const [status, setStatus] = useState(brand?.status ?? 'Active')
  const [err, setErr] = useState('')
  const save = () => {
    if (!name.trim()) return setErr('Name the brand')
    if (inv.brands.some((b) => b.id !== brand?.id && b.name.toLowerCase() === name.trim().toLowerCase())) return setErr('Another brand has that name')
    inv.saveBrand({ id: brand?.id, name: name.trim(), origin: origin.trim(), status: status as Brand['status'] })
    closeModal()
    toast('Brand saved')
  }
  return (
    <>
      <Field label="Brand name" value={name} onChange={(v) => { setName(v); setErr('') }} error={err} />
      <div className="sp-form2"><Field label="Origin" value={origin} onChange={setOrigin} placeholder="Nairobi, Kenya" /><Field label="Status" value={status} onChange={(v) => setStatus(v as Brand['status'])} options={['Active', 'Draft']} /></div>
      <div className="sp-row end"><Btn onClick={closeModal}>Cancel</Btn><Btn variant="primary" onClick={save}>Save brand</Btn></div>
    </>
  )
}

export function BrandsPage() {
  const { products, openModal, toast, can } = useStore()
  const inv = useInventory()
  const [status, setStatus] = useState('All statuses')
  const edit = can('Products', 'Edit')
  const n = (b: Brand) => products.filter((p) => inv.meta(p).brandId === b.id).length
  const rows = inv.brands.filter((b) => status === 'All statuses' || b.status === status)
  const cols: Column<Brand>[] = [
    { key: 'n', header: 'Brand', sort: (a, b) => a.name.localeCompare(b.name), render: (b) => <b>{b.name}</b> },
    { key: 'p', header: 'Products', sort: (a, b) => n(a) - n(b), render: (b) => n(b) },
    { key: 'o', header: 'Origin', render: (b) => b.origin || '—' },
    { key: 's', header: 'Status', render: (b) => <Badge tone={b.status === 'Active' ? 'green' : 'gray'}>{b.status}</Badge> },
    { key: 'u', header: 'Updated', sort: (a, b) => a.updatedAt - b.updatedAt, render: (b) => shortDate(b.updatedAt) },
  ]
  return (
    <>
      <PageHead title="Brands" desc="Manage brand profiles and product associations." actions={<Btn variant="primary" disabled={!can('Products', 'Create')} onClick={() => openModal({ title: 'Add brand', body: <BrandForm />, noActions: true })}>+ Add brand</Btn>} />
      <DataTable title={`${rows.length} brands`} rows={rows} rowKey={(b) => b.id} columns={cols} searchLabel="Search brands" searchText={(b) => `${b.name} ${b.origin}`}
        tools={<select className="sp-select auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All statuses</option><option>Active</option><option>Draft</option></select>}
        actions={(b) => <div className="sp-row"><Btn small disabled={!edit} onClick={() => openModal({ title: `Edit ${b.name}`, body: <BrandForm brand={b} />, noActions: true })}>Edit</Btn><Btn small disabled={!can('Products', 'Delete')} onClick={() => openModal({ title: `Delete ${b.name}?`, message: 'Products must be moved to another brand first.', confirm: 'Delete', danger: true, onConfirm: () => { const e = inv.deleteBrand(b.id); toast(e ?? 'Brand deleted') } })} label={`Delete ${b.name}`}>×</Btn></div>} />
    </>
  )
}

// ---- bulk import and export --------------------------------------------------------------------------------------------

/** Splits one CSV line, keeping commas inside quotes. */
const splitCsv = (line: string) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()).slice(0, -1) ?? []

interface Parsed { row: number; name: string; sku: string; price: string; stock: string; category: string; error?: string; ok?: ImportRow }

export function BulkImport() {
  const { products, categories, openModal, toast, can } = useStore()
  const inv = useInventory()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null)
  const edit = can('Products', 'Edit') && can('Products', 'Create')

  const parsed = ((): Parsed[] | string => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (!lines.length) return ''
    const head = splitCsv(lines[0]!).map((h) => h.toLowerCase())
    const col = (k: string) => head.findIndex((h) => h.includes(k))
    const [iN, iS, iP, iT, iC] = [col('name'), col('sku'), col('price'), col('stock'), col('categ')]
    if (iN < 0 || iS < 0 || iP < 0) return 'The first row must have “name”, “sku” and “price” columns (and optionally “stock” and “category”).'
    const seen = new Set<string>()
    return lines.slice(1).map((l, i) => {
      const c = splitCsv(l)
      const r: Parsed = { row: i + 2, name: c[iN] ?? '', sku: c[iS] ?? '', price: c[iP] ?? '', stock: iT >= 0 ? c[iT] ?? '0' : '0', category: iC >= 0 ? c[iC] ?? '' : categories[0] ?? '' }
      const price = Number(r.price.replace(/[^\d.]/g, ''))
      const stock = Number(r.stock || 0)
      const cat = categories.find((x) => x.toLowerCase() === r.category.toLowerCase())
      if (!r.name) r.error = 'Missing name'
      else if (!r.sku) r.error = 'Missing SKU'
      else if (!Number.isInteger(price) || price <= 0) r.error = 'Invalid price'
      else if (!Number.isInteger(stock) || stock < 0) r.error = 'Invalid stock'
      else if (!cat) r.error = 'Unknown category'
      else if (seen.has(r.sku.toLowerCase())) r.error = 'Duplicate SKU in file'
      else { seen.add(r.sku.toLowerCase()); r.ok = { name: r.name, sku: r.sku, price, stock, category: cat } }
      return r
    })
  })()
  const rows = Array.isArray(parsed) ? parsed : []
  const valid = rows.filter((r) => r.ok)
  const bad = rows.length - valid.length
  const existing = valid.filter((r) => products.some((p) => p.sku.toLowerCase() === r.sku.toLowerCase())).length

  const load = async (f: File | undefined) => { if (!f) return; setFileName(f.name); setText(await f.text()); setDone(null) }
  const template = () => downloadCsv('products-template.csv', ['name', 'sku', 'price', 'stock', 'category'], [['Example tote', 'SC-EX-001', 3200, 12, categories[0] ?? 'Bags']])
  const exportAll = () => { downloadCsv('products.csv', ['name', 'sku', 'price', 'stock', 'category', 'status', 'brand', 'cost'], products.map((p) => [p.name, p.sku, p.price, p.stock, p.category, p.status, inv.brands.find((b) => b.id === inv.meta(p).brandId)?.name ?? '', inv.meta(p).cost])); toast('Products exported') }
  const run = () => openModal({ title: `Import ${valid.length} valid row${valid.length === 1 ? '' : 's'}?`, message: `${valid.length - existing} new products are created as drafts, and ${existing} existing products (matched by SKU) get their name, price and stock updated. ${bad ? `${bad} invalid row${bad === 1 ? '' : 's'} will be skipped.` : ''}`, confirm: 'Import', onConfirm: () => { setDone(inv.importRows(valid.map((r) => r.ok!))); toast('Import complete') } })
  const cols: Column<Parsed>[] = [
    { key: 'r', header: 'Row', render: (r) => r.row },
    { key: 'n', header: 'Product name', render: (r) => r.name || '—' },
    { key: 's', header: 'SKU', render: (r) => r.sku || '—' },
    { key: 'p', header: 'Price', render: (r) => r.price },
    { key: 'st', header: 'Stock', render: (r) => r.stock },
    { key: 'c', header: 'Category', render: (r) => r.category },
    { key: 'v', header: 'Validation', render: (r) => <Badge tone={r.error ? 'red' : 'green'}>{r.error ?? 'Valid'}</Badge> },
  ]
  return (
    <>
      <PageHead title="Bulk import and export" desc="Upload a CSV to add or update products, or download your catalogue." actions={<><Btn onClick={template}>Download template</Btn><Btn onClick={exportAll} disabled={!can('Products', 'Export')}>Export products</Btn></>} />
      <Steps steps={[{ label: 'Add a file', done: !!text }, { label: 'Check rows', done: rows.length > 0 && bad === 0 }, { label: 'Import', done: !!done }]} />
      <div className="sp-stack">
        <Panel title="Import products" sub="CSV with name, sku, price, and optionally stock and category" right={<Badge tone={done ? 'green' : text ? 'blue' : 'gray'}>{done ? 'Imported' : text ? 'Ready to check' : 'No file yet'}</Badge>}>
          <div className="sp-row" style={{ marginBottom: 8 }}>
            <label className="btn small" style={{ cursor: 'pointer' }}>Choose a CSV file<input type="file" accept=".csv,text/csv" hidden aria-label="CSV file" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = '' }} /></label>
            {fileName && <span className="panel-sub">{fileName}</span>}
          </div>
          <Field label="Or paste CSV rows here" multiline value={text} onChange={(v) => { setText(v); setDone(null) }} placeholder={'name,sku,price,stock,category\nCanvas tote,SC-BAG-201,3200,25,Bags'} />
          {typeof parsed === 'string' && parsed && <div className="sp-err" role="alert">{parsed}</div>}
        </Panel>
        {rows.length > 0 && (
          <>
            <Stats><Stat label="Rows read" value={String(rows.length)} trend="In the file" icon="▤" /><Stat label="Valid" value={String(valid.length)} trend={`${existing} update existing SKUs`} icon="✓" /><Stat label="Errors" value={String(bad)} trend={bad ? 'These rows are skipped' : 'Nothing to fix'} icon="!" up={bad === 0} /></Stats>
            <DataTable title="Validation preview" rows={rows} rowKey={(r) => String(r.row)} columns={cols} searchLabel="Search rows" searchText={(r) => `${r.name} ${r.sku}`} pageSize={8} />
            <div className="sp-row end">
              <Btn onClick={() => { setText(''); setFileName(''); setDone(null) }}>Clear</Btn>
              <Btn variant="primary" disabled={!edit || !valid.length || !!done} onClick={run}>Import valid rows</Btn>
            </div>
          </>
        )}
        {done && <Notice tone="success" mark="✓">{done.created} new products added as drafts and {done.updated} updated. <button className="link-btn" onClick={() => navigate('/products')}>View products</button></Notice>}
        {!edit && <Notice>Your role can export products but not import them.</Notice>}
      </div>
    </>
  )
}

