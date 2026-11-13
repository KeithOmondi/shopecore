/**
 * The admin's one way of talking to the ShopCore server.
 *
 *  - The access token lives only in memory. The refresh token is an httpOnly cookie the server sets, so page scripts never see it
 *    and a stolen access token stops working in minutes.
 *  - A 401 triggers exactly one refresh (shared by every request that fails at the same time, because the server treats a
 *    refresh token used twice as theft). If that fails the person is signed out.
 *  - `X-Client: web` tells the server this is the admin, which is what lets it use the cookie.
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export interface ApiMe {
  id: string
  name: string
  email: string
  phone: string
  role: string
  status: 'invited' | 'active' | 'suspended'
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  version: number
  permissions: Record<string, boolean[]>
}
interface Tokens { accessToken: string; mustChangePassword: boolean; staff: ApiMe }

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
let accessToken: string | null = null
let refreshing: Promise<Tokens | null> | null = null
let onSignedOut: (() => void) | null = null

/** Called when the session can't be kept alive (the person must sign in again). */
export const setSignedOutHandler = (fn: (() => void) | null) => { onSignedOut = fn }

async function send(method: string, path: string, body: unknown, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { 'x-client': 'web' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  try {
    return await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Can’t reach the server. Check your connection and try again.')
  }
}

async function failure(res: Response): Promise<ApiError> {
  let code = 'ERROR'
  let message = `Something went wrong (${res.status}).`
  let details: unknown
  try {
    const j = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } }
    if (j.error) { code = j.error.code ?? code; message = j.error.message ?? message; details = j.error.details }
  } catch { /* not JSON: keep the generic message */ }
  if (res.status === 429) message = 'Too many attempts. Wait a moment and try again.'
  return new ApiError(res.status, code, message, details)
}

/** Trades the cookie for a fresh access token. One at a time. */
function refresh(): Promise<Tokens | null> {
  refreshing ??= (async () => {
    try {
      const res = await send('POST', '/v1/auth/refresh', {}, null)
      if (!res.ok) return null
      const t = (await res.json()) as Tokens
      accessToken = t.accessToken
      return t
    } catch {
      return null
    } finally {
      setTimeout(() => { refreshing = null }, 0)
    }
  })()
  return refreshing
}

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body, accessToken)
  if (res.status === 401 && !path.startsWith('/v1/auth/')) {
    const t = await refresh()
    if (!t) { accessToken = null; onSignedOut?.(); throw new ApiError(401, 'SIGNED_OUT', 'Your session has ended. Please sign in again.') }
    res = await send(method, path, body, accessToken)
  }
  if (res.status === 204) return undefined as T
  if (!res.ok) throw await failure(res)
  return (await res.json()) as T
}
export const get = <T = unknown>(path: string) => api<T>('GET', path)
export const post = <T = unknown>(path: string, body?: unknown) => api<T>('POST', path, body ?? {})
export const patch = <T = unknown>(path: string, body: unknown) => api<T>('PATCH', path, body)
export const put = <T = unknown>(path: string, body: unknown) => api<T>('PUT', path, body)
export const del = <T = unknown>(path: string) => api<T>('DELETE', path)

export async function signIn(email: string, password: string): Promise<{ me: ApiMe; mustChange: boolean }> {
  const res = await send('POST', '/v1/auth/login', { email: email.trim().toLowerCase(), password }, null)
  if (!res.ok) throw await failure(res)
  const t = (await res.json()) as Tokens
  accessToken = t.accessToken
  return { me: t.staff, mustChange: t.mustChangePassword }
}

/** On page load: is there a live session cookie? */
export async function restoreSession(): Promise<{ me: ApiMe; mustChange: boolean } | null> {
  const t = await refresh()
  return t ? { me: t.staff, mustChange: t.mustChangePassword } : null
}

export async function signOut(): Promise<void> {
  try { if (accessToken) await send('POST', '/v1/auth/logout', undefined, accessToken) } catch { /* the cookie is cleared by the server; nothing more to do */ }
  accessToken = null
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await send('POST', '/v1/auth/change-password', { currentPassword, newPassword }, accessToken)
  if (!res.ok) throw await failure(res)
  const t = (await res.json()) as Partial<Tokens>
  if (t.accessToken) accessToken = t.accessToken
}
