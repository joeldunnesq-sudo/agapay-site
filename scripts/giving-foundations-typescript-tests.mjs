import assert from 'node:assert/strict';
import * as fees from '../src/lib/payment-fees.js';
import * as stripe from '../src/lib/stripe-fees.js';
import * as domain from '../src/payments/classification.js';
import { classifyStripeCharge, STRIPE_PAYMENT_CLASSES } from '../src/lib/payment-classification.js';
import { offeringFeeBreakdown } from '../src/lib/offering-fee-breakdown.js';
import {
  BENEVOLENCE_FUND_DEFAULT,
  STEWARDSHIP_FUND_DEFAULTS,
  ensureBenevolenceFundInRegistration,
  mergeStewardshipFundsIntoRegistration,
} from '../src/lib/stewardship-funds.js';

// Verify public facade identity and the independent cent arithmetic, including
// rounding boundaries and the transition to the ACH cap. No Stripe requests.
assert.equal(stripe.offeringFeeBreakdown, offeringFeeBreakdown);
assert.equal(STRIPE_PAYMENT_CLASSES, domain.STRIPE_PAYMENT_CLASSES);
assert.ok(Object.isFrozen(fees.PAYMENT_FEE_SCHEDULES));
assert.ok(Object.isFrozen(fees.PAYMENT_FEE_SCHEDULES.card));
const published = fees.publicPaymentFeeSchedules();
assert.deepEqual(published, fees.PAYMENT_FEE_SCHEDULES);
published.card.rateBasisPoints = 999;
assert.equal(fees.PAYMENT_FEE_SCHEDULES.card.rateBasisPoints, 290);
for (let amount = 1; amount <= 100_000; amount += 1) {
  assert.equal(fees.estimateStripeAchFeeCents(amount), Math.min(500, Math.round((amount * 80) / 10_000)));
  assert.equal(fees.estimateStripeProcessingFeeCents(amount), Math.round((amount * 290) / 10_000) + 30);
}
for (const amount of [1, 2, 17, 18, 49, 50, 99, 100, 999, 10_000, 62_437, 62_438, 62_499, 62_500, 100_000, 5_000_000]) {
  for (const method of ['card', 'ach']) {
    const schedule = fees.paymentFeeSchedule(method);
    const covered = fees.checkoutFinancials(amount, true, false, method);
    const plain = fees.checkoutFinancials(amount, false, false, method);
    assert.deepEqual(stripe.checkoutFinancials(amount, true, false, method), covered);
    assert.equal(plain.chargeCents, amount);
    assert.equal(covered.agapayFeeCents, 0);
    assert.equal(covered.totalTransactionFeeCents, covered.estimatedStripeFeeCents);
    assert.ok(covered.chargeCents - covered.estimatedStripeFeeCents >= amount);
    assert.ok(
      covered.chargeCents === amount ||
        covered.chargeCents - 1 - fees.estimatePaymentFeeCents(covered.chargeCents - 1, schedule) < amount
    );
  }
}
for (const input of [undefined, null, '', 'invalid', -1, 0, NaN, Infinity, -Infinity]) {
  assert.equal(fees.estimateStripeAchFeeCents(input), 0);
  assert.equal(fees.estimateStripeProcessingFeeCents(input), 0);
  assert.equal(fees.grossUpForStripeProcessingFeeCents(input), 0);
  assert.equal(stripe.centsFromAmount(input), null);
}
for (const alias of ['ach', 'bank', 'bank_account', 'us_bank_account', ' ACH ']) {
  assert.equal(stripe.checkoutPaymentMethod(alias, false), 'ach');
  assert.equal(stripe.checkoutPaymentMethod(alias, true), 'card');
}
assert.equal(stripe.checkoutPaymentMethod('unknown', false), 'card');
assert.equal(stripe.centsFromAmount('0.01'), 1);
assert.equal(stripe.centsFromAmount('0.004'), null);
assert.equal(stripe.centsFromAmount('50000'), stripe.MAX_DONATION_CENTS);
assert.equal(stripe.centsFromAmount('50000.01'), null);
assert.equal(stripe.donationAmountError(50000.01), 'Amount exceeds the maximum allowed gift.');
assert.equal(stripe.donationAmountError(0), 'Amount must be greater than zero.');
assert.equal(stripe.donorName({ firstName: '  Ada ', lastName: ' Lovelace  ' }), 'Ada Lovelace');
assert.equal(stripe.donorName({}), '');
assert.equal(fees.estimatePaymentFeeCents(100, null), 0);
assert.equal(fees.grossUpForPaymentFeeCents(100, null), 100);
assert.equal(fees.estimatePaymentFeeCents(100, { rateBasisPoints: -1, fixedFeeCents: '3', maxFeeCents: '2' }), 2);
assert.equal(stripe.grossUpForAchFeeCents(100_000, 100), 100_600);
assert.equal(stripe.grossUpForStripeProcessingFeeCents('10000'), fees.grossUpForStripeProcessingFeeCents(10000));
assert.equal(stripe.estimateStripeProcessingFeeCents('10000'), 320);
assert.equal(stripe.estimateStripeAchFeeCents('10000'), 80);

