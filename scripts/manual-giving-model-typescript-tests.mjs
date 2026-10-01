import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { manualAccountingGifts } from '../src/lib/manual-giving-model.js';
import { subtractLinkedOutsideGifts } from '../src/lib/outside-gift-composition.js';
import { summarizeStoredParishGifts } from '../src/lib/stored-giving-summary.js';
const row = (overrides = {}) => ({
  entry_id: 'e',
  line_id: 'l',
  gift_date: '2026-01-03',
  entry_description: 'Sunday',
  source_type: 'manual',
  credit_amount: '1500',
  account_name: 'GIVING',
  fund_code: 'GEN',
  fund_name: 'General',
  ...overrides,
});
const rows = Object.freeze(
  [
    row(),
    row({ line_id: 'other', entry_description: 'Gifted equipment', account_name: 'Rent' }),
    row({
      line_id: 'register',
      source_type: 'manual_register_contribution',
      entry_description: null,
      account_name: null,
      fund_code: null,
      fund_name: null,
      credit_amount: null,
    }),
    row({ line_id: 'description', entry_description: 'Candle collection', account_name: 'Income', credit_amount: 250 }),
  ].map(Object.freeze)
);
const before = structuredClone(rows);
const gifts = manualAccountingGifts(rows);
assert.deepEqual(
  gifts.map((g) => g.id),
  ['accounting:e:l', 'accounting:e:register', 'accounting:e:description']
);
assert.deepEqual(gifts[0], {
  id: 'accounting:e:l',
  source: 'manual_accounting',
  giftType: 'manual_accounting',
  amountCents: 1500,
  parishNetCents: 1500,
  giftAmountCents: 1500,
  createdAt: '2026-01-03',
  date: '2026-01-03',
  description: 'Sunday · GIVING',
  label: 'GIVING',
  fund: 'General',
  fundId: 'GEN',
  donorName: '',
  donorEmail: '',
  recurring: false,
  type: 'one_time',
});
assert.equal(gifts[1].description, '');
assert.equal(gifts[1].amountCents, 0);
assert.equal(gifts[1].fund, '');
assert.deepEqual(rows, before);
for (const term of [
  'alms',
  'alm',
  'candle',
  'candles',
  'collection',
  'contribution',
  'donation',
  'gift',
  'giving',
  'offering',
  'stewardship',
  'tithe',
  'tithes',
  'vigil',
])
  assert.equal(manualAccountingGifts([row({ account_name: term.toUpperCase() })]).length, 1, term);
assert.equal(manualAccountingGifts([row({ account_name: 'gifted', entry_description: 'ungiving' })]).length, 0);
assert.equal(manualAccountingGifts([row({ credit_amount: false })])[0].amountCents, 0);
assert.ok(Number.isNaN(manualAccountingGifts([row({ credit_amount: 'invalid' })])[0].amountCents));
assert.equal(manualAccountingGifts([row({ credit_amount: -10 })])[0].amountCents, -10);
const remaining = subtractLinkedOutsideGifts(gifts, [
  { amountCents: 500, accounting: { linked: true, entryId: 'e', lineId: 'l' } },
]);
assert.equal(summarizeStoredParishGifts(remaining).ytdCents, 1250);
// Actual SQLite result objects pass directly through the typed projection.
const db = new DatabaseSync(':memory:');
try {
  db.exec(
    'CREATE TABLE giving_rows(entry_id TEXT,line_id TEXT,gift_date TEXT,entry_description TEXT,source_type TEXT,credit_amount INTEGER,account_name TEXT,fund_code TEXT,fund_name TEXT)'
  );
  const insert = db.prepare('INSERT INTO giving_rows VALUES(?,?,?,?,?,?,?,?,?)');
  for (const r of rows) insert.run(...Object.values(r));
  const stored = db.prepare('SELECT * FROM giving_rows ORDER BY rowid').all();
  assert.deepEqual(manualAccountingGifts(stored), gifts);
} finally {
  db.close();
}
console.log(
  'PASS - manual Accounting giving projection, SQLite rows, whole-word selection, null metadata and reconciliation composition'
);
