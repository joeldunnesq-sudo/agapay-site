import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { completeCommerceOrderFromStripe } from "../src/handlers/parish-commerce.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE commerce_orders (
    id TEXT PRIMARY KEY, commerce_module TEXT, source TEXT, parish_id TEXT,
    product_id TEXT, variant_id TEXT, subtotal_cents INTEGER, tax_cents INTEGER,
    total_charged_cents INTEGER, stripe_fee_cents INTEGER, agapay_fee_cents INTEGER,
    parish_net_cents INTEGER, cover_fees INTEGER, payment_status TEXT, status TEXT,
    checkout_session_id TEXT, stripe_payment_intent_id TEXT, stripe_charge_id TEXT,
    stripe_customer_id TEXT, fulfillment_status TEXT, completed_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_order_items (
    id TEXT PRIMARY KEY, order_id TEXT, parish_id TEXT, commerce_module TEXT,
    product_id TEXT, variant_id TEXT, sku TEXT, barcode TEXT, item_category TEXT,
    item_name TEXT, item_description TEXT, unit_price_cents INTEGER, tax_code TEXT,
    snapshot_json TEXT, fulfillment_type TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_products (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, name TEXT,
    description TEXT, item_category TEXT, default_sku TEXT, default_tax_code TEXT,
    fulfillment_type TEXT, status TEXT, image_url TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE UNIQUE INDEX products_sku ON commerce_products(parish_id, default_sku)
    WHERE default_sku IS NOT NULL AND default_sku <> '';
  CREATE TABLE commerce_product_variants (
    id TEXT PRIMARY KEY, product_id TEXT, parish_id TEXT, commerce_module TEXT,
    sku TEXT, barcode TEXT, variant_name TEXT, unit_price_cents INTEGER,
    cost_basis_cents INTEGER, tax_code TEXT, fulfillment_type TEXT,
    stock_quantity INTEGER, reorder_threshold INTEGER, track_inventory INTEGER,
    status TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE UNIQUE INDEX variants_sku ON commerce_product_variants(parish_id, sku)
    WHERE sku IS NOT NULL AND sku <> '';
`);

const db = {
  prepare(sql) {
    return {
      params: [],
      bind(...params) { this.params = params; return this; },
      async first() { return sqlite.prepare(sql).get(...this.params) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...this.params) }; },
      async run() { return sqlite.prepare(sql).run(...this.params); }
    };
  }
};
const env = { AGAPAY_DB: db };

function addScannedOrder(id, sessionId, barcode, title) {
  sqlite.prepare(`
    INSERT INTO commerce_orders
      (id, commerce_module, source, parish_id, subtotal_cents, tax_cents,
       total_charged_cents, stripe_fee_cents, agapay_fee_cents, parish_net_cents,
       cover_fees, payment_status, status, checkout_session_id, fulfillment_status, updated_at)
    VALUES (?, 'bookstore', 'scan_and_go', 'parish_1', 2495, 0, 2495, 0, 0, 2495,
            0, 'pending', 'checkout_created', ?, 'pending', '2026-07-31T12:00:00.000Z')
  `).run(id, sessionId);
  sqlite.prepare(`
    INSERT INTO commerce_order_items
      (id, order_id, parish_id, commerce_module, product_id, variant_id, sku, barcode,
       item_category, item_name, item_description, unit_price_cents, tax_code,
       snapshot_json, fulfillment_type, created_at, updated_at)
    VALUES (?, ?, 'parish_1', 'bookstore', '', '', ?, ?, 'book', ?, ?, 2495, '',
            '{"specifics":{"isbn":"9780884651751"}}', 'physical_pickup',
            '2026-07-31T12:00:00.000Z', '2026-07-31T12:00:00.000Z')
  `).run(`item_${id}`, id, barcode, barcode, title, title);
}

async function complete(id, sessionId) {
  return completeCommerceOrderFromStripe(env, {
    id: sessionId,
    amount_total: 2495,
    payment_status: "paid",
    metadata: { order_id: id, commerce_module: "bookstore" }
  }, "session");
}

const isbn = "9780884651751";
addScannedOrder("order_1", "cs_1", isbn, "The Orthodox Way");
await complete("order_1", "cs_1");

let product = sqlite.prepare(`
  SELECT p.*, v.id AS variant_id, v.barcode, v.unit_price_cents, v.track_inventory,
         v.status AS variant_status
  FROM commerce_products p JOIN commerce_product_variants v ON v.product_id = p.id
  WHERE p.parish_id = 'parish_1' AND p.default_sku = ?
`).get(isbn);
assert.ok(product, "paid scanned book should create a shared catalog product");
assert.equal(product.status, "active");
assert.equal(product.variant_status, "active");
assert.equal(product.barcode, isbn);
assert.equal(product.unit_price_cents, 2495);
assert.equal(product.track_inventory, 0, "donor-added catalog books remain selectable without a false zero-stock limit");

let orderItem = sqlite.prepare("SELECT product_id, variant_id, snapshot_json FROM commerce_order_items WHERE order_id = 'order_1'").get();
assert.equal(orderItem.product_id, product.id);
assert.equal(orderItem.variant_id, product.variant_id);
assert.equal(JSON.parse(orderItem.snapshot_json).catalogProductId, product.id);

await complete("order_1", "cs_1");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM commerce_products").get().count, 1, "webhook replay must be idempotent");

sqlite.prepare("UPDATE commerce_products SET status = 'archived' WHERE id = ?").run(product.id);
sqlite.prepare("UPDATE commerce_product_variants SET status = 'archived' WHERE id = ?").run(product.variant_id);
addScannedOrder("order_2", "cs_2", isbn, "The Orthodox Way");
await complete("order_2", "cs_2");

product = sqlite.prepare(`
  SELECT p.status, v.status AS variant_status
  FROM commerce_products p JOIN commerce_product_variants v ON v.product_id = p.id
  WHERE p.default_sku = ?
`).get(isbn);
assert.deepEqual({ ...product }, { status: "active", variant_status: "active" }, "a new paid scan should restore a matching archived book to the selectable catalog");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM commerce_products").get().count, 1, "the same ISBN must not create a duplicate product");

console.log("PASS - paid barcode scans populate the shared parish bookstore catalog idempotently");
