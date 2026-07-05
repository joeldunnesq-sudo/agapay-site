// src/lib/tax-codes.js
//
// Centralized, non-scattered configuration for two related but distinct
// concerns:
//
// 1. SUBSCRIPTION_TAX_CODES — the Stripe Tax product tax code AGAPAY assigns
//    to each of its own subscription products (Giving/Parish+, Learn,
//    Stewardship). These are intentionally blank until AGAPAY's CPA/tax
//    adviser signs off on final values — see the Phase 2 audit
//    (docs/reports/tax-exemption-phase2-plan-2026-07-05.md, section 7).
//    Leaving a code blank is a safe no-op: callers must treat a missing code
//    as "omit tax_code from this line item," never as an error that blocks
//    checkout.
//
// 2. NO_STATEWIDE_GENERAL_SALES_TAX_STATES — states with no statewide
//    general sales tax (Alaska, Delaware, Montana, New Hampshire, Oregon).
//    This is purely descriptive of these states' tax regimes. It must NEVER
//    be used, by itself, to:
//      - create a tax-exemption claim,
//      - set a Stripe Customer's tax_exempt field,
//      - skip collecting a full address,
//      - or bypass Stripe Tax.
//    A parish in one of these states is not automatically a tax-exempt
//    customer. See src/lib/tax-exemption.js for how this set is actually
//    used (informational UI copy only).

/**
 * @typedef {"giving" | "parishPlus" | "learn" | "stewardship"} SubscriptionProductKey
 */

/** @type {Record<SubscriptionProductKey, string>} */
export const SUBSCRIPTION_TAX_CODES = {
  // AGAPAY Giving subscription fee.
  giving: "",
  // AGAPAY Parish+ subscription fee.
  parishPlus: "",
  // AGAPAY Learn subscription fee (household product, not a parish product —
  // flagged for its own, separate tax-classification review; do not assume
  // the same code as Giving/Parish+ is correct here).
  learn: "",
  // Stewardship Suite subscription fee. NOTE: Stewardship checkout
  // (src/handlers/stewardship.js) references a persisted Stripe `price` id
  // (STEWARDSHIP_STRIPE_PRICE_MONTHLY / _ANNUAL) rather than inline
  // `price_data`, so this code cannot be attached per-checkout the way the
  // other three can — Stripe does not accept `tax_code` alongside a `price`
  // reference. Once a final code is approved, it must be set directly on
  // the underlying Stripe Product via the Dashboard or a one-time API call,
  // not through this constant at checkout time. This entry exists so the
  // four products are documented in one place, not so it gets read at
  // runtime for Stewardship checkout.
  stewardship: ""
};

/**
 * Returns the tax code for a subscription product, or "" if none is
 * configured yet. Callers must treat "" as "omit tax_code" — never throw,
 * never block checkout, on a missing code.
 * @param {SubscriptionProductKey} productKey
 * @returns {string}
 */
export function subscriptionTaxCode(productKey) {
  const code = SUBSCRIPTION_TAX_CODES[productKey];
  return typeof code === "string" ? code : "";
}

/**
 * Applies a product's configured tax code to a Stripe form-encoded
 * `price_data[product_data]` line item, if and only if a code is
 * configured. Safe no-op otherwise. `prefix` is the line-item's
 * `price_data[product_data]` form-field prefix, e.g.
 * `line_items[0][price_data][product_data]`.
 *
 * Two distinct modes, gated by env.SUBSCRIPTION_TAX_CODES_ENABLED:
 *   - Before activation (flag unset/false): current behavior is preserved
 *     exactly -- a missing code is a soft no-op, logged, never blocks
 *     checkout.
 *   - After activation (flag === "true"): a missing/blank code for an
 *     applicable product is a hard block -- returns { blocked: true } so
 *     the caller can refuse checkout with a user-safe billing-
 *     configuration message instead of silently falling back to Stripe's
 *     account-default tax category.
 *
 * @param {URLSearchParams} form
 * @param {string} prefix
 * @param {SubscriptionProductKey} productKey
 * @param {object} env
 * @returns {{ blocked: boolean }}
 */
export function applySubscriptionTaxCode(form, prefix, productKey, env = {}) {
  const code = subscriptionTaxCode(productKey);
  const activated = String(env.SUBSCRIPTION_TAX_CODES_ENABLED || "").toLowerCase() === "true";

  if (!code) {
    if (activated) {
      console.error("tax_code_missing_while_enabled", JSON.stringify({ productKey }));
      return { blocked: true };
    }
    console.log("tax_code_not_configured", JSON.stringify({ productKey }));
    return { blocked: false };
  }

  form.set(`${prefix}[tax_code]`, code);
  return { blocked: false };
}

/**
 * Readiness check for Stewardship specifically -- its checkout references
 * a persisted Stripe `price` id rather than inline `price_data`, so its
 * tax code cannot be passed per-checkout like the other three products; it
 * must be set directly on the underlying Stripe Product. This function
 * only reports readiness (for an admin operational-readiness view); it
 * never mutates the Stripe Product itself.
 */
export function stewardshipTaxCodeReadiness(env = {}) {
  const activated = String(env.SUBSCRIPTION_TAX_CODES_ENABLED || "").toLowerCase() === "true";
  const code = subscriptionTaxCode("stewardship");
  return {
    activated,
    codeConfigured: Boolean(code),
    // "ready" here means "nothing left for this code path to do in-app" --
    // it does NOT verify the live Stripe Product's actual tax_code (that
    // requires a GET /v1/products/{id} call against a real Stripe Price
    // env var, which is an operational verification step, not something
    // this pure function can determine).
    requiresManualStripeProductUpdate: activated && Boolean(code),
    note: "Stewardship's Stripe Product tax_code must be set directly (Dashboard or a one-time API call) once a code is approved -- it is never set through checkout-time code."
  };
}

// States with no statewide general sales tax. Purely descriptive — see the
// file-level note above for what this set must NEVER be used for.
export const NO_STATEWIDE_GENERAL_SALES_TAX_STATES = new Set([
  "AK",
  "DE",
  "MT",
  "NH",
  "OR"
]);

/**
 * @param {string} stateCode Two-letter US state code.
 * @returns {boolean}
 */
export function hasNoStatewideGeneralSalesTax(stateCode) {
  return NO_STATEWIDE_GENERAL_SALES_TAX_STATES.has(String(stateCode || "").trim().toUpperCase());
}

// Per-state informational copy shown in the registration/dashboard UI when
// hasNoStatewideGeneralSalesTax() is true for the organization's state. This
// is display text only; it has no bearing on server-side exemption logic.
export const NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY = {
  AK: "Alaska does not impose a statewide general sales tax, but local sales taxes may apply. AGAPAY and Stripe require the full service address to determine applicable treatment.",
  DE: "Delaware does not impose a general customer sales tax. Other seller-side taxes or licensing obligations may still exist and are not resolved through this exemption request.",
  MT: "Montana does not impose a statewide general sales tax. This is not the same as your organization being a tax-exempt customer.",
  NH: "New Hampshire does not impose a statewide general sales tax. This is not the same as your organization being a tax-exempt customer.",
  OR: "Oregon does not impose a statewide general sales tax. This is not the same as your organization being a tax-exempt customer."
};
