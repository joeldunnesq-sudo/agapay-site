export interface BookstoreSqlRow {
  id: string;
  variant_id: string;
  name: string;
  description: string;
  item_category: string;
  sku: string;
  default_sku: string;
  unit_price_cents: number;
  sale_price_cents: number;
  cost_basis_cents: number;
  stock_quantity: number;
  reorder_threshold: number;
  track_inventory: number;
  status?: string;
  image_url: string;
  updated_at: string;
  items_json: string;
  started_at: string;
  completed_at: string;
  created_by: string;
  product_id: string;
  movement_type: string;
  quantity_delta: number;
  note: string;
  created_at: string;
  variantId: string;
  countedQuantity: string;
  difference: string;
  expectedQuantity: string;
  productId: string;
  item_name: string;
  barcode: string;
  item_description: string;
  tax_code: string;
  fulfillment_type: string;
  snapshot_json: string;
  quantity: number;
  priceCents: string;
  stockQuantity: string;
  costBasisCents: string;
  category: string;
  imageUrl: string;
  reorderThreshold: string;
}
export interface BookstoreCountItem {
  variantId?: unknown;
  countedQuantity?: unknown;
  note?: unknown;
}
export interface BookstoreMutation extends Record<string, unknown> {
  items?: BookstoreCountItem[];
}
export interface BookstoreOrderInput {
  id?: string;
  source?: string;
  parish_id?: string;
}
export interface BookstoreNormalizedBody {
  imageUrl: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  taxCode?: string;
  fulfillmentType?: string;
  priceCents: number;
  stockQuantity: number;
  costBasisCents: number;
  reorderThreshold: number;
  status?: string;
}

export interface BookstoreDashboardSqlRow {
  gross_cents: number;
  repeat_customers: number;
  default_sku: string;
  order_count: string;
  net_cents: number;
  id: string;
  order_id: string;
  item_name: string;
  item_category: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  order_number: string;
  donor_email: string;
  donor_name: string;
  item_description: string;
  total_charged_cents: number;
  parish_net_cents: number;
  tax_cents: number;
  agapay_fee_cents: number;
  stripe_fee_cents: number;
  settlement_profile_id: string;
  settlement_profile_name: string;
  payment_status?: string;
  fulfillment_status?: string;
  parish_notes: string;
  source: string;
  created_at: string;
  completed_at: string;
  is_myagapay: number;
  is_home_parish: number;
  ym: string;
  gross: number;
  orders: number;
  net: number;
  last_order_at: string;
  units: number;
  tax: number;
  customers: number;
  movement_type: string;
  quantity_delta: number;
  note: string;
  count_session_id: string;
}
interface BookstoreStarterRequest extends Record<string, unknown> {
  key?: unknown;
  name?: unknown;
  category?: unknown;
  priceCents?: unknown;
}
export interface BookstoreDashboardRequest extends Record<string, unknown> {
  items?: BookstoreStarterRequest[];
}

export interface DonorBookstoreSqlRow {
  order_id: string;
  item_name: string;
  total_cents: number;
  unit_price_cents: number;
  sale_price_cents: number;
  id: string;
  variant_id: string;
  name: string;
  description: string;
  item_category: string;
  sku: string;
  default_sku: string;
  barcode: string;
  tax_code: string;
  default_tax_code: string;
  variant_fulfillment_type: string;
  fulfillment_type: string;
  stock_quantity: number;
  track_inventory: number;
  units_sold: number;
  image_url: string;
  order_number: string;
  status?: string;
  payment_status?: string;
  item_description: string;
  quantity: number;
  subtotal_cents: number;
  tax_cents: number;
  total_charged_cents: number;
  fulfillment_status?: string;
  pickup_note: string;
  created_at: string;
}
export interface BookstoreCartInput extends Record<string, unknown> {
  productId?: string;
  variantId?: string;
  itemCategory?: string;
  source?: string;
  barcode?: string;
  specifics?: Record<string, string>;
  quantity?: unknown;
  unitPrice?: unknown;
}
export interface BookstoreCheckoutInput extends BookstoreCartInput {
  parishId?: string;
  items?: BookstoreCartInput[];
  email?: unknown;
  name?: unknown;
  pickupNote?: unknown;
}
export type BookstoreEnvironment = Partial<Env> & {
  STRIPE_SECRET_KEY?: string;
  BOOKSTORE_STRIPE_TAX_CODE?: string;
  PARISH_COMMERCE_DEFAULT_TAX_CODE?: string;
};

import type { DashboardRegistration } from './parish-dashboard-handler.js';
export interface BookstoreRegistration extends DashboardRegistration {
  name?: string;
  stripeAccountId?: string;
  commerceSellerDisplayName?: string;
}
