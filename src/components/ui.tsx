import { useId, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'

export const statusClass = (s: string) =>
  ['Active', 'Healthy', 'Connected', 'Complete', 'Included'].includes(s)
    ? 'green'
    : ['Pending', 'Review', 'Degraded', 'Paused', 'Processing'].includes(s)
      ? 'amber'
      : ['Suspended', 'Failed', 'Expired', 'Revoked', 'Disconnected', 'Security'].includes(s)
        ? 'red'
        : ['Invited', 'Scheduled', 'Updated', 'Access'].includes(s)
          ? 'blue'
          : s === 'Returning' || s === 'Delivered' || s === 'Refund'
            ? s === 'Refund' ? 'amber' : 'green'
            : 'gray'

export function Badge({ children, tone }: { children: string; tone?: 'green' | 'amber' | 'red' | 'blue' | 'gray' }) {
  return <span className={`badge ${tone ?? statusClass(children)}`}>{children}</span>
}

export function PageHead({ title, desc, actions }: { title: string; desc: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <p className="eyebrow">ShopCore / {title}</p>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      <div className="actions">{actions}</div>
    </div>
  )
}

type BtnProps = {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  small?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  label?: string
}
export function Btn({ children, onClick, variant, small, disabled, type = 'button', label }: BtnProps) {
  return (
    <button type={type} className={`btn ${variant ?? ''} ${small ? 'small' : ''}`} onClick={onClick} disabled={disabled} aria-label={label} style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
      {children}
    </button>
  )
}

export function Stat({ label, value, trend, icon, up = true }: { label: string; value: string; trend: string; icon: string; up?: boolean }) {
  return (
    <article className="card stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon" aria-hidden="true">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        <span className={up ? 'up' : 'down'}>{trend}</span>
      </div>
    </article>
  )
}

export function Panel({ title, sub, right, children, className = '' }: { title?: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card panel ${className}`}>
      {(title || right) && (
        <div className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div className="panel-sub">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function Notice({ tone, mark = 'i', children }: { tone?: 'warning' | 'success' | 'error'; mark?: string; children: ReactNode }) {
  return (
    <div className={`notice ${tone ?? ''}`} role={tone === 'error' ? 'alert' : undefined}>
      <span>{mark}</span>
      <span>{children}</span>
    </div>
  )
}

export function SettingRow({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="setting-row">
      <span>
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      {right}
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t} type="button" role="tab" aria-selected={value === t} className={`tab ${value === t ? 'active' : ''}`} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  )
}

type FieldProps = {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  error?: string
  options?: readonly (string | { value: string; label: string })[]
  multiline?: boolean
  hint?: string
}
export function Field({ label, value, onChange, type = 'text', placeholder, error, options, multiline, hint }: FieldProps) {
  const id = useId()
  const common = { id, value, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-e` : undefined }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {options ? (
        <select {...common} onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
          {options.map((o) => (typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      ) : multiline ? (
        <textarea {...common} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type={type} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <div className="panel-sub">{hint}</div>}
      {error && (
        <div id={`${id}-e`} className="field-error">
          {error}
        </div>
      )}
    </div>
  )
}

export function AvatarTile({ text, size }: { text: string; size?: number }) {
  return (
    <span className="avatar-tile" style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      {text}
    </span>
  )
}

// ---- data table ------------------------------------------------------------------------------

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Makes the header clickable; return the comparison of two rows. */
  sort?: (a: T, b: T) => number
}

export function DataTable<T>({
  title, rows, rowKey, columns, searchText, searchLabel, tools, actions, pageSize = 8, bulk, empty = 'No records match your search.',
}: {
  title: string
  rows: T[]
  rowKey: (r: T) => string
  columns: Column<T>[]
  searchText: (r: T) => string
  searchLabel: string
  tools?: ReactNode
  actions?: (r: T) => ReactNode
  pageSize?: number
  bulk?: { label: string; onClick: (ids: string[]) => void }
  empty?: string
}) {
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<string>()
  const [dir, setDir] = useState<1 | -1>(1)
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = needle ? rows.filter((r) => searchText(r).toLowerCase().includes(needle)) : rows
    const col = columns.find((c) => c.key === sortKey)
    if (col?.sort) list = [...list].sort((a, b) => col.sort!(a, b) * dir)
    return list
  }, [rows, q, sortKey, dir, columns, searchText])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages)
  const shown = filtered.slice((current - 1) * pageSize, current * pageSize)
  const allOn = shown.length > 0 && shown.every((r) => picked.has(rowKey(r)))

  const toggleAll = (on: boolean) =>
    setPicked((p) => {
      const next = new Set(p)
      for (const r of shown) {
        if (on) next.add(rowKey(r))
        else next.delete(rowKey(r))
      }
      return next
    })
  const toggleOne = (id: string, on: boolean) =>
    setPicked((p) => {
      const next = new Set(p)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const sortBy = (c: Column<T>) => {
    if (!c.sort) return
    if (sortKey === c.key) setDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(c.key)
      setDir(1)
    }
    setPage(1)
  }

  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1
  const to = Math.min(current * pageSize, filtered.length)
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - current) <= 1)

  return (
    <section className="card table-card">
      <div className="table-head">
        <h2>{title}</h2>
        <div className="table-tools">
          <input
            className="table-search"
            placeholder={`${searchLabel}...`}
            aria-label={searchLabel}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />
          {tools}
          {bulk && (
            <Btn small disabled={picked.size === 0} onClick={() => bulk.onClick([...picked])}>
              {picked.size ? `${bulk.label} (${picked.size})` : bulk.label}
            </Btn>
          )}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input className="table-check" type="checkbox" aria-label="Select all rows on this page" checked={allOn} onChange={(e) => toggleAll(e.target.checked)} />
              </th>
              {columns.map((c) => (
                <th key={c.key} aria-sort={sortKey === c.key ? (dir === 1 ? 'ascending' : 'descending') : undefined}>
                  {c.sort ? (
                    <button type="button" onClick={() => sortBy(c)}>
                      {c.header} <span aria-hidden="true">{sortKey === c.key ? (dir === 1 ? '↑' : '↓') : '↕'}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              {actions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={rowKey(r)}>
                <td>
                  <input className="table-check" type="checkbox" aria-label="Select row" checked={picked.has(rowKey(r))} onChange={(e) => toggleOne(rowKey(r), e.target.checked)} />
                </td>
                {columns.map((c) => (
                  <td key={c.key}>{c.render(r)}</td>
                ))}
                {actions && <td>{actions(r)}</td>}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>{`Showing ${from}–${to} of ${filtered.length} records`}</span>
        <div className="pagination">
          <button type="button" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)}>‹</button>
          {nums.map((n, i) => (
            <span key={n} style={{ display: 'contents' }}>
              {i > 0 && n - nums[i - 1]! > 1 && <span style={{ padding: '0 2px' }}>…</span>}
              <button type="button" className={n === current ? 'current' : ''} aria-current={n === current ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
            </span>
          ))}
          <button type="button" aria-label="Next page" disabled={current === pages} onClick={() => setPage(current + 1)}>›</button>
        </div>
      </div>
    </section>
  )
}

/** Downloads rows as a CSV file in the browser. */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
