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

import { d1All, d1First, d1Run, generateSecret } from '../lib/core.js';

import { findRegistrationByParishId } from './parish.js';

import { commerceSuiteEnabledFor } from '../lib/entitlements.js';

import '../lib/commerce-readiness.js';

import '../lib/settlement-profiles.js';

import '../lib/stripe-connect.js';

import '../lib/stripe-fees.js';

import '../lib/sacrament-availability.js';
import './parish-events-shared.js';
import {
  eventOfferingKindFromBody,
  eventListingStatus,
  eventClockTime,
  validTimeZone,
} from './parish-events-shared.js';
import './parish-events.js';
import './event-checkout.js';
import { normalizeEventProductAdmin } from './event-administration.js';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Ministry-delegated side: lets an active ministry leader create and price
// festal-event listings (feast day dinners, festival plates) from inside
// the Ministries workspace in My AGAPAY, without parish-dashboard
// credentials. Called from donor-groups.js's /api/donor/groups/{ministryId}
// routing, AFTER that caller has already verified active ministry
// leadership -- these functions do not re-check ministry membership
// themselves (avoids a circular import with donor-groups.js) and trust the
// caller's auth. They DO independently re-check the parish-level
// commerceSuiteEnabledFor gate, since ministry leadership never implies a
// parish's subscription tier.
//
// Money-safety design choice: creating or pricing a listing requires active
// ministry LEADER status (not just membership), stricter than Schedule/
// Resources in the same workspace, which only require membership -- real
// payment processing is at stake here.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function requireParishCommerceSuite(env: EventEnvironment, parishId: string) {
  const found = await findRegistrationByParishId<EventRegistration>(env, parishId);
  if (!found?.registration || !commerceSuiteEnabledFor(found.registration)) {
    const error = new Error('Meals & Events requires the full AGAPAY Parish Commerce Suite.') as Error & {
      status?: number;
    };
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return found.registration;
}

export async function listMinistryCommerceItems(env: EventEnvironment, parishId: string, ministryId: string) {
  await requireParishCommerceSuite(env, parishId);
  const rows = await d1All<EventSqlRow>(
    env,
    `
    SELECT p.id, p.name, p.description, p.item_category, p.event_date, p.event_start_time, p.event_end_time,
           p.event_timezone, p.show_on_calendar, p.event_location, p.event_details,
           p.sales_close_at, p.status, p.ministry_id,
           v.id AS variant_id, v.variant_name, v.unit_price_cents, v.stock_quantity,
           v.track_inventory, v.max_quantity_per_order,
           COALESCE(sales.units_sold, 0) AS units_sold
    FROM commerce_products p
    LEFT JOIN commerce_product_variants v
      ON v.product_id = p.id AND v.parish_id = p.parish_id AND v.commerce_module = 'events'
    LEFT JOIN (
      SELECT i.variant_id, SUM(i.quantity) AS units_sold
      FROM commerce_order_items i
      JOIN commerce_orders o ON o.id = i.order_id
      WHERE i.parish_id = ? AND i.commerce_module = 'events'
        AND (o.payment_status = 'paid' OR o.status = 'completed')
      GROUP BY i.variant_id
    ) sales ON sales.variant_id = v.id
    WHERE p.parish_id = ? AND p.commerce_module = 'events' AND p.ministry_id = ?
    ORDER BY p.event_date ASC, p.name COLLATE NOCASE
  `,
    parishId,
    parishId,
    ministryId
  );
  return { parishId, items: rows.map(normalizeEventProductAdmin) };
}

