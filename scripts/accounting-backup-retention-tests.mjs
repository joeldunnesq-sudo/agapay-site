import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ACCOUNTING_BACKUP_RETENTION_DAYS,
  accountingBackupRetentionDays,
  strictBackupExpiryEnabled,
  sweepAccountingBackupRetention,
} from "../src/accounting/backup-retention.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function fakeBucket(seed, pageSize = 1000) {
  const objects = new Map(seed.map((object) => [object.key, { ...object, uploaded: new Date(object.uploaded) }]));
  const deleted = [];
  return {
    objects,
    deleted,
    async head(key) { return objects.get(key) || null; },
    async list({ cursor } = {}) {
      const ordered = [...objects.values()].sort((left, right) => left.key.localeCompare(right.key));
      const offset = cursor ? Number(cursor) : 0;
      const page = ordered.slice(offset, offset + pageSize);
      const nextOffset = offset + page.length;
      return { objects: page, truncated: nextOffset < ordered.length, cursor: nextOffset < ordered.length ? String(nextOffset) : undefined };
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        deleted.push(key);
        objects.delete(key);
      }
    },
  };
}

assert.equal(DEFAULT_ACCOUNTING_BACKUP_RETENTION_DAYS, 365);
assert.equal(accountingBackupRetentionDays({}), 365);
assert.equal(accountingBackupRetentionDays({ ACCOUNTING_BACKUP_RETENTION_DAYS: "730" }), 730);
assert.throws(() => accountingBackupRetentionDays({ ACCOUNTING_BACKUP_RETENTION_DAYS: "0" }), /RETENTION_DAYS_INVALID/);
assert.equal(strictBackupExpiryEnabled({ ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED: 'true' }), true);
for (const value of [undefined, 'false', 'TRUE', '1', true]) {
  const bucket = fakeBucket([{ key: 'last-recovery-copy.sql', uploaded: '2020-01-01T00:00:00Z' }]);
  const report = await sweepAccountingBackupRetention({ ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED: value, ACCOUNTING_BACKUPS: bucket,
    PARISH_CLOSURE_LEDGER: { async put() { assert.fail('disabled sweeps must not issue strict-expiry evidence'); } } });
  assert.equal(report.deleted, 0);
  assert.equal(report.newestBackupPreserved, true);
}
const strict = { ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED: 'true' };
const legacyPolicyBucket = fakeBucket([
  { key: 'old.sql', uploaded: '2020-01-01T00:00:00Z' },
  { key: 'newest.sql', uploaded: '2020-02-01T00:00:00Z' },
]);
const legacyPolicy = await sweepAccountingBackupRetention({ ACCOUNTING_BACKUPS:legacyPolicyBucket }, '2026-08-01T00:00:00Z');
assert.equal(legacyPolicy.deleted,1,'the gate must preserve existing age-based cleanup, not disable all retention');
assert.deepEqual([...legacyPolicyBucket.objects.keys()],['newest.sql']);

const mixedBucket = fakeBucket([
  { key: "manual/pre-migration-final.sql", uploaded: "2024-12-31T23:59:59Z" },
  { key: "canary/2026-07-21/agapay-accounting-canary.sql", uploaded: "2026-07-21T14:33:46.560Z" },
], 1);
const mixed = await sweepAccountingBackupRetention({ ACCOUNTING_BACKUPS: mixedBucket }, "2026-08-01T00:00:00Z");
assert.deepEqual(mixed, {
  objectsScanned: 2,
  deleted: 1,
  kept: 1,
  retentionDays: 365,
  cutoff: "2025-08-01T00:00:00.000Z",
  newestBackupPreserved: false,
});
assert.deepEqual(mixedBucket.deleted, ["manual/pre-migration-final.sql"], "an object older than the threshold must be deleted regardless of its name");
assert.deepEqual([...mixedBucket.objects.keys()], ["canary/2026-07-21/agapay-accounting-canary.sql"], "an object inside the threshold must remain");

