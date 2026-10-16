import type {
  EventSqlRow,
  EventRequestBody,
  EventEnvironment,
  EventRegistration,
} from './parish-events-composition-contracts.js';

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

import {
  d1,
  d1All,
  d1First,
  d1Run,
  generateSecret,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from '../lib/core.js';

import { findRegistrationByParishId, verifyParishDashboardBearer } from './parish.js';

import { commerceSuiteEnabledFor } from '../lib/entitlements.js';

import '../lib/commerce-readiness.js';

import '../lib/settlement-profiles.js';

import '../lib/stripe-connect.js';

import '../lib/stripe-fees.js';

import '../lib/sacrament-availability.js';
import './parish-events-shared.js';
import {
  eventOfferingKind,
  requestedEventOfferingKind,
  eventOfferingKindFromBody,
  eventListingStatus,
  eventClockTime,
  validTimeZone,
} from './parish-events-shared.js';
import './parish-events.js';
import './event-checkout.js';
import './event-ministry.js';
export function normalizeEventProductAdmin(row: Partial<EventSqlRow> = {}) {
  return {
    id: row.id,
    name: row.name || '',
    description: row.description || '',
    offeringKind: eventOfferingKind(row.item_category),
    eventDate: row.event_date || '',
    eventStartTime: row.event_start_time || '',
    eventEndTime: row.event_end_time || '',
    eventTimezone: row.event_timezone || '',
    showOnCalendar: Number(row.show_on_calendar ?? 1) !== 0,
    eventLocation: row.event_location || '',
    eventDetails: row.event_details || '',
    salesCloseAt: row.sales_close_at || '',
    status: row.status || 'active',
    variantId: row.variant_id || '',
    variantName: row.variant_name || '',
    priceCents: Number(row.unit_price_cents || 0),
    stockQuantity: Number(row.stock_quantity || 0),
    trackInventory: Number(row.track_inventory ?? 1) !== 0,
    maxQuantityPerOrder: row.max_quantity_per_order != null ? Number(row.max_quantity_per_order) : 0,
    unitsSold: Number(row.units_sold || 0),
    ministryId: row.ministry_id || '',
    ministryName: row.ministry_id ? row.ministry_name || 'Ministry' : 'Parish',
  };
}
export async function requireEventsParishAuth(request: Request, env: EventEnvironment, parishId: string) {
  if (!hasProductionStore(env)) return { error: missingProductionStoreResponse() };
  if (!d1(env)) return { error: missingProductionStoreResponse() };
  const found = await findRegistrationByParishId<EventRegistration>(env, parishId);
  if (!found) return { error: json({ error: 'Parish dashboard record not found' }, { status: 404 }) };
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return { error: unauthorized() };
  if (!commerceSuiteEnabledFor(found.registration)) {
    return {
      error: json({ error: 'Meals & Events requires the full AGAPAY Parish Commerce Suite.' }, { status: 403 }),
    };
  }
  return { registration: found.registration };
}

export async function handleParishEvents(
  request: Request,
  env: EventEnvironment,
  parishId: string,
  subpath: string = ''
) {
  const limited = await rateLimit(request, env, 'parish-events', { limit: 80, windowSeconds: 300 });
  if (limited) return limited;

  const auth = await requireEventsParishAuth(request, env, parishId);
  if (auth.error) return auth.error;

  const segments = String(subpath || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
  const offeringKind = requestedEventOfferingKind(request);
  const now = new Date().toISOString();

  // GET / -- list every event product (active + archived) with its single
  // variant, regardless of who created it -- full parish admins see both
  // their own listings AND everything ministries have created via
  // delegated leader access (donor-groups.js), with the creating ministry's
  // name attached so admins have real oversight, not a blind spot.
  // Events/meals are simple single-price items (unlike Bookstore's
  // multi-variant books), so this intentionally does not support multiple
  // variants per product yet -- one product, one variant, one price.
  if (request.method === 'GET' && segments.length === 0) {
    const rows = await d1All<EventSqlRow>(
      env,
      `
      SELECT p.id, p.name, p.description, p.item_category, p.event_date, p.event_start_time, p.event_end_time,
             p.event_timezone, p.show_on_calendar, p.event_location, p.event_details,
             p.sales_close_at, p.status, p.ministry_id, m.display_name AS ministry_name,
             v.id AS variant_id, v.variant_name, v.unit_price_cents, v.stock_quantity,
             v.track_inventory, v.max_quantity_per_order,
             COALESCE(sales.units_sold, 0) AS units_sold
      FROM commerce_products p
      LEFT JOIN commerce_product_variants v
        ON v.product_id = p.id AND v.parish_id = p.parish_id AND v.commerce_module = 'events'
      LEFT JOIN directory_ministries m
        ON m.id = p.ministry_id AND m.parish_id = p.parish_id
      LEFT JOIN (
        SELECT i.variant_id, SUM(i.quantity) AS units_sold
        FROM commerce_order_items i
        JOIN commerce_orders o ON o.id = i.order_id
        WHERE i.parish_id = ? AND i.commerce_module = 'events'
          AND (o.payment_status = 'paid' OR o.status = 'completed')
        GROUP BY i.variant_id
      ) sales ON sales.variant_id = v.id
      WHERE p.parish_id = ? AND p.commerce_module = 'events'
        AND (? = '' OR CASE WHEN LOWER(COALESCE(p.item_category, '')) = 'meal' THEN 'meal' ELSE 'event' END = ?)
      ORDER BY p.event_date ASC, p.name COLLATE NOCASE
    `,
      parishId,
      parishId,
      offeringKind,
      offeringKind
    );
    return json({ offeringKind, items: rows.map(normalizeEventProductAdmin) });
  }

  // GET /sales -- paid Events orders and tax totals for parish oversight.
  if (request.method === 'GET' && segments.length === 1 && segments[0] === 'sales') {
    const summary = await d1First<EventSqlRow>(
      env,
      `
      SELECT COUNT(*) AS order_count,
             COALESCE(SUM(subtotal_cents), 0) AS subtotal_cents,
             COALESCE(SUM(tax_cents), 0) AS tax_cents,
             COALESCE(SUM(total_charged_cents), 0) AS total_charged_cents,
             COALESCE(SUM(stripe_fee_cents), 0) AS stripe_fee_cents,
             COALESCE(SUM(parish_net_cents), 0) AS parish_net_cents
      FROM commerce_orders
      WHERE parish_id = ? AND commerce_module = 'events'
        AND payment_status IN ('paid', 'partially_refunded')
        AND (? = '' OR CASE WHEN LOWER(COALESCE(item_category, '')) = 'meal' THEN 'meal' ELSE 'event' END = ?)
    `,
      parishId,
      offeringKind,
      offeringKind
    );
    const orders = await d1All<EventSqlRow>(
      env,
      `
      SELECT id, order_number, donor_name, donor_email, item_category, item_description, quantity,
             subtotal_cents, tax_cents, total_charged_cents, parish_net_cents,
             payment_status, fulfillment_status, receipt_email_status, completed_at, created_at
      FROM commerce_orders
      WHERE parish_id = ? AND commerce_module = 'events'
        AND payment_status IN ('paid', 'partially_refunded', 'refunded')
        AND (? = '' OR CASE WHEN LOWER(COALESCE(item_category, '')) = 'meal' THEN 'meal' ELSE 'event' END = ?)
      ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
      LIMIT 50
    `,
      parishId,
      offeringKind,
      offeringKind
    );
    return json({
      offeringKind,
      kpis: {
        orderCount: Number(summary?.order_count || 0),
        subtotalCents: Number(summary?.subtotal_cents || 0),
        taxCents: Number(summary?.tax_cents || 0),
        totalChargedCents: Number(summary?.total_charged_cents || 0),
        stripeFeeCents: Number(summary?.stripe_fee_cents || 0),
        parishNetCents: Number(summary?.parish_net_cents || 0),
      },
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.order_number || '',
        donorName: order.donor_name || '',
        donorEmail: order.donor_email || '',
        itemDescription:
          order.item_description || (eventOfferingKind(order.item_category) === 'meal' ? 'Meal order' : 'Event order'),
        quantity: Number(order.quantity || 1),
        subtotalCents: Number(order.subtotal_cents || 0),
        taxCents: Number(order.tax_cents || 0),
        totalChargedCents: Number(order.total_charged_cents || 0),
        parishNetCents: Number(order.parish_net_cents || 0),
        paymentStatus: order.payment_status || 'pending',
        fulfillmentStatus: order.fulfillment_status || 'pending',
        receiptEmailStatus: order.receipt_email_status || '',
        offeringKind: eventOfferingKind(order.item_category),
        completedAt: order.completed_at || order.created_at || '',
      })),
    });
  }

  // POST / -- create a new event/meal listing (product + its one variant).
  if (request.method === 'POST' && segments.length === 0) {
    let body: EventRequestBody = {};
    try {
      body = (await request.json()) as EventRequestBody;
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const name = String(body.name || '')
      .trim()
      .slice(0, 180);
    if (!name) return json({ error: 'Name is required.' }, { status: 422 });
    const priceCents = Math.round(Number(body.priceCents || 0));
    if (!Number.isFinite(priceCents) || priceCents < 1) return json({ error: 'Enter a valid price.' }, { status: 422 });
    const stockQuantity = Math.max(0, Math.trunc(Number(body.stockQuantity || 0)));
    const trackInventory = body.trackInventory === false ? 0 : 1;
    const maxQuantityPerOrder =
      body.maxQuantityPerOrder != null && Number(body.maxQuantityPerOrder) > 0
        ? Math.trunc(Number(body.maxQuantityPerOrder))
        : null;
    const description = String(body.description || '')
      .trim()
      .slice(0, 600);
    const eventDate = String(body.eventDate || '')
      .trim()
      .slice(0, 40);
    let eventStartTime, eventEndTime, status;
    try {
      eventStartTime = eventClockTime(body.eventStartTime);
      eventEndTime = eventClockTime(body.eventEndTime);
      status = eventListingStatus(body.status);
    } catch (error) {
      return json(
        { error: (error as Error).message },
        { status: (error as Error & { status?: number }).status || 422 }
      );
    }
    if (eventEndTime && !eventStartTime)
      return json({ error: 'Add a start time before the end time.' }, { status: 422 });
    const eventLocation = String(body.eventLocation || '')
      .trim()
      .slice(0, 200);
    const eventDetails = String(body.eventDetails || '')
      .trim()
      .slice(0, 1000);
    const salesCloseAt =
      String(body.salesCloseAt || '')
        .trim()
        .slice(0, 40) || null;
    let newOfferingKind;
    try {
      newOfferingKind = eventOfferingKindFromBody(body);
    } catch (error) {
      return json(
        { error: (error as Error).message },
        { status: (error as Error & { status?: number }).status || 422 }
      );
    }

    const productId = generateSecret(18);
    const variantId = generateSecret(18);
    await d1Run(
      env,
      `
      INSERT INTO commerce_products
        (id, parish_id, commerce_module, name, description, item_category, fulfillment_type,
         status, event_date, event_start_time, event_end_time, event_timezone, show_on_calendar,
         event_location, event_details, sales_close_at, published_at, created_at, updated_at)
      VALUES (?, ?, 'events', ?, ?, ?, 'physical_pickup', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      productId,
      parishId,
      name,
      description,
      newOfferingKind,
      status,
      eventDate || null,
      eventStartTime || null,
      eventEndTime || null,
      validTimeZone(auth.registration.timezone),
      body.showOnCalendar === false ? 0 : 1,
      eventLocation || null,
      eventDetails || null,
      salesCloseAt,
      status === 'active' ? now : null,
      now,
      now
    );
    await d1Run(
      env,
      `
      INSERT INTO commerce_product_variants
        (id, product_id, parish_id, commerce_module, variant_name, unit_price_cents,
         stock_quantity, track_inventory, max_quantity_per_order, status, created_at, updated_at)
      VALUES (?, ?, ?, 'events', '', ?, ?, ?, ?, 'active', ?, ?)
    `,
      variantId,
      productId,
      parishId,
      priceCents,
      stockQuantity,
      trackInventory,
      maxQuantityPerOrder,
      now,
      now
    );

    return json({ ok: true, id: productId, variantId, offeringKind: newOfferingKind }, { status: 201 });
  }

  // PATCH /:productId -- edit price/stock/cap/status/event details.
  if (request.method === 'PATCH' && segments.length === 1) {
    const productId = segments[0];
    let body: EventRequestBody = {};
    try {
      body = (await request.json()) as EventRequestBody;
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const product = await d1First<EventSqlRow>(
      env,
      `
      SELECT p.id, v.id AS variant_id FROM commerce_products p
      LEFT JOIN commerce_product_variants v ON v.product_id = p.id AND v.parish_id = p.parish_id AND v.commerce_module = 'events'
      WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'events'
      LIMIT 1
    `,
      productId,
      parishId
    );
    if (!product) return json({ error: 'Event listing not found.' }, { status: 404 });

    const productFields = [];
    const productParams = [];
    for (const [key, column] of [
      ['name', 'name'],
      ['description', 'description'],
      ['eventDate', 'event_date'],
      ['eventLocation', 'event_location'],
      ['eventDetails', 'event_details'],
      ['salesCloseAt', 'sales_close_at'],
    ]) {
      if (body[key] === undefined) continue;
      productFields.push(`${column} = ?`);
      productParams.push(
        String(body[key] || '')
          .trim()
          .slice(0, 1000) || null
      );
    }
    for (const [key, column] of [
      ['eventStartTime', 'event_start_time'],
      ['eventEndTime', 'event_end_time'],
    ]) {
      if (body[key] === undefined) continue;
      try {
        productFields.push(`${column} = ?`);
        productParams.push(eventClockTime(body[key]) || null);
      } catch (error) {
        return json(
          { error: (error as Error).message },
          { status: (error as Error & { status?: number }).status || 422 }
        );
      }
    }
    if (body.status !== undefined) {
      try {
        const status = eventListingStatus(body.status);
        productFields.push(
          'status = ?',
          "published_at = CASE WHEN ? = 'active' THEN COALESCE(published_at, ?) ELSE published_at END"
        );
        productParams.push(status, status, now);
      } catch (error) {
        return json(
          { error: (error as Error).message },
          { status: (error as Error & { status?: number }).status || 422 }
        );
      }
    }
    if (body.showOnCalendar !== undefined) {
      productFields.push('show_on_calendar = ?');
      productParams.push(body.showOnCalendar === false ? 0 : 1);
    }
    if (body.offeringKind !== undefined) {
      try {
        productFields.push('item_category = ?');
        productParams.push(eventOfferingKindFromBody(body));
      } catch (error) {
        return json(
          { error: (error as Error).message },
          { status: (error as Error & { status?: number }).status || 422 }
        );
      }
    }
    if (productFields.length) {
      productFields.push('updated_at = ?');
      productParams.push(now, productId, parishId);
      await d1Run(
        env,
        `UPDATE commerce_products SET ${productFields.join(', ')} WHERE id = ? AND parish_id = ? AND commerce_module = 'events'`,
        ...productParams
      );
    }

    if (product.variant_id) {
      const variantFields = [];
      const variantParams = [];
      if (body.priceCents !== undefined) {
        const priceCents = Math.round(Number(body.priceCents || 0));
        if (!Number.isFinite(priceCents) || priceCents < 1)
          return json({ error: 'Enter a valid price.' }, { status: 422 });
        variantFields.push('unit_price_cents = ?');
        variantParams.push(priceCents);
      }
      if (body.stockQuantity !== undefined) {
        variantFields.push('stock_quantity = ?');
        variantParams.push(Math.max(0, Math.trunc(Number(body.stockQuantity || 0))));
      }
      if (body.trackInventory !== undefined) {
        variantFields.push('track_inventory = ?');
        variantParams.push(body.trackInventory === false ? 0 : 1);
      }
      if (body.maxQuantityPerOrder !== undefined) {
        variantFields.push('max_quantity_per_order = ?');
        variantParams.push(
          body.maxQuantityPerOrder != null && Number(body.maxQuantityPerOrder) > 0
            ? Math.trunc(Number(body.maxQuantityPerOrder))
            : null
        );
      }
      if (variantFields.length) {
        variantFields.push('updated_at = ?');
        variantParams.push(now, product.variant_id, parishId);
        await d1Run(
          env,
          `UPDATE commerce_product_variants SET ${variantFields.join(', ')} WHERE id = ? AND parish_id = ? AND commerce_module = 'events'`,
          ...variantParams
        );
      }
    }

    return json({ ok: true });
  }

  return json({ error: 'Not found' }, { status: 404 });
}
