import { useEffect, type ReactNode } from 'react'

import { Drawer, Modal, Sidebar, Toast, Topbar } from './components/Shell'
import { MaintenanceScreen, OfflineBanner, PageBoundary, PermissionDenied } from './components/states'
import { Btn, Notice, PageHead } from './components/ui'
import { canOpen, displayLabel, navigate, pageFor, rolesWith, usePath } from './lib/router'
import { StoreProvider, useStore } from './lib/store'
import { SupportProvider } from './lib/support'
import { FinanceProvider } from './lib/finance'
import { InventoryProvider } from './lib/inventory'
import { MarketingProvider } from './lib/marketing'
import { AuditLog, Roles } from './pages/Access'
import { CustomerDetail, CustomersList } from './pages/Customers'
import Overview from './pages/Overview'
import { BusinessSettings, DeliverySettings, PaymentSettings } from './pages/Settings'
import { StaffForm, StaffList } from './pages/Staff'
import Account from './pages/Account'
import { AssignRider, DelayedOrders, DispatchOverview, LiveOrder, OrderQueue, ReassignOrder } from './pages/Dispatch'
import { FailedDeliveries, Incidents } from './pages/Exceptions'
import { DeliveryZones, ShiftPlanner } from './pages/Operations'
import { AccountsLedger, FailedPayments, FinanceOverview, PaymentDetail, PaymentsList, ProfitLoss, Reconciliation, RefundsLedger, VatReport } from './pages/FinanceCore'
import { CodDeposit, CodManagement, EarningsStatements, PayoutBatches, RiderPayouts, StoreSettlements } from './pages/FinanceCash'
import { DeliveryCost, ExportCenter, Expenses, FinanceSettingsPage, InvoiceDetail, InvoiceForm, InvoicesList, PeriodClose, SalesReports } from './pages/FinanceBilling'
import { Bundles, CampaignAnalytics, CouponEditor, CouponsList, FlashSales, MarketingOverview } from './pages/MarketingCampaigns'
import { AudienceSegments, LoyaltyRules, MessageCampaigns, PushNotifications, ReferralSettings, ReviewHighlights } from './pages/MarketingEngagement'
import { BannersManager, CategoryContentPage, ContentPages, HomepageBuilder } from './pages/MarketingContent'
import { BrandsPage, BulkImport, CategoriesPage } from './pages/InventoryCatalog'
import { PackingQueue, ReturnInspection, ReturnsRestock } from './pages/InventoryFulfilment'
import { BarcodeLabels, CycleCounts, InventoryOverview, LowStockAlerts, MovementHistory, StockAdjustment, StockLevels } from './pages/InventoryStock'
import { PurchaseOrderDetail, PurchaseOrderForm, PurchaseOrders, ReceiveStock, Suppliers } from './pages/Purchasing'
import { EmployeePayProfiles, PayrollRunDetail, PayrollRuns, Remittances } from './pages/Payroll'
import FirstSignIn from './pages/FirstSignIn'
import Login from './pages/Login'
import { NewOrder, OrderDetail, OrdersList } from './pages/Orders'
import { ProductForm, ProductsList } from './pages/Products'
import Reports from './pages/Reports'
import SystemStates from './pages/SystemStates'
import { Applications, RiderDetail, RidersList } from './pages/Riders'
import { Health, Integrations, Templates } from './pages/System'
import { CustomerLookup, Disputes, RefundReview, RefundsList, ReturnDetail, ReturnsList } from './pages/Claims'
import { CannedResponses, KnowledgeBase, Reviews } from './pages/Content'
import { LiveChat, TicketDetail, TicketsInbox } from './pages/Support'

function NotFound() {
  return (
    <>
      <PageHead title="Page not found" desc="That page doesn’t exist." actions={<Btn onClick={() => navigate('/')}>Go to overview</Btn>} />
      <Notice tone="warning" mark="!">Check the address, or use the menu on the left.</Notice>
    </>
  )
}

