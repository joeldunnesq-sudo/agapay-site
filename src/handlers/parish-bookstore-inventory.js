import { hasModuleAccess } from '../lib/entitlements.js';
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
  unauthorized,
  verifyParishDashboardBearer,
} from './parish.js';

const commerceDatabase = (env) => env.AGAPAY_DB || env.DB || null;
const BOOKSTORE_INVENTORY_MARKER_PREFIX = '[inventory-applied:';
export const BOOKSTORE_INVENTORY_ATTENTION =
  'Inventory attention: paid order exceeded available storefront stock. Review for a refund, backorder, or stock correction.';

export function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export const BOOKSTORE_STARTER_CATALOG = [
  {
    label: 'Books',
    items: [
      { key: 'orthodox-study-bible', name: 'Orthodox Study Bible', category: 'book', suggestedPriceCents: 4995 },
      { key: 'prayer-book', name: 'Jordanville Prayer Book', category: 'book', suggestedPriceCents: 2495 },
      { key: 'way-of-a-pilgrim', name: 'The Way of a Pilgrim', category: 'book', suggestedPriceCents: 1595 },
    ],
  },
  {
    label: 'Devotional Items',
    items: [
      {
        key: 'wool-prayer-rope-33',
        name: '33-knot wool prayer rope',
        category: 'prayer_rope',
        suggestedPriceCents: 1800,
      },
      { key: 'small-icon-christ', name: 'Small icon of Christ', category: 'icon', suggestedPriceCents: 2200 },
      { key: 'beeswax-candle-bundle', name: 'Beeswax candle bundle', category: 'candle', suggestedPriceCents: 1200 },
    ],
  },
  {
    label: 'Church Goods',
    items: [
      { key: 'cross-necklace', name: 'Baptismal cross necklace', category: 'jewelry', suggestedPriceCents: 3000 },
      { key: 'frankincense-sampler', name: 'Frankincense sampler', category: 'incense', suggestedPriceCents: 1400 },
      { key: 'chant-cd', name: 'Parish chant recording', category: 'cd_dvd', suggestedPriceCents: 1500 },
    ],
  },
];

export function normalizeBookstoreProduct(row) {
  return {
    id: row.id,
    variantId: row.variant_id || '',
    name: row.name || '',
    description: row.description || '',
    category: row.item_category || 'other',
    sku: row.sku || row.default_sku || '',
    priceCents: Number(row.unit_price_cents || 0),
    salePriceCents: Number(row.sale_price_cents || 0),
    onSale:
      Number(row.sale_price_cents || 0) > 0 && Number(row.sale_price_cents || 0) < Number(row.unit_price_cents || 0),
    costBasisCents: Number(row.cost_basis_cents || 0),
    stockQuantity: Number(row.stock_quantity || 0),
    reorderThreshold: Number(row.reorder_threshold || 0),
    trackInventory: Number(row.track_inventory ?? 1) === 1,
    status: row.status || 'active',
    imageUrl: row.image_url || '',
    updatedAt: row.updated_at || '',
  };
}

function normalizeBookstoreCountSession(row) {
  let items = [];
  try {
    items = JSON.parse(row.items_json || '[]');
  } catch {
    items = [];
  }
  return {
    id: row.id,
    status: row.status || 'draft',
    startedAt: row.started_at || '',
    completedAt: row.completed_at || '',
    createdBy: row.created_by || '',
    items: Array.isArray(items) ? items : [],
  };
}

export async function listBookstoreCountSessions(env, parishId) {
  const rows = await d1All(
    env,
    `
    SELECT id, status, items_json, started_at, completed_at, created_by
    FROM commerce_inventory_count_sessions
    WHERE parish_id = ?
    ORDER BY started_at DESC, id DESC
    LIMIT 50
  `,
    parishId
  );
  return rows.map(normalizeBookstoreCountSession);
}

