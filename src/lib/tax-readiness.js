// Tax readiness gate -- separates canonical (ministry) verification from
// AGAPAY's own billing/tax jurisdiction readiness. A parish can be fully
// canonically verified and still correctly blocked from paid subscription
// checkout until AGAPAY has manually reviewed whether Stripe Tax is ready
// for that parish's jurisdiction.
//
// This is deliberately NOT a tax engine and makes no jurisdictional legal
// conclusions on its own -- every status transition here is a manual
// admin decision (see the admin PATCH handler in src/handlers/admin.js).
//
// Storage note: registrations are stored as a single JSON blob (D1 `data`
// column / KV value), not as individual structured columns -- see
// saveRegistrationRecord()/loadRegistrationByReference() in
// src/handlers/parish.js. These new fields are just additional properties
// on that same object; no migration is needed to add them, and old
// registrations that predate this feature simply don't have them yet --
// withTaxReadinessDefaults() below is what makes that safe everywhere.

export const TAX_READINESS_STATUSES = [
  "tax_not_required_yet",
  "tax_needs_review",
  "tax_registration_pending",
  "tax_ready_for_checkout",
  "tax_blocked"
];

export const TAX_READINESS_LABELS = {
  tax_needs_review: "Needs review",
  tax_registration_pending: "Registration pending",
  tax_ready_for_checkout: "Ready for checkout",
  tax_not_required_yet: "Not required yet",
  tax_blocked: "Blocked"
};

export const DEFAULT_TAX_READINESS_STATUS = "tax_needs_review";

// line2 is intentionally not required -- many church addresses are a
// single line (PO box or street address with no suite/unit).
const REQUIRED_BILLING_FIELDS = [
  "billingLegalName",
  "billingAddressLine1",
  "billingCity",
  "billingState",
  "billingPostalCode",
  "billingCountry"
];

const ALL_BILLING_FIELDS = [
  "billingLegalName",
  "billingAddressLine1",
  "billingAddressLine2",
  "billingCity",
  "billingState",
  "billingPostalCode",
  "billingCountry"
];

/**
 * Returns a NEW object with safe defaults for any missing tax-readiness /
 * billing fields, without ever overwriting a value that's already set.
 * Never mutates the input and never persists anything -- purely a
 * read/display-time normalization helper. Existing registration data is
 * never deleted or altered by this function.
 */
export function withTaxReadinessDefaults(registration = {}) {
  const next = { ...registration };
  if (!TAX_READINESS_STATUSES.includes(next.taxReadinessStatus)) {
    next.taxReadinessStatus = DEFAULT_TAX_READINESS_STATUS;
  }
  next.taxReadinessReviewedAt = next.taxReadinessReviewedAt || "";
  next.taxReadinessReviewedBy = next.taxReadinessReviewedBy || "";
  next.taxReadinessNotes = next.taxReadinessNotes || "";
  for (const field of ALL_BILLING_FIELDS) {
    next[field] = next[field] || "";
  }
  return next;
}

/** True only if every required billing field is present and non-blank. */
export function hasCompleteBillingAddress(registration = {}) {
  return REQUIRED_BILLING_FIELDS.every((field) => String(registration[field] || "").trim().length > 0);
}

/**
 * The actual pre-checkout gate. Call this AFTER any free-tier early
 * return (free/non-billable tiers never reach this -- see
 * src/lib/subscription-checkout.js) and BEFORE creating a Stripe
 * Customer or Checkout Session.
 *
 * Returns { ok: true } if checkout may proceed, or
 * { ok: false, status, body } with a ready-to-return JSON body if not.
 */
export function taxReadinessCheckoutGate(registration = {}) {
  if (registration.status !== "verified") {
    return {
      ok: false,
      status: 403,
      body: {
        error: "This parish must be canonically verified before subscription checkout can be created.",
        code: "not_verified"
      }
    };
  }

  if (!hasCompleteBillingAddress(registration)) {
    return {
      ok: false,
      status: 422,
      body: {
        error: "Billing address required before subscription checkout.",
        code: "billing_address_required"
      }
    };
  }

  const taxReadinessStatus = TAX_READINESS_STATUSES.includes(registration.taxReadinessStatus)
    ? registration.taxReadinessStatus
    : DEFAULT_TAX_READINESS_STATUS;

  if (taxReadinessStatus !== "tax_ready_for_checkout") {
    return {
      ok: false,
      status: 422,
      body: {
        error: "Subscription checkout is pending AGAPAY billing/tax review.",
        code: "tax_readiness_required",
        taxReadinessStatus
      }
    };
  }

  return { ok: true };
}