function NoAccess({ role, label }: { role: string; label: string }) {
  const { permissions, requestAccess, requestedAccess } = useStore()
  const needed = rolesWith(label, permissions)
  return (
    <>
      <PageHead title="No access" desc={`The ${role} role can’t open this page.`} actions={<Btn onClick={() => navigate('/')}>Go to my home page</Btn>} />
      <section className="card panel">
        <PermissionDenied title={`You don’t have permission to open ${label.toLowerCase()}`} body="This page belongs to another department. If you need it for your work, ask your workspace owner for access." yourRole={role} requiredRole={needed.join(' or ')} onRequest={() => requestAccess(label)} requested={requestedAccess.includes(label)} />
      </section>
    </>
  )
}

/** Pages that read their starting values from the address need to start fresh when the address changes. */
const w = () => window.location.hash

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
  if (path === '/stock') return <InventoryOverview />
  if (path === '/inventory' || path === '/inventory/categories') return <CategoriesPage />
  if (path === '/inventory/brands') return <BrandsPage />
  if (path === '/inventory/levels') return <StockLevels />
  if (path === '/inventory/alerts') return <LowStockAlerts />
  if (path === '/inventory/adjust') return <StockAdjustment />
  if (path === '/inventory/movements') return <MovementHistory />
  if (path === '/inventory/counts') return <CycleCounts />
  if (path === '/inventory/labels') return <BarcodeLabels />
  if (path === '/inventory/import') return <BulkImport />
  if (path === '/inventory/packing') return <PackingQueue />
  if (path === '/inventory/returns') return <ReturnsRestock />
  if (path.startsWith('/inventory/returns/')) return <ReturnInspection key={path} id={path.slice(19)} />
  if (path === '/purchasing') return <PurchaseOrders />
  if (path === '/purchasing/new') return <PurchaseOrderForm key={w()} />
  if (path === '/purchasing/receive') return <ReceiveStock key={w()} />
  if (path === '/purchasing/suppliers') return <Suppliers />
  if (path.startsWith('/purchasing/')) return <PurchaseOrderDetail key={path} id={path.slice(12)} />
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
  if (path === '/marketing') return <MarketingOverview />
  if (path === '/marketing/coupons') return <CouponsList />
  if (path === '/marketing/coupons/new') return <CouponEditor key="new" />
  if (path.startsWith('/marketing/coupons/')) return <CouponEditor key={path} id={path.slice(19)} />
  if (path === '/marketing/flash') return <FlashSales />
  if (path === '/marketing/bundles') return <Bundles />
  if (path === '/marketing/analytics') return <CampaignAnalytics />
  if (path.startsWith('/marketing/analytics/')) return <CampaignAnalytics key={path} id={path.slice(21)} />
  if (path === '/marketing/push') return <PushNotifications />
  if (path === '/marketing/messages') return <MessageCampaigns />
  if (path === '/marketing/segments') return <AudienceSegments />
  if (path === '/marketing/loyalty') return <LoyaltyRules />
  if (path === '/marketing/referrals') return <ReferralSettings />
  if (path === '/marketing/highlights') return <ReviewHighlights />
  if (path === '/marketing/banners') return <BannersManager />
  if (path === '/marketing/homepage') return <HomepageBuilder />
  if (path === '/marketing/pages') return <ContentPages />
  if (path === '/marketing/categories') return <CategoryContentPage />
  if (path === '/finance') return <FinanceOverview />
  if (path === '/payments') return <PaymentsList />
  if (path.startsWith('/payments/')) return <PaymentDetail key={path} id={path.slice(10)} />
  if (path === '/finance/failed') return <FailedPayments />
  if (path === '/finance/reconciliation') return <Reconciliation />
  if (path === '/finance/refunds') return <RefundsLedger />
  if (path === '/finance/vat') return <VatReport />
  if (path === '/finance/pnl') return <ProfitLoss />
  if (path === '/finance/accounts') return <AccountsLedger />
  if (path === '/finance/cod') return <CodManagement />
  if (path === '/finance/cod/deposit') return <CodDeposit />
  if (path === '/payouts') return <RiderPayouts />
  if (path === '/finance/batch') return <PayoutBatches />
  if (path.startsWith('/finance/batch/')) return <PayoutBatches key={path} id={path.slice(15)} />
  if (path === '/finance/statements') return <EarningsStatements />
  if (path === '/finance/settlements') return <StoreSettlements />
  if (path === '/finance/invoices') return <InvoicesList />
  if (path === '/finance/invoices/new') return <InvoiceForm />
  if (path.startsWith('/finance/invoices/')) return <InvoiceDetail key={path} id={path.slice(18)} />
  if (path === '/finance/sales') return <SalesReports />
  if (path === '/finance/delivery-cost') return <DeliveryCost />
  if (path === '/finance/expenses') return <Expenses />
  if (path === '/finance/exports') return <ExportCenter />
  if (path === '/finance/close') return <PeriodClose />
  if (path === '/finance/settings') return <FinanceSettingsPage />
  if (path === '/finance/payroll') return <PayrollRuns />
  if (path === '/finance/payroll/employees') return <EmployeePayProfiles />
  if (path === '/finance/payroll/remittances') return <Remittances />
  if (path.startsWith('/finance/payroll/')) return <PayrollRunDetail key={path} id={path.slice(17)} />
  if (path === '/reports') return <Reports />
  if (path === '/support/tickets') return <TicketsInbox />
  if (path.startsWith('/support/tickets/')) return <TicketDetail key={path} id={path.slice(17)} />
  if (path === '/support/rider-tickets') return <TicketsInbox rider />
  if (path.startsWith('/support/rider-tickets/')) return <TicketDetail key={path} id={path.slice(23)} />
  if (path === '/support/chat') return <LiveChat />
  if (path === '/support/disputes') return <Disputes />
  if (path.startsWith('/support/disputes/')) return <Disputes key={path} id={path.slice(18)} />
  if (path === '/support/refunds') return <RefundsList />
  if (path.startsWith('/support/refunds/')) return <RefundReview key={path} id={path.slice(17)} />
  if (path === '/support/returns') return <ReturnsList />
  if (path.startsWith('/support/returns/')) return <ReturnDetail key={path} id={path.slice(17)} />
  if (path === '/support/lookup') return <CustomerLookup />
  if (path === '/support/reviews') return <Reviews />
  if (path === '/support/help') return <KnowledgeBase />
  if (path === '/support/canned') return <CannedResponses />
  if (path === '/system/states') return <SystemStates />
  if (path === '/account') return <Account />
  return <NotFound />
}

