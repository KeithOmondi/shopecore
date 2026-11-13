import { useState } from 'react'

import { useInventory } from '../lib/inventory'
import { useDirty, useUnsavedGuard } from '../lib/unsaved'
import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, type Column } from '../components/ui'
import type { Product, ProductStatus } from '../data/commerce'
import { kes, shortDate } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

const stockBadge = (p: Product) => (p.stock === 0 ? <Badge tone="red">Out of stock</Badge> : p.stock <= p.reorderAt ? <Badge tone="amber">{`Low · ${p.stock}`}</Badge> : <Badge tone="green">{`${p.stock} in stock`}</Badge>)
const statusTone = (s: ProductStatus) => (s === 'Active' ? 'green' : s === 'Draft' ? 'blue' : 'gray')

export function ProductsList() {
  const { products, setProducts, categories, can, openModal, toast, log, orders } = useStore()
  const inv = useInventory()
  const [category, setCategory] = useState('All categories')
  const [status, setStatus] = useState('All statuses')

  const rows = products.filter((p) => (category === 'All categories' || p.category === category) && (status === 'All statuses' || p.status === status))
  const low = products.filter((p) => p.status === 'Active' && p.stock <= p.reorderAt).length
  const value = products.filter((p) => p.status === 'Active').reduce((n, p) => n + p.price * p.stock, 0)
  const sold = (id: string) => orders.filter((o) => o.status !== 'Cancelled' && o.status !== 'Refunded').reduce((n, o) => n + (o.items.find((i) => i.productId === id)?.qty ?? 0), 0)

  const columns: Column<Product>[] = [
    {
      key: 'name', header: 'Product', sort: (a, b) => a.name.localeCompare(b.name),
      render: (p) => (
        <div className="product-cell" style={{ minWidth: 180 }}>
          <AvatarTile text={p.name[0]!} />
          <div>
            <button className="link-btn" onClick={() => navigate(`/products/${p.id}`)}>{p.name}</button>
            <div className="subtext">{p.sku}</div>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sort: (a, b) => a.category.localeCompare(b.category), render: (p) => <>{p.category}{inv.meta(p).subcategory && <span className="subtext">{inv.meta(p).subcategory}</span>}</> },
    { key: 'brand', header: 'Brand', render: (p) => inv.brands.find((b) => b.id === inv.meta(p).brandId)?.name ?? '—' },
    { key: 'price', header: 'Price', sort: (a, b) => a.price - b.price, render: (p) => <b>{kes(p.price)}</b> },
    { key: 'stock', header: 'Stock', sort: (a, b) => a.stock - b.stock, render: stockBadge },
    { key: 'sold', header: 'Sold (30d)', sort: (a, b) => sold(a.id) - sold(b.id), render: (p) => sold(p.id) },
    { key: 'status', header: 'Status', sort: (a, b) => a.status.localeCompare(b.status), render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
  ]

  return (
    <>
      <PageHead
        title="Products"
        desc="Manage your catalogue, prices and availability."
        actions={
          <>
            <Btn onClick={() => navigate('/inventory/import')}>Import / export</Btn>
            <Btn disabled={!can('Products', 'Export')} onClick={() => { downloadCsv('products.csv', ['SKU', 'Name', 'Category', 'Price (KES)', 'Stock', 'Status'], rows.map((p) => [p.sku, p.name, p.category, p.price, p.stock, p.status])); toast('Products exported') }}>Export</Btn>
            <Btn variant="primary" disabled={!can('Products', 'Create')} onClick={() => navigate('/products/new')}>Add product</Btn>
          </>
        }
      />
      <div className="tile-row">
        <Stat label="Products" value={String(products.length)} trend={`${products.filter((p) => p.status === 'Active').length} active`} icon="◈" />
        <Stat label="Low or out of stock" value={String(low)} trend="Needs restocking" icon="▤" up={low === 0} />
        <Stat label="Categories" value={String(categories.length)} trend="In your catalogue" icon="▦" />
        <Stat label="Stock value" value={kes(value)} trend="At selling price" icon="↗" />
      </div>
      <DataTable
        title="All products"
        rows={rows}
        rowKey={(p) => p.id}
        columns={columns}
        searchLabel="Search products"
        emptyTitle="No products yet"
        empty="Add your first product, or import a CSV to bring in many at once."
        emptyAction={can('Products', 'Create') ? { label: 'Add a product', onClick: () => navigate('/products/new') } : undefined}
        searchText={(p) => `${p.name} ${p.sku} ${p.category}`}
        tools={
          <>
            <select className="select" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
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
                  message: 'Archived products are hidden from the storefront. You can restore them later.',
                  confirm: 'Archive',
                  onConfirm: () => {
                    setProducts(products.map((p) => (ids.includes(p.id) ? { ...p, status: 'Archived' } : p)))
                    log(`Archived ${ids.length} products`, 'Products')
                    toast(`${ids.length} archived`)
                  },
                })
              : toast('Your role can’t edit products'),
        }}
        actions={(p) => <Btn small onClick={() => navigate(`/products/${p.id}`)}>Edit</Btn>}
      />
    </>
  )
}

