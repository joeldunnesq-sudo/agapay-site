// src/handlers/parish-commerce.js
// Parish bookstore operations, settlement profiles, and commerce webhooks.

import {
  SETTLEMENT_PROFILE_TYPES,
  assignModuleProfile,
  createSettlementProfile,
  ensureDefaultCommerceProfile,
  ensureDefaultGivingProfile,
  listSettlementProfiles,
  renameSettlementProfile,
  setDefaultCommerceProfile,
  setDefaultGivingProfile,
  setProfileActive,
  settlementProfileToJson,
} from "../lib/settlement-profiles.js";
import {
  checkoutPaymentIntentId,
  numericCents,
  stripeObjectId,
} from "../lib/stripe-connect.js";
import {
  bookstoreEnabledFor,
  centsFromBody,
  d1All,
  d1First,
  d1Run,
  findRegistrationByParishId,
  generateSecret,
  getBearerToken,
  hasParishPlusAccess,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeBookstoreBody,
  parishDashboardPayload,
  rateLimit,
  recordAuditEvent,
  stripePaymentIntentFinancialUpdates,
  unauthorized,
  verifyParishDashboardBearer,
} from "./parish.js";

const commerceDatabase = (env) => env.AGAPAY_DB || env.DB || null;

const BOOKSTORE_STARTER_CATALOG = [
  {
    label: "Books",
    items: [
      { key: "orthodox-study-bible", name: "Orthodox Study Bible", category: "book", suggestedPriceCents: 4995 },
      { key: "prayer-book", name: "Jordanville Prayer Book", category: "book", suggestedPriceCents: 2495 },
      { key: "way-of-a-pilgrim", name: "The Way of a Pilgrim", category: "book", suggestedPriceCents: 1595 }
    ]
  },
  {
    label: "Devotional Items",
    items: [
      { key: "wool-prayer-rope-33", name: "33-knot wool prayer rope", category: "prayer_rope", suggestedPriceCents: 1800 },
      { key: "small-icon-christ", name: "Small icon of Christ", category: "icon", suggestedPriceCents: 2200 },
      { key: "beeswax-candle-bundle", name: "Beeswax candle bundle", category: "candle", suggestedPriceCents: 1200 }
    ]
  },
  {
    label: "Church Goods",
    items: [
      { key: "cross-necklace", name: "Baptismal cross necklace", category: "jewelry", suggestedPriceCents: 3000 },
      { key: "frankincense-sampler", name: "Frankincense sampler", category: "incense", suggestedPriceCents: 1400 },
      { key: "chant-cd", name: "Parish chant recording", category: "cd_dvd", suggestedPriceCents: 1500 }
    ]
  }
];

function normalizeBookstoreProduct(row) {
  return {
    id: row.id,
    variantId: row.variant_id || "",
    name: row.name || "",
    description: row.description || "",
    category: row.item_category || "other",
    sku: row.sku || row.default_sku || "",
    priceCents: Number(row.unit_price_cents || 0),
    costBasisCents: Number(row.cost_basis_cents || 0),
    stockQuantity: Number(row.stock_quantity || 0),
    reorderThreshold: Number(row.reorder_threshold || 0),
    status: row.status || "active",
    imageUrl: row.image_url || "",
    updatedAt: row.updated_at || ""
  };
}

