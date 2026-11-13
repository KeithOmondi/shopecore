import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import type { Product } from '../data/commerce'
import {
  ALERT_DEFAULTS, countFinal, countState, defaultMeta, poTotal, reconcile, seedBrands, seedLocations, seedMovements, seedPOs, seedSuppliers, seedTree, seedWarehouseReturns, slug, splitStock,
  type AlertRules, type Brand, type CategoryNode, type CountLine, type CycleCount, type Decision, type Disposition, type Levels, type Location, type Move, type Movement, type PackState, type POLine, type ProductMeta,
  type PurchaseOrder, type Supplier, type WarehouseReturn,
} from '../data/inventory'
import { PO_APPROVAL_LIMIT } from '../data/inventory'
import { kes } from './format'
import { useStore } from './store'
import { useSupport } from './support'

export interface StockAlert { product: Product; location: Location; available: number; reorderAt: number; suggested: number }
export interface ImportRow { name: string; sku: string; price: number; stock: number; category: string }

interface Inventory {
  locations: Location[]
  saveLocation: (l: Omit<Location, 'id'> & { id?: string }) => string
  /** Where new stock is received and orders are picked from first. */
  primary: Location | undefined
  levels: Levels
  reserved: (productId: string) => number
  available: (productId: string, locationId: string) => number
  onHandAt: (locationId: string) => number
  meta: (p: Product) => ProductMeta
  setMeta: (productId: string, patch: Partial<ProductMeta>) => void
  reorderAt: (productId: string, locationId: string) => number
  setReorder: (productId: string, locationId: string, n: number) => void
  alerts: StockAlert[]
  alertRules: AlertRules
  setAlertRules: (r: AlertRules) => void
  stockValue: number
  movements: Movement[]
  /** Moves stock and records it. Returns an error message if the move isn’t possible. */
  applyMoves: (moves: Move[]) => string | null
  /** Spreads a quantity over locations, main one first. */
  plan: (productId: string, qty: number, ref: string, type?: Move['type']) => Move[] | string
  recordOpening: (productId: string, qty: number) => void
  importRows: (rows: ImportRow[]) => { created: number; updated: number }
  suppliers: Supplier[]
  saveSupplier: (s: Omit<Supplier, 'id'> & { id?: string }) => string
  brands: Brand[]
  saveBrand: (b: Omit<Brand, 'id' | 'updatedAt'> & { id?: string }) => string
  deleteBrand: (id: string) => string | null
  tree: Record<string, CategoryNode>
  addCategory: (name: string) => string | null
  renameCategory: (from: string, to: string) => string | null
  deleteCategory: (name: string) => string | null
  moveCategory: (name: string, dir: -1 | 1) => void
  patchCategory: (name: string, patch: Partial<CategoryNode>) => void
  addSub: (cat: string, sub: string) => string | null
  removeSub: (cat: string, sub: string) => string | null
  pos: PurchaseOrder[]
  savePO: (p: Omit<PurchaseOrder, 'id' | 'status' | 'createdBy' | 'createdAt' | 'approvedBy' | 'receivedAt'> & { id?: string }, submit: boolean) => { id?: string; error?: string }
  poAction: (id: string, action: 'approve' | 'send' | 'cancel') => string | null
  receivePO: (id: string, rows: { productId: string; good: number; damaged: number }[], ref: string) => string | null
  pack: Record<string, PackState>
  pickItem: (orderId: string, productId: string, on: boolean) => void
  packOrder: (orderId: string) => string | null
  returnsQueue: WarehouseReturn[]
  decisions: Record<string, Decision>
  decideReturn: (r: WarehouseReturn, d: Omit<Decision, 'by' | 'at'>) => string | null
  counts: CycleCount[]
  startCount: (locationId: string, zone: string) => string | null
  setCount: (countId: string, productId: string, which: 'c1' | 'c2', value: number | undefined) => void
  submitCount: (countId: string) => string | null
  approveCount: (countId: string) => string | null
}

const Ctx = createContext<Inventory | null>(null)

