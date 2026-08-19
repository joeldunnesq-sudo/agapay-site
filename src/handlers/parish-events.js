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
  normalizeEmail,
  rateLimit,
  unauthorized,
} from "../lib/core.js";

import {
  findOrCreateDonorCustomer,
  findRegistrationByParishId,
  requireDonor,
  verifyParishDashboardBearer,
} from "./parish.js";

import { commerceSuiteEnabledFor } from "../lib/entitlements.js";
import { bookstoreSellerDisclosure } from "../lib/commerce-readiness.js";
import { resolveSettlementProfileId } from "../lib/settlement-profiles.js";
import { stripeFormConnectedRequest } from "../lib/stripe-connect.js";
import { donorName } from "../lib/stripe-fees.js";

function centsFromEventAmount(value) {
  const number = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0;
}

function normalizeEventQuantity(value, maxPerOrder) {
  const quantity = Math.trunc(Number(value || 1));
  const ceiling = Number.isFinite(Number(maxPerOrder)) && Number(maxPerOrder) > 0 ? Number(maxPerOrder) : 50;
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(quantity, ceiling);
}

const EVENT_OFFERING_KINDS = new Set(["event", "meal"]);

function eventOfferingKind(value) {
  return String(value || "").trim().toLowerCase() === "meal" ? "meal" : "event";
}

function requestedEventOfferingKind(request) {
  const value = String(new URL(request.url).searchParams.get("offeringKind") || "").trim().toLowerCase();
  return EVENT_OFFERING_KINDS.has(value) ? value : "";
}

function eventOfferingKindFromBody(body = {}) {
  const value = String(body.offeringKind || "event").trim().toLowerCase();
  if (!EVENT_OFFERING_KINDS.has(value)) {
    const error = new Error("Choose either Event or Meal.");
    error.status = 422;
    throw error;
  }
  return value;
}

function normalizeEventProduct(row = {}) {
  const priceCents = Number(row.unit_price_cents || 0);
  return {
    id: row.id || "",
    variantId: row.variant_id || "",
    name: row.name || "Event item",
    description: row.description || "",
    eventDate: row.event_date || "",
    eventLocation: row.event_location || "",
    eventDetails: row.event_details || "",
    offeringKind: eventOfferingKind(row.item_category),
    salesCloseAt: row.sales_close_at || "",
    variantName: row.variant_name || "",
    taxCode: row.tax_code || row.default_tax_code || "",
    fulfillmentType: row.variant_fulfillment_type || row.fulfillment_type || "physical_pickup",
    priceCents,
    priceLabel: `$${(priceCents / 100).toFixed(2)}`,
    stockQuantity: Number(row.stock_quantity || 0),
    trackInventory: Number(row.track_inventory ?? 1) !== 0,
    maxQuantityPerOrder: row.max_quantity_per_order != null ? Number(row.max_quantity_per_order) : 0,
    unitsSold: Number(row.units_sold || 0),
    imageUrl: row.image_url || ""
  };
}

function salesClosed(product) {
  if (!product.salesCloseAt) return false;
  const closeTime = Date.parse(product.salesCloseAt);
  if (!Number.isFinite(closeTime)) return false;
  return Date.now() > closeTime;
}

export async function loadDonorEventProducts(env, parishId) {
  if (!d1(env)) return [];
  const rows = await d1All(env, `
    SELECT p.id, p.name, p.description, p.item_category, p.event_date, p.event_location, p.event_details,
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
  `, parishId, parishId);
  return rows.map(normalizeEventProduct).filter(product => product.variantId && product.priceCents > 0);
}

