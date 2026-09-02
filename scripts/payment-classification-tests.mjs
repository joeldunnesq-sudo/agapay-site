import assert from 'node:assert/strict';

import { ORGANIZATION_TYPES } from '../src/organizations/types.js';
import {
  classifyAccountingSourceType,
  classifyPayment,
  classifyPaymentMetadata,
  COMMERCE_ACCOUNTING_SOURCE_TYPES,
  DONATION_ACCOUNTING_SOURCE_TYPES,
  PAYMENT_AVAILABILITY,
  PAYMENT_COMPONENTS,
  PAYMENT_PURPOSES,
  paymentMetadataForPurpose,
  RESERVED_TUITION_ACCOUNTING_SOURCE_TYPES,
} from '../src/payments/classification.js';

const churchDonation = classifyPayment({
  purpose: PAYMENT_PURPOSES.DONATION,
  organizationType: ORGANIZATION_TYPES.CHURCH,
});
assert.equal(churchDonation.availability, PAYMENT_AVAILABILITY.ACTIVE);
assert.equal(churchDonation.organizationEligible, true);
assert.equal(churchDonation.accountingFamily, 'giving');
assert.equal(churchDonation.settlementProfileKind, 'giving');
assert.equal(churchDonation.charitableStatus, 'not_inferred');
assert.equal(churchDonation.taxTreatment, 'not_inferred');
assert.equal(Object.isFrozen(churchDonation), true);

const futureMinistryDonation = classifyPayment({
  purpose: PAYMENT_PURPOSES.DONATION,
  organizationType: ORGANIZATION_TYPES.MINISTRY,
});
assert.equal(futureMinistryDonation.availability, PAYMENT_AVAILABILITY.RESERVED);
assert.equal(futureMinistryDonation.organizationEligible, false);

const futureSchoolTuition = classifyPayment({
  purpose: PAYMENT_PURPOSES.TUITION,
  organizationType: ORGANIZATION_TYPES.SCHOOL,
});
assert.equal(futureSchoolTuition.paymentClass, 'nonqualifying_tuition');
assert.equal(futureSchoolTuition.accountingFamily, 'tuition');
assert.equal(futureSchoolTuition.settlementProfileKind, 'tuition');
assert.equal(futureSchoolTuition.availability, PAYMENT_AVAILABILITY.RESERVED);
assert.equal(futureSchoolTuition.organizationEligible, false);

assert.equal(
  classifyPayment({ purpose: PAYMENT_PURPOSES.COMMERCE }).availability,
  PAYMENT_AVAILABILITY.CONTEXT_REQUIRED
);
assert.equal(
  classifyPayment({ purpose: 'invented-purpose', organizationType: ORGANIZATION_TYPES.CHURCH }).availability,
  PAYMENT_AVAILABILITY.UNSUPPORTED
);

assert.deepEqual(paymentMetadataForPurpose(PAYMENT_PURPOSES.DONATION), {
  agapay_payment_purpose: 'donation',
  agapay_payment_class: 'qualifying_donation',
  agapay_classification_version: '1',
});
assert.deepEqual(paymentMetadataForPurpose(PAYMENT_PURPOSES.COMMERCE), {
  agapay_payment_purpose: 'commerce',
  agapay_payment_class: 'nonqualifying_commerce',
  agapay_classification_version: '1',
});
assert.deepEqual(paymentMetadataForPurpose('invented-purpose'), {});

const canonicalMetadata = classifyPaymentMetadata(
  {
    agapay_payment_purpose: 'donation',
    agapay_payment_class: 'nonqualifying_commerce',
    agapay_classification_version: '1',
  },
  { organizationType: ORGANIZATION_TYPES.CHURCH }
);
assert.equal(canonicalMetadata.purpose, PAYMENT_PURPOSES.DONATION);
assert.equal(canonicalMetadata.paymentClass, 'qualifying_donation');
assert.equal(canonicalMetadata.source, 'agapay_purpose_metadata');
assert.equal(canonicalMetadata.organizationEligible, true);
assert.equal(
  classifyPaymentMetadata({
    agapay_payment_purpose: 'donation',
    agapay_payment_class: 'nonqualifying_commerce',
    agapay_classification_version: '999',
  }).purpose,
  PAYMENT_PURPOSES.COMMERCE
);

assert.equal(classifyPaymentMetadata({ commerce_module: 'bookstore' }).purpose, PAYMENT_PURPOSES.COMMERCE);
assert.equal(
  classifyPaymentMetadata({ parish_id: 'church-1', gift_type: 'stewardship' }).purpose,
  PAYMENT_PURPOSES.DONATION
);
assert.equal(classifyPaymentMetadata({ payment_purpose: 'tuition' }).availability, PAYMENT_AVAILABILITY.RESERVED);

const processorFee = classifyAccountingSourceType('stripe_fee_assessed', {
  organizationType: ORGANIZATION_TYPES.CHURCH,
});
assert.equal(processorFee.purpose, PAYMENT_PURPOSES.DONATION);
assert.equal(processorFee.component, PAYMENT_COMPONENTS.PROCESSOR_FEE);
assert.equal(processorFee.organizationEligible, true);

const legacyPlatformFee = classifyAccountingSourceType('agapay_fee_assessed', {
  organizationType: ORGANIZATION_TYPES.CHURCH,
});
assert.equal(legacyPlatformFee.purpose, PAYMENT_PURPOSES.DONATION);
assert.equal(legacyPlatformFee.component, PAYMENT_COMPONENTS.PLATFORM_FEE);
assert.notEqual(legacyPlatformFee.component, PAYMENT_COMPONENTS.PRINCIPAL);

assert.equal(classifyAccountingSourceType('commerce_fee_assessed').component, PAYMENT_COMPONENTS.PROCESSOR_FEE);
assert.equal(
  classifyAccountingSourceType('tuition_payment_succeeded', {
    organizationType: ORGANIZATION_TYPES.SCHOOL,
  }).organizationEligible,
  false
);
assert.equal(classifyAccountingSourceType('unrecognized_source').availability, PAYMENT_AVAILABILITY.UNSUPPORTED);

assert.equal(DONATION_ACCOUNTING_SOURCE_TYPES.includes('donation_succeeded'), true);
assert.equal(DONATION_ACCOUNTING_SOURCE_TYPES.includes('stripe_fee_assessed'), true);
assert.equal(COMMERCE_ACCOUNTING_SOURCE_TYPES.includes('commerce_sale_completed'), true);
assert.equal(COMMERCE_ACCOUNTING_SOURCE_TYPES.includes('commerce_fee_assessed'), true);
assert.equal(RESERVED_TUITION_ACCOUNTING_SOURCE_TYPES.includes('tuition_payment_succeeded'), true);
assert.equal(DONATION_ACCOUNTING_SOURCE_TYPES.includes('tuition_payment_succeeded'), false);
assert.equal(COMMERCE_ACCOUNTING_SOURCE_TYPES.includes('tuition_payment_succeeded'), false);

console.log('Payment classification tests passed.');
