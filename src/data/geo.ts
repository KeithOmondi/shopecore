/** The dispatch map is a flat image: lat 0–75 (bottom to top), lng 0–100 (left to right). */
export interface Pt {
  lat: number
  lng: number
}

export const AREA_POS: Record<string, Pt> = {
  Westlands: { lat: 58, lng: 24 }, Parklands: { lat: 63, lng: 38 }, Kilimani: { lat: 34, lng: 58 }, Lavington: { lat: 28, lng: 38 }, Karen: { lat: 12, lng: 22 },
  CBD: { lat: 48, lng: 56 }, 'South B': { lat: 26, lng: 76 }, Eastleigh: { lat: 55, lng: 80 }, Kileleshwa: { lat: 42, lng: 40 }, 'Ngong Road': { lat: 30, lng: 28 },
  Runda: { lat: 70, lng: 50 }, 'Lang’ata': { lat: 14, lng: 50 }, Embakasi: { lat: 20, lng: 88 }, 'Thika Road': { lat: 66, lng: 70 }, Ruaka: { lat: 68, lng: 18 },
  'Upper Hill': { lat: 38, lng: 50 }, Hurlingham: { lat: 40, lng: 45 }, Ngara: { lat: 55, lng: 62 }, Ruiru: { lat: 70, lng: 90 },
}

export const posOf = (area: string): Pt => AREA_POS[area] ?? { lat: 40, lng: 50 }

/** Rough distance in km between two map points (the map spans about 12 km across). */
export const distKm = (a: Pt, b: Pt) => Math.round(Math.hypot(a.lat - b.lat, a.lng - b.lng) * 0.12 * 10) / 10

export const STORES = ['Urban Bites', 'FreshMart', 'Green Basket', 'QuickCart', 'Blue Basket']

const ZONE_OF: Record<string, string> = {
  Westlands: 'Westlands', Parklands: 'Westlands', Ruaka: 'Westlands', Kilimani: 'Kilimani', Kileleshwa: 'Kilimani', Hurlingham: 'Kilimani', 'Upper Hill': 'Kilimani', Lavington: 'Kilimani',
  CBD: 'CBD', Ngara: 'CBD', Eastleigh: 'CBD', Karen: 'Karen', 'Lang’ata': 'Karen', 'Ngong Road': 'Karen', Ruiru: 'Ruiru',
}
/** The delivery zone an area belongs to. */
export const zoneOf = (area: string) => ZONE_OF[area] ?? 'Greater Nairobi'
