import { useState } from 'react'

import { AvatarTile, Badge, Btn, DataTable, downloadCsv, Field, Notice, PageHead, Panel, SettingRow, Stat, Tabs, type Column } from '../components/ui'
import type { Product, ProductStatus } from '../data/commerce'
import { kes, shortDate } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'

const stockBadge = (p: Product) => (p.stock === 0 ? <Badge tone="red">Out of stock</Badge> : p.stock <= p.reorderAt ? <Badge tone="amber">{`Low · ${p.stock}`}</Badge> : <Badge tone="green">{`${p.stock} in stock`}</Badge>)
const statusTone = (s: ProductStatus) => (s === 'Active' ? 'green' : s === 'Draft' ? 'blue' : 'gray')

export function ProductsList() {
  const { products, setProducts, categories, can, openModal, toast, log, orders } = useStore()
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
    { key: 'category', header: 'Category', sort: (a, b) => a.category.localeCompare(b.category), render: (p) => p.category },
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
  const existing = id ? products.find((p) => p.id === id) : undefined
  const [f, setF] = useState(() => ({
    name: existing?.name ?? '', sku: existing?.sku ?? '', category: existing?.category ?? categories[0]!, price: String(existing?.price ?? ''), stock: String(existing?.stock ?? '0'),
    reorderAt: String(existing?.reorderAt ?? 10), status: (existing?.status ?? 'Draft') as ProductStatus, description: existing?.description ?? '',
  }))
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
    const stock = Number(f.stock)
    if (!Number.isInteger(stock) || stock < 0) e.stock = 'Stock must be 0 or more'
    const reorder = Number(f.reorderAt)
    if (!Number.isInteger(reorder) || reorder < 0) e.reorderAt = 'Enter 0 or more'
    const sku = f.sku.trim() || `SC-${f.category.slice(0, 3).toUpperCase()}-${100 + products.length + 1}`
    if (products.some((p) => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== id)) e.sku = 'Another product already uses this SKU'
    if (f.status === 'Active' && f.description.trim().length < 10) e.description = 'Add a short description before publishing'
    setErrors(e)
    if (Object.keys(e).length) return
    const data = { name: f.name.trim(), sku, category: f.category as Product['category'], price, stock, reorderAt: reorder, status: f.status, description: f.description.trim() }
    if (existing) {
      setProducts(products.map((p) => (p.id === existing.id ? { ...p, ...data } : p)))
      log(`Updated product · ${data.name}`, 'Products')
      toast('Product saved')
    } else {
      setProducts([{ id: `p${Date.now()}`, createdAt: Date.now(), ...data }, ...products])
      log(`Added product · ${data.name}`, 'Products')
      toast('Product added')
    }
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
              <Btn disabled={!can('Products', 'Create')} onClick={() => { setProducts([{ ...existing, id: `p${Date.now()}`, name: `${existing.name} (copy)`, sku: `${existing.sku}-C`, status: 'Draft', createdAt: Date.now() }, ...products]); toast('Duplicated as a draft'); navigate('/products') }}>Duplicate</Btn>
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
            <Field label="Stock on hand" value={f.stock} onChange={set('stock')} error={errors.stock} />
            <Field label="Reorder level" value={f.reorderAt} onChange={set('reorderAt')} error={errors.reorderAt} hint="You’ll be warned when stock falls to this number." />
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

// ---- categories and stock -------------------------------------------------------------------------------------

function RestockForm({ product }: { product: Product }) {
  const { products, setProducts, closeModal, toast, log } = useStore()
  const [qty, setQty] = useState('20')
  const [error, setError] = useState('')
  return (
    <>
      <Field label={`Units received for ${product.name}`} value={qty} onChange={(v) => { setQty(v); setError('') }} error={error} hint={`Currently ${product.stock} in stock.`} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={() => {
          const n = Number(qty)
          if (!Number.isInteger(n) || n <= 0) return setError('Enter a whole number above 0')
          setProducts(products.map((p) => (p.id === product.id ? { ...p, stock: p.stock + n } : p)))
          log(`Restocked ${product.name} (+${n})`, 'Products')
          closeModal()
          toast(`${product.name} restocked`)
        }}>Add stock</Btn>
      </div>
    </>
  )
}

function CategoryForm({ current }: { current?: string }) {
  const { categories, setCategories, products, setProducts, closeModal, toast, log } = useStore()
  const [name, setName] = useState(current ?? '')
  const [error, setError] = useState('')
  const submit = () => {
    const n = name.trim()
    if (n.length < 2) return setError('Name the category')
    if (categories.some((c) => c.toLowerCase() === n.toLowerCase() && c !== current)) return setError('That category already exists')
    if (current) {
      setCategories(categories.map((c) => (c === current ? n : c)))
      setProducts(products.map((p) => (p.category === current ? { ...p, category: n as Product['category'] } : p)))
      log(`Renamed category · ${current} → ${n}`, 'Products')
    } else {
      setCategories([...categories, n])
      log(`Added category · ${n}`, 'Products')
    }
    closeModal()
    toast(current ? 'Category renamed' : 'Category added')
  }
  return (
    <>
      <Field label="Category name" value={name} onChange={(v) => { setName(v); setError('') }} error={error} />
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" onClick={submit}>{current ? 'Rename' : 'Add category'}</Btn>
      </div>
    </>
  )
}

export function Inventory() {
  const { products, categories, setCategories, can, openModal, toast, log } = useStore()
  const [tab, setTab] = useState<'Low stock' | 'Categories'>('Low stock')
  const low = products.filter((p) => p.status !== 'Archived' && p.stock <= p.reorderAt).sort((a, b) => a.stock - b.stock)

  return (
    <>
      <PageHead
        title="Categories and stock"
        desc="Keep shelves full and the catalogue organised."
        actions={<Btn variant="primary" disabled={!can('Products', 'Create')} onClick={() => openModal({ title: 'Add category', body: <CategoryForm />, noActions: true })}>Add category</Btn>}
      />
      <section className="card" style={{ marginBottom: 14 }}>
        <Tabs tabs={['Low stock', 'Categories'] as const} value={tab} onChange={setTab} />
      </section>
      {tab === 'Low stock' ? (
        <section className="card table-card">
          <div className="table-head"><h2>Needs restocking</h2><span className="panel-sub">{low.length} products at or below their reorder level</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Reorder level</th><th /></tr></thead>
              <tbody>
                {low.map((p) => (
                  <tr key={p.id}>
                    <td><button className="link-btn" onClick={() => navigate(`/products/${p.id}`)}>{p.name}</button><div className="subtext">{p.sku}</div></td>
                    <td>{p.category}</td><td>{stockBadge(p)}</td><td>{p.reorderAt}</td>
                    <td><Btn small disabled={!can('Products', 'Edit')} onClick={() => openModal({ title: 'Receive stock', body: <RestockForm product={p} />, noActions: true })}>Restock</Btn></td>
                  </tr>
                ))}
                {low.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>Everything is well stocked.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card table-card">
          <div className="table-head"><h2>Categories</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Category</th><th>Products</th><th>Active</th><th /></tr></thead>
              <tbody>
                {categories.map((c) => {
                  const inCat = products.filter((p) => p.category === c)
                  return (
                    <tr key={c}>
                      <td><b>{c}</b></td><td>{inCat.length}</td><td>{inCat.filter((p) => p.status === 'Active').length}</td>
                      <td>
                        <div className="actions">
                          <Btn small disabled={!can('Products', 'Edit')} onClick={() => openModal({ title: 'Rename category', body: <CategoryForm current={c} />, noActions: true })}>Rename</Btn>
                          <Btn small variant="danger" disabled={!can('Products', 'Delete')} onClick={() => inCat.length ? toast('Move or delete this category’s products first') : openModal({ title: `Delete ${c}?`, message: 'The category is empty, so nothing else changes.', confirm: 'Delete', danger: true, onConfirm: () => { setCategories(categories.filter((x) => x !== c)); log(`Deleted category · ${c}`, 'Products', 'Security'); toast('Category deleted') } })}>Delete</Btn>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
