import { bookstoreReadinessSummary, bookstoreSellerDisclosure } from '../lib/commerce-readiness.js';
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
} from '../lib/core.js';
import { bookstoreEnabledFor } from '../lib/entitlements.js';
import { resolveSettlementProfileId } from '../lib/settlement-profiles.js';
import { stripeFormConnectedRequest } from '../lib/stripe-connect.js';
import { donorName } from '../lib/stripe-fees.js';
import {
  findOrCreateDonorCustomer,
  findRegistrationByParishId,
  requireDonor,
  verifyParishDashboardBearer,
} from './parish.js';

// Donor and guest Bookstore catalog, cart validation, and Stripe checkout.
// Route ownership remains in src/routes/donor.js; src/handlers/donor.js
// re-exports this public surface while consumers migrate incrementally.

const BOOKSTORE_ITEM_FIELD_CATEGORIES = [
  {
    category: 'book',
    label: 'Book',
    fields: [
      { key: 'title', label: 'Title', required: true, maxLength: 180 },
      { key: 'author', label: 'Author', required: false, maxLength: 120 },
      { key: 'isbn', label: 'ISBN / barcode', required: false, maxLength: 32 },
    ],
  },
  {
    category: 'prayer_rope',
    label: 'Prayer Rope',
    fields: [
      { key: 'description', label: 'Description', required: true, maxLength: 180 },
      { key: 'color', label: 'Color', required: false, maxLength: 80 },
    ],
  },
  {
    category: 'icon',
    label: 'Icon',
    fields: [
      { key: 'saint_or_feast', label: 'Saint or feast', required: true, maxLength: 160 },
      { key: 'size', label: 'Size', required: false, maxLength: 80 },
    ],
  },
  {
    category: 'candle',
    label: 'Candle',
    fields: [{ key: 'description', label: 'Description', required: true, maxLength: 160 }],
  },
  {
    category: 'jewelry',
    label: 'Jewelry / Cross',
    fields: [{ key: 'description', label: 'Description', required: true, maxLength: 180 }],
  },
  {
    category: 'incense',
    label: 'Incense',
    fields: [{ key: 'description', label: 'Description', required: true, maxLength: 160 }],
  },
  { category: 'cd_dvd', label: 'CD / DVD', fields: [{ key: 'title', label: 'Title', required: true, maxLength: 180 }] },
  {
    category: 'other',
    label: 'Other Item',
    fields: [{ key: 'description', label: 'Description', required: true, maxLength: 180 }],
  },
];

function bookstoreCategoryLabel(category) {
  return BOOKSTORE_ITEM_FIELD_CATEGORIES.find((entry) => entry.category === category)?.label || 'Item';
}

function centsFromBookstoreAmount(value) {
  const number = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0;
}

function normalizeBookstoreQuantity(value) {
  const quantity = Math.trunc(Number(value || 1));
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(quantity, 50);
}

export function guestBookstoreItemError(items = []) {
  for (const item of items) {
    if (String(item?.productId || '').trim() || String(item?.variantId || '').trim()) continue;
    const category = String(item?.itemCategory || '').trim();
    const categoryConfig = BOOKSTORE_ITEM_FIELD_CATEGORIES.find((entry) => entry.category === category);
    const specifics = item?.specifics && typeof item.specifics === 'object' ? item.specifics : {};
    const isbn = String(item?.specifics?.isbn || item?.barcode || '').replace(/[^0-9Xx]/g, '');
    if (item?.source === 'scan_and_go' && category === 'book' && [10, 13].includes(isbn.length)) continue;
    const description = String(specifics.description || specifics.title || specifics.saint_or_feast || '').trim();
    if (item?.source !== 'shopper_added' || !categoryConfig || !description) {
      return 'Describe every shopper-added item and choose a valid category.';
    }
  }
  return '';
}

