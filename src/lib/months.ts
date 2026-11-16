/** Small helpers for "YYYY-MM" month keys. */
export const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7)

export const shiftMonth = (key: string, by: number) => {
  const [y, m] = key.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export const monthLabel = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
