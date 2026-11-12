export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-US')}`

// ---- roles ---------------------------------------------------------------------------

export const ROLES = ['Owner admin', 'Operations manager', 'Dispatch manager', 'Finance analyst', 'Customer support', 'Rider manager', 'IT support'] as const
export type Role = (typeof ROLES)[number]

export const MODULES = ['Overview', 'Orders', 'Products', 'Customers', 'Riders', 'Payments', 'Payroll', 'Reports', 'Support', 'Settings'] as const
export const ACTIONS = ['View', 'Create', 'Edit', 'Delete', 'Export'] as const
export type Module = (typeof MODULES)[number]
export type Permissions = Record<Module, boolean[]>

const row = (view: boolean, create = false, edit = false, del = false, exp = false) => [view, create, edit, del, exp]

export const seedPermissions = (): Record<Role, Permissions> => ({
  'Owner admin': Object.fromEntries(MODULES.map((m) => [m, row(true, true, true, true, true)])) as Permissions,
  'Operations manager': {
    Overview: row(true), Orders: row(true, true, true, false, true), Products: row(true, true, true), Customers: row(true, false, true),
    Riders: row(true, true, true), Payments: row(false), Payroll: row(false), Reports: row(true, false, false, false, true), Support: row(true, true, true, false, true), Settings: row(true),
  },
  'Dispatch manager': {
    Overview: row(true), Orders: row(true, true, true, false, true), Products: row(true), Customers: row(true), Riders: row(true, true, true, false, true),
    Payments: row(false), Payroll: row(false), Reports: row(true, false, false, false, true), Support: row(true), Settings: row(true),
  },
  'Finance analyst': {
    Overview: row(true), Orders: row(true, false, false, false, true), Products: row(true), Customers: row(true), Riders: row(false),
    Payments: row(true, true, true, false, true), Payroll: row(true, true, true, false, true), Reports: row(true, false, false, false, true), Support: row(true, false, true), Settings: row(true),
  },
  'Customer support': {
    Overview: row(false), Orders: row(true, false, false, false, true), Products: row(true), Customers: row(true, true, true), Riders: row(false),
    Payments: row(false), Payroll: row(false), Reports: row(false), Support: row(true, true, true, false, true), Settings: row(false),
  },
  'IT support': {
    Overview: row(false), Orders: row(false), Products: row(false), Customers: row(false), Riders: row(false),
    Payments: row(false), Payroll: row(false), Reports: row(false), Support: row(false), Settings: row(true, true, true, false, true),
  },
  'Rider manager': {
    Overview: row(true), Orders: row(true, false, true), Products: row(false), Customers: row(false), Riders: row(true, true, true, false, true),
    Payments: row(false), Payroll: row(false), Reports: row(true, false, false, false, true), Support: row(true), Settings: row(false),
  },
})

/** Short description shown next to a role. */
export const ROLE_BLURB: Record<Role, string> = {
  'Owner admin': 'Full access to all modules',
  'Operations manager': 'Orders, products, riders and delivery',
  'Dispatch manager': 'Dispatch, riders, zones and incidents',
  'Finance analyst': 'Payments, reports and exports',
  'Customer support': 'Customers, orders and reviews',
  'Rider manager': 'Riders, delivery zones and reports',
  'IT support': 'Staff accounts, passwords, access and system health',
}

/** The permission preview in the staff form. */
export const ROLE_PREVIEW: Record<string, [string, string][]> = {
  'Dispatch manager': [['Orders', 'Assign and reassign'], ['Riders', 'Manage and review'], ['Delivery zones', 'View and edit'], ['Incidents', 'Respond']],
  'IT support': [['Staff accounts', 'Create and reset'], ['Roles', 'Assign access'], ['Audit log', 'View'], ['System health', 'Monitor']],
  'Rider manager': [['Orders', 'View and assign'], ['Riders', 'Manage profiles'], ['Delivery zones', 'View and edit'], ['Reports', 'View delivery reports']],
  'Operations manager': [['Orders', 'View, edit and export'], ['Products', 'Manage catalogue'], ['Riders', 'Manage profiles'], ['Delivery zones', 'View and edit']],
  'Finance analyst': [['Payments', 'View and reconcile'], ['Reports', 'View and export'], ['Orders', 'View and export'], ['Customers', 'View only']],
  'Customer support': [['Customers', 'View and edit'], ['Orders', 'View and update'], ['Reviews', 'Moderate'], ['Refunds', 'Request only']],
  'Custom role': [['Overview', 'View only']],
}

