// src/lib/commerce-readiness.js
//
// Parish+ / Bookstore seller-identity and tax-readiness checks (Phase 2
// plan section 9). This module is READ-ONLY with respect to the existing
// direct-charge bookstore architecture -- it does not change
// resolveDonorBookstoreParish() or handleDonorBookstore() in
// src/handlers/donor.js, and it does not gate checkout by default.
//
// Staged enforcement, via three env flags (Phase 3B):
//   - PARISH_COMMERCE_READINESS_ENABLED: turns the checklist itself on/off
//     (display only when unset/false -- default is effectively "off" but
//     the checklist function always works so the dashboard can render it
//     for informational purposes regardless).
//   - PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW: newly-enabling parishes
//     (bookstoreEnabled being turned on for the first time) may be
//     required to complete the checklist before Bookstore Payments turns
//     on, behind this flag.
//   - PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL: only after an announced
//     remediation window -- existing already-enabled parishes could be
//     required to complete the checklist too. Never flipped on abruptly by
//     this code; this flag exists so Joel can turn it on deliberately once
//     that remediation window has actually happened, not something this
//     phase enables by default.
//
// isBookstoreReadinessEnforced() below is the single function any future
// checkout-gating code should call -- it encodes the staged rollout logic
// in one place rather than scattering flag checks.

/**
 * @param {object} env
 * @param {{ isNewlyEnabling: boolean }} context
 * @returns {boolean}
 */
export function isBookstoreReadinessEnforced(env = {}, { isNewlyEnabling = false } = {}) {
  const enabled = String(env.PARISH_COMMERCE_READINESS_ENABLED || "").toLowerCase() === "true";
  if (!enabled) return false;
  if (isNewlyEnabling) {
    return String(env.PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW || "").toLowerCase() === "true";
  }
  return String(env.PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL || "").toLowerCase() === "true";
}


/**
 * @param {object} registration
 * @returns {{ key: string, label: string, met: boolean }[]}
 */
export function bookstoreReadinessChecklist(registration = {}) {
  return [
    {
      key: "connected_account",
      label: "Stripe connected account created",
      met: Boolean(registration.stripeAccountId)
    },
    {
      key: "charges_enabled",
      label: "Stripe charges enabled",
      met: Boolean(registration.stripeChargesEnabled)
    },
    {
      key: "payouts_enabled",
      label: "Stripe payouts enabled",
      met: Boolean(registration.stripePayoutsEnabled)
    },
    {
      key: "details_submitted",
      label: "Stripe account details submitted",
      met: Boolean(registration.stripeDetailsSubmitted)
    },
    {
      key: "seller_display_name",
      label: "Bookstore seller display name set",
      met: Boolean(registration.commerceSellerDisplayName || registration.parishName)
    },
    {
      key: "support_email",
      label: "Bookstore support email set",
      met: Boolean(registration.commerceSupportEmail)
    },
    {
      key: "refund_policy",
      label: "Refund policy provided",
      met: Boolean(registration.commerceRefundPolicyText)
    },
    {
      key: "fulfillment_policy",
      label: "Fulfillment / pickup policy provided",
      met: Boolean(registration.commerceFulfillmentPolicyText)
    },
    {
      key: "tax_responsibility_acknowledged",
      label: "Parish acknowledged responsibility for its own bookstore tax collection/filing",
      met: Boolean(registration.commerceTaxResponsibilityAcknowledged)
    },
    {
      key: "merchant_of_record_acknowledged",
      label: "Parish acknowledged it is merchant of record for commerce sales",
      met: Boolean(registration.commerceMerchantOfRecordAcknowledged)
    },
    {
      key: "commerce_terms_accepted",
      label: "Parish-specific commerce terms accepted",
      met: Boolean(registration.commerceTermsAcceptedAt)
    }
  ];
}

export function bookstoreReadinessSummary(registration = {}) {
  const checklist = bookstoreReadinessChecklist(registration);
  const unmet = checklist.filter((item) => !item.met);
  return { ready: unmet.length === 0, checklist, unmetCount: unmet.length };
}

/**
 * Customer-facing seller disclosure. Placement plan (storefront, cart,
 * checkout handoff, order confirmation, receipt, refund email) is
 * documented in the Phase 2 plan section 9 -- this pass wires it into the
 * bookstore checkout session's line item description (the one
 * AGAPAY-controlled surface every path already passes through) as the
 * first concrete placement; the remaining storefront/cart/email surfaces
 * are a documented follow-up, not silently skipped.
 */
export function bookstoreSellerDisclosure(parishDisplayName) {
  const name = String(parishDisplayName || "this parish").trim();
  return `Sold by ${name}. ${name} is the seller and merchant of record. AGAPAY provides the software used by the parish. Payments are processed through Stripe.`;
}
