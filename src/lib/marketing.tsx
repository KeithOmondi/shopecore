import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import {
  factsOf, inSegment, knownLinks, LOYALTY_DEFAULTS, optIn, REFERRAL_DEFAULTS, seedCategoryContent, seedMarketing,
  type Banner, type Bundle, type CategoryContent, type ContentPage, type Coupon, type CouponState, type FlashSale, type HomeSection, type Highlight, type Loyalty, type Message, type Push, type Referral, type Segment,
} from '../data/marketing'
import { useStore } from './store'
import { useSupport } from './support'

export interface Audience { total: number; push: number; email: number; sms: number }
export interface BannerSettings { interval: string; ratio: string }
export interface Schedule { mode: 'now' | 'later'; at: string }

interface Marketing {
  now: number
  me: string
  /** Is this a page the storefront really has? */
  knownLink: (link: string) => boolean
  segments: Segment[]
  audience: (segmentId: string) => Audience
  saveSegment: (s: Omit<Segment, 'id'> & { id?: string }) => string
  deleteSegment: (id: string) => string | null
  coupons: Coupon[]
  saveCoupon: (c: Omit<Coupon, 'id' | 'redemptions' | 'discountGiven' | 'createdBy'> & { id?: string }) => { id?: string; error?: string }
  setCouponState: (ids: string[], state: CouponState) => void
  flash: FlashSale[]
  saveFlash: (s: Omit<FlashSale, 'id' | 'salesToday'> & { id?: string }) => { id?: string; error?: string }
  setFlashState: (id: string, state: FlashSale['state']) => void
  bundles: Bundle[]
  saveBundle: (b: Omit<Bundle, 'id' | 'unitsSold' | 'conversion'> & { id?: string }) => string
  setBundleState: (id: string, state: Bundle['state']) => void
  rules: { noStackFlash: boolean; bundlePoints: boolean }
  setRules: (r: { noStackFlash: boolean; bundlePoints: boolean }) => void
  banners: Banner[]
  saveBanner: (b: Omit<Banner, 'id'> & { id?: string }) => string
  moveBanner: (id: string, dir: -1 | 1) => void
  setBannerPublished: (id: string, on: boolean) => void
  deleteBanner: (id: string) => void
  bannerSettings: BannerSettings
  setBannerSettings: (s: BannerSettings) => void
  sections: HomeSection[]
  /** How many sections differ from what is live. */
  unpublished: number
  liveAt: number
  moveSection: (id: string, dir: -1 | 1) => void
  patchSection: (id: string, patch: Partial<HomeSection>) => void
  addSection: (name: string, sub: string, count: number) => void
  removeSection: (id: string) => void
  publishLayout: (schedule: Schedule) => string | null
  pendingLayout: { at: number } | null
  pushes: Push[]
  pushConflict: (at: number | null, segmentId: string, exceptId?: string) => Push | undefined
  savePush: (p: Omit<Push, 'id' | 'stats'> & { id?: string }, mode: 'draft' | 'schedule' | 'now') => string
  messages: Message[]
  saveMessage: (m: Omit<Message, 'id' | 'stats'> & { id?: string }, mode: 'draft' | 'schedule' | 'now') => string
  campaigns: ReturnType<typeof seedMarketing>['campaigns']
  loyalty: Loyalty
  setLoyalty: (l: Loyalty) => void
  referral: Referral
  setReferral: (r: Referral) => void
  highlights: Highlight[]
  setHighlight: (reviewId: string, patch: Partial<Highlight> | null) => void
  pages: ContentPage[]
  savePage: (p: Omit<ContentPage, 'id' | 'updatedAt'> & { id?: string }) => { id?: string; error?: string }
  categoryContent: Record<string, CategoryContent>
  saveCategoryContent: (cat: string, c: CategoryContent) => void
}

const Ctx = createContext<Marketing | null>(null)
const hashSeed = (s: string) => [...s].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 9973, 11)

