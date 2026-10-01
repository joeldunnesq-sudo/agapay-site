import assert from 'node:assert/strict';
import { OutsideGiftError } from '../src/lib/outside-gift-error.js';
import * as reads from '../src/lib/outside-gift-reads.js';
import * as legacy from '../src/lib/outside-gifts.js';
import { createOutsideGiftsFixture } from './lib/outside-gifts-fixture.mjs';

assert.equal(legacy.OutsideGiftError, OutsideGiftError);
for (const [name, value] of Object.entries(reads)) assert.equal(legacy[name], value, name);
const error = new OutsideGiftError('Invalid');
assert.equal(error.status, 422);
assert.equal(error.code, 'outside_gift_invalid');
assert.equal(error.name, 'Error');
assert.ok(error instanceof Error);
const { outsideGiftRow, outsideGiver, outsideGiftDto, loadOutsideGiftRows, outsideGiftsForGiving } = reads;
const f = await createOutsideGiftsFixture();
const parishId = f.registration.parishId;
const binding = f.env.AGAPAY_DB;
try {
  assert.deepEqual(await outsideGiver(binding, parishId, null), {
    name: 'Anonymous / unassigned',
    email: '',
    referenceId: '',
  });
  assert.equal((await outsideGiver(binding, parishId, 'sample_0_0')).email, 'giver0@example.test');
  await assert.rejects(
    outsideGiver(binding, 'foreign', 'sample_0_0'),
    (e) => e instanceof OutsideGiftError && e.status === 422
  );
  const originalGiver = f.db.prepare('SELECT data FROM donor_offerings WHERE id=?').get('sample_0_0').data;
  f.db
    .prepare('UPDATE donor_offerings SET data=? WHERE id=?')
    .run(JSON.stringify({ ...JSON.parse(originalGiver), parishId: 'foreign' }), 'sample_0_0');
  await assert.rejects(outsideGiver(binding, parishId, 'sample_0_0'), /another parish/);
  f.db.prepare('UPDATE donor_offerings SET data=? WHERE id=?').run(originalGiver, 'sample_0_0');
  const create = async (entryDate, amountCents) => {
    const response = await f.outside('', {
      requestKey: crypto.randomUUID(),
      entryDate,
      amountCents,
      source: 'check',
      fundId: 'general',
      giverReferenceId: 'sample_0_0',
      reference: 'Read-contract test',
      confirmedNotDuplicate: true,
      givingKind: 'other',
    });
    assert.equal(response.status, 201);
    return (await response.json()).gift.id;
  };
  const id = await create('2026-01-03', 12345);
  const voidedId = await create('2026-01-04', 23456);
  f.db.prepare("UPDATE outside_gift_details SET record_state='void' WHERE gift_id=?").run(voidedId);
  const row = await outsideGiftRow(binding, parishId, id);
  assert.equal(row.amount_cents, 12345);
  assert.equal(await outsideGiftRow(binding, 'foreign', id), null);
  assert.equal(await outsideGiftRow(binding, "x' OR 1=1 --", id), null);
  assert.equal((await loadOutsideGiftRows(binding, parishId)).length, 1);
  assert.deepEqual(
    (await loadOutsideGiftRows(binding, parishId, { start: '2026-01-03', end: '2026-01-03' })).map((r) => r.id),
    [id]
  );
  assert.equal((await loadOutsideGiftRows(binding, parishId, { end: '2026-01-02' })).length, 0);
  assert.deepEqual(
    (await loadOutsideGiftRows(binding, parishId, { includeVoided: true })).map((r) => r.id),
    [voidedId, id]
  );
  await assert.rejects(
    loadOutsideGiftRows(binding, parishId, { includeVoided: true, limit: 1 }),
    (e) => e instanceof OutsideGiftError && e.status === 413
  );
  const before = structuredClone(row);
  const dto = await outsideGiftDto(binding, Object.freeze(row), f.registration);
  assert.equal(dto.amountCents, 12345);
  assert.equal(dto.giftAmountCents, 12345);
  assert.equal(dto.parishNetCents, null);
  assert.equal(dto.receivedDate, '2026-01-03');
  assert.equal(dto.createdAt, '2026-01-03T12:00:00');
  assert.equal(dto.source, 'outside');
  assert.equal(dto.sourceLabel, 'Check');
  assert.equal(dto.donorEmail, 'giver0@example.test');
  assert.equal(dto.giverKey, 'email:giver0@example.test');
  assert.equal(dto.accounting.linked, false);
  assert.equal(dto.accounting.entryId, '');
  assert.deepEqual({ ...row }, before);
  assert.equal(
    (await outsideGiftDto(binding, row, { funds: [{ id: 'general', name: 'Retired general', enabled: false }] })).fund,
    'Retired general'
  );
  const nullable = await outsideGiftDto(
    binding,
    {
      ...row,
      giver_data: null,
      giver_name: '',
      giver_email: '',
      giver_reference_id: null,
      fund_id: '',
      fund_code: null,
      source_label: null,
      notes: null,
      entered_by: null,
    },
    undefined
  );
  assert.equal(nullable.donorName, 'Anonymous / unassigned');
  assert.equal(nullable.giverKey, 'outside:unassigned');
  assert.equal(nullable.fund, null);
  assert.equal(nullable.sourceLabel, null);
  assert.equal(nullable.notes, '');
  assert.equal(nullable.enteredBy, null);
  await assert.rejects(outsideGiftDto(binding, { ...row, giver_data: '{invalid' }, f.registration), SyntaxError);
  await assert.rejects(outsideGiftDto(binding, { ...row, giver_data: 'null' }, f.registration), TypeError);
  assert.deepEqual(
    (await outsideGiftsForGiving(f.env, parishId, f.registration)).map((g) => g.id),
    [id]
  );
} finally {
  f.dispose();
}

assert.deepEqual(await outsideGiftsForGiving({}, 'a', undefined), []);
const broken = (failure) => ({
  AGAPAY_DB: {
    prepare() {
      throw failure;
    },
  },
});
for (const table of ['outside_gift_details', 'manual_income_entries'])
  assert.deepEqual(await outsideGiftsForGiving(broken(new Error('no such table: ' + table)), 'a', undefined), []);
const failure = new Error('no such table: donor_offerings');
await assert.rejects(outsideGiftsForGiving(broken(failure), 'a', undefined), (e) => e === failure);
await assert.rejects(outsideGiftsForGiving(broken(null), 'a', undefined), TypeError);
console.log(
  'PASS - outside-gift reader SQL isolation, bounds, limits, metadata, nullable values, error identity and fallback behavior'
);