export function bookstoreOrderSource(items = [], isGuestCheckout = false) {
  if (items.some((item) => item.source === 'scan_and_go')) return 'scan_and_go';
  if (items.some((item) => item.source === 'shopper_added')) return 'shopper_added';
  if (isGuestCheckout) return 'guest_checkout';
  if (items.some((item) => item.source === 'catalog')) return 'catalog';
  return 'manual_entry';
}

function describeManualBookstoreItem(category, specifics = {}) {
  if (category === 'book')
    return [specifics.title, specifics.author ? `by ${specifics.author}` : ''].filter(Boolean).join(' ') || 'Book';
  if (category === 'icon') return specifics.saint_or_feast || specifics.description || 'Icon';
  return specifics.description || specifics.title || bookstoreCategoryLabel(category);
}

function normalizeBookstoreProduct(row = {}) {
  const regularPriceCents = Number(row.unit_price_cents || 0);
  const submittedSalePriceCents = Number(row.sale_price_cents || 0);
  const onSale = submittedSalePriceCents > 0 && submittedSalePriceCents < regularPriceCents;
  const priceCents = onSale ? submittedSalePriceCents : regularPriceCents;
  return {
    id: row.id || '',
    variantId: row.variant_id || '',
    name: row.name || 'Bookstore item',
    description: row.description || '',
    category: row.item_category || 'other',
    categoryLabel: bookstoreCategoryLabel(row.item_category || 'other'),
    sku: row.sku || row.default_sku || '',
    barcode: row.barcode || '',
    taxCode: row.tax_code || row.default_tax_code || '',
    fulfillmentType: row.variant_fulfillment_type || row.fulfillment_type || 'physical_pickup',
    priceCents,
    priceLabel: `$${(priceCents / 100).toFixed(2)}`,
    regularPriceCents,
    salePriceCents: onSale ? submittedSalePriceCents : 0,
    onSale,
    savingsPercent: onSale ? Math.round((1 - submittedSalePriceCents / regularPriceCents) * 100) : 0,
    stockQuantity: Number(row.stock_quantity || 0),
    trackInventory: Number(row.track_inventory ?? 1) !== 0,
    unitsSold: Number(row.units_sold || 0),
    imageUrl: row.image_url || '',
  };
}

export async function loadDonorBookstoreProducts(env, parishId) {
  if (!d1(env)) return [];
  const rows = await d1All(
    env,
    `
    SELECT p.id, p.name, p.description, p.item_category, p.default_sku, p.default_tax_code,
           p.fulfillment_type, p.image_url,
           v.id AS variant_id, v.sku, v.barcode, v.variant_name, v.unit_price_cents, v.sale_price_cents,
           v.tax_code, v.fulfillment_type AS variant_fulfillment_type,
           v.stock_quantity, v.track_inventory, COALESCE(sales.units_sold, 0) AS units_sold
    FROM commerce_products p
    LEFT JOIN commerce_product_variants v
     ON v.product_id = p.id AND v.parish_id = p.parish_id
     AND v.commerce_module = 'bookstore' AND v.status = 'active'
    LEFT JOIN (
      SELECT i.variant_id, SUM(i.quantity) AS units_sold
      FROM commerce_order_items i
      JOIN commerce_orders o ON o.id = i.order_id
      WHERE i.parish_id = ? AND i.commerce_module = 'bookstore'
        AND (o.payment_status = 'paid' OR o.status = 'completed')
      GROUP BY i.variant_id
    ) sales ON sales.variant_id = v.id
    WHERE p.parish_id = ? AND p.commerce_module = 'bookstore' AND p.status = 'active'
    ORDER BY p.name COLLATE NOCASE, v.variant_name COLLATE NOCASE
  `,
    parishId,
    parishId
  );
  return rows.map(normalizeBookstoreProduct).filter((product) => product.variantId && product.priceCents > 0);
}

