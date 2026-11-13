import { useState } from 'react'

import { EmptyState, ErrorState, MaintenanceScreen, OfflineBanner, PermissionDenied, SearchEmpty, Skeleton, SkeletonRows } from '../components/states'
import { Badge, Btn, DataTable, Notice, PageHead, Panel, Tabs, type Column } from '../components/ui'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { useDirty, useUnsavedGuard } from '../lib/unsaved'

const TABS = ['Loading', 'Empty', 'No results', 'Error', 'Offline', 'Unsaved changes', 'Delete', 'Bulk action', 'Toasts', 'No permission', 'Maintenance'] as const
type Tab = (typeof TABS)[number]

interface Demo { id: string; name: string; status: string; total: string }
const ROWS: Demo[] = [
  { id: 'SC-48291', name: 'Wanjiku Njoroge', status: 'Ready', total: 'KES 4,820' },
  { id: 'SC-48288', name: 'Brian Otieno', status: 'Processing', total: 'KES 2,140' },
  { id: 'SC-48281', name: 'Amina Hassan', status: 'Delivered', total: 'KES 8,600' },
  { id: 'SC-48275', name: 'Peter Kamau', status: 'Pending', total: 'KES 1,250' },
]
const cols: Column<Demo>[] = [
  { key: 'id', header: 'Order', render: (r) => <b>{r.id}</b> },
  { key: 'n', header: 'Customer', render: (r) => r.name },
  { key: 't', header: 'Total', render: (r) => r.total },
  { key: 's', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
]

function UnsavedDemo() {
  const [note, setNote] = useState('Call on arrival. Use the side entrance.')
  const dirty = useDirty(note)
  useUnsavedGuard(dirty)
  return (
    <Panel title="Edit delivery note" sub="Type something, then try to leave this page.">
      <textarea className="sp-text" aria-label="Delivery note" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="panel-sub" style={{ margin: '8px 0' }}>{dirty ? 'You have unsaved changes. Leaving asks first, and closing or refreshing the tab does too.' : 'No changes yet.'}</p>
      <div className="sp-row"><Btn onClick={() => navigate('/health')}>Leave to System health</Btn><Btn variant="primary" onClick={() => setNote(note + ' ')}>Make a change</Btn></div>
    </Panel>
  )
}

/** A living reference of how every system state looks and behaves. The real pages use the same pieces. */
export default function SystemStates() {
  const { openModal, toast, offline, setForceOffline, maintenance, requestAccess, requestedAccess, role } = useStore()
  const [tab, setTab] = useState<Tab>('Loading')
  const [q, setQ] = useState('SC-00000')
  const [retries, setRetries] = useState(0)

  return (
    <>
      <PageHead title="System states" desc="How loading, empty, error, offline, restricted and maintenance states look and behave across the admin." />
      <section className="card" style={{ marginBottom: 14 }}><Tabs tabs={TABS} value={tab} onChange={setTab} /></section>

      {tab === 'Loading' && (
        <section className="card table-card">
          <div className="table-head"><h2>Orders</h2><div className="table-tools"><Skeleton w={200} h={30} /><Skeleton w={90} h={30} /></div></div>
          <div className="table-wrap"><table aria-label="Orders loading"><thead><tr><th><Skeleton w={14} h={14} /></th><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody><SkeletonRows cols={5} rows={5} /></tbody></table></div>
          <div className="table-foot"><span>Loading…</span></div>
        </section>
      )}
      {tab === 'Empty' && <section className="card table-card"><EmptyState title="No orders yet" hint="New orders from the ShopCore customer app will appear here. You can create a test order to preview the workflow." action={{ label: 'Create your first order', onClick: () => toast('Create order opened') }} /></section>}
      {tab === 'No results' && (
        <section className="card table-card">
          <div className="table-head"><h2>Orders</h2><div className="table-tools"><input className="table-search" aria-label="Search orders" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
          {q.trim() ? <SearchEmpty query={q.trim()} onClear={() => setQ('')} /> : <DataTable title="Orders" rows={ROWS} rowKey={(r) => r.id} columns={cols} searchLabel="Search orders" searchText={(r) => `${r.id} ${r.name}`} />}
        </section>
      )}
      {tab === 'Error' && <section className="card"><ErrorState title="We couldn’t load your orders" message={retries ? 'Still unable to reach the server. Please try again shortly.' : 'Something went wrong while requesting the latest order data. Your changes have not been affected.'} onRetry={() => { setRetries(retries + 1); toast('Still unable to reach the server. Please try again shortly.', 'error') }} code={`Error code: ORDERS_FETCH_FAILED · Request ID: sc-7f92b1${retries ? ` · Attempts: ${retries}` : ''}`} /></section>}
      {tab === 'Offline' && (
        <>
          {offline && <OfflineBanner onRetry={() => { setForceOffline(false); toast('Back online') }} />}
          <Panel title="Connection lost" sub="The same banner shows at the top of every page when the browser goes offline.">
            <div className="sp-row"><Btn variant="primary" onClick={() => { setForceOffline(!offline); toast(offline ? 'Back online' : 'Offline preview on. Look at the top of the page.') }}>{offline ? 'Go back online' : 'Preview going offline'}</Btn><Badge tone={offline ? 'amber' : 'green'}>{offline ? 'Offline' : 'Online'}</Badge></div>
            <p className="panel-sub" style={{ marginTop: 10 }}>It also appears by itself if your connection really drops.</p>
          </Panel>
        </>
      )}
      {tab === 'Unsaved changes' && <UnsavedDemo />}
      {tab === 'Delete' && (
        <Panel title="Delete confirmation" sub="Permanent actions always ask first, and say it can’t be undone.">
          <Btn variant="danger" onClick={() => openModal({ title: 'Delete 2 products?', message: 'This permanently removes the selected products from your catalogue. This can’t be undone.', confirm: 'Delete products', danger: true, onConfirm: () => toast('Selected products deleted') })}>Delete selected</Btn>
        </Panel>
      )}
      {tab === 'Bulk action' && (
        <>
          <div className="banner info" role="status"><strong>Select orders in the table</strong><span>Bulk changes apply to every selected order and always ask first.</span></div>
          <DataTable title="Orders" rows={ROWS} rowKey={(r) => r.id} columns={cols} searchLabel="Search orders" searchText={(r) => `${r.id} ${r.name}`} bulk={{ label: 'Update status', onClick: (ids) => openModal({ title: `Update ${ids.length} selected order${ids.length === 1 ? '' : 's'}?`, message: 'They move to “Ready for rider”. Customers and riders may get status updates.', confirm: 'Confirm update', onConfirm: () => toast(`${ids.length} order${ids.length === 1 ? '' : 's'} updated`) }) }} />
        </>
      )}
      {tab === 'Toasts' && (
        <div className="sp-two">
          <div className="sp-stack">
            <article className="card toast-card"><span className="toast-mark success" aria-hidden="true">✓</span><div><h3>Changes saved</h3><p>Confirm completed actions in a sentence.</p></div></article>
            <article className="card toast-card"><span className="toast-mark error" aria-hidden="true">!</span><div><h3>Couldn’t save changes</h3><p>Say what went wrong and what to do next.</p></div></article>
          </div>
          <Panel title="Try them" sub="They appear bottom right and are announced to screen readers.">
            <div className="sp-row"><Btn onClick={() => toast('Changes saved successfully', 'success')}>Show success toast</Btn><Btn onClick={() => toast('Couldn’t save changes. Check your connection.', 'error')}>Show error toast</Btn></div>
          </Panel>
        </div>
      )}
      {tab === 'No permission' && (
        <Panel title="Refund approval limits" sub="Permissions for financial actions" right={<Badge tone="red">Restricted</Badge>}>
          <PermissionDenied title="You don’t have permission to edit refund limits" body="This setting is restricted to finance staff. Ask your workspace owner for access." yourRole={role} requiredRole="Finance analyst or Owner admin" onRequest={() => requestAccess('Refund limits')} requested={requestedAccess.includes('Refund limits')} />
        </Panel>
      )}
      {tab === 'Maintenance' && (
        <>
          <MaintenanceScreen message={maintenance.message} etaMinutes={maintenance.etaMinutes} actions={<Btn onClick={() => navigate('/health')}>Turn it on or off in System health</Btn>} />
          {maintenance.on && <Notice tone="warning" mark="!">Maintenance mode is on right now. Everyone except owners and IT support sees this screen.</Notice>}
        </>
      )}
    </>
  )
}
