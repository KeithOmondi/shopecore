import { useEffect, useState } from 'react'

import { get } from '../lib/api'
import { kes } from '../lib/format'
import type { ApiProduct, Category } from '../pages/Products'

/**
 * Pick products from a list instead of typing exact names: search, narrow by category, tick the ones you want.
 * Reports the chosen ids and the names it has seen (so the caller can show them).
 */
export function ProductPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[], names: Record<string, string>) => void }) {
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [rows, setRows] = useState<ApiProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => { get<{ items: Category[] }>('/v1/admin/categories').then((r) => setCategories(r.items), () => undefined) }, [])
  useEffect(() => {
    let live = true
    setLoading(true)
    const t = setTimeout(() => {
      const params = new URLSearchParams({ limit: '100', status: 'active' })
      if (q.trim()) params.set('q', q.trim())
      if (categoryId) params.set('categoryId', categoryId)
      void get<{ items: ApiProduct[] }>(`/v1/admin/products?${params}`).then(
        (r) => { if (!live) return; setNames((n) => ({ ...n, ...Object.fromEntries(r.items.map((p) => [p.id, p.name])) })); setRows(r.items); setFailed(false); setLoading(false) },
        () => { if (live) { setFailed(true); setLoading(false) } },
      )
    }, q ? 250 : 0)
    return () => { live = false; clearTimeout(t) }
  }, [q, categoryId])

  const chosen = new Set(ids)
  const change = (next: string[]) => onChange(next, names)
  const toggle = (id: string) => change(chosen.has(id) ? ids.filter((x) => x !== id) : [...ids, id])
  const addAll = () => change([...ids, ...rows.map((p) => p.id).filter((id) => !chosen.has(id))])
  const detail = (p: ApiProduct) => [p.sku, ...Object.values(p.options ?? {})].filter(Boolean).join(' · ')

  return (
    <div style={{ marginBottom: 10 }}>
      <div className="field"><label>Products ({ids.length} chosen)</label></div>
      <div className="sp-row" style={{ marginBottom: 6 }}>
        <input className="select" style={{ flex: 1, minWidth: 160, padding: '8px 10px' }} type="search" aria-label="Search products" placeholder="Search by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div role="listbox" aria-multiselectable="true" aria-label="Products" style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
        {loading && <p style={{ padding: 12, margin: 0, opacity: 0.7 }}>Loading products…</p>}
        {!loading && failed && <p style={{ padding: 12, margin: 0 }}>Couldn’t load products. Try again.</p>}
        {!loading && !failed && !rows.length && <p style={{ padding: 12, margin: 0, opacity: 0.7 }}>No active products match.</p>}
        {!loading && rows.map((p) => (
          <label key={p.id} role="option" aria-selected={chosen.has(p.id)} className="sp-row" style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--line)', flexWrap: 'nowrap' }}>
            <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
            {p.coverImage ? <img src={`/v1/files/${p.coverImage}`} alt="" width={32} height={32} style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--line)', flexShrink: 0 }} />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{ display: 'block', fontSize: 11, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail(p)}</span>
            </span>
            <span style={{ textAlign: 'right', flexShrink: 0, fontSize: 12 }}>{kes(p.priceCents / 100)}<br /><span style={{ opacity: 0.7 }}>{p.available} in stock</span></span>
          </label>
        ))}
      </div>
      <div className="sp-row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{rows.length >= 100 ? 'Showing the first 100. Search to narrow down.' : `${rows.length} shown`}</span>
        <span className="sp-row">
          {rows.length > 0 && <button type="button" className="link-btn" onClick={addAll}>Add all shown</button>}
          {ids.length > 0 && <button type="button" className="link-btn" onClick={() => change([])}>Clear</button>}
        </span>
      </div>
      {ids.length > 0 && (
        <div className="sp-row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
          {ids.map((id) => <span key={id} className="pill">{names[id] ?? 'Product'} <button type="button" className="link-btn" aria-label={`Remove ${names[id] ?? 'product'}`} onClick={() => toggle(id)}>×</button></span>)}
        </div>
      )}
    </div>
  )
}
