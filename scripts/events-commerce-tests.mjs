import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  createMinistryCommerceItem,
  listMinistryCommerceItems,
  loadDonorEventProducts,
  patchMinistryCommerceItem
} from "../src/handlers/parish-events.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE commerce_products (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, name TEXT,
    description TEXT, item_category TEXT, default_tax_code TEXT, fulfillment_type TEXT, status TEXT,
    image_url TEXT, event_date TEXT, event_location TEXT, event_details TEXT,
    sales_close_at TEXT, ministry_id TEXT, created_by_person_id TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_product_variants (
    id TEXT PRIMARY KEY, product_id TEXT, parish_id TEXT, commerce_module TEXT,
    variant_name TEXT, unit_price_cents INTEGER, tax_code TEXT, fulfillment_type TEXT,
    stock_quantity INTEGER, track_inventory INTEGER, max_quantity_per_order INTEGER,
    status TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_order_items (
    id TEXT PRIMARY KEY, order_id TEXT, parish_id TEXT, commerce_module TEXT, variant_id TEXT, quantity INTEGER
  );
  CREATE TABLE commerce_orders (
    id TEXT PRIMARY KEY, payment_status TEXT, status TEXT
  );
  CREATE TABLE registrations (
    reference TEXT PRIMARY KEY, parish_id TEXT, data TEXT, updated_at TEXT, received_at TEXT
  );
`);
sqlite.exec(`
  INSERT INTO registrations (reference, parish_id, data, updated_at, received_at)
  VALUES ('reg_parish_1', 'parish_1', '${JSON.stringify({ subscriptionTier: "parish", bookstoreEnabled: true }).replace(/'/g, "''")}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
`);

function statement(sql) {
  return {
    sql, params: [],
    bind(...params) { this.params = params; return this; },
    async first() { return sqlite.prepare(this.sql).get(...this.params) || null; },
    async all() { return { results: sqlite.prepare(this.sql).all(...this.params) }; },
    async run() { const r = sqlite.prepare(this.sql).run(...this.params); return { meta: { changes: Number(r.changes || 0) } }; }
  };
}
const db = { prepare: statement };
const env = { AGAPAY_DB: db };

sqlite.exec(`
  INSERT INTO commerce_products (id, parish_id, commerce_module, name, description, item_category, status, event_date, event_location, sales_close_at)
  VALUES ('p1', 'parish_1', 'events', 'St. Nicholas Feast Dinner', 'Lamb dinner plate', 'meal', 'active', '2026-12-06', 'Parish Hall', NULL);
  INSERT INTO commerce_product_variants (id, product_id, parish_id, commerce_module, variant_name, unit_price_cents, stock_quantity, track_inventory, max_quantity_per_order, status)
  VALUES ('v1', 'p1', 'parish_1', 'events', 'Adult plate', 1800, 40, 1, 6, 'active');

  INSERT INTO commerce_products (id, parish_id, commerce_module, name, description, item_category, status, event_date)
  VALUES ('p2', 'parish_1', 'events', 'Greek Fest Admission', 'Festival admission', 'event', 'active', '2026-09-12');
  INSERT INTO commerce_product_variants (id, product_id, parish_id, commerce_module, variant_name, unit_price_cents, stock_quantity, track_inventory, max_quantity_per_order, status)
  VALUES ('v2', 'p2', 'parish_1', 'events', NULL, 1200, 5, 1, NULL, 'active');

  -- A bookstore item in the same parish must NOT leak into the events list.
  INSERT INTO commerce_products (id, parish_id, commerce_module, name, status)
  VALUES ('p3', 'parish_1', 'bookstore', 'Orthodox Study Bible', 'active');
  INSERT INTO commerce_product_variants (id, product_id, parish_id, commerce_module, variant_name, unit_price_cents, stock_quantity, track_inventory, status)
  VALUES ('v3', 'p3', 'parish_1', 'bookstore', NULL, 4995, 10, 1, 'active');