// ---- staff -----------------------------------------------------------------------------

export type StaffStatus = 'Active' | 'Invited' | 'Suspended'

export interface Staff {
  id: string
  name: string
  email: string
  phone: string
  role: string
  status: StaffStatus
  lastActive: string
  /** Signed in with a temporary password: must choose their own before using the admin. */
  mustChange?: boolean
}

const st = (id: string, name: string, role: string, status: StaffStatus, lastActive: string, phone: string): Staff => ({
  id, name, role, status, lastActive, phone, email: `${name.split(' ')[0]!.toLowerCase()}@shopcore.co`,
})

export const seedStaff = (): Staff[] => [
  st('s1', 'Amara Mwangi', 'Owner admin', 'Active', 'Today, 9:12 AM', '+254 712 555 101'),
  st('s2', 'James Mutua', 'Operations manager', 'Active', 'Today, 8:46 AM', '+254 712 555 102'),
  st('s3', 'Grace Wambui', 'Customer support', 'Active', 'Yesterday', '+254 712 555 103'),
  { ...st('s4', 'David Kariuki', 'Finance analyst', 'Invited', '—', '+254 712 555 106'), mustChange: true },
  st('s5', 'Faith Njeri', 'Rider manager', 'Active', '20 Oct, 4:12 PM', '+254 712 555 104'),
  st('s6', 'Peter Otieno', 'Dispatch manager', 'Active', 'Today, 7:58 AM', '+254 712 555 107'),
  st('s7', 'Lucy Achieng', 'Customer support', 'Active', 'Today, 9:03 AM', '+254 712 555 108'),
  st('s8', 'Samuel Kimani', 'Finance analyst', 'Active', 'Yesterday', '+254 712 555 109'),
  st('s9', 'Esther Chebet', 'Customer support', 'Active', '21 Oct, 3:40 PM', '+254 712 555 110'),
  st('s10', 'Daniel Ochieng', 'Rider manager', 'Active', 'Today, 8:20 AM', '+254 712 555 111'),
  st('s11', 'Mercy Wairimu', 'Customer support', 'Active', '21 Oct, 11:15 AM', '+254 712 555 112'),
  st('s12', 'Brian Mwenda', 'IT support', 'Active', '19 Oct, 5:02 PM', '+254 712 555 113'),
  { ...st('s13', 'Joy Naliaka', 'Finance analyst', 'Invited', '—', '+254 712 555 114'), mustChange: true },
  st('s14', 'Ibrahim Yusuf', 'Rider manager', 'Active', 'Today, 6:49 AM', '+254 712 555 115'),
]

export const TOTAL_SEATS = 20

// ---- customers -----------------------------------------------------------------------------

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  orders: number
  spent: number
  segment: 'Returning' | 'New'
  wallet: number
  area: string
  street: string
  added: string
  recent: { id: string; date: string; total: number; status: string }[]
  notes: { by: string; text: string; at: string }[]
}

