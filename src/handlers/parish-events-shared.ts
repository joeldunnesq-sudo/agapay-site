import type { EventSqlRow, EventRequestBody } from './parish-events-composition-contracts.js';

// src/handlers/parish-events.js
// Meals & Fundraiser Events -- donor/guest purchase flow for patronal feast
// dinners, Greek Fest plates, and similar parish fundraisers.
//
// Deliberately a NEW, additive file rather than an edit to donor.js's
// bookstore functions. It reuses the same commerce_* tables Bookstore
// uses (commerce_products / commerce_product_variants / commerce_orders /
// commerce_order_items), scoped with commerce_module = 'events', plus the
// event_date/event_location/event_details/sales_close_at columns and
// max_quantity_per_order added in migrations/0099_parish_commerce_events.sql.
//
// Nothing in this file is imported by, or changes the behavior of, the
// existing Bookstore code path in donor.js -- ship this without touching
// live bookstore checkout.
//
// Entitlement: gated on commerceSuiteEnabledFor (the "full commerce suite"
// tier flag already reserved in src/lib/entitlements.js for a second
// commerce module beyond the base bookstore module), not a new paywall.
//
// Both full parish administrators and delegated Koinonia ministry leaders
// can manage listings through the authenticated routes later in this file.
// Ministry writes are ownership-scoped so leaders cannot edit another
// ministry's listing or one created by parish staff.

import '../lib/core.js';

import './parish.js';

import '../lib/entitlements.js';

import '../lib/commerce-readiness.js';

import '../lib/settlement-profiles.js';

import '../lib/stripe-connect.js';

import '../lib/stripe-fees.js';

import '../lib/sacrament-availability.js';
import './parish-events.js';
import './event-checkout.js';
import './event-administration.js';
import './event-ministry.js';
export const EVENT_OFFERING_KINDS = new Set(['event', 'meal']);
export const EVENT_LISTING_STATUSES = new Set(['active', 'draft', 'archived']);
export function centsFromEventAmount(value: unknown) {
  const number = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0;
}
export function normalizeEventQuantity(value: unknown, maxPerOrder: unknown) {
  const quantity = Math.trunc(Number(value || 1));
  const ceiling = Number.isFinite(Number(maxPerOrder)) && Number(maxPerOrder) > 0 ? Number(maxPerOrder) : 50;
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(quantity, ceiling);
}
export function eventOfferingKind(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase() === 'meal'
    ? 'meal'
    : 'event';
}
export function requestedEventOfferingKind(request: Request) {
  const value = String(new URL(request.url).searchParams.get('offeringKind') || '')
    .trim()
    .toLowerCase();
  return EVENT_OFFERING_KINDS.has(value) ? value : '';
}
export function eventOfferingKindFromBody(body: EventRequestBody = {}) {
  const value = String(body.offeringKind || 'event')
    .trim()
    .toLowerCase();
  if (!EVENT_OFFERING_KINDS.has(value)) {
    const error = new Error('Choose either Event or Meal.') as Error & { status?: number };
    (error as Error & { status?: number }).status = 422;
    throw error;
  }
  return value;
}
export function eventListingStatus(value: unknown, fallback: string = 'active') {
  const status = String(value || fallback)
    .trim()
    .toLowerCase();
  if (!EVENT_LISTING_STATUSES.has(status)) {
    const error = new Error('Choose Draft, Published, or Archived status.') as Error & { status?: number };
    (error as Error & { status?: number }).status = 422;
    throw error;
  }
  return status;
}
export function eventClockTime(value: unknown = '') {
  const time = String(value || '').trim();
  if (!time) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    const error = new Error('Enter a valid event time.') as Error & { status?: number };
    (error as Error & { status?: number }).status = 422;
    throw error;
  }
  return time;
}
export function storedEventClockTime(value: unknown = '') {
  try {
    return eventClockTime(value);
  } catch {
    return '';
  }
}
export function validTimeZone(value: unknown = '') {
  const timeZone = String(value || '').trim() || 'America/Chicago';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'America/Chicago';
  }
}
export function normalizeEventProduct(row: Partial<EventSqlRow> = {}) {
  const priceCents = Number(row.unit_price_cents || 0);
  return {
    id: row.id || '',
    variantId: row.variant_id || '',
    name: row.name || 'Event item',
    description: row.description || '',
    eventDate: row.event_date || '',
    eventStartTime: row.event_start_time || '',
    eventEndTime: row.event_end_time || '',
    eventTimezone: row.event_timezone || '',
    showOnCalendar: Number(row.show_on_calendar ?? 1) !== 0,
    eventLocation: row.event_location || '',
    eventDetails: row.event_details || '',
    offeringKind: eventOfferingKind(row.item_category),
    salesCloseAt: row.sales_close_at || '',
    variantName: row.variant_name || '',
    taxCode: row.tax_code || row.default_tax_code || '',
    fulfillmentType: row.variant_fulfillment_type || row.fulfillment_type || 'physical_pickup',
    priceCents,
    priceLabel: `$${(priceCents / 100).toFixed(2)}`,
    stockQuantity: Number(row.stock_quantity || 0),
    trackInventory: Number(row.track_inventory ?? 1) !== 0,
    maxQuantityPerOrder: row.max_quantity_per_order != null ? Number(row.max_quantity_per_order) : 0,
    unitsSold: Number(row.units_sold || 0),
    imageUrl: row.image_url || '',
  };
}
export function salesClosed(product: ReturnType<typeof normalizeEventProduct>) {
  if (!product.salesCloseAt) return false;
  const closeTime = Date.parse(product.salesCloseAt);
  if (!Number.isFinite(closeTime)) return false;
  return Date.now() > closeTime;
}
