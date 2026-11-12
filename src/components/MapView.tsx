import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { Pt } from '../data/geo'

export interface MapPin {
  id: string
  at: Pt
  kind: 'rider' | 'order' | 'sos'
  label: string
  title: string
  onClick?: () => void
}
export interface MapZone {
  id: string
  points: [number, number][]
  color: string
  selected?: boolean
}
export interface MapLine {
  id: string
  points: Pt[]
  color?: string
}

const W = 100
const H = 75
const pct = (p: Pt) => ({ left: `${(p.lng / W) * 100}%`, top: `${(1 - p.lat / H) * 100}%` })

/**
 * A flat map of Nairobi with pins, zone outlines and routes. Zoom with the buttons, drag to pan.
 * In `draw` mode a click reports the point on the map (used to outline a delivery zone).
 */
export function MapView({ pins = [], zones = [], lines = [], draw, onPoint, drawn = [], height }: { pins?: MapPin[]; zones?: MapZone[]; lines?: MapLine[]; draw?: boolean; onPoint?: (p: Pt) => void; drawn?: Pt[]; height?: number }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const box = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)

  const clamp = (z: number, p: { x: number; y: number }) => {
    const w = box.current?.clientWidth ?? 0
    const h = box.current?.clientHeight ?? 0
    return { x: Math.min(0, Math.max(w - w * z, p.x)), y: Math.min(0, Math.max(h - h * z, p.y)) }
  }
  const setZ = (z: number) => {
    const next = Math.min(3, Math.max(1, z))
    setZoom(next)
    setPan((p) => clamp(next, p))
  }

  const down = (e: ReactPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved && !draw) setPan(clamp(zoom, { x: d.px + dx, y: d.py + dy }))
  }
  const up = (e: ReactPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved || !draw || !onPoint || !surface.current) return
    const r = surface.current.getBoundingClientRect()
    const lng = ((e.clientX - r.left) / r.width) * W
    const lat = H - ((e.clientY - r.top) / r.height) * H
    onPoint({ lat: Math.round(lat * 10) / 10, lng: Math.round(lng * 10) / 10 })
  }

  return (
    <div className="map-area" style={height ? { height } : undefined} ref={box}>
      <div
        ref={surface}
        className={`map-surface ${draw ? 'drawing' : ''}`}
        role="img"
        aria-label="Delivery operations map"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={() => (drag.current = null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {zones.map((z) => (
            <polygon key={z.id} points={z.points.map(([la, ln]) => `${ln},${H - la}`).join(' ')} fill={z.color} fillOpacity={z.selected ? 0.3 : 0.14} stroke={z.color} strokeWidth={z.selected ? 0.7 : 0.4} vectorEffect="non-scaling-stroke" />
          ))}
          {lines.map((l) => (
            <polyline key={l.id} points={l.points.map((p) => `${p.lng},${H - p.lat}`).join(' ')} fill="none" stroke={l.color ?? '#2563EB'} strokeWidth={3} strokeDasharray="6 7" vectorEffect="non-scaling-stroke" />
          ))}
          {drawn.length > 1 && <polyline points={drawn.map((p) => `${p.lng},${H - p.lat}`).join(' ')} fill="none" stroke="#2563EB" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          {drawn.length > 2 && <polygon points={drawn.map((p) => `${p.lng},${H - p.lat}`).join(' ')} fill="#3B82F6" fillOpacity={0.2} stroke="#2563EB" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        </svg>
        {drawn.map((p, i) => (
          <span key={i} className="pin-wrap" style={{ ...pct(p), transform: `translate(-50%,-50%) scale(${1 / zoom})` }}>
            <span style={{ display: 'block', width: 9, height: 9, borderRadius: '50%', background: '#fff', border: '2px solid #2563EB' }} />
          </span>
        ))}
        {pins.map((p) => (
          <span key={p.id} className="pin-wrap" style={{ ...pct(p.at), transform: `translate(-50%,-92%) scale(${1 / zoom})` }}>
            <button type="button" className={`map-pin ${p.kind}-pin`} style={{ border: '2px solid #fff', padding: 0 }} title={p.title} aria-label={p.title} onClick={(e) => { e.stopPropagation(); p.onClick?.() }} onPointerDown={(e) => e.stopPropagation()}>
              <span>{p.label}</span>
            </button>
          </span>
        ))}
      </div>
      {draw && <div className="map-hint">Click the map to place points. Three or more make a zone.</div>}
      <div className="map-controls">
        <button type="button" aria-label="Zoom in" onClick={() => setZ(zoom + 0.5)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => setZ(zoom - 0.5)}>−</button>
        <button type="button" aria-label="Reset map view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>⌖</button>
      </div>
      <div className="map-key">
        <span><i style={{ background: '#16A34A' }} />Rider</span>
        <span><i style={{ background: '#F59E0B' }} />Order</span>
        <span><i style={{ background: '#DC2626' }} />Alert</span>
      </div>
    </div>
  )
}
