import { distKm, posOf } from '../data/geo'
import type { Order, Rider } from '../data/commerce'

export const MAX_LOAD = 3

/** Orders a rider is carrying right now. */
export const riderLoad = (orders: Order[], riderId: string) => orders.filter((o) => o.riderId === riderId && (o.status === 'Processing' || o.status === 'Out for delivery')).length

export type RiderLive = 'Online' | 'Busy' | 'Offline' | 'Suspended'

/** What dispatch sees: an online rider with two or more orders is Busy. */
export function liveStatus(r: Rider, load: number): RiderLive {
  if (r.status === 'Suspended') return 'Suspended'
  if (r.status === 'Offline') return 'Offline'
  return load >= 2 ? 'Busy' : 'Online'
}

export const isUnassigned = (o: Order) => o.riderId === null && (o.status === 'Pending' || o.status === 'Processing')

export const pickupArea = (o: Order) => o.pickup.split(', ')[1] ?? o.area

export interface Candidate {
  rider: Rider
  km: number
  load: number
  live: RiderLive
  /** Higher is better: close, lightly loaded, well rated. */
  score: number
}

/** Riders who could take the order, best match first. Offline, suspended and full riders are left out. */
export function rankRiders(order: Order, riders: Rider[], orders: Order[], sort: 'Recommended match' | 'Distance' | 'Rating' = 'Recommended match'): Candidate[] {
  const from = posOf(pickupArea(order))
  const list = riders
    .filter((r) => r.status === 'Online')
    .map((rider) => {
      const load = riderLoad(orders, rider.id)
      const km = distKm(rider.at, from)
      return { rider, km, load, live: liveStatus(rider, load), score: 100 - km * 8 - load * 14 + (rider.rating - 4) * 10 }
    })
    .filter((c) => c.load < MAX_LOAD && c.rider.id !== order.riderId)
  const by = { 'Recommended match': (a: Candidate, b: Candidate) => b.score - a.score, Distance: (a: Candidate, b: Candidate) => a.km - b.km, Rating: (a: Candidate, b: Candidate) => b.rider.rating - a.rider.rating }[sort]
  return list.sort(by)
}

/** Assigns every unassigned order to the best available rider, keeping loads under the limit. */
export function autoAssign(orders: Order[], riders: Rider[]): { assignments: Record<string, string>; skipped: string[] } {
  const working = orders.map((o) => ({ ...o }))
  const assignments: Record<string, string> = {}
  const skipped: string[] = []
  for (const o of working.filter(isUnassigned).sort((a, b) => a.placedAt - b.placedAt)) {
    const best = rankRiders(o, riders, working)[0]
    if (!best) {
      skipped.push(o.id)
      continue
    }
    o.riderId = best.rider.id
    o.status = 'Processing'
    assignments[o.id] = best.rider.id
  }
  return { assignments, skipped }
}

export const minutesSince = (ms: number, now: number) => Math.max(0, Math.round((now - ms) / 60_000))

export const shortRoute = (o: Order) => `${pickupArea(o)} → ${o.area}`