async function loadDonorEventOrders(env, parishId, donorEmail) {
  if (!d1(env)) return [];
  const rows = await d1All(env, `
    SELECT id, order_number, status, payment_status, item_description, quantity,
           subtotal_cents, tax_cents, total_charged_cents, fulfillment_status, pickup_note, created_at
    FROM commerce_orders
    WHERE parish_id = ? AND commerce_module = 'events' AND donor_email = ?
    ORDER BY created_at DESC LIMIT 20
  `, parishId, donorEmail);
  return rows.map(row => ({
    id: row.id,
    orderNumber: row.order_number || "",
    status: row.status || "checkout_created",
    paymentStatus: row.payment_status || "pending",
    itemDescription: row.item_description || (eventOfferingKind(row.item_category) === "meal" ? "Meal order" : "Event order"),
    quantity: Number(row.quantity || 1),
    subtotalCents: Number(row.subtotal_cents || 0),
    taxCents: Number(row.tax_cents || 0),
    totalChargedCents: Number(row.total_charged_cents || row.subtotal_cents || 0),
    fulfillmentStatus: row.fulfillment_status || "pending",
    pickupNote: row.pickup_note || "",
    createdAt: row.created_at || ""
  }));
}

async function resolveDonorEventsParish(request, env, donor, explicitParishId = "") {
  const parishId = String(explicitParishId || request.headers.get("X-AGAPAY-Parish-Id") || donor.defaultParishId || "").trim();
  if (!parishId) return { error: json({ error: "Choose your parish in Settings before ordering." }, { status: 422 }) };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found?.registration) return { error: json({ error: "Parish not found." }, { status: 404 }) };
  return { parishId, registration: found.registration, available: commerceSuiteEnabledFor(found.registration) };
}

async function resolvePublicEventsParish(env, parishId = "") {
  const cleanParishId = String(parishId || "").trim();
  if (!cleanParishId) return { error: json({ error: "Parish not found." }, { status: 404 }) };
  const found = await findRegistrationByParishId(env, cleanParishId);
  if (!found?.registration) return { error: json({ error: "Parish not found." }, { status: 404 }) };
  return {
    parishId: cleanParishId,
    registration: found.registration,
    available: commerceSuiteEnabledFor(found.registration)
  };
}

async function normalizeEventCartItems(env, parishId, items) {
  const normalized = [];
  for (const raw of items) {
    const variantId = String(raw.variantId || "").trim();
    if (!variantId) throw new Error("Choose an item before checkout.");
    const row = await d1First(env, `
      SELECT p.id, p.name, p.description, p.item_category, p.default_tax_code, p.fulfillment_type, p.sales_close_at,
             v.id AS variant_id, v.unit_price_cents, v.tax_code, v.fulfillment_type AS variant_fulfillment_type,
             v.stock_quantity, v.track_inventory, v.max_quantity_per_order
      FROM commerce_product_variants v
      JOIN commerce_products p ON p.id = v.product_id
      WHERE p.parish_id = ? AND p.commerce_module = 'events'
        AND p.status = 'active' AND v.status = 'active' AND v.id = ?
      LIMIT 1
    `, parishId, variantId);
    if (!row) throw new Error("One of the selected items is no longer available.");
    const product = normalizeEventProduct(row);
    if (salesClosed(product)) throw new Error(`Sales for ${product.name} have closed.`);
    const quantity = normalizeEventQuantity(raw.quantity, product.maxQuantityPerOrder);
    if (product.maxQuantityPerOrder > 0 && Number(raw.quantity || 1) > product.maxQuantityPerOrder) {
      throw new Error(`Limit ${product.maxQuantityPerOrder} per order for ${product.name}.`);
    }
    if (product.trackInventory && quantity > product.stockQuantity) {
      throw new Error(product.stockQuantity <= 0
        ? `${product.name} is sold out.`
        : `Only ${product.stockQuantity} of ${product.name} remain.`);
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
      snapshot: product
    });
  }
  if (!normalized.length) throw new Error("Add at least one item before checkout.");
  if (normalized.length > 20) throw new Error("Checkout can include up to 20 items at a time.");
  return normalized;
}

