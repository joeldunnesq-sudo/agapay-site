import assert from 'node:assert/strict';
import * as csv from '../src/lib/monthly-giving-csv.js';
import * as legacy from '../src/lib/monthly-giving-export.js';
for (const [name, fn] of Object.entries(csv)) assert.equal(legacy[name], fn, name);
const { csvCell, givingExportOptions, givingExportRows, monthlyGivingCsv } = csv;
for (const input of ['=1+1', '+SUM(A1)', '-1', '@formula', '  =formula', '\uFEFF=1', '\ttext', '\rtext', '\ntext'])
  assert.equal(csvCell(input), '"\'' + input + '"');
assert.equal(csvCell('a,"b"'), '"a,""b"""');
assert.equal(csvCell(null), '""');
assert.equal(csvCell(undefined), '""');
assert.equal(csvCell(10), '"10"');
const options = givingExportOptions(new URLSearchParams('month=2026-07&groupBy=giver'), {
  timezone: 'America/Chicago',
});
assert.deepEqual(options, {
  month: '2026-07',
  groupBy: 'giver',
  timezone: 'America/Chicago',
  start: '2026-06-30T00:00:00.000Z',
  end: '2026-08-02T00:00:00.000Z',
});
assert.equal(
  givingExportOptions(new URLSearchParams('month=2024-02'), { timezone: 'invalid' }).end,
  '2024-03-02T00:00:00.000Z'
);
assert.equal(givingExportOptions(new URLSearchParams('month=2026-12')).end, '2027-01-02T00:00:00.000Z');
assert.equal(givingExportOptions(new URLSearchParams('month=1900-01')).groupBy, 'date');
for (const query of ['', 'month=2026-13', 'month=2200-01', 'month=2026-1', 'month=2026-07&groupBy=fund'])
  assert.throws(() => givingExportOptions(new URLSearchParams(query)));
const record = (id, timestamp, gift = {}) => ({
  id,
  created_at: timestamp,
  payment_status: 'paid',
  data: JSON.stringify({
    amountCents: 12345,
    stripeFeeCents: 100,
    firstName: '=Unsafe',
    lastName: 'Name',
    email: ' ZETA@example.org ',
    ...gift,
  }),
});
const records = [
  record('z', '2026-08-01T02:00:00Z', { donorEmail: 'ignored@example.org' }),
  record('before', '2026-07-01T04:00:00Z'),
  record('a', '2026-07-01T05:00:00Z', {
    firstName: '',
    lastName: '',
    email: '',
    donorName: 'Alpha',
    donorEmail: 'alpha@example.org',
  }),
  record('after', '2026-08-01T05:00:00Z'),
  record('b', '2026-07-15T00:00:00Z'),
  record('c', '2026-07-15T00:00:00Z'),
];
const before = structuredClone(records);
const rows = givingExportRows(records, options);
assert.deepEqual(
  rows.map((r) => r.id),
  ['a', 'b', 'c', 'z']
);
assert.equal(rows[0].name, 'Alpha');
assert.equal(rows[0].givingDate, '2026-07-01');
assert.equal(rows[3].givingDate, '2026-07-31');
assert.equal(rows[1].giverKey, 'zeta@example.org');
assert.equal(rows[1].fees.totalFeeCents, 100);
assert.deepEqual(records, before);
const override = givingExportRows(
  [
    record('x', 'bad fallback', {
      paidAt: '2026-07-15T00:00:00Z',
      createdAt: 'bad fallback',
      paymentStatus: 'refunded',
    }),
  ],
  options
)[0];
assert.equal(override.status, 'refunded');
assert.equal(override.timestamp, '2026-07-15T00:00:00.000Z');
assert.throws(() => givingExportRows([{ id: 'a', data: '{bad', created_at: '' }], options), SyntaxError);
for (const value of [null, 1, 'text'])
  assert.throws(
    () => givingExportRows([{ id: 'a', data: JSON.stringify(value), created_at: '' }], options),
    /Invalid giving record/
  );
assert.throws(() => givingExportRows([record('bad', 'invalid')], options), /Invalid giving date/);
assert.throws(() => givingExportRows([record('bad', '2026-07-15', { email: 123 })], options), TypeError);
const outside = {
  ...rows[0],
  id: 'outside',
  timestamp: '',
  offering: {
    source: 'outside',
    sourceLabel: 'Cash',
    givingKind: 'pledge',
    pledgeYear: 2026,
    reference: '=danger',
    enteredBy: 'Staff',
  },
  fees: {
    giftAmountCents: 500,
    chargeCents: null,
    stripeFeeCents: null,
    agapayFeeCents: null,
    totalFeeCents: null,
    parishNetCents: null,
    donorCoveredFeeCents: null,
  },
};
const output = monthlyGivingCsv([rows[1], outside], options);
assert.ok(output.startsWith('\uFEFF"Giving date"'));
assert.ok(output.endsWith('\r\n'));
const lines = output.slice(1).trimEnd().split('\r\n');
const cells = (line) => [...line.matchAll(/"((?:""|[^"])*)"(?=,|$)/g)].map((m) => m[1].replaceAll('""', '"'));
const headers = cells(lines[0]);
const online = Object.fromEntries(headers.map((header, i) => [header, cells(lines[1])[i]]));
const offline = Object.fromEntries(headers.map((header, i) => [header, cells(lines[2])[i]]));
assert.equal(headers.length, 31);
assert.equal(cells(lines[1]).length, headers.length);
assert.equal(cells(lines[2]).length, headers.length);
assert.equal(online.Giver, "'=Unsafe Name");
assert.equal(online['Gift amount'], '123.45');
assert.equal(online['Stripe fee'], '1.00');
assert.equal(online['Net before refunds'], '122.45');
assert.equal(online.Source, 'AGAPAY online');
assert.equal(offline['Gift amount'], '5.00');
for (const header of [
  'Amount charged',
  'Stripe fee',
  'AGAPAY fee',
  'Total fees',
  'Net before refunds',
  'Fees covered by donor',
  'Refunds to date',
])
  assert.equal(offline[header], '', header);
assert.equal(offline['Fee basis'], 'Outside contribution; fees and bank net not verified');
assert.equal(offline['Outside reference'], "'=danger");
assert.equal(offline['Giving purpose'], 'Pledge payment');
assert.equal(offline['Pledge year'], '2026');
assert.equal(monthlyGivingCsv([], options).split('\r\n').length, 2);
console.log(
  'PASS - CSV formula safety, timezone filtering, deterministic ordering, malformed data, and outside-gift fee blanks'
);
