import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { receiveBookstoreStock } from "../src/handlers/parish-commerce.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE commerce_products (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, name TEXT, status TEXT
  );
  CREATE TABLE commerce_product_variants (
    id TEXT PRIMARY KEY, product_id TEXT, parish_id TEXT, commerce_module TEXT,
    sku TEXT, stock_quantity INTEGER, cost_basis_cents INTEGER, track_inventory INTEGER,
    status TEXT, updated_at TEXT
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
const now = "2026-07-31T17:00:00.000Z";

sqlite.prepare("INSERT INTO commerce_products VALUES ('product_1', 'parish_1', 'bookstore', 'The Orthodox Way', 'active')").run();
sqlite.prepare(`INSERT INTO commerce_product_variants
  VALUES ('variant_1', 'product_1', 'parish_1', 'bookstore', 'ISBN-1', 5, 1200, 1, 'active', ?)`
).run(now);

const withoutCost = await receiveBookstoreStock(env, "parish_1", "product_1", {
  quantity: 5,
  reference: "Nativity shipment PO-104"
}, now);
assert.equal(withoutCost.status, 200);
assert.deepEqual(await withoutCost.json(), { ok: true, stockQuantity: 10, costBasisCents: 1200 });
let movements = sqlite.prepare("SELECT * FROM commerce_inventory_movements WHERE movement_type = 'receiving' ORDER BY rowid").all();
assert.equal(movements.length, 1, "receiving should write exactly one movement");
assert.equal(movements[0].quantity_delta, 5, "the receiving delta should be positive and exact");
assert.equal(movements[0].note, "Nativity shipment PO-104");
assert.equal(movements[0].unit_cost_cents, null);
assert.equal(sqlite.prepare("SELECT cost_basis_cents FROM commerce_product_variants WHERE id = 'variant_1'").get().cost_basis_cents, 1200,
  "omitting unit cost should preserve the existing cost basis");

const withCost = await receiveBookstoreStock(env, "parish_1", "product_1", {
  quantity: 2,
  unitCostCents: 1350,
  reference: "Latest supplier invoice"
}, now);
assert.equal(withCost.status, 200);
assert.deepEqual(await withCost.json(), { ok: true, stockQuantity: 12, costBasisCents: 1350 });
movements = sqlite.prepare("SELECT * FROM commerce_inventory_movements WHERE movement_type = 'receiving' ORDER BY rowid").all();
assert.equal(movements.length, 2);
assert.equal(movements[1].quantity_delta, 2);
assert.equal(movements[1].unit_cost_cents, 1350);

for (const quantity of [0, -1, 1.5]) {
  const rejected = await receiveBookstoreStock(env, "parish_1", "product_1", { quantity }, now);
  assert.equal(rejected.status, 422, `quantity ${quantity} should be rejected before any write`);
}
assert.equal(sqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id = 'variant_1'").get().stock_quantity, 12);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM commerce_inventory_movements").get().count, 2);

const app = await readParishDashboardSource();
assert.match(app, /Receive stock/);
assert.match(app, /\/receive/);
assert.match(app, /movement\.movementType === 'receiving'/);
assert.match(app, /Oversold · needs review/);
assert.match(app, /Boolean\(o\.inventoryAttention\)/,
  "the badge should use the server flag derived from the canonical backend oversold marker");

console.log("PASS - bookstore Phase 3 atomically receives stock, preserves or updates latest cost, and exposes receiving and oversold UI");
