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
import { agapayEmailHtml, sendEmail } from "../lib/email.js";
import { htmlEscape } from "../lib/format.js";
import {
  bookstoreEnabledFor,
  centsFromBody,
  d1All,
  d1Batch,
  d1First,
  d1Run,
  findRegistrationByParishId,
  generateSecret,
  getBearerToken,
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
import { hasModuleAccess } from "../lib/entitlements.js";

const commerceDatabase = (env) => env.AGAPAY_DB || env.DB || null;
const BOOKSTORE_INVENTORY_MARKER_PREFIX = "[inventory-applied:";
const BOOKSTORE_INVENTORY_ATTENTION = "Inventory attention: paid order exceeded available storefront stock. Review for a refund, backorder, or stock correction.";

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

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
    salePriceCents: Number(row.sale_price_cents || 0),
    onSale: Number(row.sale_price_cents || 0) > 0 && Number(row.sale_price_cents || 0) < Number(row.unit_price_cents || 0),
    costBasisCents: Number(row.cost_basis_cents || 0),
    stockQuantity: Number(row.stock_quantity || 0),
    reorderThreshold: Number(row.reorder_threshold || 0),
    trackInventory: Number(row.track_inventory ?? 1) === 1,
    status: row.status || "active",
    imageUrl: row.image_url || "",
    updatedAt: row.updated_at || ""
  };
}

function normalizeBookstoreCountSession(row) {
  let items = [];
  try { items = JSON.parse(row.items_json || "[]"); } catch { items = []; }
  return {
    id: row.id,
    status: row.status || "draft",
    startedAt: row.started_at || "",
    completedAt: row.completed_at || "",
    createdBy: row.created_by || "",
    items: Array.isArray(items) ? items : []
  };
}

export async function listBookstoreCountSessions(env, parishId) {
  const rows = await d1All(env, `
    SELECT id, status, items_json, started_at, completed_at, created_by
    FROM commerce_inventory_count_sessions
    WHERE parish_id = ?
    ORDER BY started_at DESC, id DESC
    LIMIT 50
  `, parishId);
  return rows.map(normalizeBookstoreCountSession);
}

export async function getBookstoreCountSession(env, parishId, sessionId) {
  const row = await d1First(env, `
    SELECT id, status, items_json, started_at, completed_at, created_by
    FROM commerce_inventory_count_sessions
    WHERE id = ? AND parish_id = ?
  `, sessionId, parishId);
  if (!row) return null;
  const session = normalizeBookstoreCountSession(row);
  const movements = await d1All(env, `
    SELECT m.product_id, m.variant_id, m.movement_type, m.quantity_delta, m.note, m.created_at,
           p.name
    FROM commerce_inventory_movements m
    LEFT JOIN commerce_products p ON p.id = m.product_id AND p.parish_id = m.parish_id
    WHERE m.parish_id = ? AND m.commerce_module = 'bookstore' AND m.count_session_id = ?
    ORDER BY p.name COLLATE NOCASE ASC, m.id ASC
  `, parishId, sessionId);
  return {
    ...session,
    movements: movements.map(row => ({
      productId: row.product_id || "",
      variantId: row.variant_id || "",
      name: row.name || "Bookstore item",
      movementType: row.movement_type,
      quantityDelta: Number(row.quantity_delta || 0),
      note: row.note || "",
      countSessionId: sessionId,
      createdAt: row.created_at || ""
    }))
  };
}

export async function startBookstoreCountSession(env, parishId, createdBy = "parish_dashboard", now = new Date().toISOString()) {
  const open = await d1First(env, `
    SELECT id, status, items_json, started_at, completed_at, created_by
    FROM commerce_inventory_count_sessions
    WHERE parish_id = ? AND status = 'draft'
  `, parishId);
  if (open) {
    return json({ error: "Finish the open bookstore count before starting another.", session: normalizeBookstoreCountSession(open) }, { status: 409 });
  }
  const id = generateSecret("inventory_count");
  await d1Run(env, `
    INSERT INTO commerce_inventory_count_sessions
      (id, parish_id, status, items_json, started_at, created_by)
    VALUES (?, ?, 'draft', '[]', ?, ?)
  `, id, parishId, now, createdBy);
  return json({ ok: true, session: { id, status: "draft", startedAt: now, completedAt: "", createdBy, items: [] } }, { status: 201 });
}

