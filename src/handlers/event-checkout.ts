import type {
  EventSqlRow,
  EventCartItem,
  EventRequestBody,
  EventEnvironment,
  EventRegistration,
  DonorRecord,
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
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  unauthorized,
} from '../lib/core.js';

import { findOrCreateDonorCustomer, findRegistrationByParishId, requireDonor } from './parish.js';

import { eventsEnabledFor, mealsEnabledFor } from '../lib/entitlements.js';

import { bookstoreSellerDisclosure } from '../lib/commerce-readiness.js';

import { resolveSettlementProfileId } from '../lib/settlement-profiles.js';

import { stripeFormConnectedRequest } from '../lib/stripe-connect.js';

import { donorName } from '../lib/stripe-fees.js';

import '../lib/sacrament-availability.js';
import './parish-events-shared.js';
import {
  normalizeEventQuantity,
  eventOfferingKind,
  normalizeEventProduct,
  salesClosed,
} from './parish-events-shared.js';
import { loadDonorEventProducts } from './parish-events.js';
import './event-administration.js';
import './event-ministry.js';
export async function loadDonorEventOrders(env: EventEnvironment, parishId: string, donorEmail: string) {
  if (!d1(env)) return [];
  const rows = await d1All<EventSqlRow>(
    env,
    `
    SELECT id, order_number, status, payment_status, item_description, quantity,
           subtotal_cents, tax_cents, total_charged_cents, fulfillment_status, pickup_note, created_at
    FROM commerce_orders
    WHERE parish_id = ? AND commerce_module = 'events' AND donor_email = ?
    ORDER BY created_at DESC LIMIT 20
  `,
    parishId,
    donorEmail
  );
  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number || '',
    status: row.status || 'checkout_created',
    paymentStatus: row.payment_status || 'pending',
    itemDescription:
      row.item_description || (eventOfferingKind(row.item_category) === 'meal' ? 'Meal order' : 'Event order'),
    quantity: Number(row.quantity || 1),
    subtotalCents: Number(row.subtotal_cents || 0),
    taxCents: Number(row.tax_cents || 0),
    totalChargedCents: Number(row.total_charged_cents || row.subtotal_cents || 0),
    fulfillmentStatus: row.fulfillment_status || 'pending',
    pickupNote: row.pickup_note || '',
    createdAt: row.created_at || '',
  }));
}
export async function resolveDonorEventsParish(
  request: Request,
  env: EventEnvironment,
  donor: DonorRecord,
  explicitParishId: unknown = ''
) {
  const parishId = String(
    explicitParishId || request.headers.get('X-AGAPAY-Parish-Id') || donor.defaultParishId || ''
  ).trim();
  if (!parishId) return { error: json({ error: 'Choose your parish in Settings before ordering.' }, { status: 422 }) };
  const found = await findRegistrationByParishId<EventRegistration>(env, parishId);
  if (!found?.registration) return { error: json({ error: 'Parish not found.' }, { status: 404 }) };
  const eventsEnabled = eventsEnabledFor(found.registration);
  const mealsEnabled = mealsEnabledFor(found.registration);
  return {
    parishId,
    registration: found.registration,
    eventsEnabled,
    mealsEnabled,
    available: eventsEnabled || mealsEnabled,
  };
}
export async function resolvePublicEventsParish(env: EventEnvironment, parishId: string = '') {
  const cleanParishId = String(parishId || '').trim();
  if (!cleanParishId) return { error: json({ error: 'Parish not found.' }, { status: 404 }) };
  const found = await findRegistrationByParishId<EventRegistration>(env, cleanParishId);
  if (!found?.registration) return { error: json({ error: 'Parish not found.' }, { status: 404 }) };
  const eventsEnabled = eventsEnabledFor(found.registration);
  const mealsEnabled = mealsEnabledFor(found.registration);
  return {
    parishId: cleanParishId,
    registration: found.registration,
    eventsEnabled,
    mealsEnabled,
    available: eventsEnabled || mealsEnabled,
  };
}
export async function normalizeEventCartItems(env: EventEnvironment, parishId: string, items: EventCartItem[]) {
  const normalized = [];
  for (const raw of items) {
    const variantId = String(raw.variantId || '').trim();
    if (!variantId) throw new Error('Choose an item before checkout.') as Error & { status?: number };
    const row = await d1First<EventSqlRow>(
      env,
      `
      SELECT p.id, p.name, p.description, p.item_category, p.default_tax_code, p.fulfillment_type, p.sales_close_at,
             v.id AS variant_id, v.unit_price_cents, v.tax_code, v.fulfillment_type AS variant_fulfillment_type,
             v.stock_quantity, v.track_inventory, v.max_quantity_per_order
      FROM commerce_product_variants v
      JOIN commerce_products p ON p.id = v.product_id
      WHERE p.parish_id = ? AND p.commerce_module = 'events'
        AND p.status = 'active' AND v.status = 'active' AND v.id = ?
      LIMIT 1
    `,
      parishId,
      variantId
    );
    if (!row) throw new Error('One of the selected items is no longer available.') as Error & { status?: number };
    const product = normalizeEventProduct(row);
    if (salesClosed(product)) throw new Error(`Sales for ${product.name} have closed.`) as Error & { status?: number };
    const quantity = normalizeEventQuantity(raw.quantity, product.maxQuantityPerOrder);
    if (product.maxQuantityPerOrder > 0 && Number(raw.quantity || 1) > product.maxQuantityPerOrder) {
      throw new Error(`Limit ${product.maxQuantityPerOrder} per order for ${product.name}.`) as Error & {
        status?: number;
      };
    }
    if (product.trackInventory && quantity > product.stockQuantity) {
      throw new Error(
        product.stockQuantity <= 0
          ? `${product.name} is sold out.`
          : `Only ${product.stockQuantity} of ${product.name} remain.`
      ) as Error & { status?: number };
    }
    normalized.push({
      productId: product.id,
      variantId: product.variantId,
      itemName: product.variantName ? `${product.name} — ${product.variantName}` : product.name,
      itemDescription: product.description || product.name,
      quantity,
      unitPriceCents: product.priceCents,
      taxCode: product.taxCode,
      fulfillmentType: product.fulfillmentType,
      offeringKind: product.offeringKind,
      snapshot: product,
    });
  }
  if (!normalized.length) throw new Error('Add at least one item before checkout.') as Error & { status?: number };
  if (normalized.length > 20)
    throw new Error('Checkout can include up to 20 items at a time.') as Error & { status?: number };
  return normalized;
}

