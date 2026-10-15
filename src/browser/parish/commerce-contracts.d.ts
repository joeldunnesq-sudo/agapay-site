// Data consumed by the parish Commerce classic scripts.
interface ParishWorkspaceIdentity {
  state?: string;
  eventsEnabled?: boolean;
  mealsEnabled?: boolean;
}
interface ParishBookstoreProduct {
  variantId?: string;
  name?: string;
  category: string;
  sku?: string;
  description?: string;
  imageUrl?: string;
  trackInventory?: boolean;
  onSale?: boolean;
  salePriceCents?: number;
  priceCents?: number;
  stockQuantity?: number;
  reorderThreshold?: number;
  costBasisCents?: number;
}
interface ParishCommerceKpis {
  avgOrderCents?: number;
  subtotalCents?: number;
  parishNetCents?: number;
}
interface ParishCommerceOrder {
  id?: string;
  donorEmail?: string;
  orderNumber?: string;
  itemDescription?: string;
  subtotalCents?: number;
  totalChargedCents?: number;
  receiptEmailStatus?: string;
  quantity: number;
  netCents?: number;
  items?: { name: string; quantity: number; totalCents: number }[];
  paymentStatus?: string;
  fulfillmentStatus?: string;
  inventoryAttention?: boolean;
  isMyAgapay?: boolean;
  source?: string;
  settlementProfileName?: string;
  taxCents?: number;
  stripeFeeCents?: number;
  agapayFeeCents?: number;
}
interface ParishBookstoreCountSession {
  id: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  items?: {
    difference?: number;
    name?: string;
    sku?: string;
    expectedQuantity?: number;
    countedQuantity?: number;
    note?: string;
    productId?: string;
  }[];
}
interface ParishBookstoreStarterGroup {
  label: string;
  items: { key: string; name: string; alreadyAdded?: boolean; category?: string; suggestedPriceCents: number }[];
}
interface ParishBookstoreMovement {
  quantityDelta?: number;
  movementType?: string;
  orderNumber?: string;
  orderId?: string;
  countSessionId?: string;
  createdAt?: string;
  note?: string;
}
interface ParishBookstoreTrend {
  grossCents: number;
  label: string;
  orders: number;
}
interface ParishCommerceOffering {
  id: string;
  name: string;
  description?: string;
  ministryName?: string;
  eventDate?: string;
  eventStartTime?: string;
  eventLocation?: string;
  showOnCalendar?: boolean;
  priceCents?: number;
  trackInventory?: boolean;
  stockQuantity?: number;
  unitsSold?: number;
  status: string;
}
interface ParishCommerceResponse {
  stockQuantity?: number;
  costBasisCents?: number;
  error?: string;
  parish?: Partial<ParishWorkspaceIdentity>;
  products?: ParishBookstoreProduct[];
  product?: ParishBookstoreProduct;
  sessions?: ParishBookstoreCountSession[];
  session?: ParishBookstoreCountSession;
  catalog?: ParishBookstoreStarterGroup[];
  movements?: ParishBookstoreMovement[];
  added?: unknown[];
  orders?: ParishCommerceOrder[];
  nextCursor?: string;
  kpis?: ParishCommerceKpis;
  allTime?: ParishCommerceKpis;
  refunds?: ParishCommerceKpis;
  trend?: ParishBookstoreTrend[];
  topProducts?: { name: string; units: number; grossCents: number }[];
  topCustomers?: {
    name?: string;
    isHomeParish?: boolean;
    email?: string;
    grossCents: number;
    orders: number;
    lastOrderAt?: string;
  }[];
  items?: ParishCommerceOffering[];
}
interface ParishBookstoreSalesState {
  loaded: boolean;
  loading: boolean;
  range: string;
  data: ParishCommerceResponse | null;
  orders: ParishCommerceOrder[];
  nextCursor: string | null;
  query?: string;
}
declare function isStarterTier(): boolean;
declare function syncDashboardPaywall(pane: HTMLElement | null, module: string, title: string, locked: boolean): void;
