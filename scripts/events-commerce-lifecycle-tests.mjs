import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeLedger } from "../src/accounting/index.js";
import {
  completeCommerceOrderFromStripe,
  sendCommerceReceiptIfNeeded
} from "../src/handlers/parish-commerce.js";
import { processStripeWebhookEvent } from "../src/handlers/stripe.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function d1Database(sqlite) {
  function prepare(sql) {
    return {
      sql,
      params: [],
      bind(...params) { this.params = params; return this; },
      async first() { return sqlite.prepare(this.sql).get(...this.params) || null; },
      async all() { return { results: sqlite.prepare(this.sql).all(...this.params) }; },
      async run() {
        const result = sqlite.prepare(this.sql).run(...this.params);
        return { success: true, meta: { changes: Number(result.changes || 0) } };
      }
    };
  }
  let batchQueue = Promise.resolve();
  return {
    prepare,
    batch(statements) {
      const operation = batchQueue.then(async () => {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
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
}

const commerceSqlite = new DatabaseSync(":memory:");
commerceSqlite.exec(`
  CREATE TABLE registrations (
    reference TEXT PRIMARY KEY, parish_id TEXT, data TEXT, updated_at TEXT, received_at TEXT
  );
  CREATE TABLE donor_offerings (
    id TEXT PRIMARY KEY, payment_intent_id TEXT, checkout_session_id TEXT, data TEXT
  );
  CREATE TABLE commerce_products (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, name TEXT,
    description TEXT, item_category TEXT, default_sku TEXT, default_tax_code TEXT,
    fulfillment_type TEXT, status TEXT, image_url TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_product_variants (
    id TEXT PRIMARY KEY, product_id TEXT, parish_id TEXT, commerce_module TEXT,
    sku TEXT, barcode TEXT, variant_name TEXT, unit_price_cents INTEGER,
    sale_price_cents INTEGER, cost_basis_cents INTEGER DEFAULT 0, tax_code TEXT,
    fulfillment_type TEXT, stock_quantity INTEGER, reorder_threshold INTEGER DEFAULT 0,
    track_inventory INTEGER, max_quantity_per_order INTEGER, status TEXT,
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_orders (
    id TEXT PRIMARY KEY, order_number TEXT, commerce_module TEXT, source TEXT, parish_id TEXT,
    donor_email TEXT, donor_name TEXT, product_id TEXT, product_sku TEXT, variant_id TEXT,
    tax_code TEXT, item_category TEXT, item_description TEXT, quantity INTEGER,
    unit_price_cents INTEGER, subtotal_cents INTEGER, tax_cents INTEGER,
    total_charged_cents INTEGER, stripe_fee_cents INTEGER, agapay_fee_cents INTEGER,
    parish_net_cents INTEGER, cover_fees INTEGER, payment_status TEXT, status TEXT,
    checkout_session_id TEXT, stripe_payment_intent_id TEXT, stripe_charge_id TEXT,
    stripe_customer_id TEXT, fulfillment_status TEXT, pickup_note TEXT, parish_notes TEXT,
    receipt_email_status TEXT, receipt_email_id TEXT, receipt_email_sent_at TEXT,
    settlement_profile_id TEXT, completed_at TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_order_items (
    id TEXT PRIMARY KEY, order_id TEXT, parish_id TEXT, commerce_module TEXT,
    product_id TEXT, variant_id TEXT, sku TEXT, barcode TEXT, item_category TEXT,
    item_name TEXT, item_description TEXT, quantity INTEGER, unit_price_cents INTEGER,
    subtotal_cents INTEGER, tax_cents INTEGER, total_cents INTEGER, tax_code TEXT,
    cost_basis_cents INTEGER, snapshot_json TEXT, fulfillment_type TEXT,
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE commerce_inventory_movements (
    id TEXT PRIMARY KEY, parish_id TEXT, commerce_module TEXT, product_id TEXT,
    variant_id TEXT, sku TEXT, movement_type TEXT, quantity_delta INTEGER,
    unit_cost_cents INTEGER, order_id TEXT, note TEXT, created_by TEXT, created_at TEXT
  );
`);
commerceSqlite.exec(readFileSync(path.join(root, "migrations", "0021_accounting_control_plane.sql"), "utf8"));

const now = "2026-08-19T14:00:00.000Z";
const registration = JSON.stringify({
  parishId: "parish_events",
  parishName: "St. Nicholas Orthodox Church",
  commerceSellerDisplayName: "St. Nicholas Orthodox Church",
  subscriptionTier: "parish",
  bookstoreEnabled: true
});
commerceSqlite.prepare(`INSERT INTO registrations(reference,parish_id,data,updated_at,received_at)
  VALUES('reg_events','parish_events',?,?,?)`).run(registration, now, now);
commerceSqlite.prepare(`INSERT INTO accounting_entities
  (id,parish_id,entity_status,activation_status,subscription_tier,enabled_at)
  VALUES('entity_events','parish_events','ready','active','parish',?)`).run(now);
commerceSqlite.prepare(`INSERT INTO accounting_databases
  (id,accounting_entity_id,environment,database_identifier,schema_version,migration_version,
   provisioning_status,health_status,provisioned_at,last_validated_at)
  VALUES('db_events','entity_events','production','accounting-events-test',10,'0010',
    'ready','healthy',?,?)`).run(now, now);

const accountingSqlite = new DatabaseSync(":memory:");
for (const file of [
  "0001_accounting_database_foundation.sql",
  "0002_core_ledger.sql",
  "0003_phase2a_setup_configuration.sql",
  "0005_phase2c_reporting_indexes.sql"
]) accountingSqlite.exec(readFileSync(path.join(root, "accounting-migrations", file), "utf8"));
const accountingDb = d1Database(accountingSqlite);
await initializeLedger(accountingDb, {
  actor: { id: "events_test", capabilities: ["accounting.configure"] },
  date: new Date(now)
});
for (const file of ["0006_phase2d_give_stripe_integration.sql", "0010_phase3c_commerce_accounting.sql"]) {
  accountingSqlite.exec(readFileSync(path.join(root, "accounting-migrations", file), "utf8"));
}
accountingSqlite.prepare("UPDATE accounting_commerce_settings SET posting_mode='automatic'").run();

const commerceDb = d1Database(commerceSqlite);
const env = {
  AGAPAY_DB: commerceDb,
  ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ "accounting-events-test": "EVENTS_ACCOUNTING_DB" }),
  EVENTS_ACCOUNTING_DB: accountingDb
};

function addProduct({ productId, variantId, stock = 10, price = 2000 }) {
  commerceSqlite.prepare(`INSERT INTO commerce_products
    (id,parish_id,commerce_module,name,description,item_category,default_sku,default_tax_code,
     fulfillment_type,status,image_url,created_at,updated_at)
    VALUES(?,'parish_events','events','Parish Supper','Dinner ticket','meal',?,'txcd_meal',
      'physical_pickup','active','',?,?)`).run(productId, `SKU-${variantId}`, now, now);
  commerceSqlite.prepare(`INSERT INTO commerce_product_variants
    (id,product_id,parish_id,commerce_module,sku,barcode,variant_name,unit_price_cents,
     cost_basis_cents,tax_code,fulfillment_type,stock_quantity,track_inventory,status,created_at,updated_at)
    VALUES(?,?,'parish_events','events',?,'','Adult',?,800,'txcd_meal','physical_pickup',?,1,'active',?,?)`)
    .run(variantId, productId, `SKU-${variantId}`, price, stock, now, now);
}

function addOrder({ orderId, sessionId, productId, variantId, quantity = 1, price = 2000 }) {
  const subtotal = quantity * price;
  commerceSqlite.prepare(`INSERT INTO commerce_orders
    (id,order_number,commerce_module,source,parish_id,donor_email,donor_name,product_id,
     product_sku,variant_id,tax_code,item_category,item_description,quantity,unit_price_cents,
     subtotal_cents,tax_cents,total_charged_cents,stripe_fee_cents,agapay_fee_cents,
     parish_net_cents,cover_fees,payment_status,status,checkout_session_id,
     fulfillment_status,pickup_note,parish_notes,receipt_email_status,settlement_profile_id,
     created_at,updated_at)
    VALUES(?,?,'events','catalog','parish_events','buyer@example.com','Alex Buyer',?,?,?,
      'txcd_meal','meal','Parish Supper',?,?,?,0,?,0,0,?,0,'pending','checkout_created',?,
      'pending','Bring this receipt to the parish hall.','','','',?,?)`)
    .run(orderId, `EV-${orderId}`, productId, `SKU-${variantId}`, variantId,
      quantity, price, subtotal, subtotal, subtotal, sessionId, now, now);
  commerceSqlite.prepare(`INSERT INTO commerce_order_items
    (id,order_id,parish_id,commerce_module,product_id,variant_id,sku,barcode,item_category,
     item_name,item_description,quantity,unit_price_cents,subtotal_cents,tax_cents,total_cents,
     tax_code,cost_basis_cents,snapshot_json,fulfillment_type,created_at,updated_at)
    VALUES(?,?,'parish_events','events',?,?,'SKU-'||?,'','meal','Adult dinner ticket',
      'Parish Supper',?,?,?,0,?,'txcd_meal',800,'{}','physical_pickup',?,?)`)
    .run(`item_${orderId}`, orderId, productId, variantId, variantId,
      quantity, price, subtotal, subtotal, now, now);
}

addProduct({ productId: "event_main", variantId: "variant_main", stock: 3 });
addOrder({ orderId: "event_order_main", sessionId: "cs_event_main", productId: "event_main", variantId: "variant_main", quantity: 2 });

await processStripeWebhookEvent(env, {
  id: "evt_checkout_main",
  type: "checkout.session.completed",
  data: { object: {
    id: "cs_event_main",
    mode: "payment",
    payment_status: "paid",
    amount_subtotal: 4000,
    amount_total: 4280,
    total_details: { amount_tax: 280 },
    payment_intent: "pi_event_main",
    customer: "cus_events",
    created: 1787148000,
    metadata: { order_id: "event_order_main", commerce_module: "events", parish_id: "parish_events" }
  } }
});

let mainOrder = commerceSqlite.prepare("SELECT * FROM commerce_orders WHERE id='event_order_main'").get();
assert.equal(mainOrder.payment_status, "paid");
assert.equal(mainOrder.fulfillment_status, "ready");
assert.equal(mainOrder.tax_cents, 280, "Stripe automatic-tax total must be persisted on the order");
assert.equal(mainOrder.total_charged_cents, 4280);
assert.equal(commerceSqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id='variant_main'").get().stock_quantity, 1);
assert.equal(commerceSqlite.prepare("SELECT commerce_module FROM commerce_inventory_movements WHERE order_id='event_order_main'").get().commerce_module, "events");

const saleSource = accountingSqlite.prepare(`SELECT * FROM accounting_integration_source_events
  WHERE source_event_id='commerce:event_order_main:completed'`).get();
assert.ok(saleSource, "Events completion must reach the parish accounting database");
assert.equal(saleSource.commerce_channel, "events");
assert.equal(accountingSqlite.prepare(`SELECT i.category_id
  FROM accounting_commerce_source_items s
  JOIN accounting_commerce_items i ON i.operational_item_id=s.operational_item_id
  WHERE s.source_event_id=? LIMIT 1`).get(saleSource.id).category_id, "meal",
  "Meals must remain itemized as meals while posting through the shared Events accounting channel");
assert.equal(saleSource.sales_tax_amount, 280, "order-level Stripe tax must reach the tax-liability source fact");
assert.equal(saleSource.taxable_amount, 4000);
assert.equal(saleSource.status, "posted");
assert.equal(accountingSqlite.prepare(`SELECT credit_amount FROM accounting_journal_lines
  WHERE journal_entry_id=? AND account_id='acct_2100'`).get(saleSource.journal_entry_id).credit_amount, 280,
  "sales tax must credit Sales Tax Payable, not revenue");
assert.equal(accountingSqlite.prepare(`SELECT SUM(tax_amount) tax FROM accounting_commerce_source_items
  WHERE source_event_id=?`).get(saleSource.id).tax, 280,
  "order-level automatic tax must be allocated to accounting item facts");

const originalFetch = globalThis.fetch;
let emailCalls = 0;
let emailPayload = null;
globalThis.fetch = async (_url, init) => {
  emailCalls += 1;
  emailPayload = JSON.parse(init.body);
  return { ok: true, status: 200, async text() { return JSON.stringify({ id: "email_events_1" }); } };
};
try {
  env.RESEND_API_KEY = "test_key";
  const firstReceipt = await sendCommerceReceiptIfNeeded(env, "event_order_main");
  const replayedReceipt = await sendCommerceReceiptIfNeeded(env, "event_order_main");
  assert.equal(firstReceipt.status, "sent");
  assert.equal(replayedReceipt.status, "already_claimed");
  assert.equal(emailCalls, 1, "receipt claim must be idempotent across webhook retries");
  assert.match(emailPayload.subject, /Meals & Events receipt/);
  assert.match(emailPayload.text, /Sales tax: \$2\.80/);
  assert.match(emailPayload.text, /not a charitable-contribution acknowledgment/);
} finally {
  delete env.RESEND_API_KEY;
  globalThis.fetch = originalFetch;
}

addProduct({ productId: "event_race", variantId: "variant_race", stock: 1, price: 1500 });
addOrder({ orderId: "event_race_a", sessionId: "cs_race_a", productId: "event_race", variantId: "variant_race", price: 1500 });
addOrder({ orderId: "event_race_b", sessionId: "cs_race_b", productId: "event_race", variantId: "variant_race", price: 1500 });
await Promise.all([
  completeCommerceOrderFromStripe(env, {
    id: "cs_race_a", amount_total: 1500, payment_status: "paid",
    metadata: { order_id: "event_race_a", commerce_module: "events" }
  }, "session"),
  completeCommerceOrderFromStripe(env, {
    id: "cs_race_b", amount_total: 1500, payment_status: "paid",
    metadata: { order_id: "event_race_b", commerce_module: "events" }
  }, "session")
]);
const raced = commerceSqlite.prepare(`SELECT payment_status,fulfillment_status,parish_notes
  FROM commerce_orders WHERE id IN('event_race_a','event_race_b') ORDER BY id`).all();
assert.ok(raced.every((order) => order.payment_status === "paid"));
assert.equal(commerceSqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id='variant_race'").get().stock_quantity, 0);
assert.equal(raced.filter((order) => String(order.parish_notes).includes("Inventory attention:")).length, 1);
assert.equal(raced.filter((order) => order.fulfillment_status === "pending").length, 1);
assert.equal(raced.filter((order) => order.fulfillment_status === "ready").length, 1);
assert.equal(commerceSqlite.prepare(`SELECT COUNT(*) count FROM commerce_inventory_movements
  WHERE variant_id='variant_race' AND movement_type='sale'`).get().count, 1);

addProduct({ productId: "event_replay", variantId: "variant_replay", stock: 2 });
addOrder({ orderId: "event_order_replay", sessionId: "cs_event_replay", productId: "event_replay", variantId: "variant_replay" });
await processStripeWebhookEvent(env, {
  id: "evt_pi_first",
  type: "payment_intent.succeeded",
  data: { object: {
    id: "pi_event_replay", amount_received: 2140, created: 1787148000,
    metadata: { order_id: "event_order_replay", commerce_module: "events", parish_id: "parish_events" }
  } }
});
assert.equal(commerceSqlite.prepare("SELECT tax_cents FROM commerce_orders WHERE id='event_order_replay'").get().tax_cents, 0);
assert.equal(accountingSqlite.prepare(`SELECT COUNT(*) count FROM accounting_integration_source_events
  WHERE source_event_id='commerce:event_order_replay:completed'`).get().count, 0,
  "PaymentIntent completion must wait for the Checkout Session automatic-tax facts before accounting");
await processStripeWebhookEvent(env, {
  id: "evt_session_second",
  type: "checkout.session.completed",
  data: { object: {
    id: "cs_event_replay", mode: "payment", payment_status: "paid", amount_total: 2140,
    total_details: { amount_tax: 140 }, payment_intent: "pi_event_replay", created: 1787148001,
    metadata: { order_id: "event_order_replay", commerce_module: "events", parish_id: "parish_events" }
  } }
});
assert.equal(commerceSqlite.prepare("SELECT tax_cents FROM commerce_orders WHERE id='event_order_replay'").get().tax_cents, 140);
assert.equal(commerceSqlite.prepare("SELECT stock_quantity FROM commerce_product_variants WHERE id='variant_replay'").get().stock_quantity, 1,
  "late Session reconciliation must not decrement Events stock twice");
assert.equal(accountingSqlite.prepare(`SELECT sales_tax_amount FROM accounting_integration_source_events
  WHERE source_event_id='commerce:event_order_replay:completed'`).get().sales_tax_amount, 140);

await processStripeWebhookEvent(env, {
  id: "evt_refund_main",
  type: "charge.refunded",
  data: { object: {
    id: "ch_event_main", payment_intent: "pi_event_main", amount: 4280, amount_refunded: 4280,
    currency: "usd", metadata: { parish_id: "parish_events" },
    refunds: { data: [{ id: "re_event_main", amount: 4280, currency: "usd", created: 1787151600 }] }
  } }
});
mainOrder = commerceSqlite.prepare("SELECT * FROM commerce_orders WHERE id='event_order_main'").get();
assert.equal(mainOrder.payment_status, "refunded");
const refundSource = accountingSqlite.prepare(`SELECT * FROM accounting_integration_source_events
  WHERE source_event_id='commerce:event_order_main:refund:re_event_main'`).get();
assert.ok(refundSource);
assert.equal(refundSource.commerce_channel, "events");
assert.equal(refundSource.refund_amount, 4280);
assert.equal(refundSource.sales_tax_amount, 280, "refund accounting must reverse its proportional sales tax");

await processStripeWebhookEvent(env, {
  id: "evt_dispute_main",
  type: "charge.dispute.created",
  data: { object: {
    id: "dp_event_main", payment_intent: "pi_event_main", amount: 4280,
    currency: "usd", reason: "fraudulent", created: 1787155200
  } }
});
assert.equal(commerceSqlite.prepare("SELECT payment_status FROM commerce_orders WHERE id='event_order_main'").get().payment_status, "disputed");
const disputeSource = accountingSqlite.prepare(`SELECT * FROM accounting_integration_source_events
  WHERE source_event_id='commerce:event_order_main:dispute:dp_event_main:created'`).get();
assert.ok(disputeSource, "commerce disputes must reach the accounting integration pipeline");
assert.equal(disputeSource.source_type, "commerce_dispute_created");
assert.equal(disputeSource.commerce_channel, "events");

await processStripeWebhookEvent(env, {
  id: "evt_dispute_main_won",
  type: "charge.dispute.closed",
  data: { object: {
    id: "dp_event_main", payment_intent: "pi_event_main", amount: 4280,
    currency: "usd", status: "won", created: 1787158800
  } }
});
assert.equal(commerceSqlite.prepare("SELECT payment_status FROM commerce_orders WHERE id='event_order_main'").get().payment_status, "paid");
const wonSource = accountingSqlite.prepare(`SELECT * FROM accounting_integration_source_events
  WHERE source_event_id='commerce:event_order_main:dispute:dp_event_main:closed'`).get();
assert.equal(wonSource.source_type, "commerce_dispute_won",
  "a won dispute must reverse the provisional chargeback through accounting");
assert.equal(wonSource.status, "posted");

const eventsHandlerSource = readFileSync(path.join(root, "src", "handlers", "parish-events.js"), "utf8");
assert.match(eventsHandlerSource,
  /EVENTS_STRIPE_TAX_CODE\s*\|\|\s*env\.PARISH_COMMERCE_DEFAULT_TAX_CODE\s*\|\|\s*env\.BOOKSTORE_STRIPE_TAX_CODE/,
  "Events checkout must use the Events tax code first, then explicit shared and legacy fallbacks");
assert.match(eventsHandlerSource,
  /MEALS_STRIPE_TAX_CODE\s*\|\|\s*env\.EVENTS_STRIPE_TAX_CODE\s*\|\|\s*env\.PARISH_COMMERCE_DEFAULT_TAX_CODE/,
  "Meals checkout must support a distinct Stripe tax code before the shared Events fallback");
assert.match(eventsHandlerSource, /automatic_tax\[enabled\].*true/,
  "Events checkout must ask Stripe Tax to calculate jurisdictional sales tax");

console.log("PASS - Events webhooks complete payments, reconcile automatic tax, serialize inventory, post sales/refunds/disputes to accounting, and send one receipt");