export async function closeBookstoreCountSession(env, parishId, sessionId, body = {}, now = new Date().toISOString()) {
  const session = await d1First(env, `
    SELECT id, status FROM commerce_inventory_count_sessions WHERE id = ? AND parish_id = ?
  `, sessionId, parishId);
  if (!session) return json({ error: "Bookstore count session not found." }, { status: 404 });
  if (session.status !== "draft") return json({ error: "This bookstore count is already completed." }, { status: 409 });

  const submitted = Array.isArray(body.items) ? body.items : [];
  if (!submitted.length) return json({ error: "Count at least one bookstore item before closing." }, { status: 400 });
  if (submitted.length > 250) return json({ error: "Close this count in sections of 250 items or fewer." }, { status: 400 });
  const variantIds = submitted.map(item => String(item.variantId || "").trim());
  if (variantIds.some(id => !id) || new Set(variantIds).size !== variantIds.length) {
    return json({ error: "Each counted bookstore item must be included exactly once." }, { status: 400 });
  }
  for (const item of submitted) {
    if (!Number.isInteger(Number(item.countedQuantity)) || Number(item.countedQuantity) < 0) {
      return json({ error: "Every counted quantity must be a non-negative whole number." }, { status: 400 });
    }
  }

  const placeholders = variantIds.map(() => "?").join(",");
  const variants = await d1All(env, `
    SELECT v.id AS variant_id, v.product_id, v.sku, v.stock_quantity, p.name
    FROM commerce_product_variants v
    JOIN commerce_products p ON p.id = v.product_id AND p.parish_id = v.parish_id
    WHERE v.parish_id = ? AND v.commerce_module = 'bookstore' AND v.status = 'active'
      AND v.track_inventory = 1 AND p.commerce_module = 'bookstore' AND p.status <> 'archived'
      AND v.id IN (${placeholders})
  `, parishId, ...variantIds);
  if (variants.length !== variantIds.length) {
    return json({ error: "One or more counted bookstore items are unavailable or no longer tracked." }, { status: 409 });
  }
  const byVariant = new Map(variants.map(row => [row.variant_id, row]));
  const items = submitted.map(item => {
    const variant = byVariant.get(String(item.variantId));
    const expectedQuantity = Number(variant.stock_quantity || 0);
    const countedQuantity = Number(item.countedQuantity);
    return {
      productId: variant.product_id,
      variantId: variant.variant_id,
      name: variant.name || "Bookstore item",
      sku: variant.sku || "",
      expectedQuantity,
      countedQuantity,
      difference: countedQuantity - expectedQuantity,
      note: String(item.note || "").trim().slice(0, 500)
    };
  });
  for (const item of items) {
    if (item.difference !== 0 && !item.note) {
      return json({ error: `Add a note explaining the difference for ${item.name} before closing this count.` }, { status: 400 });
    }
  }

  const unchangedConditions = items.map(() => `EXISTS (
    SELECT 1 FROM commerce_product_variants
    WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND track_inventory = 1 AND stock_quantity = ?
  )`).join(" AND ");
  const unchangedParams = items.flatMap(item => [item.variantId, parishId, item.expectedQuantity]);
  const statements = [{
    sql: `UPDATE commerce_inventory_count_sessions
          SET status = 'completed', items_json = ?, completed_at = ?
          WHERE id = ? AND parish_id = ? AND status = 'draft' AND ${unchangedConditions}`,
    params: [JSON.stringify(items), now, sessionId, parishId, ...unchangedParams]
  }];
  for (const item of items.filter(item => item.difference !== 0)) {
    statements.push({
      sql: `INSERT INTO commerce_inventory_movements
              (id, parish_id, commerce_module, product_id, variant_id, sku, movement_type,
               quantity_delta, note, count_session_id, created_by, created_at)
            SELECT ?, ?, 'bookstore', ?, id, sku, 'physical_count', ?, ?, ?, 'parish_dashboard', ?
            FROM commerce_product_variants
            WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore'
              AND stock_quantity = ?
              AND EXISTS (
                SELECT 1 FROM commerce_inventory_count_sessions
                WHERE id = ? AND parish_id = ? AND status = 'completed' AND completed_at = ?
              )`,
      params: [generateSecret("inventory_movement"), parishId, item.productId, item.difference,
        item.note, sessionId, now, item.variantId, parishId, item.expectedQuantity,
        sessionId, parishId, now]
    });
    statements.push({
      sql: `UPDATE commerce_product_variants
            SET stock_quantity = ?, updated_at = ?
            WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND stock_quantity = ?
              AND EXISTS (
                SELECT 1 FROM commerce_inventory_count_sessions
                WHERE id = ? AND parish_id = ? AND status = 'completed' AND completed_at = ?
              )`,
      params: [item.countedQuantity, now, item.variantId, parishId, item.expectedQuantity,
        sessionId, parishId, now]
    });
  }
  const results = await d1Batch(env, statements);
  if (changedRows(results?.[0]) !== 1) {
    return json({ error: "Bookstore stock changed during this count. Review the current quantities and try closing again." }, { status: 409 });
  }
  return json({ ok: true, session: await getBookstoreCountSession(env, parishId, sessionId) });
}

export async function listBookstoreLowStock(env, parishId) {
  const rows = await d1All(env, `
    SELECT p.*, v.id AS variant_id, v.sku, v.unit_price_cents, v.cost_basis_cents,
           v.stock_quantity, v.reorder_threshold
    FROM commerce_product_variants v
    JOIN commerce_products p ON p.id = v.product_id AND p.parish_id = v.parish_id
    WHERE v.parish_id = ? AND v.commerce_module = 'bookstore'
      AND p.commerce_module = 'bookstore' AND p.status <> 'archived'
      AND v.status = 'active' AND v.track_inventory = 1
      AND v.reorder_threshold > 0 AND v.stock_quantity <= v.reorder_threshold
    ORDER BY (v.reorder_threshold - v.stock_quantity) DESC,
             v.stock_quantity ASC, p.name COLLATE NOCASE ASC, v.id ASC
  `, parishId);
  return rows.map(normalizeBookstoreProduct);
}