`);

const products = await loadDonorEventProducts(env, "parish_1");
assert.equal(products.length, 2, "only events-module products should be returned, bookstore item must not leak in");
assert.ok(products.every(p => p.name !== "Orthodox Study Bible"), "bookstore product leaked into events list");

const dinner = products.find(p => p.name === "St. Nicholas Feast Dinner");
assert.equal(dinner.eventDate, "2026-12-06", "event date must round-trip");
assert.equal(dinner.eventLocation, "Parish Hall", "event location must round-trip");
assert.equal(dinner.maxQuantityPerOrder, 6, "per-order cap must round-trip from schema");
assert.equal(dinner.stockQuantity, 40, "stock quantity (sell-out cap) must round-trip");
assert.equal(dinner.offeringKind, "meal", "meal listings must retain their UI classification");

const festival = products.find(p => p.name === "Greek Fest Admission");
assert.equal(festival.maxQuantityPerOrder, 0, "NULL max_quantity_per_order must normalize to 0 (no cap), not null/NaN");
assert.equal(festival.offeringKind, "event", "event listings must retain their UI classification");

const mealsOnly = await loadDonorEventProducts(env, "parish_1", { eventsEnabled: false, mealsEnabled: true });
assert.deepEqual(mealsOnly.map((product) => product.offeringKind), ["meal"], "turning Events off must hide only Event listings");
const eventsOnly = await loadDonorEventProducts(env, "parish_1", { eventsEnabled: true, mealsEnabled: false });
assert.deepEqual(eventsOnly.map((product) => product.offeringKind), ["event"], "turning Meals off must hide only Meal listings");

console.log("PASS - events module product listing is module-isolated (no bookstore leakage) and event/date/location/cap fields round-trip");

// â”€â”€ Admin CRUD SQL smoke test â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Exercises the exact INSERT/UPDATE statements handleParishEvents runs
// (copied verbatim from src/handlers/parish-events.js) against the same
// in-memory schema, then confirms the donor-facing read path reflects the
// change. This is the surface most likely to have a column-name typo, so
// it's worth verifying directly rather than trusting the syntax check.

const now2 = new Date().toISOString();
const productId = "evt_test_product";
const variantId = "evt_test_variant";

await db.prepare(`
  INSERT INTO commerce_products
    (id, parish_id, commerce_module, name, description, item_category, fulfillment_type,
     status, event_date, event_location, event_details, sales_close_at, created_at, updated_at)
  VALUES (?, ?, 'events', ?, ?, ?, 'physical_pickup', 'active', ?, ?, ?, ?, ?, ?)
`).bind(productId, "parish_1", "Patronal Feast Dinner", "Roast lamb, rice, salad", "meal", "2026-11-08", "Fellowship Hall", "Doors open 5pm", null, now2, now2).run();

await db.prepare(`
  INSERT INTO commerce_product_variants
    (id, product_id, parish_id, commerce_module, variant_name, unit_price_cents,
     stock_quantity, track_inventory, max_quantity_per_order, status, created_at, updated_at)
  VALUES (?, ?, ?, 'events', '', ?, ?, ?, ?, 'active', ?, ?)
`).bind(variantId, productId, "parish_1", 2000, 60, 1, 4, now2, now2).run();

let afterCreate = await loadDonorEventProducts(env, "parish_1");
let created = afterCreate.find(p => p.id === productId);
assert.ok(created, "created event product must appear in the donor-facing list");
assert.equal(created.priceCents, 2000, "created price must round-trip");
assert.equal(created.stockQuantity, 60, "created stock must round-trip");
assert.equal(created.maxQuantityPerOrder, 4, "created per-order cap must round-trip");
assert.equal(created.offeringKind, "meal", "parish-admin creation must persist the selected Meals tab kind");

// Now run the PATCH-equivalent update (price drop + stock sell-down + cap removed).
await db.prepare(`UPDATE commerce_products SET name = ?, updated_at = ? WHERE id = ? AND parish_id = ? AND commerce_module = 'events'`)
  .bind("Patronal Feast Dinner (Presale)", now2, productId, "parish_1").run();
await db.prepare(`UPDATE commerce_product_variants SET unit_price_cents = ?, stock_quantity = ?, max_quantity_per_order = ?, updated_at = ? WHERE id = ? AND parish_id = ? AND commerce_module = 'events'`)
  .bind(1800, 12, null, now2, variantId, "parish_1").run();

const afterPatch = await loadDonorEventProducts(env, "parish_1");
const patched = afterPatch.find(p => p.id === productId);
assert.equal(patched.name, "Patronal Feast Dinner (Presale)", "name update must apply");
assert.equal(patched.priceCents, 1800, "price update must apply");
assert.equal(patched.stockQuantity, 12, "stock update must apply");
assert.equal(patched.maxQuantityPerOrder, 0, "clearing the cap (NULL) must normalize to 0, not stay stale at 4");

console.log("PASS - admin create/patch SQL round-trips correctly through the donor-facing read path");

// â”€â”€ Ministry-scoped commerce isolation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
sqlite.exec(`
  INSERT INTO commerce_products (id, parish_id, commerce_module, name, item_category, status, ministry_id, event_date)
  VALUES ('ministry_a_item', 'parish_1', 'events', 'Choir Fundraiser Bake Sale', 'meal', 'active', 'ministry_choir', '2026-10-04');
  INSERT INTO commerce_product_variants (id, product_id, parish_id, commerce_module, variant_name, unit_price_cents, stock_quantity, track_inventory, status)
  VALUES ('ministry_a_variant', 'ministry_a_item', 'parish_1', 'events', '', 500, 20, 1, 'active');

  INSERT INTO commerce_products (id, parish_id, commerce_module, name, item_category, status, ministry_id, event_date)
  VALUES ('ministry_b_item', 'parish_1', 'events', 'Youth Group Car Wash', 'event', 'active', 'ministry_youth', '2026-10-11');
  INSERT INTO commerce_product_variants (id, product_id, parish_id, commerce_module, variant_name, unit_price_cents, stock_quantity, track_inventory, status)
  VALUES ('ministry_b_variant', 'ministry_b_item', 'parish_1', 'events', '', 1000, 30, 1, 'active');
