import { ORGANIZATION_TYPES } from '../organizations/types.js';

export const PAYMENT_CLASSIFICATION_VERSION = 1;

export const PAYMENT_PURPOSES = Object.freeze({
  DONATION: 'donation',
  COMMERCE: 'commerce',
  TUITION: 'tuition',
  PLATFORM_SUBSCRIPTION: 'platform_subscription',
  UNKNOWN: 'unknown',
});

export const PAYMENT_COMPONENTS = Object.freeze({
  PRINCIPAL: 'principal',
  PROCESSOR_FEE: 'processor_fee',
  PLATFORM_FEE: 'platform_fee',
  FEE_REFUND: 'fee_refund',
  REFUND: 'refund',
  DISPUTE: 'dispute',
  PAYOUT: 'payout',
});

export const PAYMENT_AVAILABILITY = Object.freeze({
  ACTIVE: 'active',
  RESERVED: 'reserved',
  CONTEXT_REQUIRED: 'context_required',
  UNSUPPORTED: 'unsupported',
});

export const STRIPE_PAYMENT_CLASSES = Object.freeze([
  'qualifying_donation',
  'nonqualifying_commerce',
  'nonqualifying_membership',
  'nonqualifying_tuition',
  'nonqualifying_ticket',
  'nonqualifying_registration',
  'nonqualifying_auction',
  'nonqualifying_other',
  'unclassified',
]);

const PAYMENT_CLASS_SET = new Set(STRIPE_PAYMENT_CLASSES);
const PAYMENT_COMPONENT_SET = new Set(Object.values(PAYMENT_COMPONENTS));
const CURRENT_ORGANIZATION_TYPES = new Set([
  ORGANIZATION_TYPES.CHURCH,
  ORGANIZATION_TYPES.MONASTERY,
  ORGANIZATION_TYPES.DIOCESE,
]);

const PURPOSE_DEFINITIONS = Object.freeze({
  [PAYMENT_PURPOSES.DONATION]: Object.freeze({
    paymentClass: 'qualifying_donation',
    accountingFamily: 'giving',
    settlementProfileKind: 'giving',
  }),
  [PAYMENT_PURPOSES.COMMERCE]: Object.freeze({
    paymentClass: 'nonqualifying_commerce',
    accountingFamily: 'commerce',
    settlementProfileKind: 'commerce',
  }),
  [PAYMENT_PURPOSES.TUITION]: Object.freeze({
    paymentClass: 'nonqualifying_tuition',
    accountingFamily: 'tuition',
    settlementProfileKind: 'tuition',
  }),
  [PAYMENT_PURPOSES.PLATFORM_SUBSCRIPTION]: Object.freeze({
    paymentClass: 'nonqualifying_membership',
    accountingFamily: 'platform',
    settlementProfileKind: 'none',
  }),
  [PAYMENT_PURPOSES.UNKNOWN]: Object.freeze({
    paymentClass: 'unclassified',
    accountingFamily: 'unknown',
    settlementProfileKind: 'none',
  }),
});

const PAYMENT_CLASS_PURPOSES = Object.freeze({
  qualifying_donation: PAYMENT_PURPOSES.DONATION,
  nonqualifying_commerce: PAYMENT_PURPOSES.COMMERCE,
  nonqualifying_membership: PAYMENT_PURPOSES.PLATFORM_SUBSCRIPTION,
  nonqualifying_tuition: PAYMENT_PURPOSES.TUITION,
  nonqualifying_ticket: PAYMENT_PURPOSES.COMMERCE,
  nonqualifying_registration: PAYMENT_PURPOSES.COMMERCE,
  nonqualifying_auction: PAYMENT_PURPOSES.COMMERCE,
  nonqualifying_other: PAYMENT_PURPOSES.COMMERCE,
  unclassified: PAYMENT_PURPOSES.UNKNOWN,
});

const LEGACY_PAYMENT_CLASS_ALIASES = Object.freeze({
  donation: 'qualifying_donation',
  non_donation_commerce: 'nonqualifying_commerce',
  non_donation_membership: 'nonqualifying_membership',
  non_donation_tuition: 'nonqualifying_tuition',
  non_donation_ticket: 'nonqualifying_ticket',
  non_donation_registration: 'nonqualifying_registration',
  non_donation_auction: 'nonqualifying_auction',
  non_donation_other: 'nonqualifying_other',
});

