import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { normalizeBookstoreCartItems } from "../src/handlers/donor.js";
import { completeCommerceOrderFromStripe } from "../src/handlers/parish-commerce.js";

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
    track_inventory INTEGER, status TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_orders (
    id TEXT PRIMARY KEY, commerce_module TEXT, source TEXT, parish_id TEXT,
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

let batchQueue = Promise.resolve();
const db = {
  prepare: statement,
  batch(statements) {
    const operation = batchQueue.then(async () => {
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
    });
    batchQueue = operation.catch(() => {});
    return operation;
  }
};
const env = { AGAPAY_DB: db };
const now = "2026-07-31T15:10:00.000Z";

sqlite.prepare(`
  INSERT INTO commerce_products
    (id, parish_id, commerce_module, name, description, item_category, default_sku,
     default_tax_code, fulfillment_type, status, image_url, created_at, updated_at)
  VALUES ('product_last', 'parish_1', 'bookstore', 'The Orthodox Way', '', 'book',
          'ISBN-LAST', '', 'physical_pickup', 'active', '', ?, ?)
`).run(now, now);
sqlite.prepare(`
  INSERT INTO commerce_product_variants
    (id, product_id, parish_id, commerce_module, sku, barcode, variant_name,
     unit_price_cents, tax_code, fulfillment_type, stock_quantity, track_inventory,
     status, created_at, updated_at)
  VALUES ('variant_last', 'product_last', 'parish_1', 'bookstore', 'ISBN-LAST',
          'ISBN-LAST', '', 2495, '', 'physical_pickup', 0, 1, 'active', ?, ?)
`).run(now, now);

await assert.rejects(
  () => normalizeBookstoreCartItems(env, "parish_1", [{ productId: "product_last", variantId: "variant_last", quantity: 1 }]),
  /The Orthodox Way is currently out of stock\./,
  "an inventory-tracked item at exactly zero stock must be rejected"
);

sqlite.prepare("UPDATE commerce_product_variants SET stock_quantity = 1 WHERE id = 'variant_last'").run();

sqlite.prepare("UPDATE commerce_product_variants SET sale_price_cents = 1795 WHERE id = 'variant_last'").run();
const saleCart = await normalizeBookstoreCartItems(env, "parish_1", [{ productId: "product_last", variantId: "variant_last", quantity: 1 }]);
assert.equal(saleCart[0].unitPriceCents, 1795, "checkout must use the server-side sale price");
assert.equal(saleCart[0].snapshot.regularPriceCents, 2495);
assert.equal(saleCart[0].snapshot.onSale, true);

function addPendingOrder(id, sessionId) {
  sqlite.prepare(`
    INSERT INTO commerce_orders
      (id, commerce_module, source, parish_id, product_id, variant_id, subtotal_cents,
       tax_cents, total_charged_cents, stripe_fee_cents, agapay_fee_cents, parish_net_cents,
       cover_fees, payment_status, status, checkout_session_id, fulfillment_status, parish_notes, updated_at)
    VALUES (?, 'bookstore', 'catalog', 'parish_1', 'product_last', 'variant_last', 2495,
            0, 2495, 0, 0, 2495, 0, 'pending', 'checkout_created', ?, 'pending', '', ?)
  `).run(id, sessionId, now);
  sqlite.prepare(`
    INSERT INTO commerce_order_items
      (id, order_id, parish_id, commerce_module, product_id, variant_id, sku, barcode,
       item_category, item_name, item_description, quantity, unit_price_cents, tax_code,
       snapshot_json, fulfillment_type, created_at, updated_at)
    VALUES (?, ?, 'parish_1', 'bookstore', 'product_last', 'variant_last', 'ISBN-LAST',
            'ISBN-LAST', 'book', 'The Orthodox Way', 'The Orthodox Way', 1, 2495, '',
            '{}', 'physical_pickup', ?, ?)
  `).run(`item_${id}`, id, now, now);
}

addPendingOrder("order_a", "cs_a");
addPendingOrder("order_b", "cs_b");

await Promise.all([
  completeCommerceOrderFromStripe(env, {
    id: "cs_a", amount_total: 2495, payment_status: "paid",
    metadata: { order_id: "order_a", commerce_module: "bookstore" }
  }, "session"),
  completeCommerceOrderFromStripe(env, {
    id: "cs_b", amount_total: 2495, payment_status: "paid",
    metadata: { order_id: "order_b", commerce_module: "bookstore" }
  }, "session")
]);

assert.equal(sqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id = 'variant_last'").get().stock_quantity, 0,
  "the last unit should be decremented exactly once");

const completed = sqlite.prepare(`
  SELECT id, payment_status, fulfillment_status, parish_notes
  FROM commerce_orders ORDER BY id
`).all();
assert.ok(completed.every(order => order.payment_status === "paid"), "both captured payments remain completed");
assert.equal(completed.filter(order => String(order.parish_notes || "").includes("Inventory attention:")).length, 1,
  "exactly one raced order should be flagged as oversold");
assert.equal(completed.filter(order => order.fulfillment_status === "pending").length, 1,
  "the oversold order should remain pending for treasurer attention");
assert.equal(completed.filter(order => order.fulfillment_status === "ready").length, 1,
  "the order that received the last unit should be ready normally");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM commerce_inventory_movements WHERE movement_type = 'sale'").get().count, 1,
  "the successful last-unit decrement should write exactly one sale movement");

await completeCommerceOrderFromStripe(env, {
  id: "cs_a", amount_total: 2495, payment_status: "paid",
  metadata: { order_id: "order_a", commerce_module: "bookstore" }
}, "session");
assert.equal(sqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id = 'variant_last'").get().stock_quantity, 0,
  "a replayed completion must not decrement stock again");

const parishApp = await import("node:fs").then(fs => fs.readFileSync(new URL("../public/parish/app.js", import.meta.url), "utf8"));
assert.match(parishApp, /Oversold · needs review/);
assert.match(parishApp, /Paid past available stock/);

console.log("PASS - bookstore Phase 1 rejects zero stock, atomically decrements the last unit, and flags one raced paid order");
