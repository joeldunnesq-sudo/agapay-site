import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  closeBookstoreCountSession,
  getBookstoreCountSession,
  startBookstoreCountSession
} from "../src/handlers/parish-commerce.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE commerce_products (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, name TEXT, status TEXT
  );
  CREATE TABLE commerce_product_variants (
    id TEXT PRIMARY KEY, product_id TEXT, parish_id TEXT, commerce_module TEXT,
    sku TEXT, stock_quantity INTEGER, track_inventory INTEGER, status TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_inventory_count_sessions (
    id TEXT PRIMARY KEY, parish_id TEXT, status TEXT, items_json TEXT,
    started_at TEXT, completed_at TEXT, created_by TEXT
  );
  CREATE TABLE commerce_inventory_movements (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, product_id TEXT,
    variant_id TEXT, sku TEXT, movement_type TEXT, quantity_delta INTEGER,
    unit_cost_cents INTEGER, order_id TEXT, note TEXT, created_by TEXT,
    created_at TEXT, count_session_id TEXT
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
const now = "2026-07-31T21:00:00.000Z";

sqlite.prepare("INSERT INTO commerce_products VALUES ('book_1','parish_1','bookstore','Orthodox Study Bible','active')").run();
sqlite.prepare("INSERT INTO commerce_products VALUES ('book_2','parish_1','bookstore','Jordanville Prayer Book','active')").run();
sqlite.prepare("INSERT INTO commerce_product_variants VALUES ('variant_1','book_1','parish_1','bookstore','ISBN-1',5,1,'active',?)").run(now);
sqlite.prepare("INSERT INTO commerce_product_variants VALUES ('variant_2','book_2','parish_1','bookstore','ISBN-2',3,1,'active',?)").run(now);

const started = await startBookstoreCountSession(env, "parish_1", "parish_dashboard", now);
assert.equal(started.status, 201);
const startedBody = await started.json();
const sessionId = startedBody.session.id;
assert.equal(startedBody.session.status, "draft");

const unexplained = await closeBookstoreCountSession(env, "parish_1", sessionId, {
  items: [
    { productId: "book_1", variantId: "variant_1", countedQuantity: 4, note: "" },
    { productId: "book_2", variantId: "variant_2", countedQuantity: 3, note: "" }
  ]
}, now);
assert.equal(unexplained.status, 400, "an unexplained per-item difference must reject the entire close");
assert.deepEqual(await unexplained.json(), {
  error: "Add a note explaining the difference for Orthodox Study Bible before closing this count."
});
assert.equal(sqlite.prepare("SELECT status FROM commerce_inventory_count_sessions WHERE id=?").get(sessionId).status, "draft");
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM commerce_inventory_movements").get().count, 0);
assert.equal(sqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id='variant_1'").get().stock_quantity, 5);

const completedAt = "2026-07-31T21:10:00.000Z";
const closed = await closeBookstoreCountSession(env, "parish_1", sessionId, {
  items: [
    { productId: "book_1", variantId: "variant_1", countedQuantity: 4, note: "One damaged copy removed from the shelf" },
    { productId: "book_2", variantId: "variant_2", countedQuantity: 3, note: "" }
  ]
}, completedAt);
assert.equal(closed.status, 200);
const closedBody = await closed.json();
assert.equal(closedBody.session.status, "completed");
assert.equal(closedBody.session.items.length, 2, "the closed snapshot must retain matching and differing items");

const movements = sqlite.prepare("SELECT * FROM commerce_inventory_movements ORDER BY rowid").all();
assert.equal(movements.length, 1, "exactly one movement should be written per differing item");
assert.equal(movements[0].movement_type, "physical_count");
assert.equal(movements[0].quantity_delta, -1);
assert.equal(movements[0].count_session_id, sessionId);
assert.equal(movements[0].note, "One damaged copy removed from the shelf");
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM commerce_inventory_movements WHERE variant_id='variant_2'").get().count, 0,
  "a matching count must not produce a zero-delta movement");
assert.equal(sqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id='variant_1'").get().stock_quantity, 4);
assert.equal(sqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id='variant_2'").get().stock_quantity, 3);

const viewed = await getBookstoreCountSession(env, "parish_1", sessionId);
assert.equal(viewed.items.length, 2);
assert.deepEqual(viewed.items.map(item => ({ name: item.name, expected: item.expectedQuantity, counted: item.countedQuantity, note: item.note })), [
  { name: "Orthodox Study Bible", expected: 5, counted: 4, note: "One damaged copy removed from the shelf" },
  { name: "Jordanville Prayer Book", expected: 3, counted: 3, note: "" }
]);
assert.equal(viewed.movements.length, 1);
assert.equal(viewed.movements[0].movementType, "physical_count");
assert.equal(viewed.movements[0].countSessionId, sessionId);

const migration = await readFile(new URL("../migrations/0063_bookstore_physical_counts.sql", import.meta.url), "utf8");
const handler = await readFile(new URL("../src/handlers/parish-commerce.js", import.meta.url), "utf8");
const app = await readParishDashboardSource();
const dashboard = await readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8");
assert.match(migration, /CREATE TABLE IF NOT EXISTS commerce_inventory_count_sessions/);
assert.match(migration, /ADD COLUMN count_session_id/);
assert.match(handler, /Add a note explaining the difference for \$\{item\.name\} before closing this count\./,
  "the close handler must use the reconciliation-style required-note register per item");
assert.match(app, /id="bookstoreCountError"/,
  "the count UI must surface the server's required-note rejection inside the count session");
assert.match(app, /movement\.movementType === 'physical_count'\s+\? 'Physical count'/);
assert.match(app, /openBookstoreClosedCount/);
assert.match(dashboard, /id="bookstoreCountSessions"/,
  "closed count sessions should be viewable beneath the current bookstore inventory list");

console.log("PASS - bookstore Phase 5 requires per-item discrepancy notes, closes atomically, skips matching movements, and preserves closed count detail");