const PURPOSE_METADATA_ALIASES = Object.freeze({
  donation: PAYMENT_PURPOSES.DONATION,
  gift: PAYMENT_PURPOSES.DONATION,
  offering: PAYMENT_PURPOSES.DONATION,
  commerce: PAYMENT_PURPOSES.COMMERCE,
  membership: PAYMENT_PURPOSES.PLATFORM_SUBSCRIPTION,
  platform_subscription: PAYMENT_PURPOSES.PLATFORM_SUBSCRIPTION,
  tuition: PAYMENT_PURPOSES.TUITION,
  ticket: PAYMENT_PURPOSES.COMMERCE,
  registration: PAYMENT_PURPOSES.COMMERCE,
  auction: PAYMENT_PURPOSES.COMMERCE,
});

const ACCOUNTING_SOURCE_CLASSIFICATIONS = Object.freeze({
  donation_succeeded: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.PRINCIPAL],
  stripe_fee_assessed: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.PROCESSOR_FEE],
  agapay_fee_assessed: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.PLATFORM_FEE],
  stripe_fee_refunded: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.FEE_REFUND],
  donation_refunded: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.REFUND],
  donation_partially_refunded: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.REFUND],
  stripe_dispute_created: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.DISPUTE],
  stripe_dispute_won: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.DISPUTE],
  stripe_dispute_lost: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.DISPUTE],
  stripe_chargeback_fee: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.PROCESSOR_FEE],
  stripe_payout_paid: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.PAYOUT],
  stripe_payout_failed: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.PAYOUT],
  stripe_payout_canceled: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.PAYOUT],
  stripe_payout_reversed: [PAYMENT_PURPOSES.DONATION, PAYMENT_COMPONENTS.PAYOUT],
  commerce_sale_completed: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.PRINCIPAL],
  commerce_sale_partially_refunded: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.REFUND],
  commerce_sale_refunded: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.REFUND],
  commerce_sale_canceled: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.REFUND],
  commerce_fee_assessed: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.PROCESSOR_FEE],
  commerce_fee_refunded: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.FEE_REFUND],
  commerce_dispute_created: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.DISPUTE],
  commerce_dispute_won: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.DISPUTE],
  commerce_dispute_lost: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.DISPUTE],
  commerce_chargeback_fee: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.PROCESSOR_FEE],
  commerce_payout_paid: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.PAYOUT],
  commerce_payout_failed: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.PAYOUT],
  commerce_payout_reversed: [PAYMENT_PURPOSES.COMMERCE, PAYMENT_COMPONENTS.PAYOUT],
  tuition_payment_succeeded: [PAYMENT_PURPOSES.TUITION, PAYMENT_COMPONENTS.PRINCIPAL],
  tuition_payment_refunded: [PAYMENT_PURPOSES.TUITION, PAYMENT_COMPONENTS.REFUND],
  tuition_fee_assessed: [PAYMENT_PURPOSES.TUITION, PAYMENT_COMPONENTS.PROCESSOR_FEE],
});