// All supported purposes, components and organization contexts retain their
// conservative eligibility and tax treatment. Metadata priority is contractual.
for (const purpose of Object.values(domain.PAYMENT_PURPOSES)) {
  for (const component of Object.values(domain.PAYMENT_COMPONENTS)) {
    for (const organizationType of ['', 'church', 'monastery', 'diocese', 'school', 'business', 'unknown']) {
      const value = domain.classifyPayment({ purpose, component, organizationType });
      assert.ok(Object.isFrozen(value));
      assert.equal(value.purpose, purpose);
      assert.equal(value.component, component);
      assert.equal(value.charitableStatus, 'not_inferred');
      assert.equal(value.taxTreatment, 'not_inferred');
      const expected =
        purpose === 'unknown'
          ? 'unsupported'
          : purpose === 'tuition'
            ? 'reserved'
            : purpose === 'platform_subscription'
              ? 'active'
              : !organizationType
                ? 'context_required'
                : ['church', 'monastery', 'diocese'].includes(organizationType)
                  ? 'active'
                  : 'reserved';
      assert.equal(value.availability, expected);
      assert.equal(value.organizationEligible, expected === 'active');
    }
  }
}
assert.equal(
  domain.classifyPayment({ purpose: ' DONATION ', component: 'invalid', paymentClass: 'nonqualifying_tuition' })
    .paymentClass,
  'qualifying_donation'
);
assert.equal(domain.classifyPayment({ purpose: ' DONATION ', component: 'invalid' }).component, 'principal');
assert.equal(domain.classifyPayment().purpose, 'unknown');
for (const paymentClass of STRIPE_PAYMENT_CLASSES) {
  const value = domain.classifyPaymentMetadata({
    agapay_payment_class: paymentClass,
    commerce_module: 'bookstore',
    parish_id: 'p',
    gift_type: 'alms',
  });
  assert.equal(value.paymentClass, paymentClass);
  assert.equal(value.source, 'agapay_metadata');
}
for (const [alias, expected] of [
  ['donation', 'qualifying_donation'],
  ['non_donation_commerce', 'nonqualifying_commerce'],
  ['non_donation_membership', 'nonqualifying_membership'],
  ['non_donation_tuition', 'nonqualifying_tuition'],
  ['non_donation_ticket', 'nonqualifying_ticket'],
  ['non_donation_registration', 'nonqualifying_registration'],
  ['non_donation_auction', 'nonqualifying_auction'],
  ['non_donation_other', 'nonqualifying_other'],
]) {
  const value = domain.classifyPaymentMetadata({ agapay_payment_class: alias });
  assert.equal(value.paymentClass, expected);
  assert.equal(value.source, 'agapay_metadata_legacy_alias');
}
assert.equal(
  domain.classifyPaymentMetadata({
    agapay_classification_version: '1',
    agapay_payment_purpose: 'donation',
    agapay_payment_class: 'nonqualifying_commerce',
    commerce_module: 'bookstore',
  }).source,
  'agapay_purpose_metadata'
);
assert.equal(
  domain.classifyPaymentMetadata({
    agapay_classification_version: 2,
    agapay_payment_purpose: 'donation',
    commerce_module: 'bookstore',
  }).purpose,
  'commerce'
);
assert.equal(
  domain.classifyPaymentMetadata({ order_id: 'bookstore_1', gift_type: 'alms', parish_id: 'p' }).purpose,
  'commerce'
);
assert.equal(
  domain.classifyPaymentMetadata({ payment_purpose: 'tuition', gift_type: 'alms', parish_id: 'p' }).purpose,
  'tuition'
);
assert.equal(domain.classifyPaymentMetadata({ parish_id: 'p', amount_cents: '0' }).purpose, 'donation');
assert.equal(domain.classifyPaymentMetadata({ parish_id: 'p' }).purpose, 'unknown');
for (const purpose of ['donation', 'commerce', 'tuition', 'platform_subscription']) {
  const metadata = domain.paymentMetadataForPurpose(purpose);
  assert.ok(Object.isFrozen(metadata));
  assert.equal(domain.classifyPaymentMetadata(metadata).purpose, purpose);
}
assert.deepEqual(domain.paymentMetadataForPurpose('invalid'), {});
for (const [sources, purpose] of [
  [domain.DONATION_ACCOUNTING_SOURCE_TYPES, 'donation'],
  [domain.COMMERCE_ACCOUNTING_SOURCE_TYPES, 'commerce'],
  [domain.RESERVED_TUITION_ACCOUNTING_SOURCE_TYPES, 'tuition'],
]) {
  assert.ok(Object.isFrozen(sources));
  for (const source of sources) assert.equal(domain.classifyAccountingSourceType(source).purpose, purpose);
}
assert.equal(domain.classifyAccountingSourceType('donation_refunded').component, 'refund');
assert.equal(domain.classifyAccountingSourceType('stripe_fee_refunded').component, 'fee_refund');
assert.equal(domain.classifyAccountingSourceType('stripe_payout_reversed').component, 'payout');
assert.equal(domain.classifyAccountingSourceType('unknown').availability, 'unsupported');
const charge = {
  invoice: {
    subscription_details: { metadata: { agapay_payment_class: 'qualifying_donation' } },
    lines: { data: [{ metadata: { agapay_payment_class: 'nonqualifying_commerce' } }] },
  },
  payment_intent: { metadata: { agapay_payment_class: 'nonqualifying_tuition' } },
  metadata: { agapay_payment_class: 'nonqualifying_membership' },
};
const beforeCharge = structuredClone(charge);
assert.equal(classifyStripeCharge(charge).paymentClass, 'nonqualifying_membership');
assert.deepEqual(charge, beforeCharge);
assert.equal(classifyStripeCharge({ ...charge, metadata: null }).paymentClass, 'nonqualifying_tuition');
assert.equal(classifyStripeCharge({ invoice: charge.invoice }).paymentClass, 'nonqualifying_commerce');
assert.equal(
  classifyStripeCharge({ invoice: { subscription_details: charge.invoice.subscription_details } }).paymentClass,
  'qualifying_donation'
);
assert.equal(classifyStripeCharge({ invoice: 'in_1', payment_intent: 'pi_1' }).paymentClass, 'unclassified');
assert.equal(classifyStripeCharge({ invoice: { lines: { data: [null] } } }).paymentClass, 'unclassified');