export async function getBookstoreCountSession(env, parishId, sessionId) {
  const row = await d1First(
    env,
    `
    SELECT id, status, items_json, started_at, completed_at, created_by
    FROM commerce_inventory_count_sessions
    WHERE id = ? AND parish_id = ?
  `,
    sessionId,
    parishId
  );
  if (!row) return null;
  const session = normalizeBookstoreCountSession(row);
  const movements = await d1All(
    env,
    `
    SELECT m.product_id, m.variant_id, m.movement_type, m.quantity_delta, m.note, m.created_at,
           p.name
    FROM commerce_inventory_movements m
    LEFT JOIN commerce_products p ON p.id = m.product_id AND p.parish_id = m.parish_id
    WHERE m.parish_id = ? AND m.commerce_module = 'bookstore' AND m.count_session_id = ?
    ORDER BY p.name COLLATE NOCASE ASC, m.id ASC
  `,
    parishId,
    sessionId
  );
  return {
    ...session,
    movements: movements.map((row) => ({
      productId: row.product_id || '',
      variantId: row.variant_id || '',
      name: row.name || 'Bookstore item',
      movementType: row.movement_type,
      quantityDelta: Number(row.quantity_delta || 0),
      note: row.note || '',
      countSessionId: sessionId,
      createdAt: row.created_at || '',
    })),
  };
}

export async function startBookstoreCountSession(
  env,
  parishId,
  createdBy = 'parish_dashboard',
  now = new Date().toISOString()
) {
  const open = await d1First(
    env,
    `
    SELECT id, status, items_json, started_at, completed_at, created_by
    FROM commerce_inventory_count_sessions
    WHERE parish_id = ? AND status = 'draft'
  `,
    parishId
  );
  if (open) {
    return json(
      {
        error: 'Finish the open bookstore count before starting another.',
        session: normalizeBookstoreCountSession(open),
      },
      { status: 409 }
    );
  }
  const id = generateSecret('inventory_count');
  await d1Run(
    env,
    `
    INSERT INTO commerce_inventory_count_sessions
      (id, parish_id, status, items_json, started_at, created_by)
    VALUES (?, ?, 'draft', '[]', ?, ?)
  `,
    id,
    parishId,
    now,
    createdBy
  );
  return json(
    { ok: true, session: { id, status: 'draft', startedAt: now, completedAt: '', createdBy, items: [] } },
    { status: 201 }
  );
}