function normalized(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function paymentAvailability(purpose, organizationType) {
  if (purpose === PAYMENT_PURPOSES.UNKNOWN) return PAYMENT_AVAILABILITY.UNSUPPORTED;
  if (purpose === PAYMENT_PURPOSES.TUITION) return PAYMENT_AVAILABILITY.RESERVED;
  if (purpose === PAYMENT_PURPOSES.PLATFORM_SUBSCRIPTION) return PAYMENT_AVAILABILITY.ACTIVE;
  if (!organizationType) return PAYMENT_AVAILABILITY.CONTEXT_REQUIRED;
  return CURRENT_ORGANIZATION_TYPES.has(organizationType) ? PAYMENT_AVAILABILITY.ACTIVE : PAYMENT_AVAILABILITY.RESERVED;
}

export function classifyPayment({
  purpose,
  component = PAYMENT_COMPONENTS.PRINCIPAL,
  organizationType = '',
  source = 'server_contract',
  paymentClass = '',
} = {}) {
  const normalizedPurpose = Object.hasOwn(PURPOSE_DEFINITIONS, normalized(purpose))
    ? normalized(purpose)
    : PAYMENT_PURPOSES.UNKNOWN;
  const normalizedComponent = PAYMENT_COMPONENT_SET.has(normalized(component))
    ? normalized(component)
    : PAYMENT_COMPONENTS.PRINCIPAL;
  const definition = PURPOSE_DEFINITIONS[normalizedPurpose];
  const explicitPaymentClass = normalized(paymentClass);
  const resolvedPaymentClass =
    PAYMENT_CLASS_SET.has(explicitPaymentClass) && PAYMENT_CLASS_PURPOSES[explicitPaymentClass] === normalizedPurpose
      ? explicitPaymentClass
      : definition.paymentClass;
  const availability = paymentAvailability(normalizedPurpose, normalized(organizationType));
  return Object.freeze({
    schemaVersion: PAYMENT_CLASSIFICATION_VERSION,
    purpose: normalizedPurpose,
    component: normalizedComponent,
    paymentClass: resolvedPaymentClass,
    accountingFamily: definition.accountingFamily,
    settlementProfileKind: definition.settlementProfileKind,
    availability,
    organizationEligible: availability === PAYMENT_AVAILABILITY.ACTIVE,
    charitableStatus: 'not_inferred',
    taxTreatment: 'not_inferred',
    source: normalized(source) || 'server_contract',
  });
}

export function classifyPaymentMetadata(metadata = {}, { organizationType = '' } = {}) {
  const explicitPurpose = normalized(metadata.agapay_payment_purpose);
  const explicitVersion = Number(metadata.agapay_classification_version);
  if (
    explicitVersion === PAYMENT_CLASSIFICATION_VERSION &&
    Object.hasOwn(PURPOSE_DEFINITIONS, explicitPurpose) &&
    explicitPurpose !== PAYMENT_PURPOSES.UNKNOWN
  ) {
    return classifyPayment({
      purpose: explicitPurpose,
      organizationType,
      source: 'agapay_purpose_metadata',
      paymentClass: metadata.agapay_payment_class,
    });
  }

  const explicitClass = normalized(metadata.agapay_payment_class);
  const canonicalClass = PAYMENT_CLASS_SET.has(explicitClass)
    ? explicitClass
    : LEGACY_PAYMENT_CLASS_ALIASES[explicitClass];
  if (canonicalClass) {
    return classifyPayment({
      purpose: PAYMENT_CLASS_PURPOSES[canonicalClass],
      organizationType,
      source: PAYMENT_CLASS_SET.has(explicitClass) ? 'agapay_metadata' : 'agapay_metadata_legacy_alias',
      paymentClass: canonicalClass,
    });
  }

  if (metadata.commerce_module || normalized(metadata.order_id).startsWith('bookstore_')) {
    return classifyPayment({
      purpose: PAYMENT_PURPOSES.COMMERCE,
      organizationType,
      source: 'legacy_commerce_metadata',
    });
  }

  const aliasedPurpose = PURPOSE_METADATA_ALIASES[normalized(metadata.payment_purpose || metadata.transaction_type)];
  if (aliasedPurpose) {
    return classifyPayment({
      purpose: aliasedPurpose,
      organizationType,
      source: 'purpose_metadata',
    });
  }

  if (metadata.parish_id && (metadata.gift_type || metadata.donor_email || metadata.amount_cents)) {
    return classifyPayment({
      purpose: PAYMENT_PURPOSES.DONATION,
      organizationType,
      source: 'legacy_donation_metadata',
    });
  }

  return classifyPayment({ purpose: PAYMENT_PURPOSES.UNKNOWN, organizationType, source: 'no_agapay_classification' });
}

export function paymentMetadataForPurpose(purpose) {
  const classification = classifyPayment({ purpose });
  if (classification.purpose === PAYMENT_PURPOSES.UNKNOWN) return Object.freeze({});
  return Object.freeze({
    agapay_payment_purpose: classification.purpose,
    agapay_payment_class: classification.paymentClass,
    agapay_classification_version: String(PAYMENT_CLASSIFICATION_VERSION),
  });
}

export function classifyAccountingSourceType(sourceType, { organizationType = '' } = {}) {
  const source = normalized(sourceType);
  const [purpose, component] = ACCOUNTING_SOURCE_CLASSIFICATIONS[source] || [
    PAYMENT_PURPOSES.UNKNOWN,
    PAYMENT_COMPONENTS.PRINCIPAL,
  ];
  return classifyPayment({ purpose, component, organizationType, source: 'accounting_source_type' });
}

export const DONATION_ACCOUNTING_SOURCE_TYPES = Object.freeze(
  Object.entries(ACCOUNTING_SOURCE_CLASSIFICATIONS)
    .filter(([, [purpose]]) => purpose === PAYMENT_PURPOSES.DONATION)
    .map(([sourceType]) => sourceType)
);

export const COMMERCE_ACCOUNTING_SOURCE_TYPES = Object.freeze(
  Object.entries(ACCOUNTING_SOURCE_CLASSIFICATIONS)
    .filter(([, [purpose]]) => purpose === PAYMENT_PURPOSES.COMMERCE)
    .map(([sourceType]) => sourceType)
);

export const RESERVED_TUITION_ACCOUNTING_SOURCE_TYPES = Object.freeze(
  Object.entries(ACCOUNTING_SOURCE_CLASSIFICATIONS)
    .filter(([, [purpose]]) => purpose === PAYMENT_PURPOSES.TUITION)
    .map(([sourceType]) => sourceType)
);
