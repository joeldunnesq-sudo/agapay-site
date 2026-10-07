import {
  refreshStripeVolume,
  summarizeStoredStripeVolume,
  stripeChargeVolumeRecord,
  summarizeStripeVolumeRows,
  type StripeVolumeEnv,
} from '../../src/lib/stripe-volume.js';
import {
  stripeGetConnectedRequest,
  stripeFormRequest,
  summarizeCharges,
  stripeObjectId,
  type StripeApiResponse,
  type StripeCharge,
} from '../../src/lib/stripe-connect.js';
const env: StripeVolumeEnv = {};
const request: Promise<StripeApiResponse> = stripeGetConnectedRequest(env, '/v1/charges', 'acct_a');
const charge: StripeCharge = {
  id: 'ch_a',
  amount: '10000',
  amount_refunded: null,
  metadata: { amount_cents: '10000' },
  balance_transaction: { fee: '320', net: '9680' },
};
const net: number = stripeChargeVolumeRecord('p', 'acct_a', charge).netCents;
const total: number = summarizeCharges([charge]).ytdCents;
const id: string = stripeObjectId({ id: 'pi_a' });
refreshStripeVolume(env, 'p', 'acct_a', { maxPages: 2 });
summarizeStoredStripeVolume(env, 'p');
summarizeStripeVolumeRows([{ payment_class: 'qualifying_donation', net_cents: '100' }], { status: 'complete' });
void [request, net, total, id];
// @ts-expect-error Connected account ID must be a string.
stripeGetConnectedRequest(env, '/v1/charges', 42);
// @ts-expect-error Stripe form bodies must be supported fetch bodies.
stripeFormRequest(env, '/v1/charges', {});
// @ts-expect-error Bounded page count is numeric.
refreshStripeVolume(env, 'p', 'acct_a', { maxPages: '5' });
// @ts-expect-error D1 binding must implement the database API.
const bad: StripeVolumeEnv = { AGAPAY_DB: 'database' };
void bad;
// @ts-expect-error Financial summary consumes a charge collection.
summarizeCharges(charge);
// @ts-expect-error Class identity is required for aggregate rows.
summarizeStripeVolumeRows([{ net_cents: 100 }]);
// @ts-expect-error Expanded balance transactions must be objects or IDs.
const invalid: StripeCharge = { balance_transaction: 42 };
void invalid;