export async function handleDonorEvents(request, env, publicParishId = "") {
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-events", { limit: 40, windowSeconds: 300 });
  if (limited) return limited;

  const isGuestCheckout = Boolean(publicParishId);
  const donor = isGuestCheckout ? null : await requireDonor(request, env);
  if (!isGuestCheckout && !donor?.email) return unauthorized();

  if (request.method === "GET") {
    const resolved = isGuestCheckout
      ? await resolvePublicEventsParish(env, publicParishId)
      : await resolveDonorEventsParish(request, env, donor);
    if (resolved.error) return resolved.error;
    return json({
      available: Boolean(resolved.available),
      parish: { id: resolved.parishId, name: resolved.registration?.name || resolved.registration?.parishName || "" },
      sellerDisclosure: resolved.registration ? bookstoreSellerDisclosure(resolved.registration.commerceSellerDisplayName || resolved.registration.name || resolved.registration.parishName) : "",
      items: resolved.available ? await loadDonorEventProducts(env, resolved.parishId) : [],
      orders: isGuestCheckout ? [] : await loadDonorEventOrders(env, resolved.parishId, normalizeEmail(donor.email))
    });
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }

  const resolved = isGuestCheckout
    ? await resolvePublicEventsParish(env, publicParishId)
    : await resolveDonorEventsParish(request, env, donor, body.parishId);
  if (resolved.error) return resolved.error;
  if (!resolved.available) return json({ error: "Your parish hasn't turned on Meals & Events yet." }, { status: 409 });
  if (!resolved.registration?.stripeAccountId) {
    return json({ error: "Your parish needs to connect Stripe before event payments can be accepted." }, { status: 422 });
  }
  if (!d1(env)) return missingProductionStoreResponse();

  const submittedItems = Array.isArray(body.items) && body.items.length ? body.items : [body];
  let items;
  try { items = await normalizeEventCartItems(env, resolved.parishId, submittedItems); }
  catch (err) { return json({ error: err.message || "Check your order and try again." }, { status: 422 }); }

  const subtotalCents = items.reduce((sum, item) => sum + (item.unitPriceCents * item.quantity), 0);
  const donorEmail = normalizeEmail(donor?.email || body.email);
  if (!donorEmail || !donorEmail.includes("@")) {
    return json({ error: "Enter a valid email address for your receipt." }, { status: 422 });
  }
  const guestName = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (isGuestCheckout && !guestName) {
    return json({ error: "Enter your name before checkout." }, { status: 422 });
  }
  const normalizedDonorName = isGuestCheckout ? guestName : (donorName({
    firstName: donor?.firstName || "",
    lastName: donor?.lastName || "",
    householdName: donor?.householdName || donor?.donorName || ""
  }) || donor?.householdName || donor?.donorName || donorEmail);
  const pickupNote = String(body.pickupNote || "").trim().slice(0, 240);
  const orderId = `event_${generateSecret(18)}`;
  const checkoutLocalId = `checkout_${generateSecret(18)}`;
  const now = new Date().toISOString();
  const firstItem = items[0];
  const itemDescription = items.length === 1 ? firstItem.itemName : `${items.length} Meals & Events items`;
  const quantityTotal = items.reduce((sum, item) => sum + item.quantity, 0);
  const orderOfferingKind = items.every(item => item.offeringKind === firstItem.offeringKind)
    ? firstItem.offeringKind
    : "event";

  const customer = await findOrCreateDonorCustomer(env, {
    id: resolved.parishId,
    name: resolved.registration.name || "",
    stripeAccountId: resolved.registration.stripeAccountId || ""
  }, { email: donorEmail, firstName: normalizedDonorName, lastName: "" });
  if (!customer.ok) {
    return json({ error: "Stripe customer setup failed", detail: customer.body.error?.message || "Unknown Stripe error" }, { status: 502 });
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const sellerDisplayName = resolved.registration.commerceSellerDisplayName || resolved.registration.name || resolved.registration.parishName || "";
  const sellerDisclosure = bookstoreSellerDisclosure(sellerDisplayName);
  const publicStorePath = `/${encodeURIComponent(resolved.parishId)}/events`;
  const form = new URLSearchParams({
    mode: "payment",
    success_url: isGuestCheckout
      ? `${appUrl}${publicStorePath}?order_success=1&session_id={CHECKOUT_SESSION_ID}`
      : `${appUrl}/myagapay/events?order_success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: isGuestCheckout
      ? `${appUrl}${publicStorePath}?order_canceled=1`
      : `${appUrl}/myagapay/events?order_canceled=1`,
    customer: customer.body.id,
    "automatic_tax[enabled]": "true",
    "customer_update[address]": "auto",
    "custom_text[submit][message]": sellerDisclosure.slice(0, 499)
  });

  // Same no-AGAPAY-fee posture as Bookstore -- Parish Commerce (Meals &
  // Events included) is part of AGAPAY Parish +. Stripe's own processing
  // fee and any applicable tax still apply.
  const eventsFallbackTaxCode = env.EVENTS_STRIPE_TAX_CODE
    || env.PARISH_COMMERCE_DEFAULT_TAX_CODE
    || env.BOOKSTORE_STRIPE_TAX_CODE
    || "";
  const mealsFallbackTaxCode = env.MEALS_STRIPE_TAX_CODE
    || env.EVENTS_STRIPE_TAX_CODE
    || env.PARISH_COMMERCE_DEFAULT_TAX_CODE
    || env.BOOKSTORE_STRIPE_TAX_CODE
    || "";
  items.forEach((item, index) => {
    const lineTaxCode = item.taxCode || (item.offeringKind === "meal" ? mealsFallbackTaxCode : eventsFallbackTaxCode);
    form.set(`line_items[${index}][quantity]`, String(item.quantity));
    form.set(`line_items[${index}][price_data][currency]`, "usd");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitPriceCents));
    form.set(`line_items[${index}][price_data][tax_behavior]`, "exclusive");
    form.set(`line_items[${index}][price_data][product_data][name]`, item.itemName.slice(0, 180));
    if (item.itemDescription && item.itemDescription !== item.itemName) {
      form.set(`line_items[${index}][price_data][product_data][description]`, item.itemDescription.slice(0, 280));
    }
    if (lineTaxCode) form.set(`line_items[${index}][price_data][product_data][tax_code]`, lineTaxCode);
  });

  const metadata = {
    order_id: orderId,
    parish_id: resolved.parishId,
    commerce_module: "events",
    agapay_payment_class: "nonqualifying_commerce",
    agapay_classification_version: "1",
    donor_email: donorEmail,
    donor_name: normalizedDonorName,
    offering_kind: orderOfferingKind,
    item_count: String(items.length),
    subtotal_cents: String(subtotalCents)
  };
  for (const [key, value] of Object.entries(metadata)) {
    form.set(`metadata[${key}]`, value);
    form.set(`payment_intent_data[metadata][${key}]`, value);
  }

  const session = await stripeFormConnectedRequest(env, "/v1/checkout/sessions", form, resolved.registration.stripeAccountId);
  if (!session.ok) {
    return json({ error: "Stripe checkout session failed", detail: session.body.error?.message || "Unknown Stripe error" }, { status: 502 });
  }

  const settlementProfileId = await resolveSettlementProfileId(env, resolved.parishId, "events");

  await d1Run(env, `
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
    isGuestCheckout ? "guest_checkout" : "catalog",
    resolved.parishId,
    donorEmail,
    normalizedDonorName,
    firstItem.productId,
    firstItem.variantId,
    firstItem.taxCode,
    JSON.stringify({ items: items.map(item => item.snapshot) }).slice(0, 12000),
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
    session.body.url || "",
    customer.body.id || "",
    pickupNote,
    settlementProfileId,
    now,
    now
  );

  for (const item of items) {
    const itemSubtotal = item.unitPriceCents * item.quantity;
    await d1Run(env, `
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Parish-admin side: create, list, edit, and archive event/meal listings.
// Same auth shape as handleParishBookstore (bearer token + entitlement
// check), routed the same way from worker.js:
//   /api/parish/dashboard/{parishId}/events/{subpath}
// Gated on commerceSuiteEnabledFor to match the donor-side gate above,
// rather than hasParishPlusAccess (the base Bookstore gate) -- Meals &
// Events is the second commerce module, reserved for the fuller tier.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function normalizeEventProductAdmin(row = {}) {
  return {
    id: row.id,
    name: row.name || "",
    description: row.description || "",
    offeringKind: eventOfferingKind(row.item_category),
    eventDate: row.event_date || "",
    eventLocation: row.event_location || "",
    eventDetails: row.event_details || "",
    salesCloseAt: row.sales_close_at || "",
    status: row.status || "active",
    variantId: row.variant_id || "",
    variantName: row.variant_name || "",
    priceCents: Number(row.unit_price_cents || 0),
    stockQuantity: Number(row.stock_quantity || 0),
    trackInventory: Number(row.track_inventory ?? 1) !== 0,
    maxQuantityPerOrder: row.max_quantity_per_order != null ? Number(row.max_quantity_per_order) : 0,
    unitsSold: Number(row.units_sold || 0),
    ministryId: row.ministry_id || "",
    ministryName: row.ministry_id ? (row.ministry_name || "Ministry") : "Parish"
  };
}

async function requireEventsParishAuth(request, env, parishId) {
  if (!hasProductionStore(env)) return { error: missingProductionStoreResponse() };
  if (!d1(env)) return { error: missingProductionStoreResponse() };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { error: json({ error: "Parish dashboard record not found" }, { status: 404 }) };
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return { error: unauthorized() };
  if (!commerceSuiteEnabledFor(found.registration)) {
    return { error: json({ error: "Meals & Events requires the full AGAPAY Parish Commerce Suite." }, { status: 403 }) };
  }
  return { registration: found.registration };
}

export async function handleParishEvents(request, env, parishId, subpath = "") {
  const limited = await rateLimit(request, env, "parish-events", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;

  const auth = await requireEventsParishAuth(request, env, parishId);
  if (auth.error) return auth.error;

  const segments = String(subpath || "").replace(/^\/+/, "").split("/").filter(Boolean);
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
  if (request.method === "GET" && segments.length === 0) {
    const rows = await d1All(env, `
      SELECT p.id, p.name, p.description, p.item_category, p.event_date, p.event_location, p.event_details,
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
    `, parishId, parishId, offeringKind, offeringKind);
    return json({ offeringKind, items: rows.map(normalizeEventProductAdmin) });
  }

  // GET /sales -- paid Events orders and tax totals for parish oversight.
  if (request.method === "GET" && segments.length === 1 && segments[0] === "sales") {
    const summary = await d1First(env, `
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
    `, parishId, offeringKind, offeringKind);
    const orders = await d1All(env, `
      SELECT id, order_number, donor_name, donor_email, item_category, item_description, quantity,
             subtotal_cents, tax_cents, total_charged_cents, parish_net_cents,
             payment_status, fulfillment_status, receipt_email_status, completed_at, created_at
      FROM commerce_orders
      WHERE parish_id = ? AND commerce_module = 'events'
        AND payment_status IN ('paid', 'partially_refunded', 'refunded')
        AND (? = '' OR CASE WHEN LOWER(COALESCE(item_category, '')) = 'meal' THEN 'meal' ELSE 'event' END = ?)
      ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
      LIMIT 50
    `, parishId, offeringKind, offeringKind);
    return json({
      offeringKind,
      kpis: {
        orderCount: Number(summary?.order_count || 0),
        subtotalCents: Number(summary?.subtotal_cents || 0),
        taxCents: Number(summary?.tax_cents || 0),
        totalChargedCents: Number(summary?.total_charged_cents || 0),
        stripeFeeCents: Number(summary?.stripe_fee_cents || 0),
        parishNetCents: Number(summary?.parish_net_cents || 0)
      },
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.order_number || "",
        donorName: order.donor_name || "",
        donorEmail: order.donor_email || "",
        itemDescription: order.item_description || (eventOfferingKind(order.item_category) === "meal" ? "Meal order" : "Event order"),
        quantity: Number(order.quantity || 1),
        subtotalCents: Number(order.subtotal_cents || 0),
        taxCents: Number(order.tax_cents || 0),
        totalChargedCents: Number(order.total_charged_cents || 0),
        parishNetCents: Number(order.parish_net_cents || 0),
        paymentStatus: order.payment_status || "pending",
        fulfillmentStatus: order.fulfillment_status || "pending",
        receiptEmailStatus: order.receipt_email_status || "",
        offeringKind: eventOfferingKind(order.item_category),
        completedAt: order.completed_at || order.created_at || ""
      }))
    });
  }

  // POST / -- create a new event/meal listing (product + its one variant).
  if (request.method === "POST" && segments.length === 0) {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }

    const name = String(body.name || "").trim().slice(0, 180);
    if (!name) return json({ error: "Name is required." }, { status: 422 });
    const priceCents = Math.round(Number(body.priceCents || 0));
    if (!Number.isFinite(priceCents) || priceCents < 1) return json({ error: "Enter a valid price." }, { status: 422 });
    const stockQuantity = Math.max(0, Math.trunc(Number(body.stockQuantity || 0)));
    const trackInventory = body.trackInventory === false ? 0 : 1;
    const maxQuantityPerOrder = body.maxQuantityPerOrder != null && Number(body.maxQuantityPerOrder) > 0
      ? Math.trunc(Number(body.maxQuantityPerOrder))
      : null;
    const description = String(body.description || "").trim().slice(0, 600);
    const eventDate = String(body.eventDate || "").trim().slice(0, 40);
    const eventLocation = String(body.eventLocation || "").trim().slice(0, 200);
    const eventDetails = String(body.eventDetails || "").trim().slice(0, 1000);
    const salesCloseAt = String(body.salesCloseAt || "").trim().slice(0, 40) || null;
    let newOfferingKind;
    try { newOfferingKind = eventOfferingKindFromBody(body); }
    catch (error) { return json({ error: error.message }, { status: error.status || 422 }); }

    const productId = generateSecret(18);
    const variantId = generateSecret(18);
    await d1Run(env, `
      INSERT INTO commerce_products
        (id, parish_id, commerce_module, name, description, item_category, fulfillment_type,
         status, event_date, event_location, event_details, sales_close_at, created_at, updated_at)
      VALUES (?, ?, 'events', ?, ?, ?, 'physical_pickup', 'active', ?, ?, ?, ?, ?, ?)
    `, productId, parishId, name, description, newOfferingKind, eventDate || null, eventLocation || null, eventDetails || null, salesCloseAt, now, now);
    await d1Run(env, `
      INSERT INTO commerce_product_variants
        (id, product_id, parish_id, commerce_module, variant_name, unit_price_cents,
         stock_quantity, track_inventory, max_quantity_per_order, status, created_at, updated_at)
      VALUES (?, ?, ?, 'events', '', ?, ?, ?, ?, 'active', ?, ?)
    `, variantId, productId, parishId, priceCents, stockQuantity, trackInventory, maxQuantityPerOrder, now, now);

    return json({ ok: true, id: productId, variantId, offeringKind: newOfferingKind }, { status: 201 });
  }

  // PATCH /:productId -- edit price/stock/cap/status/event details.
  if (request.method === "PATCH" && segments.length === 1) {
    const productId = segments[0];
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }

    const product = await d1First(env, `
      SELECT p.id, v.id AS variant_id FROM commerce_products p
      LEFT JOIN commerce_product_variants v ON v.product_id = p.id AND v.parish_id = p.parish_id AND v.commerce_module = 'events'
      WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'events'
      LIMIT 1
    `, productId, parishId);
    if (!product) return json({ error: "Event listing not found." }, { status: 404 });

    const productFields = [];
    const productParams = [];
    for (const [key, column] of [
      ["name", "name"], ["description", "description"], ["eventDate", "event_date"],
      ["eventLocation", "event_location"], ["eventDetails", "event_details"],
      ["salesCloseAt", "sales_close_at"], ["status", "status"]
    ]) {
      if (body[key] === undefined) continue;
      productFields.push(`${column} = ?`);
      productParams.push(String(body[key] || "").trim().slice(0, 1000) || null);
    }
    if (body.offeringKind !== undefined) {
      try {
        productFields.push("item_category = ?");
        productParams.push(eventOfferingKindFromBody(body));
      } catch (error) {
        return json({ error: error.message }, { status: error.status || 422 });
      }
    }
    if (productFields.length) {
      productFields.push("updated_at = ?");
      productParams.push(now, productId, parishId);
      await d1Run(env, `UPDATE commerce_products SET ${productFields.join(", ")} WHERE id = ? AND parish_id = ? AND commerce_module = 'events'`, ...productParams);
    }

    if (product.variant_id) {
      const variantFields = [];
      const variantParams = [];
      if (body.priceCents !== undefined) {
        const priceCents = Math.round(Number(body.priceCents || 0));
        if (!Number.isFinite(priceCents) || priceCents < 1) return json({ error: "Enter a valid price." }, { status: 422 });
        variantFields.push("unit_price_cents = ?"); variantParams.push(priceCents);
      }
      if (body.stockQuantity !== undefined) {
        variantFields.push("stock_quantity = ?"); variantParams.push(Math.max(0, Math.trunc(Number(body.stockQuantity || 0))));
      }
      if (body.trackInventory !== undefined) {
        variantFields.push("track_inventory = ?"); variantParams.push(body.trackInventory === false ? 0 : 1);
      }
      if (body.maxQuantityPerOrder !== undefined) {
        variantFields.push("max_quantity_per_order = ?");
        variantParams.push(body.maxQuantityPerOrder != null && Number(body.maxQuantityPerOrder) > 0 ? Math.trunc(Number(body.maxQuantityPerOrder)) : null);
      }
      if (variantFields.length) {
        variantFields.push("updated_at = ?");
        variantParams.push(now, product.variant_id, parishId);
        await d1Run(env, `UPDATE commerce_product_variants SET ${variantFields.join(", ")} WHERE id = ? AND parish_id = ? AND commerce_module = 'events'`, ...variantParams);
      }
    }

    return json({ ok: true });
  }

  return json({ error: "Not found" }, { status: 404 });
}

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

export async function requireParishCommerceSuite(env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found?.registration || !commerceSuiteEnabledFor(found.registration)) {
    const error = new Error("Meals & Events requires the full AGAPAY Parish Commerce Suite.");
    error.status = 403;
    throw error;
  }
  return found.registration;
}

export async function listMinistryCommerceItems(env, parishId, ministryId) {
  await requireParishCommerceSuite(env, parishId);
  const rows = await d1All(env, `
    SELECT p.id, p.name, p.description, p.item_category, p.event_date, p.event_location, p.event_details,
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
  `, parishId, parishId, ministryId);
  return { parishId, items: rows.map(normalizeEventProductAdmin) };
}

export async function createMinistryCommerceItem(request, env, parishId, ministryId, personId) {
  await requireParishCommerceSuite(env, parishId);
  let body = {};
  try { body = await request.json(); } catch { const e = new Error("Invalid JSON body"); e.status = 400; throw e; }

  const name = String(body.name || "").trim().slice(0, 180);
  if (!name) { const e = new Error("Name is required."); e.status = 422; throw e; }
  const priceCents = Math.round(Number(body.priceCents || 0));
  if (!Number.isFinite(priceCents) || priceCents < 1) { const e = new Error("Enter a valid price."); e.status = 422; throw e; }
  const stockQuantity = Math.max(0, Math.trunc(Number(body.stockQuantity || 0)));
  const trackInventory = body.trackInventory === false ? 0 : 1;
  const maxQuantityPerOrder = body.maxQuantityPerOrder != null && Number(body.maxQuantityPerOrder) > 0
    ? Math.trunc(Number(body.maxQuantityPerOrder))
    : null;
  const description = String(body.description || "").trim().slice(0, 600);
  const eventDate = String(body.eventDate || "").trim().slice(0, 40);
  const eventLocation = String(body.eventLocation || "").trim().slice(0, 200);
  const eventDetails = String(body.eventDetails || "").trim().slice(0, 1000);
  const salesCloseAt = String(body.salesCloseAt || "").trim().slice(0, 40) || null;
  const offeringKind = eventOfferingKindFromBody(body);

  const now = new Date().toISOString();
  const productId = generateSecret(18);
  const variantId = generateSecret(18);
  await d1Run(env, `
    INSERT INTO commerce_products
      (id, parish_id, commerce_module, name, description, item_category, fulfillment_type,
       status, event_date, event_location, event_details, sales_close_at,
       ministry_id, created_by_person_id, created_at, updated_at)
    VALUES (?, ?, 'events', ?, ?, ?, 'physical_pickup', 'active', ?, ?, ?, ?, ?, ?, ?, ?)
  `, productId, parishId, name, description, offeringKind, eventDate || null, eventLocation || null, eventDetails || null, salesCloseAt, ministryId, personId, now, now);
  await d1Run(env, `
    INSERT INTO commerce_product_variants
      (id, product_id, parish_id, commerce_module, variant_name, unit_price_cents,
       stock_quantity, track_inventory, max_quantity_per_order, status, created_at, updated_at)
    VALUES (?, ?, ?, 'events', '', ?, ?, ?, ?, 'active', ?, ?)
  `, variantId, productId, parishId, priceCents, stockQuantity, trackInventory, maxQuantityPerOrder, now, now);

  return { ok: true, id: productId, variantId, parishId, offeringKind };
}

export async function patchMinistryCommerceItem(request, env, parishId, ministryId, productId) {
  await requireParishCommerceSuite(env, parishId);
  let body = {};
  try { body = await request.json(); } catch { const e = new Error("Invalid JSON body"); e.status = 400; throw e; }

  // Ownership check: a ministry can only edit listings it created --
  // ministry_id = ? here is what prevents one ministry's leader from
  // editing another ministry's (or full parish-admin's, ministry_id NULL)
  // pricing.
  const product = await d1First(env, `
    SELECT p.id, v.id AS variant_id FROM commerce_products p
    LEFT JOIN commerce_product_variants v ON v.product_id = p.id AND v.parish_id = p.parish_id AND v.commerce_module = 'events'
    WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'events' AND p.ministry_id = ?
    LIMIT 1
  `, productId, parishId, ministryId);
  if (!product) { const e = new Error("Event listing not found."); e.status = 404; throw e; }

  const now = new Date().toISOString();
  const productFields = [];
  const productParams = [];
  for (const [key, column] of [
    ["name", "name"], ["description", "description"], ["eventDate", "event_date"],
    ["eventLocation", "event_location"], ["eventDetails", "event_details"],
    ["salesCloseAt", "sales_close_at"], ["status", "status"]
  ]) {
    if (body[key] === undefined) continue;
    productFields.push(`${column} = ?`);
    productParams.push(String(body[key] || "").trim().slice(0, 1000) || null);
  }
  if (body.offeringKind !== undefined) {
    productFields.push("item_category = ?");
    productParams.push(eventOfferingKindFromBody(body));
  }
  if (productFields.length) {
    productFields.push("updated_at = ?");
    productParams.push(now, productId, parishId, ministryId);
    await d1Run(env, `UPDATE commerce_products SET ${productFields.join(", ")} WHERE id = ? AND parish_id = ? AND commerce_module = 'events' AND ministry_id = ?`, ...productParams);
  }

  if (product.variant_id) {
    const variantFields = [];
    const variantParams = [];
    if (body.priceCents !== undefined) {
      const priceCents = Math.round(Number(body.priceCents || 0));
      if (!Number.isFinite(priceCents) || priceCents < 1) { const e = new Error("Enter a valid price."); e.status = 422; throw e; }
      variantFields.push("unit_price_cents = ?"); variantParams.push(priceCents);
    }
    if (body.stockQuantity !== undefined) {
      variantFields.push("stock_quantity = ?"); variantParams.push(Math.max(0, Math.trunc(Number(body.stockQuantity || 0))));
    }
    if (body.trackInventory !== undefined) {
      variantFields.push("track_inventory = ?"); variantParams.push(body.trackInventory === false ? 0 : 1);
    }
    if (body.maxQuantityPerOrder !== undefined) {
      variantFields.push("max_quantity_per_order = ?");
      variantParams.push(body.maxQuantityPerOrder != null && Number(body.maxQuantityPerOrder) > 0 ? Math.trunc(Number(body.maxQuantityPerOrder)) : null);
    }
    if (variantFields.length) {
      variantFields.push("updated_at = ?");
      variantParams.push(now, product.variant_id, parishId);
      await d1Run(env, `UPDATE commerce_product_variants SET ${variantFields.join(", ")} WHERE id = ? AND parish_id = ? AND commerce_module = 'events'`, ...variantParams);
    }
  }

  return { ok: true };
}
