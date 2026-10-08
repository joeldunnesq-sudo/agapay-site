// Generated from src/lib/tax-readiness.ts by npm run build:server. Do not edit.
const TAX_READINESS_STATUSES = [
  'tax_not_required_yet',
  'tax_needs_review',
  'tax_registration_pending',
  'tax_ready_for_checkout',
  'tax_blocked',
];
const TAX_READINESS_LABELS = {
  tax_needs_review: 'Needs review',
  tax_registration_pending: 'Registration pending',
  tax_ready_for_checkout: 'Ready for checkout',
  tax_not_required_yet: 'Not required yet',
  tax_blocked: 'Blocked',
};
const DEFAULT_TAX_READINESS_STATUS = 'tax_needs_review';
const REQUIRED_BILLING_FIELDS = [
  'billingLegalName',
  'billingAddressLine1',
  'billingCity',
  'billingState',
  'billingPostalCode',
  'billingCountry',
];
const ALL_BILLING_FIELDS = [
  'billingLegalName',
  'billingAddressLine1',
  'billingAddressLine2',
  'billingCity',
  'billingState',
  'billingPostalCode',
  'billingCountry',
];
const BILLING_REGISTRATION_FALLBACKS = Object.freeze({
  billingLegalName: ['taxLegalName', 'parishName'],
  billingAddressLine1: ['addressLine1'],
  billingAddressLine2: ['addressLine2'],
  billingCity: ['city'],
  billingState: ['state'],
  billingPostalCode: ['postalCode'],
  billingCountry: ['country'],
});
function firstNonBlank(...values) {
  return values.find((value) => String(value || '').trim().length > 0) || '';
}
function withTaxReadinessDefaults(registration = {}) {
  const next = { ...registration };
  if (!TAX_READINESS_STATUSES.includes(next.taxReadinessStatus)) {
    next.taxReadinessStatus = DEFAULT_TAX_READINESS_STATUS;
  }
  next.taxReadinessReviewedAt = next.taxReadinessReviewedAt || '';
  next.taxReadinessReviewedBy = next.taxReadinessReviewedBy || '';
  next.taxReadinessNotes = next.taxReadinessNotes || '';
  for (const field of ALL_BILLING_FIELDS) {
    const fallbacks = (BILLING_REGISTRATION_FALLBACKS[field] || []).map((fallbackField) => next[fallbackField]);
    next[field] = firstNonBlank(next[field], ...fallbacks);
  }
  if (!next.billingCountry && next.billingAddressLine1) next.billingCountry = 'US';
  return next;
}
function hasCompleteBillingAddress(registration = {}) {
  const normalized = withTaxReadinessDefaults(registration);
  return REQUIRED_BILLING_FIELDS.every((field) => String(normalized[field] || '').trim().length > 0);
}
function subscriptionCheckoutReadinessGate(registration = {}) {
  if (registration.status !== 'verified') {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'This parish must be canonically verified before subscription checkout can be created.',
        code: 'not_verified',
      },
    };
  }
  if (!hasCompleteBillingAddress(registration)) {
    return {
      ok: false,
      status: 422,
      body: {
        error: 'Billing address required before subscription checkout.',
        code: 'billing_address_required',
      },
    };
  }
  return { ok: true };
}
export {
  DEFAULT_TAX_READINESS_STATUS,
  TAX_READINESS_LABELS,
  TAX_READINESS_STATUSES,
  hasCompleteBillingAddress,
  subscriptionCheckoutReadinessGate,
  withTaxReadinessDefaults,
};