async function findBookstoreCatalogItemByCode(env, parishId, code) {
  if (!code) return null;
  return d1First(env, `
    SELECT p.id, v.id AS variant_id
    FROM commerce_product_variants v
    JOIN commerce_products p ON p.id = v.product_id
    WHERE p.parish_id = ? AND p.commerce_module = 'bookstore'
      AND (v.sku = ? OR v.barcode = ? OR p.default_sku = ?)
    LIMIT 1
  `, parishId, code, code, code);
}

async function promotePaidScannedBooksToCatalog(env, order, now) {
  if (!order?.id || !["scan_and_go", "shopper_added"].includes(order.source)) return;
  const items = await d1All(env, `
    SELECT * FROM commerce_order_items
    WHERE order_id = ? AND parish_id = ? AND commerce_module = 'bookstore'
      AND (product_id IS NULL OR product_id = '')
    ORDER BY created_at, id
  `, order.id, order.parish_id);

  let firstCatalogItem = null;
  for (const item of items) {
    const category = String(item.item_category || "other").trim().slice(0, 40) || "other";
    const generatedCode = `shopper-${category}-${String(item.item_name || "item").toLowerCase().replace(/&/g, "-and-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)}`;
    const code = String(item.barcode || item.sku || generatedCode).trim().slice(0, 80);
    if (!code) continue;
    let catalogItem = await findBookstoreCatalogItemByCode(env, order.parish_id, code);

    if (!catalogItem) {
      const productId = generateSecret("commerce_product");
      const variantId = generateSecret("commerce_variant");
      try {
        await d1Run(env, `
          INSERT INTO commerce_products
            (id, parish_id, commerce_module, name, description, item_category, default_sku,
             default_tax_code, fulfillment_type, status, image_url, created_at, updated_at)
          VALUES (?, ?, 'bookstore', ?, ?, ?, ?, ?, ?, 'active', '', ?, ?)
        `, productId, order.parish_id, String(item.item_name || "Bookstore item").slice(0, 180),
          String(item.item_description || item.item_name || "").slice(0, 600), category, code,
          item.tax_code || "", item.fulfillment_type || "physical_pickup", now, now);
        await d1Run(env, `
          INSERT INTO commerce_product_variants
            (id, product_id, parish_id, commerce_module, sku, barcode, variant_name,
             unit_price_cents, cost_basis_cents, tax_code, fulfillment_type, stock_quantity,
             reorder_threshold, track_inventory, status, created_at, updated_at)
          VALUES (?, ?, ?, 'bookstore', ?, ?, '', ?, 0, ?, ?, 0, 0, 0, 'active', ?, ?)
        `, variantId, productId, order.parish_id, code, code, Number(item.unit_price_cents || 0),
          item.tax_code || "", item.fulfillment_type || "physical_pickup", now, now);
        catalogItem = { id: productId, variant_id: variantId };
      } catch (error) {
        // A concurrent webhook may have inserted this ISBN first. Reuse it.
        catalogItem = await findBookstoreCatalogItemByCode(env, order.parish_id, code);
        if (!catalogItem) throw error;
      }
    }

    // A fresh paid sale makes an archived matching ISBN available again.
    await d1Run(env, "UPDATE commerce_products SET status = 'active', updated_at = ? WHERE id = ? AND parish_id = ?",
      now, catalogItem.id, order.parish_id);
    await d1Run(env, "UPDATE commerce_product_variants SET status = 'active', updated_at = ? WHERE id = ? AND parish_id = ?",
      now, catalogItem.variant_id, order.parish_id);

    let snapshot = {};
    try { snapshot = JSON.parse(item.snapshot_json || "{}"); } catch { snapshot = {}; }
    snapshot.catalogProductId = catalogItem.id;
    snapshot.catalogVariantId = catalogItem.variant_id;
    snapshot.donorSuggested = true;
    await d1Run(env, `
      UPDATE commerce_order_items
      SET product_id = ?, variant_id = ?, snapshot_json = ?, updated_at = ?
      WHERE id = ? AND order_id = ?
    `, catalogItem.id, catalogItem.variant_id, JSON.stringify(snapshot).slice(0, 4000), now, item.id, order.id);
    if (!firstCatalogItem) firstCatalogItem = catalogItem;
  }

  if (firstCatalogItem) {
    await d1Run(env, `
      UPDATE commerce_orders SET product_id = ?, variant_id = ?, updated_at = ? WHERE id = ?
    `, firstCatalogItem.id, firstCatalogItem.variant_id, now, order.id);
  }
}

