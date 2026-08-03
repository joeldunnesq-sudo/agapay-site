import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { completeCommerceOrderFromStripe, patchBookstoreProduct } from "../src/handlers/parish-commerce.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE commerce_products (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, name TEXT,
    description TEXT, item_category TEXT, default_sku TEXT, default_tax_code TEXT,
    fulfillment_type TEXT, status TEXT, image_url TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_product_variants (
    id TEXT PRIMARY KEY, product_id TEXT, parish_id TEXT, commerce_module TEXT,
    sku TEXT, barcode TEXT, variant_name TEXT, unit_price_cents INTEGER, sale_price_cents INTEGER,
    cost_basis_cents INTEGER DEFAULT 0, tax_code TEXT, fulfillment_type TEXT,
    stock_quantity INTEGER, reorder_threshold INTEGER DEFAULT 0,
    track_inventory INTEGER DEFAULT 1, status TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_orders (
    id TEXT PRIMARY KEY, order_number TEXT, commerce_module TEXT, source TEXT, parish_id TEXT,
    product_id TEXT, variant_id TEXT, subtotal_cents INTEGER, tax_cents INTEGER,
    total_charged_cents INTEGER, stripe_fee_cents INTEGER, agapay_fee_cents INTEGER,
    parish_net_cents INTEGER, cover_fees INTEGER, payment_status TEXT, status TEXT,
    checkout_session_id TEXT, stripe_payment_intent_id TEXT, stripe_charge_id TEXT,
    stripe_customer_id TEXT, fulfillment_status TEXT, parish_notes TEXT,
    completed_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_order_items (
    id TEXT PRIMARY KEY, order_id TEXT, parish_id TEXT, commerce_module TEXT,
    product_id TEXT, variant_id TEXT, sku TEXT, barcode TEXT, item_category TEXT,
    item_name TEXT, item_description TEXT, quantity INTEGER, unit_price_cents INTEGER,
    tax_code TEXT, snapshot_json TEXT, fulfillment_type TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_inventory_movements (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, product_id TEXT,
    variant_id TEXT, sku TEXT, movement_type TEXT, quantity_delta INTEGER,
    unit_cost_cents INTEGER, order_id TEXT, note TEXT, created_by TEXT, created_at TEXT
  );
`);

function statement(sql) {
  return {
    sql,
    params: [],
    bind(...params) { this.params = params; return this; },
    async first() { return sqlite.prepare(this.sql).get(...this.params) || null; },
    async all() { return { results: sqlite.prepare(this.sql).all(...this.params) }; },
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.params);
      return { meta: { changes: Number(result.changes || 0) } };
    }
  };
}

const db = {
  prepare: statement,
  async batch(statements) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const item of statements) results.push(await item.run());
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
};
const env = { AGAPAY_DB: db };
const now = "2026-07-31T16:00:00.000Z";

sqlite.prepare(`INSERT INTO commerce_products
  (id, parish_id, commerce_module, name, description, item_category, default_sku,
   default_tax_code, fulfillment_type, status, image_url, created_at, updated_at)
  VALUES ('product_1', 'parish_1', 'bookstore', 'The Orthodox Way', 'Original', 'book',
          'ISBN-1', '', 'physical_pickup', 'active', '', ?, ?)`).run(now, now);
sqlite.prepare(`INSERT INTO commerce_product_variants
  (id, product_id, parish_id, commerce_module, sku, variant_name, unit_price_cents,
   cost_basis_cents, stock_quantity, reorder_threshold, track_inventory, status, created_at, updated_at)
  VALUES ('variant_1', 'product_1', 'parish_1', 'bookstore', 'ISBN-1', '', 2495,
          1200, 5, 1, 1, 'active', ?, ?)`).run(now, now);
sqlite.prepare(`INSERT INTO commerce_orders
  (id, order_number, commerce_module, source, parish_id, product_id, variant_id, subtotal_cents,
   tax_cents, total_charged_cents, stripe_fee_cents, agapay_fee_cents, parish_net_cents,
   cover_fees, payment_status, status, checkout_session_id, fulfillment_status, parish_notes, updated_at)
  VALUES ('order_1', 'BK-2026-000145', 'bookstore', 'catalog', 'parish_1', 'product_1', 'variant_1', 4990,
          0, 4990, 0, 0, 4990, 0, 'pending', 'checkout_created', 'cs_1', 'pending', '', ?)`).run(now);
sqlite.prepare(`INSERT INTO commerce_order_items
  (id, order_id, parish_id, commerce_module, product_id, variant_id, sku, item_category,
   item_name, item_description, quantity, unit_price_cents, tax_code, snapshot_json,
   fulfillment_type, created_at, updated_at)
  VALUES ('item_1', 'order_1', 'parish_1', 'bookstore', 'product_1', 'variant_1', 'ISBN-1', 'book',
          'The Orthodox Way', 'The Orthodox Way', 2, 2495, '', '{}', 'physical_pickup', ?, ?)`).run(now, now);

await completeCommerceOrderFromStripe(env, {
  id: "cs_1", amount_total: 4990, payment_status: "paid",
  metadata: { order_id: "order_1", commerce_module: "bookstore" }
}, "session");

const saleMovements = sqlite.prepare("SELECT * FROM commerce_inventory_movements WHERE movement_type = 'sale'").all();
assert.equal(saleMovements.length, 1, "a completed sale should produce exactly one sale movement");
assert.equal(saleMovements[0].quantity_delta, -2, "the sale delta should match the decremented quantity");
assert.equal(saleMovements[0].order_id, "order_1", "the sale movement should retain its order id");
assert.equal(sqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id = 'variant_1'").get().stock_quantity, 3);

const sharedBody = {
  name: "The Orthodox Way", description: "Original", category: "book", sku: "ISBN-1",
  imageUrl: "", priceCents: 2495, costBasisCents: 1200, reorderThreshold: 1
};
const missingReason = await patchBookstoreProduct(env, "parish_1", "product_1", { ...sharedBody, stockQuantity: 4 }, now);
assert.equal(missingReason.status, 422, "changing stock without a reason should be rejected");
assert.match((await missingReason.json()).error, /Explain the stock difference/i);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM commerce_inventory_movements WHERE movement_type = 'manual_adjustment'").get().count, 0);

const adjusted = await patchBookstoreProduct(env, "parish_1", "product_1", {
  ...sharedBody, stockQuantity: 7, stockAdjustmentReason: "Received new shipment, counted by hand"
}, now);
assert.equal(adjusted.status, 200);
const adjustments = sqlite.prepare("SELECT * FROM commerce_inventory_movements WHERE movement_type = 'manual_adjustment'").all();
assert.equal(adjustments.length, 1, "a reasoned stock edit should produce exactly one manual adjustment");
assert.equal(adjustments[0].quantity_delta, 4);
assert.equal(adjustments[0].note, "Received new shipment, counted by hand");

const metadataOnly = await patchBookstoreProduct(env, "parish_1", "product_1", {
  ...sharedBody, description: "Updated description only"
}, now);
assert.equal(metadataOnly.status, 200);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM commerce_inventory_movements WHERE movement_type = 'manual_adjustment'").get().count, 1,
  "an edit that omits stock should preserve it and write no movement");
assert.equal(sqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id = 'variant_1'").get().stock_quantity, 7);

const invalidSale = await patchBookstoreProduct(env, "parish_1", "product_1", {
  ...sharedBody, salePriceCents: 2495
}, now);
assert.equal(invalidSale.status, 422, "sale price must be lower than the regular price");

const saleUpdate = await patchBookstoreProduct(env, "parish_1", "product_1", {
  ...sharedBody, salePriceCents: 1795
}, now);
assert.equal(saleUpdate.status, 200);
assert.equal(sqlite.prepare("SELECT sale_price_cents FROM commerce_product_variants WHERE id = 'variant_1'").get().sale_price_cents, 1795);

const app = await readFile(new URL("../public/parish/app.js", import.meta.url), "utf8");
assert.match(app, /Inventory audit trail/);
assert.match(app, /Explain the stock difference/);
assert.match(app, /\/movements/);
assert.match(app, /Put on sale/);
assert.match(app, /Sale price must be greater than zero and lower than the regular price/);

const handler = await readFile(new URL("../src/handlers/parish-commerce.js", import.meta.url), "utf8");
const refundBody = handler.slice(handler.indexOf("export async function refundCommerceOrderFromStripe"), handler.indexOf("export async function disputeCommerceOrderFromStripe"));
assert.doesNotMatch(refundBody, /commerce_inventory_movements|stock_quantity/, "refunds must not guess whether physical stock returned");

console.log("PASS - bookstore Phase 2 logs atomic sale and reasoned adjustment movements while preserving stock on metadata edits");
