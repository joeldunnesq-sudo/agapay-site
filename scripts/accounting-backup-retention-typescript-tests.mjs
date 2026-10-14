import assert from 'node:assert/strict';
import {
  accountingBackupRetentionDays,
  strictBackupExpiryEnabled,
  sweepAccountingBackupRetention,
} from '../src/accounting/backup-retention.js';
const asOf = '2030-01-02T00:00:00Z';
const old = '2020-01-01T00:00:00Z';
for (const value of ['', ' ', null, undefined])
  assert.equal(accountingBackupRetentionDays({ ACCOUNTING_BACKUP_RETENTION_DAYS: value }), 365);
for (const value of [1, '1', 36500, '36500'])
  assert.equal(accountingBackupRetentionDays({ ACCOUNTING_BACKUP_RETENTION_DAYS: value }), Number(value));
for (const value of [0, -1, 1.5, 36501, 'invalid', Infinity])
  assert.throws(
    () => accountingBackupRetentionDays({ ACCOUNTING_BACKUP_RETENTION_DAYS: value }),
    /RETENTION_DAYS_INVALID/
  );
assert.equal(strictBackupExpiryEnabled({ ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED: 'true' }), true);
for (const value of [true, 'TRUE', ' true ', 1])
  assert.equal(strictBackupExpiryEnabled({ ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED: value }), false);
function bucketFor(objects, pageSize = 700) {
  const remaining = new Map(objects.map((object) => [object.key, object]));
  const batches = [],
    calls = [];
  return {
    remaining,
    batches,
    calls,
    async list({ cursor } = {}) {
      calls.push('list');
      const offset = Number(cursor || 0),
        next = offset + pageSize;
      return {
        objects: objects.slice(offset, next),
        truncated: next < objects.length,
        cursor: next < objects.length ? String(next) : undefined,
      };
    },
    async delete(keys) {
      calls.push('delete');
      batches.push([...keys]);
      for (const key of keys) remaining.delete(key);
    },
    async head(key) {
      calls.push('head');
      return remaining.get(key) || null;
    },
  };
}
const strict = { ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED: 'true', ACCOUNTING_BACKUP_RETENTION_DAYS: 1 };
const objects = Array.from({ length: 2001 }, (_, i) => ({
  key: `backup-${String(i).padStart(4, '0')}`,
  uploaded: old,
}));
const bucket = bucketFor(objects);
let evidence;
const report = await sweepAccountingBackupRetention(
  {
    ...strict,
    ACCOUNTING_BACKUPS: bucket,
    PARISH_CLOSURE_LEDGER: {
      async put(key, value, options) {
        evidence = { key, value: JSON.parse(value), options };
      },
    },
  },
  asOf
);
assert.equal(report.deleted, 2001);
assert.equal(report.kept, 0);
assert.deepEqual(
  bucket.batches.map((batch) => batch.length),
  [1000, 1000, 1]
);
assert.deepEqual(bucket.calls.slice(0, 3), ['list', 'list', 'list']);
assert.equal(bucket.calls.filter((call) => call === 'head').length, 2001);
assert.equal(evidence.key, 'backup-expiry/latest.json');
assert.equal(evidence.value.oldestRetainedAt, null);
assert.equal(evidence.value.verifiedAt, Date.parse(asOf));
assert.deepEqual(evidence.options, {
  httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
});
const ties = bucketFor([
  { key: 'b', uploaded: old },
  { key: 'a', uploaded: old },
]);
const preserved = await sweepAccountingBackupRetention({ ACCOUNTING_BACKUPS: ties }, asOf);
assert.equal(preserved.newestBackupPreserved, true);
assert.deepEqual([...ties.remaining.keys()], ['a']);
const boundary = bucketFor([
  { key: 'older', uploaded: '2029-12-31T23:59:59.999Z' },
  { key: 'cutoff', uploaded: new Date('2030-01-01T00:00:00Z') },
  { key: 'newer', uploaded: Date.parse(asOf) },
]);
const boundaryReport = await sweepAccountingBackupRetention({ ...strict, ACCOUNTING_BACKUPS: boundary }, asOf);
assert.equal(boundaryReport.deleted, 1);
assert.deepEqual([...boundary.remaining.keys()], ['cutoff', 'newer']);
for (const ACCOUNTING_BACKUPS of [
  null,
  {},
  {
    async list() {
      assert.fail('partial bindings must skip');
    },
  },
])
  assert.equal((await sweepAccountingBackupRetention({ ACCOUNTING_BACKUPS }, asOf)).skipped, 'binding_missing');
await assert.rejects(() => sweepAccountingBackupRetention({}, 'invalid'), /AS_OF_INVALID/);
for (const [page, message] of [
  [{ objects: null }, /LIST_INVALID/],
  [{ objects: [], truncated: true }, /CURSOR_INVALID/],
  [{ objects: Array.from({ length: 10001 }, (_, i) => ({ key: String(i), uploaded: old })) }, /INVENTORY_TOO_LARGE/],
]) {
  await assert.rejects(
    () =>
      sweepAccountingBackupRetention(
        {
          ...strict,
          ACCOUNTING_BACKUPS: {
            async list() {
              return page;
            },
            async delete() {
              assert.fail('invalid inventory cannot delete');
            },
            async head() {
              return null;
            },
          },
        },
        asOf
      ),
    message
  );
}
const invalid = bucketFor([{ key: 'bad', uploaded: 'invalid' }]);
await assert.rejects(
  () => sweepAccountingBackupRetention({ ...strict, ACCOUNTING_BACKUPS: invalid }, asOf),
  /UPLOADED_AT_INVALID/
);
assert.equal(invalid.batches.length, 0);
const unconfirmed = bucketFor(objects);
unconfirmed.head = async () => ({ key: 'still-present' });
await assert.rejects(
  () => sweepAccountingBackupRetention({ ...strict, ACCOUNTING_BACKUPS: unconfirmed }, asOf),
  /DELETE_UNCONFIRMED/
);
assert.equal(unconfirmed.batches.length, 1);
const providerFailure = new Error('synthetic provider failure');
const failed = bucketFor(objects);
failed.delete = async () => {
  throw providerFailure;
};
await assert.rejects(
  () => sweepAccountingBackupRetention({ ...strict, ACCOUNTING_BACKUPS: failed }, asOf),
  (error) => error === providerFailure
);
console.log('PASS - Backup inventory, retention boundaries, batching, verification and failure propagation');