// Catalog changes preserve unrelated metadata and object identity on no-ops.
assert.ok(Object.isFrozen(BENEVOLENCE_FUND_DEFAULT));
assert.ok(Object.isFrozen(STEWARDSHIP_FUND_DEFAULTS));
for (const fund of [{ id: ' BENEVOLENCE-FUND ' }, { reportCode: ' ALMS ' }, { name: 'Benevolence Fund' }]) {
  const registration = { funds: [fund], custom: { untouched: true } };
  const result = ensureBenevolenceFundInRegistration(registration);
  assert.equal(result.registration, registration);
  assert.equal(result.changed, false);
  assert.equal(result.added, false);
}
const empty = { funds: null, custom: { untouched: true } };
const ensured = ensureBenevolenceFundInRegistration(empty);
assert.equal(ensured.changed, true);
assert.equal(ensured.registration.custom, empty.custom);
assert.equal(empty.funds, null);
assert.equal(Object.hasOwn(ensured.registration.funds[0], 'reportCode'), false);
const original = {
  funds: [
    { id: 'stewardship', name: 'General Stewardship', custom: 'preserved' },
    { id: 'alms', name: 'Poor Box / Alms' },
    { id: 'campaign', name: 'Campaign / Appeal' },
    { id: 'restricted', name: 'Restricted Gift', restrictionType: 'donor_restricted_permanent', custom: 'keep' },
  ],
  feastCampaigns: [
    { id: 'nativity', destinationFundId: 'restricted', extra: 'keep' },
    { id: 'saint', patronal: true },
  ],
  patronalFeast: 'saint',
  patronalFeastName: 'Saint Example',
  patronalFeastDate: '2026-09-12',
  unrelated: { enabled: true },
};
const before = structuredClone(original);
const merged = mergeStewardshipFundsIntoRegistration(original);
assert.deepEqual(original, before);
assert.equal(merged.changed, true);
assert.deepEqual(
  merged.removed.map((f) => f.id),
  ['stewardship', 'alms', 'campaign']
);
const general = merged.registration.funds.find((f) => f.id === 'general');
assert.equal(general.custom, 'preserved');
assert.equal(general.accountingFundId, 'fund_general');
assert.equal(general.accountNumber, 'GENERAL');
assert.equal(general.restrictionType, 'unrestricted');
assert.equal(general.isDefault, true);
assert.equal(merged.registration.unrelated, original.unrelated);
assert.equal(
  merged.registration.funds.find((f) => f.id === 'restricted'),
  original.funds[3]
);
assert.equal(merged.registration.feastCampaigns[0].destinationFundId, 'restricted');
assert.equal(merged.registration.feastCampaigns[1].destinationFundId, 'benevolence-fund');
assert.equal(merged.registration.feastCampaigns[1].feastDate, '09-12');
const repeated = mergeStewardshipFundsIntoRegistration(merged.registration);
assert.equal(repeated.changed, false);
assert.equal(repeated.registration, merged.registration);
assert.deepEqual(repeated.added, []);
assert.deepEqual(repeated.removed, []);
const generated = mergeStewardshipFundsIntoRegistration({
  patronalFeast: 'saint',
  patronalFeastName: 'Saint Example',
  patronalFeastDate: '2026-09-12',
});
assert.equal(generated.registration.feastCampaigns.length, 1);
assert.equal(generated.registration.feastCampaigns[0].campaignName, 'Saint Example Patronal Feast Campaign');
assert.equal(generated.registration.feastCampaigns[0].destinationFundId, 'benevolence-fund');
// Fresh defaults receive their canonical Accounting mapping on the next pass.
const normalizedGenerated = mergeStewardshipFundsIntoRegistration(generated.registration);
assert.equal(normalizedGenerated.changed, true);
assert.equal(normalizedGenerated.registration.funds[0].accountingFundId, 'fund_general');
assert.equal(
  mergeStewardshipFundsIntoRegistration(normalizedGenerated.registration).registration,
  normalizedGenerated.registration
);
const competing = mergeStewardshipFundsIntoRegistration({
  funds: [
    { id: 'general', marker: 'canonical' },
    { id: 'stewardship', marker: 'legacy' },
  ],
});
assert.equal(competing.registration.funds.filter((f) => f.id === 'general').length, 1);
assert.equal(competing.registration.funds.find((f) => f.id === 'general').marker, 'canonical');
assert.equal(
  mergeStewardshipFundsIntoRegistration({ funds: [null], feastCampaigns: [null] }).registration.feastCampaigns[0]
    .destinationFundId,
  'benevolence-fund'
);
assert.equal(mergeStewardshipFundsIntoRegistration().registration.funds.length, 6);
console.log(
  'Giving foundations: fee boundaries, classification precedence, compatibility and fund catalog invariants passed.'
);
