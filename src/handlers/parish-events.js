// Generated from src/handlers/parish-events.ts by npm run build:server. Do not edit.
import { d1, d1All } from '../lib/core.js';
import './parish.js';
import { commerceSuiteEnabledFor, eventsEnabledFor, mealsEnabledFor } from '../lib/entitlements.js';
import '../lib/commerce-readiness.js';
import '../lib/settlement-profiles.js';
import '../lib/stripe-connect.js';
import '../lib/stripe-fees.js';
import { zonedTimeToUtc } from '../lib/sacrament-availability.js';
import './parish-events-shared.js';
import {
  eventOfferingKind,
  storedEventClockTime,
  validTimeZone,
  normalizeEventProduct,
} from './parish-events-shared.js';
import './event-checkout.js';
import './event-administration.js';
import './event-ministry.js';
import { handleDonorEvents } from './event-checkout.js';
import { handleParishEvents } from './event-administration.js';
import {
  requireParishCommerceSuite,
  listMinistryCommerceItems,
  createMinistryCommerceItem,
  patchMinistryCommerceItem,
} from './event-ministry.js';
async function loadPublishedCommerceCalendarEvents(env, parishId, registration = {}) {
  if (!d1(env) || !parishId || !commerceSuiteEnabledFor(registration)) return [];
  const eventsEnabled = eventsEnabledFor(registration);
  const mealsEnabled = mealsEnabledFor(registration);
  if (!eventsEnabled && !mealsEnabled) return [];
  const rows = await d1All(
    env,
    `
    SELECT p.id, p.name, p.description, p.item_category, p.event_date, p.event_start_time,
           p.event_end_time, p.event_timezone, p.event_location, p.event_details, p.sales_close_at,
           p.ministry_id, m.display_name AS ministry_name,
           MIN(v.id) AS variant_id, MIN(v.unit_price_cents) AS unit_price_cents,
           SUM(CASE WHEN v.track_inventory = 0 THEN 0 ELSE COALESCE(v.stock_quantity, 0) END) AS stock_quantity,
           MIN(COALESCE(v.track_inventory, 1)) AS track_inventory
    FROM commerce_products p
    LEFT JOIN commerce_product_variants v
      ON v.product_id = p.id AND v.parish_id = p.parish_id
      AND v.commerce_module = 'events' AND v.status = 'active'
    LEFT JOIN directory_ministries m
      ON m.id = p.ministry_id AND m.parish_id = p.parish_id
    WHERE p.parish_id = ? AND p.commerce_module = 'events' AND p.status = 'active'
      AND COALESCE(p.show_on_calendar, 1) = 1 AND p.event_date IS NOT NULL AND p.event_date <> ''
      AND p.event_date BETWEEN date('now', '-1 day') AND date('now', '+180 days')
    GROUP BY p.id
    ORDER BY p.event_date ASC, p.event_start_time ASC, p.name COLLATE NOCASE
  `,
    parishId
  );
  return rows.flatMap((row) => {
    const offeringKind = eventOfferingKind(row.item_category);
    if ((offeringKind === 'meal' && !mealsEnabled) || (offeringKind === 'event' && !eventsEnabled)) return [];
    const startTime = storedEventClockTime(row.event_start_time || '');
    const endTime = storedEventClockTime(row.event_end_time || '');
    const timeZone = validTimeZone(row.event_timezone || registration.timezone);
    const startsAt = startTime ? zonedTimeToUtc(row.event_date, startTime, timeZone).toISOString() : row.event_date;
    const endsAt = endTime ? zonedTimeToUtc(row.event_date, endTime, timeZone).toISOString() : '';
    const stockQuantity = Number(row.stock_quantity || 0);
    const trackInventory = Number(row.track_inventory ?? 1) !== 0;
    const salesClosed = Boolean(row.sales_close_at && Date.parse(row.sales_close_at) < Date.now());
    const soldOut = trackInventory && stockQuantity <= 0;
    const hostName = row.ministry_id
      ? row.ministry_name || 'Parish ministry'
      : registration.parishName || registration.name || 'Parish';
    return [
      {
        id: `commerce-${row.id}`,
        source: 'commerce',
        commerceKind: offeringKind,
        typeLabel: offeringKind === 'meal' ? 'Meal' : 'Event',
        title: row.name || (offeringKind === 'meal' ? 'Parish meal' : 'Parish event'),
        description: row.description || row.event_details || '',
        location: row.event_location || '',
        startsAt,
        endsAt,
        allDay: !startTime,
        timeZone,
        hostName,
        ministryId: row.ministry_id || '',
        availabilityLabel: salesClosed ? 'Sales closed' : soldOut ? 'Sold out' : 'Registration open',
        href: `/myagapay/events?item=${encodeURIComponent(row.variant_id || '')}&kind=${offeringKind}`,
      },
    ];
  });
}
async function loadDonorEventProducts(env, parishId, availability = {}) {
  if (!d1(env)) return [];
  const rows = await d1All(
    env,
    `
    SELECT p.id, p.name, p.description, p.item_category, p.event_date, p.event_start_time, p.event_end_time,
           p.event_timezone, p.show_on_calendar, p.event_location, p.event_details,
           p.sales_close_at, p.default_tax_code, p.fulfillment_type, p.image_url,
           v.id AS variant_id, v.variant_name, v.unit_price_cents, v.tax_code,
           v.fulfillment_type AS variant_fulfillment_type, v.stock_quantity, v.track_inventory,
           v.max_quantity_per_order, COALESCE(sales.units_sold, 0) AS units_sold
    FROM commerce_products p
    LEFT JOIN commerce_product_variants v
     ON v.product_id = p.id AND v.parish_id = p.parish_id
     AND v.commerce_module = 'events' AND v.status = 'active'
    LEFT JOIN (
      SELECT i.variant_id, SUM(i.quantity) AS units_sold
      FROM commerce_order_items i
      JOIN commerce_orders o ON o.id = i.order_id
      WHERE i.parish_id = ? AND i.commerce_module = 'events'
        AND (o.payment_status = 'paid' OR o.status = 'completed')
      GROUP BY i.variant_id
    ) sales ON sales.variant_id = v.id
    WHERE p.parish_id = ? AND p.commerce_module = 'events' AND p.status = 'active'
    ORDER BY p.event_date ASC, p.name COLLATE NOCASE
  `,
    parishId,
    parishId
  );
  return rows
    .map(normalizeEventProduct)
    .filter(
      (product) =>
        product.variantId &&
        product.priceCents > 0 &&
        (product.offeringKind === 'meal' ? availability.mealsEnabled !== false : availability.eventsEnabled !== false)
    );
}
export {
  createMinistryCommerceItem,
  handleDonorEvents,
  handleParishEvents,
  listMinistryCommerceItems,
  loadDonorEventProducts,
  loadPublishedCommerceCalendarEvents,
  patchMinistryCommerceItem,
  requireParishCommerceSuite,
};