const allExpiredBucket = fakeBucket([
  { key: "snapshot-with-no-date.sql", uploaded: "2023-02-01T00:00:00Z" },
  { key: "kv-keys-20230101.json", uploaded: "2023-03-01T00:00:00Z" },
  { key: "before-risky-change/custom-name.sql", uploaded: "2023-04-01T00:00:00Z" },
]);
const allExpired = await sweepAccountingBackupRetention({ ...strict, ACCOUNTING_BACKUPS: allExpiredBucket }, "2026-08-01T00:00:00Z");
assert.equal(allExpired.deleted, 3);
assert.equal(allExpired.kept, 0);
assert.equal(allExpired.newestBackupPreserved, false);
assert.deepEqual([...allExpiredBucket.objects.keys()], [], "expired backups cannot be retained indefinitely, even if all copies are expired");

const exactlyAtCutoffBucket = fakeBucket([
  { key: "cutoff-boundary.sql", uploaded: "2025-08-01T00:00:00Z" },
]);
const boundary = await sweepAccountingBackupRetention({ ACCOUNTING_BACKUPS: exactlyAtCutoffBucket }, "2026-08-01T00:00:00Z");
assert.equal(boundary.deleted, 0, "only objects strictly older than the threshold may be deleted");
assert.equal(boundary.kept, 1);

const missingBinding = await sweepAccountingBackupRetention({}, "2026-08-01T00:00:00Z");
assert.equal(missingBinding.skipped, "binding_missing");
assert.equal(missingBinding.deleted, 0);

const unconfirmed = fakeBucket([{key:'expired.sql',uploaded:'2020-01-01T00:00:00Z'}]);
unconfirmed.delete = async () => {};
await assert.rejects(sweepAccountingBackupRetention({...strict,ACCOUNTING_BACKUPS:unconfirmed},'2026-08-01T00:00:00Z'),/DELETE_UNCONFIRMED/,'provider acknowledgement without actual deletion is not success');
const stuck = {async list(){return{objects:[],truncated:true,cursor:'stuck'};},async head(){return null;},async delete(){}};
await assert.rejects(sweepAccountingBackupRetention({ACCOUNTING_BACKUPS:stuck}),/CURSOR_INVALID/);
let evidence;
await sweepAccountingBackupRetention({...strict,ACCOUNTING_BACKUPS:fakeBucket([]),PARISH_CLOSURE_LEDGER:{async put(key,value){assert.equal(key,'backup-expiry/latest.json');evidence=JSON.parse(value);}}},'2026-08-01T00:00:00Z');
assert.equal(evidence.strictExpiryEnabled,true);
assert.equal(evidence.newestBackupPreserved,false);
assert.equal(evidence.verifiedAt,Date.parse('2026-08-01T00:00:00Z'));

const workerSource = readFileSync(path.join(root, "src", "worker.js"), "utf8");
const observerSource = readFileSync(path.join(root, "src", "operations", "scheduled-task-observer.js"), "utf8");
assert.match(workerSource, /sweepAccountingBackupRetention\(env, event\.scheduledTime\)/);
assert.match(workerSource, /observeScheduledTask\("accounting_backup_retention_sweep", sweepAccountingBackupRetention/);
assert.match(observerSource, /console\.error\(`\$\{name\}_failed`/);
assert.match(observerSource, /throw error;/, "scheduled task errors must stay rejected after logging");
const wranglerSource = readFileSync(path.join(root, "wrangler.toml"), "utf8");
assert.match(wranglerSource, /ACCOUNTING_BACKUP_RETENTION_DAYS = "365"/);
assert.match(wranglerSource.split('[env.staging]')[0], /ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED = "false"/);
const runbook = readFileSync(path.join(root, "docs", "BACKUP_RESTORE_RUNBOOK.md"), "utf8");
assert.match(runbook, /R2's\s+upload timestamp, not the human-chosen filename/);
assert.match(runbook, /no newest-backup exception/);

console.log("PASS - strict backup expiry is separately gated; disabled sweeps preserve the newest recovery copy and cannot issue closure evidence");
