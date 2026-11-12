import { useEffect, type ReactNode } from 'react'

import { Drawer, Modal, Sidebar, Toast, Topbar } from './components/Shell'
import { Btn, Notice, PageHead } from './components/ui'
import { canOpen, navigate, pageFor, usePath } from './lib/router'
import { StoreProvider, useStore } from './lib/store'
import { AuditLog, Roles } from './pages/Access'
import { CustomerDetail, CustomersList } from './pages/Customers'
import Overview from './pages/Overview'
import { BusinessSettings, DeliverySettings, PaymentSettings } from './pages/Settings'
import { StaffForm, StaffList } from './pages/Staff'
import Account from './pages/Account'
import { AssignRider, DelayedOrders, DispatchOverview, LiveOrder, OrderQueue, ReassignOrder } from './pages/Dispatch'
import { FailedDeliveries, Incidents } from './pages/Exceptions'
import { DeliveryZones, ShiftPlanner } from './pages/Operations'
import { Payments, Payouts } from './pages/Finance'
import FirstSignIn from './pages/FirstSignIn'
import Login from './pages/Login'
import { NewOrder, OrderDetail, OrdersList } from './pages/Orders'
import { Inventory, ProductForm, ProductsList } from './pages/Products'
import Reports from './pages/Reports'
import { Applications, RiderDetail, RidersList } from './pages/Riders'
import { Health, Integrations, Templates } from './pages/System'

function NotFound() {
  return (
    <>
      <PageHead title="Page not found" desc="That page doesn’t exist." actions={<Btn onClick={() => navigate('/')}>Go to overview</Btn>} />
      <Notice tone="warning" mark="!">Check the address, or use the menu on the left.</Notice>
    </>
  )
}

function NoAccess({ role }: { role: string }) {
  return (
    <>
      <PageHead title="No access" desc={`The ${role} role can’t open this page.`} actions={<Btn onClick={() => navigate('/')}>Go to overview</Btn>} />
      <Notice tone="warning" mark="!">Ask a workspace owner to change your role, or switch role from the badge in the top bar.</Notice>
    </>
  )
}

function route(path: string): ReactNode {
  if (path === '/') return <Overview />
  if (path === '/staff') return <StaffList />
  if (path === '/staff/new') return <StaffForm key="new" />
  if (path.startsWith('/staff/')) return <StaffForm key={path} id={path.slice(7)} />
  if (path === '/customers') return <CustomersList />
  if (path.startsWith('/customers/')) return <CustomerDetail key={path} id={path.slice(11)} />
  if (path === '/roles') return <Roles />
  if (path === '/audit') return <AuditLog />
  if (path === '/settings/business') return <BusinessSettings />
  if (path === '/settings/payments') return <PaymentSettings />
  if (path === '/settings/delivery') return <DeliverySettings />
  if (path === '/templates') return <Templates />
  if (path === '/integrations') return <Integrations />
  if (path === '/health') return <Health />
  if (path === '/orders') return <OrdersList />
  if (path === '/orders/new') return <NewOrder />
  if (path.startsWith('/orders/')) return <OrderDetail key={path} id={path.slice(8)} />
  if (path === '/products') return <ProductsList />
  if (path === '/products/new') return <ProductForm key="new" />
  if (path.startsWith('/products/')) return <ProductForm key={path} id={path.slice(10)} />
  if (path === '/inventory') return <Inventory />
  if (path === '/riders') return <RidersList />
  if (path === '/riders/applications') return <Applications />
  if (path.startsWith('/riders/applications/')) return <Applications key={path} id={path.slice(21)} />
  if (path === '/dispatch') return <DispatchOverview />
  if (path === '/dispatch/queue') return <OrderQueue />
  if (path === '/dispatch/alerts') return <DelayedOrders />
  if (path === '/dispatch/assign' || path.startsWith('/dispatch/assign/')) return <AssignRider key={path} id={path.slice(17) || undefined} />
  if (path === '/dispatch/live' || path.startsWith('/dispatch/live/')) return <LiveOrder key={path} id={path.slice(15) || undefined} />
  if (path === '/dispatch/reassign' || path.startsWith('/dispatch/reassign/')) return <ReassignOrder key={path} id={path.slice(19) || undefined} />
  if (path === '/zones') return <DeliveryZones />
  if (path === '/shifts') return <ShiftPlanner />
  if (path === '/exceptions') return <FailedDeliveries />
  if (path === '/incidents') return <Incidents />
  if (path.startsWith('/riders/')) return <RiderDetail key={path} id={path.slice(8)} />
  if (path === '/payments') return <Payments />
  if (path === '/payouts') return <Payouts />
  if (path === '/reports') return <Reports />
  if (path === '/account') return <Account />
  return <NotFound />
}

function Shell() {
  const { collapsed, role, permissions, user } = useStore()
  const path = usePath()
  const page = pageFor(path)

  useEffect(() => {
    document.title = `${page?.label ?? (path === '/account' ? 'My account' : 'Not found')} · ShopCore Admin`
    window.scrollTo({ top: 0 })
  }, [page, path])

  const blocked = page && !canOpen(role, page.label, permissions[role])

  if (!user) return (
    <>
      <Login />
      <Toast />
    </>
  )

  if (user.mustChange) return (
    <>
      <FirstSignIn />
      <Toast />
    </>
  )

  return (
    <div className={`app ${collapsed ? 'collapse' : ''}`}>
      <Sidebar />
      <main className="main">
        <Topbar />
        <section className="content" aria-live="polite">{blocked ? <NoAccess role={role} /> : route(path)}</section>
      </main>
      <Drawer />
      <Modal />
      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