const NAMES: [string, number, number, 'Returning' | 'New', string][] = [
  ['Nia Wanjiku', 18, 42800, 'Returning', 'Kilimani'], ['Kevin Otieno', 12, 31400, 'Returning', 'Westlands'], ['Amina Hassan', 9, 28650, 'New', 'Lavington'],
  ['Brian Kiptoo', 7, 17200, 'Returning', 'Parklands'], ['Wanjiru Kamau', 6, 15900, 'Returning', 'Karen'], ['Joseph Mbugua', 15, 38200, 'Returning', 'Westlands'],
  ['Faith Akinyi', 3, 6400, 'New', 'Kilimani'], ['Peter Njoroge', 11, 26750, 'Returning', 'South B'], ['Zainab Ali', 8, 19300, 'Returning', 'Eastleigh'],
  ['Collins Rotich', 2, 4100, 'New', 'Lavington'], ['Mary Wafula', 14, 33900, 'Returning', 'Kileleshwa'], ['Tom Odhiambo', 5, 12800, 'Returning', 'Ngong Road'],
  ['Ruth Mutheu', 1, 2300, 'New', 'Westlands'], ['Hassan Abdi', 10, 24100, 'Returning', 'Parklands'], ['Grace Naserian', 4, 9800, 'New', 'Karen'],
  ['Victor Ouma', 13, 31200, 'Returning', 'Kilimani'], ['Sharon Jepkoech', 6, 14700, 'Returning', 'Runda'], ['Isaac Mwangi', 2, 3900, 'New', 'Lang’ata'],
  ['Lilian Auma', 9, 22400, 'Returning', 'Westlands'], ['Dennis Maina', 7, 17900, 'Returning', 'Kileleshwa'], ['Caroline Wanza', 3, 7200, 'New', 'Embakasi'],
  ['Patrick Kilonzo', 16, 40100, 'Returning', 'Lavington'], ['Doreen Chepkemoi', 5, 11600, 'Returning', 'Kilimani'], ['Martin Gitau', 1, 1800, 'New', 'Thika Road'],
  ['Sylvia Nyambura', 12, 29500, 'Returning', 'Westlands'], ['Felix Owino', 8, 20100, 'Returning', 'South C'], ['Beatrice Moraa', 4, 8800, 'New', 'Parklands'],
  ['George Kamau', 10, 25300, 'Returning', 'Karen'], ['Halima Said', 6, 14100, 'Returning', 'Eastleigh'], ['Eric Mutua', 2, 4700, 'New', 'Kilimani'],
  ['Angela Wangari', 11, 27600, 'Returning', 'Lavington'], ['Stephen Kibet', 5, 12200, 'Returning', 'Westlands'], ['Naomi Chebet', 3, 6900, 'New', 'Kileleshwa'],
  ['Allan Simiyu', 7, 16800, 'Returning', 'Parklands'], ['Joan Atieno', 9, 21700, 'Returning', 'Kilimani'], ['Moses Karanja', 1, 2600, 'New', 'Ruaka'],
  ['Purity Wambui', 13, 32400, 'Returning', 'Westlands'], ['Kelvin Maingi', 4, 9500, 'New', 'Lang’ata'], ['Dorcas Njeri', 8, 19800, 'Returning', 'Karen'],
  ['Oscar Wekesa', 6, 15300, 'Returning', 'South B'],
]

const STATUSES = ['Delivered', 'Delivered', 'Processing']

export const seedCustomers = (): Customer[] =>
  NAMES.map(([name, orders, spent, segment, area], i) => {
    const slug = name.toLowerCase().replace(/[^a-z ]/g, '').split(' ')
    return {
      id: `c${i + 1}`,
      name,
      email: `${slug[0]}.${slug[1]![0]}@example.com`,
      phone: `+254 7${10 + ((i * 7) % 30)} ${300 + ((i * 53) % 600)} ${100 + ((i * 97) % 900)}`,
      orders,
      spent,
      segment,
      wallet: (i % 4) * 625,
      area,
      street: ['Kindaruma Road, near Yaya Centre', 'Brookside Drive', 'James Gichuru Road', 'Limuru Road', 'Karen Road'][i % 5]!,
      added: ['14 Feb 2024', '3 Mar 2024', '21 Jun 2024', '9 Aug 2024', '17 Jan 2025'][i % 5]!,
      recent: [
        { id: `SC-${2849 - i * 7}`, date: 'Today', total: Math.round(spent / orders / 50) * 50 + 450, status: STATUSES[2]! },
        { id: `SC-${2701 - i * 7}`, date: '18 Oct 2025', total: Math.round(spent / orders / 50) * 50, status: STATUSES[0]! },
        { id: `SC-${2630 - i * 7}`, date: '12 Oct 2025', total: Math.round(spent / orders / 50) * 50 + 200, status: STATUSES[1]! },
      ],
      notes: i === 0 ? [{ by: 'Amara', text: 'Prefers delivery after 5 PM on weekdays.', at: '16 Oct 2025' }] : [],
    }
  })

// ---- audit -------------------------------------------------------------------------------------

export interface AuditEntry {
  id: string
  user: string
  action: string
  module: string
  when: string
  at: number
  type: 'Updated' | 'Security' | 'Refund' | 'Access' | 'Backup'
}