`);

const choirResult = await listMinistryCommerceItems(env, "parish_1", "ministry_choir");
assert.equal(choirResult.parishId, "parish_1", "list response must include parishId for building QR/checkout links");
const choirItems = choirResult.items;
assert.equal(choirItems.length, 1, "choir ministry should see exactly its own listing");
assert.equal(choirItems[0].name, "Choir Fundraiser Bake Sale");
assert.equal(choirItems[0].offeringKind, "meal");

const youthItems = (await listMinistryCommerceItems(env, "parish_1", "ministry_youth")).items;
assert.equal(youthItems.length, 1, "youth ministry should see exactly its own listing, not choir's");
assert.equal(youthItems[0].name, "Youth Group Car Wash");
assert.equal(youthItems[0].offeringKind, "event");

const ministryCreated = await createMinistryCommerceItem(
  { json: async () => ({
    offeringKind: "meal",
    name: "Young Adults Lenten Supper",
    priceCents: 1500,
    stockQuantity: 48,
    trackInventory: true,
    eventDate: "2027-03-12"
  }) },
  env, "parish_1", "ministry_young_adults", "person_leader"
);
assert.equal(ministryCreated.offeringKind, "meal", "Koinonia creation must return the chosen listing type");
const ministryCreatedRow = sqlite.prepare("SELECT item_category,ministry_id,created_by_person_id FROM commerce_products WHERE id=?")
  .get(ministryCreated.id);
assert.deepEqual({ ...ministryCreatedRow }, {
  item_category: "meal",
  ministry_id: "ministry_young_adults",
  created_by_person_id: "person_leader"
}, "Koinonia creation must persist type and ministry ownership");

await patchMinistryCommerceItem(
  { json: async () => ({ offeringKind: "event" }) },
  env, "parish_1", "ministry_choir", "ministry_a_item"
);
const movedChoirItems = (await listMinistryCommerceItems(env, "parish_1", "ministry_choir")).items;
assert.equal(movedChoirItems[0].offeringKind, "event", "a ministry leader may correct its own listing type");

// The youth ministry must NOT be able to edit the choir's listing.
let blockedEditRejected = false;
try {
  await patchMinistryCommerceItem(
    { json: async () => ({ priceCents: 1 }) },
    env, "parish_1", "ministry_youth", "ministry_a_item"
  );
} catch (error) {
  blockedEditRejected = error.status === 404;
}
assert.ok(blockedEditRejected, "editing another ministry's listing must be rejected (404), not silently succeed");

// Confirm the choir's price is untouched after the blocked attempt.
const stillChoirItems = (await listMinistryCommerceItems(env, "parish_1", "ministry_choir")).items;
assert.equal(stillChoirItems[0].priceCents, 500, "blocked cross-ministry edit must not have changed the price");

console.log("PASS - Koinonia ministries create Meal/Event listings with ministry ownership; cross-ministry edits remain isolated");

// â”€â”€ Admin oversight: ministry attribution join â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Verifies the exact SQL handleParishEvents' GET / runs (parish-admin
// oversight list), including the directory_ministries join that surfaces
// which ministry created each listing -- this is new logic added after the
// ministry-delegation feature, and hadn't been exercised by any test yet.
sqlite.exec(`
  CREATE TABLE directory_ministries (
    id TEXT PRIMARY KEY, parish_id TEXT, display_name TEXT
  );
  INSERT INTO directory_ministries (id, parish_id, display_name) VALUES ('ministry_choir', 'parish_1', 'Choir Ministry');
`);

const adminOversightRows = await db.prepare(`
  SELECT p.id, p.name, p.ministry_id, m.display_name AS ministry_name
  FROM commerce_products p
  LEFT JOIN directory_ministries m ON m.id = p.ministry_id AND m.parish_id = p.parish_id
  WHERE p.parish_id = ? AND p.commerce_module = 'events'
  ORDER BY p.name COLLATE NOCASE
`).bind("parish_1").all();

const oversightItems = adminOversightRows.results.map(normalizeAdminRowForTest);
function normalizeAdminRowForTest(row) {
  return { name: row.name, ministryId: row.ministry_id || "", ministryName: row.ministry_id ? (row.ministry_name || "Ministry") : "Parish" };
}

const choirListing = oversightItems.find(i => i.name === "Choir Fundraiser Bake Sale");
assert.equal(choirListing.ministryName, "Choir Ministry", "admin oversight list must resolve the ministry's display name via the join");
assert.equal(choirListing.ministryId, "ministry_choir");

const parishAdminListing = oversightItems.find(i => i.name === "Patronal Feast Dinner (Presale)");
assert.equal(parishAdminListing.ministryName, "Parish", "a listing with no ministry_id (created by full parish admin) must show 'Parish', not blank or null");

console.log("PASS - admin oversight list correctly attributes ministry-created listings via directory_ministries join, and labels parish-admin-created listings as 'Parish'");
