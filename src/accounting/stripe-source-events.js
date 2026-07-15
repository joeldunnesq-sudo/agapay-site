// Phase 0.75B: source-event contract for Stripe activity that may later feed
// accounting. This module deliberately records intent and identifiers only; it
// does not post, classify ledgers, or write accounting rows.

import { ValidationError } from "./errors.js";
import { requireNonEmptyString } from "./validation.js";

export const STRIPE_SOURCE_EVENT_SCHEMA_VERSION = 1;

export const STRIPE_SOURCE_EVENT_TYPES = Object.freeze([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "invoice.payment_succeeded",
  "invoice.paid",
  "payout.paid",
  "payout.failed"
]);

export const STRIPE_SOURCE_RECORD_TYPES = Object.freeze([
  "donor_offering",
  "commerce_order",
  "payment_intent",
  "registration",
  "subscription",
  "settlement_profile",
  "unknown"
]);

const SOURCE_EVENT_ACCOUNTING_FIELDS = Object.freeze([
  "ledgerId",
  "journalEntryId",
  "journalLineId",
  "debitAccountId",
  "creditAccountId",
  "postedAt",
  "postingStatus"
]);

function stripeId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.id === "string") return value.id;
  return "";
}

function isoFromStripeSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return new Date(numeric * 1000).toISOString();
}

export function classifyStripeSourceEvent(eventType, object = {}) {
  if (eventType.startsWith("checkout.session")) {
    if (object.metadata?.commerce_module) return "commerce_order";
    if (object.mode === "subscription") return "subscription";
    return "donor_offering";
  }
  if (eventType.startsWith("payment_intent")) {
    if (object.metadata?.commerce_module) return "commerce_order";
    return "donor_offering";
  }
  if (eventType === "charge.refunded") return "payment_intent";
  if (eventType.startsWith("charge.dispute")) return "payment_intent";
  if (eventType.startsWith("invoice.")) return "subscription";
  if (eventType.startsWith("payout.")) return "settlement_profile";
  return "unknown";
}

export function stripeSourceIdempotencyKey({ stripeEventId, eventType, operationalRecordType, operationalRecordId }) {
  return [
    "stripe",
    requireNonEmptyString(stripeEventId, "stripeEventId"),
    requireNonEmptyString(eventType, "eventType"),
    operationalRecordType || "unknown",
    operationalRecordId || "unknown"
  ].join(":");
}

export function createStripeSourceEventEnvelope(event = {}, {
  parishId = "",
  operationalRecordType = "",
  operationalRecordId = "",
  settlementProfileId = "",
  revenueStreamId = "",
  sourceStatus = "received",
  correlationId = "",
  receivedAt = new Date().toISOString()
} = {}) {
  const object = event.data?.object || {};
  const eventType = requireNonEmptyString(event.type, "event.type");
  if (!STRIPE_SOURCE_EVENT_TYPES.includes(eventType)) {
    throw new ValidationError("Stripe event type is not part of the accounting source-event contract.", {
      details: { eventType }
    });
  }
  const recordType = operationalRecordType || classifyStripeSourceEvent(eventType, object);
  const recordId = operationalRecordId || object.metadata?.order_id || object.metadata?.offering_id || object.id || "";
  const envelope = {
    schemaVersion: STRIPE_SOURCE_EVENT_SCHEMA_VERSION,
    sourceSystem: "stripe",
    sourceEventId: `stripe:${event.id || "unidentified"}`,
    stripeEventId: requireNonEmptyString(event.id, "event.id"),
    eventType,
    parishId: parishId || object.metadata?.parish_id || "",
    operationalRecordType: recordType,
    operationalRecordId: recordId,
    stripeAccountId: event.account || object.on_behalf_of || "",
    checkoutSessionId: eventType.startsWith("checkout.session") ? object.id || "" : "",
    paymentIntentId: stripeId(object.payment_intent) || (eventType.startsWith("payment_intent") ? object.id || "" : ""),
    chargeId: eventType.startsWith("charge.") ? object.id || "" : stripeId(object.latest_charge),
    balanceTransactionId: stripeId(object.balance_transaction),
    refundId: eventType === "charge.refunded" ? stripeId(object.refunds?.data?.[0]) : "",
    disputeId: eventType.startsWith("charge.dispute") ? object.id || "" : "",
    payoutId: eventType.startsWith("payout.") ? object.id || "" : "",
    amountCents: Number(object.amount_total ?? object.amount_received ?? object.amount ?? object.amount_paid ?? 0),
    refundedCents: Number(object.amount_refunded || 0),
    currency: String(object.currency || "usd").toLowerCase(),
    stripeCreatedAt: isoFromStripeSeconds(object.created),
    receivedAt,
    settlementProfileId,
    revenueStreamId,
    sourceStatus,
    correlationId,
    idempotencyKey: stripeSourceIdempotencyKey({
      stripeEventId: event.id,
      eventType,
      operationalRecordType: recordType,
      operationalRecordId: recordId
    })
  };
  return validateStripeSourceEventEnvelope(envelope);
}

export function validateStripeSourceEventEnvelope(envelope = {}) {
  if (envelope.schemaVersion !== STRIPE_SOURCE_EVENT_SCHEMA_VERSION) {
    throw new ValidationError("Unsupported Stripe source-event schema version.", {
      details: { schemaVersion: envelope.schemaVersion }
    });
  }
  requireNonEmptyString(envelope.sourceSystem, "sourceSystem");
  requireNonEmptyString(envelope.stripeEventId, "stripeEventId");
  requireNonEmptyString(envelope.eventType, "eventType");
  if (!STRIPE_SOURCE_EVENT_TYPES.includes(envelope.eventType)) {
    throw new ValidationError("Unsupported Stripe source-event type.", {
      details: { eventType: envelope.eventType }
    });
  }
  if (!STRIPE_SOURCE_RECORD_TYPES.includes(envelope.operationalRecordType)) {
    throw new ValidationError("Unsupported operational record type.", {
      details: { operationalRecordType: envelope.operationalRecordType }
    });
  }
  for (const field of SOURCE_EVENT_ACCOUNTING_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(envelope, field)) {
      throw new ValidationError("Stripe source events must not contain accounting posting fields.", {
        details: { field }
      });
    }
  }
  requireNonEmptyString(envelope.idempotencyKey, "idempotencyKey");
  return envelope;
}
