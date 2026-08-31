import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  listBookstoreLowStock,
  patchBookstoreReorderThreshold
} from "../src/handlers/parish-commerce.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE commerce_products (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, name TEXT,
    description TEXT, item_category TEXT, default_sku TEXT, status TEXT,
    image_url TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_product_variants (
    id TEXT PRIMARY KEY, product_id TEXT, parish_id TEXT, commerce_module TEXT,
    sku TEXT, unit_price_cents INTEGER, cost_basis_cents INTEGER,
    stock_quantity INTEGER, reorder_threshold INTEGER, track_inventory INTEGER,
    status TEXT, updated_at TEXT
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

const db = { prepare: statement };
const env = { AGAPAY_DB: db };
const now = "2026-07-31T20:00:00.000Z";

function addProduct(id, name, stock, threshold, trackInventory = 1) {
  sqlite.prepare(`INSERT INTO commerce_products
    VALUES (?, 'parish_1', 'bookstore', ?, '', 'book', ?, 'active', '', ?)`)
    .run(id, name, `${id}-sku`, now);
  sqlite.prepare(`INSERT INTO commerce_product_variants
    VALUES (?, ?, 'parish_1', 'bookstore', ?, 2000, 1000, ?, ?, ?, 'active', ?)`)
    .run(`${id}-variant`, id, `${id}-sku`, stock, threshold, trackInventory, now);
}

addProduct("urgent", "Urgent Psalter", 1, 7);      // six below threshold
addProduct("boundary", "Boundary Prayer Book", 4, 4); // at threshold
addProduct("zero", "Zero Threshold Book", 0, 0);  // disabled alert
addProduct("above", "Well Stocked Book", 8, 5);   // above threshold
addProduct("untracked", "Untracked Book", 0, 5, 0);
addProduct("other-parish", "Other Parish Book", 0, 9);
sqlite.prepare("UPDATE commerce_products SET parish_id = 'parish_2' WHERE id = 'other-parish'").run();
sqlite.prepare("UPDATE commerce_product_variants SET parish_id = 'parish_2' WHERE product_id = 'other-parish'").run();

let lowStock = await listBookstoreLowStock(env, "parish_1");
assert.deepEqual(lowStock.map(item => item.id), ["urgent", "boundary"],
  "low stock should include at/below non-zero thresholds, exclude zero/above/untracked items, and order the largest shortfall first");
assert.equal(lowStock[0].stockQuantity, 1);
assert.equal(lowStock[0].reorderThreshold, 7);

const thresholdOnly = await patchBookstoreReorderThreshold(env, "parish_1", "urgent", {
  reorderThreshold: 0
}, now);
assert.equal(thresholdOnly.status, 200);
assert.deepEqual(await thresholdOnly.json(), {
  ok: true,
  productId: "urgent",
  variantId: "urgent-variant",
  reorderThreshold: 0
});
assert.equal(sqlite.prepare("SELECT reorder_threshold FROM commerce_product_variants WHERE id = 'urgent-variant'").get().reorder_threshold, 0,
  "the lightweight save should update only the threshold without requiring product name or price");

lowStock = await listBookstoreLowStock(env, "parish_1");
assert.deepEqual(lowStock.map(item => item.id), ["boundary"],
  "setting a threshold to zero should immediately remove the item from alerts");

for (const invalid of [-1, 1.5, "not-a-number", null, ""]) {
  const rejected = await patchBookstoreReorderThreshold(env, "parish_1", "boundary", { reorderThreshold: invalid }, now);
  assert.equal(rejected.status, 422);
}

const app = await readParishDashboardSource();
const dashboard = await readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8");
assert.match(app, /products\/low-stock/);
assert.match(app, /setBookstoreLowStockFilter/);
assert.match(app, /saveBookstoreReorderThreshold/);
assert.match(app, /JSON\.stringify\(\{ reorderThreshold \}\)/,
  "inline threshold edits should submit only the threshold field");
assert.match(app, /item\$\{count === 1 \? '' : 's'\} low on stock/);
assert.match(dashboard, /id="bookstoreLowStockNavBadge"/,
  "the main Commerce navigation should contain the low-stock alert text");
assert.doesNotMatch(app, /sendLowStock|emailLowStock|smsLowStock/,
  "Phase 4 must not introduce outbound low-stock notifications");

console.log("PASS - bookstore Phase 4 filters tracked low stock, excludes zero thresholds, orders urgency, and supports inline threshold-only saves");