export async function closeBookstoreCountSession(env, parishId, sessionId, body = {}, now = new Date().toISOString()) {
  const session = await d1First(
    env,
    `
    SELECT id, status FROM commerce_inventory_count_sessions WHERE id = ? AND parish_id = ?
  `,
    sessionId,
    parishId
  );
  if (!session) return json({ error: 'Bookstore count session not found.' }, { status: 404 });
  if (session.status !== 'draft') return json({ error: 'This bookstore count is already completed.' }, { status: 409 });

  const submitted = Array.isArray(body.items) ? body.items : [];
  if (!submitted.length) return json({ error: 'Count at least one bookstore item before closing.' }, { status: 400 });
  if (submitted.length > 250)
    return json({ error: 'Close this count in sections of 250 items or fewer.' }, { status: 400 });
  const variantIds = submitted.map((item) => String(item.variantId || '').trim());
  if (variantIds.some((id) => !id) || new Set(variantIds).size !== variantIds.length) {
    return json({ error: 'Each counted bookstore item must be included exactly once.' }, { status: 400 });
  }
  for (const item of submitted) {
    if (!Number.isInteger(Number(item.countedQuantity)) || Number(item.countedQuantity) < 0) {
      return json({ error: 'Every counted quantity must be a non-negative whole number.' }, { status: 400 });
    }
  }

  const placeholders = variantIds.map(() => '?').join(',');
  const variants = await d1All(
    env,
    `
    SELECT v.id AS variant_id, v.product_id, v.sku, v.stock_quantity, p.name
    FROM commerce_product_variants v
    JOIN commerce_products p ON p.id = v.product_id AND p.parish_id = v.parish_id
    WHERE v.parish_id = ? AND v.commerce_module = 'bookstore' AND v.status = 'active'
      AND v.track_inventory = 1 AND p.commerce_module = 'bookstore' AND p.status <> 'archived'
      AND v.id IN (${placeholders})
  `,
    parishId,
    ...variantIds
  );
  if (variants.length !== variantIds.length) {
    return json(
      { error: 'One or more counted bookstore items are unavailable or no longer tracked.' },
      { status: 409 }
    );
  }
  const byVariant = new Map(variants.map((row) => [row.variant_id, row]));
  const items = submitted.map((item) => {
    const variant = byVariant.get(String(item.variantId));
    const expectedQuantity = Number(variant.stock_quantity || 0);
    const countedQuantity = Number(item.countedQuantity);
    return {
      productId: variant.product_id,
      variantId: variant.variant_id,
      name: variant.name || 'Bookstore item',
      sku: variant.sku || '',
      expectedQuantity,
      countedQuantity,
      difference: countedQuantity - expectedQuantity,
      note: String(item.note || '')
        .trim()
        .slice(0, 500),
    };
  });
  for (const item of items) {
    if (item.difference !== 0 && !item.note) {
      return json(
        { error: `Add a note explaining the difference for ${item.name} before closing this count.` },
        { status: 400 }
      );
    }
  }

  const unchangedConditions = items
    .map(
      () => `EXISTS (
    SELECT 1 FROM commerce_product_variants
    WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND track_inventory = 1 AND stock_quantity = ?
  )`
    )
    .join(' AND ');
  const unchangedParams = items.flatMap((item) => [item.variantId, parishId, item.expectedQuantity]);
  const statements = [
    {
      sql: `UPDATE commerce_inventory_count_sessions
          SET status = 'completed', items_json = ?, completed_at = ?
          WHERE id = ? AND parish_id = ? AND status = 'draft' AND ${unchangedConditions}`,
      params: [JSON.stringify(items), now, sessionId, parishId, ...unchangedParams],
    },
  ];
  for (const item of items.filter((item) => item.difference !== 0)) {
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
      params: [
        generateSecret('inventory_movement'),
        parishId,
        item.productId,
        item.difference,
        item.note,
        sessionId,
        now,
        item.variantId,
        parishId,
        item.expectedQuantity,
        sessionId,
        parishId,
        now,
      ],
    });
    statements.push({
      sql: `UPDATE commerce_product_variants
            SET stock_quantity = ?, updated_at = ?
            WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND stock_quantity = ?
              AND EXISTS (
                SELECT 1 FROM commerce_inventory_count_sessions
                WHERE id = ? AND parish_id = ? AND status = 'completed' AND completed_at = ?
              )`,
      params: [item.countedQuantity, now, item.variantId, parishId, item.expectedQuantity, sessionId, parishId, now],
    });
  }
  const results = await d1Batch(env, statements);
  if (changedRows(results?.[0]) !== 1) {
    return json(
      { error: 'Bookstore stock changed during this count. Review the current quantities and try closing again.' },
      { status: 409 }
    );
  }
  return json({ ok: true, session: await getBookstoreCountSession(env, parishId, sessionId) });
}

export async function listBookstoreLowStock(env, parishId) {
  const rows = await d1All(
    env,
    `
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
  `,
    parishId
  );
  return rows.map(normalizeBookstoreProduct);
}

async function findBookstoreCatalogItemByCode(env, parishId, code) {
  if (!code) return null;
  return d1First(
    env,
    `
    SELECT p.id, v.id AS variant_id
    FROM commerce_product_variants v
    JOIN commerce_products p ON p.id = v.product_id
    WHERE p.parish_id = ? AND p.commerce_module = 'bookstore'
      AND (v.sku = ? OR v.barcode = ? OR p.default_sku = ?)
    LIMIT 1
  `,
    parishId,
    code,
    code,
    code
  );
}