export async function handleParishBookstore(request, env, parishId, subpath = "") {
  const limited = await rateLimit(request, env, "parish-bookstore", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!commerceDatabase(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (!hasParishPlusAccess(found.registration)) {
    return json({ error: "Bookstore Payments requires AGAPAY Parish +." }, { status: 403 });
  }

  const segments = String(subpath || "").replace(/^\/+/, "").split("/").filter(Boolean);
  const now = new Date().toISOString();

  if (request.method === "GET" && segments[0] === "starter-catalog") {
    const existing = await d1All(env,
      `SELECT default_sku FROM commerce_products
       WHERE parish_id = ? AND commerce_module = 'bookstore' AND default_sku IS NOT NULL AND default_sku <> ''`,
      parishId
    );
    const existingSkus = new Set(existing.map(row => String(row.default_sku || "")));
    return json({
      catalog: BOOKSTORE_STARTER_CATALOG.map(group => ({
        label: group.label,
        items: group.items.map(item => ({
          ...item,
          alreadyAdded: existingSkus.has(item.key)
        }))
      }))
    });
  }

  if (request.method === "POST" && segments[0] === "starter-catalog" && segments[1] === "add") {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
    const requested = Array.isArray(body.items) ? body.items : [];
    const flattened = BOOKSTORE_STARTER_CATALOG.flatMap(group => group.items);
    const starterByKey = new Map(flattened.map(item => [item.key, item]));
    const added = [];

    for (const entry of requested.slice(0, 25)) {
      const key = String(entry.key || "").trim();
      const starter = starterByKey.get(key);
      if (!starter) continue;
      const item = normalizeBookstoreBody({
        ...entry,
        name: entry.name || starter.name,
        category: entry.category || starter.category,
        priceCents: entry.priceCents ?? starter.suggestedPriceCents,
        stockQuantity: entry.stockQuantity ?? 0,
        sku: entry.sku || starter.key
      });
      if (!item.name || item.priceCents < 1) continue;
      const priceCents = centsFromBody(entry.priceCents, starter.suggestedPriceCents);
      const stockQuantity = centsFromBody(entry.stockQuantity, 0);
      const defaultSku = starter.key;
      const variantSku = item.sku || starter.key;
      const productId = generateSecret("commerce_product");
      const variantId = generateSecret("commerce_variant");
      await d1Run(env,
        `INSERT OR IGNORE INTO commerce_products
          (id, parish_id, commerce_module, name, description, item_category, default_sku, status, image_url, created_at, updated_at)
         VALUES (?, ?, 'bookstore', ?, ?, ?, ?, 'active', ?, ?, ?)`,
        productId, parishId, item.name, item.description, item.category, defaultSku, item.imageUrl, now, now
      );
      const product = await d1First(env,
        `SELECT id FROM commerce_products WHERE parish_id = ? AND default_sku = ?`,
        parishId, defaultSku
      );
      const resolvedProductId = product?.id || productId;
      await d1Run(env,
        `INSERT OR IGNORE INTO commerce_product_variants
          (id, product_id, parish_id, commerce_module, sku, variant_name, unit_price_cents, stock_quantity, status, created_at, updated_at)
         VALUES (?, ?, ?, 'bookstore', ?, '', ?, ?, 'active', ?, ?)`,
        variantId, resolvedProductId, parishId, variantSku, priceCents, stockQuantity, now, now
      );
      added.push({ key, name: item.name });
    }

    return json({ ok: true, added });
  }

  if (segments[0] === "sales-summary" && request.method === "GET") {
    // Paid orders only. payment_status becomes 'paid' once Stripe confirms;
    // status/fulfillment are separate lifecycle fields we intentionally ignore here.
    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const monthRow = await d1First(env,
      `SELECT COUNT(*) AS order_count,
              COALESCE(SUM(total_charged_cents), 0) AS gross_cents,
              COALESCE(SUM(parish_net_cents), 0) AS net_cents
       FROM commerce_orders
       WHERE parish_id = ? AND commerce_module = 'bookstore'
         AND payment_status = 'paid' AND created_at >= ?`,
      parishId, startOfMonth
    );
    const allTimeRow = await d1First(env,
      `SELECT COUNT(*) AS order_count,
              COALESCE(SUM(parish_net_cents), 0) AS net_cents
       FROM commerce_orders
       WHERE parish_id = ? AND commerce_module = 'bookstore'
         AND payment_status = 'paid'`,
      parishId
    );
    const lastOrderRow = await d1First(env,
      `SELECT created_at FROM commerce_orders
       WHERE parish_id = ? AND commerce_module = 'bookstore' AND payment_status = 'paid'
       ORDER BY created_at DESC LIMIT 1`,
      parishId
    );
    return json({
      salesSummary: {
        monthOrderCount: Number(monthRow?.order_count || 0),
        monthGrossCents: Number(monthRow?.gross_cents || 0),
        monthNetCents: Number(monthRow?.net_cents || 0),
        allTimeOrderCount: Number(allTimeRow?.order_count || 0),
        allTimeNetCents: Number(allTimeRow?.net_cents || 0),
        lastOrderAt: lastOrderRow?.created_at || null
      }
    });
  }

  // Sales & customers tracking — who is buying from My AGAPAY, what they buy,
  // and what the parish nets. First paint returns KPIs + trend + top customers
  // + top products + the first page of the order ledger; passing ?cursor= returns
  // only the next page of orders (keyset pagination).
  if (segments[0] === "sales" && request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const rangeParam = params.get("range") || "90d";
    const cursorParam = params.get("cursor") || "";
    const qRaw = (params.get("q") || "").trim().toLowerCase().slice(0, 80);
    const pageLimit = Math.min(Math.max(Number(params.get("limit")) || 25, 1), 50);

    const nowDate = new Date();
    let rangeStart;
    if (rangeParam === "ytd") {
      rangeStart = new Date(Date.UTC(nowDate.getUTCFullYear(), 0, 1)).toISOString();
    } else if (rangeParam === "all") {
      rangeStart = "1970-01-01T00:00:00.000Z";
    } else {
      const days = { "30d": 30, "90d": 90, "12m": 365 }[rangeParam] || 90;
      rangeStart = new Date(Date.now() - days * 86400000).toISOString();
    }

    // ── Order ledger page (paid + refunded, keyset paginated) ──────────────
    const orderBinds = [parishId];
    let whereSearch = "";
    if (qRaw) {
      whereSearch = " AND (lower(o.donor_name) LIKE ? OR lower(o.donor_email) LIKE ? OR lower(o.item_description) LIKE ?)";
      const like = `%${qRaw}%`;
      orderBinds.push(like, like, like);
    }
    let whereCursor = "";
    if (cursorParam) {
      let decoded = "";
      try { decoded = atob(cursorParam); } catch { decoded = ""; }
      const sep = decoded.indexOf("|");
      const cAt = sep > -1 ? decoded.slice(0, sep) : "";
      const cId = sep > -1 ? decoded.slice(sep + 1) : "";
      if (cAt && cId) {
        whereCursor = " AND (o.created_at < ? OR (o.created_at = ? AND o.id < ?))";
        orderBinds.push(cAt, cAt, cId);
      }
    }
    orderBinds.push(pageLimit + 1);

    const orderRows = await d1All(env,
      `SELECT o.id, o.order_number, o.donor_email, o.donor_name, o.item_description,
              o.quantity, o.total_charged_cents, o.parish_net_cents, o.tax_cents,
              o.agapay_fee_cents, o.stripe_fee_cents,
              o.payment_status, o.fulfillment_status, o.source, o.created_at, o.completed_at,
              o.settlement_profile_id, sp.name AS settlement_profile_name,
              CASE WHEN d.email IS NOT NULL THEN 1 ELSE 0 END AS is_myagapay,
              CASE WHEN d.default_parish_id = o.parish_id THEN 1 ELSE 0 END AS is_home_parish
       FROM commerce_orders o
       LEFT JOIN donors d ON d.email = o.donor_email
       LEFT JOIN settlement_profiles sp ON sp.id = o.settlement_profile_id
       WHERE o.parish_id = ? AND o.commerce_module = 'bookstore'
         AND o.payment_status IN ('paid','refunded','partially_refunded')${whereSearch}${whereCursor}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ?`,
      ...orderBinds
    );

    let nextCursor = null;
    if (orderRows.length > pageLimit) {
      const last = orderRows[pageLimit - 1];
      nextCursor = btoa(`${last.created_at}|${last.id}`);
      orderRows.length = pageLimit;
    }

    // Attach line items for the visible page (one grouped query).
    const pageIds = orderRows.map(r => r.id);
    const itemsByOrder = {};
    if (pageIds.length) {
      const placeholders = pageIds.map(() => "?").join(",");
      const itemRows = await d1All(env,
        `SELECT order_id, item_name, item_category, quantity, unit_price_cents, total_cents
         FROM commerce_order_items
         WHERE parish_id = ? AND order_id IN (${placeholders})
         ORDER BY created_at ASC`,
        parishId, ...pageIds
      );
      for (const it of itemRows) {
        (itemsByOrder[it.order_id] ||= []).push({
          name: it.item_name,
          category: it.item_category,
          quantity: Number(it.quantity || 0),
          unitPriceCents: Number(it.unit_price_cents || 0),
          totalCents: Number(it.total_cents || 0)
        });
      }
    }

    const orders = orderRows.map(r => ({
      id: r.id,
      orderNumber: r.order_number || null,
      donorEmail: r.donor_email,
      donorName: r.donor_name || r.donor_email,
      summary: r.item_description || "Bookstore order",
      quantity: Number(r.quantity || 0),
      grossCents: Number(r.total_charged_cents || 0),
      netCents: Number(r.parish_net_cents || 0),
      taxCents: Number(r.tax_cents || 0),
      agapayFeeCents: Number(r.agapay_fee_cents || 0),
      stripeFeeCents: Number(r.stripe_fee_cents || 0),
      settlementProfileId: r.settlement_profile_id || null,
      settlementProfileName: r.settlement_profile_name || null,
      paymentStatus: r.payment_status,
      fulfillmentStatus: r.fulfillment_status,
      source: r.source,
      createdAt: r.created_at,
      completedAt: r.completed_at || null,
      isMyAgapay: Number(r.is_myagapay) === 1,
      isHomeParish: Number(r.is_home_parish) === 1,
      items: itemsByOrder[r.id] || []
    }));

    // "Load more" — orders only.
    if (cursorParam) {
      return json({ orders, nextCursor });
    }

    // ── First paint: KPIs, trend, top customers, top products, refunds ─────
    const kpi = await d1First(env,
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_charged_cents),0) AS gross,
              COALESCE(SUM(parish_net_cents),0) AS net, COALESCE(SUM(tax_cents),0) AS tax,
              COALESCE(SUM(quantity),0) AS units, COUNT(DISTINCT donor_email) AS customers
       FROM commerce_orders
       WHERE parish_id = ? AND commerce_module = 'bookstore' AND payment_status = 'paid' AND created_at >= ?`,
      parishId, rangeStart
    );
    const allTimeRow = await d1First(env,
      `SELECT COUNT(*) AS orders, COALESCE(SUM(parish_net_cents),0) AS net,
              COUNT(DISTINCT donor_email) AS customers
       FROM commerce_orders
       WHERE parish_id = ? AND commerce_module = 'bookstore' AND payment_status = 'paid'`,
      parishId
    );
    const repeatRow = await d1First(env,
      `SELECT COUNT(*) AS repeat_customers FROM (
         SELECT donor_email FROM commerce_orders
         WHERE parish_id = ? AND commerce_module = 'bookstore' AND payment_status = 'paid' AND created_at >= ?
         GROUP BY donor_email HAVING COUNT(*) >= 2
       )`,
      parishId, rangeStart
    );
    const refundRow = await d1First(env,
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_charged_cents),0) AS gross
       FROM commerce_orders
       WHERE parish_id = ? AND commerce_module = 'bookstore'
         AND payment_status IN ('refunded','partially_refunded') AND created_at >= ?`,
      parishId, rangeStart
    );

    const trendStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - 5, 1)).toISOString();
    const trendRows = await d1All(env,
      `SELECT substr(created_at,1,7) AS ym, COALESCE(SUM(total_charged_cents),0) AS gross, COUNT(*) AS orders
       FROM commerce_orders
       WHERE parish_id = ? AND commerce_module = 'bookstore' AND payment_status = 'paid' AND created_at >= ?
       GROUP BY ym ORDER BY ym ASC`,
      parishId, trendStart
    );
    const trendMap = new Map(trendRows.map(r => [r.ym, r]));
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - i, 1));
      const ym = d.toISOString().slice(0, 7);
      const row = trendMap.get(ym);
      trend.push({
        ym,
        label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
        grossCents: Number(row?.gross || 0),
        orders: Number(row?.orders || 0)
      });
    }

    const customerRows = await d1All(env,
      `SELECT o.donor_email, MAX(o.donor_name) AS donor_name, COUNT(*) AS orders,
              COALESCE(SUM(o.total_charged_cents),0) AS gross, COALESCE(SUM(o.parish_net_cents),0) AS net,
              MAX(o.created_at) AS last_order_at,
              CASE WHEN MAX(d.email) IS NOT NULL THEN 1 ELSE 0 END AS is_myagapay,
              CASE WHEN MAX(d.default_parish_id) = ? THEN 1 ELSE 0 END AS is_home_parish
       FROM commerce_orders o
       LEFT JOIN donors d ON d.email = o.donor_email
       WHERE o.parish_id = ? AND o.commerce_module = 'bookstore' AND o.payment_status = 'paid' AND o.created_at >= ?
       GROUP BY o.donor_email
       ORDER BY gross DESC
       LIMIT 8`,
      parishId, parishId, rangeStart
    );
    const topCustomers = customerRows.map(r => ({
      email: r.donor_email,
      name: r.donor_name || r.donor_email,
      orders: Number(r.orders || 0),
      grossCents: Number(r.gross || 0),
      netCents: Number(r.net || 0),
      lastOrderAt: r.last_order_at,
      isMyAgapay: Number(r.is_myagapay) === 1,
      isHomeParish: Number(r.is_home_parish) === 1
    }));

    const productRows = await d1All(env,
      `SELECT i.item_name, COALESCE(SUM(i.quantity),0) AS units,
              COALESCE(SUM(i.total_cents),0) AS gross, COUNT(DISTINCT i.order_id) AS orders
       FROM commerce_order_items i
       JOIN commerce_orders o ON o.id = i.order_id
       WHERE i.parish_id = ? AND i.commerce_module = 'bookstore' AND o.payment_status = 'paid' AND o.created_at >= ?
       GROUP BY i.item_name
       ORDER BY gross DESC
       LIMIT 8`,
      parishId, rangeStart
    );
    const topProducts = productRows.map(r => ({
      name: r.item_name,
      units: Number(r.units || 0),
      grossCents: Number(r.gross || 0),
      orders: Number(r.orders || 0)
    }));

    const orderCount = Number(kpi?.orders || 0);
    const grossCents = Number(kpi?.gross || 0);
    return json({
      range: rangeParam,
      kpis: {
        orderCount,
        grossCents,
        netCents: Number(kpi?.net || 0),
        taxCents: Number(kpi?.tax || 0),
        unitsSold: Number(kpi?.units || 0),
        uniqueCustomers: Number(kpi?.customers || 0),
        repeatCustomers: Number(repeatRow?.repeat_customers || 0),
        avgOrderCents: orderCount ? Math.round(grossCents / orderCount) : 0
      },
      allTime: {
        orderCount: Number(allTimeRow?.orders || 0),
        netCents: Number(allTimeRow?.net || 0),
        uniqueCustomers: Number(allTimeRow?.customers || 0)
      },
      refunds: {
        orderCount: Number(refundRow?.orders || 0),
        grossCents: Number(refundRow?.gross || 0)
      },
      trend,
      topCustomers,
      topProducts,
      orders,
      nextCursor
    });
  }

  if (segments[0] === "products" && request.method === "GET" && segments.length === 1) {
    const rows = await d1All(env,
      `SELECT p.*, v.id AS variant_id, v.sku, v.unit_price_cents, v.cost_basis_cents,
              v.stock_quantity, v.reorder_threshold
       FROM commerce_products p
       LEFT JOIN commerce_product_variants v
         ON v.product_id = p.id AND v.status = 'active'
       WHERE p.parish_id = ? AND p.commerce_module = 'bookstore' AND p.status <> 'archived'
       ORDER BY p.name COLLATE NOCASE ASC`,
      parishId
    );
    return json({ products: rows.map(normalizeBookstoreProduct) });
  }

  if (segments[0] === "products" && request.method === "POST" && segments.length === 1) {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
    const item = normalizeBookstoreBody(body);
    if (!item.name) return json({ error: "Item name is required." }, { status: 422 });
    if (item.priceCents < 1) return json({ error: "Price must be greater than zero." }, { status: 422 });
    const productId = generateSecret("commerce_product");
    const variantId = generateSecret("commerce_variant");
    await d1Run(env,
      `INSERT INTO commerce_products
        (id, parish_id, commerce_module, name, description, item_category, default_sku, status, image_url, created_at, updated_at)
       VALUES (?, ?, 'bookstore', ?, ?, ?, ?, 'active', ?, ?, ?)`,
      productId, parishId, item.name, item.description, item.category, item.sku || null, item.imageUrl, now, now
    );
    await d1Run(env,
      `INSERT INTO commerce_product_variants
        (id, product_id, parish_id, commerce_module, sku, variant_name, unit_price_cents,
         cost_basis_cents, stock_quantity, reorder_threshold, status, created_at, updated_at)
       VALUES (?, ?, ?, 'bookstore', ?, '', ?, ?, ?, ?, 'active', ?, ?)`,
      variantId, productId, parishId, item.sku || null, item.priceCents, item.costBasisCents,
      item.stockQuantity, item.reorderThreshold, now, now
    );
    return json({ ok: true, product: { id: productId } });
  }

  if (segments[0] === "products" && segments[1]) {
    const productId = decodeURIComponent(segments[1]);
    const product = await d1First(env,
      `SELECT p.id, v.id AS variant_id
       FROM commerce_products p
       LEFT JOIN commerce_product_variants v ON v.product_id = p.id AND v.status = 'active'
       WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'bookstore'`,
      productId, parishId
    );
    if (!product) return json({ error: "Bookstore item not found." }, { status: 404 });

    if (request.method === "PATCH") {
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
      const item = normalizeBookstoreBody(body);
      if (!item.name) return json({ error: "Item name is required." }, { status: 422 });
      if (item.priceCents < 1) return json({ error: "Price must be greater than zero." }, { status: 422 });
      await d1Run(env,
        `UPDATE commerce_products
         SET name = ?, description = ?, item_category = ?, default_sku = ?, image_url = ?, updated_at = ?
         WHERE id = ? AND parish_id = ?`,
        item.name, item.description, item.category, item.sku || null, item.imageUrl, now, productId, parishId
      );
      if (product.variant_id) {
        await d1Run(env,
          `UPDATE commerce_product_variants
           SET sku = ?, unit_price_cents = ?, stock_quantity = ?, cost_basis_cents = ?, reorder_threshold = ?, updated_at = ?
           WHERE id = ? AND parish_id = ?`,
          item.sku || null, item.priceCents, item.stockQuantity, item.costBasisCents, item.reorderThreshold, now, product.variant_id, parishId
        );
      } else {
        await d1Run(env,
          `INSERT INTO commerce_product_variants
            (id, product_id, parish_id, commerce_module, sku, variant_name, unit_price_cents,
             cost_basis_cents, stock_quantity, reorder_threshold, status, created_at, updated_at)
           VALUES (?, ?, ?, 'bookstore', ?, '', ?, ?, ?, ?, 'active', ?, ?)`,
          generateSecret("commerce_variant"), productId, parishId, item.sku || null, item.priceCents, item.costBasisCents,
          item.stockQuantity, item.reorderThreshold, now, now
        );
      }
      return json({ ok: true });
    }

    if (request.method === "DELETE") {
      await d1Run(env, "UPDATE commerce_products SET status = 'archived', updated_at = ? WHERE id = ? AND parish_id = ?", now, productId, parishId);
      await d1Run(env, "UPDATE commerce_product_variants SET status = 'archived', updated_at = ? WHERE product_id = ? AND parish_id = ?", now, productId, parishId);
      return json({ ok: true });
    }
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

// Settlement Profiles admin API — Settings tab, "payment-settings" scope.
// Gated the same way as every other parish dashboard endpoint: a valid
// parish dashboard bearer token. AGAPAY doesn't yet have per-user roles
// within a single parish login (the whole dashboard is one shared parish
// credential), so "only admins/treasurers with payment-settings permission"
// is satisfied by the existing parish-dashboard auth boundary — this is
// never reachable from the donor-facing My AGAPAY app, which has no bearer
// token for parish dashboard auth at all.
export async function handleParishSettlementProfiles(request, env, parishId, subpath = "") {
  const limited = await rateLimit(request, env, "parish-settlement-profiles", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!commerceDatabase(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const segments = String(subpath || "").replace(/^\/+/, "").split("/").filter(Boolean);

  // Every request self-heals the parish's giving default, and its commerce
  // default if Parish + is active, so the list is never empty for a
  // verified parish — mirrors the "ensure a default profile exists" spec
  // without needing a separate onboarding hook to have run first.
  await ensureDefaultGivingProfile(env, parishId);
  if (bookstoreEnabledFor(found.registration)) {
    await ensureDefaultCommerceProfile(env, parishId);
  }

  if (request.method === "GET" && segments.length === 0) {
    const profiles = await listSettlementProfiles(env, parishId);
    return json({
      profiles,
      profileTypes: SETTLEMENT_PROFILE_TYPES,
      stewardshipActive: bookstoreEnabledFor(found.registration)
    });
  }

  if (request.method === "POST" && segments.length === 0) {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
    const result = await createSettlementProfile(env, parishId, { name: body.name, profileType: body.profileType });
    if (result.error) return json({ error: result.error }, { status: 422 });
    return json({ profile: settlementProfileToJson(result.profile) });
  }

  const profileId = segments[0];
  if (!profileId) return json({ error: "Not found" }, { status: 404 });

  if (request.method === "PATCH" && segments.length === 1) {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
    if (typeof body.name === "string") {
      const result = await renameSettlementProfile(env, parishId, profileId, body.name);
      if (result.error) return json({ error: result.error }, { status: 422 });
      await recordAuditEvent(env, request, {
        action: "settlement_profile.renamed",
        actorUserId: parishId,
        actorType: "parish",
        targetType: "settlement_profile",
        targetId: profileId,
        organizationId: parishId,
        after: { name: body.name }
      });
      return json({ profile: settlementProfileToJson(result.profile) });
    }
    if (typeof body.isActive === "boolean") {
      const result = await setProfileActive(env, parishId, profileId, body.isActive);
      if (result.error) return json({ error: result.error }, { status: 422 });
      await recordAuditEvent(env, request, {
        action: "settlement_profile.active_changed",
        actorUserId: parishId,
        actorType: "parish",
        targetType: "settlement_profile",
        targetId: profileId,
        organizationId: parishId,
        after: { isActive: body.isActive }
      });
      return json({ profile: settlementProfileToJson(result.profile) });
    }
    return json({ error: "Nothing to update" }, { status: 400 });
  }

  if (request.method === "POST" && segments[1] === "default-giving") {
    const result = await setDefaultGivingProfile(env, parishId, profileId);
    if (result.error) return json({ error: result.error }, { status: 422 });
    await recordAuditEvent(env, request, {
      action: "settlement_profile.default_giving_changed",
      actorUserId: parishId,
      actorType: "parish",
      targetType: "settlement_profile",
      targetId: profileId,
      organizationId: parishId
    });
    return json({ profile: settlementProfileToJson(result.profile) });
  }

  if (request.method === "POST" && segments[1] === "default-commerce") {
    const result = await setDefaultCommerceProfile(env, parishId, profileId);
    if (result.error) return json({ error: result.error }, { status: 422 });
    await recordAuditEvent(env, request, {
      action: "settlement_profile.default_commerce_changed",
      actorUserId: parishId,
      actorType: "parish",
      targetType: "settlement_profile",
      targetId: profileId,
      organizationId: parishId
    });
    return json({ profile: settlementProfileToJson(result.profile) });
  }

  if (request.method === "POST" && segments[1] === "assign-module") {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
    const result = await assignModuleProfile(env, parishId, body.moduleKey, profileId);
    if (result.error) return json({ error: result.error }, { status: 422 });
    await recordAuditEvent(env, request, {
      action: "settlement_profile.module_assigned",
      actorUserId: parishId,
      actorType: "parish",
      targetType: "settlement_profile",
      targetId: profileId,
      organizationId: parishId,
      after: { moduleKey: body.moduleKey }
    });
    return json(result);
  }

  return json({ error: "Not found" }, { status: 404 });
}

// Marks a bookstore commerce order paid once Stripe confirms, and reconciles
// real Stripe fees / parish net from the balance transaction. Without this the
// order sits at payment_status='pending' forever and never shows up in sales
// reporting. Idempotent: a second call for an already-paid order is a no-op.
// `object` is the Stripe checkout.session (kind='session') or payment_intent
// (kind='payment_intent') from the webhook.
export async function completeCommerceOrderFromStripe(env, object = {}, kind = "session") {
  if (!commerceDatabase(env)) return null;
  const meta = object.metadata || {};
  if (meta.commerce_module && meta.commerce_module !== "bookstore") return null;

  const paymentIntentId = kind === "payment_intent"
    ? (object.id || "")
    : (checkoutPaymentIntentId(object) || stripeObjectId(object.payment_intent) || "");

  let order = null;
  if (kind === "session" && object.id) {
    order = await d1First(env,
      `SELECT * FROM commerce_orders WHERE checkout_session_id = ? AND commerce_module = 'bookstore'`,
      object.id);
  }
  if (!order && meta.order_id) {
    order = await d1First(env,
      `SELECT * FROM commerce_orders WHERE id = ? AND commerce_module = 'bookstore'`,
      meta.order_id);
  }
  if (!order && paymentIntentId) {
    order = await d1First(env,
      `SELECT * FROM commerce_orders WHERE stripe_payment_intent_id = ? AND commerce_module = 'bookstore'`,
      paymentIntentId);
  }
  if (!order) return null;
  if (order.payment_status === "paid") return order; // accounting wiring can still replay safely

  const fees = paymentIntentId
    ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, order.parish_id, {
      chargeCents: numericCents(object.amount_total || object.amount_received || order.total_charged_cents),
      coverFees: order.cover_fees === 1
    })
    : {};

  const totalCents = numericCents(object.amount_total || object.amount_received)
    || Number(fees.chargeCents || 0)
    || Number(order.subtotal_cents || 0);
  const taxCents = numericCents(object.total_details?.amount_tax) || Number(order.tax_cents || 0);
  const stripeFeeCents = Number(fees.stripeFeeCents || 0);
  const agapayFeeCents = Number(fees.agapayFeeCents || 0); // bookstore takes no AGAPAY fee
  const netCents = Number(fees.parishNetCents || Math.max(0, totalCents - stripeFeeCents - agapayFeeCents));
  const now = new Date().toISOString();
  const completedAt = object.created ? new Date(object.created * 1000).toISOString() : now;

  await d1Run(env,
    `UPDATE commerce_orders
     SET payment_status = 'paid', status = 'completed',
         tax_cents = ?, total_charged_cents = ?, stripe_fee_cents = ?, agapay_fee_cents = ?,
         parish_net_cents = ?, stripe_payment_intent_id = ?, stripe_charge_id = ?,
         stripe_customer_id = COALESCE(NULLIF(?, ''), stripe_customer_id),
         fulfillment_status = CASE WHEN fulfillment_status = 'pending' THEN 'ready' ELSE fulfillment_status END,
         completed_at = ?, updated_at = ?
     WHERE id = ?`,
    taxCents, totalCents, stripeFeeCents, agapayFeeCents, netCents,
    paymentIntentId || order.stripe_payment_intent_id || "",
    fees.stripeChargeId || order.stripe_charge_id || "",
    object.customer || order.stripe_customer_id || "",
    completedAt, now, order.id
  );

  return { ...order, payment_status: "paid", status: "completed", tax_cents: taxCents,
    total_charged_cents: totalCents, stripe_fee_cents: stripeFeeCents,
    agapay_fee_cents: agapayFeeCents, parish_net_cents: netCents,
    stripe_payment_intent_id: paymentIntentId || order.stripe_payment_intent_id || "",
    completed_at: completedAt };
}

// Reflects a Stripe refund back onto the bookstore order so sales reporting
// stays honest. Safe to call for any charge — no-ops when the charge isn't a
// bookstore order.
export async function refundCommerceOrderFromStripe(env, charge = {}) {
  if (!commerceDatabase(env)) return null;
  const pi = stripeObjectId(charge.payment_intent);
  if (!pi) return null;
  const order = await d1First(env,
    `SELECT id, total_charged_cents FROM commerce_orders WHERE stripe_payment_intent_id = ? AND commerce_module = 'bookstore'`,
    pi);
  if (!order) return null;
  const refunded = numericCents(charge.amount_refunded);
  const full = refunded >= numericCents(charge.amount || order.total_charged_cents);
  const state = full ? "refunded" : "partially_refunded";
  await d1Run(env,
    `UPDATE commerce_orders SET payment_status = ?, status = ?, updated_at = ? WHERE id = ?`,
    state, state, new Date().toISOString(), order.id);
  return order;
}

// Reflects Stripe disputes back onto bookstore orders. Safe to call for any
// charge dispute: non-bookstore and unknown payment intents no-op.
export async function disputeCommerceOrderFromStripe(env, dispute = {}, phase = "created") {
  if (!commerceDatabase(env)) return null;
  const pi = stripeObjectId(dispute.payment_intent);
  if (!pi) return null;
  const order = await d1First(env,
    `SELECT id FROM commerce_orders WHERE stripe_payment_intent_id = ? AND commerce_module = 'bookstore'`,
    pi);
  if (!order) return null;
  const won = String(dispute.status || "").toLowerCase() === "won";
  const state = phase === "closed"
    ? (won ? "completed" : "dispute_closed")
    : "disputed";
  const paymentStatus = phase === "closed"
    ? (won ? "paid" : "dispute_closed")
    : "disputed";
  await d1Run(env,
    `UPDATE commerce_orders SET payment_status = ?, status = ?, updated_at = ? WHERE id = ?`,
    paymentStatus, state, new Date().toISOString(), order.id);
  return order;
}