export async function handleDonorEvents(request: Request, env: EventEnvironment, publicParishId: string = '') {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'donor-events', { limit: 40, windowSeconds: 300 });
  if (limited) return limited;

  const isGuestCheckout = Boolean(publicParishId);
  const donor = isGuestCheckout ? null : await requireDonor(request, env);
  if (!isGuestCheckout && !donor?.email) return unauthorized();

  if (request.method === 'GET') {
    const resolved = isGuestCheckout
      ? await resolvePublicEventsParish(env, publicParishId)
      : await resolveDonorEventsParish(request, env, donor!);
    if (resolved.error) return resolved.error;
    return json({
      available: Boolean(resolved.available),
      availability: { events: Boolean(resolved.eventsEnabled), meals: Boolean(resolved.mealsEnabled) },
      parish: { id: resolved.parishId, name: resolved.registration?.name || resolved.registration?.parishName || '' },
      sellerDisclosure: resolved.registration
        ? bookstoreSellerDisclosure(
            resolved.registration.commerceSellerDisplayName ||
              resolved.registration.name ||
              resolved.registration.parishName
          )
        : '',
      items: resolved.available ? await loadDonorEventProducts(env, resolved.parishId, resolved) : [],
      orders: isGuestCheckout ? [] : await loadDonorEventOrders(env, resolved.parishId, normalizeEmail(donor!.email)),
    });
  }

  let body;
  try {
    body = (await request.json()) as EventRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const resolved = isGuestCheckout
    ? await resolvePublicEventsParish(env, publicParishId)
    : await resolveDonorEventsParish(request, env, donor!, body.parishId);
  if (resolved.error) return resolved.error;
  if (!resolved.available) return json({ error: "Your parish hasn't turned on Meals & Events yet." }, { status: 409 });
  if (!resolved.registration?.stripeAccountId) {
    return json(
      { error: 'Your parish needs to connect Stripe before event payments can be accepted.' },
      { status: 422 }
    );
  }
  if (!d1(env)) return missingProductionStoreResponse();

  const submittedItems = Array.isArray(body.items) && body.items.length ? body.items : [body];
  let items;
  try {
    items = await normalizeEventCartItems(env, resolved.parishId, submittedItems);
  } catch (err) {
    return json({ error: (err as Error).message || 'Check your order and try again.' }, { status: 422 });
  }
  if (items.some((item) => item.offeringKind === 'event') && !resolved.eventsEnabled) {
    return json({ error: 'Your parish has Events checkout turned off.' }, { status: 409 });
  }
  if (items.some((item) => item.offeringKind === 'meal') && !resolved.mealsEnabled) {
    return json({ error: 'Your parish has Meals checkout turned off.' }, { status: 409 });
  }

  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const donorEmail = normalizeEmail(donor?.email || body.email);
  if (!donorEmail || !donorEmail.includes('@')) {
    return json({ error: 'Enter a valid email address for your receipt.' }, { status: 422 });
  }
  const guestName = String(body.name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 160);
  if (isGuestCheckout && !guestName) {
    return json({ error: 'Enter your name before checkout.' }, { status: 422 });
  }
  const normalizedDonorName = isGuestCheckout
    ? guestName
    : donorName({
        firstName: donor?.firstName || '',
        lastName: donor?.lastName || '',
        householdName: donor?.householdName || donor?.donorName || '',
      }) ||
      donor?.householdName ||
      donor?.donorName ||
      donorEmail;
  const pickupNote = String(body.pickupNote || '')
    .trim()
    .slice(0, 240);
  const orderId = `event_${generateSecret(18)}`;
  const checkoutLocalId = `checkout_${generateSecret(18)}`;
  const now = new Date().toISOString();
  const firstItem = items[0];
  const itemDescription = items.length === 1 ? firstItem.itemName : `${items.length} Meals & Events items`;
  const quantityTotal = items.reduce((sum, item) => sum + item.quantity, 0);
  const orderOfferingKind = items.every((item) => item.offeringKind === firstItem.offeringKind)
    ? firstItem.offeringKind
    : 'event';

  const customer = await findOrCreateDonorCustomer(
    env,
    {
      id: resolved.parishId,
      name: resolved.registration.name || '',
      stripeAccountId: resolved.registration.stripeAccountId || '',
    },
    { email: donorEmail, firstName: normalizedDonorName, lastName: '' }
  );
  if (!customer.ok) {
    return json(
      { error: 'Stripe customer setup failed', detail: customer.body.error?.message || 'Unknown Stripe error' },
      { status: 502 }
    );
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const sellerDisplayName =
    resolved.registration.commerceSellerDisplayName ||
    resolved.registration.name ||
    resolved.registration.parishName ||
    '';
  const sellerDisclosure = bookstoreSellerDisclosure(sellerDisplayName);
  const publicStorePath = `/${encodeURIComponent(resolved.parishId)}/events`;
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: isGuestCheckout
      ? `${appUrl}${publicStorePath}?order_success=1&session_id={CHECKOUT_SESSION_ID}`
      : `${appUrl}/myagapay/events?order_success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: isGuestCheckout
      ? `${appUrl}${publicStorePath}?order_canceled=1`
      : `${appUrl}/myagapay/events?order_canceled=1`,
    customer: customer.body.id,
    'automatic_tax[enabled]': 'true',
    'customer_update[address]': 'auto',
    'custom_text[submit][message]': sellerDisclosure.slice(0, 499),
  });

  // Same no-AGAPAY-fee posture as Bookstore -- Parish Commerce (Meals &
  // Events included) is part of AGAPAY Parish +. Stripe's own processing
  // fee and any applicable tax still apply.
  const eventsFallbackTaxCode =
    env.EVENTS_STRIPE_TAX_CODE || env.PARISH_COMMERCE_DEFAULT_TAX_CODE || env.BOOKSTORE_STRIPE_TAX_CODE || '';
  const mealsFallbackTaxCode =
    env.MEALS_STRIPE_TAX_CODE ||
    env.EVENTS_STRIPE_TAX_CODE ||
    env.PARISH_COMMERCE_DEFAULT_TAX_CODE ||
    env.BOOKSTORE_STRIPE_TAX_CODE ||
    '';
  items.forEach((item, index) => {
    const lineTaxCode = item.taxCode || (item.offeringKind === 'meal' ? mealsFallbackTaxCode : eventsFallbackTaxCode);
    form.set(`line_items[${index}][quantity]`, String(item.quantity));
    form.set(`line_items[${index}][price_data][currency]`, 'usd');
    form.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitPriceCents));
    form.set(`line_items[${index}][price_data][tax_behavior]`, 'exclusive');
    form.set(`line_items[${index}][price_data][product_data][name]`, item.itemName.slice(0, 180));
    if (item.itemDescription && item.itemDescription !== item.itemName) {
      form.set(`line_items[${index}][price_data][product_data][description]`, item.itemDescription.slice(0, 280));
    }
    if (lineTaxCode) form.set(`line_items[${index}][price_data][product_data][tax_code]`, lineTaxCode);
  });

  const metadata = {
    order_id: orderId,
    parish_id: resolved.parishId,
    commerce_module: 'events',
    agapay_payment_class: 'nonqualifying_commerce',
    agapay_classification_version: '1',
    donor_email: donorEmail,
    donor_name: normalizedDonorName,
    offering_kind: orderOfferingKind,
    item_count: String(items.length),
    subtotal_cents: String(subtotalCents),
  };
  for (const [key, value] of Object.entries(metadata)) {
    form.set(`metadata[${key}]`, value);
    form.set(`payment_intent_data[metadata][${key}]`, value);
  }

  const session = await stripeFormConnectedRequest(
    env,
    '/v1/checkout/sessions',
    form,
    resolved.registration.stripeAccountId
  );
  if (!session.ok) {
    return json(
      { error: 'Stripe checkout session failed', detail: session.body.error?.message || 'Unknown Stripe error' },
      { status: 502 }
    );
  }

  const settlementProfileId = await resolveSettlementProfileId(env, resolved.parishId, 'events');

  await d1Run(
    env,
    `
    INSERT INTO commerce_orders
      (id, commerce_module, source, parish_id, donor_email, donor_name,
       product_id, product_sku, variant_id, tax_code, product_snapshot_json,
       item_category, item_description, quantity, unit_price_cents, subtotal_cents,
       tax_cents, agapay_fee_cents, stripe_fee_cents, cover_fees, total_charged_cents,
       parish_net_cents, status, payment_status, checkout_session_local_id,
       checkout_session_id, checkout_url, stripe_customer_id, fulfillment_status,
       pickup_note, settlement_profile_id, created_at, updated_at)
    VALUES (?, 'events', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?,
            'checkout_created', 'pending', ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `,
    orderId,
    isGuestCheckout ? 'guest_checkout' : 'catalog',
    resolved.parishId,
    donorEmail,
    normalizedDonorName,
    firstItem.productId,
    firstItem.variantId,
    firstItem.taxCode,
    JSON.stringify({ items: items.map((item) => item.snapshot) }).slice(0, 12000),
    orderOfferingKind,
    itemDescription,
    quantityTotal,
    firstItem.unitPriceCents,
    subtotalCents,
    body.coverFees === false ? 0 : 1,
    subtotalCents,
    subtotalCents,
    checkoutLocalId,
    session.body.id,
    session.body.url || '',
    customer.body.id || '',
    pickupNote,
    settlementProfileId,
    now,
    now
  );

  for (const item of items) {
    const itemSubtotal = item.unitPriceCents * item.quantity;
    await d1Run(
      env,
      `
      INSERT INTO commerce_order_items
        (id, order_id, parish_id, commerce_module, product_id, variant_id, sku, barcode,
         barcode_type, item_category, item_name, item_description, quantity, unit_price_cents,
         subtotal_cents, tax_cents, total_cents, tax_code, snapshot_json,
         fulfillment_type, fulfillment_status, created_at, updated_at)
      VALUES (?, ?, ?, 'events', ?, ?, '', '', '', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', ?, ?)
    `,
      `event_item_${generateSecret(18)}`,
      orderId,
      resolved.parishId,
      item.productId,
      item.variantId,
      item.offeringKind,
      item.itemName,
      item.itemDescription,
      item.quantity,
      item.unitPriceCents,
      itemSubtotal,
      itemSubtotal,
      item.taxCode,
      JSON.stringify(item.snapshot).slice(0, 4000),
      item.fulfillmentType,
      now,
      now
    );
  }

  return json({ ok: true, id: session.body.id, orderId, url: session.body.url }, { status: 201 });
}