export async function promotePaidScannedBooksToCatalog(env, order, now) {
  if (!order?.id || !['scan_and_go', 'shopper_added'].includes(order.source)) return;
  const items = await d1All(
    env,
    `
    SELECT * FROM commerce_order_items
    WHERE order_id = ? AND parish_id = ? AND commerce_module = 'bookstore'
      AND (product_id IS NULL OR product_id = '')
    ORDER BY created_at, id
  `,
    order.id,
    order.parish_id
  );

  let firstCatalogItem = null;
  for (const item of items) {
    const category =
      String(item.item_category || 'other')
        .trim()
        .slice(0, 40) || 'other';
    const generatedCode = `shopper-${category}-${String(item.item_name || 'item')
      .toLowerCase()
      .replace(/&/g, '-and-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)}`;
    const code = String(item.barcode || item.sku || generatedCode)
      .trim()
      .slice(0, 80);
    if (!code) continue;
    let catalogItem = await findBookstoreCatalogItemByCode(env, order.parish_id, code);

    if (!catalogItem) {
      const productId = generateSecret('commerce_product');
      const variantId = generateSecret('commerce_variant');
      try {
        await d1Run(
          env,
          `
          INSERT INTO commerce_products
            (id, parish_id, commerce_module, name, description, item_category, default_sku,
             default_tax_code, fulfillment_type, status, image_url, created_at, updated_at)
          VALUES (?, ?, 'bookstore', ?, ?, ?, ?, ?, ?, 'active', '', ?, ?)
        `,
          productId,
          order.parish_id,
          String(item.item_name || 'Bookstore item').slice(0, 180),
          String(item.item_description || item.item_name || '').slice(0, 600),
          category,
          code,
          item.tax_code || '',
          item.fulfillment_type || 'physical_pickup',
          now,
          now
        );
        await d1Run(
          env,
          `
          INSERT INTO commerce_product_variants
            (id, product_id, parish_id, commerce_module, sku, barcode, variant_name,
             unit_price_cents, cost_basis_cents, tax_code, fulfillment_type, stock_quantity,
             reorder_threshold, track_inventory, status, created_at, updated_at)
          VALUES (?, ?, ?, 'bookstore', ?, ?, '', ?, 0, ?, ?, 0, 0, 0, 'active', ?, ?)
        `,
          variantId,
          productId,
          order.parish_id,
          code,
          code,
          Number(item.unit_price_cents || 0),
          item.tax_code || '',
          item.fulfillment_type || 'physical_pickup',
          now,
          now
        );
        catalogItem = { id: productId, variant_id: variantId };
      } catch (error) {
        // A concurrent webhook may have inserted this ISBN first. Reuse it.
        catalogItem = await findBookstoreCatalogItemByCode(env, order.parish_id, code);
        if (!catalogItem) throw error;
      }
    }

    // A fresh paid sale makes an archived matching ISBN available again.
    await d1Run(
      env,
      "UPDATE commerce_products SET status = 'active', updated_at = ? WHERE id = ? AND parish_id = ?",
      now,
      catalogItem.id,
      order.parish_id
    );
    await d1Run(
      env,
      "UPDATE commerce_product_variants SET status = 'active', updated_at = ? WHERE id = ? AND parish_id = ?",
      now,
      catalogItem.variant_id,
      order.parish_id
    );

    let snapshot = {};
    try {
      snapshot = JSON.parse(item.snapshot_json || '{}');
    } catch {
      snapshot = {};
    }
    snapshot.catalogProductId = catalogItem.id;
    snapshot.catalogVariantId = catalogItem.variant_id;
    snapshot.donorSuggested = true;
    await d1Run(
      env,
      `
      UPDATE commerce_order_items
      SET product_id = ?, variant_id = ?, snapshot_json = ?, updated_at = ?
      WHERE id = ? AND order_id = ?
    `,
      catalogItem.id,
      catalogItem.variant_id,
      JSON.stringify(snapshot).slice(0, 4000),
      now,
      item.id,
      order.id
    );
    if (!firstCatalogItem) firstCatalogItem = catalogItem;
  }

  if (firstCatalogItem) {
    await d1Run(
      env,
      `
      UPDATE commerce_orders SET product_id = ?, variant_id = ?, updated_at = ? WHERE id = ?
    `,
      firstCatalogItem.id,
      firstCatalogItem.variant_id,
      now,
      order.id
    );
  }
}

