import type { ReactNode } from 'react'

import { monthKey, monthLabel, shiftMonth } from '../data/finance'

/** A row of stat tiles that wraps nicely at any count. */
export const Stats = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 14 }}>{children}</div>
)

export function Steps({ steps }: { steps: { label: string; done: boolean }[] }) {
  return (
    <ol className="fin-steps" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.label} className={s.done ? 'done' : ''}><b>{s.done ? '✓' : i + 1}</b>{s.label}</li>
      ))}
    </ol>
  )
}

export function Bars({ values, labels, tone }: { values: number[]; labels: string[]; tone?: 'red' }) {
  const top = Math.max(1, ...values.map(Math.abs))
  return (
    <>
      <div className="sp-bars" role="img" aria-label="Bar chart">
        {values.map((v, i) => (
          <div className="sp-bar-group" key={i} title={`${labels[i]}: ${Math.round(v).toLocaleString('en-US')}`}>
            <div className="sp-bar on" style={{ height: `${Math.max(2, (Math.abs(v) / top) * 100)}%`, background: v < 0 || tone === 'red' ? 'var(--red)' : undefined }} />
          </div>
        ))}
      </div>
      <div className="chart-labels"><span>{labels[0]}</span><span>{labels[Math.floor(labels.length / 2)]}</span><span>{labels[labels.length - 1]}</span></div>
    </>
  )
}

/** The months to choose from: this one and the previous `back`. */
export const monthOptions = (now: number, back = 5) => Array.from({ length: back + 1 }, (_, i) => shiftMonth(monthKey(now), -i))

export function MonthSelect({ value, onChange, now, back = 5, label = 'Month' }: { value: string; onChange: (m: string) => void; now: number; back?: number; label?: string }) {
  return (
    <select className="sp-select auto" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {monthOptions(now, back).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
    </select>
  )
}

/** Saves rows as CSV, or as a sheet Excel opens (the backend will add true .xlsx and PDF). */
export function saveRows(name: string, header: string[], rows: (string | number)[][], format: 'CSV' | 'Excel') {
  if (format === 'CSV') {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    return save(`${name}.csv`, [header, ...rows].map((r) => r.map(esc).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }
  const cell = (tag: string, v: string | number) => `<${tag}>${String(v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</${tag}>`
  const html = `<html><head><meta charset="utf-8"></head><body><table><tr>${header.map((h) => cell('th', h)).join('')}</tr>${rows.map((r) => `<tr>${r.map((v) => cell('td', v)).join('')}</tr>`).join('')}</table></body></html>`
  save(`${name}.xls`, html, 'application/vnd.ms-excel')
}
function save(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