const T = (daysAgo: number, h: number, m: number) => {
  const d = new Date(Date.now() - daysAgo * 86_400_000)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export const whenLabel = (ms: number) => {
  const d = new Date(ms)
  const today = new Date()
  const y = new Date(Date.now() - 86_400_000)
  const hh = d.getHours()
  const time = `${hh % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`
  const day = d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${day}, ${time}`
}

export const seedAudit = (): AuditEntry[] =>
  (
    [
      ['Amara Mwangi', 'Updated delivery fee rules', 'Delivery settings', T(0, 9, 12), 'Updated'],
      ['James Mutua', 'Suspended rider account', 'Riders', T(0, 8, 46), 'Security'],
      ['Grace Wambui', 'Issued refund · SC-2841', 'Orders', T(1, 17, 22), 'Refund'],
      ['Amara Mwangi', 'Added staff member · Faith Njeri', 'Staff', T(1, 14, 5), 'Access'],
      ['Faith Njeri', 'Changed Nairobi West delivery zone', 'Delivery settings', T(2, 16, 12), 'Updated'],
      ['Samuel Kimani', 'Exported payments report', 'Payments', T(2, 11, 30), 'Updated'],
      ['Amara Mwangi', 'Rotated API key · Reporting export', 'Integrations', T(3, 10, 2), 'Security'],
      ['System', 'Automatic backup completed', 'System health', T(0, 2, 0), 'Backup'],
    ] as [string, string, string, number, AuditEntry['type']][]
  )
    .map(([user, action, module, at, type], i) => ({ id: `a${i}`, user, action, module, at, when: whenLabel(at), type }))
    .sort((a, b) => b.at - a.at)

// ---- settings ------------------------------------------------------------------------------------

export interface Zone {
  id: string
  name: string
  fee: number
  /** Share of the delivery fee the rider keeps (%). */
  commission: number
  note: string
  active: boolean
  /** Outline on the dispatch map as [lat, lng] points (empty = not drawn). */
  points: [number, number][]
}

export const seedZones = (): Zone[] => [
  { id: 'z1', name: 'CBD', fee: 150, commission: 85, note: '', active: true, points: [[43, 50], [44, 64], [56, 66], [55, 50]] },
  { id: 'z2', name: 'Westlands', fee: 180, commission: 85, note: '', active: true, points: [[50, 14], [52, 34], [68, 36], [70, 16]] },
  { id: 'z3', name: 'Kilimani', fee: 200, commission: 84, note: '', active: true, points: [[28, 50], [28, 66], [42, 66], [42, 50]] },
  { id: 'z4', name: 'Karen', fee: 350, commission: 80, note: '', active: true, points: [[4, 12], [4, 34], [20, 34], [20, 12]] },
  { id: 'z5', name: 'Ruiru', fee: 420, commission: 78, note: '', active: false, points: [[62, 82], [62, 98], [74, 98], [74, 82]] },
  { id: 'z6', name: 'Greater Nairobi', fee: 250, commission: 82, note: '', active: true, points: [] },
  { id: 'z7', name: 'Out of town', fee: 450, commission: 78, note: '', active: true, points: [] },
]

export const BUSINESS_DEFAULTS = {
  name: 'ShopCore Kenya Ltd', email: 'ops@shopcore.co', kra: 'P051234567X', vat: '16', currency: 'KES — Kenyan Shilling', baseFee: '250',
}
export const PAYMENT_DEFAULTS = {
  shortcode: '523810', callback: 'https://api.shopcore.co/payments/mpesa', currency: 'KES', delay: 'T+1 business day', mpesa: true, card: true,
}

export const MINIMUM_BASKET = 1500

// ---- templates --------------------------------------------------------------------------------------

export type Channel = 'Email' | 'SMS' | 'Push'

export interface Template {
  id: string
  name: string
  channel: Channel
  trigger: string
  subject: string
  body: string
  status: 'Active' | 'Paused'
}

export const TEMPLATE_VARS = ['customer_name', 'order_number', 'order_total', 'tracking_link'] as const

export const seedTemplates = (): Template[] => [
  { id: 't1', name: 'Order confirmation', channel: 'Email', trigger: 'Payment confirmed', status: 'Active', subject: 'Your ShopCore order is confirmed', body: 'Hi {{customer_name}}, your order {{order_number}} is confirmed. We’ll let you know when it’s on the way. Total: {{order_total}}.' },
  { id: 't2', name: 'Order confirmation', channel: 'SMS', trigger: 'Payment confirmed', status: 'Active', subject: '', body: 'ShopCore: order {{order_number}} confirmed. Total {{order_total}}. Track: {{tracking_link}}' },
  { id: 't3', name: 'Order confirmation', channel: 'Push', trigger: 'Payment confirmed', status: 'Active', subject: 'Order confirmed', body: 'Thanks {{customer_name}}! Order {{order_number}} is confirmed.' },
  { id: 't4', name: 'Order shipped', channel: 'Email', trigger: 'Order dispatched', status: 'Active', subject: 'Your order {{order_number}} is on the way', body: 'Hi {{customer_name}}, your order is on its way. Follow it live: {{tracking_link}}' },
  { id: 't5', name: 'Order shipped', channel: 'SMS', trigger: 'Order dispatched', status: 'Active', subject: '', body: 'ShopCore: {{order_number}} is on the way. Track: {{tracking_link}}' },
  { id: 't6', name: 'Delivery complete', channel: 'Push', trigger: 'Rider marks complete', status: 'Active', subject: 'Delivered', body: 'Your order {{order_number}} was delivered. Enjoy!' },
  { id: 't7', name: 'Payment reminder', channel: 'SMS', trigger: 'Pending payment', status: 'Paused', subject: '', body: 'Hi {{customer_name}}, complete payment for {{order_number}} ({{order_total}}) to confirm your order.' },
]

// ---- integrations --------------------------------------------------------------------------------------

export interface Integration {
  id: string
  name: string
  purpose: string
  status: 'Connected' | 'Degraded' | 'Disconnected'
  last: string
  note: string
}

export const seedIntegrations = (): Integration[] => [
  { id: 'i1', name: 'M-Pesa Daraja', purpose: 'Payments', status: 'Connected', last: 'Updated 2 min ago', note: 'Till number 523810 · callbacks healthy' },
  { id: 'i2', name: 'Resend', purpose: 'Transactional email', status: 'Connected', last: 'Updated 8 min ago', note: 'Sending domain verified' },
  { id: 'i3', name: 'ShopCore Rider API', purpose: 'Delivery operations', status: 'Connected', last: 'Updated 1 min ago', note: 'Dispatch and tracking events' },
  { id: 'i4', name: 'Google Maps Platform', purpose: 'Address validation', status: 'Degraded', last: 'Updated 3 hours ago', note: 'Geocoding requests are timing out intermittently' },
]

export interface ApiKey {
  id: string
  name: string
  key: string
  permissions: string
  created: string
  lastUsed: string
  status: 'Active' | 'Revoked'
}

export const seedKeys = (): ApiKey[] => [
  { id: 'k1', name: 'Order sync production', key: 'sc_live_••••••••••6F82', permissions: 'Orders: read/write · Webhooks', created: '12 Sep 2025', lastUsed: 'Today, 8:40 AM', status: 'Active' },
  { id: 'k2', name: 'Reporting export', key: 'sc_live_••••••••••9B14', permissions: 'Reports: read', created: '4 Aug 2025', lastUsed: 'Yesterday', status: 'Active' },
]

export const KEY_SCOPES = ['Orders: read', 'Orders: read/write', 'Customers: read', 'Reports: read', 'Webhooks'] as const

// ---- health ----------------------------------------------------------------------------------------------

export interface Backup {
  id: string
  when: string
  type: 'Automatic' | 'Manual'
  size: string
  duration: string
  status: 'Complete'
}

export const seedBackups = (): Backup[] => [
  { id: 'b1', when: '22 Oct 2025, 02:00 EAT', type: 'Automatic', size: '1.2 GB', duration: '4m 18s', status: 'Complete' },
  { id: 'b2', when: '21 Oct 2025, 02:00 EAT', type: 'Automatic', size: '1.2 GB', duration: '4m 22s', status: 'Complete' },
  { id: 'b3', when: '20 Oct 2025, 02:00 EAT', type: 'Automatic', size: '1.1 GB', duration: '4m 09s', status: 'Complete' },
]

export const SERVICES: { name: string; uptime: string; status: 'Healthy' | 'Degraded' }[] = [
  { name: 'Customer storefront', uptime: '99.99% uptime', status: 'Healthy' },
  { name: 'Rider API', uptime: '99.96% uptime', status: 'Healthy' },
  { name: 'Payment processing', uptime: '99.98% uptime', status: 'Healthy' },
  { name: 'Notifications', uptime: '98.90% uptime', status: 'Degraded' },
]

// ---- overview ---------------------------------------------------------------------------------------------

export type Range = 'Last 30 days' | 'Last 7 days' | 'This year'

export const OVERVIEW: Record<Range, {
  stats: { label: string; value: string; trend: string; icon: string; up: boolean }[]
  path: string
  labels: string[]
  sub: string
  statuses: [string, number, number, string][]
}> = {
  'Last 30 days': {
    stats: [
      { label: 'Revenue', value: 'KES 4.82M', trend: '↑ 12.8% vs last month', icon: '↗', up: true },
      { label: 'Orders', value: '1,284', trend: '↑ 8.2% vs last month', icon: '▣', up: true },
      { label: 'Active riders', value: '86', trend: '↑ 6 online today', icon: '⌖', up: true },
      { label: 'New customers', value: '846', trend: '↑ 11.3% vs last month', icon: '♙', up: true },
      { label: 'Conversion rate', value: '3.8%', trend: '↑ 0.4 pts vs last month', icon: '◉', up: true },
    ],
    path: 'M35 155 C68 146 86 117 123 130 S178 112 215 102 S275 119 310 86 S365 99 402 67 S458 79 495 52 S550 58 610 23',
    labels: ['Oct 1', 'Oct 5', 'Oct 10', 'Oct 15', 'Oct 20', 'Oct 25', 'Oct 30'],
    sub: 'Daily gross sales · Last 30 days',
    statuses: [['Delivered', 72, 923, '#16A34A'], ['In progress', 18, 231, '#2563EB'], ['Pending', 7, 90, '#F59E0B'], ['Cancelled', 3, 40, '#DC2626']],
  },
  'Last 7 days': {
    stats: [
      { label: 'Revenue', value: 'KES 1.14M', trend: '↑ 4.1% vs last week', icon: '↗', up: true },
      { label: 'Orders', value: '302', trend: '↑ 2.9% vs last week', icon: '▣', up: true },
      { label: 'Active riders', value: '86', trend: '↑ 6 online today', icon: '⌖', up: true },
      { label: 'New customers', value: '197', trend: '↓ 1.8% vs last week', icon: '♙', up: false },
      { label: 'Conversion rate', value: '3.6%', trend: '↓ 0.1 pts vs last week', icon: '◉', up: false },
    ],
    path: 'M35 120 C75 135 100 90 150 100 S230 70 280 95 S360 50 420 70 S520 40 565 55 S595 30 610 38',
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    sub: 'Daily gross sales · Last 7 days',
    statuses: [['Delivered', 70, 211, '#16A34A'], ['In progress', 21, 63, '#2563EB'], ['Pending', 6, 19, '#F59E0B'], ['Cancelled', 3, 9, '#DC2626']],
  },
  'This year': {
    stats: [
      { label: 'Revenue', value: 'KES 41.6M', trend: '↑ 28.4% vs last year', icon: '↗', up: true },
      { label: 'Orders', value: '11,902', trend: '↑ 22.0% vs last year', icon: '▣', up: true },
      { label: 'Active riders', value: '86', trend: '↑ 31 since January', icon: '⌖', up: true },
      { label: 'New customers', value: '7,310', trend: '↑ 19.6% vs last year', icon: '♙', up: true },
      { label: 'Conversion rate', value: '3.5%', trend: '↑ 0.7 pts vs last year', icon: '◉', up: true },
    ],
    path: 'M35 165 C80 160 110 140 150 135 S220 120 270 100 S350 105 400 80 S480 60 540 45 S590 30 610 20',
    labels: ['Jan', 'Mar', 'Apr', 'Jun', 'Aug', 'Sep', 'Oct'],
    sub: 'Monthly gross sales · This year',
    statuses: [['Delivered', 74, 8807, '#16A34A'], ['In progress', 12, 1428, '#2563EB'], ['Pending', 5, 595, '#F59E0B'], ['Cancelled', 9, 1072, '#DC2626']],
  },
}

export const TOP_PRODUCTS = [
  { name: 'Canvas Weekender Bag', sold: '184 sold', revenue: 'KES 828,000', letter: 'B' },
  { name: 'Everyday Leather Tote', sold: '143 sold', revenue: 'KES 694,500', letter: 'T' },
  { name: 'Linen Weekend Shirt', sold: '126 sold', revenue: 'KES 403,200', letter: 'S' },
]
export const TOP_AREAS = [
  { name: 'Westlands', orders: '238 orders', share: '19%' },
  { name: 'Kilimani', orders: '194 orders', share: '15%' },
  { name: 'Lavington', orders: '162 orders', share: '13%' },
]
