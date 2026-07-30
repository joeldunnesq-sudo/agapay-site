import assert from "node:assert/strict";
import {
  checkoutFinancials,
  estimateStripeAchFeeCents,
  estimateStripeProcessingFeeCents,
  grossUpForAchFeeCents,
  grossUpForStripeProcessingFeeCents,
  PAYMENT_FEE_SCHEDULES,
} from "../src/lib/payment-fees.js";
import { classifyStripeCharge } from "../src/lib/payment-classification.js";
import { stripeChargeVolumeRecord, summarizeStripeVolumeRows } from "../src/lib/stripe-volume.js";

assert.equal(PAYMENT_FEE_SCHEDULES.ach.rateBasisPoints, 80);
assert.equal(PAYMENT_FEE_SCHEDULES.ach.fixedFeeCents, 0);
assert.equal(PAYMENT_FEE_SCHEDULES.ach.maxFeeCents, 500);
assert.equal(estimateStripeAchFeeCents(10_000), 80);
assert.equal(estimateStripeAchFeeCents(100_000), 500);
assert.equal(estimateStripeProcessingFeeCents(10_000), 320);

for (const [net, method] of [[1, "ach"], [10_000, "ach"], [100_000, "ach"], [10_000, "card"]]) {
  const isAch = method === "ach";
  const gross = isAch ? grossUpForAchFeeCents(net) : grossUpForStripeProcessingFeeCents(net);
  const fee = isAch ? estimateStripeAchFeeCents(gross) : estimateStripeProcessingFeeCents(gross);
  const previousFee = isAch ? estimateStripeAchFeeCents(gross - 1) : estimateStripeProcessingFeeCents(gross - 1);
  assert.ok(gross - fee >= net);
  assert.ok(gross === net || (gross - 1) - previousFee < net);
}

assert.deepEqual(checkoutFinancials(100_000, true, false, "ach"), {
  chargeCents: 100_500,
  estimatedStripeFeeCents: 500,
  agapayFeeCents: 0,
  totalTransactionFeeCents: 500,
  paymentMethod: "ach",
  feeScheduleId: "stripe_ach_direct_debit_us"
});
assert.equal(checkoutFinancials(10_000, true, true, "ach").paymentMethod, "card");

assert.equal(classifyStripeCharge({ metadata: { agapay_payment_class: "qualifying_donation" } }).paymentClass, "qualifying_donation");
assert.equal(classifyStripeCharge({ metadata: { commerce_module: "bookstore" } }).paymentClass, "nonqualifying_commerce");
assert.equal(classifyStripeCharge({ metadata: { parish_id: "p1", gift_type: "stewardship" } }).paymentClass, "qualifying_donation");
assert.equal(classifyStripeCharge({ metadata: {} }).paymentClass, "unclassified");

const record = stripeChargeVolumeRecord("p1", "acct_1", {
  id: "ch_1",
  status: "succeeded",
  amount: 10_000,
  amount_refunded: 2_500,
  currency: "usd",
  created: 1_700_000_000,
  metadata: { agapay_payment_class: "qualifying_donation" }
});
assert.equal(record.netCents, 7_500);
assert.equal(record.paymentClass, "qualifying_donation");

const conservative = summarizeStripeVolumeRows([
  { payment_class: "qualifying_donation", payment_count: 8, gross_cents: 8_000, refunded_cents: 0, net_cents: 8_000 },
  { payment_class: "unclassified", payment_count: 2, gross_cents: 2_000, refunded_cents: 0, net_cents: 2_000 }
], { status: "complete", scanned_count: 10, last_completed_at: "2026-07-28T00:00:00.000Z" }, "2026-01-01T00:00:00.000Z");
assert.equal(conservative.donationPercent, 80);
assert.equal(conservative.meetsVolumeThreshold, true);
assert.equal(conservative.unclassifiedNetCents, 2_000);

console.log("Stripe nonprofit fee and volume tests passed.");
