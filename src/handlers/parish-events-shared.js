// Generated from src/handlers/parish-events-shared.ts by npm run build:server. Do not edit.
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
const EVENT_OFFERING_KINDS = /* @__PURE__ */ new Set(['event', 'meal']);
const EVENT_LISTING_STATUSES = /* @__PURE__ */ new Set(['active', 'draft', 'archived']);
function centsFromEventAmount(value) {
  const number = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0;
}
function normalizeEventQuantity(value, maxPerOrder) {
  const quantity = Math.trunc(Number(value || 1));
  const ceiling = Number.isFinite(Number(maxPerOrder)) && Number(maxPerOrder) > 0 ? Number(maxPerOrder) : 50;
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(quantity, ceiling);
}
function eventOfferingKind(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === 'meal'
    ? 'meal'
    : 'event';
}
function requestedEventOfferingKind(request) {
  const value = String(new URL(request.url).searchParams.get('offeringKind') || '')
    .trim()
    .toLowerCase();
  return EVENT_OFFERING_KINDS.has(value) ? value : '';
}
function eventOfferingKindFromBody(body = {}) {
  const value = String(body.offeringKind || 'event')
    .trim()
    .toLowerCase();
  if (!EVENT_OFFERING_KINDS.has(value)) {
    const error = new Error('Choose either Event or Meal.');
    error.status = 422;
    throw error;
  }
  return value;
}
function eventListingStatus(value, fallback = 'active') {
  const status = String(value || fallback)
    .trim()
    .toLowerCase();
  if (!EVENT_LISTING_STATUSES.has(status)) {
    const error = new Error('Choose Draft, Published, or Archived status.');
    error.status = 422;
    throw error;
  }
  return status;
}
function eventClockTime(value = '') {
  const time = String(value || '').trim();
  if (!time) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    const error = new Error('Enter a valid event time.');
    error.status = 422;
    throw error;
  }
  return time;
}
function storedEventClockTime(value = '') {
  try {
    return eventClockTime(value);
  } catch {
    return '';
  }
}
function validTimeZone(value = '') {
  const timeZone = String(value || '').trim() || 'America/Chicago';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'America/Chicago';
  }
}
function normalizeEventProduct(row = {}) {
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
function salesClosed(product) {
  if (!product.salesCloseAt) return false;
  const closeTime = Date.parse(product.salesCloseAt);
  if (!Number.isFinite(closeTime)) return false;
  return Date.now() > closeTime;
}
export {
  EVENT_LISTING_STATUSES,
  EVENT_OFFERING_KINDS,
  centsFromEventAmount,
  eventClockTime,
  eventListingStatus,
  eventOfferingKind,
  eventOfferingKindFromBody,
  normalizeEventProduct,
  normalizeEventQuantity,
  requestedEventOfferingKind,
  salesClosed,
  storedEventClockTime,
  validTimeZone,
};