async function loadDonorBookstoreOrders(env, parishId, donorEmail) {
  if (!d1(env)) return [];
  const rows = await d1All(
    env,
    `
    SELECT id, order_number, status, payment_status, item_category, item_description, quantity,
           subtotal_cents, tax_cents, total_charged_cents, fulfillment_status, pickup_note, created_at
    FROM commerce_orders
    WHERE parish_id = ? AND commerce_module = 'bookstore' AND donor_email = ?
    ORDER BY created_at DESC LIMIT 20
  `,
    parishId,
    donorEmail
  );

  const orderIds = rows.map((row) => row.id);
  const itemsByOrder = {};
  if (orderIds.length) {
    const placeholders = orderIds.map(() => '?').join(',');
    const itemRows = await d1All(
      env,
      `
      SELECT order_id, item_name, quantity, unit_price_cents, total_cents
      FROM commerce_order_items
      WHERE parish_id = ? AND order_id IN (${placeholders})
      ORDER BY created_at ASC
    `,
      parishId,
      ...orderIds
    );
    for (const item of itemRows) {
      (itemsByOrder[item.order_id] ||= []).push({
        name: item.item_name,
        quantity: Number(item.quantity || 1),
        unitPriceCents: Number(item.unit_price_cents || 0),
        totalCents: Number(item.total_cents || 0),
      });
    }
  }

  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number || '',
    status: row.status || 'checkout_created',
    paymentStatus: row.payment_status || 'pending',
    itemCategory: row.item_category || 'other',
    itemCategoryLabel: bookstoreCategoryLabel(row.item_category || 'other'),
    itemDescription: row.item_description || 'Bookstore order',
    quantity: Number(row.quantity || 1),
    subtotalCents: Number(row.subtotal_cents || 0),
    taxCents: Number(row.tax_cents || 0),
    totalChargedCents: Number(row.total_charged_cents || row.subtotal_cents || 0),
    fulfillmentStatus: row.fulfillment_status || 'pending',
    pickupNote: row.pickup_note || '',
    createdAt: row.created_at || '',
    // Falls back to a single synthetic line so older/edge-case orders that
    // predate itemized storage still expand into a one-line receipt instead
    // of an empty list.
    items:
      itemsByOrder[row.id] && itemsByOrder[row.id].length
        ? itemsByOrder[row.id]
        : [
            {
              name: row.item_description || 'Bookstore item',
              quantity: Number(row.quantity || 1),
              unitPriceCents:
                Number(row.quantity) > 0
                  ? Math.round(Number(row.subtotal_cents || 0) / Number(row.quantity))
                  : Number(row.subtotal_cents || 0),
              totalCents: Number(row.subtotal_cents || 0),
            },
          ],
  }));
}

async function resolveDonorBookstoreParish(request, env, donor, explicitParishId = '') {
  const parishId = String(
    explicitParishId || request.headers.get('X-AGAPAY-Parish-Id') || donor.defaultParishId || ''
  ).trim();
  if (!parishId)
    return {
      error: json({ error: 'Choose your parish in Settings before ordering from the bookstore.' }, { status: 422 }),
    };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found?.registration) return { error: json({ error: 'Parish not found.' }, { status: 404 }) };
  const registration = found.registration;
  if (!bookstoreEnabledFor(registration)) {
    return { parishId, registration, available: false };
  }
  return { parishId, registration, available: true };
}

async function resolvePublicBookstoreParish(env, parishId = '') {
  const cleanParishId = String(parishId || '').trim();
  if (!cleanParishId) return { error: json({ error: 'Parish not found.' }, { status: 404 }) };
  const found = await findRegistrationByParishId(env, cleanParishId);
  if (!found?.registration) return { error: json({ error: 'Parish not found.' }, { status: 404 }) };
  return {
    parishId: cleanParishId,
    registration: found.registration,
    available: bookstoreEnabledFor(found.registration),
  };
}

export async function handleDonorBookstoreItemFields(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  return json({ categories: BOOKSTORE_ITEM_FIELD_CATEGORIES });
}