export async function applyBookstoreInventoryAtCompletion(
  env,
  order,
  now = new Date().toISOString(),
  commerceModule = 'bookstore'
) {
  if (!order?.id || !order?.parish_id || !commerceDatabase(env)) return { applied: false, oversold: false };
  const trackedItems = await d1All(
    env,
    `
    SELECT i.product_id, i.variant_id, MAX(COALESCE(i.sku, v.sku, '')) AS sku,
           SUM(i.quantity) AS quantity
    FROM commerce_order_items i
    JOIN commerce_product_variants v
      ON v.id = i.variant_id AND v.parish_id = i.parish_id AND v.commerce_module = ?
    WHERE i.order_id = ? AND i.parish_id = ? AND i.commerce_module = ?
      AND i.variant_id IS NOT NULL AND i.variant_id <> '' AND v.track_inventory = 1
    GROUP BY i.variant_id
  `,
    commerceModule,
    order.id,
    order.parish_id,
    commerceModule
  );
  if (!trackedItems.length) return { applied: false, oversold: false };

  const marker = `${BOOKSTORE_INVENTORY_MARKER_PREFIX}${generateSecret('claim')}]`;
  const markerLike = `%${marker}%`;
  const statements = [
    {
      sql: `UPDATE commerce_orders
            SET parish_notes = trim(COALESCE(parish_notes, '') || CASE WHEN COALESCE(parish_notes, '') = '' THEN '' ELSE char(10) END || ?),
                updated_at = ?
            WHERE id = ? AND parish_id = ? AND commerce_module = ?
              AND COALESCE(parish_notes, '') NOT LIKE ?`,
      params: [marker, now, order.id, order.parish_id, commerceModule, `%${BOOKSTORE_INVENTORY_MARKER_PREFIX}%`],
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
      params: [
        BOOKSTORE_INVENTORY_ATTENTION,
        now,
        order.id,
        order.parish_id,
        commerceModule,
        markerLike,
        commerceModule,
        commerceModule,
      ],
    },
    ...trackedItems.flatMap((item) => {
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
          params: [
            generateSecret('inventory_movement'),
            order.parish_id,
            commerceModule,
            item.product_id,
            item.variant_id,
            item.sku || null,
            -quantity,
            order.id,
            now,
            order.id,
            order.parish_id,
            item.variant_id,
            order.parish_id,
            commerceModule,
            quantity,
            markerLike,
            order.parish_id,
            commerceModule,
            item.variant_id,
            order.id,
          ],
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
          params: [
            quantity,
            now,
            item.variant_id,
            order.parish_id,
            commerceModule,
            quantity,
            order.id,
            order.parish_id,
            markerLike,
          ],
        },
      ];
    }),
  ];

  const results = await d1Batch(env, statements);
  const applied = changedRows(results?.[0]) === 1;
  const oversold = applied && changedRows(results?.[1]) === 1;
  return { applied, oversold };
}