function Shell() {
  const { collapsed, role, permissions, user, offline, setForceOffline, toast, maintenance, setMaintenance, logout } = useStore()
  const path = usePath()
  const page = pageFor(path)

  useEffect(() => {
    document.title = `${displayLabel(page?.label ?? (path === '/account' ? 'My account' : 'Not found'), role, permissions[role])} · ShopCore Admin`
    window.scrollTo({ top: 0 })
  }, [page, path, role, permissions])

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

  const privileged = user.role === 'Owner admin' || user.role === 'IT support'
  if (maintenance.on && !privileged) return (
    <>
      <div className="maintenance-page">
        <MaintenanceScreen message={maintenance.message} etaMinutes={maintenance.etaMinutes} actions={<Btn onClick={() => { logout(); toast('Signed out') }}>Sign out</Btn>} />
      </div>
      <Toast />
    </>
  )

  return (
    <div className={`app ${collapsed ? 'collapse' : ''}`}>
      <Sidebar />
      <main className="main">
        <Topbar />
        <section className="content" aria-live="polite">
          {offline && <OfflineBanner onRetry={() => { setForceOffline(false); if (navigator.onLine) toast('Back online'); else toast('Still offline. Check your connection and try again.', 'error') }} />}
          {maintenance.on && <div className="banner info" role="status"><strong>Maintenance mode is on</strong><span>Only owners and IT support can use the admin right now.</span><Btn small onClick={() => setMaintenance({ ...maintenance, on: false })}>Turn off</Btn></div>}
          {blocked ? <NoAccess role={role} label={page?.label ?? 'this page'} /> : <PageBoundary key={path}>{route(path)}</PageBoundary>}
        </section>
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
      <SupportProvider>
        <FinanceProvider>
          <MarketingProvider>
            <InventoryProvider>
              <Shell />
            </InventoryProvider>
          </MarketingProvider>
        </FinanceProvider>
      </SupportProvider>
    </StoreProvider>
  )
}
