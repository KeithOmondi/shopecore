import type { Pt } from './geo'

const MIN = 60_000
const DAY = 86_400_000

// ---- exceptions (cancelled and failed deliveries) -------------------------------------------------------

export interface Failure {
  id: string
  orderId: string
  customer: string
  rider: string
  reason: string
  zone: string
  kind: 'Cancelled' | 'Failed'
  at: number
  resolved: boolean
  note?: string
}

export const FAILURE_REASONS = ['Customer unavailable', 'Item damaged', 'Store closed', 'Incorrect address', 'Customer refused', 'Rider unreachable'] as const

export const seedFailures = (): Failure[] => {
  const now = Date.now()
  const f = (orderId: string, customer: string, rider: string, reason: string, zone: string, kind: Failure['kind'], ago: number): Failure => ({ id: `F-${orderId}`, orderId, customer, rider, reason, zone, kind, at: now - ago, resolved: false })
  return [
    f('SC-4801', 'Mary Atieno', 'James Mutua', 'Customer unavailable', 'Kilimani', 'Cancelled', 28 * MIN),
    f('SC-4782', 'Paul Mwangi', 'Brian Otieno', 'Item damaged', 'CBD', 'Failed', 62 * MIN),
    f('SC-4768', 'Faith Njeri', 'David Kariuki', 'Store closed', 'Westlands', 'Cancelled', DAY + 3 * 3_600_000),
    f('SC-4731', 'Nia Wanjiku', 'Grace Wambui', 'Incorrect address', 'Parklands', 'Failed', DAY + 6 * 3_600_000),
    f('SC-4704', 'Kevin Otieno', 'Miriam Kilonzo', 'Customer refused', 'Lavington', 'Cancelled', 2 * DAY + 4 * 3_600_000),
  ]
}

// ---- incidents and SOS ----------------------------------------------------------------------------------------

export type Severity = 'Critical' | 'High' | 'Medium'
export type IncidentStatus = 'Open' | 'Investigating' | 'Resolved'

export interface Incident {
  id: string
  riderId: string
  rider: string
  type: string
  zone: string
  at: number
  severity: Severity
  status: IncidentStatus
  pos: Pt
  sos: boolean
  log: { at: number; by: string; text: string }[]
}

export const INCIDENT_TYPES = ['Road accident', 'Vehicle issue', 'Customer conflict', 'Medical assistance', 'Theft or robbery', 'Other'] as const

export const seedIncidents = (): Incident[] => {
  const now = Date.now()
  const mk = (id: string, riderId: string, rider: string, type: string, zone: string, ago: number, severity: Severity, status: IncidentStatus, pos: Pt, sos: boolean): Incident => ({
    id, riderId, rider, type, zone, at: now - ago, severity, status, pos, sos,
    log: [{ at: now - ago, by: sos ? 'Rider app (SOS)' : rider, text: `${type} reported` }],
  })
  return [
    mk('SOS-281', 'r1', 'James Mutua', 'Road accident', 'Westlands', 18 * MIN, 'Critical', 'Open', { lat: 57, lng: 23 }, true),
    mk('INC-278', 'r2', 'Grace Wambui', 'Vehicle issue', 'Kilimani', 90 * MIN, 'High', 'Investigating', { lat: 38, lng: 60 }, false),
    mk('INC-272', 'r5', 'Brian Otieno', 'Customer conflict', 'CBD', DAY + 2 * 3_600_000, 'Medium', 'Resolved', { lat: 48, lng: 55 }, false),
    mk('SOS-269', 'r6', 'Miriam Kilonzo', 'Medical assistance', 'Parklands', DAY + 5 * 3_600_000, 'Critical', 'Resolved', { lat: 62, lng: 38 }, true),
  ]
}

// ---- shifts ------------------------------------------------------------------------------------------------------------

export interface Shift {
  id: string
  riderId: string
  /** Whole days from the start of this week (0 = Monday). */
  day: number
  /** 0 = week of today, 1 = next week, -1 = last week. */
  week: number
  zone: string
  window: string
}

export const SHIFT_WINDOWS = ['6 AM – 2 PM', '10 AM – 6 PM', '2 PM – 10 PM', '4 PM – 7 PM (peak)'] as const

export const seedShifts = (riderIds: string[], zones: string[]): Shift[] => {
  const out: Shift[] = []
  for (const week of [-1, 0, 1]) {
    riderIds.slice(0, 12).forEach((riderId, i) => {
      for (let day = 0; day < 6; day++) {
        if ((i + day + (week + 1)) % 3 === 0) continue
        out.push({ id: `sh-${week}-${riderId}-${day}`, riderId, day, week, zone: zones[(i + day) % zones.length]!, window: SHIFT_WINDOWS[(i + day) % 3]! })
      }
    })
  }
  return out
}