export async function applyBookstoreInventoryAtCompletion(env, order, now = new Date().toISOString(), commerceModule = "bookstore") {
  if (!order?.id || !order?.parish_id || !commerceDatabase(env)) return { applied: false, oversold: false };
  const trackedItems = await d1All(env, `
    SELECT i.product_id, i.variant_id, MAX(COALESCE(i.sku, v.sku, '')) AS sku,
           SUM(i.quantity) AS quantity
    FROM commerce_order_items i
    JOIN commerce_product_variants v
      ON v.id = i.variant_id AND v.parish_id = i.parish_id AND v.commerce_module = ?
    WHERE i.order_id = ? AND i.parish_id = ? AND i.commerce_module = ?
      AND i.variant_id IS NOT NULL AND i.variant_id <> '' AND v.track_inventory = 1
    GROUP BY i.variant_id
  `, commerceModule, order.id, order.parish_id, commerceModule);
  if (!trackedItems.length) return { applied: false, oversold: false };

  const marker = `${BOOKSTORE_INVENTORY_MARKER_PREFIX}${generateSecret("claim")}]`;
  const markerLike = `%${marker}%`;
  const statements = [
    {
      sql: `UPDATE commerce_orders
            SET parish_notes = trim(COALESCE(parish_notes, '') || CASE WHEN COALESCE(parish_notes, '') = '' THEN '' ELSE char(10) END || ?),
                updated_at = ?
            WHERE id = ? AND parish_id = ? AND commerce_module = ?
              AND COALESCE(parish_notes, '') NOT LIKE ?`,
      params: [marker, now, order.id, order.parish_id, commerceModule, `%${BOOKSTORE_INVENTORY_MARKER_PREFIX}%`]
    },
    {
      sql: `UPDATE commerce_orders
            SET parish_notes = trim(COALESCE(parish_notes, '') || char(10) || ?),
                fulfillment_status = 'pending', updated_at = ?
            WHERE id = ? AND parish_id = ? AND commerce_module = ?
              AND parish_notes LIKE ?
              AND EXISTS (
                SELECT 1
                FROM commerce_order_items i
                JOIN commerce_product_variants v
                  ON v.id = i.variant_id AND v.parish_id = i.parish_id AND v.commerce_module = ?
                WHERE i.order_id = commerce_orders.id AND i.parish_id = commerce_orders.parish_id
                  AND i.commerce_module = ? AND v.track_inventory = 1
                GROUP BY v.id
                HAVING SUM(i.quantity) > MAX(v.stock_quantity)
              )`,
      params: [BOOKSTORE_INVENTORY_ATTENTION, now, order.id, order.parish_id, commerceModule, markerLike, commerceModule, commerceModule]
    },
    ...trackedItems.flatMap(item => {
      const quantity = Number(item.quantity || 0);
      return [
        {
          sql: `INSERT INTO commerce_inventory_movements
                  (id, parish_id, commerce_module, product_id, variant_id, sku,
                   movement_type, quantity_delta, order_id, created_at)
                SELECT ?, ?, ?, ?, ?, ?, 'sale', ?, ?, ?
                WHERE EXISTS (
                  SELECT 1 FROM commerce_product_variants v
                  JOIN commerce_orders o ON o.id = ? AND o.parish_id = ?
                  WHERE v.id = ? AND v.parish_id = ? AND v.commerce_module = ?
                    AND v.track_inventory = 1 AND v.stock_quantity >= ?
                    AND o.parish_notes LIKE ?
                ) AND NOT EXISTS (
                  SELECT 1 FROM commerce_inventory_movements m
                  WHERE m.parish_id = ? AND m.commerce_module = ?
                    AND m.variant_id = ? AND m.order_id = ? AND m.movement_type = 'sale'
                )`,
          params: [generateSecret("inventory_movement"), order.parish_id, commerceModule, item.product_id,
            item.variant_id, item.sku || null, -quantity, order.id, now,
            order.id, order.parish_id, item.variant_id, order.parish_id, commerceModule, quantity, markerLike,
            order.parish_id, commerceModule, item.variant_id, order.id]
        },
        {
          sql: `UPDATE commerce_product_variants
                SET stock_quantity = stock_quantity - ?, updated_at = ?
                WHERE id = ? AND parish_id = ? AND commerce_module = ?
                  AND track_inventory = 1 AND stock_quantity >= ?
                  AND EXISTS (
                    SELECT 1 FROM commerce_orders o
                    WHERE o.id = ? AND o.parish_id = ? AND o.parish_notes LIKE ?
                  )`,
          params: [quantity, now, item.variant_id, order.parish_id, commerceModule,
            quantity, order.id, order.parish_id, markerLike]
        }
      ];
    })
  ];

  const results = await d1Batch(env, statements);
  const applied = changedRows(results?.[0]) === 1;
  const oversold = applied && changedRows(results?.[1]) === 1;
  return { applied, oversold };
}

