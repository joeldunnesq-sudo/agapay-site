// Generated from src/lib/tax-codes.ts by npm run build:server. Do not edit.
const SUBSCRIPTION_TAX_CODES = {
  // AGAPAY Giving subscription fee.
  giving: '',
  // AGAPAY Parish+ subscription fee.
  parishPlus: '',
  // AGAPAY Learn subscription fee (household product, not a parish product —
  // flagged for its own, separate tax-classification review; do not assume
  // the same code as Giving/Parish+ is correct here).
  learn: '',
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
  stewardship: '',
};
function subscriptionTaxCode(productKey) {
  const code = SUBSCRIPTION_TAX_CODES[productKey];
  return typeof code === 'string' ? code : '';
}
function applySubscriptionTaxCode(form, prefix, productKey, env = {}) {
  const code = subscriptionTaxCode(productKey);
  const activated = String(env.SUBSCRIPTION_TAX_CODES_ENABLED || '').toLowerCase() === 'true';
  if (!code) {
    if (activated) {
      console.error('tax_code_missing_while_enabled', JSON.stringify({ productKey }));
      return { blocked: true };
    }
    console.log('tax_code_not_configured', JSON.stringify({ productKey }));
    return { blocked: false };
  }
  form.set(`${prefix}[tax_code]`, code);
  return { blocked: false };
}
function stewardshipTaxCodeReadiness(env = {}) {
  const activated = String(env.SUBSCRIPTION_TAX_CODES_ENABLED || '').toLowerCase() === 'true';
  const code = subscriptionTaxCode('stewardship');
  return {
    activated,
    codeConfigured: Boolean(code),
    // "ready" here means "nothing left for this code path to do in-app" --
    // it does NOT verify the live Stripe Product's actual tax_code (that
    // requires a GET /v1/products/{id} call against a real Stripe Price
    // env var, which is an operational verification step, not something
    // this pure function can determine).
    requiresManualStripeProductUpdate: activated && Boolean(code),
    note: "Stewardship's Stripe Product tax_code must be set directly (Dashboard or a one-time API call) once a code is approved -- it is never set through checkout-time code.",
  };
}
const NO_STATEWIDE_GENERAL_SALES_TAX_STATES = /* @__PURE__ */ new Set(['AK', 'DE', 'MT', 'NH', 'OR']);
function hasNoStatewideGeneralSalesTax(stateCode) {
  return NO_STATEWIDE_GENERAL_SALES_TAX_STATES.has(
    String(stateCode || '')
      .trim()
      .toUpperCase()
  );
}
const NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY = {
  AK: 'Alaska does not impose a statewide general sales tax, but local sales taxes may apply. AGAPAY and Stripe require the full service address to determine applicable treatment.',
  DE: 'Delaware does not impose a general customer sales tax. Other seller-side taxes or licensing obligations may still exist and are not resolved through this exemption request.',
  MT: 'Montana does not impose a statewide general sales tax. This is not the same as your organization being a tax-exempt customer.',
  NH: 'New Hampshire does not impose a statewide general sales tax. This is not the same as your organization being a tax-exempt customer.',
  OR: 'Oregon does not impose a statewide general sales tax. This is not the same as your organization being a tax-exempt customer.',
};
export {
  NO_STATEWIDE_GENERAL_SALES_TAX_STATES,
  NO_STATEWIDE_GENERAL_SALES_TAX_STATE_COPY,
  SUBSCRIPTION_TAX_CODES,
  applySubscriptionTaxCode,
  hasNoStatewideGeneralSalesTax,
  stewardshipTaxCodeReadiness,
  subscriptionTaxCode,
};