export async function patchBookstoreProduct(env, parishId, productId, body = {}, now = new Date().toISOString()) {
  const product = await d1First(
    env,
    `SELECT p.id, v.id AS variant_id, v.stock_quantity, v.cost_basis_cents
     FROM commerce_products p
     LEFT JOIN commerce_product_variants v ON v.product_id = p.id AND v.status = 'active'
     WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'bookstore'`,
    productId,
    parishId
  );
  if (!product) return json({ error: 'Bookstore item not found.' }, { status: 404 });

  const item = normalizeBookstoreBody(body);
  const salePriceCents =
    body.salePriceCents === null || body.salePriceCents === '' ? 0 : centsFromBody(body.salePriceCents, 0);
  if (!item.name) return json({ error: 'Item name is required.' }, { status: 422 });
  if (item.priceCents < 1) return json({ error: 'Price must be greater than zero.' }, { status: 422 });
  if (salePriceCents > 0 && salePriceCents >= item.priceCents) {
    return json({ error: 'Sale price must be lower than the regular price.' }, { status: 422 });
  }

  const stockSubmitted = Object.prototype.hasOwnProperty.call(body, 'stockQuantity');
  const costSubmitted = Object.prototype.hasOwnProperty.call(body, 'costBasisCents');
  const oldStock = Number(product.stock_quantity || 0);
  const newStock = stockSubmitted ? item.stockQuantity : oldStock;
  const currentCost = Number(product.cost_basis_cents || 0);
  const newCost = costSubmitted ? item.costBasisCents : currentCost;
  const stockChanged = newStock !== oldStock;
  const stockAdjustmentReason = String(body.stockAdjustmentReason || '')
    .trim()
    .slice(0, 500);
  if (stockChanged && !stockAdjustmentReason) {
    return json({ error: 'Explain the stock difference before saving this adjustment.' }, { status: 422 });
  }

  const statements = [
    {
      sql: `UPDATE commerce_products
            SET name = ?, description = ?, item_category = ?, default_sku = ?, image_url = ?, updated_at = ?
            WHERE id = ? AND parish_id = ?`,
      params: [item.name, item.description, item.category, item.sku || null, item.imageUrl, now, productId, parishId],
    },
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
        params: [
          generateSecret('inventory_movement'),
          parishId,
          productId,
          item.sku || null,
          newStock - oldStock,
          stockAdjustmentReason,
          now,
          product.variant_id,
          parishId,
          oldStock,
        ],
      });
    }
    statements.push({
      sql: `UPDATE commerce_product_variants
            SET sku = ?, unit_price_cents = ?, sale_price_cents = ?, stock_quantity = ?, cost_basis_cents = ?, reorder_threshold = ?, updated_at = ?
            WHERE id = ? AND parish_id = ?${stockChanged ? ' AND stock_quantity = ?' : ''}`,
      params: [
        item.sku || null,
        item.priceCents,
        salePriceCents || null,
        newStock,
        newCost,
        item.reorderThreshold,
        now,
        product.variant_id,
        parishId,
        ...(stockChanged ? [oldStock] : []),
      ],
    });
  } else {
    const variantId = generateSecret('commerce_variant');
    statements.push({
      sql: `INSERT INTO commerce_product_variants
              (id, product_id, parish_id, commerce_module, sku, variant_name, unit_price_cents, sale_price_cents,
               cost_basis_cents, stock_quantity, reorder_threshold, status, created_at, updated_at)
            VALUES (?, ?, ?, 'bookstore', ?, '', ?, ?, ?, ?, ?, 'active', ?, ?)`,
      params: [
        variantId,
        productId,
        parishId,
        item.sku || null,
        item.priceCents,
        salePriceCents || null,
        item.costBasisCents,
        newStock,
        item.reorderThreshold,
        now,
        now,
      ],
    });
    if (stockChanged) {
      statements.push({
        sql: `INSERT INTO commerce_inventory_movements
                (id, parish_id, commerce_module, product_id, variant_id, sku,
                 movement_type, quantity_delta, note, created_at)
              VALUES (?, ?, 'bookstore', ?, ?, ?, 'manual_adjustment', ?, ?, ?)`,
        params: [
          generateSecret('inventory_movement'),
          parishId,
          productId,
          variantId,
          item.sku || null,
          newStock,
          stockAdjustmentReason,
          now,
        ],
      });
    }
  }

  const results = await d1Batch(env, statements);
  if (product.variant_id && stockChanged && changedRows(results?.[results.length - 1]) !== 1) {
    return json({ error: 'Stock changed while this item was open. Reload it and try again.' }, { status: 409 });
  }
  return json({ ok: true });
}