export function MarketingProvider({ children }: { children: ReactNode }) {
  const { user, products, customers, orders, categories, log } = useStore()
  const [now] = useState(() => Date.now())
  const me = user?.name ?? 'Marketing'
  const [seed] = useState(() => seedMarketing(Date.now(), products))
  const [segments, setSegments] = useState(seed.segments)
  const [coupons, setCoupons] = useState(seed.coupons)
  const [flash, setFlash] = useState(seed.flash)
  const [bundles, setBundles] = useState(seed.bundles)
  const [rules, setRules] = useState({ noStackFlash: true, bundlePoints: true })
  const [banners, setBanners] = useState(seed.banners)
  const [bannerSettings, setBannerSettings] = useState<BannerSettings>({ interval: '5 seconds', ratio: '16:5 desktop · 4:3 mobile' })
  const [sections, setSections] = useState(seed.sections)
  const [live, setLive] = useState<{ sections: HomeSection[]; at: number }>(() => ({ sections: seed.sections, at: Date.now() - 5 * 3_600_000 }))
  const [pendingLayout, setPendingLayout] = useState<{ at: number } | null>(null)
  const [pushes, setPushes] = useState(seed.pushes)
  const [messages, setMessages] = useState(seed.messages)
  const [loyalty, setLoyalty] = useState(LOYALTY_DEFAULTS)
  const [referral, setReferral] = useState(REFERRAL_DEFAULTS)
  const { reviews } = useSupport()
  const [highlights, setHighlights] = useState<Highlight[]>(() => reviews.filter((r) => r.rating >= 4).slice(0, 3).map((r, i) => ({ reviewId: r.id, placement: ['Home · Featured', 'Category page', 'App · New'][i]!, published: i < 2 })))
  const [pages, setPages] = useState(seed.pages)
  const [categoryContent, setCategoryContent] = useState(() => seedCategoryContent(categories))

  const knownLink = useCallback((link: string) => knownLinks(categories).includes(link.trim()), [categories])
  const facts = useMemo(() => factsOf(customers, orders), [customers, orders])
  const audience = useCallback(
    (segmentId: string): Audience => {
      const seg = segments.find((s) => s.id === segmentId)
      const hit = facts.filter((f) => (seg ? inSegment(seg, f, now) : true))
      return { total: hit.length, push: hit.filter((f) => optIn(f.c).push).length, email: hit.filter((f) => optIn(f.c).email).length, sms: hit.filter((f) => optIn(f.c).sms).length }
    },
    [segments, facts, now],
  )
  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`

  const saveSegment = useCallback((s: Omit<Segment, 'id'> & { id?: string }) => {
    const id = s.id ?? uid('sg')
    setSegments((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...s, id } : x)) : [...l, { ...s, id }]))
    log(`Saved audience segment · ${s.name}`, 'Marketing')
    return id
  }, [log])
  const deleteSegment = useCallback((id: string) => {
    if (pushes.some((p) => p.segmentId === id) || messages.some((m) => m.segmentId === id) || coupons.some((c) => c.segmentId === id)) return 'This segment is used by a campaign or coupon, so it can’t be deleted.'
    setSegments((l) => l.filter((x) => x.id !== id))
    log('Deleted an audience segment', 'Marketing')
    return null
  }, [pushes, messages, coupons, log])

  const saveCoupon = useCallback((c: Omit<Coupon, 'id' | 'redemptions' | 'discountGiven' | 'createdBy'> & { id?: string }) => {
    const code = c.code.trim().toUpperCase()
    if (coupons.some((x) => x.code === code && x.id !== c.id)) return { error: 'Another coupon already uses that code.' }
    const id = c.id ?? uid('cp')
    setCoupons((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...x, ...c, code, id } : x)) : [{ ...c, code, id, redemptions: 0, discountGiven: 0, createdBy: me }, ...l]))
    log(`Saved coupon ${code}`, 'Marketing')
    return { id }
  }, [coupons, me, log])
  const setCouponState = useCallback((ids: string[], state: CouponState) => {
    setCoupons((l) => l.map((c) => (ids.includes(c.id) ? { ...c, state } : c)))
    log(`${state === 'Paused' ? 'Paused' : 'Resumed'} ${ids.length} coupon${ids.length === 1 ? '' : 's'}`, 'Marketing')
  }, [log])

  const saveFlash = useCallback((s: Omit<FlashSale, 'id' | 'salesToday'> & { id?: string }) => {
    const clash = flash.find((x) => x.id !== s.id && x.state === 'Live' && x.start < s.end && s.start < x.end && x.productIds.some((p) => s.productIds.includes(p)))
    if (s.state === 'Live' && clash) return { error: `${clash.name} already runs on some of these products at the same time. Products can only be in one sale at once.` }
    const id = s.id ?? uid('fs')
    setFlash((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...x, ...s, id } : x)) : [{ ...s, id, salesToday: 0 }, ...l]))
    log(`Saved flash sale · ${s.name}`, 'Marketing')
    return { id }
  }, [flash, log])
  const setFlashState = useCallback((id: string, state: FlashSale['state']) => { setFlash((l) => l.map((x) => (x.id === id ? { ...x, state } : x))); log('Changed a flash sale', 'Marketing') }, [log])

  const saveBundle = useCallback((b: Omit<Bundle, 'id' | 'unitsSold' | 'conversion'> & { id?: string }) => {
    const id = b.id ?? uid('bd')
    setBundles((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...x, ...b, id } : x)) : [{ ...b, id, unitsSold: 0, conversion: 0 }, ...l]))
    log(`Saved bundle · ${b.name}`, 'Marketing')
    return id
  }, [log])
  const setBundleState = useCallback((id: string, state: Bundle['state']) => setBundles((l) => l.map((x) => (x.id === id ? { ...x, state } : x))), [])

  const saveBanner = useCallback((b: Omit<Banner, 'id'> & { id?: string }) => {
    const id = b.id ?? uid('bn')
    setBanners((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...b, id } : x)) : [...l, { ...b, id }]))
    log(`Saved banner · ${b.title}`, 'Marketing')
    return id
  }, [log])
  const moveBanner = useCallback((id: string, dir: -1 | 1) => setBanners((l) => { const i = l.findIndex((x) => x.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j]!, n[i]!]; return n }), [])
  const setBannerPublished = useCallback((id: string, on: boolean) => { setBanners((l) => l.map((x) => (x.id === id ? { ...x, published: on } : x))); log(`${on ? 'Published' : 'Unpublished'} a banner`, 'Marketing') }, [log])
  const deleteBanner = useCallback((id: string) => { setBanners((l) => l.filter((x) => x.id !== id)); log('Deleted a banner', 'Marketing') }, [log])

  const moveSection = useCallback((id: string, dir: -1 | 1) => setSections((l) => { const i = l.findIndex((x) => x.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j]!, n[i]!]; return n }), [])
  const patchSection = useCallback((id: string, patch: Partial<HomeSection>) => setSections((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x))), [])
  const addSection = useCallback((name: string, sub: string, count: number) => setSections((l) => [...l, { id: uid('hs'), name, sub, enabled: true, count }]), [])
  const removeSection = useCallback((id: string) => setSections((l) => l.filter((x) => x.id !== id)), [])
  const unpublished = useMemo(() => sections.filter((s, i) => { const l = live.sections[i]; return !l || l.id !== s.id || l.enabled !== s.enabled || l.count !== s.count || l.name !== s.name }).length, [sections, live])
  const publishLayout = useCallback((sch: Schedule) => {
    if (!sections.some((s) => s.enabled)) return 'Turn on at least one section before publishing.'
    if (sch.mode === 'later') {
      const at = Date.parse(sch.at)
      if (!Number.isFinite(at) || at <= Date.now()) return 'Choose a time in the future.'
      setPendingLayout({ at })
      log('Scheduled a homepage layout', 'Marketing')
      return null
    }
    setLive({ sections: sections.map((s) => ({ ...s })), at: Date.now() })
    setPendingLayout(null)
    log('Published the homepage layout', 'Marketing')
    return null
  }, [sections, log])

  const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()
  const pushConflict = useCallback((at: number | null, segmentId: string, exceptId?: string) => {
    if (at === null) return undefined
    return pushes.find((p) => p.id !== exceptId && p.cap && p.at !== null && p.status !== 'Draft' && sameDay(p.at, at) && (p.segmentId === segmentId || p.segmentId === 'sg-all' || segmentId === 'sg-all'))
  }, [pushes])

  const savePush = useCallback((p: Omit<Push, 'id' | 'stats'> & { id?: string }, mode: 'draft' | 'schedule' | 'now') => {
    const id = p.id ?? uid('pu')
    const a = audience(p.segmentId)
    const sent = mode === 'now'
    const h = hashSeed(id)
    const stats = sent ? { sent: a.push, opened: Math.round(a.push * (0.25 + (h % 8) / 100)), converted: Math.round(a.push * (0.03 + (h % 3) / 100)) } : undefined
    const next: Push = { ...p, id, at: sent ? Date.now() : p.at, status: mode === 'draft' ? 'Draft' : sent ? 'Sent' : 'Scheduled', stats }
    setPushes((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? next : x)) : [next, ...l]))
    log(`${mode === 'draft' ? 'Saved' : sent ? 'Sent' : 'Scheduled'} push · ${p.title}`, 'Marketing')
    return id
  }, [audience, log])
  const saveMessage = useCallback((m: Omit<Message, 'id' | 'stats'> & { id?: string }, mode: 'draft' | 'schedule' | 'now') => {
    const id = m.id ?? uid('ms')
    const a = audience(m.segmentId)
    const reach = m.channel === 'Email' ? a.email : a.sms
    const sent = mode === 'now'
    const h = hashSeed(id)
    const stats = sent ? { sent: reach, delivered: Math.round(reach * (m.channel === 'SMS' ? 0.97 : 0.4 + (h % 6) / 100)), clicks: Math.round(reach * (0.05 + (h % 4) / 100)) } : undefined
    const next: Message = { ...m, id, at: sent ? Date.now() : m.at, status: mode === 'draft' ? 'Draft' : sent ? 'Sent' : 'Scheduled', stats }
    setMessages((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? next : x)) : [next, ...l]))
    log(`${mode === 'draft' ? 'Saved' : sent ? 'Sent' : 'Scheduled'} ${m.channel.toLowerCase()} · ${m.name}`, 'Marketing')
    return id
  }, [audience, log])

  const setHighlight = useCallback((reviewId: string, patch: Partial<Highlight> | null) => {
    setHighlights((l) => (patch === null ? l.filter((h) => h.reviewId !== reviewId) : l.some((h) => h.reviewId === reviewId) ? l.map((h) => (h.reviewId === reviewId ? { ...h, ...patch } : h)) : [...l, { reviewId, placement: 'Home · Featured', published: false, ...patch }]))
    log('Changed a review highlight', 'Marketing')
  }, [log])

  const savePage = useCallback((p: Omit<ContentPage, 'id' | 'updatedAt'> & { id?: string }) => {
    const slug = p.slug.trim()
    if (pages.some((x) => x.slug === slug && x.id !== p.id)) return { error: 'Another page already uses that address.' }
    const id = p.id ?? uid('pg')
    setPages((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...x, ...p, slug, id, updatedAt: Date.now() } : x)) : [...l, { ...p, slug, id, updatedAt: Date.now() }]))
    log(`${p.status === 'Published' ? 'Published' : 'Saved'} page · ${p.title}`, 'Marketing')
    return { id }
  }, [pages, log])
  const saveCategoryContent = useCallback((cat: string, c: CategoryContent) => { setCategoryContent((m) => ({ ...m, [cat]: c })); log(`Saved category content · ${cat}`, 'Marketing') }, [log])

  const value = useMemo<Marketing>(
    () => ({
      now, me, knownLink, segments, audience, saveSegment, deleteSegment, coupons, saveCoupon, setCouponState, flash, saveFlash, setFlashState, bundles, saveBundle, setBundleState, rules, setRules, banners, saveBanner, moveBanner, setBannerPublished, deleteBanner, bannerSettings, setBannerSettings,
      sections, unpublished, liveAt: live.at, moveSection, patchSection, addSection, removeSection, publishLayout, pendingLayout, pushes, pushConflict, savePush, messages, saveMessage, campaigns: seed.campaigns, loyalty, setLoyalty, referral, setReferral, highlights, setHighlight, pages, savePage, categoryContent, saveCategoryContent,
    }),
    [now, me, knownLink, segments, audience, saveSegment, deleteSegment, coupons, saveCoupon, setCouponState, flash, saveFlash, setFlashState, bundles, saveBundle, setBundleState, rules, banners, saveBanner, moveBanner, setBannerPublished, deleteBanner, bannerSettings, sections, unpublished, live.at, moveSection, patchSection, addSection, removeSection, publishLayout, pendingLayout, pushes, pushConflict, savePush, messages, saveMessage, seed.campaigns, loyalty, referral, highlights, setHighlight, pages, savePage, categoryContent, saveCategoryContent],
  )
  return <Ctx value={value}>{children}</Ctx>
}

export function useMarketing(): Marketing {
  const ctx = use(Ctx)
  if (!ctx) throw new Error('useMarketing must be used inside <MarketingProvider>')
  return ctx
}