export async function handleDonorBookstoreIsbnLookup(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const url = new URL(request.url);
  const isbn = String(url.searchParams.get('isbn') || '').replace(/[^0-9Xx]/g, '');
  if (isbn.length !== 10 && isbn.length !== 13)
    return json({ found: false, error: 'Enter a 10 or 13 digit ISBN.' }, { status: 422 });

  const donor = await requireDonor(request, env);
  const parishId = String(request.headers.get('X-AGAPAY-Parish-Id') || donor?.defaultParishId || '').trim();
  if (donor?.email && parishId && d1(env)) {
    const row = await d1First(
      env,
      `
      SELECT p.id, p.name, p.description, p.item_category, p.default_sku, p.default_tax_code,
             p.fulfillment_type, p.image_url,
             v.id AS variant_id, v.sku, v.barcode, v.unit_price_cents, v.sale_price_cents, v.tax_code,
             v.fulfillment_type AS variant_fulfillment_type, v.stock_quantity, v.track_inventory
      FROM commerce_product_variants v
      JOIN commerce_products p ON p.id = v.product_id
      WHERE v.parish_id = ? AND v.commerce_module = 'bookstore'
        AND v.status = 'active' AND p.status = 'active'
        AND (v.barcode = ? OR v.sku = ? OR p.default_sku = ?)
      LIMIT 1
    `,
      parishId,
      isbn,
      isbn,
      isbn
    );
    if (row) return json({ found: true, source: 'catalog', product: normalizeBookstoreProduct(row) });
  }

  try {
    const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return json({ found: false });
    const book = await response.json();
    let author = '';
    const authorKey = Array.isArray(book.authors) && book.authors[0]?.key ? book.authors[0].key : '';
    if (authorKey) {
      try {
        const authorRes = await fetch(`https://openlibrary.org${authorKey}.json`, {
          headers: { Accept: 'application/json' },
        });
        if (authorRes.ok) author = (await authorRes.json()).name || '';
      } catch {
        /* best effort only */
      }
    }
    return json({ found: true, source: 'open_library', title: book.title || '', author, isbn });
  } catch {
    return json({ found: false });
  }
}

export async function handleDonorBookstoreRequestFeature(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor?.email) return unauthorized();
  return json({ ok: true, alreadySent: false });
}

export async function normalizeBookstoreCartItems(env, parishId, items) {
  const normalized = [];
  for (const raw of items) {
    const productId = String(raw.productId || '').trim();
    const variantId = String(raw.variantId || '').trim();
    const quantity = normalizeBookstoreQuantity(raw.quantity);
    if (productId || variantId) {
      const row = await d1First(
        env,
        `
        SELECT p.id, p.name, p.description, p.item_category, p.default_sku, p.default_tax_code,
               p.fulfillment_type, p.image_url,
               v.id AS variant_id, v.sku, v.barcode, v.unit_price_cents, v.sale_price_cents, v.tax_code,
               v.fulfillment_type AS variant_fulfillment_type, v.stock_quantity, v.track_inventory
        FROM commerce_product_variants v
        JOIN commerce_products p ON p.id = v.product_id
        WHERE p.parish_id = ? AND p.commerce_module = 'bookstore'
          AND p.status = 'active' AND v.status = 'active'
          AND (? = '' OR p.id = ?)
          AND (? = '' OR v.id = ?)
        LIMIT 1
      `,
        parishId,
        productId,
        productId,
        variantId,
        variantId
      );
      if (!row) throw new Error('One of the selected products is no longer available.');
      const product = normalizeBookstoreProduct(row);
      if (product.trackInventory && quantity > product.stockQuantity) {
        throw new Error(
          product.stockQuantity <= 0
            ? `${product.name} is currently out of stock.`
            : `${product.name} only has ${product.stockQuantity} available.`
        );
      }
      normalized.push({
        source: 'catalog',
        productId: product.id,
        variantId: product.variantId,
        sku: product.sku,
        barcode: product.barcode,
        itemCategory: product.category,
        itemName: product.name,
        itemDescription: product.description || product.name,
        quantity,
        unitPriceCents: product.priceCents,
        taxCode: product.taxCode,
        fulfillmentType: product.fulfillmentType,
        snapshot: product,
      });
      continue;
    }

    const category = BOOKSTORE_ITEM_FIELD_CATEGORIES.some((entry) => entry.category === raw.itemCategory)
      ? String(raw.itemCategory)
      : 'other';
    const specifics = raw.specifics && typeof raw.specifics === 'object' ? raw.specifics : {};
    const unitPriceCents = centsFromBookstoreAmount(raw.unitPrice);
    const itemName = describeManualBookstoreItem(category, specifics);
    if (!unitPriceCents) throw new Error('Enter a valid price for every manual item.');
    if (!itemName || itemName === 'Item') throw new Error('Describe every manual item before checkout.');
    normalized.push({
      source:
        raw.source === 'scan_and_go'
          ? 'scan_and_go'
          : raw.source === 'shopper_added'
            ? 'shopper_added'
            : 'manual_entry',
      productId: '',
      variantId: '',
      sku: String(specifics.isbn || raw.barcode || '').slice(0, 80),
      barcode: String(specifics.isbn || raw.barcode || '').slice(0, 80),
      itemCategory: category,
      itemName,
      itemDescription: itemName,
      quantity,
      unitPriceCents,
      taxCode: '',
      fulfillmentType: 'physical_pickup',
      snapshot: { specifics },
    });
  }
  if (!normalized.length) throw new Error('Add at least one item before checkout.');
  if (normalized.length > 20) throw new Error('Checkout can include up to 20 items at a time.');
  return normalized;
}

