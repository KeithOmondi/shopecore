export const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-US')}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function clock(ms: number) {
  const d = new Date(ms)
  const h = d.getHours()
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** "Today, 9:12 AM", "Yesterday, 5:22 PM" or "20 Oct, 4:12 PM" */
export function dateTime(ms: number) {
  const d = new Date(ms)
  const now = new Date()
  const day = sameDay(d, now) ? 'Today' : sameDay(d, new Date(now.getTime() - 86_400_000)) ? 'Yesterday' : `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return `${day}, ${clock(ms)}`
}

export const shortDate = (ms: number) => {
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const dayKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA')

export const pct = (n: number, d: number) => (d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`)
