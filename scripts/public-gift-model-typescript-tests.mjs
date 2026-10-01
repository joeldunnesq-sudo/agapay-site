import assert from 'node:assert/strict';
import { giftDisplayName, publicParishGiftFromOffering as project } from '../src/lib/public-gift-model.js';
import * as legacy from '../src/handlers/parish-giving-read-models.js';
import { summarizeStoredParishGifts } from '../src/lib/stored-giving-summary.js';
assert.equal(legacy.giftDisplayName, giftDisplayName);
assert.equal(legacy.publicParishGiftFromOffering, project);
assert.equal(giftDisplayName({ firstName: ' Anna ', lastName: 'Martin', donorName: 'fallback' }), 'Anna  Martin');
assert.equal(giftDisplayName({ firstName: ' ', donorName: 17 }), 17);
assert.equal(giftDisplayName(), '');
const living = Object.freeze([' Name ', 42, null]);
const input = Object.freeze({
  id: 'id',
  checkoutSessionId: 'checkout',
  paymentIntentId: 'payment',
  createdAt: '2026-01-03',
  paidAt: '2026-01-02',
  updatedAt: '2026-01-01',
  firstName: 'Anna',
  lastName: 'Martin',
  email: 'primary@example.test',
  donorEmail: 'other@example.test',
  amountCents: 1000,
  stripeFeeCents: 30,
  agapayFeeCents: 10,
  coverFees: true,
  chargeCents: 1050,
  giftType: 'GENERAL',
  fund: 'ignored',
  frequency: 'monthly',
  campaign: 'Campaign',
  campaignId: 'campaign-id',
  living,
  namesLiving: 'ignored',
  namesDeparted: ' One \n\n Two ',
  commemorationKind: 'memory',
});
const before = structuredClone(input);
const result = project(input);
assert.equal(result.id, 'id');
assert.equal(result.createdAt, '2026-01-03');
assert.equal(result.date, result.createdAt);
assert.equal(result.amountCents, 1010);
assert.equal(result.giftAmountCents, 1000);
assert.equal(result.totalFeeCents, 40);
assert.equal(result.estimatedStripeFeeCents, 30);
assert.equal(result.donorCoveredFeeCents, 50);
assert.equal(result.donorEmail, 'primary@example.test');
assert.equal(result.donorName, 'Anna Martin');
assert.equal(result.fund, 'General Operating Fund');
assert.equal(result.fundId, 'general');
assert.equal(result.type, 'recurring');
assert.equal(result.recurring, true);
assert.deepEqual(result.commemorationNames, [' Name ', 42, null, 'One', 'Two']);
assert.notEqual(result.commemorationNames, living);
assert.deepEqual(input, before);
assert.equal(summarizeStoredParishGifts([result]).ytdCents, 1010);
const fallback = project({
  checkoutSessionId: 'checkout',
  paidAt: '2026-01-02',
  donorEmail: 'fallback',
  fundId: 'fund',
  campaignId: 'campaign',
  campaignDescription: 'description',
  living: [],
  departed: [],
  namesLiving: 'ignored',
  frequency: 'once',
});
assert.equal(fallback.id, 'checkout');
assert.equal(fallback.date, '2026-01-02');
assert.equal(fallback.fund, 'fund');
assert.equal(fallback.campaign, 'campaign');
assert.equal(fallback.description, 'description');
assert.equal(fallback.type, 'one_time');
assert.deepEqual(fallback.commemorationNames, []);
assert.equal(project({ paymentIntentId: 'payment', updatedAt: '2026-01-01' }).id, 'payment');
assert.equal(project({ frequency: '' }).recurring, false);
assert.equal(project({ frequency: 'ONCE' }).recurring, true);
const display = { legacy: true };
assert.equal(project({ fund: display }).fund, display);
assert.equal(project({ donorName: display }).donorName, display);
assert.equal(project({ parishNetCents: 0, amountCents: 100 }).amountCents, 0);
assert.equal(project().type, 'one_time');
console.log(
  'PASS - public gift projection preserves fee, identity, timestamps, legacy display values and commemoration semantics'
);
