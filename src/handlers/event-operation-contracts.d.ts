import type { CatalogRegistration } from './parish-giving-catalog.js';
export interface EventSqlRow {
  unit_price_cents: number;
  id: string;
  variant_id: string;
  name: string;
  description: string;
  event_date: string;
  event_start_time: string;
  event_end_time: string;
  event_timezone: string;
  show_on_calendar: number;
  event_location: string;
  event_details: string;
  item_category: string;
  sales_close_at: string;
  variant_name: string;
  tax_code: string;
  default_tax_code: string;
  variant_fulfillment_type: string;
  fulfillment_type: string;
  stock_quantity: number;
  track_inventory: number;
  max_quantity_per_order: string;
  units_sold: number;
  image_url: string;
  ministry_id: string;
  ministry_name: string;
  order_number: string;
  status: string;
  payment_status: string;
  item_description: string;
  quantity: number;
  subtotal_cents: number;
  tax_cents: number;
  total_charged_cents: number;
  fulfillment_status: string;
  pickup_note: string;
  created_at: string;
  order_count: number;
  stripe_fee_cents: number;
  parish_net_cents: number;
  donor_name: string;
  donor_email: string;
  receipt_email_status: string;
  completed_at: string;
}
export interface EventCartItem {
  variantId?: unknown;
  quantity?: unknown;
}
export interface EventRequestBody extends Record<string, unknown>, EventCartItem {
  items?: EventCartItem[];
}
export type EventEnvironment = Partial<Env> & {
  STRIPE_SECRET_KEY?: string;
  EVENTS_STRIPE_TAX_CODE?: string;
  PARISH_COMMERCE_DEFAULT_TAX_CODE?: string;
  BOOKSTORE_STRIPE_TAX_CODE?: string;
  MEALS_STRIPE_TAX_CODE?: string;
};
export interface EventRegistration extends CatalogRegistration {
  reference?: unknown;
  parishId?: string;
  parishName?: string;
  name?: string;
  timezone?: string;
  stripeAccountId?: string;
}