export async function patchBookstoreProduct(env, parishId, productId, body = {}, now = new Date().toISOString()) {
  const product = await d1First(env,
    `SELECT p.id, v.id AS variant_id, v.stock_quantity, v.cost_basis_cents
     FROM commerce_products p
     LEFT JOIN commerce_product_variants v ON v.product_id = p.id AND v.status = 'active'
     WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'bookstore'`,
    productId, parishId
  );
  if (!product) return json({ error: "Bookstore item not found." }, { status: 404 });

  const item = normalizeBookstoreBody(body);
  const salePriceCents = body.salePriceCents === null || body.salePriceCents === ""
    ? 0
    : centsFromBody(body.salePriceCents, 0);
  if (!item.name) return json({ error: "Item name is required." }, { status: 422 });
  if (item.priceCents < 1) return json({ error: "Price must be greater than zero." }, { status: 422 });
  if (salePriceCents > 0 && salePriceCents >= item.priceCents) {
    return json({ error: "Sale price must be lower than the regular price." }, { status: 422 });
  }

  const stockSubmitted = Object.prototype.hasOwnProperty.call(body, "stockQuantity");
  const costSubmitted = Object.prototype.hasOwnProperty.call(body, "costBasisCents");
  const oldStock = Number(product.stock_quantity || 0);
  const newStock = stockSubmitted ? item.stockQuantity : oldStock;
  const currentCost = Number(product.cost_basis_cents || 0);
  const newCost = costSubmitted ? item.costBasisCents : currentCost;
  const stockChanged = newStock !== oldStock;
  const stockAdjustmentReason = String(body.stockAdjustmentReason || "").trim().slice(0, 500);
  if (stockChanged && !stockAdjustmentReason) {
    return json({ error: "Explain the stock difference before saving this adjustment." }, { status: 422 });
  }

  const statements = [
    {
      sql: `UPDATE commerce_products
            SET name = ?, description = ?, item_category = ?, default_sku = ?, image_url = ?, updated_at = ?
            WHERE id = ? AND parish_id = ?`,
      params: [item.name, item.description, item.category, item.sku || null, item.imageUrl, now, productId, parishId]
    }
  ];

  if (product.variant_id) {
    if (stockChanged) {
      statements.push({
        sql: `INSERT INTO commerce_inventory_movements
                (id, parish_id, commerce_module, product_id, variant_id, sku,
                 movement_type, quantity_delta, note, created_at)
              SELECT ?, ?, 'bookstore', ?, id, ?, 'manual_adjustment', ?, ?, ?
              FROM commerce_product_variants
              WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND stock_quantity = ?`,
        params: [generateSecret("inventory_movement"), parishId, productId, item.sku || null,
          newStock - oldStock, stockAdjustmentReason, now, product.variant_id, parishId, oldStock]
      });
    }
    statements.push({
      sql: `UPDATE commerce_product_variants
            SET sku = ?, unit_price_cents = ?, sale_price_cents = ?, stock_quantity = ?, cost_basis_cents = ?, reorder_threshold = ?, updated_at = ?
            WHERE id = ? AND parish_id = ?${stockChanged ? " AND stock_quantity = ?" : ""}`,
      params: [item.sku || null, item.priceCents, salePriceCents || null, newStock, newCost, item.reorderThreshold,
        now, product.variant_id, parishId, ...(stockChanged ? [oldStock] : [])]
    });
  } else {
    const variantId = generateSecret("commerce_variant");
    statements.push({
      sql: `INSERT INTO commerce_product_variants
              (id, product_id, parish_id, commerce_module, sku, variant_name, unit_price_cents, sale_price_cents,
               cost_basis_cents, stock_quantity, reorder_threshold, status, created_at, updated_at)
            VALUES (?, ?, ?, 'bookstore', ?, '', ?, ?, ?, ?, ?, 'active', ?, ?)`,
      params: [variantId, productId, parishId, item.sku || null, item.priceCents, salePriceCents || null, item.costBasisCents,
        newStock, item.reorderThreshold, now, now]
    });
    if (stockChanged) {
      statements.push({
        sql: `INSERT INTO commerce_inventory_movements
                (id, parish_id, commerce_module, product_id, variant_id, sku,
                 movement_type, quantity_delta, note, created_at)
              VALUES (?, ?, 'bookstore', ?, ?, ?, 'manual_adjustment', ?, ?, ?)`,
        params: [generateSecret("inventory_movement"), parishId, productId, variantId,
          item.sku || null, newStock, stockAdjustmentReason, now]
      });
    }
  }

  const results = await d1Batch(env, statements);
  if (product.variant_id && stockChanged && changedRows(results?.[results.length - 1]) !== 1) {
    return json({ error: "Stock changed while this item was open. Reload it and try again." }, { status: 409 });
  }
  return json({ ok: true });
}

export async function patchBookstoreReorderThreshold(env, parishId, productId, body = {}, now = new Date().toISOString()) {
  const rawThreshold = body.reorderThreshold;
  const reorderThreshold = Number(rawThreshold);
  if (rawThreshold === null || rawThreshold === "" || !Number.isInteger(reorderThreshold) || reorderThreshold < 0) {
    return json({ error: "Reorder threshold must be a non-negative whole number." }, { status: 422 });
  }
  const product = await d1First(env,
    `SELECT p.id, v.id AS variant_id
     FROM commerce_products p
     JOIN commerce_product_variants v ON v.product_id = p.id AND v.status = 'active'
     WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'bookstore'
       AND v.parish_id = ? AND v.commerce_module = 'bookstore'`,
    productId, parishId, parishId
  );
  if (!product) return json({ error: "Bookstore item not found." }, { status: 404 });

  const result = await d1Run(env, `
    UPDATE commerce_product_variants
    SET reorder_threshold = ?, updated_at = ?
    WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND status = 'active'
  `, reorderThreshold, now, product.variant_id, parishId);
  if (changedRows(result) !== 1) {
    return json({ error: "Unable to update the reorder threshold." }, { status: 409 });
  }
  return json({ ok: true, productId, variantId: product.variant_id, reorderThreshold });
}

