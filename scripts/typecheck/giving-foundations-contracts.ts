import {
  checkoutFinancials,
  publicPaymentFeeSchedules,
  paymentFeeSchedule,
  type PaymentMethod,
} from '../../src/lib/payment-fees.js';
import { donorName, centsFromAmount, checkoutPaymentMethod } from '../../src/lib/stripe-fees.js';
import { classifyStripeCharge } from '../../src/lib/payment-classification.js';
import {
  classifyPayment,
  classifyPaymentMetadata,
  classifyAccountingSourceType,
  type PaymentPurpose,
  type PaymentComponent,
  type StripePaymentClass,
} from '../../src/payments/classification.js';
import {
  mergeStewardshipFundsIntoRegistration,
  ensureBenevolenceFundInRegistration,
  type StewardshipRegistration,
} from '../../src/lib/stewardship-funds.js';

const total: number = checkoutFinancials('10000', true, false, 'bank').chargeCents;
const method: PaymentMethod = checkoutPaymentMethod('bank', false);
const cents: number | null = centsFromAmount('10.50');
const display: string = donorName({ firstName: 'Ada' });
const cap: number | null = publicPaymentFeeSchedules().ach.maxFeeCents;
const purpose: PaymentPurpose = classifyPayment({ purpose: 'donation' }).purpose;
const component: PaymentComponent = classifyAccountingSourceType('donation_refunded').component;
const paymentClass: StripePaymentClass = classifyStripeCharge({ invoice: 'in_1', payment_intent: 'pi_1' }).paymentClass;
classifyPaymentMetadata({ agapay_payment_purpose: null, agapay_classification_version: '1' });
classifyStripeCharge({ invoice: { lines: { data: [null, { metadata: { gift_type: 'alms' } }] } } });
const saved: StewardshipRegistration = mergeStewardshipFundsIntoRegistration({
  funds: [{ id: 'general', custom: 4 }, null],
  feastCampaigns: [null],
  customRegistrationField: true,
}).registration;
const changed: boolean = ensureBenevolenceFundInRegistration(saved).changed;
void [total, method, cents, display, cap, purpose, component, paymentClass, changed];
// @ts-expect-error Fee coverage is a decision, not a string containing a boolean.
checkoutFinancials(10000, 'false', false);
// @ts-expect-error Recurrence must be an explicit boolean.
checkoutPaymentMethod('ach', 'false');
// @ts-expect-error Schedule returns a frozen object.
paymentFeeSchedule().rateBasisPoints = 123;
// @ts-expect-error Only normalized card/ACH methods are returned.
const invalidMethod: PaymentMethod = 'bank';
void invalidMethod;
// @ts-expect-error Donor names require an object.
donorName('Ada');
// @ts-expect-error Metadata must be a record.
classifyPaymentMetadata('donation');
// @ts-expect-error Expanded invoice lines have an array of records.
classifyStripeCharge({ invoice: { lines: { data: {} } } });
// @ts-expect-error Stripe identifiers must be strings or expanded objects.
classifyStripeCharge({ payment_intent: 10 });
// @ts-expect-error A saved catalog is a collection, not an identifier.
mergeStewardshipFundsIntoRegistration({ funds: 'general' });
// @ts-expect-error Saved campaign collection must be an array.
ensureBenevolenceFundInRegistration({ feastCampaigns: {} });
// @ts-expect-error Classification results are frozen.
classifyPayment().purpose = 'donation';

const addedFundName: string | undefined = mergeStewardshipFundsIntoRegistration().added[0]?.name;
void addedFundName;