export async function handleParishBookstoreReadiness(request, env, parishId) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish not found' }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();

  return json(bookstoreReadinessSummary(found.registration));
}

export async function handleDonorBookstore(request, env, publicParishId = '') {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'donor-bookstore', { limit: 40, windowSeconds: 300 });
  if (limited) return limited;

  const isGuestCheckout = Boolean(publicParishId);
  const donor = isGuestCheckout ? null : await requireDonor(request, env);
  if (!isGuestCheckout && !donor?.email) return unauthorized();

  if (request.method === 'GET') {
    const resolved = isGuestCheckout
      ? await resolvePublicBookstoreParish(env, publicParishId)
      : await resolveDonorBookstoreParish(request, env, donor);
    if (resolved.error) return resolved.error;
    return json({
      available: Boolean(resolved.available),
      parish: { id: resolved.parishId, name: resolved.registration?.name || resolved.registration?.parishName || '' },
      sellerDisclosure: resolved.registration
        ? bookstoreSellerDisclosure(
            resolved.registration.commerceSellerDisplayName ||
              resolved.registration.name ||
              resolved.registration.parishName
          )
        : '',
      products: resolved.available ? await loadDonorBookstoreProducts(env, resolved.parishId) : [],
      orders: isGuestCheckout
        ? []
        : await loadDonorBookstoreOrders(env, resolved.parishId, normalizeEmail(donor.email)),
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const resolved = isGuestCheckout
    ? await resolvePublicBookstoreParish(env, publicParishId)
    : await resolveDonorBookstoreParish(request, env, donor, body.parishId);
  if (resolved.error) return resolved.error;
  if (!resolved.available)
    return json({ error: "Your parish hasn't turned on Bookstore Payments yet." }, { status: 409 });
  if (!resolved.registration?.stripeAccountId) {
    return json(
      { error: 'Your parish needs to connect Stripe before bookstore payments can be accepted.' },
      { status: 422 }
    );
  }
  if (!d1(env)) return missingProductionStoreResponse();

  const submittedItems = Array.isArray(body.items) && body.items.length ? body.items : [body];
  const guestItemError = isGuestCheckout ? guestBookstoreItemError(submittedItems) : '';
  if (guestItemError) return json({ error: guestItemError }, { status: 422 });

  let items;
  try {
    items = await normalizeBookstoreCartItems(env, resolved.parishId, submittedItems);
  } catch (err) {
    return json({ error: err.message || 'Check your cart and try again.' }, { status: 422 });
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
  const orderId = `bookstore_${generateSecret(18)}`;
  const checkoutLocalId = `checkout_${generateSecret(18)}`;
  const now = new Date().toISOString();
  const firstItem = items[0];
  const itemDescription = items.length === 1 ? firstItem.itemName : `${items.length} bookstore items`;
  const quantityTotal = items.reduce((sum, item) => sum + item.quantity, 0);
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
  const publicStorePath = `/${encodeURIComponent(resolved.parishId)}/bookstore`;
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: isGuestCheckout
      ? `${appUrl}${publicStorePath}?order_success=1&session_id={CHECKOUT_SESSION_ID}`
      : `${appUrl}/myagapay/bookstore?order_success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: isGuestCheckout
      ? `${appUrl}${publicStorePath}?order_canceled=1`
      : `${appUrl}/myagapay/bookstore?order_canceled=1`,
    customer: customer.body.id,
    'automatic_tax[enabled]': 'true',
    'customer_update[address]': 'auto',
    // Seller-identity disclosure surfaced on the Stripe-hosted Checkout
    // page itself via the submit-type/custom text field -- reinforces the
    // parish, not AGAPAY, as the seller at the one checkout surface every
    // bookstore order already passes through. Storefront/cart/receipt
    // placements are a documented follow-up (see Phase 3 report).
    'custom_text[submit][message]': sellerDisclosure.slice(0, 499),
  });
  // Parish Commerce is included in AGAPAY Parish +. Do not add any AGAPAY platform/application fee to bookstore or future commerce checkouts; Stripe may still charge its own processing fee and show any applicable tax.
  const bookstoreFallbackTaxCode = env.BOOKSTORE_STRIPE_TAX_CODE || env.PARISH_COMMERCE_DEFAULT_TAX_CODE || '';

  items.forEach((item, index) => {
    const lineTaxCode = item.taxCode || bookstoreFallbackTaxCode;

    form.set(`line_items[${index}][quantity]`, String(item.quantity));
    form.set(`line_items[${index}][price_data][currency]`, 'usd');
    form.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitPriceCents));
    form.set(`line_items[${index}][price_data][tax_behavior]`, 'exclusive');
    form.set(`line_items[${index}][price_data][product_data][name]`, item.itemName.slice(0, 180));

    if (item.itemDescription && item.itemDescription !== item.itemName) {
      form.set(`line_items[${index}][price_data][product_data][description]`, item.itemDescription.slice(0, 280));
    }

    if (lineTaxCode) {
      form.set(`line_items[${index}][price_data][product_data][tax_code]`, lineTaxCode);
    }
  });
  const metadata = {
    order_id: orderId,
    parish_id: resolved.parishId,
    commerce_module: 'bookstore',
    agapay_payment_class: 'nonqualifying_commerce',
    agapay_classification_version: '1',
    donor_email: donorEmail,
    donor_name: normalizedDonorName,
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

  const settlementProfileId = await resolveSettlementProfileId(env, resolved.parishId, 'bookstore');

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
    VALUES (?, 'bookstore', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?,
            'checkout_created', 'pending', ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `,
    orderId,
    bookstoreOrderSource(items, isGuestCheckout),
    resolved.parishId,
    donorEmail,
    normalizedDonorName,
    firstItem.productId,
    firstItem.sku,
    firstItem.variantId,
    firstItem.taxCode,
    JSON.stringify({ items: items.map((item) => item.snapshot) }).slice(0, 12000),
    firstItem.itemCategory,
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
      VALUES (?, ?, ?, 'bookstore', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', ?, ?)
    `,
      `bookstore_item_${generateSecret(18)}`,
      orderId,
      resolved.parishId,
      item.productId,
      item.variantId,
      item.sku,
      item.barcode,
      item.barcode ? 'isbn_or_sku' : '',
      item.itemCategory,
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
