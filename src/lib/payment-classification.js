export const STRIPE_PAYMENT_CLASSES = Object.freeze([
  "qualifying_donation",
  "nonqualifying_commerce",
  "nonqualifying_membership",
  "nonqualifying_tuition",
  "nonqualifying_ticket",
  "nonqualifying_registration",
  "nonqualifying_auction",
  "nonqualifying_other",
  "unclassified"
]);

const PAYMENT_CLASS_SET = new Set(STRIPE_PAYMENT_CLASSES);

export function classifyStripeCharge(charge = {}) {
  const metadata = {
    ...(charge.invoice?.subscription_details?.metadata || {}),
    ...(charge.invoice?.lines?.data?.[0]?.metadata || {}),
    ...(charge.payment_intent?.metadata || {}),
    ...(charge.metadata || {})
  };
  const explicit = String(metadata.agapay_payment_class || "").trim().toLowerCase();
  if (PAYMENT_CLASS_SET.has(explicit)) {
    return { paymentClass: explicit, source: "agapay_metadata" };
  }
  const explicitAliases = {
    donation: "qualifying_donation",
    non_donation_commerce: "nonqualifying_commerce",
    non_donation_membership: "nonqualifying_membership",
    non_donation_tuition: "nonqualifying_tuition",
    non_donation_ticket: "nonqualifying_ticket",
    non_donation_registration: "nonqualifying_registration",
    non_donation_auction: "nonqualifying_auction",
    non_donation_other: "nonqualifying_other"
  };
  if (explicitAliases[explicit]) {
    return { paymentClass: explicitAliases[explicit], source: "agapay_metadata_legacy_alias" };
  }
  if (metadata.commerce_module || String(metadata.order_id || "").startsWith("bookstore_")) {
    return { paymentClass: "nonqualifying_commerce", source: "legacy_commerce_metadata" };
  }
  const purpose = String(metadata.payment_purpose || metadata.transaction_type || "").trim().toLowerCase();
  const purposeMap = {
    membership: "nonqualifying_membership",
    tuition: "nonqualifying_tuition",
    ticket: "nonqualifying_ticket",
    registration: "nonqualifying_registration",
    auction: "nonqualifying_auction",
    commerce: "nonqualifying_commerce"
  };
  if (purposeMap[purpose]) return { paymentClass: purposeMap[purpose], source: "purpose_metadata" };
  if (metadata.parish_id && (metadata.gift_type || metadata.donor_email || metadata.amount_cents)) {
    return { paymentClass: "qualifying_donation", source: "legacy_donation_metadata" };
  }
  return { paymentClass: "unclassified", source: "no_agapay_classification" };
}
