import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  classifyStripeSourceEvent,
  createStripeSourceEventEnvelope,
  validateStripeSourceEventEnvelope
} from "../src/accounting/stripe-source-events.js";

import {
  disputeCommerceOrderFromStripe
} from "../src/handlers/parish.js";

function makeCommerceEnv() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE commerce_orders (
      id TEXT PRIMARY KEY,
      commerce_module TEXT NOT NULL DEFAULT 'bookstore',
      parish_id TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'pending',
      total_charged_cents INTEGER NOT NULL DEFAULT 0,
      stripe_payment_intent_id TEXT,
      updated_at TEXT
    );
  `);
  function wrap(sql) {
    return {
      _params: [],
      bind(...params) { this._params = params; return this; },
      async first() {
        const row = db.prepare(sql).get(...this._params);
        return row === undefined ? null : row;
      },
      async all() {
        return { results: db.prepare(sql).all(...this._params), success: true };
      },
      async run() {
        const info = db.prepare(sql).run(...this._params);
        return { success: true, meta: { changes: info.changes } };
      }
    };
  }
  return { env: { AGAPAY_DB: { prepare: (sql) => wrap(sql) } }, db };
}

{
  const envelope = createStripeSourceEventEnvelope({
    id: "evt_source_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_123",
        payment_intent: "pi_123",
        amount_total: 2500,
        currency: "usd",
        metadata: { parish_id: "st-test", order_id: "order_123", commerce_module: "bookstore" }
      }
    }
  }, { correlationId: "corr-12345678" });
  assert.equal(envelope.operationalRecordType, "commerce_order");
  assert.equal(envelope.paymentIntentId, "pi_123");
  assert.equal(envelope.idempotencyKey, "stripe:evt_source_1:checkout.session.completed:commerce_order:order_123");
}

{
  assert.equal(classifyStripeSourceEvent("charge.refunded", {}), "payment_intent");
  const partial = createStripeSourceEventEnvelope({
    id: "evt_refund_partial",
    type: "charge.refunded",
    data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 5000, amount_refunded: 1200 } }
  }, { operationalRecordId: "pi_1" });
  const full = createStripeSourceEventEnvelope({
    id: "evt_refund_full",
    type: "charge.refunded",
    data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 5000, amount_refunded: 5000 } }
  }, { operationalRecordId: "pi_1" });
  assert.equal(partial.refundedCents, 1200);
  assert.equal(full.refundedCents, 5000);
}

{
  const dispute = createStripeSourceEventEnvelope({
    id: "evt_dispute_created",
    type: "charge.dispute.created",
    data: { object: { id: "dp_1", payment_intent: "pi_1", amount: 5000, status: "needs_response" } }
  }, { operationalRecordId: "pi_1" });
  assert.equal(dispute.disputeId, "dp_1");
  assert.equal(dispute.operationalRecordType, "payment_intent");
}

{
  const payout = createStripeSourceEventEnvelope({
    id: "evt_payout_paid",
    type: "payout.paid",
    data: { object: { id: "po_1", amount: 9800, currency: "usd" } }
  }, { parishId: "st-test", operationalRecordId: "sp_1" });
  assert.equal(payout.payoutId, "po_1");
  assert.equal(payout.operationalRecordType, "settlement_profile");
}

{
  assert.throws(() => validateStripeSourceEventEnvelope({
    schemaVersion: 1,
    sourceSystem: "stripe",
    stripeEventId: "evt_bad",
    eventType: "payment_intent.succeeded",
    operationalRecordType: "donor_offering",
    idempotencyKey: "stripe:evt_bad",
    journalEntryId: "je_forbidden"
  }), /must not contain accounting posting fields/);
}

{
  const { env, db } = makeCommerceEnv();
  db.prepare(`
    INSERT INTO commerce_orders
      (id, commerce_module, parish_id, payment_status, status, total_charged_cents, stripe_payment_intent_id, updated_at)
    VALUES (?, 'bookstore', 'st-test', 'paid', 'completed', 5150, ?, ?)
  `).run("order_dispute", "pi_dispute", new Date().toISOString());

  await disputeCommerceOrderFromStripe(env, {
    id: "dp_created",
    payment_intent: "pi_dispute",
    amount: 5150,
    status: "needs_response"
  }, "created");
  let row = db.prepare("SELECT payment_status, status FROM commerce_orders WHERE id = ?").get("order_dispute");
  assert.equal(row.payment_status, "disputed");
  assert.equal(row.status, "disputed");

  await disputeCommerceOrderFromStripe(env, {
    id: "dp_closed",
    payment_intent: "pi_dispute",
    amount: 5150,
    status: "lost"
  }, "closed");
  row = db.prepare("SELECT payment_status, status FROM commerce_orders WHERE id = ?").get("order_dispute");
  assert.equal(row.payment_status, "dispute_closed");
  assert.equal(row.status, "dispute_closed");
}

console.log("All Stripe source-event tests passed.");
