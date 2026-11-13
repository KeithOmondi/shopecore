import { Component, type ErrorInfo, type ReactNode } from 'react'

/** The shared system states: loading, empty, errors, restricted access and maintenance. */

export const Skeleton = ({ w = 80, h = 9, round = false }: { w?: number | string; h?: number; round?: boolean }) => (
  <span className="skeleton" aria-hidden="true" style={{ display: 'block', width: w, height: h, borderRadius: round ? 99 : undefined }} />
)

/** Rows that keep the layout of the real table while data arrives. */
export function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>{c === 0 ? <Skeleton w={14} h={14} /> : <Skeleton w={c === 1 ? 88 + (r % 3) * 16 : 54 + ((r + c) % 3) * 22} />}</td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function EmptyState({ icon = '□', title, hint, action }: { icon?: string; title: string; hint?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="table-empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
      {action && <button type="button" className="btn primary" onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}

export function SearchEmpty({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="search-empty" role="status">
      <div className="search-icon" aria-hidden="true">⌕</div>
      <h2>No results for “{query}”</h2>
      <p className="panel-sub">Check the spelling, or try a broader search such as a name, ID or phone number.</p>
      <div style={{ marginTop: 16 }}><button type="button" className="btn primary" onClick={onClear}>Clear search</button></div>
    </div>
  )
}

export function ErrorState({ title = 'We couldn’t load this', message = 'Something went wrong while getting the latest data. Nothing you did has been lost.', onRetry, code }: { title?: string; message?: string; onRetry?: () => void; code?: string }) {
  return (
    <div className="error-panel" role="alert">
      <div className="error-icon" aria-hidden="true">!</div>
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && <button type="button" className="btn primary" onClick={onRetry}>Try again</button>}
      {code && <div className="error-code">{code}</div>}
    </div>
  )
}

export function PermissionDenied({ title, body, requiredRole, yourRole, onRequest, requested }: { title: string; body: string; requiredRole?: string; yourRole?: string; onRequest?: () => void; requested?: boolean }) {
  return (
    <>
      <div className="permission-box" role="alert">
        <div className="permission-symbol" aria-hidden="true">⊘</div>
        <div>
          <h3>{title}</h3>
          <p>{body}</p>
          {onRequest && <button type="button" className="btn small" disabled={requested} onClick={onRequest}>{requested ? 'Request sent' : 'Request access'}</button>}
        </div>
      </div>
      {(yourRole || requiredRole) && <div className="permission-note"><span aria-hidden="true">i</span><span>{yourRole && `Your role: ${yourRole}`}{yourRole && requiredRole && ' · '}{requiredRole && `Needed: ${requiredRole}`}</span></div>}
    </>
  )
}

export function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="banner" role="status">
      <strong>Connection lost</strong>
      <span>You’re offline. What you see may be out of date, and changes won’t sync until you reconnect.</span>
      <button type="button" className="btn small" style={{ marginLeft: 'auto' }} onClick={onRetry}>Try again</button>
    </div>
  )
}

export function MaintenanceScreen({ message, etaMinutes, actions }: { message?: string; etaMinutes?: number | null; actions?: ReactNode }) {
  return (
    <div className="maintenance card" role="status">
      <div className="maintenance-mark" aria-hidden="true">◷</div>
      <h2>We’ll be back shortly</h2>
      <p>{message || 'ShopCore Admin is undergoing scheduled maintenance. Your customer storefront and rider app stay available while we finish.'}</p>
      <div className="progress-track" aria-hidden="true"><span /></div>
      <div className="maintenance-meta"><span>Maintenance in progress</span><span>{etaMinutes ? `About ${etaMinutes} minutes remaining` : 'We’ll update this soon'}</span></div>
      {actions && <div style={{ marginTop: 22 }}>{actions}</div>}
    </div>
  )
}

/** Catches a page that crashes while drawing, so one broken screen doesn’t take the whole admin down. Give it a `key` that changes with the page so it resets on navigation. */
export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean; id: string }> {
  state = { failed: false, id: '' }
  static getDerivedStateFromError() { return { failed: true, id: Math.random().toString(16).slice(2, 8) } }
  componentDidCatch(err: Error, info: ErrorInfo) { console.warn('Page failed to render', err.message, info.componentStack?.split('\n')[1]?.trim()) }
  render() {
    if (!this.state.failed) return this.props.children
    return <section className="card"><ErrorState title="This page ran into a problem" message="The rest of the admin is fine. Try again, and if it keeps happening, tell IT support the request ID below." onRetry={() => this.setState({ failed: false })} code={`Request ID: sc-${this.state.id}`} /></section>
  }
}
