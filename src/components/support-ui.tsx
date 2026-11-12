import { useState, type ReactNode } from 'react'

import type { Priority } from '../data/support'
import { initials } from '../data/seed'
import { dateTime } from '../lib/format'

/** The current time, read once when the page opens (keeps render pure). */
export const useNow = () => useState(() => Date.now())[0]

export const ago = (ms: number, now: number) => {
  const m = Math.max(0, Math.round((now - ms) / 60_000))
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export const when = (ms: number) => dateTime(ms)

export const Person = ({ name, size }: { name: string; size?: number }) => (
  <span className="avatar" aria-hidden="true" style={size ? { width: size, height: size } : undefined}>{initials(name)}</span>
)

export const PriorityTag = ({ p }: { p: Priority }) => <span className={`sp-priority ${p.toLowerCase()}`}>{p}</span>

export const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="sp-detail"><span>{label}</span><b>{children}</b></div>
)

export const TimelineItem = ({ tone, title, sub }: { tone?: 'amber' | 'gray' | 'green'; title: string; sub: string }) => (
  <div className="sp-tl-item"><span className={`sp-tl-dot ${tone ?? ''}`} /><div><b>{title}</b><small>{sub}</small></div></div>
)

export const Label = ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => <label className="sp-label" htmlFor={htmlFor}>{children}</label>

export const NotFoundCard = ({ what, back, onBack }: { what: string; back: string; onBack: () => void }) => (
  <section className="card panel" style={{ textAlign: 'center', padding: 36 }}>
    <h2>{what} not found</h2>
    <p className="panel-sub" style={{ margin: '6px 0 14px' }}>It may have been removed, or the link is wrong.</p>
    <button className="btn" onClick={onBack}>{back}</button>
  </section>
)
