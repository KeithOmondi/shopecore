import type { Product } from '../data/commerce'
import { kes } from '../lib/format'

/** A timestamp as the value of a datetime-local input. */
export const toInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
export const fromInput = (s: string) => Date.parse(s)

export function ProductPicker({ products, selected, onChange, label = 'Products' }: { products: Product[]; selected: string[]; onChange: (ids: string[]) => void; label?: string }) {
  const set = new Set(selected)
  return (
    <fieldset style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', margin: '0 0 12px', maxHeight: 190, overflow: 'auto' }}>
      <legend style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', padding: '0 4px' }}>{label} ({selected.length} chosen)</legend>
      {products.filter((p) => p.status === 'Active').map((p) => (
        <label key={p.id} className="sp-row" style={{ fontSize: 11, padding: '3px 0', gap: 8 }}>
          <input type="checkbox" checked={set.has(p.id)} onChange={(e) => onChange(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />
          <span style={{ flex: 1 }}>{p.name}</span><span className="panel-sub">{kes(p.price)} · {p.stock} in stock</span>
        </label>
      ))}
    </fieldset>
  )
}

export const PhoneFrame = ({ children, label }: { children: React.ReactNode; label?: string }) => (
  <div aria-label={label} style={{ width: 210, margin: '0 auto', border: '6px solid #111827', borderRadius: 26, background: 'var(--soft)', padding: '18px 10px 12px', minHeight: 280, position: 'relative' }}>
    <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 52, height: 5, borderRadius: 4, background: '#111827' }} />
    {children}
  </div>
)

export const Tag = ({ children }: { children: React.ReactNode }) => <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.4px', color: 'var(--blue)', background: 'var(--blue-soft)', borderRadius: 99, padding: '2px 8px' }}>{children}</span>