export function InventoryProvider({ children }: { children: ReactNode }) {
  const { products, setProducts, orders, setOrders, categories, setCategories, staff, user, role, business, log } = useStore()
  const { returns, createRefund } = useSupport()
  const me = user?.name ?? 'Inventory'
  const [now] = useState(() => Date.now())
  const [locations, setLocations] = useState(seedLocations)
  const [base, setBase] = useState<Levels>(() => Object.fromEntries(products.map((p) => [p.id, splitStock(p.stock, seedLocations().map((l) => l.id))])))
  const [metaMap, setMetaMap] = useState<Record<string, Partial<ProductMeta>>>({})
  const [reorderMap, setReorderMap] = useState<Record<string, number>>({})
  const [alertRules, setAlertRules] = useState(ALERT_DEFAULTS)
  const [suppliers, setSuppliers] = useState(seedSuppliers)
  const [brands, setBrands] = useState(() => seedBrands(Date.now()))
  const [tree, setTree] = useState(() => seedTree(categories))
  const [pos, setPos] = useState(() => seedPOs(Date.now(), products, staff.filter((s) => ['Inventory manager', 'Warehouse lead', 'Purchasing agent'].includes(s.role)).map((s) => s.name)))
  const [pack, setPack] = useState<Record<string, PackState>>({})
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [warehouseReturns] = useState(() => seedWarehouseReturns(Date.now(), orders))
  const [movements, setMovements] = useState<Movement[]>(() => {
    const lv: Levels = Object.fromEntries(products.map((p) => [p.id, splitStock(p.stock, seedLocations().map((l) => l.id))]))
    return seedMovements(Date.now(), products, lv, staff.filter((s) => ['Inventory manager', 'Warehouse lead', 'Purchasing agent'].includes(s.role)).map((s) => s.name))
  })
  const [counts, setCounts] = useState<CycleCount[]>(() => {
    const lv: Levels = Object.fromEntries(products.map((p) => [p.id, splitStock(p.stock, seedLocations().map((l) => l.id))]))
    const lines: CountLine[] = products.filter((p) => p.status === 'Active').map((p) => ({ productId: p.id, expected: lv[p.id]?.l1 ?? 0 }))
    lines.forEach((l, i) => { if (i < 7) { l.c1 = l.expected - (i === 1 || i === 3 ? 1 : 0); if (i === 1 || i === 3) l.c2 = undefined } })
    return [{ id: 'CC-0248', locationId: 'l1', zone: 'Aisle 3', owner: 'Sarah Wekesa', startedAt: Date.now() - 3 * 3_600_000, status: 'Counting', lines }]
  })

  const order = useMemo(() => locations.filter((l) => l.active).map((l) => l.id), [locations])
  const primary = locations.find((l) => l.active)
  const levels = useMemo<Levels>(() => Object.fromEntries(products.map((p) => [p.id, reconcile(base[p.id] ?? splitStock(p.stock, order), p.stock, order)])), [products, base, order])

  const reservedMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const o of orders) if (o.status === 'Pending') for (const i of o.items) m[i.productId] = (m[i.productId] ?? 0) + i.qty
    return m
  }, [orders])
  const reserved = useCallback((pid: string) => reservedMap[pid] ?? 0, [reservedMap])
  const available = useCallback((pid: string, loc: string) => Math.max(0, (levels[pid]?.[loc] ?? 0) - (loc === primary?.id ? reserved(pid) : 0)), [levels, primary, reserved])
  const onHandAt = useCallback((loc: string) => products.reduce((n, p) => n + (levels[p.id]?.[loc] ?? 0), 0), [products, levels])

  const meta = useCallback((p: Product): ProductMeta => ({ ...defaultMeta(p, products.findIndex((x) => x.id === p.id)), ...metaMap[p.id] }), [products, metaMap])
  const setMeta = useCallback((pid: string, patch: Partial<ProductMeta>) => setMetaMap((m) => ({ ...m, [pid]: { ...m[pid], ...patch } })), [])

  const share = (loc: string) => { const i = order.indexOf(loc); return [0.6, 0.25, 0.15][i] ?? 0.1 }
  const reorderAt = useCallback((pid: string, loc: string) => reorderMap[`${pid}|${loc}`] ?? Math.max(1, Math.round((products.find((p) => p.id === pid)?.reorderAt ?? 10) * share(loc))), [reorderMap, products, order]) // eslint-disable-line react-hooks/exhaustive-deps
  const setReorder = useCallback((pid: string, loc: string, n: number) => setReorderMap((m) => ({ ...m, [`${pid}|${loc}`]: n })), [])

  const alerts = useMemo<StockAlert[]>(() => {
    const out: StockAlert[] = []
    for (const p of products.filter((x) => x.status === 'Active' && meta(x).track)) {
      for (const l of locations.filter((x) => x.active)) {
        const av = available(p.id, l.id)
        const rp = reorderAt(p.id, l.id)
        if (av <= rp) out.push({ product: p, location: l, available: av, reorderAt: rp, suggested: Math.max(1, Math.ceil(rp * 2 * (1 + alertRules.bufferPct / 100)) - av) })
      }
    }
    return out.sort((a, b) => a.available - b.available)
  }, [products, locations, available, reorderAt, meta, alertRules.bufferPct])

  const stockValue = useMemo(() => products.filter((p) => p.status !== 'Archived').reduce((n, p) => n + p.stock * meta(p).cost, 0), [products, meta])

  // ---- moving stock
  const applyMoves = useCallback(
    (moves: Move[]) => {
      if (!moves.length) return null
      const work: Levels = {}
      const entries: Movement[] = []
      const at = Date.now()
      for (const m of moves) {
        const cur = (work[m.productId] ??= { ...(levels[m.productId] ?? {}) })
        const next = (cur[m.locationId] ?? 0) + m.delta
        if (next < 0) return `Not enough ${products.find((p) => p.id === m.productId)?.name ?? 'stock'} at ${locations.find((l) => l.id === m.locationId)?.name ?? 'that location'}. Only ${cur[m.locationId] ?? 0} on hand.`
        cur[m.locationId] = next
        entries.push({ id: `mv${at}-${entries.length}`, at, productId: m.productId, locationId: m.locationId, type: m.type, qty: m.delta, ref: m.ref, by: me, balance: next, note: m.note })
      }
      setBase((b) => ({ ...b, ...work }))
      setProducts(products.map((p) => (work[p.id] ? { ...p, stock: Object.values(work[p.id]!).reduce((n, v) => n + v, 0) } : p)))
      setMovements((l) => [...entries.reverse(), ...l])
      return null
    },
    [levels, products, locations, me, setProducts],
  )

  const plan = useCallback(
    (pid: string, qty: number, ref: string, type: Move['type'] = 'Sale'): Move[] | string => {
      let left = qty
      const moves: Move[] = []
      for (const id of order) {
        if (left <= 0) break
        const take = Math.min(levels[pid]?.[id] ?? 0, left)
        if (take > 0) { moves.push({ productId: pid, locationId: id, delta: -take, type, ref }); left -= take }
      }
      return left > 0 ? `Not enough ${products.find((p) => p.id === pid)?.name ?? 'stock'}. ${qty - left} of ${qty} units are on hand.` : moves
    },
    [order, levels, products],
  )

  const recordOpening = useCallback((pid: string, qty: number) => {
    if (qty <= 0 || !primary) return
    setBase((b) => ({ ...b, [pid]: { [primary.id]: qty } }))
    setMovements((l) => [{ id: `mv${Date.now()}`, at: Date.now(), productId: pid, locationId: primary.id, type: 'Opening stock', qty, ref: 'New product', by: me, balance: qty }, ...l])
  }, [primary, me])

  const importRows = useCallback((rows: ImportRow[]) => {
    let created = 0, updated = 0
    const next = [...products]
    const moves: Move[] = []
    const stamp = Date.now()
    rows.forEach((r, i) => {
      const hit = next.findIndex((p) => p.sku.toLowerCase() === r.sku.toLowerCase())
      if (hit >= 0) {
        const p = next[hit]!
        next[hit] = { ...p, name: r.name, price: r.price }
        const diff = r.stock - p.stock
        if (diff !== 0 && primary) moves.push({ productId: p.id, locationId: primary.id, delta: diff, type: 'Adjustment', ref: 'CSV import', note: 'Stock set by import' })
        updated++
      } else {
        const id = `p${stamp}${i}`
        next.unshift({ id, name: r.name, sku: r.sku, category: r.category, price: r.price, stock: 0, reorderAt: 10, status: 'Draft', description: '', createdAt: stamp })
        if (r.stock > 0 && primary) moves.push({ productId: id, locationId: primary.id, delta: r.stock, type: 'Opening stock', ref: 'CSV import' })
        created++
      }
    })
    // new products start at 0, then the moves bring them to the imported stock in one go
    const work: Levels = {}
    const entries: Movement[] = []
    for (const m of moves) {
      const cur = (work[m.productId] ??= { ...(levels[m.productId] ?? {}) })
      const nextQty = Math.max(0, (cur[m.locationId] ?? 0) + m.delta)
      cur[m.locationId] = nextQty
      entries.push({ id: `mv${stamp}-${entries.length}`, at: stamp, productId: m.productId, locationId: m.locationId, type: m.type, qty: m.delta, ref: m.ref, by: me, balance: nextQty, note: m.note })
    }
    setBase((b) => ({ ...b, ...work }))
    setProducts(next.map((p) => (work[p.id] ? { ...p, stock: Object.values(work[p.id]!).reduce((n, v) => n + v, 0) } : p)))
    setMovements((l) => [...entries.reverse(), ...l])
    log(`Imported products from CSV (${created} new, ${updated} updated)`, 'Products')
    return { created, updated }
  }, [products, primary, levels, me, setProducts, log])

  // ---- locations, suppliers, brands
  const saveLocation = useCallback((l: Omit<Location, 'id'> & { id?: string }) => {
    const id = l.id ?? `l${Date.now().toString(36)}`
    setLocations((list) => (list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? { ...l, id } : x)) : [...list, { ...l, id }]))
    log(`Saved stock location · ${l.name}`, 'Inventory')
    return id
  }, [log])
  const saveSupplier = useCallback((s: Omit<Supplier, 'id'> & { id?: string }) => {
    const id = s.id ?? `su${Date.now().toString(36)}`
    setSuppliers((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...s, id } : x)) : [...l, { ...s, id }]))
    log(`Saved supplier · ${s.name}`, 'Purchasing')
    return id
  }, [log])
  const saveBrand = useCallback((b: Omit<Brand, 'id' | 'updatedAt'> & { id?: string }) => {
    const id = b.id ?? `br${Date.now().toString(36)}`
    setBrands((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...b, id, updatedAt: Date.now() } : x)) : [...l, { ...b, id, updatedAt: Date.now() }]))
    log(`Saved brand · ${b.name}`, 'Products')
    return id
  }, [log])
  const deleteBrand = useCallback((id: string) => {
    if (products.some((p) => meta(p).brandId === id)) return 'Products still use this brand. Move them to another brand first.'
    setBrands((l) => l.filter((b) => b.id !== id))
    log('Deleted a brand', 'Products')
    return null
  }, [products, meta, log])

  // ---- categories
  const addCategory = useCallback((name: string) => {
    const n = name.trim()
    if (!n) return 'Name the category.'
    if (categories.some((c) => c.toLowerCase() === n.toLowerCase())) return 'That category already exists.'
    setCategories([...categories, n])
    setTree((t) => ({ ...t, [n]: { handle: slug(n), description: '', subs: [] } }))
    log(`Added category · ${n}`, 'Products')
    return null
  }, [categories, setCategories, log])
  const renameCategory = useCallback((from: string, to: string) => {
    const n = to.trim()
    if (!n) return 'Name the category.'
    if (categories.some((c) => c.toLowerCase() === n.toLowerCase() && c !== from)) return 'That category already exists.'
    setCategories(categories.map((c) => (c === from ? n : c)))
    setProducts(products.map((p) => (p.category === from ? { ...p, category: n } : p)))
    setTree((t) => { const { [from]: node, ...rest } = t; return { ...rest, [n]: { ...(node ?? { handle: slug(n), description: '', subs: [] }), handle: slug(n) } } })
    log(`Renamed category ${from} to ${n}`, 'Products')
    return null
  }, [categories, products, setCategories, setProducts, log])
  const deleteCategory = useCallback((name: string) => {
    if (products.some((p) => p.category === name)) return 'Move or delete the products in this category first.'
    setCategories(categories.filter((c) => c !== name))
    setTree((t) => { const n = { ...t }; delete n[name]; return n })
    log(`Deleted category · ${name}`, 'Products')
    return null
  }, [categories, products, setCategories, log])
  const moveCategory = useCallback((name: string, dir: -1 | 1) => {
    const i = categories.indexOf(name)
    const j = i + dir
    if (i < 0 || j < 0 || j >= categories.length) return
    const n = [...categories];
    [n[i], n[j]] = [n[j]!, n[i]!]
    setCategories(n)
  }, [categories, setCategories])
  const patchCategory = useCallback((name: string, patch: Partial<CategoryNode>) => setTree((t) => ({ ...t, [name]: { ...(t[name] ?? { handle: slug(name), description: '', subs: [] }), ...patch } })), [])
  const addSub = useCallback((cat: string, sub: string) => {
    const n = sub.trim()
    if (!n) return 'Name the subcategory.'
    if ((tree[cat]?.subs ?? []).some((s) => s.toLowerCase() === n.toLowerCase())) return 'That subcategory already exists.'
    patchCategory(cat, { subs: [...(tree[cat]?.subs ?? []), n] })
    return null
  }, [tree, patchCategory])
  const removeSub = useCallback((cat: string, sub: string) => {
    if (products.some((p) => p.category === cat && meta(p).subcategory === sub)) return 'Products still use this subcategory.'
    patchCategory(cat, { subs: (tree[cat]?.subs ?? []).filter((s) => s !== sub) })
    return null
  }, [products, meta, tree, patchCategory])

  // ---- purchasing
  const vat = Number(business.vat) || 16
  const savePO = useCallback(
    (p: Omit<PurchaseOrder, 'id' | 'status' | 'createdBy' | 'createdAt' | 'approvedBy' | 'receivedAt'> & { id?: string }, submit: boolean) => {
      const existing = p.id ? pos.find((x) => x.id === p.id) : undefined
      if (existing && existing.status !== 'Draft') return { error: 'Only a draft can be edited.' }
      const id = p.id ?? `PO-${Math.max(1030, ...pos.map((x) => Number(x.id.replace(/D/g, '')) || 0)) + 1}`
      const draft: PurchaseOrder = { ...p, id, status: 'Draft', createdBy: existing?.createdBy ?? me, createdAt: existing?.createdAt ?? Date.now() }
      const total = poTotal(draft, vat)
      draft.status = submit ? (total > PO_APPROVAL_LIMIT ? 'Pending approval' : 'Approved') : 'Draft'
      if (submit && total <= PO_APPROVAL_LIMIT) draft.approvedBy = 'Auto-approved'
      setPos((l) => (existing ? l.map((x) => (x.id === id ? draft : x)) : [draft, ...l]))
      log(`${submit ? 'Submitted' : 'Saved'} purchase order ${id} (${kes(total)})`, 'Purchasing')
      return { id }
    },
    [pos, me, vat, log],
  )
  const poAction = useCallback(
    (id: string, action: 'approve' | 'send' | 'cancel') => {
      const p = pos.find((x) => x.id === id)
      if (!p) return 'Purchase order not found.'
      const set = (patch: Partial<PurchaseOrder>) => setPos((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
      if (action === 'approve') {
        if (p.status !== 'Pending approval') return 'This order isn’t waiting for approval.'
        if (p.createdBy === me && role !== 'Owner admin') return `${p.createdBy} created this order, so someone else must approve it.`
        set({ status: 'Approved', approvedBy: me }); log(`Approved purchase order ${id}`, 'Purchasing'); return null
      }
      if (action === 'send') { if (p.status !== 'Approved') return 'Only an approved order can be sent.'; set({ status: 'In transit' }); log(`Sent purchase order ${id} to the supplier`, 'Purchasing'); return null }
      if (p.lines.some((l) => l.received > 0)) return 'Part of this order has been received, so it can’t be cancelled.'
      if (p.status === 'Cancelled' || p.status === 'Received') return 'This order is already closed.'
      set({ status: 'Cancelled' }); log(`Cancelled purchase order ${id}`, 'Purchasing'); return null
    },
    [pos, me, role, log],
  )
  const receivePO = useCallback(
    (id: string, rows: { productId: string; good: number; damaged: number }[], ref: string) => {
      const p = pos.find((x) => x.id === id)
      if (!p) return 'Purchase order not found.'
      if (!['Approved', 'In transit', 'Partially received'].includes(p.status)) return 'This order can’t be received in its current state.'
      if (!ref.trim()) return 'Enter the supplier’s delivery reference.'
      const moves: Move[] = []
      if (rows.some((r) => !Number.isInteger(r.good) || !Number.isInteger(r.damaged) || r.good < 0 || r.damaged < 0)) return 'Quantities must be whole numbers of 0 or more.'
      const lines: POLine[] = p.lines.map((l) => {
        const r = rows.find((x) => x.productId === l.productId)
        const good = r?.good ?? 0, damaged = r?.damaged ?? 0
        return { ...l, received: l.received + good + damaged, damaged: l.damaged + damaged }
      })
      const over = lines.find((l) => l.received > l.qty)
      if (over) return `More ${products.find((x) => x.id === over.productId)?.name ?? 'stock'} than was ordered. Record the extra as a supplier correction instead.`
      for (const r of rows) if (r.good > 0) moves.push({ productId: r.productId, locationId: p.locationId, delta: r.good, type: 'PO receipt', ref: id, note: ref.trim() })
      if (!moves.length && !rows.some((r) => r.damaged > 0)) return 'Enter the quantities you received.'
      const err = applyMoves(moves)
      if (err) return err
      const all = lines.every((l) => l.received >= l.qty)
      setPos((l) => l.map((x) => (x.id === id ? { ...x, lines, status: all ? 'Received' : 'Partially received', deliveryRef: ref.trim(), receivedAt: all ? Date.now() : x.receivedAt } : x)))
      log(`Received stock against ${id}`, 'Inventory')
      return null
    },
    [pos, products, applyMoves, log],
  )

  // ---- packing
  const pickItem = useCallback((orderId: string, pid: string, on: boolean) => setPack((m) => {
    const cur = m[orderId] ?? { picked: [], stage: 'pick' as const, startedAt: Date.now() }
    return { ...m, [orderId]: { ...cur, picked: on ? [...new Set([...cur.picked, pid])] : cur.picked.filter((x) => x !== pid) } }
  }), [])
  const packOrder = useCallback(
    (orderId: string) => {
      const o = orders.find((x) => x.id === orderId)
      if (!o) return 'Order not found.'
      const st = pack[orderId]
      if (!st || o.items.some((i) => !st.picked.includes(i.productId))) return 'Pick every item before packing.'
      if (o.status === 'Pending') {
        const all: Move[] = []
        for (const i of o.items) { const m = plan(i.productId, i.qty, orderId); if (typeof m === 'string') return m; all.push(...m) }
        const err = applyMoves(all)
        if (err) return err
        const at = Date.now()
        setOrders(orders.map((x) => (x.id === orderId ? { ...x, status: 'Processing', events: [...x.events, { status: 'Processing', at, by: me }, { status: 'Note', at, by: me, note: 'Picked and packed' }] } : x)))
      }
      setPack((m) => ({ ...m, [orderId]: { ...st, stage: 'packed', packedAt: Date.now() } }))
      log(`Packed order ${orderId}`, 'Inventory')
      return null
    },
    [orders, pack, plan, applyMoves, setOrders, me, log],
  )

  // ---- returns
  const fromSupport = useMemo<WarehouseReturn[]>(
    () => returns.filter((r) => r.status === 'Approved').map((r) => {
      const o = orders.find((x) => x.id === r.orderId)
      const it = o?.items.find((i) => i.name === r.item) ?? o?.items[0]
      return { id: r.id, orderId: r.orderId, customer: r.customerName, productId: it?.productId ?? '', productName: r.item, qty: r.qty, reason: r.reason, condition: r.photos ? 'Photo evidence' : 'Reported', receivedAt: r.submittedAt, value: r.itemValue }
    }),
    [returns, orders],
  )
  const returnsQueue = useMemo(() => [...warehouseReturns, ...fromSupport], [warehouseReturns, fromSupport])
  const decideReturn = useCallback(
    (r: WarehouseReturn, d: Omit<Decision, 'by' | 'at'>) => {
      if (decisions[r.id]) return 'This return has already been decided.'
      const restock = d.disposition.startsWith('Restock')
      if (restock) {
        if (!r.productId) return 'This item can’t be matched to a product, so it can’t be restocked.'
        const err = applyMoves([{ productId: r.productId, locationId: d.locationId, delta: r.qty, type: 'Return restock', ref: r.id, note: d.notes }])
        if (err) return err
      } else {
        setMovements((l) => [{ id: `mv${Date.now()}`, at: Date.now(), productId: r.productId, locationId: d.locationId, type: 'Write-off', qty: 0, ref: r.id, by: me, balance: levels[r.productId]?.[d.locationId] ?? 0, note: `${d.disposition}${d.notes ? ` · ${d.notes}` : ''}` }, ...l])
      }
      if (d.refund === 'Send to refund review') { const o = orders.find((x) => x.id === r.orderId); if (o && o.pay === 'Paid') createRefund(o.id, r.value, `Return ${r.id}: ${r.reason}`) }
      setDecisions((m) => ({ ...m, [r.id]: { ...d, by: me, at: Date.now() } }))
      log(`${d.disposition} · return ${r.id}`, 'Inventory')
      return null
    },
    [decisions, applyMoves, levels, orders, createRefund, me, log],
  )

  // ---- stock take
  const startCount = useCallback(
    (locationId: string, zone: string) => {
      if (counts.some((c) => c.locationId === locationId && c.status !== 'Reconciled')) return 'There is already an open count at that location. Finish it first.'
      const lines: CountLine[] = products.filter((p) => p.status !== 'Archived' && meta(p).track).map((p) => ({ productId: p.id, expected: levels[p.id]?.[locationId] ?? 0 }))
      const id = `CC-${String(248 + counts.length).padStart(4, '0')}`
      setCounts((l) => [{ id, locationId, zone: zone.trim() || 'Whole location', owner: me, startedAt: Date.now(), status: 'Counting', lines }, ...l])
      log(`Started stock count ${id}`, 'Inventory')
      return null
    },
    [counts, products, meta, levels, me, log],
  )
  const setCount = useCallback((cid: string, pid: string, which: 'c1' | 'c2', value: number | undefined) => setCounts((l) => l.map((c) => (c.id !== cid || c.status !== 'Counting' ? c : { ...c, lines: c.lines.map((x) => (x.productId === pid ? { ...x, [which]: value } : x)) }))), [])
  const submitCount = useCallback(
    (cid: string) => {
      const c = counts.find((x) => x.id === cid)
      if (!c) return 'Count not found.'
      if (c.lines.some((l) => countState(l) === 'Not counted')) return 'Count every product before submitting.'
      if (c.lines.some((l) => countState(l) === 'Recount')) return 'Some products don’t match the system. Enter a second count for them.'
      const variance = c.lines.some((l) => countState(l) === 'Variance')
      setCounts((l) => l.map((x) => (x.id === cid ? { ...x, status: variance ? 'Pending approval' : 'Reconciled', approvedBy: variance ? undefined : 'No variances' } : x)))
      log(`Submitted stock count ${cid}`, 'Inventory')
      return null
    },
    [counts, log],
  )
  const approveCount = useCallback(
    (cid: string) => {
      const c = counts.find((x) => x.id === cid)
      if (!c || c.status !== 'Pending approval') return 'This count isn’t waiting for approval.'
      if (c.owner === me && role !== 'Owner admin') return `${c.owner} ran this count, so someone else must approve the adjustments.`
      const moves: Move[] = c.lines.filter((l) => countState(l) === 'Variance').map((l) => ({ productId: l.productId, locationId: c.locationId, delta: countFinal(l)! - (levels[l.productId]?.[c.locationId] ?? 0), type: 'Adjustment' as const, ref: c.id, note: 'Stock count variance' })).filter((m) => m.delta !== 0)
      const err = applyMoves(moves)
      if (err) return err
      setCounts((l) => l.map((x) => (x.id === cid ? { ...x, status: 'Reconciled', approvedBy: me } : x)))
      log(`Approved stock count ${cid} (${moves.length} adjustments)`, 'Inventory')
      return null
    },
    [counts, me, role, levels, applyMoves, log],
  )

  const value = useMemo<Inventory>(
    () => ({
      locations, saveLocation, primary, levels, reserved, available, onHandAt, meta, setMeta, reorderAt, setReorder, alerts, alertRules, setAlertRules, stockValue, movements, applyMoves, plan, recordOpening, importRows, suppliers, saveSupplier,
      brands, saveBrand, deleteBrand, tree, addCategory, renameCategory, deleteCategory, moveCategory, patchCategory, addSub, removeSub, pos, savePO, poAction, receivePO, pack, pickItem, packOrder, returnsQueue, decisions, decideReturn, counts, startCount, setCount, submitCount, approveCount,
    }),
    [locations, saveLocation, primary, levels, reserved, available, onHandAt, meta, setMeta, reorderAt, setReorder, alerts, alertRules, stockValue, movements, applyMoves, plan, recordOpening, importRows, suppliers, saveSupplier, brands, saveBrand, deleteBrand, tree, addCategory, renameCategory, deleteCategory, moveCategory, patchCategory, addSub, removeSub, pos, savePO, poAction, receivePO, pack, pickItem, packOrder, returnsQueue, decisions, decideReturn, counts, startCount, setCount, submitCount, approveCount],
  )
  void now
  return <Ctx value={value}>{children}</Ctx>
}

export function useInventory(): Inventory {
  const ctx = use(Ctx)
  if (!ctx) throw new Error('useInventory must be used inside <InventoryProvider>')
  return ctx
}

export type { Disposition }
