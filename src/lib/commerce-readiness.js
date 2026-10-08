// Generated from src/lib/commerce-readiness.ts by npm run build:server. Do not edit.
function isBookstoreReadinessEnforced(env = {}, { isNewlyEnabling = false } = {}) {
  const enabled = String(env.PARISH_COMMERCE_READINESS_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) return false;
  if (isNewlyEnabling) {
    return String(env.PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW || '').toLowerCase() === 'true';
  }
  return String(env.PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL || '').toLowerCase() === 'true';
}
function bookstoreReadinessChecklist(registration = {}) {
  return [
    {
      key: 'connected_account',
      label: 'Stripe connected account created',
      met: Boolean(registration.stripeAccountId),
    },
    {
      key: 'charges_enabled',
      label: 'Stripe charges enabled',
      met: Boolean(registration.stripeChargesEnabled),
    },
    {
      key: 'payouts_enabled',
      label: 'Stripe payouts enabled',
      met: Boolean(registration.stripePayoutsEnabled),
    },
    {
      key: 'details_submitted',
      label: 'Stripe account details submitted',
      met: Boolean(registration.stripeDetailsSubmitted),
    },
    {
      key: 'seller_display_name',
      label: 'Bookstore seller display name set',
      met: Boolean(registration.commerceSellerDisplayName || registration.parishName),
    },
    {
      key: 'support_email',
      label: 'Bookstore support email set',
      met: Boolean(registration.commerceSupportEmail),
    },
    {
      key: 'refund_policy',
      label: 'Refund policy provided',
      met: Boolean(registration.commerceRefundPolicyText),
    },
    {
      key: 'fulfillment_policy',
      label: 'Fulfillment / pickup policy provided',
      met: Boolean(registration.commerceFulfillmentPolicyText),
    },
    {
      key: 'tax_responsibility_acknowledged',
      label: 'Parish acknowledged responsibility for its own bookstore tax collection/filing',
      met: Boolean(registration.commerceTaxResponsibilityAcknowledged),
    },
    {
      key: 'merchant_of_record_acknowledged',
      label: 'Parish acknowledged it is merchant of record for commerce sales',
      met: Boolean(registration.commerceMerchantOfRecordAcknowledged),
    },
    {
      key: 'commerce_terms_accepted',
      label: 'Parish-specific commerce terms accepted',
      met: Boolean(registration.commerceTermsAcceptedAt),
    },
  ];
}
function bookstoreReadinessSummary(registration = {}) {
  const checklist = bookstoreReadinessChecklist(registration);
  const unmet = checklist.filter((item) => !item.met);
  return { ready: unmet.length === 0, checklist, unmetCount: unmet.length };
}
function bookstoreSellerDisclosure(parishDisplayName) {
  const name = String(parishDisplayName || 'this parish').trim();
  return `Sold by ${name}. ${name} is the seller and merchant of record. AGAPAY provides the software used by the parish. Payments are processed through Stripe.`;
}
export {
  bookstoreReadinessChecklist,
  bookstoreReadinessSummary,
  bookstoreSellerDisclosure,
  isBookstoreReadinessEnforced,
};
