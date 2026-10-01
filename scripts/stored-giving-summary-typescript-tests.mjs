import assert from 'node:assert/strict';
import { summarizeStoredParishGifts as summarize } from '../src/lib/stored-giving-summary.js';
import { summarizeStoredParishGifts as legacy } from '../src/handlers/parish-giving-reports.js';
assert.equal(summarize, legacy);
const year = new Date().getUTCFullYear();
const date = (month, day = '03') => `${year}-${month}-${day}T12:00:00Z`;
const gifts = Object.freeze(
  [
    {
      createdAt: date('01'),
      amountCents: '1000.4',
      parishNetCents: 900,
      giftAmountCents: 1000,
      totalFeeCents: 100,
      coverFees: true,
      donorCoveredFeeCents: 110,
      donorEmail: 'A@example.test',
    },
    { date: date('02'), amountCents: 2000, totalFeeCents: '50.6', donorEmail: 'a@EXAMPLE.test' },
    {
      createdAt: date('02', '04'),
      amountCents: 300,
      parishNetCents: 0,
      giftAmountCents: 300,
      coverFees: 'yes',
      donorCoveredFeeCents: '20.6',
      donorName: 'Other',
    },
    { createdAt: date('03'), amountCents: 0, donorEmail: 'ignored@example.test', totalFeeCents: 999 },
    { createdAt: `${year - 1}-12-31`, amountCents: 9999 },
    { createdAt: 'bad', date: date('01'), amountCents: 9999 },
  ].map(Object.freeze)
);
const before = structuredClone(gifts);
const result = summarize(gifts);
assert.equal(result.year, year);
assert.equal(result.currency, 'usd');
assert.equal(result.ytdCents, 2900);
assert.equal(result.grossGiftCents, 3300);
assert.equal(result.feesAbsorbedCents, 151);
assert.equal(result.donorCoveredFeeCents, 131);
assert.equal(result.feeCoveragePercent, 67);
assert.equal(result.giftCount, 3);
assert.equal(result.giverCount, 2);
assert.equal(result.averageGiftCents, 967);
assert.equal(result.lastGiftAt, date('02', '04').replace('Z', '.000Z'));
assert.equal(result.monthly.length, 12);
assert.deepEqual(result.monthly[0], { month: 1, label: 'Jan', amountCents: 900, giftCount: 1 });
assert.equal(
  result.monthly.reduce((sum, m) => sum + m.amountCents, 0),
  result.ytdCents
);
assert.equal(
  result.monthly.reduce((sum, m) => sum + m.giftCount, 0),
  result.giftCount
);
assert.deepEqual(gifts, before);
const empty = summarize();
assert.equal(empty.year, year);
assert.equal(empty.giftCount, 0);
assert.equal(empty.averageGiftCents, 0);
assert.equal(empty.lastGiftAt, '');
assert.equal(summarize([{ createdAt: 'invalid', amountCents: 10 }]).year, year);
assert.equal(summarize([{ amountCents: 10, id: 'legacy' }]).year, 1970);
const past = summarize([
  { createdAt: `${year - 2}-06-01`, amountCents: 200 },
  { createdAt: `${year - 1}-06-01`, amountCents: 300 },
]);
assert.equal(past.year, year - 1);
assert.equal(past.ytdCents, 300);
const preference = summarize([
  { date: date('01'), amountCents: 0 },
  { date: `${year + 1}-01-01`, amountCents: 400 },
]);
assert.equal(preference.year, year);
assert.equal(preference.giftCount, 0);
const boundary = summarize([
  { createdAt: `${year}-01-01T00:30:00+01:00`, amountCents: 10 },
  { createdAt: date('01'), amountCents: 20 },
]);
assert.equal(boundary.ytdCents, 20);
assert.equal(summarize([{ date: date('01'), amountCents: -10, id: 5 }]).ytdCents, -10);
assert.equal(summarize([{ date: date('01'), amountCents: Infinity }]).giftCount, 0);
console.log(
  'PASS - stored giving summary preserves year selection, UTC boundaries, fee coercion, identities and monthly conservation'
);
