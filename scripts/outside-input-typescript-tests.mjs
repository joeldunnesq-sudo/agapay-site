import assert from 'node:assert/strict';
import {
  outsideGiftInput,
  outsideContent,
  outsideDigest,
  auditStatement,
  OutsideGiftError,
} from '../src/lib/outside-gifts.js';
import { validateOutsidePledge } from '../src/lib/outside-pledges.js';
const now = new Date('2026-01-02T01:00:00Z');
const registration = { timezone: 'UTC', funds: [{ id: 'general', name: 'General' }] };
const body = { entryDate: '2026-01-02', amountCents: 100, givingKind: 'other', source: 'cash', fundId: 'general' };
const input = outsideGiftInput(body, registration, now);
assert.equal(input.source, 'cash_and_checks');
assert.equal(input.sourceLabel, 'Cash');
assert.equal(input.pledgeYear, null);
for (const patch of [
  { entryDate: '2026-02-30' },
  { entryDate: '1899-12-31' },
  { entryDate: '2026-01-03' },
  { amountCents: '100' },
  { amountCents: 0 },
  { amountCents: -1 },
  { amountCents: 1.5 },
  { amountCents: NaN },
  { amountCents: Infinity },
  { amountCents: 1000000001 },
  { givingKind: '' },
  { givingKind: 'pledge', pledgeYear: 2026 },
  { givingKind: 'pledge', pledgeYear: 2200, giverReferenceId: 'giver' },
  { source: '__proto__' },
  { source: 'other_giving_platform', sourceLabel: ' ' },
  { fundId: 'missing' },
])
  assert.throws(() => outsideGiftInput({ ...body, ...patch }, registration, now), OutsideGiftError);
for (const amountCents of [1, 1000000000])
  assert.equal(outsideGiftInput({ ...body, amountCents }, registration, now).amountCents, amountCents);
assert.throws(() => outsideGiftInput(body, { ...registration, timezone: 'America/Chicago' }, now), OutsideGiftError);
assert.equal(outsideGiftInput(body, { ...registration, timezone: 'invalid/timezone' }, now).entryDate, body.entryDate);
for (const funds of [
  [{ id: 'general', enabled: false }],
  [{ id: 'general', active: false }],
  [{ id: 'general' }, { code: 'general' }],
  [],
]) {
  assert.throws(() => outsideGiftInput(body, { funds }, now), OutsideGiftError);
}
const pledge = outsideGiftInput(
  {
    ...body,
    givingKind: 'pledge',
    pledgeYear: '2026',
    giverReferenceId: ' giver ',
    source: 'other_giving_platform',
    sourceLabel: ' Platform ',
    notes: 'x'.repeat(501),
  },
  registration,
  now
);
assert.equal(pledge.pledgeYear, 2026);
assert.equal(pledge.sourceLabel, 'Platform');
assert.equal(pledge.notes.length, 500);
assert.equal(pledge.giverReferenceId, 'giver');
assert.equal(outsideContent(input), outsideContent({ ...input, notes: 'not part of duplicate identity' }));
assert.equal(await outsideDigest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
let calls = 0;
let bound;
let result = { target_amount_cents: '100' };
const db = {
  prepare(sql) {
    calls++;
    assert.match(sql, /parish_id=\?/);
    return {
      bind(...args) {
        bound = args;
        return this;
      },
      async first() {
        return result;
      },
    };
  },
};
await validateOutsidePledge(db, 'parish-a', input, {});
assert.equal(calls, 0);
await assert.rejects(validateOutsidePledge(db, 'parish-a', pledge, {}), OutsideGiftError);
assert.equal(calls, 0);
await validateOutsidePledge(db, 'parish-a', pledge, { email: ' GIVER@EXAMPLE.TEST ' });
assert.deepEqual(bound, ['parish-a', 'giver@example.test', 2026]);
for (const row of [null, { target_amount_cents: 0 }, { target_amount_cents: -1 }]) {
  result = row;
  await assert.rejects(
    validateOutsidePledge(db, 'parish-a', pledge, { email: 'giver@example.test' }),
    OutsideGiftError
  );
}
let auditArgs;
let auditSql;
const statement = {
  bind(...args) {
    auditArgs = args;
    return this;
  },
};
const auditDb = {
  prepare(sql) {
    auditSql = sql;
    return statement;
  },
};
const row = {
  id: 'gift',
  parish_id: 'parish-a',
  revision: 3,
  amount_cents: 100,
  giver_data: 'private',
  request_key: 'private',
  request_hash: 'private',
  content_hash: 'private',
};
assert.equal(auditStatement(auditDb, row, 'update', 'staff', 'correction', '2026-01-02'), statement);
assert.match(auditSql, /d.gift_id=\? AND d.parish_id=\? AND d.revision=\?/);
assert.deepEqual(JSON.parse(auditArgs[4]), { id: 'gift', parish_id: 'parish-a', revision: 3, amount_cents: 100 });
assert.deepEqual(auditArgs.slice(6), ['gift', 'parish-a', 3]);
assert.equal(row.giver_data, 'private');
console.log('PASS - outside input dates, exact amounts, funds, pledge scope, hashing and audit filtering');