export async function patchBookstoreReorderThreshold(
  env,
  parishId,
  productId,
  body = {},
  now = new Date().toISOString()
) {
  const rawThreshold = body.reorderThreshold;
  const reorderThreshold = Number(rawThreshold);
  if (rawThreshold === null || rawThreshold === '' || !Number.isInteger(reorderThreshold) || reorderThreshold < 0) {
    return json({ error: 'Reorder threshold must be a non-negative whole number.' }, { status: 422 });
  }
  const product = await d1First(
    env,
    `SELECT p.id, v.id AS variant_id
     FROM commerce_products p
     JOIN commerce_product_variants v ON v.product_id = p.id AND v.status = 'active'
     WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'bookstore'
       AND v.parish_id = ? AND v.commerce_module = 'bookstore'`,
    productId,
    parishId,
    parishId
  );
  if (!product) return json({ error: 'Bookstore item not found.' }, { status: 404 });

  const result = await d1Run(
    env,
    `
    UPDATE commerce_product_variants
    SET reorder_threshold = ?, updated_at = ?
    WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND status = 'active'
  `,
    reorderThreshold,
    now,
    product.variant_id,
    parishId
  );
  if (changedRows(result) !== 1) {
    return json({ error: 'Unable to update the reorder threshold.' }, { status: 409 });
  }
  return json({ ok: true, productId, variantId: product.variant_id, reorderThreshold });
}

export async function receiveBookstoreStock(env, parishId, productId, body = {}, now = new Date().toISOString()) {
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return json({ error: 'Receiving quantity must be a positive whole number.' }, { status: 422 });
  }

  const costProvided =
    Object.prototype.hasOwnProperty.call(body, 'unitCostCents') &&
    body.unitCostCents !== null &&
    body.unitCostCents !== '';
  const unitCostCents = Number(body.unitCostCents);
  if (costProvided && (!Number.isInteger(unitCostCents) || unitCostCents < 0)) {
    return json({ error: 'Unit cost must be a non-negative whole number of cents.' }, { status: 422 });
  }
  const reference = String(body.reference || '')
    .trim()
    .slice(0, 500);

  const product = await d1First(
    env,
    `SELECT p.id, v.id AS variant_id, v.sku
     FROM commerce_products p
     JOIN commerce_product_variants v ON v.product_id = p.id AND v.status = 'active'
     WHERE p.id = ? AND p.parish_id = ? AND p.commerce_module = 'bookstore'
       AND v.parish_id = ? AND v.commerce_module = 'bookstore'`,
    productId,
    parishId,
    parishId
  );
  if (!product) return json({ error: 'Bookstore item not found.' }, { status: 404 });

  const statements = [
    {
      sql: `INSERT INTO commerce_inventory_movements
              (id, parish_id, commerce_module, product_id, variant_id, sku,
               movement_type, quantity_delta, unit_cost_cents, note, created_at)
            SELECT ?, ?, 'bookstore', ?, id, sku, 'receiving', ?, ?, ?, ?
            FROM commerce_product_variants
            WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND track_inventory = 1`,
      params: [
        generateSecret('inventory_movement'),
        parishId,
        productId,
        quantity,
        costProvided ? unitCostCents : null,
        reference || null,
        now,
        product.variant_id,
        parishId,
      ],
    },
    {
      sql: `UPDATE commerce_product_variants
            SET stock_quantity = stock_quantity + ?,
                ${costProvided ? 'cost_basis_cents = ?,' : ''}
                updated_at = ?
            WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore' AND track_inventory = 1`,
      params: [quantity, ...(costProvided ? [unitCostCents] : []), now, product.variant_id, parishId],
    },
  ];
  const results = await d1Batch(env, statements);
  if (changedRows(results?.[1]) !== 1) {
    return json({ error: 'Inventory tracking is not enabled for this item.' }, { status: 409 });
  }
  const updated = await d1First(
    env,
    `SELECT stock_quantity, cost_basis_cents FROM commerce_product_variants
     WHERE id = ? AND parish_id = ? AND commerce_module = 'bookstore'`,
    product.variant_id,
    parishId
  );
  return json({
    ok: true,
    stockQuantity: Number(updated?.stock_quantity || 0),
    costBasisCents: Number(updated?.cost_basis_cents || 0),
  });
}