export async function createMinistryCommerceItem(
  request: Request,
  env: EventEnvironment,
  parishId: string,
  ministryId: string,
  personId: string
) {
  const registration = await requireParishCommerceSuite(env, parishId);
  let body: EventRequestBody = {};
  try {
    body = (await request.json()) as EventRequestBody;
  } catch {
    const e = new Error('Invalid JSON body') as Error & { status?: number };
    e.status = 400;
    throw e;
  }

  const name = String(body.name || '')
    .trim()
    .slice(0, 180);
  if (!name) {
    const e = new Error('Name is required.') as Error & { status?: number };
    e.status = 422;
    throw e;
  }
  const priceCents = Math.round(Number(body.priceCents || 0));
  if (!Number.isFinite(priceCents) || priceCents < 1) {
    const e = new Error('Enter a valid price.') as Error & { status?: number };
    e.status = 422;
    throw e;
  }
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
  const eventStartTime = eventClockTime(body.eventStartTime);
  const eventEndTime = eventClockTime(body.eventEndTime);
  if (eventEndTime && !eventStartTime) {
    const e = new Error('Add a start time before the end time.') as Error & { status?: number };
    e.status = 422;
    throw e;
  }
  const status = eventListingStatus(body.status);
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
  const offeringKind = eventOfferingKindFromBody(body);

  const now = new Date().toISOString();
  const productId = generateSecret(18);
  const variantId = generateSecret(18);
  await d1Run(
    env,
    `
    INSERT INTO commerce_products
      (id, parish_id, commerce_module, name, description, item_category, fulfillment_type,
       status, event_date, event_start_time, event_end_time, event_timezone, show_on_calendar,
       event_location, event_details, sales_close_at, published_at,
       ministry_id, created_by_person_id, created_at, updated_at)
    VALUES (?, ?, 'events', ?, ?, ?, 'physical_pickup', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    productId,
    parishId,
    name,
    description,
    offeringKind,
    status,
    eventDate || null,
    eventStartTime || null,
    eventEndTime || null,
    validTimeZone(registration.timezone),
    body.showOnCalendar === false ? 0 : 1,
    eventLocation || null,
    eventDetails || null,
    salesCloseAt,
    status === 'active' ? now : null,
    ministryId,
    personId,
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

  return { ok: true, id: productId, variantId, parishId, offeringKind };
}

export async function patchMinistryCommerceItem(
  request: Request,
  env: EventEnvironment,
  parishId: string,
  ministryId: string,
  productId: string
) {
  await requireParishCommerceSuite(env, parishId);
  let body: EventRequestBody = {};
  try {
    body = (await request.json()) as EventRequestBody;
  } catch {
    const e = new Error('Invalid JSON body') as Error & { status?: number };
    e.status = 400;
    throw e;
  }

  // Ownership check: a ministry can only edit listings it created --
  // ministry_id = ? here is what prevents one ministry's leader from
  // editing another ministry's (or full parish-admin's, ministry_id NULL)
  // pricing.
  const product = await d1First<EventSqlRow>(
    env,
    `
    SELECT p.id, v.id AS variant_id FROM commerce_products p
    LEFT JOIN commerce_product_variants v ON v.product_id = p.id AND v.parish_id = p.parish_id AND v.commerce_module = 'events'
    WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'events' AND p.ministry_id = ?
    LIMIT 1
  `,
    productId,
    parishId,
    ministryId
  );
  if (!product) {
    const e = new Error('Event listing not found.') as Error & { status?: number };
    e.status = 404;
    throw e;
  }

  const now = new Date().toISOString();
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
    productFields.push(`${column} = ?`);
    productParams.push(eventClockTime(body[key]) || null);
  }
  if (body.status !== undefined) {
    const status = eventListingStatus(body.status);
    productFields.push(
      'status = ?',
      "published_at = CASE WHEN ? = 'active' THEN COALESCE(published_at, ?) ELSE published_at END"
    );
    productParams.push(status, status, now);
  }
  if (body.showOnCalendar !== undefined) {
    productFields.push('show_on_calendar = ?');
    productParams.push(body.showOnCalendar === false ? 0 : 1);
  }
  if (body.offeringKind !== undefined) {
    productFields.push('item_category = ?');
    productParams.push(eventOfferingKindFromBody(body));
  }
  if (productFields.length) {
    productFields.push('updated_at = ?');
    productParams.push(now, productId, parishId, ministryId);
    await d1Run(
      env,
      `UPDATE commerce_products SET ${productFields.join(', ')} WHERE id = ? AND parish_id = ? AND commerce_module = 'events' AND ministry_id = ?`,
      ...productParams
    );
  }

  if (product.variant_id) {
    const variantFields = [];
    const variantParams = [];
    if (body.priceCents !== undefined) {
      const priceCents = Math.round(Number(body.priceCents || 0));
      if (!Number.isFinite(priceCents) || priceCents < 1) {
        const e = new Error('Enter a valid price.') as Error & { status?: number };
        e.status = 422;
        throw e;
      }
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

  return { ok: true };
}