export function ProductForm({ id }: { id?: string }) {
  const { products, setProducts, categories, can, openModal, toast, log } = useStore()
  const inv = useInventory()
  const existing = id ? products.find((p) => p.id === id) : undefined
  const m0 = existing ? inv.meta(existing) : undefined
  const [f, setF] = useState(() => ({
    name: existing?.name ?? '', sku: existing?.sku ?? '', category: existing?.category ?? categories[0]!, price: String(existing?.price ?? ''), stock: String(existing?.stock ?? '0'),
    reorderAt: String(existing?.reorderAt ?? 10), status: (existing?.status ?? 'Draft') as ProductStatus, description: existing?.description ?? '',
  }))
  const [x, setX] = useState(() => ({ brandId: m0?.brandId ?? '', supplierId: m0?.supplierId ?? '', cost: String(m0?.cost ?? ''), barcode: m0?.barcode ?? '', tax: m0?.tax ?? 'Standard VAT', track: m0?.track ?? true, subcategory: m0?.subcategory ?? '', seoTitle: m0?.seoTitle ?? '', seoDesc: m0?.seoDesc ?? '' }))
  const setx = <K extends keyof typeof x>(k: K) => (v: (typeof x)[K]) => setX((s) => ({ ...s, [k]: v }))
  const unsaved = useUnsavedGuard(useDirty({ f, x }))
  const [image, setImage] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  if (id && !existing) {
    return (
      <>
        <PageHead title="Products" desc="That product doesn’t exist." actions={<Btn onClick={() => navigate('/products')}>Back to products</Btn>} />
        <Notice tone="warning" mark="!">We couldn’t find this product.</Notice>
      </>
    )
  }
  const allowed = existing ? can('Products', 'Edit') : can('Products', 'Create')

  const save = () => {
    const e: Record<string, string> = {}
    if (f.name.trim().length < 2) e.name = 'Name the product'
    const price = Number(f.price)
    if (!Number.isInteger(price) || price <= 0) e.price = 'Enter the price in whole shillings'
    const stock = existing ? existing.stock : Number(f.stock)
    if (!Number.isInteger(stock) || stock < 0) e.stock = 'Stock must be 0 or more'
    const cost = Number(x.cost)
    if (x.cost !== '' && (!Number.isInteger(cost) || cost <= 0)) e.cost = 'Enter the cost in whole shillings'
    if (x.barcode && !/^\d{13}$/.test(x.barcode.trim())) e.barcode = 'A barcode has 13 digits'
    if (x.barcode && products.some((p) => p.id !== id && inv.meta(p).barcode === x.barcode.trim())) e.barcode = 'Another product uses this barcode'
    if (cost > price) e.cost = 'The cost is more than the selling price'
    const reorder = Number(f.reorderAt)
    if (!Number.isInteger(reorder) || reorder < 0) e.reorderAt = 'Enter 0 or more'
    const sku = f.sku.trim() || `SC-${f.category.slice(0, 3).toUpperCase()}-${100 + products.length + 1}`
    if (products.some((p) => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== id)) e.sku = 'Another product already uses this SKU'
    if (f.status === 'Active' && f.description.trim().length < 10) e.description = 'Add a short description before publishing'
    setErrors(e)
    if (Object.keys(e).length) return
    const data = { name: f.name.trim(), sku, category: f.category as Product['category'], price, stock, reorderAt: reorder, status: f.status, description: f.description.trim() }
    const metaPatch = { brandId: x.brandId, supplierId: x.supplierId, cost: cost || Math.round((price * 0.58) / 10) * 10, barcode: x.barcode.trim() || (m0?.barcode ?? ''), tax: x.tax, track: x.track, subcategory: x.subcategory, seoTitle: x.seoTitle.trim(), seoDesc: x.seoDesc.trim() }
    if (existing) {
      setProducts(products.map((p) => (p.id === existing.id ? { ...p, ...data } : p)))
      inv.setMeta(existing.id, metaPatch)
      log(`Updated product · ${data.name}`, 'Products')
      toast('Product saved')
    } else {
      const newId = `p${Date.now()}`
      setProducts([{ id: newId, createdAt: Date.now(), ...data }, ...products])
      inv.setMeta(newId, { ...metaPatch, handle: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') })
      inv.recordOpening(newId, stock)
      log(`Added product · ${data.name}`, 'Products')
      toast('Product added')
    }
    unsaved()
    navigate('/products')
  }

  const remove = () =>
    openModal({
      title: `Delete ${existing!.name}?`,
      message: 'This can’t be undone. Past orders keep their line items. Archive the product instead if you may sell it again.',
      confirm: 'Delete product',
      danger: true,
      onConfirm: () => {
        setProducts(products.filter((p) => p.id !== existing!.id))
        log(`Deleted product · ${existing!.name}`, 'Products', 'Security')
        toast('Product deleted')
        unsaved()
        navigate('/products')
      },
    })

  return (
    <>
      <PageHead
        title={existing ? 'Edit product' : 'Add product'}
        desc={existing ? `Added ${shortDate(existing.createdAt)}` : 'Create a new product for the storefront.'}
        actions={
          <>
            <Btn onClick={() => navigate('/products')}>Back to products</Btn>
            {existing && (
              <Btn disabled={!can('Products', 'Create')} onClick={() => { setProducts([{ ...existing, id: `p${Date.now()}`, name: `${existing.name} (copy)`, sku: `${existing.sku}-C`, status: 'Draft', createdAt: Date.now() }, ...products]); toast('Duplicated as a draft'); unsaved(); navigate('/products') }}>Duplicate</Btn>
            )}
            {existing && <Btn variant="danger" disabled={!can('Products', 'Delete')} onClick={remove}>Delete</Btn>}
          </>
        }
      />
      {!allowed && <div style={{ marginBottom: 14 }}><Notice tone="warning" mark="!">Your role can view this product but not change it.</Notice></div>}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(260px,.8fr)', alignItems: 'start' }}>
        <section className="card form-card">
          <h2>Product details</h2>
          <Field label="Product name" value={f.name} onChange={set('name')} error={errors.name} placeholder="e.g. Canvas Weekender Bag" />
          <div className="form-grid">
            <Field label="SKU" value={f.sku} onChange={set('sku')} error={errors.sku} placeholder="Auto-generated if empty" />
            <Field label="Category" value={f.category} onChange={set('category')} options={categories} />
            <Field label="Price (KES)" value={f.price} onChange={set('price')} error={errors.price} />
            <Field label="Status" value={f.status} onChange={set('status')} options={['Draft', 'Active', 'Archived']} />
            <Field label="Stock on hand" value={existing ? String(existing.stock) : f.stock} onChange={set('stock')} error={errors.stock} hint={existing ? 'Change stock from Stock adjustment so it is recorded.' : 'Opening stock goes to your main location.'} />
            <Field label="Reorder level" value={f.reorderAt} onChange={set('reorderAt')} error={errors.reorderAt} hint="You’ll be warned when stock falls to this number." />
          </div>
          <h3 style={{ fontSize: 12, margin: '6px 0 8px' }}>Inventory details</h3>
          <div className="form-grid">
            <Field label="Brand" value={x.brandId} onChange={setx('brandId')} options={[{ value: '', label: 'No brand' }, ...inv.brands.map((b) => ({ value: b.id, label: b.name }))]} />
            <Field label="Subcategory" value={x.subcategory} onChange={setx('subcategory')} options={[{ value: '', label: 'None' }, ...(inv.tree[f.category]?.subs ?? []).map((sub) => ({ value: sub, label: sub }))]} />
            <Field label="Supplier" value={x.supplierId} onChange={setx('supplierId')} options={[{ value: '', label: 'No supplier' }, ...inv.suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
            <Field label="Cost per unit (KES)" value={x.cost} onChange={setx('cost')} error={errors.cost} hint="What you pay. Used for stock value and profit." />
            <Field label="Barcode (EAN-13)" value={x.barcode} onChange={setx('barcode')} error={errors.barcode} placeholder="Generated if empty" />
            <Field label="Tax category" value={x.tax} onChange={(v) => setx('tax')(v as 'Standard VAT' | 'Zero-rated')} options={['Standard VAT', 'Zero-rated']} />
            <Field label="Inventory tracking" value={x.track ? 'Track quantity' : 'Do not track'} onChange={(v) => setx('track')(v === 'Track quantity')} options={['Track quantity', 'Do not track']} />
          </div>
          <Field label="Description" multiline value={f.description} onChange={set('description')} error={errors.description} />
          <div className="field">
            <label>Photo</label>
            <label className="drop" style={{ cursor: 'pointer' }}>
              {image ? <img src={image} alt="Product preview" style={{ maxHeight: 120, borderRadius: 6 }} /> : 'Click to choose an image (JPG or PNG, up to 5 MB)'}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (file.size > 5 * 1024 * 1024) return toast('That image is over 5 MB')
                setImage(URL.createObjectURL(file))
              }} />
            </label>
          </div>
          <div className="form-actions">
            <Btn onClick={() => navigate('/products')}>Cancel</Btn>
            <Btn variant="primary" disabled={!allowed} onClick={save}>{existing ? 'Save product' : 'Add product'}</Btn>
          </div>
        </section>
        <Panel title="Summary" sub="How it will appear">
          <SettingRow title="Status" right={<Badge tone={statusTone(f.status)}>{f.status}</Badge>} />
          <SettingRow title="Price" right={<b>{Number(f.price) > 0 ? kes(Number(f.price)) : '—'}</b>} />
          <SettingRow title="Stock" right={<span className="prod-name">{f.stock || 0}</span>} />
          <SettingRow title="Category" right={<span className="prod-name">{f.category}</span>} />
        </Panel>
      </div>
    </>
  )
}