export async function receiveBookstoreStock(env, parishId, productId, body = {}, now = new Date().toISOString()) {
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return json({ error: "Receiving quantity must be a positive whole number." }, { status: 422 });
  }

  const costProvided = Object.prototype.hasOwnProperty.call(body, "unitCostCents")
    && body.unitCostCents !== null && body.unitCostCents !== "";
  const unitCostCents = Number(body.unitCostCents);
  if (costProvided && (!Number.isInteger(unitCostCents) || unitCostCents < 0)) {
    return json({ error: "Unit cost must be a non-negative whole number of cents." }, { status: 422 });
  }
  const reference = String(body.reference || "").trim().slice(0, 500);

  const product = await d1First(env,
    `SELECT p.id, v.id AS variant_id, v.sku
     FROM commerce_products p
     JOIN commerce_product_variants v ON v.product_id = p.id AND v.status = 'active'
     WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'bookstore'
       AND v.parish_id = ? AND v.commerce_module = 'bookstore'`,
    productId, parishId, parishId
  );
  if (!product) return json({ error: "Bookstore item not found." }, { status: 404 });

  const statements = [
    {
      sql: `INSERT INTO commerce_inventory_movements
              (id, parish_id, commerce_module, product_id, variant_id, sku,
               movement_type, quantity_delta, unit_cost_cents, note, created_at)
            SELECT ?, ?, 'bookstore', ?, id, sku, 'receiving', ?, ?, ?, ?
            FROM commerce_product_variants
            WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND track_inventory = 1`,
      params: [generateSecret("inventory_movement"), parishId, productId, quantity,
        costProvided ? unitCostCents : null, reference || null, now, product.variant_id, parishId]
    },
    {
      sql: `UPDATE commerce_product_variants
            SET stock_quantity = stock_quantity + ?,
                ${costProvided ? "cost_basis_cents = ?," : ""}
                updated_at = ?
            WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND track_inventory = 1`,
      params: [quantity, ...(costProvided ? [unitCostCents] : []), now, product.variant_id, parishId]
    }
  ];
  const results = await d1Batch(env, statements);
  if (changedRows(results?.[1]) !== 1) {
    return json({ error: "Inventory tracking is not enabled for this item." }, { status: 409 });
  }
  const updated = await d1First(env,
    `SELECT stock_quantity, cost_basis_cents FROM commerce_product_variants
     WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore'`,
    product.variant_id, parishId
  );
  return json({
    ok: true,
    stockQuantity: Number(updated?.stock_quantity || 0),
    costBasisCents: Number(updated?.cost_basis_cents || 0)
  });
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
  if (!hasModuleAccess(found.registration, "bookstore")) {
    return json({ error: "Bookstore is included with Give + or Parish." }, { status: 403 });
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
              o.payment_status, o.fulfillment_status, o.parish_notes, o.source, o.created_at, o.completed_at,
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
      inventoryAttention: String(r.parish_notes || "").includes(BOOKSTORE_INVENTORY_ATTENTION),
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
      `SELECT p.*, v.id AS variant_id, v.sku, v.unit_price_cents, v.sale_price_cents, v.cost_basis_cents,
              v.stock_quantity, v.reorder_threshold, v.track_inventory
       FROM commerce_products p
       LEFT JOIN commerce_product_variants v
         ON v.product_id = p.id AND v.status = 'active'
       WHERE p.parish_id = ? AND p.commerce_module = 'bookstore' AND p.status <> 'archived'
       ORDER BY p.name COLLATE NOCASE ASC`,
      parishId
    );
    return json({ products: rows.map(normalizeBookstoreProduct) });
  }

  if (segments[0] === "count-sessions" && segments.length === 1 && request.method === "GET") {
    return json({ sessions: await listBookstoreCountSessions(env, parishId) });
  }

  if (segments[0] === "count-sessions" && segments.length === 1 && request.method === "POST") {
    return startBookstoreCountSession(env, parishId, "parish_dashboard", now);
  }

  if (segments[0] === "count-sessions" && segments[1] && segments.length === 2 && request.method === "GET") {
    const session = await getBookstoreCountSession(env, parishId, decodeURIComponent(segments[1]));
    return session ? json({ session }) : json({ error: "Bookstore count session not found." }, { status: 404 });
  }

  if (segments[0] === "count-sessions" && segments[1] && segments[2] === "close" && segments.length === 3 && request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
    return closeBookstoreCountSession(env, parishId, decodeURIComponent(segments[1]), body, now);
  }

  if (segments[0] === "products" && segments[1] === "low-stock" && request.method === "GET" && segments.length === 2) {
    const products = await listBookstoreLowStock(env, parishId);
    return json({ products, count: products.length });
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

    if (request.method === "GET" && segments[2] === "movements" && segments.length === 3) {
      const rows = await d1All(env,
        `SELECT m.movement_type, m.quantity_delta, m.note, m.order_id, m.count_session_id, m.created_at,
                o.order_number
         FROM commerce_inventory_movements m
         LEFT JOIN commerce_orders o ON o.id = m.order_id AND o.parish_id = m.parish_id
         WHERE m.parish_id = ? AND m.commerce_module = 'bookstore' AND m.product_id = ?
         ORDER BY m.created_at DESC, m.id DESC`,
        parishId, productId
      );
      return json({ movements: rows.map(row => ({
        movementType: row.movement_type,
        quantityDelta: Number(row.quantity_delta || 0),
        note: row.note || "",
        orderId: row.order_id || null,
        orderNumber: row.order_number || null,
        countSessionId: row.count_session_id || null,
        createdAt: row.created_at
      })) });
    }

    if (request.method === "POST" && segments[2] === "receive" && segments.length === 3) {
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
      return receiveBookstoreStock(env, parishId, productId, body, now);
    }

    if (request.method === "PATCH" && segments.length === 2) {
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
      const submittedFields = Object.keys(body);
      if (submittedFields.length === 1 && submittedFields[0] === "reorderThreshold") {
        return patchBookstoreReorderThreshold(env, parishId, productId, body, now);
      }
      return patchBookstoreProduct(env, parishId, productId, body, now);
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

function commerceMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export async function sendCommerceReceiptIfNeeded(env, orderId) {
  if (!commerceDatabase(env) || !orderId || !String(env.RESEND_API_KEY || "").trim()) {
    return { status: "not_configured" };
  }
  const order = await d1First(env, "SELECT * FROM commerce_orders WHERE id = ?", orderId);
  if (!order?.donor_email || !["paid", "partially_refunded", "refunded"].includes(order.payment_status)) return null;

  const now = new Date().toISOString();
  const claim = await d1Run(env, `
    UPDATE commerce_orders
    SET receipt_email_status = 'sending', updated_at = ?
    WHERE id = ?
      AND (
        COALESCE(receipt_email_status, '') NOT IN ('sending', 'sent')
        OR (receipt_email_status = 'sending' AND datetime(updated_at) <= datetime('now', '-15 minutes'))
      )
  `, now, order.id);
  if (changedRows(claim) !== 1) return { status: "already_claimed" };

  try {
    const items = await d1All(env, `
      SELECT item_name, item_description, quantity, subtotal_cents
      FROM commerce_order_items
      WHERE order_id = ?
      ORDER BY created_at, id
    `, order.id);
    const found = await findRegistrationByParishId(env, order.parish_id);
    const registration = found?.registration || {};
    const parishName = registration.commerceSellerDisplayName
      || registration.name || registration.parishName || "your parish";
    const channelLabel = order.commerce_module === "events" ? "Meals & Events" : "Bookstore";
    const itemRows = (items.length ? items : [{
      item_name: order.item_description,
      quantity: order.quantity,
      subtotal_cents: order.subtotal_cents
    }]).map((item) => `
      <tr>
        <td style="padding:7px 10px 7px 0;color:#171715;">${htmlEscape(item.item_name || item.item_description || "Commerce item")} × ${Math.max(1, Number(item.quantity || 1))}</td>
        <td style="padding:7px 0;text-align:right;color:#171715;">${commerceMoney(item.subtotal_cents)}</td>
      </tr>`).join("");
    const appUrl = env.AGAPAY_APP_URL || env.AGAPAY_PUBLIC_URL || "https://agapay.app";
    const result = await sendEmail(env, {
      from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
      to: [String(order.donor_email).trim().toLowerCase()],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
      subject: `${channelLabel} receipt — ${parishName}`,
      html: agapayEmailHtml(appUrl, `${channelLabel} receipt`, `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Thank you, ${htmlEscape(order.donor_name || "friend")}. Your purchase from <strong>${htmlEscape(parishName)}</strong> is confirmed.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${itemRows}
          <tr><td style="padding:9px 10px 7px 0;border-top:1px solid #E5DED0;"><strong>Subtotal</strong></td><td style="padding:9px 0 7px;border-top:1px solid #E5DED0;text-align:right;">${commerceMoney(order.subtotal_cents)}</td></tr>
          <tr><td style="padding:7px 10px 7px 0;"><strong>Sales tax</strong></td><td style="padding:7px 0;text-align:right;">${commerceMoney(order.tax_cents)}</td></tr>
          <tr><td style="padding:7px 10px 7px 0;"><strong>Total charged</strong></td><td style="padding:7px 0;text-align:right;"><strong>${commerceMoney(order.total_charged_cents)}</strong></td></tr>
        </table>
        ${order.pickup_note ? `<p style="margin:18px 0 0;font-size:13px;color:#595959;"><strong>Pickup note:</strong> ${htmlEscape(order.pickup_note)}</p>` : ""}
        <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#6F6A60;">This is a purchase receipt, not a charitable-contribution acknowledgment.</p>
      `),
      text: `${channelLabel} receipt from ${parishName}\nSubtotal: ${commerceMoney(order.subtotal_cents)}\nSales tax: ${commerceMoney(order.tax_cents)}\nTotal charged: ${commerceMoney(order.total_charged_cents)}\nThis is a purchase receipt, not a charitable-contribution acknowledgment.`
    });
    const status = result?.status === "sent" ? "sent" : (result?.status || "failed");
    await d1Run(env, `
      UPDATE commerce_orders
      SET receipt_email_status = ?, receipt_email_id = ?, receipt_email_sent_at = ?, updated_at = ?
      WHERE id = ?
    `, status, result?.id || "", status === "sent" ? now : null, now, order.id);
    return result;
  } catch (error) {
    await d1Run(env,
      "UPDATE commerce_orders SET receipt_email_status = 'failed', updated_at = ? WHERE id = ?",
      new Date().toISOString(), order.id);
    return { status: "failed", detail: error?.message || String(error) };
  }
}

// Marks a commerce order paid once Stripe confirms, and reconciles
// real Stripe fees / parish net from the balance transaction. Without this the
// order sits at payment_status='pending' forever and never shows up in sales
// reporting. Replays do not re-apply inventory; a later Checkout Session may
// still reconcile automatic-tax facts after a PaymentIntent arrived first.
// `object` is the Stripe checkout.session (kind='session') or payment_intent
// (kind='payment_intent') from the webhook.
export async function completeCommerceOrderFromStripe(env, object = {}, kind = "session") {
  if (!commerceDatabase(env)) return null;
  const meta = object.metadata || {};

  const paymentIntentId = kind === "payment_intent"
    ? (object.id || "")
    : (checkoutPaymentIntentId(object) || stripeObjectId(object.payment_intent) || "");

  let order = null;
  if (kind === "session" && object.id) {
    order = await d1First(env,
      `SELECT * FROM commerce_orders WHERE checkout_session_id = ?`,
      object.id);
  }
  if (!order && meta.order_id) {
    order = await d1First(env,
      `SELECT * FROM commerce_orders WHERE id = ?`,
      meta.order_id);
  }
  if (!order && paymentIntentId) {
    order = await d1First(env,
      `SELECT * FROM commerce_orders WHERE stripe_payment_intent_id = ?`,
      paymentIntentId);
  }
  if (!order) return null;
  // Stripe does not guarantee webhook delivery order. A refund or dispute can
  // be processed before a delayed payment/session completion event, so never
  // let completion regress one of those later lifecycle states back to paid.
  if (["paid", "partially_refunded", "refunded", "disputed", "dispute_closed"].includes(order.payment_status)) {
    const replayNow = new Date().toISOString();
    let replayedOrder = order;
    if (kind === "session") {
      const hasSessionTax = object.total_details?.amount_tax != null;
      const hasSessionTotal = object.amount_total != null;
      const reconciledTaxCents = hasSessionTax ? numericCents(object.total_details.amount_tax) : Number(order.tax_cents || 0);
      const reconciledTotalCents = hasSessionTotal ? numericCents(object.amount_total) : Number(order.total_charged_cents || 0);
      await d1Run(env, `
        UPDATE commerce_orders
        SET tax_cents = ?, total_charged_cents = ?,
            stripe_payment_intent_id = COALESCE(NULLIF(?, ''), stripe_payment_intent_id),
            stripe_customer_id = COALESCE(NULLIF(?, ''), stripe_customer_id),
            updated_at = ?
        WHERE id = ?
      `, reconciledTaxCents, reconciledTotalCents,
        paymentIntentId, stripeObjectId(object.customer), replayNow, order.id);
      replayedOrder = {
        ...order,
        tax_cents: reconciledTaxCents,
        total_charged_cents: reconciledTotalCents,
        stripe_payment_intent_id: paymentIntentId || order.stripe_payment_intent_id,
        stripe_customer_id: stripeObjectId(object.customer) || order.stripe_customer_id,
        updated_at: replayNow
      };
    }
    await promotePaidScannedBooksToCatalog(env, replayedOrder, replayNow);
    return replayedOrder;
  }

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
  const refundedCents = Number(fees.stripeRefundedCents || 0);
  const paymentStatus = fees.stripeDisputed
    ? "disputed"
    : refundedCents >= totalCents
      ? "refunded"
      : refundedCents > 0
        ? "partially_refunded"
        : "paid";
  const status = paymentStatus === "paid" ? "completed" : paymentStatus;
  const now = new Date().toISOString();
  const completedAt = object.created ? new Date(object.created * 1000).toISOString() : now;

  await d1Run(env,
    `UPDATE commerce_orders
     SET payment_status = ?, status = ?,
         tax_cents = ?, total_charged_cents = ?, stripe_fee_cents = ?, agapay_fee_cents = ?,
         parish_net_cents = ?, stripe_payment_intent_id = ?, stripe_charge_id = ?,
         stripe_customer_id = COALESCE(NULLIF(?, ''), stripe_customer_id),
          fulfillment_status = CASE
            WHEN COALESCE(parish_notes, '') LIKE '%Inventory attention:%' THEN fulfillment_status
            WHEN fulfillment_status = 'pending' THEN 'ready'
            ELSE fulfillment_status
          END,
         completed_at = ?, updated_at = ?
     WHERE id = ?`,
    paymentStatus, status, taxCents, totalCents, stripeFeeCents, agapayFeeCents, netCents,
    paymentIntentId || order.stripe_payment_intent_id || "",
    fees.stripeChargeId || order.stripe_charge_id || "",
    object.customer || order.stripe_customer_id || "",
    completedAt, now, order.id
  );

  await promotePaidScannedBooksToCatalog(env, order, now);
  if (order.commerce_module === "bookstore" || order.commerce_module === "events") {
    await applyBookstoreInventoryAtCompletion(env, order, now, order.commerce_module);
  }

  return { ...order, payment_status: paymentStatus, status, tax_cents: taxCents,
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
    `SELECT id, total_charged_cents FROM commerce_orders WHERE stripe_payment_intent_id = ?`,
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

// Reflects Stripe disputes back onto commerce orders (any module). Safe to
// call for any charge dispute: unknown payment intents no-op.
export async function disputeCommerceOrderFromStripe(env, dispute = {}, phase = "created") {
  if (!commerceDatabase(env)) return null;
  const pi = stripeObjectId(dispute.payment_intent);
  if (!pi) return null;
  const order = await d1First(env,
    `SELECT id FROM commerce_orders WHERE stripe_payment_intent_id = ?`,
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
